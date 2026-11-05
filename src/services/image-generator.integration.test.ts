/** Real clients and env loader; only I/O and prompt selection are mocked. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App, RequestUrlParam, RequestUrlResponse } from 'obsidian';
import { Notice, requestUrl } from 'obsidian';
import * as fs from 'fs';
import { ImageGeneratorService } from './image-generator';
import { getPromptFiles } from '../utils/prompt-parser';
import { showPromptSelector } from '../ui/prompt-selector-modal';
import { Logger } from '../utils/logger';
import type { PromptFile } from '../types';

vi.mock('fs');
vi.mock('obsidian', () => ({ Notice: vi.fn(), requestUrl: vi.fn() }));
vi.mock('../utils/prompt-parser', () => ({ getPromptFiles: vi.fn() }));
vi.mock('../ui/prompt-selector-modal', () => ({ showPromptSelector: vi.fn() }));

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a32kAAAAASUVORK5CYII=';

function response(status: number, json: unknown = {}, text = ''): RequestUrlResponse {
	return { status, json, text } as RequestUrlResponse;
}

function requestAt(index: number): RequestUrlParam {
	const call = vi.mocked(requestUrl).mock.calls[index];
	if (!call) throw new Error(`Missing request ${index}`);
	return call[0] as RequestUrlParam;
}

function envContent(modelSetting = ''): string {
	return `GEMINI_API_KEY=fixture-gemini-key
GEMINI_MODEL=gemini-3-pro-image
OPENAI_API_KEY=fixture-openai-key
CODEX_ACCESS_TOKEN=fixture-codex-token
${modelSetting}`;
}

describe('Sunburst fallback integration', () => {
	const prompt: PromptFile = {
		name: 'illustration', path: 'prompts/illustration.md', content: 'Draw a landscape',
		aspectRatio: '16:9', imageSize: '2K',
	};
	let service: ImageGeneratorService;
	let createBinary: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.resetAllMocks();
		vi.useFakeTimers();
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue(envContent());
		vi.mocked(getPromptFiles).mockResolvedValue([prompt]);
		vi.mocked(showPromptSelector).mockResolvedValue(prompt);
		createBinary = vi.fn().mockResolvedValue(undefined);
		const app = { vault: { getAbstractFileByPath: vi.fn().mockReturnValue({}), createBinary } };
		const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
		service = new ImageGeneratorService(app as unknown as App, {
			envFilePath: '/fixture/model.env', promptDirectory: 'prompts', imageOutputDirectory: 'assets',
			notificationDelaySeconds: 0, requestTimeoutSeconds: 180,
		}, logger as unknown as Logger);
	});

	afterEach(() => {
		vi.clearAllTimers();
		vi.useRealTimers();
	});

	function expectSavedPng(imageLink: string | undefined): void {
		expect(createBinary).toHaveBeenCalledTimes(1);
		const call = createBinary.mock.calls[0]!;
		const savedPath = call[0] as string;
		expect(savedPath).toMatch(/^assets\/test-note\/.+_test-note\.png$/);
		expect(Buffer.from(call[1] as ArrayBuffer)).toEqual(Buffer.from(png, 'base64'));
		expect(imageLink).toBe(`\n![](<${savedPath}>)\n`);
	}

	it.each([
		['', 'gpt-image-2.6-sunburst'],
		['OPENAI_MODEL=gpt-image-2.6-sunburst', 'gpt-image-2.6-sunburst'],
		['OPENAI_MODEL=gpt-image-2', 'gpt-image-2'],
	])('uses OpenAI setting %j after Gemini fails and skips Codex on success', async (setting, expected) => {
		vi.mocked(fs.readFileSync).mockReturnValue(envContent(setting));
		vi.mocked(requestUrl)
			.mockResolvedValueOnce(response(503))
			.mockResolvedValueOnce(response(200, { data: [{ b64_json: png }] }));

		const result = await service.generate('Synthetic landscape', 'test-note');

		expect(requestUrl).toHaveBeenCalledTimes(2);
		expect(requestAt(0).url).toContain('/models/gemini-3-pro-image:generateContent');
		expect(requestAt(1).url).toBe('https://api.openai.com/v1/images/generations');
		expect(JSON.parse(requestAt(1).body as string)).toMatchObject({ model: expected, size: '1536x864', n: 1 });
		expectSavedPng(result?.imageLink);
	});

	it.each(['', 'OPENAI_MODEL=gpt-image-2'])('requests Sunburst on Codex after both APIs fail with setting %j', async (setting) => {
		vi.mocked(fs.readFileSync).mockReturnValue(envContent(setting));
		vi.mocked(requestUrl)
			.mockResolvedValueOnce(response(503))
			.mockResolvedValueOnce(response(429))
			.mockResolvedValueOnce(response(200, {}, `data: {"item":{"type":"image_generation_call","result":"${png}"}}\n\n`));

		const result = await service.generate('Synthetic landscape', 'test-note');

		expect(requestUrl).toHaveBeenCalledTimes(3);
		expect(requestAt(0).url).toContain('/models/gemini-3-pro-image:generateContent');
		expect(requestAt(1).url).toBe('https://api.openai.com/v1/images/generations');
		expect(JSON.parse(requestAt(1).body as string)).toMatchObject({
			model: setting ? 'gpt-image-2' : 'gpt-image-2.6-sunburst',
		});
		expect(requestAt(2).url).toBe('https://chatgpt.com/backend-api/codex/responses');
		expect(JSON.parse(requestAt(2).body as string)).toMatchObject({
			model: 'gpt-6.1-sol',
			tools: [{ type: 'image_generation', model: 'gpt-image-2.6-sunburst', size: '2048x1152', quality: 'low', output_format: 'png' }],
		});
		expectSavedPng(result?.imageLink);
	});

	it.each([
		['', 'No image was generated'],
		['data: {"type":"response.failed","error":{"message":"quota exceeded"}}\n\n', 'quota exceeded'],
	])('does not save an image or report success for failed Codex output %j', async (sse, error) => {
		vi.mocked(requestUrl)
			.mockResolvedValueOnce(response(503))
			.mockResolvedValueOnce(response(200, { data: [] }))
			.mockResolvedValueOnce(response(200, {}, sse));

		await expect(service.generate('Synthetic landscape', 'test-note')).rejects.toThrow(error);

		expect(requestUrl).toHaveBeenCalledTimes(3);
		expect(createBinary).not.toHaveBeenCalled();
		expect(Notice).not.toHaveBeenCalledWith('Image generated (illustration)');
		expect(Notice).toHaveBeenCalledWith(expect.stringContaining('Failed to generate image:'));
	});
});
