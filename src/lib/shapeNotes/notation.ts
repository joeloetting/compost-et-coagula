// Shape-note notation: turns a stored phrase record into a list of resolved
// events (pitch, staff step, solmization syllable, notehead, written
// duration), and checks the record for anything that would make the
// quotation wrong.
//
// A record names its shape system explicitly, and each system has its own
// profile: there is no universal "seven-shape" and no conversion between
// systems. Shapes follow the solmization of the written key, read from the
// letter spelling of each pitch (never from its sounding pitch), so an
// accidental does not change a shape. In both systems a minor tune is
// la-centred: its tonic is la, and the relative major's tonic lies a third
// (two letters) above it.
//
// - fasola-four: the four shapes of The Southern Harmony (William Walker,
//   1854 edition) and The Sacred Harp. From the major tonic: fa sol la fa sol la mi.
// - swan-seven: the seven shapes of The New Harp of Columbia (M. L. Swan;
//   1919 printing). From the major tonic: do ra mi fa sol la si.

export type ShapeSystem = 'fasola-four' | 'swan-seven';
export type Mode = 'major' | 'minor';
export type FasolaSyllable = 'fa' | 'sol' | 'la' | 'mi';
export type SwanSyllable = 'do' | 'ra' | 'mi' | 'fa' | 'sol' | 'la' | 'si';
export type Syllable = FasolaSyllable | SwanSyllable;

/** Every notehead the renderer can draw, named by system and syllable. */
export type HeadId =
	| 'fasola-fa'
	| 'fasola-sol'
	| 'fasola-la'
	| 'fasola-mi'
	| 'swan-do'
	| 'swan-ra'
	| 'swan-mi'
	| 'swan-fa'
	| 'swan-sol'
	| 'swan-la'
	| 'swan-si';

export const HEAD_IDS: readonly HeadId[] = [
	'fasola-fa',
	'fasola-sol',
	'fasola-la',
	'fasola-mi',
	'swan-do',
	'swan-ra',
	'swan-mi',
	'swan-fa',
	'swan-sol',
	'swan-la',
	'swan-si',
];

/** Scale degrees from the major tonic, as each tunebook names them. */
export const FASOLA_SCALE: readonly FasolaSyllable[] = ['fa', 'sol', 'la', 'fa', 'sol', 'la', 'mi'];
export const SWAN_SCALE: readonly SwanSyllable[] = ['do', 'ra', 'mi', 'fa', 'sol', 'la', 'si'];

export interface ShapeProfile {
	system: ShapeSystem;
	/** The syllable for each degree of the major scale. */
	scale: readonly Syllable[];
	/** The notehead printed for each syllable. */
	heads: Partial<Record<Syllable, HeadId>>;
}

export const PROFILES: Record<ShapeSystem, ShapeProfile> = {
	'fasola-four': {
		system: 'fasola-four',
		scale: FASOLA_SCALE,
		heads: { fa: 'fasola-fa', sol: 'fasola-sol', la: 'fasola-la', mi: 'fasola-mi' },
	},
	'swan-seven': {
		system: 'swan-seven',
		scale: SWAN_SCALE,
		heads: {
			do: 'swan-do',
			ra: 'swan-ra',
			mi: 'swan-mi',
			fa: 'swan-fa',
			sol: 'swan-sol',
			la: 'swan-la',
			si: 'swan-si',
		},
	},
};

export type NoteValue = 'whole' | 'half' | 'quarter' | 'eighth' | 'sixteenth' | 'thirty-second';

/** A duration as it is written: a note value, dots, and an optional tuplet. */
export interface WrittenDuration {
	value: NoteValue;
	dots?: 0 | 1 | 2;
	/** `actual` notes in the time of `normal`: a triplet is { actual: 3, normal: 2 }. */
	tuplet?: { actual: number; normal: number };
}

export interface PhraseKey {
	/** Tonic as a letter with optional accidental: "A", "F#", "Bb". */
	tonic: string;
	mode: Mode;
}

/** A sung note. */
export interface NoteRecord {
	/** Scientific pitch name, as written: "A3", "G#3", "Bb4". Middle C is C4. */
	pitch: string;
	/** Written duration; a bare note value ("half") is short for { value: half }. */
	dur: WrittenDuration | NoteValue;
	/**
	 * The lyric syllable sung on this note. End it with "-" when the word goes
	 * on ("be-", "hold").
	 */
	syl?: string;
	/**
	 * This note carries the previous note's syllable on: set it instead of
	 * `syl`. It says nothing about how the notes are printed; record a slur,
	 * tie, or beam in the phrase's `spans`.
	 */
	continues?: boolean;
	/** The notehead printed in the source, if recorded; checked against the key. */
	sourceHead?: HeadId;
}

export interface RestRecord {
	rest: WrittenDuration | NoteValue;
}

export type EventRecord = NoteRecord | RestRecord;

/**
 * A slur, tie, or beam printed in the source, from one note to another.
 * `from` and `to` count notes and rests from 1, as error messages do.
 * Spans are only ever transcribed, never inferred from the lyric.
 */
export interface PhraseSpan {
	kind: 'slur' | 'tie' | 'beam';
	from: number;
	to: number;
}

/** Where the quotation was taken from. */
export interface PhraseSource {
	/** Title of the tunebook, e.g. "The New Harp of Columbia". */
	tunebook: string;
	/** Its compiler, e.g. "M. L. Swan". */
	compiler?: string;
	/** The edition or printing used, with its publisher. */
	edition?: string;
	year?: number;
	page?: number | string;
	/** The tune's name as printed. */
	tune: string;
	/** The voice quoted, notes and words alike: "tenor", "treble"... */
	voice: string;
	/** The verse whose words are quoted. */
	verse?: number;
	/** Where in the tune the phrase falls, e.g. "first line". */
	locator?: string;
	url?: string;
}

export interface PhraseRecord {
	id: string;
	title: string;
	/** Synthetic data or a placeholder citation, for tests and layout; never published. */
	fixture?: boolean;
	system: ShapeSystem;
	key: PhraseKey;
	meter?: string;
	source: PhraseSource;
	notes: EventRecord[];
	spans?: PhraseSpan[];
}

export interface ResolvedDuration {
	value: NoteValue;
	dots: number;
	tuplet?: { actual: number; normal: number };
	/** Elapsed time in quarter notes, derived from the written duration. */
	quarters: number;
	/** Whole and half notes are printed open; quarters and shorter are filled. */
	open: boolean;
	/** Flags on an unbeamed stem: 1 for an eighth, 2 for a sixteenth, 3 for a thirty-second. */
	flags: number;
	/** Whole notes have no stem. */
	stem: boolean;
}

export interface ResolvedNote {
	kind: 'note';
	index: number;
	pitch: string;
	/** Diatonic staff step: C4 = 28, D4 = 29 ... used for melodic contour. */
	step: number;
	syllable: Syllable;
	head: HeadId;
	dur: ResolvedDuration;
	syl?: string;
	/** Carries the previous syllable on (set explicitly in the record). */
	continues: boolean;
}

export interface ResolvedRest {
	kind: 'rest';
	index: number;
	dur: ResolvedDuration;
}

export type ResolvedEvent = ResolvedNote | ResolvedRest;

export interface ResolvedSpan {
	kind: PhraseSpan['kind'];
	/** Event indices, counted from 0. */
	from: number;
	to: number;
}

export interface ResolvedPhrase {
	id: string;
	title: string;
	fixture: boolean;
	system: ShapeSystem;
	key: PhraseKey;
	events: ResolvedEvent[];
	spans: ResolvedSpan[];
	/** The words of the phrase as one line, syllables joined into words. */
	lyric: string;
}

export class ShapeNoteError extends Error {
	constructor(id: string, problems: string[]) {
		super(`Shape-note phrase "${id}": ${problems.join('; ')}`);
		this.name = 'ShapeNoteError';
	}
}

const LETTERS = 'CDEFGAB';

const VALUES: Record<NoteValue, { quarters: number; flags: number }> = {
	whole: { quarters: 4, flags: 0 },
	half: { quarters: 2, flags: 0 },
	quarter: { quarters: 1, flags: 0 },
	eighth: { quarters: 0.5, flags: 1 },
	sixteenth: { quarters: 0.25, flags: 2 },
	'thirty-second': { quarters: 0.125, flags: 3 },
};

export function parsePitch(pitch: string): { letter: number; accidental: number; octave: number; step: number } | undefined {
	const match = /^([A-G])(#{1,2}|b{1,2})?(-?\d)$/.exec(pitch);
	if (!match) return undefined;
	const letter = LETTERS.indexOf(match[1]);
	const accidental = match[2] ? (match[2][0] === '#' ? 1 : -1) * match[2].length : 0;
	const octave = Number(match[3]);
	return { letter, accidental, octave, step: octave * 7 + letter };
}

function tonicLetter(tonic: string): number | undefined {
	const match = /^([A-G])(#|b)?$/.exec(tonic);
	return match ? LETTERS.indexOf(match[1]) : undefined;
}

/** Scale degree (0 = major tonic) of a letter in a key. */
function degreeFromMajorTonic(key: PhraseKey, letter: number): number {
	const tonic = tonicLetter(key.tonic) ?? 0;
	// A minor key's relative major tonic lies a third (two letters) above it.
	const majorTonic = key.mode === 'minor' ? (tonic + 2) % 7 : tonic;
	return (letter - majorTonic + 7) % 7;
}

/** The syllable a system sings for a written pitch in a key, from its letter. */
export function syllableFor(system: ShapeSystem, key: PhraseKey, pitch: string): Syllable {
	const parsed = parsePitch(pitch);
	if (!parsed) throw new Error(`not a pitch: ${pitch}`);
	return PROFILES[system].scale[degreeFromMajorTonic(key, parsed.letter)];
}

/** The notehead a system prints for a syllable. */
export function headFor(system: ShapeSystem, syllable: Syllable): HeadId {
	const head = PROFILES[system].heads[syllable];
	if (!head) throw new Error(`${system} has no syllable "${syllable}"`);
	return head;
}

/** Read a written duration; undefined if it is not one. */
export function resolveDuration(dur: WrittenDuration | NoteValue | undefined): ResolvedDuration | undefined {
	const written = typeof dur === 'string' ? { value: dur } : dur;
	if (!written || !(written.value in VALUES)) return undefined;
	const dots = written.dots ?? 0;
	if (![0, 1, 2].includes(dots)) return undefined;
	const tuplet = written.tuplet;
	if (tuplet && !(Number.isInteger(tuplet.actual) && Number.isInteger(tuplet.normal) && tuplet.actual > 0 && tuplet.normal > 0)) {
		return undefined;
	}
	const { quarters: base, flags } = VALUES[written.value];
	// Each dot adds half the previous value: one dot 1.5x, two dots 1.75x.
	const dotted = base * (2 - 1 / 2 ** dots);
	const quarters = tuplet ? (dotted * tuplet.normal) / tuplet.actual : dotted;
	return {
		value: written.value,
		dots,
		...(tuplet ? { tuplet } : {}),
		quarters,
		open: written.value === 'whole' || written.value === 'half',
		flags,
		stem: written.value !== 'whole',
	};
}

/** Join syllables into words: "be-" + "hold" -> "behold". */
export function lyricText(syllables: string[]): string {
	let text = '';
	for (const syl of syllables) {
		const joined = text.endsWith('-');
		if (joined) text = text.slice(0, -1);
		text += (text && !joined ? ' ' : '') + syl;
	}
	return text.replace(/-$/, '');
}

function isRest(event: EventRecord): event is RestRecord {
	return 'rest' in event;
}

/** Fields a phrase needs before it can be published as a quotation. */
export function citationProblems(record: Pick<PhraseRecord, 'fixture' | 'source'>): string[] {
	if (record.fixture) return [];
	const source = record.source;
	const problems: string[] = [];
	if (!source?.tunebook?.trim()) problems.push('source.tunebook is required');
	if (!source?.tune?.trim()) problems.push('source.tune is required');
	if (!source?.voice?.trim()) problems.push('source.voice is required: the voice whose notes and words are quoted');
	if (source?.verse == null) problems.push('source.verse is required: the verse whose words are quoted');
	if (source?.page == null && !source?.url) problems.push('source.page (or source.url) is required, so the quotation can be traced');
	return problems;
}

/**
 * Check a phrase record and resolve every event. Throws a ShapeNoteError
 * listing all problems found, so a broken quotation cannot be published.
 */
export function resolvePhrase(record: PhraseRecord): ResolvedPhrase {
	const problems: string[] = [];
	const profile = PROFILES[record.system];
	if (!profile) problems.push(`unknown shape system "${record.system}" (use "fasola-four" or "swan-seven")`);
	if (!record.key || tonicLetter(record.key.tonic) === undefined) problems.push(`key tonic must be a letter such as "A" or "F#"`);
	if (!record.key || !['major', 'minor'].includes(record.key.mode)) problems.push(`key mode must be "major" or "minor"`);
	if (!Array.isArray(record.notes) || record.notes.length === 0) problems.push('the phrase has no notes');
	problems.push(...citationProblems(record));
	if (problems.length) throw new ShapeNoteError(record.id, problems);

	const events: ResolvedEvent[] = [];
	const syllables: string[] = [];
	let previousNote: ResolvedNote | undefined;
	record.notes.forEach((event, index) => {
		const where = `note ${index + 1}`;
		if (isRest(event)) {
			const dur = resolveDuration(event.rest);
			if (!dur) problems.push(`${where}: rest duration ${JSON.stringify(event.rest)} is not a written duration`);
			else events.push({ kind: 'rest', index, dur });
			previousNote = undefined;
			return;
		}
		const parsed = parsePitch(event.pitch);
		const dur = resolveDuration(event.dur);
		if (!parsed) problems.push(`${where}: "${event.pitch}" is not a pitch such as "A3" or "G#4"`);
		if (!dur) {
			problems.push(`${where}: duration ${JSON.stringify(event.dur)} is not a written duration (a value such as "half", with optional dots and tuplet)`);
		}
		const syl = event.syl?.trim() || undefined;
		const continues = event.continues === true;
		if (syl && continues) problems.push(`${where}: has a syllable and also continues the previous one; give one or the other`);
		if (!syl && !continues) problems.push(`${where}: has no syllable; give "syl", or "continues: true" if it carries the previous syllable on`);
		if (continues && !previousNote) problems.push(`${where}: continues a syllable, but no sung note comes before it`);
		if (!parsed || !dur) return;
		const syllable = syllableFor(record.system, record.key, event.pitch);
		const head = headFor(record.system, syllable);
		if (event.sourceHead && event.sourceHead !== head) {
			problems.push(
				`${where}: the source prints ${event.sourceHead}, but ${event.pitch} in ${record.key.tonic} ${record.key.mode} is ${head}; check the transcription`,
			);
		}
		const note: ResolvedNote = { kind: 'note', index, pitch: event.pitch, step: parsed.step, syllable, head, dur, syl, continues };
		if (syl) syllables.push(syl);
		events.push(note);
		previousNote = note;
	});
	if (syllables.length === 0) problems.push('the phrase has no lyric syllables');

	const spans: ResolvedSpan[] = [];
	for (const span of record.spans ?? []) {
		const label = `${span.kind} ${span.from}-${span.to}`;
		const count = record.notes.length;
		if (!['slur', 'tie', 'beam'].includes(span.kind)) {
			problems.push(`${label}: unknown span kind (use slur, tie, or beam)`);
			continue;
		}
		if (!Number.isInteger(span.from) || !Number.isInteger(span.to) || span.from < 1 || span.to > count || span.from >= span.to) {
			problems.push(`${label}: must run forward between notes 1 and ${count}`);
			continue;
		}
		const covered = events.filter((e) => e.index >= span.from - 1 && e.index <= span.to - 1);
		if (covered.length !== span.to - span.from + 1) continue; // already reported
		if (covered.some((e) => e.kind === 'rest') && span.kind !== 'slur') problems.push(`${label}: a ${span.kind} cannot cross a rest`);
		if (span.kind === 'tie') {
			const pitches = new Set(covered.map((e) => (e.kind === 'note' ? e.pitch : '')));
			if (pitches.size !== 1) problems.push(`${label}: a tie joins notes of the same pitch`);
		}
		if (span.kind === 'beam' && covered.some((e) => e.dur.flags === 0)) {
			problems.push(`${label}: only eighth notes and shorter are beamed`);
		}
		spans.push({ kind: span.kind, from: span.from - 1, to: span.to - 1 });
	}
	if (problems.length) throw new ShapeNoteError(record.id, problems);

	return {
		id: record.id,
		title: record.title,
		fixture: Boolean(record.fixture),
		system: record.system,
		key: record.key,
		events,
		spans,
		lyric: lyricText(syllables),
	};
}
