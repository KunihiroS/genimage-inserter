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
			codexResponsesModel: 'gpt-6.1-sol',
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

	it.each([
		['missing', ''],
		['empty', 'CODEX_RESPONSES_MODEL='],
		['whitespace', 'CODEX_RESPONSES_MODEL="   "'],
	])('should default the Codex Responses model when %s', (_name, setting) => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue(`GEMINI_API_KEY=gk
GEMINI_MODEL=gm
${setting}`);

		expect(loadEnvFile('/test/model.env')).toMatchObject({ codexResponsesModel: 'gpt-6.1-sol' });
	});


	it.each([
		['"future-model" # override', 'future-model'],
		["'future-model' # override", 'future-model'],
		['"future-model"#override', 'future-model'],
		['"" # use default', 'gpt-6.1-sol'],
		['"   " # use default', 'gpt-6.1-sol'],
		['"future # literal" # override', 'future # literal'],
		["'future # literal' # override", 'future # literal'],
	])('should normalize quoted Responses setting %s without including its trailing comment', (value, expected) => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue(`GEMINI_API_KEY=gk\nGEMINI_MODEL=gm\nCODEX_RESPONSES_MODEL=${value}`);

		expect(loadEnvFile('/test/model.env').codexResponsesModel).toBe(expected);
	});

	it('should preserve quoted provider values and hashes while excluding their trailing comments', () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue(`
GEMINI_API_KEY="fixture # literal" # key comment
GEMINI_MODEL="gemini-custom" # primary
OPENAI_API_KEY=test-openai-key
OPENAI_MODEL='gpt-image-2' # fallback
`);

		expect(loadEnvFile('/test/model.env')).toMatchObject({
			geminiApiKey: 'fixture # literal', geminiModel: 'gemini-custom', openaiModel: 'gpt-image-2',
		});
	});

	it('should trim the Codex Responses model independently of other provider models', () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue(`
GEMINI_API_KEY=gk
GEMINI_MODEL=gemini-custom
OPENAI_API_KEY=test-openai-key
OPENAI_MODEL=gpt-image-2
CODEX_RESPONSES_MODEL="  future-responses-model  "
`);

		expect(loadEnvFile('/test/model.env')).toMatchObject({
			geminiModel: 'gemini-custom',
			openaiModel: 'gpt-image-2',
			codexResponsesModel: 'future-responses-model',
		});
	});

	it('should reread the Codex model without enabling OAuth when only the model is configured', () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync)
			.mockReturnValueOnce('GEMINI_API_KEY=gk\nGEMINI_MODEL=gm\nCODEX_RESPONSES_MODEL=first-model')
			.mockReturnValueOnce('GEMINI_API_KEY=gk\nGEMINI_MODEL=gm\nCODEX_RESPONSES_MODEL=second-model');

		expect(loadEnvFile('/test/model.env')).toMatchObject({ codexResponsesModel: 'first-model' });
		const reloaded = loadEnvFile('/test/model.env');
		expect(reloaded).toMatchObject({ codexResponsesModel: 'second-model' });
		expect(reloaded.codexFallbackEnabled).toBeUndefined();
		expect(reloaded.codexAccessToken).toBeUndefined();
		expect(reloaded.codexAuthFilePath).toBeUndefined();
	});

	it('should parse optional Codex OAuth fallback settings', () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue(`
GEMINI_API_KEY=gk
GEMINI_MODEL=gm
CODEX_ACCESS_TOKEN=codex-token
CODEX_ACCOUNT_ID=acct-123
CODEX_AUTH_FILE_PATH=/tmp/codex-auth.json
CODEX_FALLBACK_ENABLED=true
`);

		const result = loadEnvFile('/path/to/.env');

		expect(result.codexAccessToken).toBe('codex-token');
		expect(result.codexAccountId).toBe('acct-123');
		expect(result.codexAuthFilePath).toBe('/tmp/codex-auth.json');
		expect(result.codexFallbackEnabled).toBe(true);
	});
});
