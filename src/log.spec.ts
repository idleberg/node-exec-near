import { beforeEach, describe, expect, it, vi } from 'vitest';
import { logger } from './log.ts';

describe('logger', () => {
	beforeEach(() => {
		console.debug = vi.fn();
		console.error = vi.fn();
		console.info = vi.fn();
		console.log = vi.fn();
		console.warn = vi.fn();
	});

	const testMessages = [
		{ description: 'string', value: 'test message' },
		{ description: 'number', value: 42 },
		{ description: 'boolean', value: true },
		{ description: 'object', value: { key: 'value' } },
		{ description: 'array', value: [1, 2, 3] },
		{ description: 'undefined', value: undefined },
		{ description: 'null', value: null },
		{ description: 'Error', value: new Error('test error') },
	];

	describe.each([
		{ method: 'debug', consoleMethod: 'debug', label: 'DEBUG' },
		{ method: 'error', consoleMethod: 'error', label: 'ERROR' },
		{ method: 'info', consoleMethod: 'info', label: 'INFO' },
		{ method: 'success', consoleMethod: 'log', label: 'SUCCESS' },
		{ method: 'warn', consoleMethod: 'warn', label: 'WARN' },
	] as const)('$method', ({ method, consoleMethod, label }) => {
		it.each(testMessages)('should handle $description messages', ({ value }) => {
			logger[method](value);

			expect(console[consoleMethod]).toHaveBeenCalledTimes(1);
			expect(console[consoleMethod]).toHaveBeenCalledWith(expect.stringContaining(label), value);
		});
	});

	describe('log', () => {
		it.each(testMessages)('should handle $description messages without prefix', ({ value }) => {
			logger.log(value);

			expect(console.log).toHaveBeenCalledTimes(1);
			expect(console.log).toHaveBeenCalledWith(value);

			const callArgs = vi.mocked(console.log).mock.calls[0];
			expect(callArgs).toHaveLength(1);
		});
	});
});
