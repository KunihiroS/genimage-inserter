/** Real clients and env loader; only external I/O and prompt selection are mocked. */
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

function codexImage(): RequestUrlResponse {
	return response(200, {}, `data: ${JSON.stringify({ type: 'response.completed', response: {
		tools: [{ type: 'image_generation', model: 'gpt-image-2-codex', size: 'auto', quality: 'auto' }],
		output: [{ type: 'image_generation_call', result: png }],
	} })}\n\n`);
}

function geminiImage(): RequestUrlResponse {
	return response(200, { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: png } }] } }] });
}

function requestAt(index: number): RequestUrlParam {
	const call = vi.mocked(requestUrl).mock.calls[index];
	if (!call) throw new Error(`Missing request ${index}`);
	return call[0] as RequestUrlParam;
}

function envContent(extra = ''): string {
	return `GEMINI_API_KEY=fixture-gemini-key
GEMINI_MODEL=gemini-3-pro-image
OPENAI_API_KEY=fixture-openai-key
CODEX_ACCESS_TOKEN=fixture-codex-token
${extra}`;
}

describe('subscription-first generation (KUN-5398)', () => {
	const prompt: PromptFile = {
		name: 'illustration', path: 'prompts/illustration.md', content: 'Draw a landscape',
		aspectRatio: '16:9', imageSize: '2K',
	};
	let service: ImageGeneratorService;
	let createBinary: ReturnType<typeof vi.fn>;
	let logger: { info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn>; debug: ReturnType<typeof vi.fn> };

	beforeEach(() => {
		vi.resetAllMocks();
		vi.useFakeTimers();
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue(envContent());
		vi.mocked(getPromptFiles).mockResolvedValue([prompt]);
		vi.mocked(showPromptSelector).mockResolvedValue(prompt);
		createBinary = vi.fn().mockResolvedValue(undefined);
		const app = { vault: { getAbstractFileByPath: vi.fn().mockReturnValue({}), createBinary } };
		logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
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

	// AC-1, AC-5: request identity is not served identity. A usable image is success.
	it('uses Codex first and saves its PNG without calling paid APIs despite a different returned model', async () => {
		vi.mocked(requestUrl).mockResolvedValueOnce(codexImage());

		const result = await service.generate('Synthetic landscape', 'test-note');

		expect(requestUrl).toHaveBeenCalledTimes(1);
		expect(requestAt(0).url).toBe('https://chatgpt.com/backend-api/codex/responses');
		expect(JSON.parse(requestAt(0).body as string)).toMatchObject({
			model: 'gpt-6.1-sol',
			tools: [{ type: 'image_generation', model: 'gpt-image-2.6-sunburst', size: '2048x1152', quality: 'low', output_format: 'png' }],
		});
		expect(logger.info).toHaveBeenCalledWith('Codex OAuth generation succeeded');
		expect(logger.info).toHaveBeenCalledWith('Codex OAuth fallback generated PNG dimensions', expect.objectContaining({
			requestedSize: '2048x1152', actualSize: '1x1',
		}));
		expectSavedPng(result?.imageLink);
	});

	// AC-2: failure classification is visible before the paid fallback.
	it.each([401, 429])('falls back to Gemini after Codex HTTP %i and logs status, code, and stage', async status => {
		const code = status === 401 ? 'invalid_api_key' : 'rate_limit_exceeded';
		vi.mocked(requestUrl)
			.mockResolvedValueOnce(response(status, {}, JSON.stringify({ error: { code, message: 'private-upstream-message' } })))
			.mockResolvedValueOnce(geminiImage());

		const result = await service.generate('Synthetic landscape', 'test-note');

		expect(requestUrl).toHaveBeenCalledTimes(2);
		expect(requestAt(0).url).toContain('/codex/responses');
		expect(requestAt(1).url).toContain('/models/gemini-3-pro-image:generateContent');
		expect(logger.warn).toHaveBeenCalledWith('Codex OAuth failed, attempting Gemini fallback', expect.objectContaining({
			category: 'http', stage: 'response', httpStatus: status, errorCode: code,
		}));
		expectSavedPng(result?.imageLink);
	});

	it('falls back to Gemini on a Codex timeout without retrying Codex', async () => {
		vi.mocked(requestUrl)
			.mockImplementationOnce(() => new Promise(() => {}) as ReturnType<typeof requestUrl>)
			.mockResolvedValueOnce(geminiImage());
		const pending = service.generate('Synthetic landscape', 'test-note');
		const success = expect(pending).resolves.toMatchObject({ promptName: 'illustration' });

		await vi.advanceTimersByTimeAsync(180_000);
		await success;
		const result = await pending;

		expect(requestUrl).toHaveBeenCalledTimes(2);
		expect(requestAt(1).url).toContain('generativelanguage.googleapis.com');
		expect(logger.warn).toHaveBeenCalledWith('Codex OAuth failed, attempting Gemini fallback', expect.objectContaining({
			category: 'timeout', stage: 'request',
		}));
		expectSavedPng(result?.imageLink);
	});

	it.each([
		['invalid PNG', 'data: {"item":{"type":"image_generation_call","result":"bm90LXBuZw=="}}\n\n', 'invalid_image', 'image'],
		['missing image', '', 'no_image', 'image'],
		['stream failure', 'data: {"type":"response.failed","error":{"code":"rate_limit_exceeded","message":"private-stream-message"}}\n\n', 'stream', 'response'],
	])('falls back to Gemini for Codex %s', async (_name, text, category, stage) => {
		vi.mocked(requestUrl).mockResolvedValueOnce(response(200, {}, text)).mockResolvedValueOnce(geminiImage());

		const result = await service.generate('Synthetic landscape', 'test-note');

		expect(requestUrl).toHaveBeenCalledTimes(2);
		expect(requestAt(1).url).toContain('generativelanguage.googleapis.com');
		expect(logger.warn).toHaveBeenCalledWith('Codex OAuth failed, attempting Gemini fallback', expect.objectContaining({ category, stage }));
		expectSavedPng(result?.imageLink);
	});

	it.each([
		['', 'gpt-image-2.6-sunburst'],
		['OPENAI_MODEL=gpt-image-2.6-sunburst', 'gpt-image-2.6-sunburst'],
		['OPENAI_MODEL=gpt-image-2', 'gpt-image-2'],
	])('tries OpenAI only after Codex and Gemini fail, preserving setting %j', async (setting, expected) => {
		vi.mocked(fs.readFileSync).mockReturnValue(envContent(setting));
		vi.mocked(requestUrl)
			.mockResolvedValueOnce(response(401))
			.mockResolvedValueOnce(response(503))
			.mockResolvedValueOnce(response(200, { data: [{ b64_json: png }] }));

		const result = await service.generate('Synthetic landscape', 'test-note');

		expect(requestUrl).toHaveBeenCalledTimes(3);
		expect(requestAt(0).url).toContain('/codex/responses');
		expect(requestAt(1).url).toContain('generativelanguage.googleapis.com');
		expect(requestAt(2).url).toBe('https://api.openai.com/v1/images/generations');
		expect(JSON.parse(requestAt(2).body as string)).toMatchObject({ model: expected, size: '1536x864', n: 1 });
		expectSavedPng(result?.imageLink);
	});

	// AC-3, AC-5: all route failures appear, but no raw secrets or image insertion.
	it('reports classified failures for all routes without leaking response messages, tokens, or keys', async () => {
		const secret = 'fixture-private-credential-never-log';
		vi.mocked(requestUrl)
			.mockResolvedValueOnce(response(401, {}, JSON.stringify({ error: { code: 'invalid_api_key', message: secret } })))
			.mockResolvedValueOnce(response(503, { error: { code: 503, status: 'UNAVAILABLE', message: secret } }, secret))
			.mockResolvedValueOnce(response(429, { error: { code: 'rate_limit_exceeded', message: secret } }, secret));

		await expect(service.generate('Synthetic landscape', 'test-note')).rejects.toThrow(/Codex OAuth failed:.*http_status=401.*Gemini failed:.*http_status=503.*OpenAI failed:.*http_status=429/);

		expect(createBinary).not.toHaveBeenCalled();
		expect(Notice).not.toHaveBeenCalledWith('Image generated (illustration)');
		expect(Notice).toHaveBeenCalledWith(expect.stringMatching(/Failed to generate image:.*Codex OAuth failed:.*Gemini failed:.*OpenAI failed:/));
		const diagnostics = JSON.stringify({ info: logger.info.mock.calls, warn: logger.warn.mock.calls, error: logger.error.mock.calls, debug: logger.debug.mock.calls, notices: vi.mocked(Notice).mock.calls });
		expect(diagnostics).not.toMatch(/fixture-private-credential-never-log|fixture-codex-token|fixture-gemini-key|fixture-openai-key/);
	});

	// AC-4: no usable auth means no subscription HTTP request; Gemini remains usable.
	it.each(['missing', 'unreadable', 'malformed'])('skips subscription HTTP when its auth file is %s', async mode => {
		vi.mocked(fs.existsSync).mockImplementation(file => String(file) !== '/fixture/auth.json' || mode !== 'missing');
		vi.mocked(fs.readFileSync).mockImplementation(file => {
			if (String(file) === '/fixture/auth.json') {
				if (mode === 'unreadable') throw new Error('EACCES fixture-private-auth-detail');
				return '{invalid private-auth-detail';
			}
			return 'GEMINI_API_KEY=fixture-gemini-key\nGEMINI_MODEL=gemini-3-pro-image\nCODEX_AUTH_FILE_PATH=/fixture/auth.json';
		});
		vi.mocked(requestUrl).mockResolvedValueOnce(geminiImage());

		const result = await service.generate('Synthetic landscape', 'test-note');

		expect(requestUrl).toHaveBeenCalledTimes(1);
		expect(requestAt(0).url).toContain('generativelanguage.googleapis.com');
		expect(logger.warn).toHaveBeenCalledWith('Codex OAuth failed, attempting Gemini fallback', expect.objectContaining({
			stage: 'auth', category: mode === 'missing' ? 'auth_missing' : mode === 'unreadable' ? 'auth_unreadable' : 'auth_invalid',
		}));
		expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('private-auth-detail');
		expectSavedPng(result?.imageLink);
	});

	it('preserves explicit opt-in and skips OpenAI when no API key exists', async () => {
		vi.mocked(fs.readFileSync).mockReturnValue('GEMINI_API_KEY=gk\nGEMINI_MODEL=gm');
		vi.mocked(requestUrl).mockResolvedValueOnce(response(503));

		await expect(service.generate('Synthetic landscape', 'test-note')).rejects.toThrow(/Codex OAuth failed:.*category=disabled.*Gemini failed:.*http_status=503.*OpenAI skipped: no API key/);

		expect(requestUrl).toHaveBeenCalledTimes(1);
		expect(fs.readFileSync).toHaveBeenCalledTimes(1);
		expect(createBinary).not.toHaveBeenCalled();
	});

	it('stops on an explicit unsupported-model error instead of probing models or charging a fallback', async () => {
		vi.mocked(requestUrl).mockResolvedValueOnce(response(400, {}, JSON.stringify({ error: { code: 'model_not_found', message: 'private-model-detail' } })));

		await expect(service.generate('Synthetic landscape', 'test-note')).rejects.toThrow(/Codex OAuth failed:.*category=unsupported_model/);

		expect(requestUrl).toHaveBeenCalledTimes(1);
		expect(createBinary).not.toHaveBeenCalled();
	});
});
