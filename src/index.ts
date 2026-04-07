#!/usr/bin/env node

import { dirname, relative, resolve } from 'node:path';
import { handleCli } from './cli.ts';
import { logger } from './log.ts';
import { fileExists, findUpGlob, spawnProcess } from './utils.ts';

const { command, commandArgs, options } = await handleCli();

if (options.debug) {
	logger.debug('CLI', {
		command,
		args: commandArgs,
		options,
	});
}

// Validate that at least one file from options.with exists
const existingWithFiles = [];

for (const file of options.with) {
	if (await fileExists(file)) {
		existingWithFiles.push(file);
	}
}

if (existingWithFiles.length === 0) {
	logger.error('None of the files provided by --with do exist');
	process.exit(1);
}

// Resolve boundary once relative to process.cwd(), so a relative value like
// "packages" works correctly regardless of which file is being searched from.
const boundary = resolve(options.boundary);

// Group files by their nearest config file
const fileGroups: Record<string, string[]> = {};

for (const file of existingWithFiles) {
	// Try each candidate pattern sequentially until one is found
	const result = (() => {
		for (const candidateFile of options.find) {
			const found = findUpGlob(candidateFile, {
				cwd: dirname(file),
				last: boundary,
			});

			if (found) {
				return found;
			}
		}
		return undefined;
	})();

	if (!result) {
		logger.debug(`No match found for "${file}"`);
		continue;
	}

	if (!fileGroups[result]) {
		fileGroups[result] = [];
	}

	fileGroups[result].push(file);
}

for (const [configPath, files] of Object.entries(fileGroups)) {
	const cwd = dirname(configPath);
	const relativeFiles = options.pass ? files.map((file: string) => relative(cwd, file)) : [];
	const combinedArgs = [...commandArgs, ...relativeFiles];

	try {
		await spawnProcess(cwd, command as string, combinedArgs, options);
	} catch (error) {
		logger.error((error as Error).message);
	}
}
