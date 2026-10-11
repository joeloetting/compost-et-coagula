// The site's bibliography library: every .bib file in src/data/ (BibTeX or
// BibLaTeX, as exported from Deftere or Zotero), read with citation-js and
// formatted in Chicago notes-and-bibliography style (src/data/csl/). Articles
// cite these entries as in Pandoc and Zettlr, [@key, 45]; see
// src/plugins/figures.mjs for how a citation becomes a note and a
// bibliography entry.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// citation-js is CommonJS; its plugins register themselves on the core.
const require = createRequire(import.meta.url);
const { Cite, plugins } = require('@citation-js/core');
require('@citation-js/plugin-bibtex');
require('@citation-js/plugin-csl');

const DATA = fileURLToPath(new URL('../data/', import.meta.url));
const STYLE = 'chicago-notes-bibliography';
plugins.config.get('@csl').styles.add(STYLE, readFileSync(join(DATA, 'csl', `${STYLE}.csl`), 'utf8'));

// Types whose titles Chicago sets in italics; the rest are quoted.
const ITALIC_TYPES = new Set(['book', 'thesis', 'report', 'periodical', 'motion_picture', 'musical_score', 'map', 'software', 'dataset', 'pamphlet', 'classic', 'graphic']);

/**
 * @typedef {{ author: string, title: string, italic: boolean }} Short
 * @typedef {{ key: string, text: string, html: string, short: Short | undefined, file: string }} LibraryEntry
 */

/** @type {{ stamp: string, entries: Map<string, LibraryEntry> } | undefined} */
let cache;

/** The .bib files in src/data/, by name. */
const bibFiles = () =>
	readdirSync(DATA)
		.filter((name) => name.endsWith('.bib'))
		.sort();

/** Changes whenever a .bib file is added, removed, or changed. */
export function libraryStamp() {
	return bibFiles()
		.map((name) => {
			const { mtimeMs, size } = statSync(join(DATA, name));
			return `${name}:${mtimeMs}:${size}`;
		})
		.join('|');
}

/** The folder holding the .bib files, for watching them. */
export const LIBRARY_DIR = DATA;

/** The .bib entries by key, re-read whenever a .bib file changes. */
export function library() {
	const files = bibFiles();
	const stamp = libraryStamp();
	if (cache?.stamp === stamp) return cache.entries;
	/** @type {Map<string, LibraryEntry>} */
	const entries = new Map();
	for (const name of files) {
		let items;
		try {
			items = new Cite(readFileSync(join(DATA, name), 'utf8')).data;
		} catch (error) {
			throw new Error(`src/data/${name} could not be read as BibTeX: ${/** @type {Error} */ (error).message}`);
		}
		for (const item of items) {
			const earlier = entries.get(item.id);
			if (earlier) throw new Error(`the key ${item.id} appears twice in ${earlier.file === name ? `src/data/${name}` : `src/data/${earlier.file} and src/data/${name}`}; each entry needs its own key`);
			const html = new Cite(item)
				.format('bibliography', { format: 'html', template: STYLE, lang: 'en-US' })
				.replace(/^[\s\S]*?<div[^>]*class="csl-entry"[^>]*>|<\/div>\s*<\/div>\s*$/g, '')
				.trim();
			entries.set(item.id, { key: item.id, html, text: plain(html), short: shortForm(item), file: name });
		}
	}
	cache = { stamp, entries };
	return entries;
}

/** Text of the formatted entry, for places that take plain text. */
function plain(/** @type {string} */ html) {
	return decode(html.replace(/<[^>]+>/g, ''));
}

/** Decode the few entities CSL output uses. */
export function decode(/** @type {string} */ text) {
	return text
		.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
		.replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&amp;/g, '&');
}

/**
 * The short form Chicago uses in notes after a full bibliography: surnames and
 * a short title, e.g. Morton, *Humankind*. Undefined without a title.
 * @returns {Short | undefined}
 */
function shortForm(/** @type {any} */ item) {
	const title = item['title-short'] ?? String(item.title ?? '').split(/[:?]\s/)[0];
	if (!title) return undefined;
	const people = item.author ?? item.editor ?? [];
	/** @type {string[]} */
	const names = people.map((/** @type {any} */ p) => p.literal ?? [p['non-dropping-particle'], p.family].filter(Boolean).join(' '));
	const author =
		names.length > 3 ? `${names[0]} et al.` : names.length === 3 ? `${names[0]}, ${names[1]}, and ${names[2]}` : names.join(' and ');
	const italic = ITALIC_TYPES.has(item.type);
	return { author, title: italic ? title.trim() : `“${title.trim()}”`, italic };
}
