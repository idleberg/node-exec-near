import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import type { OptionValues } from 'commander';
import { findUp } from 'find-up-simple';
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

export function spawnProcess(cwd: string, command: string, args: string[] = [], options: OptionValues = {}) {
	if (options.dryRun) {
		const fullCommand = args.length ? `${command} ${args.join(' ')}` : command;
		logger.info(`Dry run, not executing "${fullCommand}" inside "${cwd}"`);
		return;
	}

	const child = spawn(command, args, { cwd, stdio: 'inherit' });

	child.on('exit', (exitCode, signal: NodeJS.Signals) => {
		if (typeof exitCode === 'number') {
			if (options.debug) {
				logger.debug('Exit code', exitCode);
			}

			process.exit(exitCode);
		}

		logger.info(`Process terminated with ${signal}`);
		process.kill(process.pid, signal);
	});

	child.on('error', (error) => logger.error(error.message));

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
		process.on(signal, () => {
			child.kill(signal);
		});
	}
}
