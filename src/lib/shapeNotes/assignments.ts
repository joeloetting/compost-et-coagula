// Drawn shape-note phrases: which phrase each essay's divider slot was given,
// kept in src/data/shapeNotes/assignments.json so that a phrase is not quoted
// twice by accident. Used by the phrase:* commands in scripts/phrase.ts; the
// site build never reads or writes the ledger.
//
// A slot is a name the author chooses ("break-1") and marks in the essay with
// a comment directly before the divider, so moving the prose around it does
// not change it:
//
//   {/* shapenote-slot: break-1 */}
//   <ShapeNoteDivider ref="old-hundred-tenor" />
//
// A phrase is reserved by every ledger entry, drafts included, and by every
// literal `ref` in an essay outside the demonstration documents, which repeat
// phrases on purpose. Nothing here edits an essay.
import { randomBytes, randomInt } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, openSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeSync } from 'node:fs';
import { hostname } from 'node:os';
import { basename, dirname, join, relative, sep } from 'node:path';
import { mdxToMdast } from 'satteri';
import { type Catalog, type CatalogPhrase, parseYaml, passageOf, phraseProblems, readCatalog } from './catalog.ts';
import { resolvePhrase } from './notation.ts';

export const LEDGER_VERSION = 1;

/**
 * Documents that demonstrate the divider itself and repeat phrases (and show
 * fixtures) on purpose. Their dividers reserve nothing and are not checked
 * for repeated use; scripts/check-dist.mjs still refuses a published fixture.
 */
export const DEMONSTRATION_ESSAYS: readonly string[] = ['writing/a-musical-pause', 'writing/the-printers-ornament', 'notes/on-shape-notes'];

/** A slot id: letters, digits, hyphens, and underscores, starting with a letter or digit. */
export const SLOT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const MARKER = /^\s*\/\*\s*shapenote-slot:\s*(\S+)\s*\*\/\s*$/;

export interface Assignment {
	/** The essay's path under src/content, without .md or .mdx: "writing/an-essay". */
	essay: string;
	slot: string;
	phraseId: string;
	/** When the phrase was drawn, as an ISO 8601 UTC timestamp. */
	assignedAt: string;
}

export interface Ledger {
	version: typeof LEDGER_VERSION;
	assignments: Assignment[];
}

export interface Paths {
	root: string;
	content: string;
	catalog: string;
	ledger: string;
	components: string;
}

export function projectPaths(root: string): Paths {
	return {
		root,
		content: join(root, 'src/content'),
		catalog: join(root, 'src/data/shapeNotes/phrases.yaml'),
		ledger: join(root, 'src/data/shapeNotes/assignments.json'),
		components: join(root, 'src/components'),
	};
}

/** Problems that stop a command; each message says what to change. */
export class PhraseCommandError extends Error {
	readonly problems: string[];
	constructor(problems: string[]) {
		super(problems.join('\n'));
		this.name = 'PhraseCommandError';
		this.problems = problems;
	}
}

const posix = (path: string) => path.split(sep).join('/');
const keyOf = (essay: string, slot: string) => `${essay}#${slot}`;

// ---------------------------------------------------------------------------
// The ledger

export function emptyLedger(): Ledger {
	return { version: LEDGER_VERSION, assignments: [] };
}

/** The ledger as it is written: one entry per assignment, sorted, so diffs stay small. */
export function serializeLedger(ledger: Ledger): string {
	const assignments = [...ledger.assignments]
		.sort((a, b) => (a.essay === b.essay ? (a.slot < b.slot ? -1 : a.slot > b.slot ? 1 : 0) : a.essay < b.essay ? -1 : 1))
		.map(({ essay, slot, phraseId, assignedAt }) => ({ essay, slot, phraseId, assignedAt }));
	return `${JSON.stringify({ version: ledger.version, assignments }, null, '\t')}\n`;
}

/**
 * Read and check the ledger's own structure. With a catalog, also check that
 * each phrase exists and may be quoted. A missing file is an empty ledger.
 */
export function readLedger(path: string, catalog?: Catalog): { ledger: Ledger; text?: string; problems: string[] } {
	const name = basename(path);
	if (!existsSync(path)) return { ledger: emptyLedger(), problems: [] };
	const text = readFileSync(path, 'utf8');
	const problems: string[] = [];
	let data: unknown;
	try {
		data = JSON.parse(text);
	} catch (error) {
		return { ledger: emptyLedger(), text, problems: [`${name} is not valid JSON: ${(error as Error).message}`] };
	}
	const object = data as { version?: unknown; assignments?: unknown };
	if (!object || typeof object !== 'object' || Array.isArray(object)) {
		return { ledger: emptyLedger(), text, problems: [`${name} must be an object with "version" and "assignments"`] };
	}
	if (object.version !== LEDGER_VERSION) problems.push(`${name}: "version" must be ${LEDGER_VERSION}, not ${JSON.stringify(object.version)}`);
	const extra = Object.keys(object).filter((key) => key !== 'version' && key !== 'assignments');
	if (extra.length) problems.push(`${name}: unknown field(s) ${extra.map((key) => `"${key}"`).join(', ')}`);
	if (!Array.isArray(object.assignments)) {
		problems.push(`${name}: "assignments" must be a list`);
		return { ledger: emptyLedger(), text, problems };
	}

	const assignments: Assignment[] = [];
	const slots = new Map<string, number>();
	const phrases = new Map<string, number>();
	object.assignments.forEach((entry: unknown, index: number) => {
		const where = `${name}: assignment ${index + 1}`;
		const record = entry as Record<string, unknown>;
		if (!record || typeof record !== 'object' || Array.isArray(record)) {
			problems.push(`${where} must be an object`);
			return;
		}
		const fields = ['essay', 'slot', 'phraseId', 'assignedAt'];
		const unknown = Object.keys(record).filter((key) => !fields.includes(key));
		if (unknown.length) problems.push(`${where}: unknown field(s) ${unknown.map((key) => `"${key}"`).join(', ')}`);
		const missing = fields.filter((key) => typeof record[key] !== 'string' || !(record[key] as string).trim());
		if (missing.length) {
			problems.push(`${where}: ${missing.map((key) => `"${key}"`).join(', ')} must be given as text`);
			return;
		}
		const assignment = record as unknown as Assignment;
		const label = `${where} (${keyOf(assignment.essay, assignment.slot)})`;
		const essayProblem = essayPathProblem(assignment.essay);
		if (essayProblem) problems.push(`${label}: ${essayProblem}`);
		if (!SLOT_PATTERN.test(assignment.slot)) problems.push(`${label}: slot "${assignment.slot}" must be letters, digits, hyphens, or underscores`);
		const time = new Date(assignment.assignedAt);
		if (Number.isNaN(time.getTime()) || time.toISOString() !== assignment.assignedAt) {
			problems.push(`${label}: assignedAt must be an ISO 8601 UTC timestamp such as 2026-10-15T02:00:00.000Z`);
		}
		const key = keyOf(assignment.essay, assignment.slot);
		if (slots.has(key)) problems.push(`${label}: the same essay and slot as assignment ${slots.get(key)}; each slot has one phrase`);
		else slots.set(key, index + 1);
		if (phrases.has(assignment.phraseId)) {
			problems.push(`${label}: "${assignment.phraseId}" is already assigned by assignment ${phrases.get(assignment.phraseId)}; a phrase is assigned once`);
		} else phrases.set(assignment.phraseId, index + 1);
		if (catalog) {
			const phrase = catalog.byId.get(assignment.phraseId);
			if (!phrase) problems.push(`${label}: no phrase "${assignment.phraseId}" in phrases.yaml`);
			else if (phrase.fixture) problems.push(`${label}: "${assignment.phraseId}" is a fixture, which is never assigned`);
		}
		assignments.push({ essay: assignment.essay, slot: assignment.slot, phraseId: assignment.phraseId, assignedAt: assignment.assignedAt });
	});
	return { ledger: { version: LEDGER_VERSION, assignments }, text, problems };
}

/** Write a file by renaming a finished temporary file over it, so a reader never sees half of it. */
export function writeFileAtomic(path: string, text: string): void {
	const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`);
	try {
		const fd = openSync(temporary, 'wx');
		try {
			writeSync(fd, text);
			fsyncSync(fd);
		} finally {
			closeSync(fd);
		}
		renameSync(temporary, path);
	} catch (error) {
		rmSync(temporary, { force: true });
		throw error;
	}
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

function processIsAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === 'EPERM';
	}
}

/**
 * Hold an exclusive lock on the ledger while `task` reads, chooses, and
 * writes, so two commands run at once cannot assign the same phrase. Waits
 * briefly for another command to finish; a lock left by a command that no
 * longer runs is reported, not removed.
 */
export async function withLedgerLock<T>(ledgerPath: string, task: () => T | Promise<T>, waitMs = 10_000): Promise<T> {
	const lockPath = `${ledgerPath}.lock`;
	const started = Date.now();
	for (;;) {
		try {
			const fd = openSync(lockPath, 'wx');
			try {
				writeSync(fd, `${JSON.stringify({ pid: process.pid, host: hostname(), createdAt: new Date().toISOString() })}\n`);
			} finally {
				closeSync(fd);
			}
			break;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
		}
		let holder: { pid?: number; host?: string; createdAt?: string } | undefined;
		try {
			holder = JSON.parse(readFileSync(lockPath, 'utf8'));
		} catch {
			// Just created and not yet written, or just removed: try again.
		}
		const relativeLock = posix(relative(process.cwd(), lockPath)) || lockPath;
		const stale = holder?.pid && holder.host === hostname() && !processIsAlive(holder.pid);
		if (stale || Date.now() - started > waitMs) {
			const who = holder ? `process ${holder.pid} on ${holder.host}, since ${holder.createdAt}` : 'an unknown process';
			throw new PhraseCommandError([
				stale
					? `${relativeLock} was left by ${who}, which is no longer running. Check that no phrase command is running, then delete ${relativeLock} and try again.`
					: `${relativeLock} is held by ${who}. Wait for that phrase command to finish; if none is running, delete ${relativeLock} and try again.`,
			]);
		}
		await sleep(25 + Math.random() * 50);
	}
	try {
		return await task();
	} finally {
		rmSync(lockPath, { force: true });
	}
}

// ---------------------------------------------------------------------------
// Essays and the dividers in them

export interface Essay {
	/** The path under src/content without .md or .mdx: "writing/an-essay". */
	essay: string;
	file: string;
	format: 'md' | 'mdx';
	draft: boolean;
	demonstration: boolean;
}

export interface DividerUse {
	essay: string;
	line: number;
	/** The phrase id, when `ref` is a literal string. */
	ref?: string;
	/** The source of a `ref` (or spread) that is not a literal, which cannot be checked. */
	dynamic?: string;
	/** The slot named by the marker directly before it. */
	slot?: string;
}

export interface EssayScan {
	essay: Essay;
	uses: DividerUse[];
	/** Slot markers and the line each is on. */
	markers: { slot: string; line: number }[];
	problems: string[];
	/** Whether the essay imports ShapeNoteDivider. */
	imports: boolean;
}

function essayPathProblem(essay: string): string | undefined {
	if (!/^[^/\\.][^\\]*$/.test(essay) || essay.split('/').some((part) => !part || part === '.' || part === '..') || /\.mdx?$/.test(essay)) {
		return `essay "${essay}" must be a path under src/content without its extension, such as writing/an-essay`;
	}
	return undefined;
}

/** Accept "src/content/writing/x.mdx", "./writing/x", or "writing/x"; return "writing/x". */
export function normalizeEssay(input: string): string {
	return posix(input.trim())
		.replace(/^\.\//, '')
		.replace(/^src\/content\//, '')
		.replace(/\.mdx?$/, '');
}

function walk(dir: string): string[] {
	if (!existsSync(dir)) return [];
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		return statSync(path).isDirectory() ? walk(path) : [path];
	});
}

function frontmatterDraft(source: string): boolean {
	const match = /^---\r?\n([\s\S]*?)\r?\n---\r?$/m.exec(source);
	if (!match || match.index !== 0) return false;
	try {
		return (parseYaml(match[1]) as { draft?: unknown } | undefined)?.draft === true;
	} catch {
		return false;
	}
}

/** Every Markdown and MDX entry under src/content, in every collection. */
export function listEssays(paths: Paths): Essay[] {
	return walk(paths.content)
		.filter((file) => /\.mdx?$/.test(file))
		.sort()
		.map((file) => {
			const essay = posix(relative(paths.content, file)).replace(/\.mdx?$/, '');
			return {
				essay,
				file,
				format: file.endsWith('.mdx') ? 'mdx' : 'md',
				draft: frontmatterDraft(readFileSync(file, 'utf8')),
				demonstration: DEMONSTRATION_ESSAYS.includes(essay),
			} satisfies Essay;
		});
}

interface MdNode {
	type: string;
	name?: string | null;
	value?: unknown;
	attributes?: { type: string; name?: string; value?: unknown }[];
	children?: MdNode[];
	position?: { start: { line: number } };
}

/** The literal string in a JSX expression such as 'id', "id", or `id`; undefined otherwise. */
function literalExpression(source: string): string | undefined {
	const match = /^\s*(?:'([^'\\\n]*)'|"([^"\\\n]*)"|`([^`\\$]*)`)\s*$/.exec(source);
	return match ? (match[1] ?? match[2] ?? match[3]) : undefined;
}

/**
 * Find the dividers an MDX essay actually renders, from its parsed syntax
 * tree: an example inside a code block is not a divider. Never runs the
 * essay's code, so a `ref` that is not a literal string is reported as
 * unchecked.
 */
export function scanEssay(essay: Essay, source = readFileSync(essay.file, 'utf8')): EssayScan {
	const scan: EssayScan = { essay, uses: [], markers: [], problems: [], imports: false };
	if (essay.format !== 'mdx') return scan;
	let tree: MdNode;
	try {
		tree = mdxToMdast(source, { features: { frontmatter: true } }) as unknown as MdNode;
	} catch (error) {
		scan.problems.push(`${essay.essay}: could not be parsed as MDX, so its dividers were not checked: ${(error as Error).message}`);
		return scan;
	}

	// The names the essay imports the component under.
	const names = new Set(['ShapeNoteDivider']);
	for (const node of tree.children ?? []) {
		if (node.type !== 'mdxjsEsm' || typeof node.value !== 'string') continue;
		for (const [, name] of node.value.matchAll(/import\s+([A-Za-z_$][\w$]*)\s+from\s+['"][^'"]*\/ShapeNoteDivider\.astro['"]/g)) {
			names.add(name);
			scan.imports = true;
		}
	}

	const line = (node: MdNode) => node.position?.start.line ?? 0;
	const slotOf = new Map<MdNode, string>();
	const isDivider = (node: MdNode) => (node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') && !!node.name && names.has(node.name);
	const visit = (parent: MdNode) => {
		const children = parent.children ?? [];
		for (let index = 0; index < children.length; index++) {
			const node = children[index];
			if ((node.type === 'mdxFlowExpression' || node.type === 'mdxTextExpression') && typeof node.value === 'string' && node.value.includes('shapenote-slot')) {
				const marker = MARKER.exec(node.value);
				const at = `${essay.essay}, line ${line(node)}`;
				if (!marker) {
					scan.problems.push(`${at}: write the slot marker as {/* shapenote-slot: slot-id */}`);
					continue;
				}
				const slot = marker[1];
				if (!SLOT_PATTERN.test(slot)) scan.problems.push(`${at}: slot "${slot}" must be letters, digits, hyphens, or underscores`);
				scan.markers.push({ slot, line: line(node) });
				// The divider must come next, with nothing but spaces between.
				let next = index + 1;
				while (next < children.length && children[next].type === 'text' && !String(children[next].value).trim()) next++;
				const divider = children[next];
				if (!divider || !isDivider(divider)) scan.problems.push(`${at}: the marker for slot "${slot}" must be directly followed by its <ShapeNoteDivider>`);
				else slotOf.set(divider, slot);
				continue;
			}
			if (isDivider(node)) {
				const use: DividerUse = { essay: essay.essay, line: line(node) };
				const slot = slotOf.get(node);
				if (slot) use.slot = slot;
				const spread = node.attributes?.find((attribute) => attribute.type === 'mdxJsxExpressionAttribute');
				const ref = node.attributes?.find((attribute) => attribute.type === 'mdxJsxAttribute' && attribute.name === 'ref');
				if (spread) use.dynamic = `{${String(spread.value)}}`;
				else if (!ref) scan.problems.push(`${essay.essay}, line ${use.line}: a <ShapeNoteDivider> has no ref`);
				else if (typeof ref.value === 'string') use.ref = ref.value;
				else if (ref.value && typeof ref.value === 'object') {
					const expression = String((ref.value as { value?: unknown }).value ?? '');
					const literal = literalExpression(expression);
					if (literal !== undefined) use.ref = literal;
					else use.dynamic = `ref={${expression}}`;
				} else scan.problems.push(`${essay.essay}, line ${use.line}: a <ShapeNoteDivider> has a ref without a phrase id`);
				if (use.ref !== undefined || use.dynamic !== undefined) scan.uses.push(use);
			}
			visit(node);
		}
	};
	visit(tree);
	return scan;
}

// ---------------------------------------------------------------------------
// The whole picture: catalog, ledger, and essays together

export interface Reservation {
	phraseId: string;
	/** "writing/x#break-1" for an assignment, "writing/x, line 40" for a divider placed by hand. */
	by: string;
	kind: 'assignment' | 'manual';
}

export interface State {
	paths: Paths;
	catalog: Catalog;
	/** Problems in the catalog itself (structure, duplicate ids, a phrase that does not resolve or draw). */
	catalogProblems: string[];
	ledger: Ledger;
	ledgerText?: string;
	/** Problems in the ledger's own structure or with its phrases. */
	ledgerProblems: string[];
	essays: Map<string, Essay>;
	scans: EssayScan[];
	/** Inconsistencies between the ledger and the essays; `phrase:check` fails on these. */
	errors: string[];
	/** Things that could not be checked, or that `phrase:check` reports without failing. */
	warnings: string[];
	/** Drawn for a draft but not yet placed in it. */
	pending: Assignment[];
	reservations: Reservation[];
}

/** Read everything and check it against itself. Reads only. */
export function analyze(paths: Paths): State {
	const catalog = existsSync(paths.catalog)
		? readCatalog(readFileSync(paths.catalog, 'utf8'))
		: { phrases: [], byId: new Map(), problems: [`${paths.catalog} does not exist`] };
	const catalogProblems = [...catalog.problems, ...phraseProblems(catalog)];
	const { ledger, text: ledgerText, problems: ledgerProblems } = readLedger(paths.ledger, catalog);
	const essayList = listEssays(paths);
	const essays = new Map(essayList.map((essay) => [essay.essay, essay]));
	const scans = essayList.map((essay) => scanEssay(essay));
	const state: State = {
		paths,
		catalog,
		catalogProblems,
		ledger,
		ledgerText,
		ledgerProblems,
		essays,
		scans,
		errors: [],
		warnings: [],
		pending: [],
		reservations: [],
	};
	const { errors, warnings } = state;
	const assignments = new Map(ledger.assignments.map((assignment) => [keyOf(assignment.essay, assignment.slot), assignment]));
	const release = (assignment: Assignment) => `npm run phrase:release -- --essay ${assignment.essay} --slot ${assignment.slot}`;

	for (const assignment of ledger.assignments) {
		state.reservations.push({ phraseId: assignment.phraseId, by: keyOf(assignment.essay, assignment.slot), kind: 'assignment' });
	}

	for (const scan of scans) {
		const { essay } = scan;
		const published = !essay.draft;
		errors.push(...scan.problems);

		const seen = new Map<string, number>();
		for (const marker of scan.markers) {
			if (seen.has(marker.slot)) {
				errors.push(`${essay.essay}, line ${marker.line}: slot "${marker.slot}" is already marked on line ${seen.get(marker.slot)}; each slot is marked once`);
			} else seen.set(marker.slot, marker.line);
		}

		for (const use of scan.uses) {
			const at = `${essay.essay}, line ${use.line}`;
			if (use.ref !== undefined && !catalog.byId.has(use.ref) && !catalog.problems.length) {
				errors.push(`${at}: <ShapeNoteDivider ref="${use.ref}" /> names no phrase in phrases.yaml`);
			}
			const assignment = use.slot ? assignments.get(keyOf(essay.essay, use.slot)) : undefined;
			if (use.slot) {
				if (!assignment) {
					errors.push(`${at}: slot "${use.slot}" has no assignment in assignments.json. Draw one with npm run phrase:draw -- --essay ${essay.essay} --slot ${use.slot}, or remove the marker.`);
				} else if (use.dynamic) {
					errors.push(`${at}: slot "${use.slot}" is assigned "${assignment.phraseId}", but its divider's ${use.dynamic} is not a literal phrase id and cannot be checked; write ref="${assignment.phraseId}"`);
				} else if (use.ref !== assignment.phraseId) {
					errors.push(`${at}: slot "${use.slot}" is assigned "${assignment.phraseId}", but its divider quotes "${use.ref}". Use ref="${assignment.phraseId}", or remove the divider, release the slot, and draw again.`);
				}
			}
			if (use.dynamic && !use.slot) {
				warnings.push(`${at}: the divider's ${use.dynamic} is not a literal phrase id, so the phrase it quotes is not reserved or checked`);
			}
			if (!essay.demonstration && use.ref !== undefined) {
				const phrase = catalog.byId.get(use.ref);
				if (phrase?.fixture && published) errors.push(`${at}: "${use.ref}" is a fixture, which a published essay cannot quote`);
				// A marked divider quoting its assigned phrase is that assignment's own use; any other reserves its phrase by hand.
				if (assignment?.phraseId !== use.ref) state.reservations.push({ phraseId: use.ref, by: at, kind: 'manual' });
			}
		}

		for (const assignment of ledger.assignments.filter((a) => a.essay === essay.essay)) {
			if (scan.uses.some((use) => use.slot === assignment.slot)) continue;
			const unmarked = scan.uses.find((use) => !use.slot && use.ref === assignment.phraseId);
			const hint = unmarked ? ` A divider on line ${unmarked.line} quotes it without a marker; put {/* shapenote-slot: ${assignment.slot} */} on the line before it.` : '';
			if (published) {
				errors.push(`${essay.essay} is published, but slot "${assignment.slot}" ("${assignment.phraseId}") is not placed in it.${hint || ` Paste its divider, or ${release(assignment)}.`}`);
			} else {
				state.pending.push(assignment);
				if (hint) warnings.push(`${essay.essay}, slot "${assignment.slot}" ("${assignment.phraseId}"):${hint}`);
			}
		}
	}

	for (const assignment of ledger.assignments) {
		const essay = essays.get(assignment.essay);
		const label = `assignment ${keyOf(assignment.essay, assignment.slot)}`;
		if (!essay) {
			errors.push(
				`${label}: no essay at src/content/${assignment.essay}.mdx. If it moved, change "essay" in assignments.json to its new path; if it was deleted, ${release(assignment)}. Its phrase stays reserved until then.`,
			);
		} else if (essay.format !== 'mdx') {
			errors.push(`${label}: src/content/${assignment.essay}.md is Markdown, which cannot hold a divider; rename it to .mdx, or ${release(assignment)}`);
		}
	}

	// A phrase quoted outside the demonstrations is quoted once.
	const byPhrase = new Map<string, Reservation[]>();
	for (const reservation of state.reservations) byPhrase.set(reservation.phraseId, [...(byPhrase.get(reservation.phraseId) ?? []), reservation]);
	for (const [phraseId, claims] of byPhrase) {
		if (claims.length > 1) errors.push(`"${phraseId}" is used more than once: ${claims.map((claim) => claim.by).join('; ')}. Quote each phrase once outside the demonstration documents.`);
	}
	return state;
}

// ---------------------------------------------------------------------------
// Commands

export interface DrawOptions {
	essay: string;
	slot: string;
	distinctPassages?: boolean;
	/** Chooses an index below `size`; crypto.randomInt by default. */
	pick?: (size: number) => number;
	now?: () => Date;
}

export interface DrawResult {
	status: 'drawn' | 'existing';
	assignment: Assignment;
	phrase: CatalogPhrase;
	/** How many phrases the draw chose among (0 when the slot already had one). */
	poolSize: number;
	essay: Essay;
	/** The import line, when the essay does not import the divider yet. */
	importLine?: string;
	snippet: string;
	warnings: string[];
}

/** Find the essay a --essay argument names, or say how to name it. */
export function resolveEssay(state: State, input: string): Essay {
	const essay = normalizeEssay(input);
	const problem = essayPathProblem(essay);
	if (problem) throw new PhraseCommandError([problem]);
	const found = state.essays.get(essay);
	if (found) {
		if (found.format !== 'mdx') throw new PhraseCommandError([`src/content/${essay}.md is Markdown, which cannot hold a divider; rename it to .mdx first`]);
		return found;
	}
	const guesses = [...state.essays.keys()].filter((name) => name.endsWith(`/${essay}`) || name === `${essay}/index`);
	throw new PhraseCommandError([`No essay at src/content/${essay}.mdx.${guesses.length ? ` Did you mean ${guesses.join(' or ')}?` : ' Give its path under src/content, such as writing/an-essay.'}`]);
}

function checkSlot(slot: string): void {
	if (!SLOT_PATTERN.test(slot)) throw new PhraseCommandError([`slot "${slot}" must be letters, digits, hyphens, or underscores, such as break-1`]);
}

function blocking(state: State): string[] {
	return [
		...state.catalogProblems.map((problem) => `phrases.yaml: ${problem}`),
		...state.ledgerProblems.map((problem) => `assignments.json: ${problem}`),
	];
}

function importLine(state: State, essay: Essay): string {
	const path = posix(relative(dirname(essay.file), join(state.paths.components, 'ShapeNoteDivider.astro')));
	return `import ShapeNoteDivider from '${path.startsWith('.') ? path : `./${path}`}';`;
}

function result(state: State, status: DrawResult['status'], assignment: Assignment, essay: Essay, poolSize: number, warnings: string[]): DrawResult {
	const scan = state.scans.find((candidate) => candidate.essay.essay === essay.essay);
	return {
		status,
		assignment,
		phrase: state.catalog.byId.get(assignment.phraseId)!,
		poolSize,
		essay,
		importLine: scan?.imports ? undefined : importLine(state, essay),
		snippet: `{/* shapenote-slot: ${assignment.slot} */}\n<ShapeNoteDivider ref="${assignment.phraseId}" />`,
		warnings,
	};
}

/** The phrases a new draw may choose among, in catalog order. */
export function eligiblePool(state: State, distinctPassages = false): CatalogPhrase[] {
	const reserved = new Set(state.reservations.map((reservation) => reservation.phraseId));
	const passages = new Set(
		[...reserved].map((id) => {
			const phrase = state.catalog.byId.get(id);
			return phrase ? passageOf(phrase) : id;
		}),
	);
	return state.catalog.phrases.filter(
		(phrase) => !phrase.fixture && !reserved.has(phrase.id) && !(distinctPassages && passages.has(passageOf(phrase))),
	);
}

/**
 * Give an essay's slot a phrase, chosen uniformly from those not yet
 * reserved, and save it before reporting it. A slot that already has a
 * phrase keeps it, and nothing is written.
 */
export async function drawPhrase(paths: Paths, options: DrawOptions): Promise<DrawResult> {
	checkSlot(options.slot);
	return withLedgerLock(paths.ledger, () => {
		const state = analyze(paths);
		const essay = resolveEssay(state, options.essay);
		const problems = blocking(state);
		if (problems.length) throw new PhraseCommandError([...problems, 'Nothing was drawn. Fix the problems above and try again.']);
		// Anything phrase:check would fail on is reported, but does not stop a draw: every phrase it involves stays reserved.
		const warnings = [...state.errors, ...state.warnings];

		const existing = state.ledger.assignments.find((assignment) => assignment.essay === essay.essay && assignment.slot === options.slot);
		if (existing) return result(state, 'existing', existing, essay, 0, warnings);

		const pool = eligiblePool(state, options.distinctPassages);
		if (pool.length === 0) {
			const eligible = state.catalog.phrases.filter((phrase) => !phrase.fixture);
			throw new PhraseCommandError([
				`No phrase is left to draw for ${keyOf(essay.essay, options.slot)}: all ${eligible.length} quotable phrase(s) in phrases.yaml are reserved${
					options.distinctPassages ? ', or share a passage with a reserved phrase (--distinct-passages)' : ''
				}. Phrases are never reused automatically.`,
				'Add a cited phrase to src/data/shapeNotes/phrases.yaml, or release a reservation that is no longer used (npm run phrase:list shows them). Nothing was changed.',
			]);
		}
		const index = (options.pick ?? randomInt)(pool.length);
		if (!Number.isInteger(index) || index < 0 || index >= pool.length) throw new Error(`the picker returned ${index} for a pool of ${pool.length}`);
		const assignment: Assignment = {
			essay: essay.essay,
			slot: options.slot,
			phraseId: pool[index].id,
			assignedAt: (options.now ?? (() => new Date()))().toISOString(),
		};
		writeFileAtomic(paths.ledger, serializeLedger({ version: LEDGER_VERSION, assignments: [...state.ledger.assignments, assignment] }));
		return result(state, 'drawn', assignment, essay, pool.length, warnings);
	});
}

/**
 * Remove one slot's reservation. Refuses while the essay still has that
 * slot's marked divider: the author removes or replaces it first.
 */
export async function releasePhrase(paths: Paths, options: { essay: string; slot: string }): Promise<Assignment> {
	return withLedgerLock(paths.ledger, () => {
		const essay = normalizeEssay(options.essay);
		const { ledger, problems } = readLedger(paths.ledger);
		if (problems.length) throw new PhraseCommandError([...problems.map((problem) => `assignments.json: ${problem}`), 'Nothing was released.']);
		const assignment = ledger.assignments.find((candidate) => candidate.essay === essay && candidate.slot === options.slot);
		if (!assignment) {
			const here = ledger.assignments.filter((candidate) => candidate.essay === essay).map((candidate) => candidate.slot);
			throw new PhraseCommandError([
				`No assignment for ${keyOf(essay, options.slot)}.${here.length ? ` That essay has slot(s) ${here.join(', ')}.` : ''} Nothing was released.`,
			]);
		}
		const file = listEssays(paths).find((candidate) => candidate.essay === essay);
		if (file) {
			const scan = scanEssay(file);
			if (scan.problems.some((problem) => problem.includes('could not be parsed'))) {
				throw new PhraseCommandError([...scan.problems, 'Nothing was released: the essay must parse, so that its dividers can be checked.']);
			}
			const placed = scan.uses.find((use) => use.slot === assignment.slot);
			if (placed) {
				throw new PhraseCommandError([
					`${essay}, line ${placed.line} still has the divider for slot "${assignment.slot}". Remove or replace that divider and its {/* shapenote-slot: ${assignment.slot} */} marker first, then release the slot. Nothing was released.`,
				]);
			}
		}
		writeFileAtomic(paths.ledger, serializeLedger({ ...ledger, assignments: ledger.assignments.filter((candidate) => candidate !== assignment) }));
		return assignment;
	});
}

/** A one-line summary of a phrase's words and source, for the command output. */
export function phraseSummary(phrase: CatalogPhrase): string {
	let lyric = '';
	try {
		lyric = `“${resolvePhrase(phrase).lyric}” — `;
	} catch {
		// A broken phrase is reported elsewhere.
	}
	const { source } = phrase;
	const where = [source.compiler, source.tunebook, source.year, source.page != null ? `p. ${source.page}` : undefined].filter(Boolean).join(', ');
	return `${lyric}${phrase.title}, ${source.voice}${source.verse ? `, verse ${source.verse}` : ''}; ${where}`;
}
