import { spawn } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import process from 'node:process';
import { findUp } from 'find-up-simple';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logger } from './log.ts';
import { fileExists, getGitRoot, getVersion, spawnProcess } from './utils.ts';

vi.mock('node:fs/promises');
vi.mock('node:child_process');
vi.mock('node:os');
vi.mock('find-up-simple');
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

	it('should return git root directory when .git folder is found', async () => {
		vi.mocked(findUp).mockResolvedValue('/home/user/project/.git');

		const result = await getGitRoot();

		expect(result).toBe('/home/user/project');
		expect(findUp).toHaveBeenCalledWith('.git', { type: 'directory' });
	});

	it('should return home directory when .git folder is not found', async () => {
		vi.mocked(findUp).mockResolvedValue(undefined);
		vi.mocked(homedir).mockReturnValue('/home/user');

		const result = await getGitRoot();

		expect(result).toBe('/home/user');
		expect(homedir).toHaveBeenCalled();
	});

	it('should handle nested git repositories', async () => {
		vi.mocked(findUp).mockResolvedValue('/home/user/projects/deep/nested/.git');

		const result = await getGitRoot();

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
				stdio: 'inherit',
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

	it('should handle child process exit with code', () => {
		spawnProcess('/test/dir', 'echo', []);

		const exitHandler = mockChild.on.mock.calls.find((call) => call[0] === 'exit')?.[1];

		expect(exitHandler).toBeDefined();

		if (exitHandler) {
			exitHandler(0, null);
			expect(process.exit).toHaveBeenCalledWith(0);
		}
	});

	it('should handle child process exit with signal', () => {
		spawnProcess('/test/dir', 'echo', []);

		const exitHandler = mockChild.on.mock.calls.find((call) => call[0] === 'exit')?.[1];

		if (exitHandler) {
			exitHandler(null, 'SIGTERM');
			expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('SIGTERM'));
			expect(process.kill).toHaveBeenCalledWith(process.pid, 'SIGTERM');
		}
	});

	it('should handle child process error', () => {
		spawnProcess('/test/dir', 'echo', []);

		const errorHandler = mockChild.on.mock.calls.find((call) => call[0] === 'error')?.[1];

		if (errorHandler) {
			errorHandler(new Error('Test error'));
			expect(logger.error).toHaveBeenCalledWith('Test error');
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
				stdio: 'inherit',
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

	it('should handle non-zero exit codes', () => {
		spawnProcess('/test/dir', 'failing-command', []);

		const exitHandler = mockChild.on.mock.calls.find((call) => call[0] === 'exit')?.[1];

		if (exitHandler) {
			exitHandler(1, null);
			expect(process.exit).toHaveBeenCalledWith(1);
		}
	});

	it('should log command without args in dry-run mode', () => {
		spawnProcess('/test/dir', 'whoami', [], { dryRun: true });

		expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('whoami'));
		expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining('undefined'));
	});
});
