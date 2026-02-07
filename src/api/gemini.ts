/**
 * Gemini API client for image generation
 */

import { requestUrl } from 'obsidian';
import { EnvConfig, GeneratedImage, AspectRatio, ImageSize } from '../types';
import { Logger } from '../utils/logger';

/** Gemini API endpoint */
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Request payload for Gemini generateContent API */
interface GeminiRequest {
	contents: {
		parts: { text: string }[];
	}[];
	generationConfig: {
		responseModalities: string[];
		imageConfig?: {
			aspectRatio?: string;
			imageSize?: string;
		};
	};
}

/** Models that support full imageConfig (aspectRatio + imageSize) */
const MODELS_WITH_FULL_IMAGE_CONFIG = [
	'gemini-3-pro-image-preview',
	'gemini-3-pro-image',
];

/** Models that support aspectRatio only (no imageSize) */
const MODELS_WITH_ASPECT_RATIO_ONLY = [
	'gemini-2.5-flash-image',
];

/** Response structure from Gemini API */
interface GeminiResponse {
	candidates?: {
		content?: {
			parts?: {
				text?: string;
				inlineData?: {
					mimeType: string;
					data: string;
				};
			}[];
		};
	}[];
	error?: {
		code: number;
		message: string;
		status: string;
	};
}

export class GeminiClient {
	private config: EnvConfig;
	private logger: Logger;

	constructor(config: EnvConfig, logger: Logger) {
		this.config = config;
		this.logger = logger;
	}

	/**
	 * Generate an image from the given prompt
	 * @param systemPrompt System prompt from the prompt file
	 * @param userText User's selected text
	 * @param aspectRatio Aspect ratio for the generated image
	 * @param imageSize Size/quality of the generated image
	 * @returns Generated image data
	 */
	async generateImage(
		systemPrompt: string,
		userText: string,
		aspectRatio: AspectRatio,
		imageSize: ImageSize
	): Promise<GeneratedImage> {
		const model = this.config.geminiModel;
		const url = `${GEMINI_API_BASE}/${model}:generateContent`;

		// Combine system prompt with user text
		const fullPrompt = `${systemPrompt}\n\n---\n\n${userText}`;

		// Check model capabilities for imageConfig
		const supportsFullImageConfig = MODELS_WITH_FULL_IMAGE_CONFIG.some(m => model.includes(m));
		const supportsAspectRatioOnly = MODELS_WITH_ASPECT_RATIO_ONLY.some(m => model.includes(m));

		// Build imageConfig based on model capabilities
		let imageConfig: { aspectRatio?: string; imageSize?: string } | undefined;
		if (supportsFullImageConfig) {
			imageConfig = {
				aspectRatio: aspectRatio,
				imageSize: imageSize,
			};
		} else if (supportsAspectRatioOnly) {
			// gemini-2.5-flash-image only supports aspectRatio, not imageSize
			imageConfig = {
				aspectRatio: aspectRatio,
			};
		}

		const requestBody: GeminiRequest = {
			contents: [{
				parts: [{ text: fullPrompt }]
			}],
			generationConfig: {
				responseModalities: ['TEXT', 'IMAGE'],
				...(imageConfig && { imageConfig })
			}
		};

		this.logger.info('Sending request to Gemini API', {
			model,
			aspectRatio: imageConfig?.aspectRatio ?? 'N/A (not supported)',
			imageSize: imageConfig?.imageSize ?? 'N/A (not supported)',
			promptLength: fullPrompt.length,
			supportsFullImageConfig,
			supportsAspectRatioOnly,
		});

		try {
			const response = await requestUrl({
				url: url,
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-goog-api-key': this.config.geminiApiKey,
				},
				body: JSON.stringify(requestBody),
			});

			const data = response.json as GeminiResponse;

			// Check for API error
			if (data.error) {
				this.logger.error('Gemini API error', {
					code: data.error.code,
					status: data.error.status,
					message: data.error.message
				});
				throw new Error(`Gemini API error: ${data.error.message}`);
			}

			// Extract image from response
			const image = this.extractImageFromResponse(data);
			if (!image) {
				this.logger.error('No image in Gemini response');
				throw new Error('No image was generated. The API may have returned text only.');
			}

			this.logger.info('Image generated successfully', {
				mimeType: image.mimeType,
				dataLength: image.data.length
			});

			return image;

		} catch (error) {
			if (error instanceof Error) {
				this.logger.error('Failed to generate image', error.message);
				throw error;
			}
			throw new Error('Unknown error occurred during image generation');
		}
	}

	/**
	 * Extract image data from Gemini API response
	 */
	private extractImageFromResponse(response: GeminiResponse): GeneratedImage | null {
		const candidates = response.candidates;
		if (!candidates || candidates.length === 0) {
			return null;
		}

		const firstCandidate = candidates[0];
		if (!firstCandidate || !firstCandidate.content) {
			return null;
		}

		const parts = firstCandidate.content.parts;
		if (!parts) {
			return null;
		}

		// Find the first part with inline image data
		for (const part of parts) {
			if (part.inlineData) {
				return {
					data: part.inlineData.data,
					mimeType: part.inlineData.mimeType,
				};
			}
		}

		return null;
	}
}
