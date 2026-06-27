/**
 * Tests for Codex OAuth image-generation fallback client
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestUrlParam, RequestUrlResponse } from 'obsidian';
import { requestUrl } from 'obsidian';
import { CodexOAuthImageClient } from './codex-oauth';
import { EnvConfig } from '../types';
import { Logger } from '../utils/logger';

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
		...overrides,
	};
}

function firstRequest(): RequestUrlParam {
	const firstCall = vi.mocked(requestUrl).mock.calls[0];
	if (!firstCall) throw new Error('requestUrl was not called');
	return firstCall[0] as RequestUrlParam;
}

describe('CodexOAuthImageClient', () => {
	let mockLogger: MockLogger;

	beforeEach(() => {
		vi.resetAllMocks();
		mockLogger = createMockLogger();
	});

	describe('generateImage', () => {
		it('should POST fixed Codex image settings and ignore prompt image settings', async () => {
			vi.mocked(requestUrl).mockResolvedValue({
				status: 200,
				text: [
					'event: response.output_item.done',
					'data: {"item":{"type":"image_generation_call","result":"iVBORw0KGgo="}}',
					'',
				].join('\n'),
				json: {},
			} as unknown as RequestUrlResponse);

			const client = new CodexOAuthImageClient(baseConfig(), mockLogger as unknown as Logger, 300_000);
			const image = await client.generateImage('System prompt', 'User text', '21:9', '4K');

			expect(image).toEqual({ data: 'iVBORw0KGgo=', mimeType: 'image/png' });

			const call = firstRequest();
			expect(call.url).toBe('https://chatgpt.com/backend-api/codex/responses');
			expect(call.method).toBe('POST');
			expect(call.headers).toMatchObject({
				'Content-Type': 'application/json',
				'Authorization': 'Bearer codex-token',
				'ChatGPT-Account-ID': 'acct-123',
			});
			expect(call.throw).toBe(false);

			const body = JSON.parse(call.body as string) as {
				model: string;
				input: string;
				tools: Array<{ type: string; model: string; size: string; quality: string; output_format: string }>;
			};
			expect(body.model).toBe('gpt-5.5');
			expect(body.input).toContain('System prompt');
			expect(body.input).toContain('User text');
			expect(body.tools).toEqual([
				{
					type: 'image_generation',
					model: 'gpt-image-2',
					size: '2048x1152',
					quality: 'low',
					output_format: 'png',
				},
			]);
			expect(JSON.stringify(body)).not.toContain('21:9');
			expect(JSON.stringify(body)).not.toContain('4K');
		});

		it('should reject missing Codex auth before sending a request', async () => {
			const client = new CodexOAuthImageClient(
				baseConfig({ codexAccessToken: undefined, codexAccountId: undefined, codexAuthFilePath: '/missing/codex/auth.json' }),
				mockLogger as unknown as Logger,
				300_000
			);

			await expect(client.generateImage('sys', 'user', '1:1', '1K')).rejects.toThrow(/Codex OAuth auth is not configured/);
			expect(requestUrl).not.toHaveBeenCalled();
		});
	});
});
