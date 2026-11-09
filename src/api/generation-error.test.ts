import { describe, it, expect } from 'vitest';
import { ImageGenerationError, formatGenerationFailure } from './generation-error';

describe('generation failure contract', () => {
	it('formats absent fields explicitly', () => {
		expect(formatGenerationFailure({ category: 'network', stage: 'request' })).toBe(
			'category=network stage=request http_status=none error_code=none'
		);
	});
	it('keeps recognized status and code', () => {
		const error = new ImageGenerationError({ category: 'http', stage: 'response', httpStatus: 429, errorCode: 'rate_limit_exceeded' });
		expect(error.message).toBe('category=http stage=response http_status=429 error_code=rate_limit_exceeded');
		expect(error.details).toEqual({ category: 'http', stage: 'response', httpStatus: 429, errorCode: 'rate_limit_exceeded' });
	});
	it.each(['sk-private-token', 'a'.repeat(1000), 'private_code', 'secret\nAuthorization: Bearer private'])('maps unrecognized code to unknown: %s', (code) => {
		const error = new ImageGenerationError({ category: 'http', stage: 'response', errorCode: code });
		expect(error.details.errorCode).toBe('unknown');
		expect(error.message).toBe('category=http stage=response http_status=none error_code=unknown');
	});
});
