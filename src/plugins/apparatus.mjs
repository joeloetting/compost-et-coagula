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
// Later notes (the "living margin"): a footnote that starts with a type and a
// date is commentary added after publication, kept apart from the text:
//
//   Text.[^hope]       [^hope]: [↺ 2026-10-09] I would now put this differently.
//
// The types are ? (open question), ↺ (reconsideration), + (addition), and ×
// (correction); the words question, reconsideration, addition, and correction
// may be written instead of the symbols. The passage gets a small red mark that
// links to the note in a "Later notes" list at the end; on wide screens the
// note is also shown in the margin. A correction is announced at the top of the
// article as well, so it is found even by a reader who skips the notes. The
// footnote label (hope) is the note's stable id: #later-hope. A later note
// whose reference has been deleted with its passage stops the build
// (laterNoteTargets, below), rather than being silently dropped.
//
// Also, for every article: links that start with "/" get the site's base path,
// so `[another essay](/writing/another-essay/)` works as written. Citations
// in footnotes (src/plugins/figures.mjs) are linked back from their
// bibliography entries ("Cited in note 2").

const PREFIX = /^\s*\[(footnote|margin)(?::\s*([^\]]*?)\s*)?\]\s*/i;
// Editorial marks, and the class each gives its note (see edition.css).
const MARKS = new Map([
	['☞', 'observation'],
	['?', 'question'],
	['↗', 'see-also'],
	['†', 'qualification'],
	['※', 'commentary'],
]);

// Later-note types: the symbol, or its word, and how each is shown.
const LATER = /^\s*\[(\?|↺|\+|×|question|reconsideration|addition|correction)(?:\s+([^\]]*?))?\s*\]\s*/i;
/** @type {Record<string, { kind: string, sign: string, name: string }>} */
const LATER_TYPES = {
	'?': { kind: 'question', sign: '?', name: 'Open question' },
	'↺': { kind: 'reconsideration', sign: '↺', name: 'Reconsideration' },
	'+': { kind: 'addition', sign: '+', name: 'Addition' },
	'×': { kind: 'correction', sign: '×', name: 'Correction' },
};
for (const type of Object.values(LATER_TYPES)) LATER_TYPES[type.kind] = type;

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

/** The type and date of a later note, from its prefix; stops the build on a bad date. */
function laterType(/** @type {RegExpExecArray} */ match, /** @type {string} */ label, /** @type {any} */ ctx) {
	const type = LATER_TYPES[match[1].toLowerCase()];
	const iso = match[2] ?? '';
	const date = new Date(`${iso}T00:00:00Z`);
	if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso) {
		fail(ctx, `the later note [^${label}] needs the date it was written, e.g. [${type.sign} 2026-10-09]`);
	}
	// Formatted as FormattedDate.astro formats the article's own dates.
	const shown = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
	return { ...type, iso, shown };
}

/** A copy without links or ids, for the margin's visual duplicate of a note. */
function unlinked(/** @type {any} */ node) {
	if (node.type !== 'element') return node;
	const { id, href, ...properties } = node.properties ?? {};
	return el(node.tagName === 'a' ? 'span' : node.tagName, node.tagName === 'a' ? {} : properties, (node.children ?? []).map(unlinked));
}

/**
 * Markdown pass: every later note must still be referred to from the text.
 * Footnote definitions without a reference are otherwise dropped without a
 * word, which for a later note would mean losing it with its passage.
 * @type {import('satteri').MdastPluginInstance & { name: string }}
 */
export const laterNoteTargets = {
	name: 'later-note-targets',
	before(root, ctx) {
		/** @type {Set<string>} */
		const referenced = new Set();
		/** @type {string[]} */
		const later = [];
		const walk = (/** @type {any} */ node) => {
			if (node.type === 'footnoteReference') referenced.add(node.identifier);
			if (node.type === 'footnoteDefinition') {
				const lead = node.children[0]?.children?.[0];
				if (lead?.type === 'text' && LATER.test(lead.value)) later.push(node.identifier);
			}
			for (const child of node.children ?? []) walk(child);
		};
		walk(root);
		for (const label of later) {
			if (!referenced.has(label)) {
				fail(ctx, `the later note [^${label}] is no longer attached to any passage. Put [^${label}] back in the passage it comments on, or delete the note.`);
			}
		}
	},
};

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
	function noteContent(/** @type {any} */ li, /** @type {any} */ ctx, /** @type {RegExp} */ prefix) {
		const blocks = li.children.filter((/** @type {any} */ c) => c.type === 'element');
		if (blocks.some((/** @type {any} */ b) => b.tagName !== 'p')) {
			fail(ctx, 'a [margin] or later note can contain only paragraphs (no lists, quotations, or code)');
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
			if (i === 0 && kids[0]?.type === 'text') kids[0].value = /** @type {string} */ (kids[0].value).replace(prefix, '');
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
			/** @type {Map<string, { li: any, margin: boolean, label?: string, later?: RegExpExecArray }>} */
			const notes = new Map();
			for (const { node } of section ? elements(section) : []) {
				if (node.tagName !== 'li' || !node.properties?.id) continue;
				const first = node.children.find((/** @type {any} */ c) => c.type === 'element');
				const lead = first?.children?.[0];
				const match = lead?.type === 'text' ? PREFIX.exec(lead.value) : null;
				const later = lead?.type === 'text' ? LATER.exec(lead.value) ?? undefined : undefined;
				const kind = match?.[1].toLowerCase();
				if (kind === 'footnote' && match?.[2] !== undefined) fail(ctx, 'only [margin] notes can have a label');
				notes.set(node.properties.id, { li: node, margin: kind === 'margin', label: match?.[2], later });
				if (kind === 'footnote') ctx.replaceNode(lead, text(lead.value.replace(PREFIX, '')));
			}
			const moved = new Set([...notes.values()].filter((n) => n.margin || n.later).map((n) => n.li));
			const insideMoved = (/** @type {any} */ node) => [...moved].some((li) => [...elements(li)].some((e) => e.node === node));

			const seen = new Set();
			/** @type {Map<string, number>} */
			const footnoteNumbers = new Map();
			let margin = 0;
			/** @type {{ label: string, type: ReturnType<typeof laterType>, li: any }[]} */
			const laterNotes = [];

			for (const { node: a, parent: sup } of all.filter(({ node }) => node.tagName === 'a' && node.properties?.dataFootnoteRef)) {
				const id = decodeURIComponent(String(a.properties.href).slice(1));
				const note = notes.get(id);
				if (!note) continue;

				if (note.later) {
					const label = id.replace(/^user-content-fn-/, '');
					if (laterNotes.some((n) => n.label === label)) fail(ctx, `the later note [^${label}] is referred to more than once`);
					const type = laterType(note.later, label, ctx);
					laterNotes.push({ label, type, li: note.li });
					const paras = noteContent(note.li, ctx, LATER);
					ctx.replaceNode(sup, [
						el(
							'a',
							{
								href: `#later-${label}`,
								id: `later-ref-${label}`,
								className: ['later-mark', `later--${type.kind}`],
								ariaLabel: `Later note: ${type.name.toLowerCase()}, ${type.shown}`,
							},
							[text(type.sign)],
						),
						// A visual copy for the margin on wide screens; the mark and the
						// list at the end carry the note for screen readers and phones.
						el('span', { className: ['later-margin', `later--${type.kind}`], ariaHidden: 'true' }, [
							el('span', { className: ['later-label'] }, [
								el('span', { className: ['later-sign'] }, [text(type.sign)]),
								text(` ${type.name} · ${type.shown}`),
							]),
							...paras.map(unlinked),
						]),
					]);
					continue;
				}

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
				const paras = noteContent(note.li, ctx, PREFIX);
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
						...paras,
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

			// Bibliography entries link back to the notes that cite them.
			/** @type {Map<string, { href: string, text: string, order: number }[]>} */
			const citedIn = new Map();
			for (const [id, note] of notes) {
				if (note.margin) continue;
				const label = id.replace(/^user-content-fn-/, '');
				const n = footnoteNumbers.get(id) ?? Infinity;
				const back = note.later ? { href: `#later-${label}`, text: 'a later note', order: n } : { href: `#${id}`, text: `note ${n}`, order: n };
				if (!note.later && !footnoteNumbers.has(id)) continue;
				for (const { node } of elements(note.li)) {
					const key = node.tagName === 'a' ? node.properties?.dataCite : undefined;
					if (typeof key !== 'string') continue;
					const list = citedIn.get(key) ?? [];
					if (!list.some((b) => b.href === back.href)) list.push(back);
					citedIn.set(key, list);
				}
			}
			for (const [key, backs] of citedIn) {
				const entry = all.find(({ node }) => node.tagName === 'li' && node.properties?.id === `ref-${key}`)?.node;
				if (!entry) continue;
				backs.sort((a, b) => a.order - b.order);
				ctx.appendChild(entry, [
					text(' '),
					el('span', { className: ['cited-in'] }, [
						text('Cited in '),
						...backs.flatMap((b, i) => [...(i ? [text(', ')] : []), el('a', { href: b.href }, [text(b.text)])]),
					]),
				]);
			}

			if (laterNotes.length) {
				ctx.appendChild(root, el('section', { className: ['later-notes'], ariaLabelledby: 'later-notes-heading' }, [
					el('h2', { id: 'later-notes-heading' }, [text('Later notes')]),
					el('p', { className: ['later-intro'] }, [text('Added after publication, each dated and marked in the text where it applies.')]),
					el(
						'ol',
						{},
						laterNotes.map(({ label, type, li }) =>
							el('li', { id: `later-${label}`, className: ['later', `later--${type.kind}`] }, [
								el('p', { className: ['later-label'] }, [
									el('span', { className: ['later-sign'], ariaHidden: 'true' }, [text(type.sign)]),
									text(` ${type.name} · `),
									el('time', { dateTime: type.iso }, [text(type.shown)]),
								]),
								...noteContent(li, ctx, LATER).map((span) => el('p', {}, span.children ?? [])),
								el('p', { className: ['later-back'] }, [
									el('a', { href: `#later-ref-${label}` }, [el('span', { ariaHidden: 'true' }, [text('↩ ')]), text('Back to the passage')]),
								]),
							]),
						),
					),
				]));
				// Corrections are announced at the top, whether or not a reader opens the notes.
				const corrections = laterNotes.filter((n) => n.type.kind === 'correction');
				if (corrections.length) {
					const latest = corrections.reduce((a, b) => (b.type.iso > a.type.iso ? b : a));
					ctx.prependChild(root, el('p', { className: ['correction-notice'] }, [
						el('strong', {}, [text(`Corrected ${latest.type.shown}.`)]),
						text(' '),
						el('a', { href: corrections.length === 1 ? `#later-${corrections[0].label}` : '#later-notes-heading' }, [
							text(corrections.length === 1 ? 'Read the correction' : `Read the ${corrections.length} corrections`),
						]),
						text('.'),
					]));
				}
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
