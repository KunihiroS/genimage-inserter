/**
 * Shared type definitions for genimage-inserter plugin
 */

/** Valid aspect ratio values for Gemini image generation */
export type AspectRatio = '1:1' | '2:3' | '3:2' | '3:4' | '4:3' | '4:5' | '5:4' | '9:16' | '16:9' | '21:9';

/** Valid image size values for Gemini image generation */
export type ImageSize = '1K' | '2K' | '4K';

/** Configuration loaded from .env file */
export interface EnvConfig {
	llmProvider: string;
	geminiApiKey: string;
	geminiModel: string;
}

/** Parsed prompt file with frontmatter and content */
export interface PromptFile {
	/** File name without extension */
	name: string;
	/** Full path to the file */
	path: string;
	/** Aspect ratio from frontmatter (default: 1:1) */
	aspectRatio: AspectRatio;
	/** Image size from frontmatter (default: 1K) */
	imageSize: ImageSize;
	/** Prompt content (without frontmatter) */
	content: string;
}

/** Result from Gemini image generation API */
export interface GeneratedImage {
	/** Base64 encoded image data */
	data: string;
	/** MIME type (e.g., image/png, image/jpeg) */
	mimeType: string;
}

/** Context for image generation request */
export interface GenerationContext {
	/** Text to generate image from */
	sourceText: string;
	/** Note file name (without extension) */
	noteName: string;
	/** Full path to the note file */
	notePath: string;
	/** Selected prompt file */
	prompt: PromptFile;
}

/** Valid aspect ratios for validation */
export const VALID_ASPECT_RATIOS: AspectRatio[] = [
	'1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'
];

/** Valid image sizes for validation */
export const VALID_IMAGE_SIZES: ImageSize[] = ['1K', '2K', '4K'];

/** Default values */
export const DEFAULTS = {
	aspectRatio: '1:1' as AspectRatio,
	imageSize: '1K' as ImageSize,
};
