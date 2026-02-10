import { App, PluginSettingTab, Setting } from 'obsidian';
import GenImageInserterPlugin from './main';

export interface GenImageInserterSettings {
	/** Path to .env file (must be outside Vault) */
	envFilePath: string;
	/** Directory containing prompt .md files (inside Vault) */
	promptDirectory: string;
	/** Directory to save generated images (inside Vault) */
	imageOutputDirectory: string;
	/** Seconds before showing "Generating..." notification (0 = immediate) */
	notificationDelaySeconds: number;
}

export const DEFAULT_SETTINGS: GenImageInserterSettings = {
	envFilePath: '',
	promptDirectory: '',
	imageOutputDirectory: '',
	notificationDelaySeconds: 3,
};

export class GenImageInserterSettingTab extends PluginSettingTab {
	plugin: GenImageInserterPlugin;

	constructor(app: App, plugin: GenImageInserterPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('GenImage Inserter settings')
			.setHeading();

		new Setting(containerEl)
			.setName('Environment file path')
			.setDesc('Path to .env file containing API keys (must be outside vault). Supports ~ for home directory.')
			.addText(text => text
				.setPlaceholder('/path/to/.env')
				.setValue(this.plugin.settings.envFilePath)
				.onChange(async (value) => {
					this.plugin.settings.envFilePath = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Prompt directory')
			.setDesc('Directory containing prompt .md files (relative to vault root)')
			.addText(text => text
				.setPlaceholder('prompts/genimage')
				.setValue(this.plugin.settings.promptDirectory)
				.onChange(async (value) => {
					this.plugin.settings.promptDirectory = value.trim().replace(/^\/+|\/+$/g, '');
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Image output directory')
			.setDesc('Base directory for generated images (relative to vault root). Images are saved to {this directory}/{note name}/. Leave empty to save directly under {note name}/ in vault root')
			.addText(text => text
				.setPlaceholder('assets/generated (empty = vault root)')
				.setValue(this.plugin.settings.imageOutputDirectory)
				.onChange(async (value) => {
					this.plugin.settings.imageOutputDirectory = value.trim();
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Notification delay (seconds)')
			.setDesc('Seconds to wait before showing "Generating..." notification (0 = immediate)')
			.addText(text => text
				.setPlaceholder('3')
				.setValue(String(this.plugin.settings.notificationDelaySeconds))
				.onChange(async (value) => {
					const num = parseInt(value, 10);
					this.plugin.settings.notificationDelaySeconds = isNaN(num) ? 3 : num;
					await this.plugin.saveSettings();
				}));
	}
}
