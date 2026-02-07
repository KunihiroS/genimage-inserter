/**
 * Tests for types module
 */

import { describe, it, expect } from 'vitest';
import {
	VALID_ASPECT_RATIOS,
	VALID_IMAGE_SIZES,
	DEFAULTS,
	AspectRatio,
	ImageSize,
} from './types';

describe('types', () => {
	describe('VALID_ASPECT_RATIOS', () => {
		it('should contain all expected aspect ratios', () => {
			const expected = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];

			expect(VALID_ASPECT_RATIOS).toEqual(expected);
		});

		it('should have 10 valid aspect ratios', () => {
			expect(VALID_ASPECT_RATIOS.length).toBe(10);
		});
	});

	describe('VALID_IMAGE_SIZES', () => {
		it('should contain all expected image sizes', () => {
			const expected = ['1K', '2K', '4K'];

			expect(VALID_IMAGE_SIZES).toEqual(expected);
		});

		it('should have 3 valid image sizes', () => {
			expect(VALID_IMAGE_SIZES.length).toBe(3);
		});
	});

	describe('DEFAULTS', () => {
		it('should have correct default aspect ratio', () => {
			expect(DEFAULTS.aspectRatio).toBe('1:1');
		});

		it('should have correct default image size', () => {
			expect(DEFAULTS.imageSize).toBe('1K');
		});

		it('default aspectRatio should be in VALID_ASPECT_RATIOS', () => {
			expect(VALID_ASPECT_RATIOS).toContain(DEFAULTS.aspectRatio);
		});

		it('default imageSize should be in VALID_IMAGE_SIZES', () => {
			expect(VALID_IMAGE_SIZES).toContain(DEFAULTS.imageSize);
		});
	});

	describe('type safety', () => {
		it('AspectRatio type should accept valid values', () => {
			const validRatios: AspectRatio[] = ['1:1', '16:9', '9:16'];
			expect(validRatios.every(r => VALID_ASPECT_RATIOS.includes(r))).toBe(true);
		});

		it('ImageSize type should accept valid values', () => {
			const validSizes: ImageSize[] = ['1K', '2K', '4K'];
			expect(validSizes.every(s => VALID_IMAGE_SIZES.includes(s))).toBe(true);
		});
	});
});
