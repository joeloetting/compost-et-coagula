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
//
// A reference to a figure or bibliography key that does not exist, or a figure
// id used twice, stops the build with a message naming the article. So does a
// figure without alt text. A figure in a published article with no credit or
// source, or a source but no rights statement, is reported as a warning.

const BIBLIOGRAPHY_HEADING = /^(bibliography|references|works cited)$/i;
// A key starts with a lowercase letter or digit, so a bracketed editorial note
// at the start of an entry, such as "[Anonymous]", is left alone.
const BIBLIOGRAPHY_KEY = /^\[([a-z0-9][\w.:-]*)\]\s+/;
// A citation in a footnote: a key, then optionally a comma and a locator.
// Bracketed text that is not a key, such as [sic], is left alone; a key-like
// word with a digit or hyphen that matches no entry stops the build.
const CITATION = /\[([a-z0-9][\w.:-]*)(?:,\s*([^\]]+?))?\s*\]/g;
const KEY_LIKE = /[\d-]/;

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
	return { figures: ctx.data.figures, bibliography: ctx.data.bibliography };
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

/** @type {import('satteri').MdastPluginInstance & { name: string }} */
const resolveCitations = {
	name: 'resolve-citations',
	text(node, ctx) {
		if (!node.value.includes('[') || !inFootnote(node, ctx)) return;
		const { bibliography } = state(ctx);
		/** @type {any[]} */
		const parts = [];
		let last = 0;
		for (const match of node.value.matchAll(CITATION)) {
			const [whole, key, locator] = match;
			const entry = bibliography.get(key);
			if (!entry) {
				if (KEY_LIKE.test(key)) fail(ctx, `the citation [${key}] in a footnote does not match any bibliography entry starting with [${key}]`);
				continue;
			}
			if (match.index > last) parts.push({ type: 'text', value: node.value.slice(last, match.index) });
			const tail = locator ? `, ${locator.trim()}` : '';
			const children = entry.short
				? [
						{ type: 'text', value: `${entry.short.author}, ` },
						entry.short.italic ? { type: 'emphasis', children: [{ type: 'text', value: entry.short.title }] } : { type: 'text', value: entry.short.title },
						...(tail ? [{ type: 'text', value: tail }] : []),
					]
				: [{ type: 'text', value: entry.text.replace(/\.$/, '') + tail }];
			parts.push({ type: 'link', url: `#ref-${key}`, children, data: { hProperties: { className: ['citation'], dataCite: key } } });
			last = match.index + whole.length;
		}
		if (!parts.length) return;
		if (last < node.value.length) parts.push({ type: 'text', value: node.value.slice(last) });
		ctx.replaceNode(node, parts);
	},
};

/** @param {any} node @param {any} ctx */
function resolve(node, ctx) {
	const { figures, bibliography } = state(ctx);
	if (node.name === 'FigureRef') {
		const to = stringAttribute(node, 'to', ctx);
		if (!to) fail(ctx, '<FigureRef> needs to="..." naming a figure id');
		if (!figures.ids.has(to)) fail(ctx, `<FigureRef to="${to}"> does not match any <Figure id="${to}">`);
		ctx.replaceNode(node, withAttributes(node, { number: String(figures.ids.get(to)) }));
	} else if (node.name === 'Figure') {
		const cite = stringAttribute(node, 'cite', ctx);
		if (!cite) return;
		if (!bibliography.has(cite)) fail(ctx, `<Figure cite="${cite}"> does not match any bibliography entry starting with [${cite}]`);
		ctx.replaceNode(node, withAttributes(node, { citeText: bibliography.get(cite).text }));
	}
}

/** @type {import('satteri').MdastPluginInstance & { name: string }} */
const resolveReferences = {
	name: 'resolve-references',
	mdxJsxFlowElement: resolve,
	mdxJsxTextElement: resolve,
};

export const figurePlugins = [numberFigures, bibliographyKeys, resolveReferences, resolveCitations];
