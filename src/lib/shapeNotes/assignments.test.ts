// Unit tests for drawing, checking, and releasing shape-note phrase
// assignments. Each test works in its own temporary copy of the catalog, a
// ledger, and a few essays. Run with `npm run test:unit`.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import { stringify } from 'yaml';
import {
	analyze,
	drawPhrase,
	eligiblePool,
	listEssays,
	type Paths,
	PhraseCommandError,
	projectPaths,
	readLedger,
	releasePhrase,
	scanEssay,
	serializeLedger,
} from './assignments.ts';
import { parseYaml, readCatalog } from './catalog.ts';

const repository = new URL('../../../', import.meta.url).pathname;
// The catalog's records as of this test, so that adding a phrase to the
// catalog does not change what the tests expect to be drawn.
const BASE_IDS = ['old-hundred-tenor', 'old-hundred-tenor-verse-1', 'liverpool-tenor', 'idumea-opening', 'fixture-minor-phrase', 'fixture-long-lyric'];
const records = parseYaml(readFileSync(join(repository, 'src/data/shapeNotes/phrases.yaml'), 'utf8')) as { id: string }[];
const baseCatalog = stringify(BASE_IDS.map((id) => records.find((record) => record.id === id)));
const roots: string[] = [];
after(() => {
	for (const root of roots) rmSync(root, { recursive: true, force: true });
});

/** A quotable phrase record in YAML, with its own passage unless one is given. */
function extraPhrase(id: string, options: { passageId?: string; sourceHead?: string } = {}): string {
	return `
- id: ${id}
  title: Test tune ${id}
${options.passageId ? `  passageId: ${options.passageId}\n` : ''}  system: fasola-four
  key: { tonic: A, mode: minor }
  notes:
    - { pitch: A4, dur: half, syl: Test${options.sourceHead ? `, sourceHead: ${options.sourceHead}` : ''} }
    - { pitch: C5, dur: half, syl: words }
  source: { tunebook: Test Harmony, tune: Test, voice: tenor, verse: 1, page: 1 }
`;
}

const frontmatter = (draft: boolean) => `---\ntitle: Test\ndescription: Test\npublished: 2026-10-01\ndraft: ${draft}\n---\n\n`;
const IMPORT = "import ShapeNoteDivider from '../../components/ShapeNoteDivider.astro';\n\n";

/** A temporary project: the catalog (the real one plus extras), essays, and an optional ledger. */
function project(options: { extra?: string; catalog?: string; essays?: Record<string, string>; ledger?: string } = {}): Paths {
	const root = mkdtempSync(join(tmpdir(), 'phrase-test-'));
	roots.push(root);
	const paths = projectPaths(root);
	mkdirSync(dirname(paths.catalog), { recursive: true });
	mkdirSync(paths.components, { recursive: true });
	writeFileSync(paths.catalog, options.catalog ?? baseCatalog + (options.extra ?? ''));
	if (options.ledger !== undefined) writeFileSync(paths.ledger, options.ledger);
	const essays = options.essays ?? { 'writing/draft-essay.mdx': `${frontmatter(true)}${IMPORT}Prose.\n` };
	for (const [name, text] of Object.entries(essays)) {
		mkdirSync(dirname(join(paths.content, name)), { recursive: true });
		writeFileSync(join(paths.content, name), text);
	}
	return paths;
}

const ledgerBytes = (paths: Paths) => readFileSync(paths.ledger, 'utf8');
const assignment = (essay: string, slot: string, phraseId: string) => ({ essay, slot, phraseId, assignedAt: '2026-10-15T02:00:00.000Z' });
const ledger = (...assignments: ReturnType<typeof assignment>[]) => serializeLedger({ version: 1, assignments });
const never = () => {
	throw new Error('the picker must not be called');
};

async function rejects(promise: Promise<unknown>, pattern: RegExp) {
	await assert.rejects(promise, (error: unknown) => {
		assert.ok(error instanceof PhraseCommandError, String(error));
		assert.match(error.message, pattern);
		return true;
	});
}

describe('drawing a phrase', () => {
	it('chooses uniformly from unreserved quotable phrases, never a fixture or a reserved one', async () => {
		const paths = project({
			extra: extraPhrase('extra-a') + extraPhrase('extra-b') + extraPhrase('extra-c'),
			ledger: ledger(assignment('writing/other-draft', 'break-1', 'extra-a')),
			essays: {
				'writing/draft-essay.mdx': `${frontmatter(true)}${IMPORT}Prose.\n`,
				'writing/other-draft.mdx': `${frontmatter(true)}${IMPORT}Prose.\n`,
				// Placed by hand in a draft: reserved.
				'writing/manual.mdx': `${frontmatter(true)}${IMPORT}<ShapeNoteDivider ref="extra-b" />\n`,
				// A demonstration document repeats phrases and reserves nothing.
				'writing/a-musical-pause.mdx': `${frontmatter(true)}${IMPORT}<ShapeNoteDivider ref="old-hundred-tenor" />\n<ShapeNoteDivider ref="old-hundred-tenor" />\n`,
			},
		});
		const pool = eligiblePool(analyze(paths)).map((phrase) => phrase.id);
		assert.deepEqual(pool, ['old-hundred-tenor', 'old-hundred-tenor-verse-1', 'extra-c']);

		const sizes: number[] = [];
		const drawn = await drawPhrase(paths, {
			essay: 'writing/draft-essay',
			slot: 'break-1',
			pick: (size) => {
				sizes.push(size);
				return 2;
			},
			now: () => new Date('2026-10-15T03:00:00.000Z'),
		});
		assert.deepEqual(sizes, [3]);
		assert.equal(drawn.status, 'drawn');
		assert.equal(drawn.phrase.id, 'extra-c');
		assert.equal(drawn.snippet, '{/* shapenote-slot: break-1 */}\n<ShapeNoteDivider ref="extra-c" />');
		assert.equal(drawn.importLine, undefined);
		assert.deepEqual(
			readLedger(paths.ledger).ledger.assignments.map((a) => a.phraseId),
			['extra-c', 'extra-a'],
		);
	});

	it('uses crypto.randomInt when no picker is given, and offers the import line when it is missing', async () => {
		const paths = project({ essays: { 'writing/no-import.mdx': `${frontmatter(true)}Prose.\n` } });
		const drawn = await drawPhrase(paths, { essay: 'src/content/writing/no-import.mdx', slot: 'break-1' });
		assert.ok(['old-hundred-tenor', 'old-hundred-tenor-verse-1'].includes(drawn.phrase.id));
		assert.equal(drawn.importLine, "import ShapeNoteDivider from '../../components/ShapeNoteDivider.astro';");
	});

	it('returns the existing assignment for the same essay and slot, without changing a byte', async () => {
		const paths = project();
		await drawPhrase(paths, { essay: 'writing/draft-essay', slot: 'break-1', pick: () => 0, now: () => new Date('2026-10-15T03:00:00.000Z') });
		const before = ledgerBytes(paths);
		const again = await drawPhrase(paths, { essay: 'writing/draft-essay', slot: 'break-1', pick: never, now: () => new Date('2030-01-01T00:00:00.000Z') });
		assert.equal(again.status, 'existing');
		assert.equal(again.assignment.assignedAt, '2026-10-15T03:00:00.000Z');
		assert.equal(ledgerBytes(paths), before);
	});

	it('reserves a draft assignment for later draws', async () => {
		const paths = project();
		const first = await drawPhrase(paths, { essay: 'writing/draft-essay', slot: 'break-1', pick: () => 0 });
		const second = await drawPhrase(paths, { essay: 'writing/draft-essay', slot: 'break-2', pick: () => 0 });
		assert.notEqual(first.phrase.id, second.phrase.id);
		const before = ledgerBytes(paths);
		await rejects(drawPhrase(paths, { essay: 'writing/draft-essay', slot: 'break-3', pick: never }), /No phrase is left to draw.*never reused/s);
		assert.equal(ledgerBytes(paths), before);
	});

	it('with --distinct-passages, treats the two Old Hundred verses as one passage', async () => {
		const paths = project({ extra: extraPhrase('other-passage') });
		await drawPhrase(paths, { essay: 'writing/draft-essay', slot: 'break-1', pick: () => 0 }); // old-hundred-tenor
		const state = analyze(paths);
		assert.deepEqual(eligiblePool(state).map((phrase) => phrase.id), ['old-hundred-tenor-verse-1', 'other-passage']);
		assert.deepEqual(eligiblePool(state, true).map((phrase) => phrase.id), ['other-passage']);
		const sizes: number[] = [];
		const distinct = await drawPhrase(paths, {
			essay: 'writing/draft-essay',
			slot: 'break-2',
			distinctPassages: true,
			pick: (size) => (sizes.push(size), 0),
		});
		assert.deepEqual(sizes, [1]);
		assert.equal(distinct.phrase.id, 'other-passage');
		await rejects(drawPhrase(paths, { essay: 'writing/draft-essay', slot: 'break-3', distinctPassages: true, pick: never }), /share a passage/);
	});

	it('refuses an essay that does not exist, or is Markdown, or a bad slot', async () => {
		const paths = project({ essays: { 'writing/plain.md': `${frontmatter(true)}Prose.\n`, 'writing/draft-essay.mdx': `${frontmatter(true)}Prose.\n` } });
		await rejects(drawPhrase(paths, { essay: 'draft-essay', slot: 'a', pick: never }), /Did you mean writing\/draft-essay\?/);
		await rejects(drawPhrase(paths, { essay: 'writing/plain', slot: 'a', pick: never }), /Markdown/);
		await rejects(drawPhrase(paths, { essay: 'writing/draft-essay', slot: 'two words', pick: never }), /slot "two words"/);
	});
});

describe('malformed data', () => {
	it('leaves the ledger unchanged when it is not valid JSON', async () => {
		const paths = project({ ledger: '{ "version": 1, ' });
		await rejects(drawPhrase(paths, { essay: 'writing/draft-essay', slot: 'a', pick: never }), /not valid JSON/);
		assert.equal(ledgerBytes(paths), '{ "version": 1, ');
	});

	it('refuses duplicate catalog ids before loading either record', () => {
		const catalog = readCatalog(baseCatalog + extraPhrase('extra-a') + extraPhrase('extra-a'));
		assert.match(catalog.problems.join('\n'), /the id "extra-a" is used by entries 7, 8/);
		assert.equal(catalog.byId.has('extra-a'), false);
	});

	it('refuses a catalog that cannot be read, without writing a ledger', async () => {
		const paths = project({ catalog: '- id: "broken\n' });
		await rejects(drawPhrase(paths, { essay: 'writing/draft-essay', slot: 'a', pick: never }), /could not be read/);
		assert.equal(readLedger(paths.ledger).text, undefined);
	});

	it('names a quotable phrase that does not resolve, rather than leaving it out of the draw', async () => {
		const paths = project({ extra: extraPhrase('wrong-head', { sourceHead: 'fasola-fa' }), ledger: ledger() });
		await rejects(drawPhrase(paths, { essay: 'writing/draft-essay', slot: 'a', pick: never }), /"wrong-head".*check the transcription/);
		assert.equal(ledgerBytes(paths), ledger());
	});

	it('refuses repeated slots, repeated phrases, unknown phrases, and fixtures in the ledger', () => {
		const paths = project({
			ledger: ledger(
				assignment('writing/draft-essay', 'a', 'old-hundred-tenor'),
				assignment('writing/draft-essay', 'a', 'old-hundred-tenor-verse-1'),
				assignment('writing/draft-essay', 'b', 'old-hundred-tenor'),
				assignment('writing/draft-essay', 'c', 'no-such-phrase'),
				assignment('writing/draft-essay', 'd', 'fixture-long-lyric'),
			),
		});
		const problems = analyze(paths).ledgerProblems.join('\n');
		assert.match(problems, /the same essay and slot as assignment 1/);
		assert.match(problems, /"old-hundred-tenor" is already assigned by assignment 1/);
		assert.match(problems, /no phrase "no-such-phrase"/);
		assert.match(problems, /"fixture-long-lyric" is a fixture/);
	});

	it('reports a divider that names no phrase', () => {
		const paths = project({ essays: { 'writing/draft-essay.mdx': `${frontmatter(true)}${IMPORT}<ShapeNoteDivider ref="no-such-phrase" />\n` } });
		assert.match(analyze(paths).errors.join('\n'), /line 10: <ShapeNoteDivider ref="no-such-phrase" \/> names no phrase/);
	});
});

describe('finding dividers in essays', () => {
	const essay = `${frontmatter(true)}import Divider from '../../components/ShapeNoteDivider.astro';

\`\`\`mdx
<ShapeNoteDivider ref="in-a-code-block" />
\`\`\`

Inline \`<ShapeNoteDivider ref="in-code" />\` too.

<Divider ref="old-hundred-tenor" />

> {/* shapenote-slot: quoted */}
> <ShapeNoteDivider ref={'old-hundred-tenor-verse-1'} open />

<ShapeNoteDivider ref={phraseName} />
`;

	it('counts real dividers, under any imported name, and not examples in code', () => {
		const paths = project({ essays: { 'writing/scan.mdx': essay } });
		const scan = scanEssay(listEssays(paths)[0]);
		assert.deepEqual(scan.problems, []);
		assert.equal(scan.imports, true);
		assert.deepEqual(
			scan.uses.map(({ line, ref, dynamic, slot }) => ({ line, ref, dynamic, slot })),
			[
				{ line: 16, ref: 'old-hundred-tenor', dynamic: undefined, slot: undefined },
				{ line: 19, ref: 'old-hundred-tenor-verse-1', dynamic: undefined, slot: 'quoted' },
				{ line: 21, ref: undefined, dynamic: 'ref={phraseName}', slot: undefined },
			],
		);
	});

	it('reports a reference that is not a literal as unchecked', () => {
		const paths = project({ essays: { 'writing/scan.mdx': essay } });
		assert.match(analyze(paths).warnings.join('\n'), /line 21: the divider's ref=\{phraseName\} is not a literal phrase id/);
	});

	it('reserves a phrase placed by hand in a published essay', () => {
		const paths = project({
			essays: { 'writing/published.mdx': `${frontmatter(false)}${IMPORT}<ShapeNoteDivider ref="old-hundred-tenor" />\n` },
		});
		const state = analyze(paths);
		assert.deepEqual(state.errors, []);
		assert.deepEqual(eligiblePool(state).map((phrase) => phrase.id), ['old-hundred-tenor-verse-1']);
	});

	it('refuses a phrase quoted twice outside the demonstration documents', () => {
		const divider = `${IMPORT}<ShapeNoteDivider ref="old-hundred-tenor" />\n`;
		const paths = project({
			essays: { 'writing/one.mdx': frontmatter(false) + divider, 'writing/two.mdx': frontmatter(true) + divider },
		});
		assert.match(analyze(paths).errors.join('\n'), /"old-hundred-tenor" is used more than once: writing\/one, line 10; writing\/two, line 10/);
	});
});

describe('checking assignments against essays', () => {
	const marked = (slot: string, ref: string) => `{/* shapenote-slot: ${slot} */}\n<ShapeNoteDivider ref="${ref}" />\n`;

	it('allows a pending assignment in a draft, and refuses one in a published essay', () => {
		const assigned = ledger(assignment('writing/essay', 'break-1', 'old-hundred-tenor'));
		const draft = analyze(project({ ledger: assigned, essays: { 'writing/essay.mdx': `${frontmatter(true)}${IMPORT}Prose.\n` } }));
		assert.deepEqual(draft.errors, []);
		assert.deepEqual(draft.pending.map((a) => a.slot), ['break-1']);
		const published = analyze(project({ ledger: assigned, essays: { 'writing/essay.mdx': `${frontmatter(false)}${IMPORT}Prose.\n` } }));
		assert.match(published.errors.join('\n'), /writing\/essay is published, but slot "break-1" \("old-hundred-tenor"\) is not placed/);
	});

	it('accepts a placed divider that matches its assignment', () => {
		const paths = project({
			ledger: ledger(assignment('writing/essay', 'break-1', 'old-hundred-tenor')),
			essays: { 'writing/essay.mdx': `${frontmatter(false)}${IMPORT}${marked('break-1', 'old-hundred-tenor')}` },
		});
		const state = analyze(paths);
		assert.deepEqual([state.errors, state.warnings, state.pending], [[], [], []]);
		assert.deepEqual(eligiblePool(state).map((phrase) => phrase.id), ['old-hundred-tenor-verse-1']);
	});

	it('refuses a mismatched phrase, a repeated marker, a marker with no assignment, and a stray marker', () => {
		const paths = project({
			ledger: ledger(assignment('writing/essay', 'break-1', 'old-hundred-tenor')),
			essays: {
				'writing/essay.mdx': `${frontmatter(false)}${IMPORT}${marked('break-1', 'old-hundred-tenor-verse-1')}\n${marked('break-1', 'old-hundred-tenor')}\n${marked('break-9', 'old-hundred-tenor')}\n{/* shapenote-slot: alone */}\n\nProse.\n`,
			},
		});
		const errors = analyze(paths).errors.join('\n');
		assert.match(errors, /slot "break-1" is assigned "old-hundred-tenor", but its divider quotes "old-hundred-tenor-verse-1"/);
		assert.match(errors, /slot "break-1" is already marked on line 10/);
		assert.match(errors, /slot "break-9" has no assignment/);
		assert.match(errors, /the marker for slot "alone" must be directly followed by its <ShapeNoteDivider>/);
	});

	it('flags an assignment whose essay moved or was deleted, and keeps its phrase reserved', () => {
		const paths = project({ ledger: ledger(assignment('writing/gone', 'break-1', 'old-hundred-tenor')) });
		const state = analyze(paths);
		assert.match(state.errors.join('\n'), /no essay at src\/content\/writing\/gone\.mdx\. If it moved, change "essay"/);
		assert.deepEqual(eligiblePool(state).map((phrase) => phrase.id), ['old-hundred-tenor-verse-1']);
	});
});

describe('releasing a reservation', () => {
	it('refuses while the marked divider is in the essay, and releases once it is removed', async () => {
		const placed = `${frontmatter(true)}${IMPORT}{/* shapenote-slot: break-1 */}\n<ShapeNoteDivider ref="old-hundred-tenor" />\n`;
		const paths = project({ ledger: ledger(assignment('writing/essay', 'break-1', 'old-hundred-tenor')), essays: { 'writing/essay.mdx': placed } });
		const before = ledgerBytes(paths);
		await rejects(releasePhrase(paths, { essay: 'writing/essay', slot: 'break-1' }), /line 11 still has the divider for slot "break-1"/);
		assert.equal(ledgerBytes(paths), before);

		writeFileSync(join(paths.content, 'writing/essay.mdx'), `${frontmatter(true)}${IMPORT}Prose.\n`);
		const released = await releasePhrase(paths, { essay: 'writing/essay', slot: 'break-1' });
		assert.equal(released.phraseId, 'old-hundred-tenor');
		assert.equal(ledgerBytes(paths), ledger());
		await rejects(releasePhrase(paths, { essay: 'writing/essay', slot: 'break-1' }), /No assignment for writing\/essay#break-1/);
	});

	it('releases the assignment of a deleted essay', async () => {
		const paths = project({ ledger: ledger(assignment('writing/gone', 'break-1', 'old-hundred-tenor')) });
		await releasePhrase(paths, { essay: 'writing/gone', slot: 'break-1' });
		assert.equal(ledgerBytes(paths), ledger());
	});
});

describe('the ledger lock', () => {
	const run = (paths: Paths, ...args: string[]) =>
		new Promise<{ code: number | null; stdout: string; stderr: string }>((done) => {
			const child = spawn(process.execPath, ['--experimental-strip-types', '--no-warnings', join(repository, 'scripts/phrase.ts'), ...args, '--root', paths.root]);
			let stdout = '';
			let stderr = '';
			child.stdout.on('data', (chunk) => (stdout += chunk));
			child.stderr.on('data', (chunk) => (stderr += chunk));
			child.on('close', (code) => done({ code, stdout, stderr }));
		});

	it('keeps concurrent draws from assigning the same phrase or corrupting the ledger', async () => {
		const paths = project({ extra: extraPhrase('extra-a') + extraPhrase('extra-b') + extraPhrase('extra-c'), ledger: ledger() });
		const slots = ['s1', 's2', 's3', 's4', 's5', 's6'];
		const results = await Promise.all(slots.map((slot) => run(paths, 'draw', '--essay', 'writing/draft-essay', '--slot', slot)));
		const succeeded = results.filter((outcome) => outcome.code === 0);
		assert.equal(succeeded.length, 5, results.map((outcome) => outcome.stderr).join('\n'));
		assert.match(results.find((outcome) => outcome.code !== 0)!.stderr, /No phrase is left to draw/);
		const { ledger: saved, problems } = readLedger(paths.ledger);
		assert.deepEqual(problems, []);
		assert.equal(new Set(saved.assignments.map((a) => a.phraseId)).size, 5);
		assert.equal(ledgerBytes(paths), serializeLedger(saved));
	});

	it('reports a lock left by a command that is no longer running, and changes nothing', async () => {
		const paths = project({ ledger: ledger() });
		const os = await import('node:os');
		writeFileSync(`${paths.ledger}.lock`, JSON.stringify({ pid: 2 ** 22 + 1, host: os.hostname(), createdAt: '2026-10-15T00:00:00.000Z' }));
		await rejects(drawPhrase(paths, { essay: 'writing/draft-essay', slot: 'a', pick: never }), /no longer running.*delete .*assignments\.json\.lock/s);
		assert.equal(ledgerBytes(paths), ledger());
	});

	it('phrase:check reads only, and fails on a published essay with a pending assignment', async () => {
		const paths = project({
			ledger: ledger(assignment('writing/essay', 'break-1', 'old-hundred-tenor')),
			essays: { 'writing/essay.mdx': `${frontmatter(false)}${IMPORT}Prose.\n` },
		});
		const before = ledgerBytes(paths);
		const outcome = await run(paths, 'check');
		assert.equal(outcome.code, 1);
		assert.match(outcome.stderr, /is published, but slot "break-1"/);
		assert.equal(ledgerBytes(paths), before);
	});
});
