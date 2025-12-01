import { bgBlue, bgCyan, bgGreen, bgRed, bgYellow } from 'kleur/colors';

export const logger = {
	debug: (...args: unknown[]) => console.debug(bgCyan(' DEBUG '), ...args),
	error: (...args: unknown[]) => console.error(bgRed(' ERROR '), ...args),
	info: (...args: unknown[]) => console.info(bgBlue(' INFO '), ...args),
	log: (...args: unknown[]) => console.log(...args),
	success: (...args: unknown[]) => console.log(bgGreen(' SUCCESS '), ...args),
	warn: (...args: unknown[]) => console.warn(bgYellow(' WARN '), ...args),
};
