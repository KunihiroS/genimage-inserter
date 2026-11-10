/**
 * Tests for Codex OAuth image-generation fallback client
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { RequestUrlParam, RequestUrlResponse } from 'obsidian';
import { requestUrl } from 'obsidian';
import * as fs from 'fs';
import { deflateSync } from 'zlib';
import { CodexOAuthImageClient } from './codex-oauth';
import { loadEnvFile } from '../utils/env-loader';
import { EnvConfig } from '../types';
import { Logger } from '../utils/logger';
import { ImageGenerationError } from './generation-error';

vi.mock('fs');

interface MockLogger {
	info: ReturnType<typeof vi.fn>;
	warn: ReturnType<typeof vi.fn>;
	error: ReturnType<typeof vi.fn>;
	debug: ReturnType<typeof vi.fn>;
	sanitize: ReturnType<typeof vi.fn>;
}

function createMockLogger(): MockLogger {
	return {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
		sanitize: vi.fn((text: string) => text),
	};
}

function baseConfig(overrides: Partial<EnvConfig> = {}): EnvConfig {
	return {
		llmProvider: 'gemini',
		geminiApiKey: 'gk',
		geminiModel: 'gm',
		codexAccessToken: 'codex-token',
		codexAccountId: 'acct-123',
		codexAuthFilePath: '/missing/codex/auth.json',
		codexFallbackEnabled: true,
		...overrides,
	};
}

function pngChunk(type: string, data: Buffer): Buffer {
	const chunk = Buffer.alloc(data.length + 12);
	chunk.writeUInt32BE(data.length, 0);
	chunk.write(type, 4, 'ascii');
	data.copy(chunk, 8);
	let crc = 0xffffffff;
	for (const byte of chunk.subarray(4, chunk.length - 4)) {
		crc ^= byte;
		for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
	}
	chunk.writeUInt32BE((crc ^ 0xffffffff) >>> 0, chunk.length - 4);
	return chunk;
}

function pngBase64WithDimensions(width: number, height: number): string {
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(width, 0);
	ihdr.writeUInt32BE(height, 4);
	ihdr[8] = 8; // 8-bit grayscale, filter zero for each scanline.
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		pngChunk('IHDR', ihdr),
		pngChunk('IDAT', deflateSync(Buffer.alloc((width + 1) * height))),
		pngChunk('IEND', Buffer.alloc(0)),
	]).toString('base64');
}

const pngBase64 = pngBase64WithDimensions(2048, 1152);

function firstRequest(): RequestUrlParam {
	const firstCall = vi.mocked(requestUrl).mock.calls[0];
	if (!firstCall) throw new Error('requestUrl was not called');
	return firstCall[0] as RequestUrlParam;
}

describe('CodexOAuthImageClient', () => {
	let mockLogger: MockLogger;

	beforeEach(() => {
		vi.resetAllMocks();
		vi.useFakeTimers();
		vi.mocked(fs.existsSync).mockReturnValue(false);
		mockLogger = createMockLogger();
	});

	afterEach(() => {
		vi.clearAllTimers();
		vi.useRealTimers();
	});



	describe('auth and streamed failure classification', () => {
		it.each(['response.failed', 'response.incomplete'])('rejects a later %s even after receiving an image', async (type) => {
			vi.mocked(requestUrl).mockResolvedValue({ status: 200, text: [
				`data: {"item":{"type":"image_generation_call","result":"${pngBase64}"}}`,
				`data: ${JSON.stringify({ type, response: { error: { code: 'rate_limit_exceeded', message: 'private-late-failure' } } })}`,
			].join('\n\n'), json: {} } as unknown as RequestUrlResponse);
			const subject = new CodexOAuthImageClient(baseConfig(), mockLogger as unknown as Logger, 100);
			const error: unknown = await subject.generateImage('sys', 'user', '1:1', '1K').catch((error: unknown) => error);
			expect(error).toBeInstanceOf(ImageGenerationError);
			expect(error).toMatchObject({ details: { category: 'stream', stage: 'response', errorCode: 'rate_limit_exceeded' } });
			expect(JSON.stringify([String(error), error, mockLogger.error.mock.calls])).not.toContain('private-late-failure');
			expect(mockLogger.info).not.toHaveBeenCalled();
		});

		it('rejects a header-only PNG missing IDAT and IEND', async () => {
			const truncated = Buffer.alloc(33);
			Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(truncated);
			truncated.writeUInt32BE(13, 8);
			truncated.write('IHDR', 12, 'ascii');
			truncated.writeUInt32BE(2048, 16);
			truncated.writeUInt32BE(1152, 20);
			vi.mocked(requestUrl).mockResolvedValue({ status: 200, text: `data: {"item":{"type":"image_generation_call","result":"${truncated.toString('base64')}"}}\n`, json: {} } as unknown as RequestUrlResponse);
			const subject = new CodexOAuthImageClient(baseConfig(), mockLogger as unknown as Logger, 100);
			await expect(subject.generateImage('sys', 'user', '1:1', '1K')).rejects.toMatchObject({ details: { category: 'invalid_image', stage: 'image' } });
		});

		it.each([
			['missing', 'auth_missing'],
			['unreadable', 'auth_unreadable'],
			['malformed', 'auth_invalid'],
			['token missing', 'auth_invalid'],
			['token wrong type', 'auth_invalid'],
		])('classifies %s auth without leaking content', async (scenario, category) => {
			vi.mocked(fs.existsSync).mockReturnValue(scenario !== 'missing');
			if (scenario === 'unreadable') vi.mocked(fs.readFileSync).mockImplementation(() => { throw new Error('private-filesystem-message'); });
			else vi.mocked(fs.readFileSync).mockReturnValue(scenario === 'malformed' ? '{private-auth-json' : scenario === 'token missing' ? '{}' : '{"access_token":123}');
			const subject = new CodexOAuthImageClient(baseConfig({ codexAccessToken: undefined }), mockLogger as unknown as Logger, 100);
			const error: unknown = await subject.generateImage('sys', 'user', '1:1', '1K').catch((error: unknown) => error);
			expect(error).toBeInstanceOf(ImageGenerationError);
			expect(error).toMatchObject({ details: { category, stage: 'auth' } });
			expect(JSON.stringify([String(error), error, mockLogger.error.mock.calls])).not.toMatch(/private-filesystem-message|private-auth-json/);
			expect(requestUrl).not.toHaveBeenCalled();
		});

		it.each(['response.failed', 'response.incomplete', 'error'])('classifies %s without leaking event messages or codes', async (type) => {
			vi.mocked(requestUrl).mockResolvedValue({ status: 200, text: `data: ${JSON.stringify({ type, error: { code: 'sk-private-stream-token', message: 'private-stream-message' } })}\n\n`, json: {} } as unknown as RequestUrlResponse);
			const subject = new CodexOAuthImageClient(baseConfig(), mockLogger as unknown as Logger, 100);
			const error: unknown = await subject.generateImage('sys', 'user', '1:1', '1K').catch((error: unknown) => error);
			expect(error).toBeInstanceOf(ImageGenerationError);
			expect(error).toMatchObject({ details: { category: 'stream', stage: 'response', errorCode: 'unknown' } });
			expect(JSON.stringify([String(error), error, mockLogger.error.mock.calls])).not.toMatch(/sk-private-stream-token|private-stream-message/);
		});

		it('classifies missing image events', async () => {
			vi.mocked(requestUrl).mockResolvedValue({ status: 200, text: 'data: [DONE]\n', json: {} } as unknown as RequestUrlResponse);
			const subject = new CodexOAuthImageClient(baseConfig(), mockLogger as unknown as Logger, 100);
			await expect(subject.generateImage('sys', 'user', '1:1', '1K')).rejects.toMatchObject({ details: { category: 'no_image', stage: 'image' } });
		});

		it('classifies invalid PNG data', async () => {
			vi.mocked(requestUrl).mockResolvedValue({ status: 200, text: 'data: {"item":{"type":"image_generation_call","result":"private-not-png"}}\n', json: {} } as unknown as RequestUrlResponse);
			const subject = new CodexOAuthImageClient(baseConfig(), mockLogger as unknown as Logger, 100);
			await expect(subject.generateImage('sys', 'user', '1:1', '1K')).rejects.toMatchObject({ details: { category: 'invalid_image', stage: 'image' } });
		});

		it('labels the image model as requested and accepts a differing served tool identity', async () => {
			vi.mocked(requestUrl).mockResolvedValue({ status: 200, text: `data: {"item":{"type":"image_generation_call","model":"gpt-image-2-codex","result":"${pngBase64}"}}\n`, json: {} } as unknown as RequestUrlResponse);
			const subject = new CodexOAuthImageClient(baseConfig(), mockLogger as unknown as Logger, 100);
			await expect(subject.generateImage('sys', 'user', '1:1', '1K')).resolves.toEqual({ data: pngBase64, mimeType: 'image/png' });
			expect(mockLogger.debug).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ requestedImageModel: 'gpt-image-2.6-sunburst' }));
		});
	});

	describe('safe failure diagnostics', () => {
		it('reads recognized HTTP codes from text when json is empty', async () => {
			vi.mocked(requestUrl).mockResolvedValue({ status: 429, text: '{"error":{"code":"rate_limit_exceeded","message":"private-http-text"}}', json: {} } as unknown as RequestUrlResponse);
			const subject = new CodexOAuthImageClient(baseConfig(), mockLogger as unknown as Logger, 100);
			await expect(subject.generateImage('sys', 'user', '1:1', '1K')).rejects.toMatchObject({ details: { category: 'http', stage: 'response', httpStatus: 429, errorCode: 'rate_limit_exceeded' } });
		});

		it.each([
			[401, 'invalid_api_key'],
			[429, 'rate_limit_exceeded'],
			[503, 'sk-private-secret'],
		])('classifies HTTP %i and exposes only a recognized code', async (status, code) => {
			const body = { error: { code, message: 'private-response-body', token: 'private-auth-token' } };
			vi.mocked(requestUrl).mockResolvedValue({ status, text: JSON.stringify(body), json: body } as unknown as RequestUrlResponse);
			const subject = new CodexOAuthImageClient(baseConfig(), mockLogger as unknown as Logger, 100);
			const error: unknown = await subject.generateImage('sys', 'private-note', '1:1', '1K').catch((error: unknown) => error);
			expect(error).toBeInstanceOf(ImageGenerationError);
			expect(error).toMatchObject({ details: { category: 'http', stage: 'response', httpStatus: status, errorCode: code === 'sk-private-secret' ? 'unknown' : code } });
			expect(JSON.stringify([String(error), error, mockLogger.error.mock.calls])).not.toMatch(/private-response-body|private-auth-token|private-note|sk-private-secret/);
		});

		it('does not leak rejected request messages', async () => {
			vi.mocked(requestUrl).mockRejectedValue(new Error('private-request-message sk-private-secret'));
			const subject = new CodexOAuthImageClient(baseConfig(), mockLogger as unknown as Logger, 100);
			const error: unknown = await subject.generateImage('sys', 'user', '1:1', '1K').catch((error: unknown) => error);
			expect(error).toBeInstanceOf(ImageGenerationError);
			expect(error).toMatchObject({ details: { category: 'network', stage: 'request' } });
			expect(JSON.stringify([String(error), error, mockLogger.error.mock.calls])).not.toMatch(/private-request-message|sk-private-secret/);
		});

		it('classifies timeouts and clears its timer', async () => {
			vi.useFakeTimers();
			try {
				vi.mocked(requestUrl).mockReturnValue(new Promise(() => {}) as ReturnType<typeof requestUrl>);
				const subject = new CodexOAuthImageClient(baseConfig(), mockLogger as unknown as Logger, 10);
				const rejected = subject.generateImage('sys', 'user', '1:1', '1K').catch((error: unknown) => error);
				await vi.advanceTimersByTimeAsync(10);
				expect(await rejected).toMatchObject({ details: { category: 'timeout', stage: 'request' } });
				expect(vi.getTimerCount()).toBe(0);
			} finally {
				vi.clearAllTimers();
				vi.useRealTimers();
			}
		});

		it('clears the timeout after a completed HTTP response', async () => {
			vi.useFakeTimers();
			try {
				vi.mocked(requestUrl).mockResolvedValue({ status: 429, text: '{}', json: {} } as unknown as RequestUrlResponse);
				const subject = new CodexOAuthImageClient(baseConfig(), mockLogger as unknown as Logger, 100);
				await expect(subject.generateImage('sys', 'user', '1:1', '1K')).rejects.toBeInstanceOf(ImageGenerationError);
				expect(vi.getTimerCount()).toBe(0);
			} finally {
				vi.clearAllTimers();
				vi.useRealTimers();
			}
		});

		it('identifies explicit unsupported-model errors without exposing response text', async () => {
			vi.mocked(requestUrl).mockResolvedValue({ status: 404, text: '{"error":{"code":"model_not_found","message":"private-model-message"}}', json: { error: { code: 'model_not_found', message: 'private-model-message' } } } as unknown as RequestUrlResponse);
			const subject = new CodexOAuthImageClient(baseConfig(), mockLogger as unknown as Logger, 100);
			await expect(subject.generateImage('sys', 'user', '1:1', '1K')).rejects.toMatchObject({ details: { category: 'unsupported_model', stage: 'response', httpStatus: 404, errorCode: 'model_not_found' } });
		});
	});

	describe('generateImage', () => {
		it.each([
			[undefined, 'gpt-6.1-sol'],
			['', 'gpt-6.1-sol'],
			['   ', 'gpt-6.1-sol'],
			['future-main-model', 'future-main-model'],
			['  future-main-model  ', 'future-main-model'],
		])('should send Responses model %j as %s without changing the image tool', async (configured, expected) => {
			vi.mocked(requestUrl).mockResolvedValue({
				status: 200,
				text: `data: {"item":{"type":"image_generation_call","result":"${pngBase64}"}}\n\n`,
				json: {},
			} as unknown as RequestUrlResponse);
			const client = new CodexOAuthImageClient(
				baseConfig({ codexResponsesModel: configured }), mockLogger as unknown as Logger, 300_000
			);

			await client.generateImage('sys', 'user', '16:9', '1K');

			const body = JSON.parse(firstRequest().body as string) as { model: string; tools: unknown[] };
			expect(body.model).toBe(expected);
			expect(body.tools).toEqual([{
				type: 'image_generation', model: 'gpt-image-2.6-sunburst', size: '2048x1152', quality: 'low', output_format: 'png',
			}]);
			expect(requestUrl).toHaveBeenCalledTimes(1);
		});

		it.each([
			['', 'gpt-6.1-sol'],
			['CODEX_RESPONSES_MODEL=', 'gpt-6.1-sol'],
			['CODEX_RESPONSES_MODEL="   "', 'gpt-6.1-sol'],
			['CODEX_RESPONSES_MODEL="  future-main-model  "', 'future-main-model'],
			['CODEX_RESPONSES_MODEL="future-main-model" # override', 'future-main-model'],
			["CODEX_RESPONSES_MODEL='future-main-model' # override", 'future-main-model'],
			['CODEX_RESPONSES_MODEL="" # default', 'gpt-6.1-sol'],
		])('should carry .env setting %j through the real loader into the request', async (setting, expected) => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue(`GEMINI_API_KEY=gk\nGEMINI_MODEL=gemini-other\nOPENAI_MODEL=image-other\nCODEX_ACCESS_TOKEN=test-token\n${setting}`);
			vi.mocked(requestUrl).mockResolvedValue({
				status: 200,
				text: `data: {"item":{"type":"image_generation_call","result":"${pngBase64}"}}\n\n`,
				json: {},
			} as unknown as RequestUrlResponse);
			const client = new CodexOAuthImageClient(loadEnvFile('/test/model.env'), mockLogger as unknown as Logger, 300_000);

			await client.generateImage('sys', 'user', '16:9', '1K');

			expect(JSON.parse(firstRequest().body as string)).toMatchObject({ model: expected });
		});

		it('should not enable auth-file discovery when only the Responses model is configured', async () => {
			const client = new CodexOAuthImageClient(baseConfig({
				codexResponsesModel: 'future-main-model', codexAccessToken: undefined,
				codexAccountId: undefined, codexAuthFilePath: undefined, codexFallbackEnabled: false,
			}), mockLogger as unknown as Logger, 300_000);

			await expect(client.generateImage('sys', 'user', '1:1', '1K')).rejects.toThrow('category=disabled stage=auth');
			expect(fs.existsSync).not.toHaveBeenCalled();
			expect(requestUrl).not.toHaveBeenCalled();
		});

		it.each([400, 401])('should surface HTTP %i without retrying a different model or logging response secrets', async (status) => {
			vi.mocked(requestUrl).mockResolvedValue({ status, text: 'private-response-fixture', json: {} } as unknown as RequestUrlResponse);
			const client = new CodexOAuthImageClient(baseConfig({ codexResponsesModel: 'unavailable-model' }), mockLogger as unknown as Logger, 300_000);

			await expect(client.generateImage('sys', 'private-note-fixture', '1:1', '1K')).rejects.toThrow(`category=http stage=response http_status=${status}`);
			expect(requestUrl).toHaveBeenCalledTimes(1);
			expect(mockLogger.error).toHaveBeenCalledWith('Codex OAuth API HTTP error', { category: 'http', stage: 'response', httpStatus: status });
			expect(JSON.stringify(mockLogger.error.mock.calls)).not.toMatch(/private-response-fixture|private-note-fixture|codex-token/);
		});

		it('should surface a timeout without retrying a different Responses model', async () => {
			vi.mocked(requestUrl).mockReturnValue(new Promise(() => {}) as ReturnType<typeof requestUrl>);
			const client = new CodexOAuthImageClient(baseConfig({ codexResponsesModel: 'slow-model' }), mockLogger as unknown as Logger, 10);
			const rejection = expect(client.generateImage('sys', 'user', '1:1', '1K')).rejects.toThrow('category=timeout stage=request');

			await vi.advanceTimersByTimeAsync(10);
			await rejection;
			expect(requestUrl).toHaveBeenCalledTimes(1);
		});

		it('should POST fixed Codex image settings and include aspect ratio as a prompt steering hint', async () => {
			vi.mocked(requestUrl).mockResolvedValue({
				status: 200,
				text: [
					'event: response.output_item.done',
					`data: {"item":{"type":"image_generation_call","result":"${pngBase64}"}}`,
					'',
				].join('\n'),
				json: {},
			} as unknown as RequestUrlResponse);

			const client = new CodexOAuthImageClient(baseConfig(), mockLogger as unknown as Logger, 300_000);
			const image = await client.generateImage('System prompt', 'User text', '16:9', '4K');

			expect(image).toEqual({ data: pngBase64, mimeType: 'image/png' });

			const call = firstRequest();
			expect(call.url).toBe('https://chatgpt.com/backend-api/codex/responses');
			expect(call.method).toBe('POST');
			expect(call.headers).toMatchObject({
				'Content-Type': 'application/json',
				'Accept': 'text/event-stream',
				'Authorization': 'Bearer codex-token',
				'ChatGPT-Account-ID': 'acct-123',
			});
			expect(call.throw).toBe(false);

			const body = JSON.parse(call.body as string) as {
				model: string;
				instructions: string;
				input: Array<{ role: string; content: Array<{ type: string; text: string }> }>;
				tools: Array<{ type: string; model: string; size: string; quality: string; output_format: string }>;
				tool_choice: { type: string };
				stream: boolean;
				store: boolean;
			};
			expect(body.model).toBe('gpt-6.1-sol');
			expect(body.instructions).toContain('System prompt');
			expect(body.input).toHaveLength(1);
			expect(body.input[0]?.content).toHaveLength(1);
			const inputText = body.input[0]!.content[0]!.text;
			expect(inputText).toContain('User text');
			expect(inputText).toContain('16:9 landscape');
			expect(body.tools).toEqual([
				{
					type: 'image_generation',
					model: 'gpt-image-2.6-sunburst',
					size: '2048x1152',
					quality: 'low',
					output_format: 'png',
				},
			]);
			expect(body.tool_choice).toEqual({ type: 'image_generation' });
			expect(body.stream).toBe(true);
			expect(body.store).toBe(false);
			expect(JSON.stringify(body)).toContain('16:9 landscape');
			expect(JSON.stringify(body)).not.toContain('4K');
		});

		it('should log actual PNG dimensions after successful generation', async () => {
			vi.mocked(requestUrl).mockResolvedValue({
				status: 200,
				text: `data: {"item":{"type":"image_generation_call","result":"${pngBase64WithDimensions(2048, 1152)}"}}\n\n`,
				json: {},
			} as unknown as RequestUrlResponse);

			const client = new CodexOAuthImageClient(baseConfig(), mockLogger as unknown as Logger, 300_000);
			await client.generateImage('sys', 'user', '16:9', '2K');

			expect(mockLogger.info).toHaveBeenCalledWith('Codex OAuth fallback generated PNG dimensions', {
				requestedSize: '2048x1152',
				actualSize: '2048x1152',
				width: 2048,
				height: 1152,
				actualAspectRatio: '16:9',
				orientation: 'landscape',
			});
			expect(mockLogger.warn).not.toHaveBeenCalledWith(
				'Codex OAuth fallback returned PNG dimensions different from requested size',
				expect.anything()
			);
		});

		it('should warn and continue when actual PNG dimensions differ from requested size', async () => {
			const portraitPng = pngBase64WithDimensions(864, 1821);
			vi.mocked(requestUrl).mockResolvedValue({
				status: 200,
				text: `data: {"item":{"type":"image_generation_call","result":"${portraitPng}"}}\n\n`,
				json: {},
			} as unknown as RequestUrlResponse);

			const client = new CodexOAuthImageClient(baseConfig(), mockLogger as unknown as Logger, 300_000);
			const image = await client.generateImage('sys', 'user', '16:9', '2K');

			expect(image).toEqual({ data: portraitPng, mimeType: 'image/png' });
			expect(mockLogger.warn).toHaveBeenCalledWith('Codex OAuth fallback returned PNG dimensions different from requested size', {
				requestedSize: '2048x1152',
				actualSize: '864x1821',
				width: 864,
				height: 1821,
				actualAspectRatio: '288:607',
				orientation: 'portrait',
			});
		});

		it('should reject missing Codex auth after explicit opt-in before sending a request', async () => {
			const client = new CodexOAuthImageClient(
				baseConfig({ codexAccessToken: undefined, codexAccountId: undefined, codexAuthFilePath: undefined, codexFallbackEnabled: true }),
				mockLogger as unknown as Logger,
				300_000
			);

			await expect(client.generateImage('sys', 'user', '1:1', '1K')).rejects.toThrow('category=auth_missing stage=auth');
			expect(requestUrl).not.toHaveBeenCalled();
		});

		it('should require explicit opt-in before reading the default Codex auth file', async () => {
			const client = new CodexOAuthImageClient(
				baseConfig({ codexAccessToken: undefined, codexAccountId: undefined, codexAuthFilePath: undefined, codexFallbackEnabled: false }),
				mockLogger as unknown as Logger,
				300_000
			);

			await expect(client.generateImage('sys', 'user', '1:1', '1K')).rejects.toThrow('category=disabled stage=auth');
			expect(fs.existsSync).not.toHaveBeenCalled();
			expect(requestUrl).not.toHaveBeenCalled();
		});

		it('should read nested Codex CLI tokens from an explicitly configured auth file', async () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
				tokens: { access_token: 'nested-token', account_id: 'nested-account' },
			}));
			vi.mocked(requestUrl).mockResolvedValue({
				status: 200,
				text: `data: {"response":{"output":[{"type":"image_generation_call","result":"${pngBase64}"}]}}\n\n`,
				json: {},
			} as unknown as RequestUrlResponse);

			const client = new CodexOAuthImageClient(
				baseConfig({ codexAccessToken: undefined, codexAccountId: undefined, codexAuthFilePath: '/explicit/auth.json' }),
				mockLogger as unknown as Logger,
				300_000
			);

			await client.generateImage('sys', 'user', '1:1', '1K');

			expect(firstRequest().headers).toMatchObject({
				'Authorization': 'Bearer nested-token',
				'ChatGPT-Account-ID': 'nested-account',
			});
		});

		it('should use env account id when auth file has only a token', async () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
				tokens: { access_token: 'nested-token' },
			}));
			vi.mocked(requestUrl).mockResolvedValue({
				status: 200,
				text: `data: {"response":{"output":[{"type":"image_generation_call","result":"${pngBase64}"}]}}\n\n`,
				json: {},
			} as unknown as RequestUrlResponse);

			const client = new CodexOAuthImageClient(
				baseConfig({ codexAccessToken: undefined, codexAccountId: 'env-account', codexAuthFilePath: '/explicit/auth.json' }),
				mockLogger as unknown as Logger,
				300_000
			);

			await client.generateImage('sys', 'user', '1:1', '1K');

			expect(firstRequest().headers).toMatchObject({
				'Authorization': 'Bearer nested-token',
				'ChatGPT-Account-ID': 'env-account',
			});
		});

		it('should surface an actionable auth refresh hint for auth-file 401 responses', async () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
				tokens: { access_token: 'expired-token', account_id: 'nested-account', refresh_token: 'refresh-token' },
			}));
			vi.mocked(requestUrl).mockResolvedValue({
				status: 401,
				text: 'expired bearer token',
				json: {},
			} as unknown as RequestUrlResponse);

			const client = new CodexOAuthImageClient(
				baseConfig({ codexAccessToken: undefined, codexAccountId: undefined, codexAuthFilePath: '/explicit/auth.json' }),
				mockLogger as unknown as Logger,
				300_000
			);

			await expect(client.generateImage('sys', 'user', '1:1', '1K')).rejects.toThrow(/codex login|CODEX_ACCESS_TOKEN/);
		});

		it('should surface Codex SSE error events', async () => {
			vi.mocked(requestUrl).mockResolvedValue({
				status: 200,
				text: 'data: {"type":"response.failed","error":{"message":"quota exceeded"}}\n\n',
				json: {},
			} as unknown as RequestUrlResponse);

			const client = new CodexOAuthImageClient(baseConfig(), mockLogger as unknown as Logger, 300_000);

			await expect(client.generateImage('sys', 'user', '1:1', '1K')).rejects.toThrow('category=stream stage=response');
		});

		it('should classify response failures without leaking raw SSE events', async () => {
			vi.mocked(requestUrl).mockResolvedValue({
				status: 200,
				text: 'data: {"type":"response.failed","response":{"error":{"message":"workspace denied","secret":"raw-payload"}}}\n\n',
				json: {},
			} as unknown as RequestUrlResponse);

			const client = new CodexOAuthImageClient(baseConfig(), mockLogger as unknown as Logger, 300_000);

			await expect(client.generateImage('sys', 'user', '1:1', '1K')).rejects.toThrow('category=stream stage=response');
			await expect(client.generateImage('sys', 'user', '1:1', '1K')).rejects.not.toThrow(/raw-payload/);
		});

		it('should reject invalid PNG image data', async () => {
			vi.mocked(requestUrl).mockResolvedValue({
				status: 200,
				text: 'data: {"item":{"type":"image_generation_call","result":"bm90LXBuZw=="}}\n\n',
				json: {},
			} as unknown as RequestUrlResponse);

			const client = new CodexOAuthImageClient(baseConfig(), mockLogger as unknown as Logger, 300_000);

			await expect(client.generateImage('sys', 'user', '1:1', '1K')).rejects.toThrow('category=invalid_image stage=image');
		});
	});
});
