/**
 * Tests for OpenAI image-generation fallback client
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestUrlResponse, RequestUrlParam } from 'obsidian';
import { requestUrl } from 'obsidian';
import { OpenAIClient } from './openai';
import { EnvConfig, AspectRatio } from '../types';
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

function firstRequest(): RequestUrlParam {
	const firstCall = vi.mocked(requestUrl).mock.calls[0];
	if (!firstCall) throw new Error('requestUrl was not called');
	return firstCall[0] as RequestUrlParam;
}

function baseConfig(overrides: Partial<EnvConfig> = {}): EnvConfig {
	return {
		llmProvider: 'gemini',
		geminiApiKey: 'gk',
		geminiModel: 'gm',
		openaiApiKey: 'sk-test',
		openaiModel: 'gpt-image-2',
		openaiBaseUrl: 'https://api.openai.com/v1',
		...overrides,
	};
}

describe('OpenAIClient', () => {
	let mockLogger: MockLogger;

	beforeEach(() => {
		vi.resetAllMocks();
		mockLogger = createMockLogger();
	});

	describe('generateImage', () => {
		it('should throw a timeout error when the request exceeds timeoutMs', async () => {
			vi.mocked(requestUrl).mockImplementation(
				() => new Promise(() => { /* never resolves */ }) as unknown as ReturnType<typeof requestUrl>
			);

			const client = new OpenAIClient(baseConfig(), mockLogger as unknown as Logger, 10);

			await expect(
				client.generateImage('sys', 'user', '1:1', '1K')
			).rejects.toThrow(/timed out/);
		});

		it('should throw with HTTP status on non-2xx response and never log the raw body', async () => {
			vi.mocked(requestUrl).mockResolvedValue({
				status: 500,
				text: 'internal error details that must not leak',
				json: {},
			} as unknown as RequestUrlResponse);

			const client = new OpenAIClient(baseConfig(), mockLogger as unknown as Logger, 180_000);

			await expect(
				client.generateImage('sys', 'user', '1:1', '1K')
			).rejects.toThrow(/HTTP 500/);

			expect(mockLogger.error).toHaveBeenCalled();
			const loggedArgs = JSON.stringify(mockLogger.error.mock.calls);
			expect(loggedArgs).not.toContain('internal error details');
		});

		it('should POST to /images/generations with Bearer auth and b64_json-compatible body', async () => {
			vi.mocked(requestUrl).mockResolvedValue({
				status: 200,
				json: { data: [{ b64_json: 'AAAA' }] },
			} as unknown as RequestUrlResponse);

			const client = new OpenAIClient(baseConfig(), mockLogger as unknown as Logger, 180_000);
			const result = await client.generateImage('System prompt', 'User text', '1:1', '1K');

			expect(result).toEqual({ data: 'AAAA', mimeType: 'image/png' });

			const call = firstRequest();
			expect(call.url).toBe('https://api.openai.com/v1/images/generations');
			expect(call.method).toBe('POST');
			expect(call.headers).toEqual({
				'Content-Type': 'application/json',
				'Authorization': 'Bearer sk-test',
			});
			expect(call.throw).toBe(false);

			const body = JSON.parse(call.body as string) as {
				model: string;
				prompt: string;
				size: string;
				n: number;
				response_format?: string;
			};
			expect(body.model).toBe('gpt-image-2');
			expect(body.prompt).toContain('System prompt');
			expect(body.prompt).toContain('User text');
			expect(body.size).toBe('1024x1024');
			expect(body.n).toBe(1);
			// gpt-image models do not accept response_format (DALL-E only)
			expect(body.response_format).toBeUndefined();
		});

		it('should throw when response contains no image data', async () => {
			vi.mocked(requestUrl).mockResolvedValue({
				status: 200,
				json: { data: [] },
			} as unknown as RequestUrlResponse);

			const client = new OpenAIClient(baseConfig(), mockLogger as unknown as Logger, 180_000);

			await expect(
				client.generateImage('sys', 'user', '1:1', '1K')
			).rejects.toThrow(/No image/);
		});

		it('should reject unsupported DALL-E models before sending a request', async () => {
			const client = new OpenAIClient(
				baseConfig({ openaiModel: 'dall-e-3' }),
				mockLogger as unknown as Logger,
				180_000
			);

			await expect(client.generateImage('sys', 'user', '1:1', '1K')).rejects.toThrow(/Only GPT image models/);
			expect(requestUrl).not.toHaveBeenCalled();
		});

		it.each([
			{ ratio: '1:1' as AspectRatio, expected: '1024x1024' },
			{ ratio: '16:9' as AspectRatio, expected: '1536x864' },
			{ ratio: '4:3' as AspectRatio, expected: '1408x1056' },
			{ ratio: '3:2' as AspectRatio, expected: '1536x1024' },
			{ ratio: '5:4' as AspectRatio, expected: '1280x1024' },
			{ ratio: '21:9' as AspectRatio, expected: '2016x864' },
			{ ratio: '9:16' as AspectRatio, expected: '864x1536' },
			{ ratio: '2:3' as AspectRatio, expected: '1024x1536' },
			{ ratio: '3:4' as AspectRatio, expected: '1056x1408' },
			{ ratio: '4:5' as AspectRatio, expected: '1024x1280' },
		])('should map aspect_ratio $ratio to size $expected', async ({ ratio, expected }) => {
			vi.mocked(requestUrl).mockResolvedValue({
				status: 200,
				json: { data: [{ b64_json: 'AAAA' }] },
			} as unknown as RequestUrlResponse);

			const client = new OpenAIClient(baseConfig(), mockLogger as unknown as Logger, 180_000);
			await client.generateImage('sys', 'user', ratio, '1K');

			const body = JSON.parse(firstRequest().body as string) as { size: string };
			expect(body.size).toBe(expected);
			expect(mockLogger.warn).not.toHaveBeenCalled();
		});

		it('should fall back to 1024x1024 and warn when aspect_ratio is unsupported', async () => {
			vi.mocked(requestUrl).mockResolvedValue({
				status: 200,
				json: { data: [{ b64_json: 'AAAA' }] },
			} as unknown as RequestUrlResponse);

			const client = new OpenAIClient(baseConfig(), mockLogger as unknown as Logger, 180_000);
			await client.generateImage('sys', 'user', '99:1' as AspectRatio, '1K');

			const body = JSON.parse(firstRequest().body as string) as { size: string };
			expect(body.size).toBe('1024x1024');
			expect(mockLogger.warn).toHaveBeenCalledWith(
				expect.stringContaining('Unsupported aspect ratio') as unknown,
				expect.objectContaining({ aspectRatio: '99:1' }) as unknown
			);
		});

		it('should strip trailing slashes from a custom openaiBaseUrl and append /images/generations', async () => {
			vi.mocked(requestUrl).mockResolvedValue({
				status: 200,
				json: { data: [{ b64_json: 'AAAA' }] },
			} as unknown as RequestUrlResponse);

			const client = new OpenAIClient(
				baseConfig({ openaiBaseUrl: 'https://proxy.example.com/v1///' }),
				mockLogger as unknown as Logger,
				180_000
			);
			await client.generateImage('sys', 'user', '1:1', '1K');

			expect(firstRequest().url).toBe('https://proxy.example.com/v1/images/generations');
		});

		it('should emit a debug log noting that imageSize is ignored by OpenAI', async () => {
			vi.mocked(requestUrl).mockResolvedValue({
				status: 200,
				json: { data: [{ b64_json: 'AAAA' }] },
			} as unknown as RequestUrlResponse);

			const client = new OpenAIClient(baseConfig(), mockLogger as unknown as Logger, 180_000);
			await client.generateImage('sys', 'user', '1:1', '2K');

			expect(mockLogger.debug).toHaveBeenCalledWith(
				expect.stringContaining('imageSize') as unknown,
				expect.objectContaining({ imageSize: '2K' }) as unknown
			);
		});
	});
});
