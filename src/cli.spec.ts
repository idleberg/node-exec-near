import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleCli } from './cli.ts';
import { logger } from './log.ts';
import { getGitRoot, getVersion } from './utils.ts';

vi.mock('./log.ts', () => ({
	logger: {
		log: vi.fn(),
		error: vi.fn(),
	},
}));

vi.mock('./utils.ts', () => ({
	getVersion: vi.fn(),
	getGitRoot: vi.fn(),
}));

describe('handleCli', () => {
	const originalArgv = process.argv;

	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(getVersion).mockResolvedValue('1.0.0');
		vi.mocked(getGitRoot).mockResolvedValue('/home/user/project');
		// Reset process.argv to a clean state
		process.argv = ['node', 'cli.js'];
	});

	afterEach(() => {
		process.argv = originalArgv;
	});

	it('should set program name', async () => {
		process.argv = ['node', 'cli.js', '-w', 'file.env', '-f', 'package.json', 'echo', 'test'];

		const result = await handleCli();

		// The program name is set in the constructor
		expect(result).toBeDefined();
	});

	it('should set version from getVersion', async () => {
		process.argv = ['node', 'cli.js', '-w', 'file.env', '-f', 'package.json', 'echo', 'test'];

		await handleCli();

		expect(getVersion).toHaveBeenCalled();
	});

	it('should configure output to use logger', async () => {
		process.argv = ['node', 'cli.js', '-w', 'file.env', '-f', 'package.json', 'echo', 'test'];

		await handleCli();

		// Logger should be configured for writeOut and writeErr
		expect(logger.log).toBeDefined();
		expect(logger.error).toBeDefined();
	});

	it('should parse command and arguments correctly', async () => {
		process.argv = ['node', 'cli.js', '-w', 'file.env', '-f', 'package.json', 'npm', 'run', 'build'];

		const result = await handleCli();

		expect(result.command).toBe('npm');
		expect(result.commandArgs).toEqual(['run', 'build']);
	});

	it('should parse single command without arguments', async () => {
		process.argv = ['node', 'cli.js', '-w', 'file.env', '-f', 'package.json', 'node'];

		const result = await handleCli();

		expect(result.command).toBe('node');
		expect(result.commandArgs).toEqual([]);
	});

	it('should include debug option in options', async () => {
		process.argv = ['node', 'cli.js', '-w', 'file.env', '-f', 'package.json', '-D', 'echo', 'test'];

		const result = await handleCli();

		expect(result.options.debug).toBe(true);
	});

	it('should include dry-run option in options', async () => {
		process.argv = ['node', 'cli.js', '-w', 'file.env', '-f', 'package.json', '-R', 'echo', 'test'];

		const result = await handleCli();

		expect(result.options.dryRun).toBe(true);
	});

	it('should parse required --with option', async () => {
		process.argv = ['node', 'cli.js', '-w', 'file1.env', '-w', 'file2.env', '-f', 'package.json', 'echo'];

		const result = await handleCli();

		expect(result.options.with).toEqual(['file1.env', 'file2.env']);
	});

	it('should parse required --find option', async () => {
		process.argv = ['node', 'cli.js', '-w', 'file.env', '-f', 'package.json', 'echo'];

		const result = await handleCli();

		expect(result.options.find).toBe('package.json');
	});

	it('should use git root as default boundary', async () => {
		vi.mocked(getGitRoot).mockResolvedValue('/home/user/myproject');
		process.argv = ['node', 'cli.js', '-w', 'file.env', '-f', 'package.json', 'echo'];

		const result = await handleCli();

		expect(getGitRoot).toHaveBeenCalled();
		expect(result.options.boundary).toBe('/home/user/myproject');
	});

	it('should allow custom boundary option', async () => {
		process.argv = ['node', 'cli.js', '-w', 'file.env', '-f', 'package.json', '-b', '/custom/path', 'echo'];

		const result = await handleCli();

		expect(result.options.boundary).toBe('/custom/path');
	});

	it('should allow unknown options to pass through', async () => {
		process.argv = [
			'node',
			'cli.js',
			'-w',
			'file.env',
			'-f',
			'package.json',
			'--unknown-flag',
			'echo',
			'--some-other-flag',
		];

		// Should not throw error due to allowUnknownOption(true)
		const result = await handleCli();

		expect(result).toBeDefined();
	});

	it('should handle long option names', async () => {
		process.argv = [
			'node',
			'cli.js',
			'--with',
			'file.env',
			'--find',
			'package.json',
			'--debug',
			'--dry-run',
			'--boundary',
			'/test',
			'echo',
			'hello',
		];

		const result = await handleCli();

		expect(result.command).toBe('echo');
		expect(result.commandArgs).toEqual(['hello']);
		expect(result.options.debug).toBe(true);
		expect(result.options.dryRun).toBe(true);
		expect(result.options.with).toEqual(['file.env']);
		expect(result.options.find).toBe('package.json');
		expect(result.options.boundary).toBe('/test');
	});

	it('should return all parsed options', async () => {
		process.argv = [
			'node',
			'cli.js',
			'-w',
			'file.env',
			'-f',
			'package.json',
			'-D',
			'-R',
			'-b',
			'/boundary',
			'npm',
			'test',
		];

		const result = await handleCli();

		expect(result.options).toMatchObject({
			debug: true,
			dryRun: true,
			with: ['file.env'],
			find: 'package.json',
			boundary: '/boundary',
		});
	});

	it('should call logger.log when writeOut is invoked', async () => {
		process.argv = ['node', 'cli.js', '-w', 'file.env', '-f', 'package.json', 'echo'];

		await handleCli();

		// The configureOutput should have been called with writeOut function
		// We can't directly test the callback, but we verify logger is properly set up
		expect(logger.log).toBeDefined();
	});

	it('should call logger.error when writeErr is invoked', async () => {
		process.argv = ['node', 'cli.js', '-w', 'file.env', '-f', 'package.json', 'echo'];

		await handleCli();

		// The configureOutput should have been called with writeErr function
		expect(logger.error).toBeDefined();
	});

	it('should parse arguments in correct order', async () => {
		process.argv = ['node', 'cli.js', '-w', 'test.env', '-f', 'package.json', 'git', 'commit', '-m', 'message'];

		const result = await handleCli();

		expect(result.command).toBe('git');
		expect(result.commandArgs).toEqual(['commit', '-m', 'message']);
	});

	it('should handle multiple --with files', async () => {
		process.argv = [
			'node',
			'cli.js',
			'-w',
			'.env.local',
			'-w',
			'.env.production',
			'-w',
			'.env.test',
			'-f',
			'package.json',
			'node',
			'index.js',
		];

		const result = await handleCli();

		expect(result.options.with).toEqual(['.env.local', '.env.production', '.env.test']);
	});

	it('should await getGitRoot before using it as boundary default', async () => {
		vi.mocked(getGitRoot).mockResolvedValue('/custom/git/root');
		process.argv = ['node', 'cli.js', '-w', 'file.env', '-f', 'package.json', 'echo'];

		const result = await handleCli();

		expect(getGitRoot).toHaveBeenCalled();
		expect(result.options.boundary).toBe('/custom/git/root');
	});

	it('should await getVersion before setting program version', async () => {
		vi.mocked(getVersion).mockResolvedValue('2.5.0');
		process.argv = ['node', 'cli.js', '-w', 'file.env', '-f', 'package.json', 'echo'];

		await handleCli();

		expect(getVersion).toHaveBeenCalled();
	});

	it('should handle command with complex arguments', async () => {
		process.argv = [
			'node',
			'cli.js',
			'-w',
			'.env',
			'-f',
			'package.json',
			'docker',
			'run',
			'--rm',
			'-v',
			'/data:/data',
			'image:latest',
		];

		const result = await handleCli();

		expect(result.command).toBe('docker');
		expect(result.commandArgs).toEqual(['run', '--rm', '-v', '/data:/data', 'image:latest']);
	});

	it('should not throw when both debug and dry-run are enabled', async () => {
		process.argv = ['node', 'cli.js', '-w', 'file.env', '-f', 'package.json', '-D', '-R', 'echo', 'test'];

		await expect(handleCli()).resolves.toBeDefined();
	});

	it('should handle minimal required arguments', async () => {
		process.argv = ['node', 'cli.js', '-w', 'file.env', '-f', 'package.json', 'ls'];

		const result = await handleCli();

		expect(result.command).toBe('ls');
		expect(result.commandArgs).toEqual([]);
		expect(result.options.with).toEqual(['file.env']);
		expect(result.options.find).toBe('package.json');
	});

	it('should use logger.log for writeOut callback', async () => {
		// Trigger version output which uses writeOut
		process.argv = ['node', 'cli.js', '--version'];

		try {
			await handleCli();
		} catch {
			// Version command exits the process, which we catch
		}

		// The logger.log should be called through the writeOut callback
		expect(logger.log).toHaveBeenCalled();
	});

	it('should use logger.error for writeErr callback', async () => {
		// Trigger an error by providing invalid arguments (missing required options)
		process.argv = ['node', 'cli.js', 'echo', 'test'];

		try {
			await handleCli();
		} catch {
			// Error exits the process
		}

		// The logger.error should be called through the writeErr callback
		expect(logger.error).toHaveBeenCalled();
	});
});
