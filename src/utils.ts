import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, relative, resolve } from 'node:path';
import process from 'node:process';
import type { OptionValues } from 'commander';
import { findUp } from 'find-up-simple';
import { bgMagenta } from 'kleur/colors';
import { logger } from './log.ts';

/**
 * Find the closest git root relative to CWD, falls back to $HOME.
 * @internal
 */
export async function getGitRoot() {
	const gitFolder = await findUp('.git', {
		type: 'directory',
	});

	return gitFolder ? dirname(gitFolder) : homedir();
}

/**
 * Returns the version specified in the package manifest.
 * @internal
 */
export async function getVersion(): Promise<string> {
	const manifestPath = resolve(import.meta.dirname as string, '../package.json');
	const fileContents = await readFile(manifestPath, 'utf8');
	const { version } = JSON.parse(fileContents);

	return version ?? 'development';
}

/**
 * Checks whether the provided file exists in the file system.
 * @internal
 */
export async function fileExists(filePath: string): Promise<boolean> {
	try {
		await access(filePath, constants.F_OK);
	} catch {
		return false;
	}

	return true;
}

export function spawnProcess(
	cwd: string,
	command: string,
	args: string[] = [],
	options: OptionValues = {},
): Promise<number> {
	if (options.dryRun) {
		const fullCommand = args.length ? `${command} ${args.join(' ')}` : command;
		logger.info(`Dry run, not executing "${fullCommand}" within directory "${relative(process.cwd(), cwd)}"`);

		return Promise.resolve(0);
	}

	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd,
			stdio: ['inherit', 'pipe', 'pipe'],
			env: { ...process.env, FORCE_COLOR: '1' },
		});

		const prefix = bgMagenta(` pid:${child.pid} `);

		// Store signal handler references for cleanup
		const signalHandlers: Array<{ signal: NodeJS.Signals; handler: () => void }> = [];

		// Helper to pipe stream with prefix
		const pipeWithPrefix = (stream: NodeJS.WritableStream) => (data: Buffer) => {
			const lines = data.toString().split('\n');

			for (let i = 0; i < lines.length; i++) {
				if (lines[i] || i < lines.length - 1) {
					const outputLine = lines[i] + (i < lines.length - 1 ? '\n' : '');

					stream.write(`${prefix} ${outputLine}`);
				}
			}
		};

		// Cleanup function to remove signal handlers
		const cleanup = () => {
			for (const { signal, handler } of signalHandlers) {
				process.off(signal, handler);
			}
		};

		child.stdout?.on('data', pipeWithPrefix(process.stdout));
		child.stderr?.on('data', pipeWithPrefix(process.stderr));

		child.on('exit', (exitCode, signal: NodeJS.Signals) => {
			cleanup();

			if (typeof exitCode === 'number') {
				if (options.debug) {
					logger.debug('Exit code', exitCode);
				}

				resolve(exitCode);
				return;
			}

			reject(new Error(`Process ${child.pid} terminated with ${signal}`));
		});

		child.on('error', (error) => {
			cleanup();
			logger.error(error.message);
			reject(error);
		});

		for (const signal of [
			'SIGINT',
			'SIGTERM',
			'SIGPIPE',
			'SIGHUP',
			'SIGBREAK',
			'SIGWINCH',
			'SIGUSR1',
			'SIGUSR2',
		] as NodeJS.Signals[]) {
			const handler = () => child.kill(signal);
			process.on(signal, handler);
			signalHandlers.push({ signal, handler });
		}
	});
}
