// Build-time check of an article's dates, as written. YAML reads an unquoted
// date such as 2026-10-32 as a real date and rolls it over to November 1, so
// by the time the metadata schema (src/content.config.ts) sees it the mistake
// is gone. This Markdown pass reads the frontmatter as written instead and
// stops the build on a date that does not exist.
import { readFileSync } from 'node:fs';

const DATE_FIELD = /^(published|updated):[ \t]*['"]?([^'"#\s]*)['"]?[ \t]*(?:#.*)?$/gm;

/** @type {import('satteri').MdastPluginInstance & { name: string }} */
export const frontmatterDates = {
	name: 'frontmatter-dates',
	before(_root, ctx) {
		if (!ctx.fileURL) return;
		const frontmatter = readFileSync(ctx.fileURL, 'utf8').split(/^---\s*$/m)[1] ?? '';
		for (const [, field, value] of frontmatter.matchAll(DATE_FIELD)) {
			if (!value) continue;
			const date = new Date(`${value}T00:00:00Z`);
			if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
				const file = ctx.fileURL.pathname.replace(/^.*\/src\//, 'src/');
				throw new Error(`${file}: ${field}: ${value} is not a date; write it as YYYY-MM-DD, e.g. ${field}: 2026-10-11`);
			}
		}
	},
};
