import { spawn } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import process from 'node:process';
import { dir as findDir } from 'empathic/find';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logger } from './log.ts';
import { fileExists, getGitRoot, getVersion, spawnProcess } from './utils.ts';

vi.mock('node:fs/promises');
vi.mock('node:child_process');
vi.mock('node:os');
vi.mock('empathic/find');
vi.mock('./log.ts', () => ({
	logger: {
		log: vi.fn(),
		info: vi.fn(),
		debug: vi.fn(),
		error: vi.fn(),
	},
}));

describe('getGitRoot', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should return git root directory when .git folder is found', () => {
		vi.mocked(findDir).mockReturnValue('/home/user/project/.git');

		const result = getGitRoot();

		expect(result).toBe('/home/user/project');
		expect(findDir).toHaveBeenCalledWith('.git');
	});

	it('should return home directory when .git folder is not found', () => {
		vi.mocked(findDir).mockReturnValue(undefined);
		vi.mocked(homedir).mockReturnValue('/home/user');

		const result = getGitRoot();

		expect(result).toBe('/home/user');
		expect(homedir).toHaveBeenCalled();
	});

	it('should handle nested git repositories', () => {
		vi.mocked(findDir).mockReturnValue('/home/user/projects/deep/nested/.git');

		const result = getGitRoot();

		expect(result).toBe('/home/user/projects/deep/nested');
	});
});

describe('getVersion', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it.each([
		{ packageJson: { version: '1.2.3' }, expected: '1.2.3', description: 'valid version' },
		{ packageJson: { version: '0.0.1' }, expected: '0.0.1', description: 'initial version' },
		{ packageJson: { version: '10.20.30' }, expected: '10.20.30', description: 'multi-digit version' },
		{ packageJson: { version: '2.3.4-beta.1' }, expected: '2.3.4-beta.1', description: 'prerelease version' },
		{
			packageJson: { version: '3.0.0-rc.1+build.123' },
			expected: '3.0.0-rc.1+build.123',
			description: 'version with metadata',
		},
		{ packageJson: {}, expected: 'development', description: 'missing version' },
		{ packageJson: { version: null }, expected: 'development', description: 'null version' },
		{ packageJson: { version: undefined }, expected: 'development', description: 'undefined version' },
	])('should return $expected when $description', async ({ packageJson, expected }) => {
		vi.mocked(readFile).mockResolvedValue(JSON.stringify(packageJson));

		const version = await getVersion();

		expect(version).toBe(expected);
	});

	it('should read from correct package.json path', async () => {
		vi.mocked(readFile).mockResolvedValue(JSON.stringify({ version: '1.0.0' }));

		await getVersion();

		expect(readFile).toHaveBeenCalledWith(expect.stringContaining('package.json'), 'utf8');
	});
});

describe('fileExists', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should return true when file exists', async () => {
		vi.mocked(access).mockResolvedValue(undefined);

		const result = await fileExists('/path/to/file.txt');

		expect(result).toBe(true);
		expect(access).toHaveBeenCalledWith('/path/to/file.txt', expect.any(Number));
	});

	it('should return false when file does not exist', async () => {
		vi.mocked(access).mockRejectedValue(new Error('ENOENT'));

		const result = await fileExists('/path/to/nonexistent.txt');

		expect(result).toBe(false);
	});

	it('should return false when access throws any error', async () => {
		vi.mocked(access).mockRejectedValue(new Error('Permission denied'));

		const result = await fileExists('/path/to/restricted.txt');

		expect(result).toBe(false);
	});
});

describe('spawnProcess', () => {
	const mockChild = {
		on: vi.fn(),
		kill: vi.fn(),
		pid: 12345,
		stdout: {
			on: vi.fn(),
		},
		stderr: {
			on: vi.fn(),
		},
	};

	beforeEach(() => {
		vi.resetAllMocks();
		vi.mocked(spawn).mockReturnValue(mockChild as any);
		process.on = vi.fn() as any;
		process.exit = vi.fn() as any;
		process.kill = vi.fn() as any;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('should spawn process with correct arguments', () => {
		spawnProcess('/test/dir', 'echo', ['hello']);

		expect(spawn).toHaveBeenCalledWith(
			'echo',
			['hello'],
			expect.objectContaining({
				cwd: '/test/dir',
				stdio: ['inherit', 'pipe', 'pipe'],
				env: expect.objectContaining({ FORCE_COLOR: '1' }),
			}),
		);
	});

	it('should not spawn process in dry-run mode', () => {
		spawnProcess('/test/dir', 'echo', ['hello'], { dryRun: true });

		expect(spawn).not.toHaveBeenCalled();
	});

	it('should log command in dry-run mode', () => {
		spawnProcess('/test/dir', 'echo', ['hello', 'world'], { dryRun: true });

		expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('echo hello world'));
	});

	it('should setup exit handler for child process', () => {
		spawnProcess('/test/dir', 'echo', []);

		expect(mockChild.on).toHaveBeenCalledWith('exit', expect.any(Function));
	});

	it('should setup error handler for child process', () => {
		spawnProcess('/test/dir', 'echo', []);

		expect(mockChild.on).toHaveBeenCalledWith('error', expect.any(Function));
	});

	it('should forward signals to child process', () => {
		spawnProcess('/test/dir', 'echo', []);

		const signalHandler = (process.on as any).mock.calls.find((call: any[]) =>
			['SIGINT', 'SIGTERM'].includes(call[0]),
		)?.[1];

		expect(signalHandler).toBeDefined();

		if (signalHandler) {
			signalHandler();
			expect(mockChild.kill).toHaveBeenCalled();
		}
	});

	it('should handle child process exit with code', async () => {
		const promise = spawnProcess('/test/dir', 'echo', []);

		const exitHandler = mockChild.on.mock.calls.find((call) => call[0] === 'exit')?.[1];

		expect(exitHandler).toBeDefined();

		if (exitHandler) {
			exitHandler(0, null);
			const exitCode = await promise;
			expect(exitCode).toBe(0);
		}
	});

	it('should handle child process exit with signal', async () => {
		const promise = spawnProcess('/test/dir', 'echo', []);

		const exitHandler = mockChild.on.mock.calls.find((call) => call[0] === 'exit')?.[1];

		if (exitHandler) {
			exitHandler(null, 'SIGTERM');

			await expect(promise).rejects.toThrow('Process 12345 terminated with SIGTERM');
		}
	});

	it('should handle child process error', async () => {
		const promise = spawnProcess('/test/dir', 'echo', []);

		const errorHandler = mockChild.on.mock.calls.find((call) => call[0] === 'error')?.[1];

		if (errorHandler) {
			errorHandler(new Error('Test error'));
			expect(logger.error).toHaveBeenCalledWith('Test error');

			await expect(promise).rejects.toThrow('Test error');
		}
	});

	it('should handle command without arguments', () => {
		spawnProcess('/test/dir', 'node', []);

		expect(spawn).toHaveBeenCalledWith('node', [], expect.any(Object));
	});

	it('should log exit code in debug mode', () => {
		spawnProcess('/test/dir', 'echo', [], { debug: true });

		const exitHandler = mockChild.on.mock.calls.find((call) => call[0] === 'exit')?.[1];

		if (exitHandler) {
			exitHandler(0, null);
			expect(logger.debug).toHaveBeenCalledWith('Exit code', 0);
		}
	});

	it('should set cwd when spawning process', () => {
		spawnProcess('/custom/working/dir', 'npm', ['install']);

		expect(spawn).toHaveBeenCalledWith(
			'npm',
			['install'],
			expect.objectContaining({
				cwd: '/custom/working/dir',
				stdio: ['inherit', 'pipe', 'pipe'],
				env: expect.objectContaining({ FORCE_COLOR: '1' }),
			}),
		);
	});

	it('should include cwd in dry-run log message', () => {
		spawnProcess('/project/dir', 'npm', ['test'], { dryRun: true });

		expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('/project/dir'));
	});

	it('should handle all signal types', () => {
		spawnProcess('/test/dir', 'node', ['app.js']);

		const signals = ['SIGINT', 'SIGTERM', 'SIGPIPE', 'SIGHUP', 'SIGBREAK', 'SIGWINCH', 'SIGUSR1', 'SIGUSR2'];

		for (const signal of signals) {
			const handler = (process.on as any).mock.calls.find((call: any[]) => call[0] === signal)?.[1];
			expect(handler).toBeDefined();

			if (handler) {
				handler();
				expect(mockChild.kill).toHaveBeenCalledWith(signal);
			}
		}
	});

	it('should not log exit code when debug is false', () => {
		spawnProcess('/test/dir', 'echo', []);

		const exitHandler = mockChild.on.mock.calls.find((call) => call[0] === 'exit')?.[1];

		if (exitHandler) {
			exitHandler(0, null);
			expect(logger.debug).not.toHaveBeenCalled();
		}
	});

	it('should handle non-zero exit codes', async () => {
		const promise = spawnProcess('/test/dir', 'failing-command', []);

		const exitHandler = mockChild.on.mock.calls.find((call) => call[0] === 'exit')?.[1];

		if (exitHandler) {
			exitHandler(1, null);
			const exitCode = await promise;
			expect(exitCode).toBe(1);
		}
	});

	it('should log command without args in dry-run mode', () => {
		spawnProcess('/test/dir', 'whoami', [], { dryRun: true });

		expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('whoami'));
		expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining('undefined'));
	});
});
