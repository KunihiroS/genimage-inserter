export interface GenerationFailure {
	stage: 'auth' | 'request' | 'response' | 'image';
	category: 'disabled' | 'auth_missing' | 'auth_unreadable' | 'auth_invalid' | 'http' | 'timeout' | 'network' | 'stream' | 'no_image' | 'invalid_image' | 'unsupported_model' | 'unknown';
	httpStatus?: number;
	errorCode?: string;
}

// Only known public identifiers may cross the diagnostics boundary.
const PUBLIC_ERROR_CODES = new Set([
	'unknown', 'invalid_api_key', 'invalid_token', 'token_expired', 'authentication_error',
	'unauthorized', 'permission_denied', 'rate_limit_exceeded', 'insufficient_quota',
	'model_not_found', 'unsupported_model', 'model_not_supported', 'invalid_request_error',
	'content_policy_violation', 'server_error', 'internal_error', 'access_denied',
	'UNAUTHENTICATED', 'PERMISSION_DENIED', 'RESOURCE_EXHAUSTED', 'INVALID_ARGUMENT',
	'NOT_FOUND', 'UNAVAILABLE', 'INTERNAL', 'DEADLINE_EXCEEDED',
]);

export function safeErrorCode(code: unknown): string | undefined {
	if (code === undefined || code === null) return undefined;
	return typeof code === 'string' && PUBLIC_ERROR_CODES.has(code) ? code : 'unknown';
}

export function formatGenerationFailure(details: GenerationFailure): string {
	return `category=${details.category} stage=${details.stage} http_status=${details.httpStatus ?? 'none'} error_code=${safeErrorCode(details.errorCode) ?? 'none'}`;
}

export class ImageGenerationError extends Error {
	readonly details: GenerationFailure;
	constructor(details: GenerationFailure) {
		super(formatGenerationFailure(details));
		this.name = 'ImageGenerationError';
		this.details = { ...details, ...(details.errorCode !== undefined ? { errorCode: safeErrorCode(details.errorCode) } : {}) };
	}
}

/** Classify a remote error using public codes only, never its message. */
export function remoteGenerationError(
	payload: unknown,
	httpStatus?: number,
	category: 'http' | 'stream' = 'http'
): ImageGenerationError {
	const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
	const nested = record.error;
	const error = nested && typeof nested === 'object' ? nested as Record<string, unknown> : record;
	const errorCode = safeErrorCode(typeof error.code === 'number' ? error.status : error.code ?? error.status);
	return new ImageGenerationError({
		stage: 'response',
		category: errorCode === 'model_not_found' || errorCode === 'unsupported_model' || errorCode === 'model_not_supported'
			? 'unsupported_model' : category,
		...(httpStatus !== undefined ? { httpStatus } : {}),
		...(errorCode !== undefined ? { errorCode } : {}),
	});
}

/** Normalize request failures and always release the timeout after settlement. */
export async function withGenerationTimeout<T>(request: () => PromiseLike<T>, timeoutMs: number): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		const timeout = new Promise<never>((_, reject) => {
			timer = setTimeout(() => reject(new ImageGenerationError({ category: 'timeout', stage: 'request' })), timeoutMs);
		});
		return await Promise.race([request(), timeout]);
	} catch (error) {
		if (error instanceof ImageGenerationError) throw error;
		throw new ImageGenerationError({ category: 'network', stage: 'request' });
	} finally {
		if (timer !== undefined) clearTimeout(timer);
	}
}

/** Some hosts expose text but cannot decode json for failed requests. */
export function generationErrorPayload(response: { readonly text?: string; readonly json?: unknown }): unknown {
	try {
		if (response.text) return JSON.parse(response.text) as unknown;
	} catch { /* Fall through to a host-provided JSON value without exposing parse errors. */ }
	try { return response.json; } catch { return undefined; }
}
