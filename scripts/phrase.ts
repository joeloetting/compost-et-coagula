// Authoring commands for shape-note dividers: draw a phrase for an essay's
// divider slot, list what is available and reserved, check the ledger against
// the essays, and release a reservation. See "Drawing a phrase" in README.md.
//
//   npm run phrase:draw -- --essay writing/an-essay --slot break-1 [--distinct-passages]
//   npm run phrase:list [-- --fixtures]
//   npm run phrase:check
//   npm run phrase:release -- --essay writing/an-essay --slot break-1
//
// `--root <dir>` runs against another copy of the project (used by the tests).
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
	analyze,
	DEMONSTRATION_ESSAYS,
	drawPhrase,
	eligiblePool,
	PhraseCommandError,
	phraseSummary,
	projectPaths,
	releasePhrase,
} from '../src/lib/shapeNotes/assignments.ts';
import { passageOf } from '../src/lib/shapeNotes/catalog.ts';

const USAGE = `Usage:
  npm run phrase:draw -- --essay writing/an-essay --slot break-1 [--distinct-passages]
  npm run phrase:list [-- --fixtures]
  npm run phrase:check
  npm run phrase:release -- --essay writing/an-essay --slot break-1`;

const { values, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		essay: { type: 'string' },
		slot: { type: 'string' },
		'distinct-passages': { type: 'boolean', default: false },
		fixtures: { type: 'boolean', default: false },
		root: { type: 'string' },
	},
});
const command = positionals[0];
const paths = projectPaths(resolve(values.root ?? new URL('..', import.meta.url).pathname));

function required(name: 'essay' | 'slot'): string {
	const value = values[name]?.trim();
	if (!value) throw new PhraseCommandError([`--${name} is required.`, USAGE]);
	return value;
}

const list = (lines: string[], indent = '  ') => lines.map((line) => `${indent}${line}`).join('\n');

async function draw() {
	const outcome = await drawPhrase(paths, { essay: required('essay'), slot: required('slot'), distinctPassages: values['distinct-passages'] });
	const { assignment, phrase } = outcome;
	if (outcome.warnings.length) console.warn(`Warning: npm run phrase:check reports problems elsewhere:\n${list(outcome.warnings)}\n`);
	console.log(
		outcome.status === 'existing'
			? `${assignment.essay}#${assignment.slot} already has "${assignment.phraseId}" (drawn ${assignment.assignedAt}). Nothing was changed.`
			: `Drew "${assignment.phraseId}" for ${assignment.essay}#${assignment.slot}, from ${outcome.poolSize} available phrase(s). Saved in src/data/shapeNotes/assignments.json.`,
	);
	console.log(`  ${phraseSummary(phrase)}`);
	if (outcome.importLine) console.log(`\nThe essay does not import the divider yet; add this after its frontmatter:\n\n${outcome.importLine}`);
	console.log(`\nPaste this where the break goes:\n\n${outcome.snippet}\n`);
}

function listPhrases() {
	const state = analyze(paths);
	const problems = [...state.catalogProblems, ...state.ledgerProblems];
	if (problems.length) console.warn(`Problems (npm run phrase:check fails on these):\n${list(problems)}\n`);
	const quotable = state.catalog.phrases.filter((phrase) => !phrase.fixture);
	const available = new Set(eligiblePool(state).map((phrase) => phrase.id));
	const distinct = new Set(eligiblePool(state, true).map(passageOf));
	const reservedBy = new Map<string, string[]>();
	for (const reservation of state.reservations) {
		reservedBy.set(reservation.phraseId, [...(reservedBy.get(reservation.phraseId) ?? []), `${reservation.kind === 'manual' ? 'by hand in ' : ''}${reservation.by}`]);
	}
	const passages = new Set(quotable.map(passageOf));
	console.log(`Quotable phrases: ${quotable.length}, from ${passages.size} distinct passage(s). Available to draw: ${available.size} (${distinct.size} with --distinct-passages).`);
	for (const phrase of quotable) {
		const status = available.has(phrase.id) ? 'available' : `reserved: ${reservedBy.get(phrase.id)?.join('; ')}`;
		console.log(`  ${phrase.id}  [passage ${passageOf(phrase)}]  ${status}\n    ${phraseSummary(phrase)}`);
	}
	if (values.fixtures) {
		const fixtures = state.catalog.phrases.filter((phrase) => phrase.fixture);
		console.log(`\nFixtures (demonstration data, never drawn): ${fixtures.length}`);
		for (const phrase of fixtures) console.log(`  ${phrase.id}  INELIGIBLE: fixture  (${phrase.title})`);
	}
	console.log(`\nAssignments: ${state.ledger.assignments.length}`);
	const pending = new Set(state.pending);
	for (const assignment of state.ledger.assignments) {
		const where = !state.essays.has(assignment.essay) ? 'essay missing' : pending.has(assignment) ? 'pending: drawn, not yet placed' : 'placed';
		console.log(`  ${assignment.essay}#${assignment.slot}  ${assignment.phraseId}  (${where}; drawn ${assignment.assignedAt})`);
	}
	console.log(`\nDividers in ${DEMONSTRATION_ESSAYS.join(', ')} demonstrate the component and reserve nothing.`);
}

function check() {
	const state = analyze(paths);
	const errors = [
		...state.catalogProblems.map((problem) => `phrases.yaml: ${problem}`),
		...state.ledgerProblems.map((problem) => `assignments.json: ${problem}`),
		...state.errors,
	];
	if (state.warnings.length) console.warn(`Not checked:\n${list(state.warnings)}`);
	if (state.pending.length) {
		console.log(`Pending (drawn for a draft, not yet placed):\n${list(state.pending.map((a) => `${a.essay}#${a.slot}  ${a.phraseId}`))}`);
	}
	console.log(
		`Checked ${state.catalog.phrases.length} phrase(s), ${state.ledger.assignments.length} assignment(s), and ${state.scans.reduce((sum, scan) => sum + scan.uses.length, 0)} divider(s) in ${state.scans.length} entries.`,
	);
	if (errors.length) {
		console.error(`Shape-note assignment problems:\n${list(errors)}`);
		process.exitCode = 1;
		return;
	}
	console.log('No problems found.');
}

async function release() {
	const assignment = await releasePhrase(paths, { essay: required('essay'), slot: required('slot') });
	console.log(`Released ${assignment.essay}#${assignment.slot} ("${assignment.phraseId}"). It can be drawn again unless a divider elsewhere quotes it.`);
}

try {
	if (command === 'draw') await draw();
	else if (command === 'list') listPhrases();
	else if (command === 'check') check();
	else if (command === 'release') await release();
	else throw new PhraseCommandError([command ? `Unknown command "${command}".` : 'No command given.', USAGE]);
} catch (error) {
	if (!(error instanceof PhraseCommandError)) throw error;
	console.error(error.message);
	process.exitCode = 1;
}
