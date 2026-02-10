/**
 * Logger for genimage-inserter plugin
 * Logs to {configDir}/plugins/genimage-inserter/genimage-inserter.log
 */

import * as fs from 'fs';
import * as path from 'path';
import { App } from 'obsidian';

export class Logger {
	private logFilePath: string;
	private enabled: boolean = true;

	constructor(app: App) {
		// Get vault path
		const vaultPath = (app.vault.adapter as { basePath?: string }).basePath;
		if (!vaultPath) {
			console.warn('Could not determine vault path for logging');
			this.logFilePath = '';
			this.enabled = false;
			return;
		}

		// Set log file path using vault's configDir (not hardcoded .obsidian)
		const configDir = app.vault.configDir;
		this.logFilePath = path.join(
			vaultPath,
			configDir,
			'plugins',
			'genimage-inserter',
			'genimage-inserter.log'
		);

		// Ensure directory exists
		const logDir = path.dirname(this.logFilePath);
		if (!fs.existsSync(logDir)) {
			fs.mkdirSync(logDir, { recursive: true });
		}
	}

	/**
	 * Log an info message
	 */
	info(message: string, ...args: unknown[]): void {
		this.log('INFO', message, ...args);
	}

	/**
	 * Log a warning message
	 */
	warn(message: string, ...args: unknown[]): void {
		this.log('WARN', message, ...args);
	}

	/**
	 * Log an error message
	 */
	error(message: string, ...args: unknown[]): void {
		this.log('ERROR', message, ...args);
	}

	/**
	 * Log a debug message
	 */
	debug(message: string, ...args: unknown[]): void {
		this.log('DEBUG', message, ...args);
	}

	/**
	 * Internal log method
	 */
	private log(level: string, message: string, ...args: unknown[]): void {
		const timestamp = new Date().toISOString();
		
		// Format additional arguments
		let formattedArgs = '';
		if (args.length > 0) {
			formattedArgs = ' ' + args.map((arg: unknown): string => {
				if (arg === null) {
					return 'null';
				}
				if (arg === undefined) {
					return 'undefined';
				}
				if (typeof arg === 'object') {
					try {
						return JSON.stringify(arg);
					} catch {
						return '[object]';
					}
				}
				return String(arg);
			}).join(' ');
		}

		const logLine = `[${timestamp}] [${level}] ${message}${formattedArgs}\n`;

		// Always log to console (stringify objects for proper display)
		const stringifiedArgs = args.map((arg: unknown): unknown => {
			if (arg !== null && typeof arg === 'object') {
				try {
					return JSON.stringify(arg);
				} catch {
					return '[object]';
				}
			}
			return arg;
		});
		
		if (level === 'ERROR') {
			console.error(`[genimage-inserter] ${message}`, ...stringifiedArgs);
		} else if (level === 'WARN') {
			console.warn(`[genimage-inserter] ${message}`, ...stringifiedArgs);
		} else {
			// Use console.debug for INFO and DEBUG (console.log is not allowed)
			console.debug(`[genimage-inserter] ${message}`, ...stringifiedArgs);
		}

		// Write to file if enabled
		if (this.enabled && this.logFilePath) {
			try {
				fs.appendFileSync(this.logFilePath, logLine);
			} catch (err) {
				console.error('Failed to write to log file:', err);
			}
		}
	}

	/**
	 * Sanitize sensitive data (like API keys) from log messages
	 */
	sanitize(text: string): string {
		// Mask anything that looks like an API key
		return text.replace(/([A-Za-z0-9_-]{20,})/g, (match) => {
			if (match.length > 8) {
				return match.slice(0, 4) + '****' + match.slice(-4);
			}
			return '****';
		});
	}
}
