import { Command } from 'commander';
import { logger } from './log.ts';
import { getGitRoot, getVersion } from './utils.ts';

export async function handleCli() {
	const program = new Command('exec-near');
	const gitRoot = await getGitRoot();

	program
		.version(await getVersion())
		.configureOutput({
			writeOut: (message: string) => logger.log(message),
			writeErr: (message: string) => logger.error(message),
		})
		.arguments('<command> [args...]')
		.option('-D, --debug', 'print additional debug output')
		.option('-R, --dry-run', 'skip executing the spawned process')

		.optionsGroup('Execution Options')
		.requiredOption('-w, --with <file...>', 'entrypoint from where to traverse up')
		.requiredOption(
			'-f, --find <file>',
			'file(s) to base the CWD on, first match wins',
			(value, previous: string[]) => {
				return previous ? [...previous, value] : [value];
			},
			[],
		)
		.option('-b, --boundary <directory>', 'define a boundary where to stop searching', gitRoot)
		.option('-n, --no-pass', 'skips passing results to the spawned process', true)

		// This is required to pass on unknown options to the spawned process.
		.allowUnknownOption(true);

	program.parse();

	const [command, ...commandArgs] = program.args;
	const options = program.opts();

	return {
		command,
		commandArgs,
		options,
	};
}
