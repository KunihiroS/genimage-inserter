/**
 * Environment file loader for reading .env files outside the vault
 */

import * as fs from 'fs';
import * as path from 'path';
import { EnvConfig } from '../types';

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

	return {
		llmProvider: env['LLM_PROVIDER'] || 'gemini',
		geminiApiKey,
		geminiModel,
	};
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

		// Remove surrounding quotes if present
		if ((value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))) {
			value = value.slice(1, -1);
		}

		// Remove inline comments (but not if inside quotes - simplified handling)
		const commentIndex = value.indexOf(' #');
		if (commentIndex !== -1) {
			value = value.slice(0, commentIndex).trim();
		}

		result[key] = value;
	}

	return result;
}
