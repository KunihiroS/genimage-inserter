/**
 * Prompt file parser with YAML frontmatter support
 */

import { App, TFile, TFolder } from 'obsidian';
import {
	PromptFile,
	AspectRatio,
	ImageSize,
	VALID_ASPECT_RATIOS,
	VALID_IMAGE_SIZES,
	DEFAULTS
} from '../types';

/** YAML frontmatter regex pattern */
const FRONTMATTER_REGEX = /^---\s*\n([\s\S]*?)\n---\s*\n?/;

/**
 * Get all prompt files from the specified directory
 * @param app Obsidian App instance
 * @param promptDirectory Directory path relative to vault root
 * @returns Array of parsed prompt files
 */
export async function getPromptFiles(app: App, promptDirectory: string): Promise<PromptFile[]> {
	if (!promptDirectory) {
		throw new Error('Prompt directory is not configured');
	}

	const folder = app.vault.getAbstractFileByPath(promptDirectory);
	if (!folder || !(folder instanceof TFolder)) {
		throw new Error(`Prompt directory not found: ${promptDirectory}`);
	}

	const promptFiles: PromptFile[] = [];

	for (const file of folder.children) {
		if (file instanceof TFile && file.extension === 'md') {
			const content = await app.vault.read(file);
			const parsed = parsePromptFile(file.basename, file.path, content);
			promptFiles.push(parsed);
		}
	}

	if (promptFiles.length === 0) {
		throw new Error(`No prompt files found in: ${promptDirectory}`);
	}

	// Sort by name
	promptFiles.sort((a, b) => a.name.localeCompare(b.name));

	return promptFiles;
}

/**
 * Parse a single prompt file content
 * @param name File name without extension
 * @param filePath Full path to the file
 * @param content Raw file content
 * @returns Parsed prompt file
 */
export function parsePromptFile(name: string, filePath: string, content: string): PromptFile {
	let aspectRatio: AspectRatio = DEFAULTS.aspectRatio;
	let imageSize: ImageSize = DEFAULTS.imageSize;
	let promptContent = content;

	// Try to extract frontmatter
	const frontmatterMatch = content.match(FRONTMATTER_REGEX);
	if (frontmatterMatch && frontmatterMatch[1]) {
		const frontmatterStr = frontmatterMatch[1];
		const frontmatter = parseSimpleYaml(frontmatterStr);

		// Extract aspect_ratio
		if (frontmatter['aspect_ratio']) {
			const ar = frontmatter['aspect_ratio'];
			if (isValidAspectRatio(ar)) {
				aspectRatio = ar;
			} else {
				console.warn(`Invalid aspect_ratio "${ar}" in ${name}, using default`);
			}
		}

		// Extract image_size
		if (frontmatter['image_size']) {
			const is = frontmatter['image_size'];
			if (isValidImageSize(is)) {
				imageSize = is;
			} else {
				console.warn(`Invalid image_size "${is}" in ${name}, using default`);
			}
		}

		// Remove frontmatter from content
		promptContent = content.slice(frontmatterMatch[0].length).trim();
	}

	return {
		name,
		path: filePath,
		aspectRatio,
		imageSize,
		content: promptContent,
	};
}

/**
 * Simple YAML parser for frontmatter (handles basic key: value pairs)
 * @param yaml YAML string
 * @returns Parsed key-value pairs
 */
function parseSimpleYaml(yaml: string): Record<string, string> {
	const result: Record<string, string> = {};

	const lines = yaml.split('\n');
	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) {
			continue;
		}

		const colonIndex = trimmed.indexOf(':');
		if (colonIndex === -1) {
			continue;
		}

		const key = trimmed.slice(0, colonIndex).trim();
		let value = trimmed.slice(colonIndex + 1).trim();

		// Remove surrounding quotes if present
		if ((value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))) {
			value = value.slice(1, -1);
		}

		result[key] = value;
	}

	return result;
}

/**
 * Validate aspect ratio value
 */
function isValidAspectRatio(value: string): value is AspectRatio {
	return VALID_ASPECT_RATIOS.includes(value as AspectRatio);
}

/**
 * Validate image size value
 */
function isValidImageSize(value: string): value is ImageSize {
	return VALID_IMAGE_SIZES.includes(value as ImageSize);
}
