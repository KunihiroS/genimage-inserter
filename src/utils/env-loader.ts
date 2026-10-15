/**
 * Environment file loader for reading .env files outside the vault
 */

import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_CODEX_RESPONSES_MODEL, EnvConfig } from '../types';

/**
 * Load and parse .env file from the filesystem
 * @param envFilePath Absolute path to the .env file
 * @returns Parsed environment configuration
 * @throws Error if file cannot be read or required keys are missing
 */
export function loadEnvFile(envFilePath: string): EnvConfig {
	if (!envFilePath) {
		throw new Error('.env file path is not configured');
	}

	// Resolve path (handle ~ for home directory)
	const resolvedPath = envFilePath.startsWith('~')
		? path.join(process.env.HOME || '', envFilePath.slice(1))
		: envFilePath;

	if (!fs.existsSync(resolvedPath)) {
		throw new Error(`.env file not found: ${resolvedPath}`);
	}

	const content = fs.readFileSync(resolvedPath, 'utf-8');
	const env = parseEnvContent(content);

	// Validate required keys
	const geminiApiKey = env['GEMINI_API_KEY'];
	if (!geminiApiKey) {
		throw new Error('GEMINI_API_KEY is not set in .env file');
	}

	const geminiModel = env['GEMINI_MODEL'];
	if (!geminiModel) {
		throw new Error('GEMINI_MODEL is not set in .env file');
	}

	const config: EnvConfig = {
		llmProvider: env['LLM_PROVIDER'] || 'gemini',
		geminiApiKey,
		geminiModel,
		codexResponsesModel: env['CODEX_RESPONSES_MODEL']?.trim() || DEFAULT_CODEX_RESPONSES_MODEL,
	};

	const openaiApiKey = env['OPENAI_API_KEY'];
	if (openaiApiKey) {
		config.openaiApiKey = openaiApiKey;
		config.openaiModel = env['OPENAI_MODEL'] || 'gpt-image-2';
		config.openaiBaseUrl = (env['OPENAI_BASE_URL'] || 'https://api.openai.com/v1').replace(/\/+$/, '');
	}

	const codexAccessToken = env['CODEX_ACCESS_TOKEN'];
	if (codexAccessToken) {
		config.codexAccessToken = codexAccessToken;
	}

	const codexAccountId = env['CODEX_ACCOUNT_ID'];
	if (codexAccountId) {
		config.codexAccountId = codexAccountId;
	}

	const codexAuthFilePath = env['CODEX_AUTH_FILE_PATH'];
	if (codexAuthFilePath) {
		config.codexAuthFilePath = codexAuthFilePath;
	}

	if (env['CODEX_FALLBACK_ENABLED']?.toLowerCase() === 'true') {
		config.codexFallbackEnabled = true;
	}

	return config;
}

/**
 * Parse .env file content into key-value pairs
 * @param content Raw .env file content
 * @returns Object with parsed key-value pairs
 */
function parseEnvContent(content: string): Record<string, string> {
	const result: Record<string, string> = {};

	const lines = content.split('\n');
	for (const line of lines) {
		// Skip empty lines and comments
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) {
			continue;
		}

		// Find the first = sign
		const eqIndex = trimmed.indexOf('=');
		if (eqIndex === -1) {
			continue;
		}

		const key = trimmed.slice(0, eqIndex).trim();
		let value = trimmed.slice(eqIndex + 1).trim();

		// Match quoted values together with an optional trailing comment.
		// A hash inside the quotes is part of the value, not a comment.
		const quotedValue = value.match(/^(['"])(.*?)\1(?:\s*#.*)?$/);
		if (quotedValue) {
			value = quotedValue[2] ?? '';
		} else {
			const commentIndex = value.indexOf(' #');
			if (commentIndex !== -1) {
				value = value.slice(0, commentIndex).trim();
			}
		}

		result[key] = value;
	}

	return result;
}
