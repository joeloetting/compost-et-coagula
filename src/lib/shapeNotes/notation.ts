// Shape-note notation: turns a stored phrase record into a list of resolved
// events (pitch, staff step, solmization syllable, notehead shape, duration),
// and checks the record for anything that would make the quotation wrong.
//
// Shapes follow the solmization of the written key, never visual balance. In
// the four-shape (fasola) system of The Sacred Harp, the scale from the major
// tonic is fa sol la fa sol la mi; a minor tune is la-centred, so its tonic is
// la and the relative major's tonic (a minor third above) is fa. Shapes go by
// staff position (letter name), so an accidental does not change the shape:
// the raised seventh of a minor key is still sung sol.
//
// The record format already carries seven-shape notation (The New Harp of
// Columbia, Christian Harmony) so it can be supported later. It is not
// rendered yet, and it is never converted to four shapes.

export type Notation = 'four-shape' | 'seven-shape';
export type Mode = 'major' | 'minor';
export type FourShapeSyllable = 'fa' | 'sol' | 'la' | 'mi';
export type SevenShapeSyllable = 'do' | 're' | 'mi' | 'fa' | 'sol' | 'la' | 'ti';
export type Shape = 'triangle' | 'oval' | 'square' | 'diamond';
export type Glyph = 'whole' | 'half' | 'quarter' | 'eighth' | 'sixteenth';

export interface PhraseKey {
	/** Tonic as a letter with optional accidental: "A", "F#", "Bb". */
	tonic: string;
	mode: Mode;
}

/** A sounding note. `dur` is in quarter notes: 4 whole, 2 half, 1.5 dotted quarter, 0.5 eighth. */
export interface NoteRecord {
	/** Scientific pitch name: "A3", "G#3", "Bb4". Middle C is C4. */
	pitch: string;
	dur: number;
	/**
	 * The lyric syllable sung on this note. End it with "-" when the word goes
	 * on ("be-", "hold"). Omit it on the later notes of a slur (melisma).
	 */
	syl?: string;
}

export interface RestRecord {
	rest: number;
}

export type EventRecord = NoteRecord | RestRecord;

export interface PhraseRecord {
	id: string;
	title: string;
	/** Synthetic data for tests and layout fixtures; never published. */
	fixture?: boolean;
	notation: Notation;
	key: PhraseKey;
	meter?: string;
	/** Which voice the phrase is taken from, e.g. "tenor" (the melody in The Sacred Harp). */
	voice?: string;
	notes: EventRecord[];
}

export interface ResolvedNote {
	kind: 'note';
	index: number;
	pitch: string;
	/** Diatonic staff step: C4 = 28, D4 = 29 ... used for melodic contour. */
	step: number;
	syllable: FourShapeSyllable;
	shape: Shape;
	dur: number;
	glyph: Glyph;
	dotted: boolean;
	syl?: string;
	/** A later note of a slur: carries no syllable of its own. */
	melisma: boolean;
}

export interface ResolvedRest {
	kind: 'rest';
	index: number;
	dur: number;
	glyph: Glyph;
	dotted: boolean;
}

export type ResolvedEvent = ResolvedNote | ResolvedRest;

export interface ResolvedPhrase {
	id: string;
	title: string;
	fixture: boolean;
	notation: 'four-shape';
	key: PhraseKey;
	events: ResolvedEvent[];
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
const FOUR_SHAPE_SCALE: FourShapeSyllable[] = ['fa', 'sol', 'la', 'fa', 'sol', 'la', 'mi'];
const SEVEN_SHAPE_SCALE: SevenShapeSyllable[] = ['do', 're', 'mi', 'fa', 'sol', 'la', 'ti'];
const SHAPES: Record<FourShapeSyllable, Shape> = { fa: 'triangle', sol: 'oval', la: 'square', mi: 'diamond' };

const GLYPHS: Record<string, { glyph: Glyph; dotted: boolean }> = {
	'6': { glyph: 'whole', dotted: true },
	'4': { glyph: 'whole', dotted: false },
	'3': { glyph: 'half', dotted: true },
	'2': { glyph: 'half', dotted: false },
	'1.5': { glyph: 'quarter', dotted: true },
	'1': { glyph: 'quarter', dotted: false },
	'0.75': { glyph: 'eighth', dotted: true },
	'0.5': { glyph: 'eighth', dotted: false },
	'0.25': { glyph: 'sixteenth', dotted: false },
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

export function fourShapeSyllable(key: PhraseKey, pitch: string): FourShapeSyllable {
	const parsed = parsePitch(pitch);
	if (!parsed) throw new Error(`not a pitch: ${pitch}`);
	return FOUR_SHAPE_SCALE[degreeFromMajorTonic(key, parsed.letter)];
}

export function sevenShapeSyllable(key: PhraseKey, pitch: string): SevenShapeSyllable {
	const parsed = parsePitch(pitch);
	if (!parsed) throw new Error(`not a pitch: ${pitch}`);
	return SEVEN_SHAPE_SCALE[degreeFromMajorTonic(key, parsed.letter)];
}

export function shapeFor(syllable: FourShapeSyllable): Shape {
	return SHAPES[syllable];
}

export function durationGlyph(dur: number): { glyph: Glyph; dotted: boolean } | undefined {
	return GLYPHS[String(dur)];
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

/**
 * Check a phrase record and resolve every event. Throws a ShapeNoteError
 * listing all problems found, so a broken quotation cannot be published.
 */
export function resolvePhrase(record: PhraseRecord): ResolvedPhrase {
	const problems: string[] = [];
	if (record.notation === 'seven-shape') {
		throw new ShapeNoteError(record.id, [
			'seven-shape notation is stored but not rendered yet; it is not converted to four shapes',
		]);
	}
	if (record.notation !== 'four-shape') problems.push(`unknown notation "${record.notation}"`);
	if (!record.key || tonicLetter(record.key.tonic) === undefined) problems.push(`key tonic must be a letter such as "A" or "F#"`);
	if (!record.key || !['major', 'minor'].includes(record.key.mode)) problems.push(`key mode must be "major" or "minor"`);
	if (!Array.isArray(record.notes) || record.notes.length === 0) problems.push('the phrase has no notes');
	if (problems.length) throw new ShapeNoteError(record.id, problems);

	const events: ResolvedEvent[] = [];
	const syllables: string[] = [];
	let previousNote: ResolvedNote | undefined;
	record.notes.forEach((event, index) => {
		const where = `note ${index + 1}`;
		if (isRest(event)) {
			const glyph = durationGlyph(event.rest);
			if (!glyph) problems.push(`${where}: rest duration ${event.rest} is not a note value`);
			else events.push({ kind: 'rest', index, dur: event.rest, ...glyph });
			previousNote = undefined;
			return;
		}
		const parsed = parsePitch(event.pitch);
		const glyph = durationGlyph(event.dur);
		if (!parsed) problems.push(`${where}: "${event.pitch}" is not a pitch such as "A3" or "G#4"`);
		if (!glyph) problems.push(`${where}: duration ${event.dur} is not a note value (use 4, 2, 1, 0.5 ... in quarter notes)`);
		const syl = event.syl?.trim() || undefined;
		const melisma = syl === undefined;
		if (melisma && !previousNote) problems.push(`${where}: has no syllable and does not continue a sung note`);
		if (!parsed || !glyph) return;
		const syllable = fourShapeSyllable(record.key, event.pitch);
		const note: ResolvedNote = {
			kind: 'note',
			index,
			pitch: event.pitch,
			step: parsed.step,
			syllable,
			shape: shapeFor(syllable),
			dur: event.dur,
			...glyph,
			syl,
			melisma,
		};
		if (syl) syllables.push(syl);
		events.push(note);
		previousNote = note;
	});
	if (syllables.length === 0) problems.push('the phrase has no lyric syllables');
	if (problems.length) throw new ShapeNoteError(record.id, problems);

	return {
		id: record.id,
		title: record.title,
		fixture: Boolean(record.fixture),
		notation: 'four-shape',
		key: record.key,
		events,
		lyric: lyricText(syllables),
	};
}
