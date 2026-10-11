// Where a Markdown problem is, as "file:line" counted in the file as written.
// For a .md article Astro passes only the body after the frontmatter, so its
// node positions start below the frontmatter; the offset is found once per file.
import { readFileSync } from 'node:fs';

/** The file's line on which the parsed text begins (0 when it is the whole file). */
function offset(/** @type {any} */ ctx) {
	if (ctx.data.lineOffset !== undefined) return ctx.data.lineOffset;
	let lines = 0;
	try {
		const raw = readFileSync(ctx.fileURL, 'utf8');
		const start = raw.lastIndexOf(ctx.source);
		if (start > 0) lines = raw.slice(0, start).split('\n').length - 1;
	} catch {
		// No file to compare with; report lines as parsed.
	}
	ctx.data.lineOffset = lines;
	return lines;
}

/** The line of a node in its file, or undefined when it has no position. */
export function lineOf(/** @type {any} */ ctx, /** @type {any} */ node) {
	const line = node?.position?.start?.line;
	return line && ctx.fileURL ? line + offset(ctx) : line;
}

/** The article's path from src/, with the node's line when known. */
export function where(/** @type {any} */ ctx, /** @type {any} */ node = undefined) {
	const file = ctx.fileURL ? ctx.fileURL.pathname.replace(/^.*\/src\//, 'src/') : 'an article';
	const line = lineOf(ctx, node);
	return line ? `${file}:${line}` : file;
}
