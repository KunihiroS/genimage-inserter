/**
 * Tests for env-loader module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import { loadEnvFile } from './env-loader';

// Mock fs module
vi.mock('fs');

describe('loadEnvFile', () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('should throw error when envFilePath is empty', () => {
		expect(() => loadEnvFile('')).toThrow('.env file path is not configured');
	});

	it('should throw error when file does not exist', () => {
		vi.mocked(fs.existsSync).mockReturnValue(false);

		expect(() => loadEnvFile('/path/to/.env')).toThrow('.env file not found');
	});

	it('should throw error when GEMINI_API_KEY is missing', () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue('GEMINI_MODEL=test-model');

		expect(() => loadEnvFile('/path/to/.env')).toThrow('GEMINI_API_KEY is not set');
	});

	it('should throw error when GEMINI_MODEL is missing', () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue('GEMINI_API_KEY=test-key');

		expect(() => loadEnvFile('/path/to/.env')).toThrow('GEMINI_MODEL is not set');
	});

	it('should parse valid .env file correctly', () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue(`
LLM_PROVIDER=gemini
GEMINI_API_KEY=my-secret-key
GEMINI_MODEL=gemini-2.5-flash-image
`);

		const result = loadEnvFile('/path/to/.env');

		expect(result).toEqual({
			llmProvider: 'gemini',
			geminiApiKey: 'my-secret-key',
			geminiModel: 'gemini-2.5-flash-image',
		});
	});

	it('should handle quoted values', () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue(`
GEMINI_API_KEY="my-secret-key"
GEMINI_MODEL='gemini-model'
`);

		const result = loadEnvFile('/path/to/.env');

		expect(result.geminiApiKey).toBe('my-secret-key');
		expect(result.geminiModel).toBe('gemini-model');
	});

	it('should ignore comments and empty lines', () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue(`
# This is a comment
GEMINI_API_KEY=key

# Another comment
GEMINI_MODEL=model
`);

		const result = loadEnvFile('/path/to/.env');

		expect(result.geminiApiKey).toBe('key');
		expect(result.geminiModel).toBe('model');
	});

	it('should handle inline comments', () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue(`
GEMINI_API_KEY=key # this is inline comment
GEMINI_MODEL=model
`);

		const result = loadEnvFile('/path/to/.env');

		expect(result.geminiApiKey).toBe('key');
	});

	it('should use default LLM_PROVIDER when not specified', () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue(`
GEMINI_API_KEY=key
GEMINI_MODEL=model
`);

		const result = loadEnvFile('/path/to/.env');

		expect(result.llmProvider).toBe('gemini');
	});

	it('should expand ~ to home directory', () => {
		const originalHome = process.env.HOME;
		process.env.HOME = '/home/testuser';

		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue(`
GEMINI_API_KEY=key
GEMINI_MODEL=model
`);

		loadEnvFile('~/.env');

		expect(fs.existsSync).toHaveBeenCalledWith('/home/testuser/.env');

		process.env.HOME = originalHome;
	});

	it('should populate OpenAI defaults when only OPENAI_API_KEY is set', () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue(`
GEMINI_API_KEY=gk
GEMINI_MODEL=gm
OPENAI_API_KEY=sk-openai-test
`);

		const result = loadEnvFile('/path/to/.env');

		expect(result.openaiApiKey).toBe('sk-openai-test');
		expect(result.openaiModel).toBe('gpt-image-2');
		expect(result.openaiBaseUrl).toBe('https://api.openai.com/v1');
	});

	it('should pass through explicit OPENAI_MODEL and OPENAI_BASE_URL and strip trailing slashes', () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue(`
GEMINI_API_KEY=gk
GEMINI_MODEL=gm
OPENAI_API_KEY=sk-openai-test
OPENAI_MODEL=gpt-image-custom
OPENAI_BASE_URL=https://proxy.example.com/v1/
`);

		const result = loadEnvFile('/path/to/.env');

		expect(result.openaiApiKey).toBe('sk-openai-test');
		expect(result.openaiModel).toBe('gpt-image-custom');
		expect(result.openaiBaseUrl).toBe('https://proxy.example.com/v1');
	});

	it('should leave OpenAI fields undefined when OPENAI_API_KEY is absent', () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue(`
GEMINI_API_KEY=gk
GEMINI_MODEL=gm
`);

		const result = loadEnvFile('/path/to/.env');

		expect(result.openaiApiKey).toBeUndefined();
		expect(result.openaiModel).toBeUndefined();
		expect(result.openaiBaseUrl).toBeUndefined();
	});

	it('should leave OpenAI fields undefined when only OPENAI_MODEL and OPENAI_BASE_URL are set (no key)', () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue(`
GEMINI_API_KEY=gk
GEMINI_MODEL=gm
OPENAI_MODEL=gpt-image-custom
OPENAI_BASE_URL=https://proxy.example.com/v1
`);

		const result = loadEnvFile('/path/to/.env');

		expect(result.openaiApiKey).toBeUndefined();
		expect(result.openaiModel).toBeUndefined();
		expect(result.openaiBaseUrl).toBeUndefined();
	});
});
