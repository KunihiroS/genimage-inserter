/**
 * Tests for Gemini API client
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestUrlResponse } from 'obsidian';
import { requestUrl } from 'obsidian';
import { GeminiClient } from './gemini';
import { EnvConfig } from '../types';
import { Logger } from '../utils/logger';

// Type for mock logger methods
interface MockLogger {
	info: ReturnType<typeof vi.fn>;
	warn: ReturnType<typeof vi.fn>;
	error: ReturnType<typeof vi.fn>;
	debug: ReturnType<typeof vi.fn>;
	sanitize: ReturnType<typeof vi.fn>;
}

// Create mock logger
function createMockLogger(): MockLogger {
	return {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
		sanitize: vi.fn((text: string) => text),
	};
}

describe('GeminiClient', () => {
	let client: GeminiClient;
	let mockLogger: MockLogger;
	const mockConfig: EnvConfig = {
		llmProvider: 'gemini',
		geminiApiKey: 'test-api-key',
		geminiModel: 'gemini-2.5-flash-image',
	};

	beforeEach(() => {
		vi.resetAllMocks();
		mockLogger = createMockLogger();
		client = new GeminiClient(mockConfig, mockLogger as unknown as Logger, 180_000);
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

			vi.mocked(requestUrl).mockResolvedValue(mockResponse as unknown as RequestUrlResponse);

			await client.generateImage('System prompt', 'User text', '16:9', '2K');

			expect(requestUrl).toHaveBeenCalledWith({
				url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent',
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-goog-api-key': 'test-api-key',
				},
				body: expect.stringContaining('System prompt') as unknown,
				throw: false,
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

			vi.mocked(requestUrl).mockResolvedValue(mockResponse as unknown as RequestUrlResponse);

			const result = await client.generateImage('prompt', 'text', '1:1', '1K');

			expect(result).toEqual({
				mimeType: 'image/jpeg',
				data: 'SGVsbG8gV29ybGQ=',
			});
		});

		it('should include aspect ratio only for gemini-2.5-flash-image', async () => {
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

			vi.mocked(requestUrl).mockResolvedValue(mockResponse as unknown as RequestUrlResponse);

			// gemini-2.5-flash-image only supports aspectRatio, not imageSize
			await client.generateImage('prompt', 'text', '21:9', '4K');

			const call = vi.mocked(requestUrl).mock.calls[0]?.[0] as { body?: string } | undefined;
			expect(call).toBeDefined();
			if (call && 'body' in call && call.body) {
				const body = JSON.parse(call.body) as { generationConfig: { imageConfig: Record<string, unknown> } };
				// Should only have aspectRatio, not imageSize
				expect(body.generationConfig.imageConfig).toEqual({
					aspectRatio: '21:9',
				});
			}
		});

		it('should include both aspect ratio and image size for gemini-3-pro-image-preview', async () => {
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

			vi.mocked(requestUrl).mockResolvedValue(mockResponse as unknown as RequestUrlResponse);

			// Create client with gemini-3-pro-image-preview model
			const configWithGemini3: EnvConfig = {
				...mockConfig,
				geminiModel: 'gemini-3-pro-image-preview',
			};
			const gemini3Client = new GeminiClient(configWithGemini3, mockLogger as unknown as Logger, 180_000);

			await gemini3Client.generateImage('prompt', 'text', '21:9', '4K');

			const call = vi.mocked(requestUrl).mock.calls[0]?.[0] as { body?: string } | undefined;
			expect(call).toBeDefined();
			if (call && 'body' in call && call.body) {
				const body = JSON.parse(call.body) as { generationConfig: { imageConfig: Record<string, unknown> } };
				// Should have both aspectRatio and imageSize
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

			vi.mocked(requestUrl).mockResolvedValue(mockResponse as unknown as RequestUrlResponse);

			await client.generateImage('System instructions', 'User content', '1:1', '1K');

			const call = vi.mocked(requestUrl).mock.calls[0]?.[0] as { body?: string } | undefined;
			expect(call).toBeDefined();
			if (call && 'body' in call && call.body) {
				const body = JSON.parse(call.body) as { contents: Array<{ parts: Array<{ text: string }> }> };
				const promptText = body.contents[0]?.parts[0]?.text;

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

			vi.mocked(requestUrl).mockResolvedValue(mockResponse as unknown as RequestUrlResponse);

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

			vi.mocked(requestUrl).mockResolvedValue(mockResponse as unknown as RequestUrlResponse);

			await expect(client.generateImage('prompt', 'text', '1:1', '1K'))
				.rejects.toThrow('No image was generated');
		});

		it('should throw error when candidates is empty', async () => {
			const mockResponse = {
				json: {
					candidates: [],
				},
			};

			vi.mocked(requestUrl).mockResolvedValue(mockResponse as unknown as RequestUrlResponse);

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

			vi.mocked(requestUrl).mockResolvedValue(mockResponse as unknown as RequestUrlResponse);

			await client.generateImage('prompt', 'text', '16:9', '2K');

			expect(mockLogger.info).toHaveBeenCalledWith(
				'Sending request to Gemini API',
				expect.objectContaining({
					model: 'gemini-2.5-flash-image',
					aspectRatio: '16:9',
					// imageSize is N/A for flash model
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

			vi.mocked(requestUrl).mockResolvedValue(mockResponse as unknown as RequestUrlResponse);

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
