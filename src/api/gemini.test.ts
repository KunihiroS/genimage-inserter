/**
 * Tests for Gemini API client
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requestUrl } from 'obsidian';
import { GeminiClient } from './gemini';
import { EnvConfig } from '../types';
import { Logger } from '../utils/logger';

// Create mock logger
const createMockLogger = (): Logger => ({
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
	debug: vi.fn(),
	sanitize: vi.fn((text: string) => text),
} as unknown as Logger);

describe('GeminiClient', () => {
	let client: GeminiClient;
	let mockLogger: Logger;
	const mockConfig: EnvConfig = {
		llmProvider: 'gemini',
		geminiApiKey: 'test-api-key',
		geminiModel: 'gemini-2.5-flash-image',
	};

	beforeEach(() => {
		vi.resetAllMocks();
		mockLogger = createMockLogger();
		client = new GeminiClient(mockConfig, mockLogger);
	});

	describe('generateImage', () => {
		it('should make correct API request', async () => {
			const mockResponse = {
				json: {
					candidates: [{
						content: {
							parts: [{
								inlineData: {
									mimeType: 'image/png',
									data: 'base64imagedata',
								},
							}],
						},
					}],
				},
			};

			vi.mocked(requestUrl).mockResolvedValue(mockResponse as any);

			await client.generateImage('System prompt', 'User text', '16:9', '2K');

			expect(requestUrl).toHaveBeenCalledWith({
				url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent',
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-goog-api-key': 'test-api-key',
				},
				body: expect.stringContaining('System prompt'),
			});
		});

		it('should return generated image data', async () => {
			const mockResponse = {
				json: {
					candidates: [{
						content: {
							parts: [{
								inlineData: {
									mimeType: 'image/jpeg',
									data: 'SGVsbG8gV29ybGQ=',
								},
							}],
						},
					}],
				},
			};

			vi.mocked(requestUrl).mockResolvedValue(mockResponse as any);

			const result = await client.generateImage('prompt', 'text', '1:1', '1K');

			expect(result).toEqual({
				mimeType: 'image/jpeg',
				data: 'SGVsbG8gV29ybGQ=',
			});
		});

		it('should include aspect ratio and image size in request', async () => {
			const mockResponse = {
				json: {
					candidates: [{
						content: {
							parts: [{
								inlineData: {
									mimeType: 'image/png',
									data: 'data',
								},
							}],
						},
					}],
				},
			};

			vi.mocked(requestUrl).mockResolvedValue(mockResponse as any);

			await client.generateImage('prompt', 'text', '21:9', '4K');

			const call = vi.mocked(requestUrl).mock.calls[0]?.[0];
			expect(call).toBeDefined();
			if (typeof call === 'object' && call && 'body' in call) {
				const body = JSON.parse(call.body as string);
				expect(body.generationConfig.imageConfig).toEqual({
					aspectRatio: '21:9',
					imageSize: '4K',
				});
			}
		});

		it('should combine system prompt and user text', async () => {
			const mockResponse = {
				json: {
					candidates: [{
						content: {
							parts: [{
								inlineData: {
									mimeType: 'image/png',
									data: 'data',
								},
							}],
						},
					}],
				},
			};

			vi.mocked(requestUrl).mockResolvedValue(mockResponse as any);

			await client.generateImage('System instructions', 'User content', '1:1', '1K');

			const call = vi.mocked(requestUrl).mock.calls[0]?.[0];
			expect(call).toBeDefined();
			if (typeof call === 'object' && call && 'body' in call) {
				const body = JSON.parse(call.body as string);
				const promptText = body.contents[0].parts[0].text;

				expect(promptText).toContain('System instructions');
				expect(promptText).toContain('User content');
				expect(promptText).toContain('---');
			}
		});

		it('should throw error when API returns error', async () => {
			const mockResponse = {
				json: {
					error: {
						code: 400,
						message: 'Invalid request',
						status: 'INVALID_ARGUMENT',
					},
				},
			};

			vi.mocked(requestUrl).mockResolvedValue(mockResponse as any);

			await expect(client.generateImage('prompt', 'text', '1:1', '1K'))
				.rejects.toThrow('Gemini API error: Invalid request');
		});

		it('should throw error when no image in response', async () => {
			const mockResponse = {
				json: {
					candidates: [{
						content: {
							parts: [{
								text: 'Text only response',
							}],
						},
					}],
				},
			};

			vi.mocked(requestUrl).mockResolvedValue(mockResponse as any);

			await expect(client.generateImage('prompt', 'text', '1:1', '1K'))
				.rejects.toThrow('No image was generated');
		});

		it('should throw error when candidates is empty', async () => {
			const mockResponse = {
				json: {
					candidates: [],
				},
			};

			vi.mocked(requestUrl).mockResolvedValue(mockResponse as any);

			await expect(client.generateImage('prompt', 'text', '1:1', '1K'))
				.rejects.toThrow('No image was generated');
		});

		it('should log request info', async () => {
			const mockResponse = {
				json: {
					candidates: [{
						content: {
							parts: [{
								inlineData: {
									mimeType: 'image/png',
									data: 'data',
								},
							}],
						},
					}],
				},
			};

			vi.mocked(requestUrl).mockResolvedValue(mockResponse as any);

			await client.generateImage('prompt', 'text', '16:9', '2K');

			expect(mockLogger.info).toHaveBeenCalledWith(
				'Sending request to Gemini API',
				expect.objectContaining({
					model: 'gemini-2.5-flash-image',
					aspectRatio: '16:9',
					imageSize: '2K',
				})
			);
		});

		it('should log success info', async () => {
			const mockResponse = {
				json: {
					candidates: [{
						content: {
							parts: [{
								inlineData: {
									mimeType: 'image/png',
									data: 'testdata',
								},
							}],
						},
					}],
				},
			};

			vi.mocked(requestUrl).mockResolvedValue(mockResponse as any);

			await client.generateImage('prompt', 'text', '1:1', '1K');

			expect(mockLogger.info).toHaveBeenCalledWith(
				'Image generated successfully',
				expect.objectContaining({
					mimeType: 'image/png',
				})
			);
		});
	});
});
