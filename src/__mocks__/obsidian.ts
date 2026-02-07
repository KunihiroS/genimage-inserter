/**
 * Mock implementation of obsidian module for testing
 */

import { vi } from 'vitest';

// Mock requestUrl function
export const requestUrl = vi.fn();

// Mock Notice class
export class Notice {
	constructor(public message: string, public duration?: number) {}
}

// Mock Modal class
export class Modal {
	app: App;
	contentEl: HTMLElement;

	constructor(app: App) {
		this.app = app;
		this.contentEl = {
			createEl: vi.fn().mockReturnValue({
				createEl: vi.fn().mockReturnValue({
					addEventListener: vi.fn(),
				}),
				addClass: vi.fn(),
				setText: vi.fn(),
			}),
			empty: vi.fn(),
			addClass: vi.fn(),
		} as unknown as HTMLElement;
	}

	open() {}
	close() {}
	onOpen() {}
	onClose() {}
}

// Mock App class
export class App {
	vault: Vault;
	workspace: Workspace;

	constructor() {
		this.vault = new Vault();
		this.workspace = new Workspace();
	}
}

// Mock Vault class
export class Vault {
	adapter: DataAdapter;

	constructor() {
		this.adapter = new DataAdapter();
	}

	async read(file: TFile): Promise<string> {
		return '';
	}

	async create(path: string, data: string | ArrayBuffer): Promise<TFile> {
		return new TFile();
	}

	async createBinary(path: string, data: ArrayBuffer): Promise<TFile> {
		return new TFile();
	}

	async modify(file: TFile, data: string): Promise<void> {}

	getAbstractFileByPath(path: string): TAbstractFile | null {
		return null;
	}

	async createFolder(path: string): Promise<void> {}
}

// Mock DataAdapter class
export class DataAdapter {
	async exists(path: string): Promise<boolean> {
		return false;
	}

	async read(path: string): Promise<string> {
		return '';
	}

	async write(path: string, data: string): Promise<void> {}

	getBasePath(): string {
		return '/mock/vault';
	}
}

// Mock Workspace class
export class Workspace {
	getActiveViewOfType<T>(type: new (...args: any[]) => T): T | null {
		return null;
	}
}

// Mock TFile class
export class TFile {
	path: string = '';
	name: string = '';
	basename: string = '';
	extension: string = '';
	parent: TFolder | null = null;
}

// Mock TFolder class
export class TFolder {
	path: string = '';
	name: string = '';
	children: TAbstractFile[] = [];
	parent: TFolder | null = null;
	isRoot(): boolean {
		return false;
	}
}

// Mock TAbstractFile class
export class TAbstractFile {
	path: string = '';
	name: string = '';
	parent: TFolder | null = null;
}

// Mock MarkdownView class
export class MarkdownView {
	editor: Editor;
	file: TFile | null = null;

	constructor() {
		this.editor = new Editor();
	}
}

// Mock Editor class
export class Editor {
	getValue(): string {
		return '';
	}

	setValue(value: string): void {}

	getCursor(): EditorPosition {
		return { line: 0, ch: 0 };
	}

	setCursor(pos: EditorPosition): void {}

	getLine(line: number): string {
		return '';
	}

	replaceRange(replacement: string, from: EditorPosition, to?: EditorPosition): void {}
}

// Mock EditorPosition interface
export interface EditorPosition {
	line: number;
	ch: number;
}

// Mock Plugin class
export class Plugin {
	app: App;
	manifest: PluginManifest;

	constructor(app: App, manifest: PluginManifest) {
		this.app = app;
		this.manifest = manifest;
	}

	async loadData(): Promise<any> {
		return {};
	}

	async saveData(data: any): Promise<void> {}

	addCommand(command: Command): Command {
		return command;
	}

	addSettingTab(settingTab: PluginSettingTab): void {}

	registerEvent(eventRef: EventRef): void {}

	registerDomEvent(el: Document | Element | Window, type: string, callback: (...args: any[]) => any): void {}
}

// Mock PluginManifest interface
export interface PluginManifest {
	id: string;
	name: string;
	version: string;
	minAppVersion: string;
	description: string;
	author: string;
	authorUrl?: string;
	isDesktopOnly?: boolean;
}

// Mock Command interface
export interface Command {
	id: string;
	name: string;
	callback?: () => void;
	checkCallback?: (checking: boolean) => boolean | void;
	editorCallback?: (editor: Editor, view: MarkdownView) => void;
}

// Mock PluginSettingTab class
export class PluginSettingTab {
	app: App;
	plugin: Plugin;
	containerEl: HTMLElement;

	constructor(app: App, plugin: Plugin) {
		this.app = app;
		this.plugin = plugin;
		this.containerEl = document.createElement('div');
	}

	display(): void {}
	hide(): void {}
}

// Mock Setting class
export class Setting {
	settingEl: HTMLElement;
	infoEl: HTMLElement;
	nameEl: HTMLElement;
	descEl: HTMLElement;
	controlEl: HTMLElement;

	constructor(containerEl: HTMLElement) {
		this.settingEl = document.createElement('div');
		this.infoEl = document.createElement('div');
		this.nameEl = document.createElement('div');
		this.descEl = document.createElement('div');
		this.controlEl = document.createElement('div');
	}

	setName(name: string): this {
		return this;
	}

	setDesc(desc: string): this {
		return this;
	}

	addText(cb: (text: TextComponent) => void): this {
		cb(new TextComponent(document.createElement('input')));
		return this;
	}

	addTextArea(cb: (text: TextAreaComponent) => void): this {
		cb(new TextAreaComponent(document.createElement('textarea')));
		return this;
	}

	addToggle(cb: (toggle: ToggleComponent) => void): this {
		cb(new ToggleComponent(document.createElement('div')));
		return this;
	}

	addDropdown(cb: (dropdown: DropdownComponent) => void): this {
		cb(new DropdownComponent(document.createElement('select')));
		return this;
	}

	addButton(cb: (button: ButtonComponent) => void): this {
		cb(new ButtonComponent(document.createElement('button')));
		return this;
	}
}

// Mock TextComponent class
export class TextComponent {
	inputEl: HTMLInputElement;

	constructor(containerEl: HTMLElement) {
		this.inputEl = document.createElement('input');
	}

	setValue(value: string): this {
		return this;
	}

	setPlaceholder(placeholder: string): this {
		return this;
	}

	onChange(callback: (value: string) => void): this {
		return this;
	}
}

// Mock TextAreaComponent class
export class TextAreaComponent {
	inputEl: HTMLTextAreaElement;

	constructor(containerEl: HTMLElement) {
		this.inputEl = document.createElement('textarea');
	}

	setValue(value: string): this {
		return this;
	}

	setPlaceholder(placeholder: string): this {
		return this;
	}

	onChange(callback: (value: string) => void): this {
		return this;
	}
}

// Mock ToggleComponent class
export class ToggleComponent {
	toggleEl: HTMLElement;

	constructor(containerEl: HTMLElement) {
		this.toggleEl = document.createElement('div');
	}

	setValue(value: boolean): this {
		return this;
	}

	onChange(callback: (value: boolean) => void): this {
		return this;
	}
}

// Mock DropdownComponent class
export class DropdownComponent {
	selectEl: HTMLSelectElement;

	constructor(containerEl: HTMLElement) {
		this.selectEl = document.createElement('select');
	}

	setValue(value: string): this {
		return this;
	}

	addOption(value: string, display: string): this {
		return this;
	}

	addOptions(options: Record<string, string>): this {
		return this;
	}

	onChange(callback: (value: string) => void): this {
		return this;
	}
}

// Mock ButtonComponent class
export class ButtonComponent {
	buttonEl: HTMLButtonElement;

	constructor(containerEl: HTMLElement) {
		this.buttonEl = document.createElement('button');
	}

	setButtonText(name: string): this {
		return this;
	}

	setCta(): this {
		return this;
	}

	setWarning(): this {
		return this;
	}

	onClick(callback: () => void): this {
		return this;
	}
}

// Mock EventRef interface
export interface EventRef {}

// Mock Menu class
export class Menu {
	addItem(cb: (item: MenuItem) => void): this {
		cb(new MenuItem());
		return this;
	}

	showAtMouseEvent(event: MouseEvent): void {}
}

// Mock MenuItem class
export class MenuItem {
	setTitle(title: string): this {
		return this;
	}

	setIcon(icon: string): this {
		return this;
	}

	onClick(callback: () => void): this {
		return this;
	}
}

// Utility functions
export function normalizePath(path: string): string {
	return path.replace(/\\/g, '/').replace(/\/+/g, '/');
}

// Export everything
export default {
	requestUrl,
	Notice,
	Modal,
	App,
	Vault,
	DataAdapter,
	Workspace,
	TFile,
	TFolder,
	TAbstractFile,
	MarkdownView,
	Editor,
	Plugin,
	PluginSettingTab,
	Setting,
	TextComponent,
	TextAreaComponent,
	ToggleComponent,
	DropdownComponent,
	ButtonComponent,
	Menu,
	MenuItem,
	normalizePath,
};
