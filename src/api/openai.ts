/**
 * OpenAI Images API client used as a fallback when Gemini generation fails.
 */

import { requestUrl } from 'obsidian';
import { EnvConfig, GeneratedImage, AspectRatio, ImageSize } from '../types';
import { Logger } from '../utils/logger';
import { ImageGenerationError, remoteGenerationError, withGenerationTimeout, generationErrorPayload } from './generation-error';

interface OpenAIImagesResponse {
	data?: { b64_json?: string }[];
	error?: { message?: string; code?: string | number };
}

type OpenAISize = string;

const ASPECT_RATIO_TO_OPENAI_SIZE: Partial<Record<AspectRatio, OpenAISize>> = {
	'1:1': '1024x1024',
	'16:9': '1536x864',
	'4:3': '1408x1056',
	'3:2': '1536x1024',
	'5:4': '1280x1024',
	'21:9': '2016x864',
	'9:16': '864x1536',
	'2:3': '1024x1536',
	'3:4': '1056x1408',
	'4:5': '1024x1280',
};

function mapAspectRatioToSize(aspectRatio: AspectRatio, logger: Logger): OpenAISize {
	const mapped = ASPECT_RATIO_TO_OPENAI_SIZE[aspectRatio];
	if (mapped) return mapped;
	logger.warn('Unsupported aspect ratio for OpenAI, defaulting to 1024x1024', { aspectRatio });
	return '1024x1024';
}

export class OpenAIClient {
	private config: EnvConfig;
	private logger: Logger;
	private timeoutMs: number;

	constructor(config: EnvConfig, logger: Logger, timeoutMs: number) {
		this.config = config;
		this.logger = logger;
		this.timeoutMs = timeoutMs;
	}

	async generateImage(
		systemPrompt: string,
		userText: string,
		aspectRatio: AspectRatio,
		imageSize: ImageSize
	): Promise<GeneratedImage> {
		const baseUrl = (this.config.openaiBaseUrl ?? 'https://api.openai.com/v1').replace(/\/+$/, '');
		const url = `${baseUrl}/images/generations`;
		const apiKey = this.config.openaiApiKey ?? '';
		if (!apiKey.trim()) throw new ImageGenerationError({ category: 'auth_missing', stage: 'auth' });
		const model = this.config.openaiModel ?? 'gpt-image-2.6-sunburst';
		if (model !== 'gpt-image-2.6-sunburst' && model !== 'gpt-image-2') {
			throw new ImageGenerationError({ category: 'unsupported_model', stage: 'request' });
		}

		const size = mapAspectRatioToSize(aspectRatio, this.logger);
		this.logger.debug('OpenAI ignores imageSize parameter (no equivalent in gpt-image API)', { imageSize });

		const prompt = `${systemPrompt}\n\n---\n\n${userText}`;
		const body = {
			model,
			prompt,
			size,
			n: 1,
		};

		const response = await withGenerationTimeout(() => requestUrl({
			url,
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${apiKey}`,
			},
			body: JSON.stringify(body),
			throw: false,
		}), this.timeoutMs);

		if (response.status >= 400) {
			const payload = generationErrorPayload(response);
			const failure = remoteGenerationError(payload, response.status);
			this.logger.error('OpenAI API HTTP error', failure.details);
			throw failure;
		}

		try {
			const json = response.json as OpenAIImagesResponse;
			if (json.error) throw remoteGenerationError(json);
			const b64 = json.data?.[0]?.b64_json;
			if (!b64) throw new ImageGenerationError({ category: 'no_image', stage: 'image' });
			if (typeof b64 !== 'string') throw new ImageGenerationError({ category: 'invalid_image', stage: 'image' });
			return { data: b64, mimeType: 'image/png' };
		} catch (error) {
			if (error instanceof ImageGenerationError) throw error;
			throw new ImageGenerationError({ category: 'unknown', stage: 'response' });
		}
	}
}
