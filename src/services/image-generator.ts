/**
 * Image generation service - orchestrates the entire generation flow
 */

import { App, Notice, TFile } from 'obsidian';
import { GenImageInserterSettings } from '../settings';
import { PromptFile, GeneratedImage, EnvConfig } from '../types';
import { Logger } from '../utils/logger';
import { loadEnvFile } from '../utils/env-loader';
import { getPromptFiles } from '../utils/prompt-parser';
import { GeminiClient } from '../api/gemini';
import { showPromptSelector } from '../ui/prompt-selector-modal';

/**
 * Get file extension from MIME type
 */
function getExtensionFromMimeType(mimeType: string): string {
	const mimeToExt: Record<string, string> = {
		'image/png': '.png',
		'image/jpeg': '.jpg',
		'image/jpg': '.jpg',
		'image/webp': '.webp',
		'image/gif': '.gif',
	};
	return mimeToExt[mimeType] || '.png';
}

/**
 * Generate timestamp string for filename
 */
function generateTimestamp(): string {
	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, '0');
	const day = String(now.getDate()).padStart(2, '0');
	const hour = String(now.getHours()).padStart(2, '0');
	const minute = String(now.getMinutes()).padStart(2, '0');
	const second = String(now.getSeconds()).padStart(2, '0');
	return `${year}${month}${day}${hour}${minute}${second}`;
}

/**
 * Sanitize filename by removing invalid characters
 */
function sanitizeFilename(name: string): string {
	return name.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_');
}

export class ImageGeneratorService {
	private app: App;
	private settings: GenImageInserterSettings;
	private logger: Logger;
	private isGenerating: boolean = false;

	constructor(app: App, settings: GenImageInserterSettings, logger: Logger) {
		this.app = app;
		this.settings = settings;
		this.logger = logger;
	}

	/**
	 * Update settings reference (called when settings change)
	 */
	updateSettings(settings: GenImageInserterSettings): void {
		this.settings = settings;
	}

	/**
	 * Main entry point for image generation
	 * @param sourceText Text to generate image from
	 * @param noteName Note name (without extension)
	 * @param insertCallback Callback to insert the image link into the editor
	 */
	async generate(
		sourceText: string,
		noteName: string,
		insertCallback: (imageLink: string) => void
	): Promise<void> {
		// Check if already generating
		if (this.isGenerating) {
			new Notice('Image generation is already in progress');
			this.logger.warn('Generation rejected: already in progress');
			return;
		}

		this.isGenerating = true;
		let notificationTimeout: ReturnType<typeof setTimeout> | null = null;
		let loadingNotice: Notice | null = null;

		try {
			// Validate settings
			this.validateSettings();

			// Load env config
			const envConfig = loadEnvFile(this.settings.envFilePath);
			this.logger.info('Env config loaded successfully');

			// Get prompt files
			const promptFiles = await getPromptFiles(this.app, this.settings.promptDirectory);
			this.logger.info(`Found ${promptFiles.length} prompt files`);

			// Show prompt selector
			let selectedPrompt: PromptFile;
			try {
				selectedPrompt = await showPromptSelector(this.app, promptFiles);
			} catch {
				// User cancelled
				this.logger.info('User cancelled prompt selection');
				return;
			}

			this.logger.info(`Selected prompt: ${selectedPrompt.name}`);

			// Start loading notification with delay
			const delayMs = this.settings.notificationDelaySeconds * 1000;
			if (delayMs === 0) {
				loadingNotice = new Notice('Generating image...', 0);
			} else {
				notificationTimeout = setTimeout(() => {
					loadingNotice = new Notice('Generating image...', 0);
				}, delayMs);
			}

			// Generate image
			const image = await this.generateImage(envConfig, selectedPrompt, sourceText);

			// Save image to vault
			const imagePath = await this.saveImage(image, noteName);
			this.logger.info(`Image saved to: ${imagePath}`);

			// Create markdown link and insert
			const imageLink = `\n![](${imagePath})\n`;
			insertCallback(imageLink);

			// Success notification
			new Notice('Image generated successfully!');
			this.logger.info('Image generation completed successfully');

		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			this.logger.error('Image generation failed', message);
			new Notice(`Failed to generate image: ${message}`);
		} finally {
			this.isGenerating = false;

			// Clear loading notification
			if (notificationTimeout) {
				clearTimeout(notificationTimeout);
			}
			if (loadingNotice) {
				loadingNotice.hide();
			}
		}
	}

	/**
	 * Validate required settings
	 */
	private validateSettings(): void {
		if (!this.settings.envFilePath) {
			throw new Error('.env file path is not configured. Please check plugin settings.');
		}
		if (!this.settings.promptDirectory) {
			throw new Error('Prompt directory is not configured. Please check plugin settings.');
		}
		if (!this.settings.imageOutputDirectory) {
			throw new Error('Image output directory is not configured. Please check plugin settings.');
		}
	}

	/**
	 * Generate image using Gemini API
	 */
	private async generateImage(
		envConfig: EnvConfig,
		prompt: PromptFile,
		sourceText: string
	): Promise<GeneratedImage> {
		const client = new GeminiClient(envConfig, this.logger);
		return client.generateImage(
			prompt.content,
			sourceText,
			prompt.aspectRatio,
			prompt.imageSize
		);
	}

	/**
	 * Save generated image to vault
	 * @returns Path to saved image (relative to vault root)
	 */
	private async saveImage(image: GeneratedImage, noteName: string): Promise<string> {
		// Create output directory path
		const sanitizedNoteName = sanitizeFilename(noteName);
		const outputDir = `${this.settings.imageOutputDirectory}/${sanitizedNoteName}`;

		// Ensure directory exists
		const folder = this.app.vault.getAbstractFileByPath(outputDir);
		if (!folder) {
			await this.app.vault.createFolder(outputDir);
			this.logger.info(`Created output directory: ${outputDir}`);
		}

		// Generate filename
		const timestamp = generateTimestamp();
		const ext = getExtensionFromMimeType(image.mimeType);
		const filename = `${timestamp}_${sanitizedNoteName}${ext}`;
		const filePath = `${outputDir}/${filename}`;

		// Convert base64 to binary
		const binaryString = atob(image.data);
		const bytes = new Uint8Array(binaryString.length);
		for (let i = 0; i < binaryString.length; i++) {
			bytes[i] = binaryString.charCodeAt(i);
		}

		// Save file
		await this.app.vault.createBinary(filePath, bytes.buffer);

		return filePath;
	}
}
