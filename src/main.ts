import { Editor, MarkdownView, Plugin } from 'obsidian';
import { DEFAULT_SETTINGS, GenImageInserterSettings, GenImageInserterSettingTab } from './settings';
import { Logger } from './utils/logger';
import { ImageGeneratorService } from './services/image-generator';

export default class GenImageInserterPlugin extends Plugin {
	settings: GenImageInserterSettings;
	private logger: Logger;
	private imageGenerator: ImageGeneratorService;

	async onload() {
		await this.loadSettings();

		// Initialize logger
		this.logger = new Logger(this.app);
		this.logger.info('GenImage Inserter plugin loading...');

		// Initialize image generator service
		this.imageGenerator = new ImageGeneratorService(this.app, this.settings, this.logger);

		// Add settings tab
		this.addSettingTab(new GenImageInserterSettingTab(this.app, this));

		// Register editor command
		this.addCommand({
			id: 'generate-image',
			name: 'Generate image from text',
			editorCallback: this.handleGenerateImage.bind(this)
		});

		// Register context menu
		this.registerEvent(
			this.app.workspace.on('editor-menu', (menu, editor, view) => {
				if (!(view instanceof MarkdownView)) return;
				const mdView = view;
				menu.addItem((item) => {
					item
						.setTitle('Generate image')
						.setIcon('image')
						.onClick(() => {
							this.handleGenerateImage(editor, mdView);
						});
				});
			})
		);

		this.logger.info('GenImage Inserter plugin loaded successfully');
	}

	onunload() {
		this.logger?.info('GenImage Inserter plugin unloaded');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<GenImageInserterSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
		// Update service with new settings
		if (this.imageGenerator) {
			this.imageGenerator.updateSettings(this.settings);
		}
	}

	/**
	 * Handle generate image command/menu action
	 */
	private handleGenerateImage(editor: Editor, view: MarkdownView): void {
		// Get selected text or entire document
		const selectedText = editor.getSelection();
		const sourceText = selectedText || editor.getValue();

		if (!sourceText.trim()) {
			this.logger.warn('No text to generate image from');
			return;
		}

		// Get note name
		const file = view.file;
		const noteName = file ? file.basename : 'untitled';

		// Capture insert position NOW (before async operation)
		const hasSelection = !!selectedText;
		let insertPosition: { line: number; ch: number };

		if (hasSelection) {
			// Capture selection end position at the time of command invocation
			insertPosition = editor.getCursor('to');
		} else {
			// Capture end of document position
			const lastLine = editor.lastLine();
			const lastLineLength = editor.getLine(lastLine).length;
			insertPosition = { line: lastLine, ch: lastLineLength };
		}

		// Generate image
		void this.imageGenerator.generate(sourceText, noteName, (imageLink: string) => {
			// Insert at the captured position (not current cursor)
			editor.replaceRange(imageLink, insertPosition);
		});
	}
}
