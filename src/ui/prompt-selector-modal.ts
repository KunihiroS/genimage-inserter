/**
 * Modal for selecting a prompt file
 */

import { App, Modal, Setting } from 'obsidian';
import { PromptFile } from '../types';

export class PromptSelectorModal extends Modal {
	private promptFiles: PromptFile[];
	private onSelect: (promptFile: PromptFile) => void;
	private onCancel: () => void;

	constructor(
		app: App,
		promptFiles: PromptFile[],
		onSelect: (promptFile: PromptFile) => void,
		onCancel: () => void
	) {
		super(app);
		this.promptFiles = promptFiles;
		this.onSelect = onSelect;
		this.onCancel = onCancel;
	}

	onOpen() {
		const { contentEl } = this;

		contentEl.empty();
		contentEl.addClass('genimage-prompt-selector');

		// Title
		contentEl.createEl('h2', { text: 'Select a prompt style' });

		// Description
		contentEl.createEl('p', {
			text: 'Choose a prompt template for image generation:',
			cls: 'genimage-prompt-description'
		});

		// Prompt list container
		const listContainer = contentEl.createDiv({ cls: 'genimage-prompt-list' });

		// Create a button for each prompt file
		for (const promptFile of this.promptFiles) {
			const itemContainer = listContainer.createDiv({ cls: 'genimage-prompt-item' });

			new Setting(itemContainer)
				.setName(promptFile.name)
				.setDesc(`${promptFile.aspectRatio} | ${promptFile.imageSize}`)
				.addButton(button => {
					button
						.setButtonText('Select')
						.setCta()
						.onClick(() => {
							this.close();
							this.onSelect(promptFile);
						});
				});
		}

		// Cancel button at the bottom
		const footerEl = contentEl.createDiv({ cls: 'genimage-prompt-footer' });
		new Setting(footerEl)
			.addButton(button => {
				button
					.setButtonText('Cancel')
					.onClick(() => {
						this.close();
						this.onCancel();
					});
			});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

/**
 * Show prompt selector modal and return selected prompt
 * @param app Obsidian App instance
 * @param promptFiles Available prompt files
 * @returns Promise that resolves with selected prompt file, or rejects if cancelled
 */
export function showPromptSelector(
	app: App,
	promptFiles: PromptFile[]
): Promise<PromptFile> {
	return new Promise((resolve, reject) => {
		const modal = new PromptSelectorModal(
			app,
			promptFiles,
			(selected) => resolve(selected),
			() => reject(new Error('Prompt selection cancelled'))
		);
		modal.open();
	});
}
