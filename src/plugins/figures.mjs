// Build-time support for scientific figures in articles. Three Markdown (mdast)
// passes, run in order, so that references can appear before the figure or the
// bibliography entry they point to:
//
//   1. number-figures: numbers every <Figure> in an .mdx article in document
//      order (1, 2, 3, ...) and passes the number to the component.
//   2. bibliography-keys: in a list directly after a heading named Bibliography,
//      References, or Works Cited, an entry that starts with a key such as
//      [@smith-1909] gets the anchor id "ref-smith-1909", and the key is removed.
//   3. resolve-references: gives each <FigureRef to="..."> the number of its
//      figure, and each <Figure cite="..."> the text of its bibliography entry.
//
// A reference to a figure or bibliography key that does not exist, or a figure
// id used twice, stops the build with a message naming the article.

const BIBLIOGRAPHY_HEADING = /^(bibliography|references|works cited)$/i;
const BIBLIOGRAPHY_KEY = /^\[@([\w.:-]+)\]\s*/;

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

/** @param {any} ctx */
function state(ctx) {
	ctx.data.figures ??= { count: 0, ids: new Map() };
	ctx.data.bibliography ??= new Map();
	return { figures: ctx.data.figures, bibliography: ctx.data.bibliography };
}

/** @type {import('satteri').MdastPluginInstance & { name: string }} */
const numberFigures = {
	name: 'number-figures',
	mdxJsxFlowElement(node, ctx) {
		if (node.name !== 'Figure' || attribute(node, 'unnumbered')) return;
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
			const match = text?.type === 'text' ? BIBLIOGRAPHY_KEY.exec(text.value) : null;
			if (!text || !match) continue;
			const key = match[1];
			if (bibliography.has(key)) fail(ctx, `two bibliography entries have the key [@${key}]`);
			bibliography.set(key, ctx.textContent(item).replace(BIBLIOGRAPHY_KEY, '').trim());
			ctx.replaceNode(text, { type: 'text', value: text.value.slice(match[0].length) });
			ctx.setProperty(item, 'data', { hProperties: { id: `ref-${key}` } });
		}
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
		if (!bibliography.has(cite)) fail(ctx, `<Figure cite="${cite}"> does not match any bibliography entry starting with [@${cite}]`);
		ctx.replaceNode(node, withAttributes(node, { citeText: bibliography.get(cite) }));
	}
}

/** @type {import('satteri').MdastPluginInstance & { name: string }} */
const resolveReferences = {
	name: 'resolve-references',
	mdxJsxFlowElement: resolve,
	mdxJsxTextElement: resolve,
};

export const figurePlugins = [numberFigures, bibliographyKeys, resolveReferences];
