/**
 * Tests for Codex OAuth image-generation fallback client
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestUrlParam, RequestUrlResponse } from 'obsidian';
import { requestUrl } from 'obsidian';
import * as fs from 'fs';
import { CodexOAuthImageClient } from './codex-oauth';
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

const pngBase64 = 'iVBORw0KGgo=';

function firstRequest(): RequestUrlParam {
	const firstCall = vi.mocked(requestUrl).mock.calls[0];
	if (!firstCall) throw new Error('requestUrl was not called');
	return firstCall[0] as RequestUrlParam;
}

describe('CodexOAuthImageClient', () => {
	let mockLogger: MockLogger;

	beforeEach(() => {
		vi.resetAllMocks();
		vi.mocked(fs.existsSync).mockReturnValue(false);
		mockLogger = createMockLogger();
	});

	describe('generateImage', () => {
		it('should POST fixed Codex image settings and ignore prompt image settings', async () => {
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
			const image = await client.generateImage('System prompt', 'User text', '21:9', '4K');

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
			expect(body.model).toBe('gpt-5.5');
			expect(body.instructions).toContain('System prompt');
			expect(body.input).toEqual([
				{
					role: 'user',
					content: [{ type: 'input_text', text: 'User text' }],
				},
			]);
			expect(body.tools).toEqual([
				{
					type: 'image_generation',
					model: 'gpt-image-2',
					size: '2048x1152',
					quality: 'low',
				},
			]);
			expect(body.tool_choice).toEqual({ type: 'image_generation' });
			expect(body.stream).toBe(true);
			expect(body.store).toBe(false);
			expect(JSON.stringify(body)).not.toContain('21:9');
			expect(JSON.stringify(body)).not.toContain('4K');
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
