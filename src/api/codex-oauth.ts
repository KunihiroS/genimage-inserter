/**
 * Codex OAuth image-generation fallback client.
 */

import { EnvConfig, GeneratedImage, AspectRatio, ImageSize } from '../types';
import { Logger } from '../utils/logger';
import { requestUrl } from 'obsidian';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

interface CodexAuthFile {
	access_token?: string;
	account_id?: string;
	chatgpt_account_id?: string;
	tokens?: {
		access_token?: string;
		account_id?: string;
	};
	account?: {
		id?: string;
	};
}

interface CodexAuth {
	accessToken: string;
	accountId?: string;
	source: 'env' | 'auth-file';
}

interface CodexImageGenerationItem {
	type?: string;
	result?: string;
}

interface CodexSsePayload {
	type?: string;
	message?: string;
	error?: { message?: string };
	item?: CodexImageGenerationItem;
	response?: {
		error?: { message?: string };
		output?: CodexImageGenerationItem[];
	};
}

interface PngDimensions {
	width: number;
	height: number;
	actualSize: string;
	actualAspectRatio: string;
	orientation: 'landscape' | 'portrait' | 'square';
}

const CODEX_RESPONSES_URL = 'https://chatgpt.com/backend-api/codex/responses';
const CODEX_RESPONSES_MODEL = 'gpt-5.5';
const CODEX_IMAGE_MODEL = 'gpt-image-2';
const CODEX_IMAGE_SIZE = '2048x1152';
const CODEX_IMAGE_QUALITY = 'low';
const CODEX_IMAGE_FORMAT = 'png';

function greatestCommonDivisor(left: number, right: number): number {
	let a = Math.abs(left);
	let b = Math.abs(right);
	while (b !== 0) {
		const next = a % b;
		a = b;
		b = next;
	}
	return a || 1;
}

function describeOrientation(aspectRatio: AspectRatio): string {
	const [widthText, heightText] = aspectRatio.split(':');
	const width = Number(widthText ?? '1');
	const height = Number(heightText ?? '1');
	if (width > height) return `${aspectRatio} landscape / horizontal`;
	if (width < height) return `${aspectRatio} portrait / vertical`;
	return `${aspectRatio} square`;
}

function appendOrientationHint(userText: string, aspectRatio: AspectRatio): string {
	return [
		`Create a ${describeOrientation(aspectRatio)} image.`,
		userText,
	].join('\n\n');
}

function resolveHomePath(filePath: string): string {
	return filePath.startsWith('~')
		? path.join(os.homedir() || process.env.USERPROFILE || process.env.HOME || '', filePath.slice(1))
		: filePath;
}

function readCodexAuthFile(filePath: string, fallbackAccountId?: string): CodexAuth | null {
	const resolvedPath = resolveHomePath(filePath);
	if (!fs.existsSync(resolvedPath)) return null;

	const raw = fs.readFileSync(resolvedPath, 'utf-8');
	const parsed = JSON.parse(raw) as CodexAuthFile;
	const accessToken = parsed.tokens?.access_token ?? parsed.access_token;
	if (!accessToken) return null;

	return {
		accessToken,
		accountId: parsed.tokens?.account_id ?? parsed.account_id ?? parsed.chatgpt_account_id ?? parsed.account?.id ?? fallbackAccountId,
		source: 'auth-file',
	};
}

function resolveCodexAuth(config: EnvConfig): CodexAuth | null {
	if (config.codexAccessToken) {
		return {
			accessToken: config.codexAccessToken,
			accountId: config.codexAccountId,
			source: 'env',
		};
	}

	if (!config.codexAuthFilePath && !config.codexFallbackEnabled) {
		throw new Error('Codex OAuth fallback is not enabled. Set CODEX_FALLBACK_ENABLED=true, CODEX_AUTH_FILE_PATH, or CODEX_ACCESS_TOKEN.');
	}

	return readCodexAuthFile(config.codexAuthFilePath ?? '~/.codex/auth.json', config.codexAccountId);
}

function parsePngDimensions(b64: string): PngDimensions {
	let bytes: Buffer;
	try {
		bytes = Buffer.from(b64, 'base64');
	} catch (error) {
		throw new Error(`Generated image is not valid base64: ${error instanceof Error ? error.message : String(error)}`);
	}

	if (bytes.length < 24 || !bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
		throw new Error('Generated image is not a PNG');
	}

	if (bytes.toString('ascii', 12, 16) !== 'IHDR') {
		throw new Error('Generated PNG is missing IHDR dimensions');
	}

	const width = bytes.readUInt32BE(16);
	const height = bytes.readUInt32BE(20);
	const divisor = greatestCommonDivisor(width, height);
	return {
		width,
		height,
		actualSize: `${width}x${height}`,
		actualAspectRatio: `${width / divisor}:${height / divisor}`,
		orientation: width > height ? 'landscape' : width < height ? 'portrait' : 'square',
	};
}

function parseCodexImageResult(sseText: string): string {
	for (const line of sseText.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed.startsWith('data:')) continue;

		const raw = trimmed.slice('data:'.length).trim();
		if (!raw || raw === '[DONE]') continue;

		let payload: CodexSsePayload;
		try {
			payload = JSON.parse(raw) as CodexSsePayload;
		} catch {
			continue;
		}

		if (payload.type === 'response.failed' || payload.type === 'response.incomplete' || payload.type === 'error') {
			const message = payload.error?.message ?? payload.response?.error?.message ?? payload.message ?? 'unknown streamed error';
			throw new Error(`Codex image generation failed: ${message}`);
		}

		if (payload.item?.type === 'image_generation_call' && payload.item.result) {
			return payload.item.result;
		}

		const output = payload.response?.output;
		if (Array.isArray(output)) {
			for (const item of output) {
				if (item.type === 'image_generation_call' && item.result) {
					return item.result;
				}
			}
		}
	}

	throw new Error('No image was generated by Codex OAuth fallback.');
}

export class CodexOAuthImageClient {
	constructor(
		private config: EnvConfig,
		private logger: Logger,
		private timeoutMs: number
	) {}

	async generateImage(
		systemPrompt: string,
		userText: string,
		aspectRatio: AspectRatio,
		imageSize: ImageSize
	): Promise<GeneratedImage> {
		const auth = resolveCodexAuth(this.config);
		if (!auth) {
			throw new Error('Codex OAuth auth is not configured. Run codex login or set CODEX_ACCESS_TOKEN.');
		}

		this.logger.debug('Codex OAuth fallback uses fixed request settings and aspect ratio prompt steering', {
			aspectRatio,
			imageSize,
			size: CODEX_IMAGE_SIZE,
			quality: CODEX_IMAGE_QUALITY,
			format: CODEX_IMAGE_FORMAT,
		});

		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			'Accept': 'text/event-stream',
			'Authorization': `Bearer ${auth.accessToken}`,
		};
		if (auth.accountId) {
			headers['ChatGPT-Account-ID'] = auth.accountId;
		}

		const body = {
			model: CODEX_RESPONSES_MODEL,
			instructions: systemPrompt,
			input: [{
				role: 'user',
				content: [{ type: 'input_text', text: appendOrientationHint(userText, aspectRatio) }],
			}],
			tools: [{
				type: 'image_generation',
				model: CODEX_IMAGE_MODEL,
				size: CODEX_IMAGE_SIZE,
				quality: CODEX_IMAGE_QUALITY,
				output_format: CODEX_IMAGE_FORMAT,
			}],
			tool_choice: { type: 'image_generation' },
			stream: true,
			store: false,
		};

		const timeoutPromise = new Promise<never>((_, reject) =>
			setTimeout(
				() => reject(new Error(`Request timed out after ${this.timeoutMs / 1000} seconds`)),
				this.timeoutMs
			)
		);

		const response = await Promise.race([
			requestUrl({
				url: CODEX_RESPONSES_URL,
				method: 'POST',
				headers,
				body: JSON.stringify(body),
				throw: false,
			}),
			timeoutPromise,
		]);

		if (response.status >= 400) {
			this.logger.error('Codex OAuth API HTTP error', {
				status: response.status,
				bodyLength: response.text?.length ?? 0,
			});
			if (response.status === 401 && auth.source === 'auth-file') {
				throw new Error('Codex OAuth auth-file token may be expired. Run `codex login` or set CODEX_ACCESS_TOKEN with a fresh token.');
			}
			throw new Error(`Codex OAuth API error: HTTP ${response.status}`);
		}

		const data = parseCodexImageResult(response.text ?? '');
		const dimensions = parsePngDimensions(data);
		const dimensionLog = {
			requestedSize: CODEX_IMAGE_SIZE,
			actualSize: dimensions.actualSize,
			width: dimensions.width,
			height: dimensions.height,
			actualAspectRatio: dimensions.actualAspectRatio,
			orientation: dimensions.orientation,
		};
		this.logger.info('Codex OAuth fallback generated PNG dimensions', dimensionLog);
		if (dimensions.actualSize !== CODEX_IMAGE_SIZE) {
			this.logger.warn('Codex OAuth fallback returned PNG dimensions different from requested size', dimensionLog);
		}
		return { data, mimeType: 'image/png' };
	}
}
