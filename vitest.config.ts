import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
	test: {
		globals: true,
		environment: 'node',
		include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'html'],
			include: ['src/**/*.ts'],
			exclude: ['src/**/*.test.ts', 'src/main.ts'],
		},
	},
	resolve: {
		alias: {
			// Mock obsidian module for testing
			obsidian: resolve(__dirname, 'src/__mocks__/obsidian.ts'),
		},
	},
});
