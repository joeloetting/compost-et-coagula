// Build-time support for scientific figures in articles. Three Markdown (mdast)
// passes, run in order, so that references can appear before the figure or the
// bibliography entry they point to:
//
//   1. number-figures: numbers every <Figure> in an .mdx article in document
//      order (1, 2, 3, ...) and passes the number to the component.
//   2. bibliography-keys: in a list directly after a heading named Bibliography,
//      References, or Works Cited, an entry that starts with a key such as
//      [smith-1909] gets the anchor id "ref-smith-1909", and the key is removed.
//      Keys are bare, without Pandoc's "@": in Pandoc and Zettlr, [@smith-1909]
//      is a citation that citeproc would replace, while [smith-1909] stays
//      plain text, so an article still reads correctly in those tools.
//   3. resolve-references: gives each <FigureRef to="..."> the number of its
//      figure, and each <Figure cite="..."> the text of its bibliography entry.
//      In a footnote, a citation written as [smith-1909] or [smith-1909, 45]
//      becomes a short note ("Smith, *Title*, 45") built from the entry and
//      linked to it; src/plugins/apparatus.mjs links the entry back.
//   4. resolve-citations also reads citations written as in Pandoc and
//      Zettlr, [@key], [@key, 45], or [see @key, 45; @other], with keys from
//      the article's own bibliography list or from the .bib library in
//      src/data/ (src/plugins/bibtex.mjs). In a footnote such a citation is
//      set in place; in the text it becomes a footnote of its own. Library
//      entries an article cites are listed under its Bibliography, which is
//      added at the end when the article has none, so the same file reads
//      the same in Zettlr and on the site.
//
// A reference to a figure or bibliography key that does not exist, a citation
// key found in neither the article nor the library, or a figure
// id used twice, stops the build with a message naming the article. So does a
// figure without alt text. A figure in a published article with no credit or
// source, or a source but no rights statement, is reported as a warning.

import { decode, library } from './bibtex.mjs';

const BIBLIOGRAPHY_HEADING = /^(bibliography|references|works cited)$/i;
// A key starts with a lowercase letter or digit, so a bracketed editorial note
// at the start of an entry, such as "[Anonymous]", is left alone.
const BIBLIOGRAPHY_KEY = /^\[([a-z0-9][\w.:-]*)\]\s+/;
// A citation in a footnote: a key, then optionally a comma and a locator.
// Bracketed text that is not a key, such as [sic], is left alone; a key-like
// word with a digit or hyphen that matches no entry stops the build.
const CITATION = /\[([a-z0-9][\w.:-]*)(?:,\s*([^\]]+?))?\s*\]/g;
const KEY_LIKE = /[\d-]/;
// A citation as written in Pandoc and Zettlr: brackets around one or more
// items separated by semicolons, each "prefix @key, locator", e.g.
// [see @morton2017, 45; @turner1969]. Bracketed text whose items are not all
// of this form, such as an e-mail address, is left alone.
const PANDOC_CLUSTER = /\[([^[\]]*@[^[\]]*)\]/g;
const PANDOC_ITEM = /^\s*(?:(.*?)\s+)?-?@([\p{L}\p{N}_](?:[\p{L}\p{N}_:.#$%&+?<>~/-]*[\p{L}\p{N}_])?)\s*(?:,\s*(.*?))?\s*$/u;

/** @param {any} node @param {string} name */
function attribute(node, name) {
	return node.attributes.find((/** @type {any} */ a) => a.type === 'mdxJsxAttribute' && a.name === name);
}

/** A plain string attribute value; expressions such as id={x} cannot be resolved at build time. */
function stringAttribute(/** @type {any} */ node, /** @type {string} */ name, /** @type {any} */ ctx) {
	const attr = attribute(node, name);
	if (!attr || attr.value == null) return undefined;
	if (typeof attr.value !== 'string') fail(ctx, `<${node.name} ${name}={...}> must be a plain string, e.g. ${name}="map"`);
	return attr.value;
}

/** Copy of a JSX element with extra string attributes. */
function withAttributes(/** @type {any} */ node, /** @type {Record<string, string>} */ extra) {
	return {
		type: node.type,
		name: node.name,
		attributes: [
			...node.attributes,
			...Object.entries(extra).map(([name, value]) => ({ type: 'mdxJsxAttribute', name, value })),
		],
		children: node.children,
	};
}

/** @returns {never} */
function fail(/** @type {any} */ ctx, /** @type {string} */ message) {
	const file = ctx.fileURL ? ctx.fileURL.pathname.replace(/^.*\/src\//, 'src/') : 'an article';
	throw new Error(`${file}: ${message}`);
}

/** A warning naming the article, for problems that should not stop the build. */
function warn(/** @type {any} */ ctx, /** @type {string} */ message) {
	const file = ctx.fileURL ? ctx.fileURL.pathname.replace(/^.*\/src\//, 'src/') : 'an article';
	console.warn(`[warn] ${file}: ${message}`);
}

/** @param {any} ctx */
function state(ctx) {
	ctx.data.figures ??= { count: 0, ids: new Map() };
	ctx.data.bibliography ??= new Map();
	ctx.data.citations ??= { fromLibrary: new Set(), notes: [] };
	return { figures: ctx.data.figures, bibliography: ctx.data.bibliography, citations: ctx.data.citations };
}

/**
 * Alt text is required everywhere. In a published article, a numbered figure
 * should also say who made it or where it comes from, and a figure taken from
 * a source should state its rights, so it can be attributed and verified.
 */
function checkFigure(/** @type {any} */ node, /** @type {any} */ ctx) {
	const id = stringAttribute(node, 'id', ctx);
	const name = id ? `<Figure id="${id}">` : 'a <Figure> without an id';
	if (!attribute(node, 'alt')) fail(ctx, `${name} needs alt="..." describing the image (alt="" only if it is purely decorative)`);
	if (ctx.data.astro?.frontmatter?.draft === true || attribute(node, 'unnumbered')) return;
	const sourced = ['source', 'sourceUrl', 'cite'].some((a) => attribute(node, a));
	if (!sourced && !attribute(node, 'credit')) warn(ctx, `${name} has no credit or source; add credit="..." and source/sourceUrl/cite`);
	else if (sourced && !attribute(node, 'license')) warn(ctx, `${name} has a source but no rights statement; add license="..." (e.g. "Public domain")`);
}

/** @type {import('satteri').MdastPluginInstance & { name: string }} */
const numberFigures = {
	name: 'number-figures',
	mdxJsxFlowElement(node, ctx) {
		if (node.name !== 'Figure') return;
		checkFigure(node, ctx);
		if (attribute(node, 'unnumbered')) return;
		const { figures } = state(ctx);
		const number = ++figures.count;
		const id = stringAttribute(node, 'id', ctx);
		if (id) {
			if (figures.ids.has(id)) fail(ctx, `two figures have id="${id}"`);
			figures.ids.set(id, number);
		}
		ctx.replaceNode(node, withAttributes(node, { number: String(number) }));
	},
};

/** @type {import('satteri').MdastPluginInstance & { name: string }} */
const bibliographyKeys = {
	name: 'bibliography-keys',
	list(node, ctx) {
		const parent = ctx.parent(node);
		const index = ctx.indexOf(node);
		const previous = parent && index ? parent.children[index - 1] : undefined;
		if (previous?.type !== 'heading' || !BIBLIOGRAPHY_HEADING.test(ctx.textContent(previous).trim())) return;
		const { bibliography } = state(ctx);
		for (const item of node.children) {
			const first = item.children[0];
			const text = first?.type === 'paragraph' ? first.children[0] : undefined;
			if (text?.type === 'text' && text.value.startsWith('[@'))
				fail(ctx, `bibliography keys are written without "@", e.g. [smith-1909], so Pandoc does not read them as citations: ${text.value.split(']')[0]}]`);
			const match = text?.type === 'text' ? BIBLIOGRAPHY_KEY.exec(text.value) : null;
			if (!text || !match) continue;
			const key = match[1];
			if (bibliography.has(key)) fail(ctx, `two bibliography entries have the key [${key}]`);
			bibliography.set(key, { text: ctx.textContent(item).replace(BIBLIOGRAPHY_KEY, '').trim(), short: shortForm(first, match[0].length, ctx) });
			ctx.replaceNode(text, { type: 'text', value: text.value.slice(match[0].length) });
			ctx.setProperty(item, 'data', { hProperties: { id: `ref-${key}` } });
		}
	},
};

/**
 * The short form of a bibliography entry for notes: the author's surname and a
 * short title, e.g. "Morton, *Humankind*" from "Morton, Timothy. *Humankind:
 * Solidarity with Nonhuman People*. London: Verso, 2017." Titles are the first
 * italic text or the first quoted text. Undefined when no title is found; the
 * note then shows the whole entry.
 * @returns {{ author: string, title: string, italic: boolean } | undefined}
 */
function shortForm(/** @type {any} */ paragraph, /** @type {number} */ keyLength, /** @type {any} */ ctx) {
	const lead = paragraph.children[0].value.slice(keyLength);
	const author = /^([^,.]+)/.exec(lead)?.[1].trim();
	if (!author) return undefined;
	const closed = author.startsWith('[') && !author.includes(']') ? `${author}]` : author;
	const emphasis = paragraph.children.find((/** @type {any} */ c) => c.type === 'emphasis');
	const quoted = /[“"]([^”"]+?)[.,]?[”"]/.exec(ctx.textContent(paragraph));
	if (emphasis) return { author: closed, title: ctx.textContent(emphasis).split(':')[0].trim(), italic: true };
	if (quoted) return { author: closed, title: `“${quoted[1].split(':')[0].trim()}”`, italic: false };
	return undefined;
}

/** Whether a node sits inside a footnote definition. */
function inFootnote(/** @type {any} */ node, /** @type {any} */ ctx) {
	for (let p = ctx.parent(node); p; p = ctx.parent(p)) if (p.type === 'footnoteDefinition') return true;
	return false;
}

/** A bibliography entry by key: the article's own list first, then the .bib library. */
function lookup(/** @type {string} */ key, /** @type {any} */ ctx) {
	const { bibliography, citations } = state(ctx);
	const own = bibliography.get(key);
	if (own) return own;
	const entry = library().get(key);
	if (entry) citations.fromLibrary.add(key);
	return entry;
}

/** A Pandoc locator as Chicago prints it in a note: "p. 45" and "pp. 3-5" become 45 and 3–5. */
function locatorText(/** @type {string | undefined} */ locator) {
	if (!locator) return '';
	return locator
		.trim()
		.replace(/^(?:p|pp|page|pages)\.?\s+/i, '')
		.replace(/(\d)-(\d)/g, '$1–$2');
}

/**
 * A citation as a short note linked to its bibliography entry. A comma or
 * period that follows a quoted title goes inside the closing quotation mark,
 * as Chicago has it: Smith, “Soil and Memory,” 101.
 */
function citationLink(/** @type {string} */ key, /** @type {any} */ entry, /** @type {string | undefined} */ locator, end = '') {
	const shown = locator?.trim() ?? '';
	/** @type {any[]} */
	let children;
	if (entry.short) {
		const { author, title, italic } = entry.short;
		const after = shown ? ',' : end;
		const quoted = !italic && title.endsWith('”');
		const titleText = quoted ? `${title.slice(0, -1)}${after}”` : title;
		children = [
			...(author ? [{ type: 'text', value: `${author}, ` }] : []),
			italic ? { type: 'emphasis', children: [{ type: 'text', value: titleText }] } : { type: 'text', value: titleText },
			...(quoted ? [] : after ? [{ type: 'text', value: after }] : []),
			...(shown ? [{ type: 'text', value: ` ${shown}${end}` }] : []),
		];
	} else {
		children = [{ type: 'text', value: entry.text.replace(/\.$/, '') + (shown ? `, ${shown}` : '') + end }];
	}
	return { type: 'link', url: `#ref-${key}`, children, data: { hProperties: { className: ['citation'], dataCite: key } } };
}

/**
 * The items of a Pandoc citation, or undefined when the brackets hold
 * something else. Stops the build on a key found nowhere.
 */
function pandocCitation(/** @type {string} */ inner, /** @type {string} */ whole, /** @type {any} */ ctx, end = '') {
	const items = inner.split(';').map((item) => PANDOC_ITEM.exec(item));
	if (items.some((item) => !item)) return undefined;
	/** @type {any[]} */
	const nodes = [];
	for (const [i, match] of items.entries()) {
		const [, prefix, key, locator] = /** @type {RegExpExecArray} */ (match);
		const entry = lookup(key, ctx);
		if (!entry) {
			fail(ctx, `the citation ${whole} names @${key}, which is in neither the article's bibliography nor a .bib file in src/data/. Check the key, or export it again from the library.`);
		}
		if (i > 0) nodes.push({ type: 'text', value: '; ' });
		if (prefix) nodes.push({ type: 'text', value: `${prefix} ` });
		nodes.push(citationLink(key, entry, locatorText(locator), i === items.length - 1 ? end : ''));
	}
	return nodes;
}

/** @type {import('satteri').MdastPluginInstance & { name: string }} */
const resolveCitations = {
	name: 'resolve-citations',
	text(node, ctx) {
		if (!node.value.includes('[')) return;
		const footnote = inFootnote(node, ctx);
		const { citations } = state(ctx);
		const matches = [...node.value.matchAll(PANDOC_CLUSTER), ...(footnote ? node.value.matchAll(CITATION) : [])].sort((x, y) => (x.index ?? 0) - (y.index ?? 0));
		/** @type {any[]} */
		const parts = [];
		let last = 0;
		for (const match of matches) {
			const index = match.index ?? 0;
			if (index < last) continue;
			const [whole, inner, locator] = match;
			/** @type {any[] | undefined} */
			let nodes;
			if (inner.includes('@')) {
				nodes = pandocCitation(inner, whole, ctx, footnote ? '' : '.');
				if (!nodes) continue;
				if (!footnote) {
					// In the text, a citation becomes a note of its own, as in Pandoc
					// with a note style: the space before it is dropped, and the note
					// number follows any punctuation after it.
					const first = nodes[0];
					if (first.type === 'text') first.value = first.value[0].toUpperCase() + first.value.slice(1);
					else if (first.children[0]?.type === 'text') first.children[0].value = first.children[0].value[0].toUpperCase() + first.children[0].value.slice(1);
					const label = `cite-${citations.notes.length + 1}`;
					citations.notes.push({ type: 'footnoteDefinition', identifier: label, label, children: [{ type: 'paragraph', children: nodes }] });
					const before = node.value.slice(last, index).replace(/\s+$/, '');
					const punctuation = /^[.,;:!?”’)]+/.exec(node.value.slice(index + whole.length))?.[0] ?? '';
					parts.push({ type: 'text', value: before + punctuation }, { type: 'footnoteReference', identifier: label, label });
					last = index + whole.length + punctuation.length;
					continue;
				}
			} else {
				const entry = state(ctx).bibliography.get(inner);
				if (!entry) {
					if (KEY_LIKE.test(inner)) fail(ctx, `the citation [${inner}] in a footnote does not match any bibliography entry starting with [${inner}]`);
					continue;
				}
				nodes = [citationLink(inner, entry, locator)];
			}
			if (index > last) parts.push({ type: 'text', value: node.value.slice(last, index) });
			parts.push(...nodes);
			last = index + whole.length;
		}
		if (!parts.length) return;
		if (last < node.value.length) parts.push({ type: 'text', value: node.value.slice(last) });
		ctx.replaceNode(node, parts);
	},
	after(root, ctx) {
		const { citations } = state(ctx);
		if (citations.notes.length) ctx.appendChild(root, citations.notes);
		if (!citations.fromLibrary.size) return;
		// Library entries the article cites, alphabetically, after any entries
		// written in the article's own list, or under a new Bibliography.
		const items = [...citations.fromLibrary]
			.map((key) => library().get(key))
			.sort((x, y) => (x?.text ?? '').localeCompare(y?.text ?? ''))
			.map((entry) => ({
				type: 'listItem',
				spread: false,
				children: [{ type: 'paragraph', children: htmlToMdast(entry?.html ?? '') }],
				data: { hProperties: { id: `ref-${entry?.key}` } },
			}));
		const children = /** @type {any[]} */ (root.children);
		const heading = children.findIndex((child) => child.type === 'heading' && BIBLIOGRAPHY_HEADING.test(ctx.textContent(child).trim()));
		const list = heading >= 0 && children[heading + 1]?.type === 'list' ? children[heading + 1] : undefined;
		if (list) ctx.appendChild(list, items);
		else
			ctx.appendChild(root, [
				{ type: 'heading', depth: 2, children: [{ type: 'text', value: 'Bibliography' }] },
				{ type: 'list', ordered: false, spread: false, children: items },
			]);
	},
};

/** Markdown for a CSL-formatted entry: italics, links, and text. */
function htmlToMdast(/** @type {string} */ html) {
	/** @type {any[]} */
	const out = [];
	/** @type {any[][]} */
	const stack = [out];
	for (const [, tag, close, name, attrs, text] of html.matchAll(/(<(\/?)(\w+)([^>]*)>)|([^<]+)/g)) {
		const current = stack[stack.length - 1];
		if (text) {
			// Bare web addresses (DOIs, URLs) become links.
			const value = decode(text);
			let last = 0;
			for (const url of value.matchAll(/https?:\/\/[^\s<]+[^\s<.,;)]/g)) {
				const index = url.index ?? 0;
				if (index > last) current.push({ type: 'text', value: value.slice(last, index) });
				current.push({ type: 'link', url: url[0], children: [{ type: 'text', value: url[0] }] });
				last = index + url[0].length;
			}
			if (last < value.length) current.push({ type: 'text', value: value.slice(last) });
		} else if (tag && !close && (name === 'i' || name === 'em' || name === 'b' || name === 'a')) {
			const href = /href="([^"]*)"/.exec(attrs)?.[1];
			const node = name === 'a' && href ? { type: 'link', url: decode(href), children: [] } : { type: name === 'b' ? 'strong' : 'emphasis', children: [] };
			current.push(node);
			stack.push(node.children);
		} else if (tag && close && (name === 'i' || name === 'em' || name === 'b' || name === 'a') && stack.length > 1) {
			stack.pop();
		}
	}
	return out;
}

/** @param {any} node @param {any} ctx */
function resolve(node, ctx) {
	const { figures } = state(ctx);
	if (node.name === 'FigureRef') {
		const to = stringAttribute(node, 'to', ctx);
		if (!to) fail(ctx, '<FigureRef> needs to="..." naming a figure id');
		if (!figures.ids.has(to)) fail(ctx, `<FigureRef to="${to}"> does not match any <Figure id="${to}">`);
		ctx.replaceNode(node, withAttributes(node, { number: String(figures.ids.get(to)) }));
	} else if (node.name === 'Figure') {
		const cite = stringAttribute(node, 'cite', ctx);
		if (!cite) return;
		const entry = lookup(cite, ctx);
		if (!entry) fail(ctx, `<Figure cite="${cite}"> does not match any bibliography entry starting with [${cite}], or any key in a .bib file in src/data/`);
		ctx.replaceNode(node, withAttributes(node, { citeText: entry.text }));
	}
}

/** @type {import('satteri').MdastPluginInstance & { name: string }} */
const resolveReferences = {
	name: 'resolve-references',
	mdxJsxFlowElement: resolve,
	mdxJsxTextElement: resolve,
};

export const figurePlugins = [numberFigures, bibliographyKeys, resolveReferences, resolveCitations];
