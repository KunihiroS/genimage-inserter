import { Editor, MarkdownView, Plugin, TFile } from 'obsidian';
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

		// Get note file (required for marker-based insertion)
		const file = view.file;
		if (!file) {
			this.logger.warn('No file associated with view');
			return;
		}
		const noteName = file.basename;

		// Generate unique marker for this generation
		const marker = `<!-- genimage-pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)} -->`;

		// Capture insert position and insert marker NOW (before async operation)
		const hasSelection = !!selectedText;
		let insertPosition: { line: number; ch: number };

		if (hasSelection) {
			// Insert marker at selection end
			insertPosition = editor.getCursor('to');
		} else {
			// Insert marker at end of document
			const lastLine = editor.lastLine();
			const lastLineLength = editor.getLine(lastLine).length;
			insertPosition = { line: lastLine, ch: lastLineLength };
		}

		// Insert marker at the captured position
		editor.replaceRange(marker, insertPosition);
		this.logger.debug(`Marker inserted: ${marker}`);

		// Start async generation (marker will be replaced on completion)
		void this.executeGeneration(file, marker, sourceText, noteName);
	}

	/**
	 * Execute image generation and replace marker with result
	 * Uses Vault.process() to ensure correct file is updated even if user switches notes
	 */
	private async executeGeneration(
		file: TFile,
		marker: string,
		sourceText: string,
		noteName: string
	): Promise<void> {
		let replacementText = '';  // Empty string = marker removal on failure

		try {
			// Generate image and get the markdown link
			const imageLink = await this.imageGenerator.generate(sourceText, noteName);
			if (imageLink) {
				replacementText = imageLink;
			}
		} catch (error) {
			// Error already handled in service with Notice
			const message = error instanceof Error ? error.message : 'Unknown error';
			this.logger.error('Generation failed in executeGeneration', message);
		} finally {
			// Always replace marker (with image link on success, empty string on failure)
			try {
				await this.app.vault.process(file, (content) => {
					if (content.includes(marker)) {
						this.logger.debug(`Replacing marker with: ${replacementText ? 'image link' : 'empty (removal)'}`);
						return content.replace(marker, replacementText);
					}
					// Marker not found (user may have deleted it)
					this.logger.warn('Marker not found in file, skipping insertion');
					return content;
				});
			} catch (err) {
				// File may have been deleted or renamed
				const message = err instanceof Error ? err.message : 'Unknown error';
				this.logger.warn('Could not update file (may have been deleted or renamed)', message);
			}
		}
	}
}
