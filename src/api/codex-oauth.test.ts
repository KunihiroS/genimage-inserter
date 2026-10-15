/**
 * Tests for Codex OAuth image-generation fallback client
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { RequestUrlParam, RequestUrlResponse } from 'obsidian';
import { requestUrl } from 'obsidian';
import * as fs from 'fs';
import { CodexOAuthImageClient } from './codex-oauth';
import { loadEnvFile } from '../utils/env-loader';
import { EnvConfig } from '../types';
import { Logger } from '../utils/logger';

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

function pngBase64WithDimensions(width: number, height: number): string {
	const bytes = Buffer.alloc(33);
	Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
	bytes.writeUInt32BE(13, 8);
	bytes.write('IHDR', 12, 'ascii');
	bytes.writeUInt32BE(width, 16);
	bytes.writeUInt32BE(height, 20);
	return bytes.toString('base64');
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
				type: 'image_generation', model: 'gpt-image-2', size: '2048x1152', quality: 'low', output_format: 'png',
			}]);
			expect(requestUrl).toHaveBeenCalledTimes(1);
		});

		it.each([
			['', 'gpt-6.1-sol'],
			['CODEX_RESPONSES_MODEL=', 'gpt-6.1-sol'],
			['CODEX_RESPONSES_MODEL="   "', 'gpt-6.1-sol'],
			['CODEX_RESPONSES_MODEL="  future-main-model  "', 'future-main-model'],
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

			await expect(client.generateImage('sys', 'user', '1:1', '1K')).rejects.toThrow(/not enabled/);
			expect(fs.existsSync).not.toHaveBeenCalled();
			expect(requestUrl).not.toHaveBeenCalled();
		});

		it.each([400, 401])('should surface HTTP %i without retrying a different model or logging response secrets', async (status) => {
			vi.mocked(requestUrl).mockResolvedValue({ status, text: 'private-response-fixture', json: {} } as unknown as RequestUrlResponse);
			const client = new CodexOAuthImageClient(baseConfig({ codexResponsesModel: 'unavailable-model' }), mockLogger as unknown as Logger, 300_000);

			await expect(client.generateImage('sys', 'private-note-fixture', '1:1', '1K')).rejects.toThrow(`Codex OAuth API error: HTTP ${status}`);
			expect(requestUrl).toHaveBeenCalledTimes(1);
			expect(mockLogger.error).toHaveBeenCalledWith('Codex OAuth API HTTP error', { status, bodyLength: 24 });
			expect(JSON.stringify(mockLogger.error.mock.calls)).not.toMatch(/private-response-fixture|private-note-fixture|codex-token/);
		});

		it('should surface a timeout without retrying a different Responses model', async () => {
			vi.mocked(requestUrl).mockReturnValue(new Promise(() => {}) as ReturnType<typeof requestUrl>);
			const client = new CodexOAuthImageClient(baseConfig({ codexResponsesModel: 'slow-model' }), mockLogger as unknown as Logger, 10);
			const rejection = expect(client.generateImage('sys', 'user', '1:1', '1K')).rejects.toThrow('Request timed out after 0.01 seconds');

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
					model: 'gpt-image-2',
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

			await expect(client.generateImage('sys', 'user', '1:1', '1K')).rejects.toThrow(/Codex OAuth auth is not configured/);
			expect(requestUrl).not.toHaveBeenCalled();
		});

		it('should require explicit opt-in before reading the default Codex auth file', async () => {
			const client = new CodexOAuthImageClient(
				baseConfig({ codexAccessToken: undefined, codexAccountId: undefined, codexAuthFilePath: undefined, codexFallbackEnabled: false }),
				mockLogger as unknown as Logger,
				300_000
			);

			await expect(client.generateImage('sys', 'user', '1:1', '1K')).rejects.toThrow(/not enabled/);
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

			await expect(client.generateImage('sys', 'user', '1:1', '1K')).rejects.toThrow(/quota exceeded/);
		});

		it('should surface known response failure messages without leaking raw SSE events', async () => {
			vi.mocked(requestUrl).mockResolvedValue({
				status: 200,
				text: 'data: {"type":"response.failed","response":{"error":{"message":"workspace denied","secret":"raw-payload"}}}\n\n',
				json: {},
			} as unknown as RequestUrlResponse);

			const client = new CodexOAuthImageClient(baseConfig(), mockLogger as unknown as Logger, 300_000);

			await expect(client.generateImage('sys', 'user', '1:1', '1K')).rejects.toThrow('Codex image generation failed: workspace denied');
			await expect(client.generateImage('sys', 'user', '1:1', '1K')).rejects.not.toThrow(/raw-payload/);
		});

		it('should reject invalid PNG image data', async () => {
			vi.mocked(requestUrl).mockResolvedValue({
				status: 200,
				text: 'data: {"item":{"type":"image_generation_call","result":"bm90LXBuZw=="}}\n\n',
				json: {},
			} as unknown as RequestUrlResponse);

			const client = new CodexOAuthImageClient(baseConfig(), mockLogger as unknown as Logger, 300_000);

			await expect(client.generateImage('sys', 'user', '1:1', '1K')).rejects.toThrow(/not a PNG/);
		});
	});
});
