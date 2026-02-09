#!/usr/bin/env node

import { dirname, relative, resolve } from 'node:path';
import { findUp } from 'find-up-simple';
import { handleCli } from './cli.ts';
import { logger } from './log.ts';
import { fileExists, spawnProcess } from './utils.ts';

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

// console.log({ before: options.with, existingWithFiles });

if (existingWithFiles.length === 0) {
	logger.error('None of the files provided by --with do exist');
	process.exit(1);
}

// Group files by their nearest config file
const fileGroups: Record<string, string[]> = {};

for (const file of existingWithFiles) {
	// Try each candidate file sequentially until one is found
	const result = await (async () => {
		for (const candidateFile of options.find) {
			const found = await findUp(candidateFile, {
				cwd: dirname(file),
				stopAt: options.boundary,
			});

			if (found) {
				return found;
			}
		}
		return undefined;
	})();

	if (!result) {
		logger.error(`Could not find any of "${options.find.join('", "')}" for "${file}" within boundary.`);
		process.exit(1);
	}

	if (!fileGroups[result]) {
		fileGroups[result] = [];
	}

	fileGroups[result].push(file);
}

for (const [configPath, files] of Object.entries(fileGroups)) {
	const cwd = dirname(configPath);
	const relativeFiles = files.map((file: string) => relative(cwd, file));
	const combinedArgs = [...commandArgs, ...relativeFiles];

	try {
		await spawnProcess(cwd, command as string, combinedArgs, options);
	} catch (error) {
		logger.error((error as Error).message);
	}
}
