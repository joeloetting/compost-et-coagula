// Marginal notes from Markdown footnotes, so articles stay plain Markdown:
//
//   Text.[^a]          [^a]: An ordinary footnote, listed under Notes.
//   Text.[^b]          [^b]: [margin] A short interpretive observation.
//
// A footnote whose text starts with [margin] is set beside the line that refers
// to it: in the margin on wide screens, and behind a small mark that opens a
// popover on narrow ones (see src/styles/edition.css). The remaining footnotes
// are renumbered so their numbers stay consecutive. A [footnote] prefix is also
// accepted, and removed, for writing tools that expect every note to have one.
//
// A margin note may carry its own label in place of "Marginal note 01":
//
//   [^c]: [margin: ☞ Obs.] Disturbance is not contamination.
//
// The label must include words, so a reader never has to know what a mark
// means. A leading editorial mark (☞ ? ↗ † ※) is set apart for styling and
// hidden from screen readers, which read the words after it.
//
// Also, for every article: links that start with "/" get the site's base path,
// so `[another essay](/writing/another-essay/)` works as written.

const PREFIX = /^\s*\[(footnote|margin)(?::\s*([^\]]*?)\s*)?\]\s*/i;
// Editorial marks, and the class each gives its note (see edition.css).
const MARKS = new Map([
	['☞', 'observation'],
	['?', 'question'],
	['↗', 'see-also'],
	['†', 'qualification'],
	['※', 'commentary'],
]);

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

/**
 * @param {{ base: string }} options
 * @returns {import('satteri').HastVisitorInstance & { name: string }}
 */
export function apparatus({ base }) {
	const prefixBase = (/** @type {string} */ href) =>
		href.startsWith('/') && !href.startsWith('//') && !href.startsWith(`${base}/`) ? base + href : href;

	/** Plain copy of note content, with base paths added. */
	function copy(/** @type {any} */ node) {
		if (node.type === 'text') return text(node.value);
		if (node.type !== 'element') return undefined;
		const properties = { ...node.properties };
		if (node.tagName === 'a' && typeof properties.href === 'string') properties.href = prefixBase(properties.href);
		return el(node.tagName, properties, (node.children ?? []).map(copy).filter(Boolean));
	}

	/** A margin note's paragraphs as inline spans, without the backlink or prefix. */
	function noteContent(/** @type {any} */ li, /** @type {any} */ ctx) {
		const blocks = li.children.filter((/** @type {any} */ c) => c.type === 'element');
		if (blocks.some((/** @type {any} */ b) => b.tagName !== 'p')) {
			fail(ctx, 'a [margin] note can contain only paragraphs (no lists, quotations, or code)');
		}
		return blocks.map((/** @type {any} */ block, /** @type {number} */ i) => {
			const kids = /** @type {Node[]} */ (copy(block)?.children ?? []);
			// Drop the "↩" backlink and the space before it.
			const back = kids.findIndex((k) => k.properties && 'dataFootnoteBackref' in k.properties);
			if (back >= 0) {
				kids.splice(back, 1);
				const last = kids[back - 1];
				if (last?.type === 'text') last.value = /** @type {string} */ (last.value).replace(/\s+$/, '');
			}
			if (i === 0 && kids[0]?.type === 'text') kids[0].value = /** @type {string} */ (kids[0].value).replace(PREFIX, '');
			return el('span', { className: ['note-para'] }, kids);
		});
	}

	/** The label span: "Marginal note 01", or the author's own, with its mark set apart. */
	function noteLabel(/** @type {string | undefined} */ custom, /** @type {number} */ n, /** @type {any} */ ctx) {
		if (custom === undefined) return { label: el('span', { className: ['note-label'] }, [text(`Marginal note ${pad(n)}`)]) };
		if (!/\p{L}/u.test(custom)) {
			fail(ctx, `the margin label "[margin: ${custom}]" needs words as well as a mark, e.g. [margin: ☞ Observation]`);
		}
		const [, mark, words] = /** @type {RegExpExecArray} */ (/^([^\p{L}\p{N}\s]*)\s*(.*)$/u.exec(custom));
		const kind = MARKS.get(mark);
		return {
			kind,
			label: el('span', { className: ['note-label'] }, [
				...(mark ? [el('span', { className: ['note-sign'], ariaHidden: 'true' }, [text(mark)]), text(' ')] : []),
				text(words),
			]),
		};
	}

	return {
		name: 'marginal-notes',
		before(root, ctx) {
			const all = [...elements(root)];
			const section = all.find(({ node }) => node.tagName === 'section' && node.properties?.dataFootnotes)?.node;

			// Footnote definitions by id; margin notes are marked by their prefix.
			/** @type {Map<string, { li: any, margin: boolean, label?: string }>} */
			const notes = new Map();
			for (const { node } of section ? elements(section) : []) {
				if (node.tagName !== 'li' || !node.properties?.id) continue;
				const first = node.children.find((/** @type {any} */ c) => c.type === 'element');
				const lead = first?.children?.[0];
				const match = lead?.type === 'text' ? PREFIX.exec(lead.value) : null;
				const kind = match?.[1].toLowerCase();
				if (kind === 'footnote' && match?.[2] !== undefined) fail(ctx, 'only [margin] notes can have a label');
				notes.set(node.properties.id, { li: node, margin: kind === 'margin', label: match?.[2] });
				if (kind === 'footnote') ctx.replaceNode(lead, text(lead.value.replace(PREFIX, '')));
			}
			const moved = new Set([...notes.values()].filter((n) => n.margin).map((n) => n.li));
			const insideMoved = (/** @type {any} */ node) => [...moved].some((li) => [...elements(li)].some((e) => e.node === node));

			const seen = new Set();
			/** @type {Map<string, number>} */
			const footnoteNumbers = new Map();
			let margin = 0;

			for (const { node: a, parent: sup } of all.filter(({ node }) => node.tagName === 'a' && node.properties?.dataFootnoteRef)) {
				const id = decodeURIComponent(String(a.properties.href).slice(1));
				const note = notes.get(id);
				if (!note) continue;

				if (!note.margin) {
					// Renumber what is left in order of first reference.
					if (!footnoteNumbers.has(id)) footnoteNumbers.set(id, footnoteNumbers.size + 1);
					const n = String(footnoteNumbers.get(id));
					const label = a.children.find((/** @type {any} */ c) => c.type === 'text');
					if (label && label.value !== n) ctx.replaceNode(label, text(n));
					continue;
				}

				if (seen.has(id)) fail(ctx, `the [margin] note ${id.replace(/^user-content-fn-/, '[^')}] is referred to more than once`);
				seen.add(id);
				const n = ++margin;
				const noteId = `note-${n}`;
				const { label, kind } = noteLabel(note.label, n, ctx);
				ctx.replaceNode(sup, [
					el(
						'button',
						{
							type: 'button',
							className: ['note-mark'],
							popovertarget: noteId,
							ariaLabel: `Marginal note ${n}`,
							style: `anchor-name: --${noteId}`,
						},
						[text(`note ${n}`)],
					),
					el('span', { id: noteId, className: kind ? ['note', `note--${kind}`] : ['note'], popover: 'auto', role: 'note', style: `position-anchor: --${noteId}` }, [
						// Brackets and a colon for copies without the site's styles (feed
						// readers, plain-text extraction); hidden on the page itself.
						el('span', { className: ['note-punct'] }, [text(' [')]),
						label,
						el('span', { className: ['note-punct'] }, [text(':')]),
						text(' '),
						...noteContent(note.li, ctx),
						el('span', { className: ['note-punct'] }, [text(']')]),
					]),
				]);
			}

			// Base paths on ordinary links (margin notes were handled when copied).
			for (const { node } of all) {
				if (node.tagName !== 'a' || typeof node.properties?.href !== 'string') continue;
				const href = prefixBase(node.properties.href);
				if (href !== node.properties.href && !insideMoved(node)) ctx.setProperty(node, 'href', href);
			}

			if (!section || moved.size === 0) return;
			if (footnoteNumbers.size === 0) {
				ctx.removeNode(section);
				return;
			}
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
			for (const li of moved) ctx.removeNode(li);
		},
	};
}
