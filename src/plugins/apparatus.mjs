// The critical apparatus: turns Markdown footnotes into marginalia by a prefix
// at the start of the footnote text, so articles stay plain Markdown.
//
//   Text.[^a]          [^a]: An ordinary footnote, listed under Notes.
//   Text.[^b]          [^b]: [footnote] The same; the prefix is optional.
//   Text.[^c]          [^c]: [margin] A short interpretive observation.
//   Text.[^d]          [^d]: [crossref] See [](/writing/another-essay/).
//   Text.[^e]          [^e]: [editorial] What was corrected, and when.
//
// [margin] and [crossref] notes are set beside the line that refers to them:
// in the margin on wide screens, and behind a small mark that opens a popover
// on narrow ones (see src/styles/edition.css). [editorial] notes are collected
// at the end of the article, with a mark in the text linking to each. The
// remaining footnotes are renumbered so their numbers stay consecutive.
//
// Also, for every article: links that start with "/" get the site's base path,
// and a cross-reference link to /writing/<slug>/ or /projects/<slug>/ is checked
// against src/content/. A missing target stops the build; an empty link text
// is filled with the target's title; and a target that is still a draft is
// named without a link in production builds.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const PREFIX = /^\s*\[(footnote|margin|crossref|editorial)\]\s*/i;
const INTERNAL = /^\/(writing|projects)\/([^/#?]+)\/?(?:[#?].*)?$/;

/** @typedef {{ type: string, tagName?: string, properties?: Record<string, any>, children?: Node[], value?: string }} Node */

/** @returns {never} */
function fail(/** @type {any} */ ctx, /** @type {string} */ message) {
	const file = ctx.fileURL ? ctx.fileURL.pathname.replace(/^.*\/src\//, 'src/') : 'an article';
	throw new Error(`${file}: ${message}`);
}

const el = (/** @type {string} */ tagName, /** @type {Record<string, any>} */ properties, /** @type {Node[]} */ children = []) => ({
	type: 'element',
	tagName,
	properties,
	children,
});
const text = (/** @type {string} */ value) => ({ type: 'text', value });
const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');

/** Every element in document order, with its parent. */
function* elements(/** @type {any} */ node, /** @type {any} */ parent = undefined) {
	if (node.type === 'element') yield { node, parent };
	for (const child of node.children ?? []) yield* elements(child, node);
}

/** Front-matter title and draft flag of a content entry, read from its file. */
function readEntry(/** @type {string} */ dir, /** @type {string} */ slug) {
	const file = ['.md', '.mdx'].map((ext) => join(dir, slug + ext)).find((path) => existsSync(path));
	if (!file) return undefined;
	const frontmatter = readFileSync(file, 'utf8').split(/^---\s*$/m)[1] ?? '';
	const title = /^title:\s*(.+?)\s*$/m.exec(frontmatter)?.[1].replace(/^(['"])(.*)\1$/, '$2') ?? slug;
	return { title, draft: /^draft:\s*true\s*$/m.test(frontmatter) };
}

/**
 * @param {{ base: string, contentDir: string, production: boolean }} options
 * @returns {import('satteri').HastVisitorInstance & { name: string }}
 */
export function apparatus({ base, contentDir, production }) {
	const prefixBase = (/** @type {string} */ href) =>
		href.startsWith('/') && !href.startsWith('//') && !href.startsWith(`${base}/`) ? base + href : href;

	/** Plain copy of note content, with base paths added and cross-references resolved. */
	function copy(/** @type {any} */ node, /** @type {any} */ ctx, /** @type {boolean} */ crossref) {
		if (node.type === 'text') return text(node.value);
		if (node.type !== 'element') return undefined;
		const properties = { ...node.properties };
		let children = (node.children ?? []).map((/** @type {any} */ c) => copy(c, ctx, crossref)).filter(Boolean);
		if (node.tagName === 'a' && typeof properties.href === 'string') {
			const match = crossref ? INTERNAL.exec(properties.href) : null;
			if (match) {
				const [, collection, slug] = match;
				const entry = readEntry(join(contentDir, collection), slug);
				if (!entry) fail(ctx, `cross-reference to ${properties.href}, but there is no src/content/${collection}/${slug}.md or .mdx`);
				if (!ctx.textContent(node).trim()) children = [text(entry.title)];
				if (production && entry.draft) {
					return el('span', { className: ['crossref-pending'] }, [...children, text(' (not yet published)')]);
				}
			}
			properties.href = prefixBase(properties.href);
		}
		return el(node.tagName, properties, children);
	}

	/** A footnote's content as inline nodes: backrefs dropped, prefix stripped, paragraphs as spans. */
	function noteContent(/** @type {any} */ li, /** @type {any} */ ctx, /** @type {string} */ kind, /** @type {boolean} */ inline) {
		const blocks = li.children.filter((/** @type {any} */ c) => c.type === 'element');
		if (inline && blocks.some((/** @type {any} */ b) => b.tagName !== 'p')) {
			fail(ctx, `a [${kind}] note can contain only paragraphs (no lists, quotations, or code)`);
		}
		return blocks.map((/** @type {any} */ block, /** @type {number} */ i) => {
			const content = copy(block, ctx, kind === 'crossref');
			const kids = /** @type {Node[]} */ (content?.children ?? []);
			// Drop the "↩" backlink and the space before it.
			const back = kids.findIndex((k) => k.properties && 'dataFootnoteBackref' in k.properties);
			if (back >= 0) {
				kids.splice(back, 1);
				const last = kids[back - 1];
				if (last?.type === 'text') last.value = /** @type {string} */ (last.value).replace(/\s+$/, '');
			}
			if (i === 0 && kids[0]?.type === 'text') kids[0].value = /** @type {string} */ (kids[0].value).replace(PREFIX, '');
			return inline ? el('span', { className: ['note-para'] }, kids) : /** @type {Node} */ (content);
		});
	}

	return {
		name: 'critical-apparatus',
		before(root, ctx) {
			const all = [...elements(root)];
			const section = all.find(({ node }) => node.tagName === 'section' && node.properties?.dataFootnotes)?.node;

			// Footnote definitions by id, with the kind named by their prefix.
			/** @type {Map<string, { li: any, kind: string }>} */
			const notes = new Map();
			for (const { node } of section ? elements(section) : []) {
				if (node.tagName !== 'li' || !node.properties?.id) continue;
				const first = node.children.find((/** @type {any} */ c) => c.type === 'element');
				const lead = first?.children?.[0];
				const kind = lead?.type === 'text' ? PREFIX.exec(lead.value)?.[1].toLowerCase() : undefined;
				notes.set(node.properties.id, { li: node, kind: kind ?? 'footnote' });
				// An explicit [footnote] stays a footnote, without its prefix.
				if (kind === 'footnote') ctx.replaceNode(lead, text(lead.value.replace(PREFIX, '')));
			}
			const moved = new Set([...notes.values()].filter((n) => n.kind !== 'footnote').map((n) => n.li));
			const insideMoved = (/** @type {any} */ node) => {
				for (const li of moved) if ([...elements(li)].some((e) => e.node === node)) return true;
				return false;
			};

			const editorial = [...notes.values()].filter((n) => n.kind === 'editorial');
			const refs = all.filter(({ node }) => node.tagName === 'a' && node.properties?.dataFootnoteRef);
			const seen = new Set();
			/** @type {Map<string, number>} */
			const footnoteNumbers = new Map();
			let margin = 0;
			let anchor = 0;
			/** @type {Node[]} */
			const editorialItems = [];

			for (const { node: a, parent: sup } of refs) {
				const id = decodeURIComponent(String(a.properties.href).slice(1));
				const note = notes.get(id);
				if (!note) continue;

				if (note.kind === 'footnote') {
					// Renumber what is left in order of first reference.
					if (!footnoteNumbers.has(id)) footnoteNumbers.set(id, footnoteNumbers.size + 1);
					const n = footnoteNumbers.get(id);
					const label = a.children.find((/** @type {any} */ c) => c.type === 'text');
					if (label && label.value !== String(n)) ctx.replaceNode(label, text(String(n)));
					continue;
				}

				if (seen.has(id)) fail(ctx, `the [${note.kind}] note ${id.replace(/^user-content-fn-/, '[^')}] is referred to more than once`);
				seen.add(id);

				if (note.kind === 'editorial') {
					const n = editorialItems.length + 1;
					const label = editorial.length > 1 ? `ed. ${n}` : 'ed.';
					ctx.replaceNode(
						sup,
						el('sup', {}, [
							el('a', { href: `#editorial-note-${n}`, id: `editorial-ref-${n}`, className: ['editorial-ref'], ariaLabel: `Editorial note ${n}` }, [
								text(label),
							]),
						]),
					);
					const [first, ...rest] = noteContent(note.li, ctx, 'editorial', false);
					first.children = [
						...(first.children ?? []),
						text(' '),
						el('a', { href: `#editorial-ref-${n}`, className: ['editorial-backref'], ariaLabel: `Back to editorial mark ${n}` }, [text('↩')]),
					];
					editorialItems.push(el('li', { id: `editorial-note-${n}` }, [first, ...rest]));
					continue;
				}

				// Marginal note or cross-reference, at the point of reference.
				const isMargin = note.kind === 'margin';
				const n = isMargin ? ++margin : 0;
				const noteId = `note-${++anchor}`;
				const name = isMargin ? `Marginal note ${n}` : 'Cross-reference';
				ctx.replaceNode(sup, [
					el(
						'button',
						{
							type: 'button',
							className: ['note-mark', `note-mark--${note.kind}`],
							popovertarget: noteId,
							ariaLabel: name,
							style: `anchor-name: --${noteId}`,
						},
						[text(isMargin ? `note ${n}` : 'see')],
					),
					el('span', { id: noteId, className: ['note', `note--${note.kind}`], popover: 'auto', role: 'note', style: `position-anchor: --${noteId}` }, [
						el('span', { className: ['note-label'] }, [text(isMargin ? `Marginal note ${pad(n)}` : 'Cross-reference')]),
						text(' '),
						...noteContent(note.li, ctx, note.kind, true),
					]),
				]);
			}

			// Base paths on ordinary links (moved notes were handled when copied).
			for (const { node } of all) {
				if (node.tagName !== 'a' || typeof node.properties?.href !== 'string') continue;
				const href = prefixBase(node.properties.href);
				if (href !== node.properties.href && !insideMoved(node)) ctx.setProperty(node, 'href', href);
			}

			if (!section) return;
			// Backlink labels ("Back to reference 3") follow the new numbers.
			for (const [id, n] of footnoteNumbers) {
				for (const { node: a } of elements(/** @type {any} */ (notes.get(id)).li)) {
					const label = a.properties?.ariaLabel;
					if (a.tagName === 'a' && 'dataFootnoteBackref' in a.properties && typeof label === 'string') {
						const renumbered = label.replace(/\d+/, String(n));
						if (renumbered !== label) ctx.setProperty(a, 'ariaLabel', renumbered);
					}
				}
			}
			const remaining = [...notes.values()].filter((n) => n.kind === 'footnote').length;
			const editorialSection =
				editorialItems.length > 0
					? el('section', { className: ['editorial-notes'], ariaLabelledBy: ['editorial-notes-label'] }, [
							el('h2', { id: 'editorial-notes-label' }, [text(editorialItems.length > 1 ? 'Editorial notes' : 'Editorial note')]),
							el('ol', {}, editorialItems),
						])
					: undefined;
			if (remaining === 0) {
				ctx.replaceNode(section, editorialSection ? [editorialSection] : []);
				return;
			}
			for (const li of moved) ctx.removeNode(li);
			if (editorialSection) ctx.insertAfter(section, editorialSection);
		},
	};
}
