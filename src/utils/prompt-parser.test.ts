/**
 * Tests for prompt-parser module
 */

import { describe, it, expect } from 'vitest';
import { parsePromptFile } from './prompt-parser';

describe('parsePromptFile', () => {
	describe('frontmatter parsing', () => {
		it('should parse file without frontmatter using defaults', () => {
			const content = 'This is a simple prompt without frontmatter.';

			const result = parsePromptFile('simple', 'prompts/simple.md', content);

			expect(result).toEqual({
				name: 'simple',
				path: 'prompts/simple.md',
				aspectRatio: '1:1',
				imageSize: '1K',
				content: 'This is a simple prompt without frontmatter.',
			});
		});

		it('should parse frontmatter with aspect_ratio', () => {
			const content = `---
aspect_ratio: "16:9"
---
Prompt content here.`;

			const result = parsePromptFile('wide', 'prompts/wide.md', content);

			expect(result.aspectRatio).toBe('16:9');
			expect(result.imageSize).toBe('1K'); // default
			expect(result.content).toBe('Prompt content here.');
		});

		it('should parse frontmatter with image_size', () => {
			const content = `---
image_size: "4K"
---
High quality prompt.`;

			const result = parsePromptFile('hq', 'prompts/hq.md', content);

			expect(result.aspectRatio).toBe('1:1'); // default
			expect(result.imageSize).toBe('4K');
		});

		it('should parse frontmatter with both parameters', () => {
			const content = `---
aspect_ratio: "9:16"
image_size: "2K"
---
Portrait prompt.`;

			const result = parsePromptFile('portrait', 'prompts/portrait.md', content);

			expect(result.aspectRatio).toBe('9:16');
			expect(result.imageSize).toBe('2K');
			expect(result.content).toBe('Portrait prompt.');
		});

		it('should handle single-quoted values', () => {
			const content = `---
aspect_ratio: '3:2'
image_size: '2K'
---
Content.`;

			const result = parsePromptFile('test', 'test.md', content);

			expect(result.aspectRatio).toBe('3:2');
			expect(result.imageSize).toBe('2K');
		});

		it('should handle unquoted values', () => {
			const content = `---
aspect_ratio: 4:3
image_size: 1K
---
Content.`;

			const result = parsePromptFile('test', 'test.md', content);

			expect(result.aspectRatio).toBe('4:3');
			expect(result.imageSize).toBe('1K');
		});
	});

	describe('invalid values', () => {
		it('should use default for invalid aspect_ratio', () => {
			const content = `---
aspect_ratio: "invalid"
---
Content.`;

			const result = parsePromptFile('test', 'test.md', content);

			expect(result.aspectRatio).toBe('1:1'); // default
		});

		it('should use default for invalid image_size', () => {
			const content = `---
image_size: "8K"
---
Content.`;

			const result = parsePromptFile('test', 'test.md', content);

			expect(result.imageSize).toBe('1K'); // default
		});
	});

	describe('all valid aspect ratios', () => {
		const validAspectRatios = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];

		validAspectRatios.forEach((ratio) => {
			it(`should accept aspect_ratio: ${ratio}`, () => {
				const content = `---
aspect_ratio: "${ratio}"
---
Content.`;

				const result = parsePromptFile('test', 'test.md', content);

				expect(result.aspectRatio).toBe(ratio);
			});
		});
	});

	describe('all valid image sizes', () => {
		const validSizes = ['1K', '2K', '4K'];

		validSizes.forEach((size) => {
			it(`should accept image_size: ${size}`, () => {
				const content = `---
image_size: "${size}"
---
Content.`;

				const result = parsePromptFile('test', 'test.md', content);

				expect(result.imageSize).toBe(size);
			});
		});
	});

	describe('content extraction', () => {
		it('should remove frontmatter from content', () => {
			const content = `---
aspect_ratio: "1:1"
---
Line 1
Line 2
Line 3`;

			const result = parsePromptFile('test', 'test.md', content);

			expect(result.content).toBe('Line 1\nLine 2\nLine 3');
		});

		it('should preserve multiline content', () => {
			const content = `---
aspect_ratio: "1:1"
---
First paragraph.

Second paragraph.

Third paragraph.`;

			const result = parsePromptFile('test', 'test.md', content);

			expect(result.content).toContain('First paragraph.');
			expect(result.content).toContain('Second paragraph.');
			expect(result.content).toContain('Third paragraph.');
		});

		it('should handle frontmatter with extra whitespace', () => {
			const content = `---
aspect_ratio:   "16:9"  
image_size:  "2K"
---

Content after blank line.`;

			const result = parsePromptFile('test', 'test.md', content);

			expect(result.aspectRatio).toBe('16:9');
			expect(result.imageSize).toBe('2K');
			expect(result.content).toBe('Content after blank line.');
		});
	});
});
