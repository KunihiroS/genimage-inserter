/**
 * Tests for ImageGeneratorService
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ImageGeneratorService } from './image-generator';
import { GenImageInserterSettings } from '../settings';
import { PromptFile } from '../types';
import type { App } from 'obsidian';

// Mock obsidian module
vi.mock('obsidian', () => ({
	Notice: vi.fn(),
}));

// Mock dependencies
vi.mock('../utils/env-loader', () => ({
	loadEnvFile: vi.fn(),
}));

vi.mock('../utils/prompt-parser', () => ({
	getPromptFiles: vi.fn(),
}));

// Mock GeminiClient as a class - define mock function first
const mockGenerateImage = vi.fn();

vi.mock('../api/gemini', () => {
	return {
		GeminiClient: class MockGeminiClient {
			generateImage = mockGenerateImage;
		},
	};
});

vi.mock('../ui/prompt-selector-modal', () => ({
	showPromptSelector: vi.fn(),
}));

// Import mocked modules
import { Notice } from 'obsidian';
import { loadEnvFile } from '../utils/env-loader';
import { getPromptFiles } from '../utils/prompt-parser';
import { showPromptSelector } from '../ui/prompt-selector-modal';

// Mock logger interface
interface MockLogger {
	info: ReturnType<typeof vi.fn>;
	warn: ReturnType<typeof vi.fn>;
	error: ReturnType<typeof vi.fn>;
	debug: ReturnType<typeof vi.fn>;
}

function createMockLogger(): MockLogger {
	return {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	};
}

// Mock App interface
interface MockApp {
	vault: {
		getAbstractFileByPath: ReturnType<typeof vi.fn>;
		createFolder: ReturnType<typeof vi.fn>;
		createBinary: ReturnType<typeof vi.fn>;
	};
}

function createMockApp(): MockApp {
	return {
		vault: {
			getAbstractFileByPath: vi.fn(),
			createFolder: vi.fn(),
			createBinary: vi.fn(),
		},
	};
}

const validSettings: GenImageInserterSettings = {
	envFilePath: '/path/to/.env',
	promptDirectory: 'prompts',
	imageOutputDirectory: 'assets',
	notificationDelaySeconds: 3,
};

// Helper to create mock PromptFile with all required fields
function createMockPrompt(overrides: Partial<PromptFile> = {}): PromptFile {
	return {
		name: 'test-prompt',
		path: 'prompts/test-prompt.md',
		content: 'Generate an image',
		aspectRatio: '1:1',
		imageSize: '1K',
		...overrides,
	};
}

describe('ImageGeneratorService', () => {
	let service: ImageGeneratorService;
	let mockApp: MockApp;
	let mockLogger: MockLogger;

	beforeEach(() => {
		vi.resetAllMocks();
		mockApp = createMockApp();
		mockLogger = createMockLogger();
		service = new ImageGeneratorService(
			mockApp as unknown as App,
			validSettings,
			mockLogger as unknown as import('../utils/logger').Logger
		);
	});

	describe('generate', () => {
		it('should allow parallel generation requests', async () => {
			// Setup: Configure mocks for two parallel generations
			const mockPrompt = createMockPrompt();
			const mockImage = { mimeType: 'image/png', data: 'dGVzdA==' };

			vi.mocked(loadEnvFile).mockReturnValue({
				llmProvider: 'gemini',
				geminiApiKey: 'key',
				geminiModel: 'model',
			});
			vi.mocked(getPromptFiles).mockResolvedValue([mockPrompt]);
			vi.mocked(showPromptSelector).mockResolvedValue(mockPrompt);
			mockGenerateImage.mockResolvedValue(mockImage);
			mockApp.vault.getAbstractFileByPath.mockReturnValue({});
			mockApp.vault.createBinary.mockResolvedValue(undefined);

			// Start two generations in parallel
			const [result1, result2] = await Promise.all([
				service.generate('text1', 'note1'),
				service.generate('text2', 'note2'),
			]);

			// Both should succeed
			expect(result1).not.toBeNull();
			expect(result2).not.toBeNull();
			expect(result1?.imageLink).toContain('note1');
			expect(result2?.imageLink).toContain('note2');
		});

		it('should return null when user cancels prompt selection', async () => {
			vi.mocked(loadEnvFile).mockReturnValue({
				llmProvider: 'gemini',
				geminiApiKey: 'key',
				geminiModel: 'model',
			});
			vi.mocked(getPromptFiles).mockResolvedValue([createMockPrompt()]);
			// Simulate user cancellation
			vi.mocked(showPromptSelector).mockRejectedValue(new Error('cancelled'));

			const result = await service.generate('text', 'note');

			expect(result).toBeNull();
			expect(mockLogger.info).toHaveBeenCalledWith('User cancelled prompt selection');
		});

		it('should throw error when envFilePath is not configured', async () => {
			const settingsWithoutEnv: GenImageInserterSettings = {
				...validSettings,
				envFilePath: '',
			};
			service.updateSettings(settingsWithoutEnv);

			await expect(service.generate('text', 'note')).rejects.toThrow(
				'.env file path is not configured'
			);
		});

		it('should throw error when promptDirectory is not configured', async () => {
			const settingsWithoutPrompt: GenImageInserterSettings = {
				...validSettings,
				promptDirectory: '',
			};
			service.updateSettings(settingsWithoutPrompt);

			await expect(service.generate('text', 'note')).rejects.toThrow(
				'Prompt directory is not configured'
			);
		});

		it('should return object with imageLink and promptName on successful generation', async () => {
			const mockPrompt = createMockPrompt({
				name: 'test-prompt',
				aspectRatio: '16:9',
				imageSize: '2K',
			});
			const mockImage = {
				mimeType: 'image/png',
				data: 'SGVsbG8=', // base64 for "Hello"
			};

			vi.mocked(loadEnvFile).mockReturnValue({
				llmProvider: 'gemini',
				geminiApiKey: 'test-key',
				geminiModel: 'gemini-2.5-flash-image',
			});
			vi.mocked(getPromptFiles).mockResolvedValue([mockPrompt]);
			vi.mocked(showPromptSelector).mockResolvedValue(mockPrompt);
			mockGenerateImage.mockResolvedValue(mockImage);

			mockApp.vault.getAbstractFileByPath.mockReturnValue(null); // Folder doesn't exist
			mockApp.vault.createFolder.mockResolvedValue(undefined);
			mockApp.vault.createBinary.mockResolvedValue(undefined);

			const result = await service.generate('source text', 'MyNote');

			expect(result).not.toBeNull();
			expect(result?.imageLink).toContain('![](<');
			expect(result?.imageLink).toContain('MyNote');
			expect(result?.imageLink).toContain('.png');
			expect(result?.imageLink).toMatch(/^\n!\[\]\(<.+>\)\n$/);
			expect(result?.promptName).toBe('test-prompt');
			expect(mockLogger.info).toHaveBeenCalledWith('Image generation completed successfully');
		});

		it('should create output directory if it does not exist', async () => {
			const mockPrompt = createMockPrompt();
			const mockImage = { mimeType: 'image/png', data: 'dGVzdA==' };

			vi.mocked(loadEnvFile).mockReturnValue({
				llmProvider: 'gemini',
				geminiApiKey: 'key',
				geminiModel: 'model',
			});
			vi.mocked(getPromptFiles).mockResolvedValue([mockPrompt]);
			vi.mocked(showPromptSelector).mockResolvedValue(mockPrompt);
			mockGenerateImage.mockResolvedValue(mockImage);

			mockApp.vault.getAbstractFileByPath.mockReturnValue(null);
			mockApp.vault.createFolder.mockResolvedValue(undefined);
			mockApp.vault.createBinary.mockResolvedValue(undefined);

			await service.generate('text', 'TestNote');

			expect(mockApp.vault.createFolder).toHaveBeenCalledWith('assets/TestNote');
		});

		it('should not create output directory if it already exists', async () => {
			const mockPrompt = createMockPrompt();
			const mockImage = { mimeType: 'image/png', data: 'dGVzdA==' };

			vi.mocked(loadEnvFile).mockReturnValue({
				llmProvider: 'gemini',
				geminiApiKey: 'key',
				geminiModel: 'model',
			});
			vi.mocked(getPromptFiles).mockResolvedValue([mockPrompt]);
			vi.mocked(showPromptSelector).mockResolvedValue(mockPrompt);
			mockGenerateImage.mockResolvedValue(mockImage);

			mockApp.vault.getAbstractFileByPath.mockReturnValue({}); // Folder exists
			mockApp.vault.createBinary.mockResolvedValue(undefined);

			await service.generate('text', 'TestNote');

			expect(mockApp.vault.createFolder).not.toHaveBeenCalled();
		});

		it('should throw and show notice on API error', async () => {
			const mockPrompt = createMockPrompt();

			vi.mocked(loadEnvFile).mockReturnValue({
				llmProvider: 'gemini',
				geminiApiKey: 'key',
				geminiModel: 'model',
			});
			vi.mocked(getPromptFiles).mockResolvedValue([mockPrompt]);
			vi.mocked(showPromptSelector).mockResolvedValue(mockPrompt);
			mockGenerateImage.mockRejectedValue(new Error('API rate limit exceeded'));

			await expect(service.generate('text', 'note')).rejects.toThrow('API rate limit exceeded');
			expect(Notice).toHaveBeenCalledWith('Failed to generate image: API rate limit exceeded');
			expect(mockLogger.error).toHaveBeenCalledWith('Image generation failed', 'API rate limit exceeded');
		});

		it('should handle consecutive generation requests', async () => {
			const mockPrompt = createMockPrompt();
			const mockImage = { mimeType: 'image/png', data: 'dGVzdA==' };

			vi.mocked(loadEnvFile).mockReturnValue({
				llmProvider: 'gemini',
				geminiApiKey: 'key',
				geminiModel: 'model',
			});
			vi.mocked(getPromptFiles).mockResolvedValue([mockPrompt]);
			vi.mocked(showPromptSelector).mockResolvedValue(mockPrompt);
			mockGenerateImage.mockResolvedValue(mockImage);
			mockApp.vault.getAbstractFileByPath.mockReturnValue({});
			mockApp.vault.createBinary.mockResolvedValue(undefined);

			// First call should succeed
			const result1 = await service.generate('text', 'note1');
			expect(result1).not.toBeNull();

			// Second call should also work
			const result2 = await service.generate('text', 'note2');
			expect(result2).not.toBeNull();
		});

		it('should allow generation after error', async () => {
			const mockPrompt = createMockPrompt();

			vi.mocked(loadEnvFile).mockReturnValue({
				llmProvider: 'gemini',
				geminiApiKey: 'key',
				geminiModel: 'model',
			});
			vi.mocked(getPromptFiles).mockResolvedValue([mockPrompt]);
			vi.mocked(showPromptSelector).mockResolvedValue(mockPrompt);
			mockGenerateImage.mockRejectedValue(new Error('API error'));

			// First call should fail
			await expect(service.generate('text', 'note')).rejects.toThrow();

			// Reset mock for second call to succeed
			const mockImage = { mimeType: 'image/png', data: 'dGVzdA==' };
			mockGenerateImage.mockResolvedValue(mockImage);
			mockApp.vault.getAbstractFileByPath.mockReturnValue({});
			mockApp.vault.createBinary.mockResolvedValue(undefined);

			// Second call should work
			const result = await service.generate('text', 'note');
			expect(result).not.toBeNull();
		});
	});

	describe('updateSettings', () => {
		it('should update settings reference', async () => {
			const newSettings: GenImageInserterSettings = {
				envFilePath: '/new/path/.env',
				promptDirectory: 'new-prompts',
				imageOutputDirectory: 'new-assets',
				notificationDelaySeconds: 5,
			};

			service.updateSettings(newSettings);

			// Verify by trying to generate with empty envFilePath
			const emptySettings: GenImageInserterSettings = {
				...newSettings,
				envFilePath: '',
			};
			service.updateSettings(emptySettings);

			await expect(service.generate('text', 'note')).rejects.toThrow(
				'.env file path is not configured'
			);
		});
	});
});
