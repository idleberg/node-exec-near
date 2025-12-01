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

// TODO
// - does options.find exist
// - do options.with files exist (ignore missing files, error if none exist)
// - run command in cwd=options.with

const absoluteFind = resolve(options.find);

if ((await fileExists(absoluteFind)) === false) {
	logger.error(`File "${options.find}" not found`);
	process.exit(1);
}

const result = await findUp(options.find, {
	stopAt: options.boundary,
});

if (!result) {
	logger.error(`Could not find "${options.find}" within boundary.`);
	process.exit(1);
}

const cwd = dirname(result);
const existingFiles = options.with.filter(fileExists).map((file: string) => relative(cwd, file));
const combinedArgs = [...commandArgs, ...existingFiles];

spawnProcess(cwd, command as string, combinedArgs, options);
