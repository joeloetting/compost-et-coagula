// Unit tests for shape-note notation and rendering. Run with `npm run test:unit`.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	durationGlyph,
	fourShapeSyllable,
	lyricText,
	parsePitch,
	type PhraseRecord,
	resolvePhrase,
	sevenShapeSyllable,
	ShapeNoteError,
	shapeFor,
} from './notation.ts';
import { MAX_EVENTS, renderPhraseSvg } from './render.ts';

const minor = { tonic: 'A', mode: 'minor' } as const;
const major = { tonic: 'G', mode: 'major' } as const;

function phrase(overrides: Partial<PhraseRecord> = {}): PhraseRecord {
	return {
		id: 'test',
		title: 'Test',
		fixture: true,
		notation: 'four-shape',
		key: minor,
		notes: [
			{ pitch: 'A3', dur: 2, syl: 'Be-' },
			{ pitch: 'C4', dur: 1, syl: 'hold' },
			{ pitch: 'B3', dur: 1 },
			{ rest: 2 },
			{ pitch: 'G#3', dur: 1.5, syl: 'the' },
			{ pitch: 'A3', dur: 4, syl: 'end.' },
		],
		...overrides,
	};
}

describe('four-shape solmization', () => {
	it('maps a minor key from its tonic, la', () => {
		const sung = ['A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'G4'].map((p) => fourShapeSyllable(minor, p));
		assert.deepEqual(sung, ['la', 'mi', 'fa', 'sol', 'la', 'fa', 'sol']);
	});

	it('maps a major key from its tonic, fa', () => {
		const sung = ['G3', 'A3', 'B3', 'C4', 'D4', 'E4', 'F#4'].map((p) => fourShapeSyllable(major, p));
		assert.deepEqual(sung, ['fa', 'sol', 'la', 'fa', 'sol', 'la', 'mi']);
	});

	it('keeps the shape of a note under an accidental (the raised seventh is still sol)', () => {
		assert.equal(fourShapeSyllable(minor, 'G#3'), 'sol');
		assert.equal(fourShapeSyllable(minor, 'G3'), 'sol');
		assert.equal(fourShapeSyllable({ tonic: 'Bb', mode: 'major' }, 'Bb3'), 'fa');
	});

	it('is the same in every octave', () => {
		assert.equal(fourShapeSyllable(minor, 'E2'), fourShapeSyllable(minor, 'E5'));
	});

	it('gives each syllable its traditional shape', () => {
		assert.equal(shapeFor('fa'), 'triangle');
		assert.equal(shapeFor('sol'), 'oval');
		assert.equal(shapeFor('la'), 'square');
		assert.equal(shapeFor('mi'), 'diamond');
	});

	it('matches the shapes printed for the opening of Idumea ("Flat Key on A")', () => {
		const printed = ['square', 'square', 'oval', 'square', 'triangle', 'oval', 'triangle'];
		const pitches = ['A4', 'A4', 'G4', 'A4', 'C5', 'D5', 'C5'];
		assert.deepEqual(pitches.map((p) => shapeFor(fourShapeSyllable(minor, p))), printed);
	});

	it('can name seven-shape syllables for later use', () => {
		assert.equal(sevenShapeSyllable(major, 'G4'), 'do');
		assert.equal(sevenShapeSyllable(major, 'F#4'), 'ti');
		assert.equal(sevenShapeSyllable(minor, 'A3'), 'la');
	});
});

describe('durations and lyrics', () => {
	it('names note values from durations in quarter notes', () => {
		assert.deepEqual(durationGlyph(4), { glyph: 'whole', dotted: false });
		assert.deepEqual(durationGlyph(3), { glyph: 'half', dotted: true });
		assert.deepEqual(durationGlyph(0.5), { glyph: 'eighth', dotted: false });
		assert.equal(durationGlyph(5), undefined);
	});

	it('joins syllables into words', () => {
		assert.equal(lyricText(['And', 'am', 'I', 'born', 'to', 'die?']), 'And am I born to die?');
		assert.equal(lyricText(['Be-', 'hold', 'the', 'won-', 'drous', 'love']), 'Behold the wondrous love');
	});
});

describe('resolvePhrase', () => {
	it('keeps pitch order, durations, rests, and syllable alignment', () => {
		const resolved = resolvePhrase(phrase());
		assert.equal(resolved.lyric, 'Behold the end.');
		assert.deepEqual(
			resolved.events.map((e) => (e.kind === 'rest' ? `rest ${e.dur}` : `${e.pitch} ${e.syllable} ${e.dur} ${e.syl ?? '~'}`)),
			['A3 la 2 Be-', 'C4 fa 1 hold', 'B3 mi 1 ~', 'rest 2', 'G#3 sol 1.5 the', 'A3 la 4 end.'],
		);
		const slurred = resolved.events[2];
		assert.ok(slurred.kind === 'note' && slurred.melisma);
	});

	it('preserves contour as diatonic steps', () => {
		const steps = resolvePhrase(phrase()).events.flatMap((e) => (e.kind === 'note' ? [e.step] : []));
		assert.deepEqual(steps, [26, 28, 27, 25, 26]);
	});

	it('refuses seven-shape notation instead of converting it', () => {
		assert.throws(() => resolvePhrase(phrase({ notation: 'seven-shape' })), /not converted to four shapes/);
	});

	it('reports every problem in malformed data', () => {
		const broken = phrase({
			notes: [{ pitch: 'H3', dur: 2, syl: 'x' }, { pitch: 'A3', dur: 5, syl: 'y' }, { rest: 0.3 }, { pitch: 'A3', dur: 1 }],
		});
		assert.throws(
			() => resolvePhrase(broken),
			(error: unknown) =>
				error instanceof ShapeNoteError &&
				/"H3" is not a pitch/.test(error.message) &&
				/duration 5 is not a note value/.test(error.message) &&
				/rest duration 0.3/.test(error.message) &&
				/note 4: has no syllable/.test(error.message),
		);
	});

	it('refuses a phrase with no notes or no words', () => {
		assert.throws(() => resolvePhrase(phrase({ notes: [] })), /has no notes/);
		assert.throws(() => resolvePhrase(phrase({ notes: [{ rest: 2 }] })), /no lyric syllables/);
	});

	it('refuses a key it cannot read', () => {
		assert.throws(() => resolvePhrase(phrase({ key: { tonic: 'H', mode: 'minor' } })), /key tonic/);
	});
});

describe('renderPhraseSvg', () => {
	it('is deterministic', () => {
		const a = renderPhraseSvg(resolvePhrase(phrase()));
		const b = renderPhraseSvg(resolvePhrase(phrase()));
		assert.equal(a.svg, b.svg);
	});

	it('varies the ink from phrase to phrase, but only by id', () => {
		const a = renderPhraseSvg(resolvePhrase(phrase({ id: 'one' })));
		const b = renderPhraseSvg(resolvePhrase(phrase({ id: 'two' })));
		assert.notEqual(a.svg, b.svg);
	});

	it('draws one group per note or rest, hidden from screen readers', () => {
		const { svg } = renderPhraseSvg(resolvePhrase(phrase()));
		assert.equal(svg.match(/class="sn-note"/g)?.length, 6);
		assert.match(svg, /^<svg[^>]*aria-hidden="true"/);
		assert.doesNotMatch(svg, /NaN|undefined/);
	});

	it('keeps a short phrase within the divider width', () => {
		const { width, height } = renderPhraseSvg(resolvePhrase(phrase()));
		assert.ok(width <= 150, `width ${width}`);
		assert.ok(height < 50, `height ${height}`);
	});

	it('places higher notes higher', () => {
		const { svg } = renderPhraseSvg(resolvePhrase(phrase({ notes: [{ pitch: 'A3', dur: 4, syl: 'low' }, { pitch: 'E4', dur: 4, syl: 'high' }] })));
		const ys = [...svg.matchAll(/<g class="sn-note"[^>]*><path d="M[\d.]+ ([\d.]+)/g)].map((m) => Number(m[1]));
		assert.ok(ys[1] < ys[0], `y ${ys.join(', ')}`);
	});

	it('sets each notehead at its pitch: half a notehead per step, as on a staff', () => {
		// The opening of Idumea: A4 A4 G4 A4 C5 D5 C5.
		const pitches = ['A4', 'A4', 'G4', 'A4', 'C5', 'D5', 'C5'];
		const notes = pitches.map((pitch) => ({ pitch, dur: 1, syl: 'la' }));
		const { svg } = renderPhraseSvg(resolvePhrase(phrase({ notes })));
		const centres = [...svg.matchAll(/<g class="sn-note"[^>]*><path d="([^"]+)"/g)].map(([, d]) => {
			const outer = d.split('Z')[0];
			const ys = [...outer.matchAll(/[ML][\d.]+ ([\d.]+)/g)].map((m) => Number(m[1]));
			return (Math.min(...ys) + Math.max(...ys)) / 2;
		});
		const steps = pitches.map((p) => -(parsePitch(p)!.step - parsePitch('A4')!.step));
		const headHeight = 6.8;
		centres.forEach((y, i) => {
			const expected = centres[0] + steps[i] * (headHeight / 2);
			assert.ok(Math.abs(y - expected) < 0.5, `${pitches[i]}: y ${y.toFixed(2)}, expected ${expected.toFixed(2)}`);
		});
	});

	it('refuses a phrase too long for a divider', () => {
		const notes = Array.from({ length: MAX_EVENTS + 1 }, () => ({ pitch: 'A3', dur: 1, syl: 'la' }));
		assert.throws(() => renderPhraseSvg(resolvePhrase(phrase({ notes }))), /at most/);
	});
});
