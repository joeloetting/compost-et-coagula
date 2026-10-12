// Unit tests for shape-note notation and rendering. Run with `npm run test:unit`.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	citationProblems,
	HEAD_IDS,
	headFor,
	lyricText,
	parsePitch,
	type PhraseKey,
	type PhraseRecord,
	PROFILES,
	resolveDuration,
	resolvePhrase,
	ShapeNoteError,
	SWAN_SCALE,
	syllableFor,
} from './notation.ts';
import { MAX_EVENTS, renderHeadPath, renderPhraseSvg } from './render.ts';

const minor = { tonic: 'A', mode: 'minor' } as const;
const major = { tonic: 'G', mode: 'major' } as const;
const source = { tunebook: 'Test', tune: 'Test', voice: 'tenor', verse: 1, page: 1 };

function phrase(overrides: Partial<PhraseRecord> = {}): PhraseRecord {
	return {
		id: 'test',
		title: 'Test',
		fixture: true,
		system: 'fasola-four',
		key: minor,
		source,
		notes: [
			{ pitch: 'A3', dur: 'half', syl: 'Be-' },
			{ pitch: 'C4', dur: 'quarter', syl: 'hold' },
			{ pitch: 'B3', dur: 'quarter', continues: true },
			{ rest: 'half' },
			{ pitch: 'G#3', dur: { value: 'quarter', dots: 1 }, syl: 'the' },
			{ pitch: 'A3', dur: 'whole', syl: 'end.' },
		],
		...overrides,
	};
}

const fasola = (key: PhraseKey, pitch: string) => syllableFor('fasola-four', key, pitch);
const swan = (key: PhraseKey, pitch: string) => syllableFor('swan-seven', key, pitch);

describe('fasola-four profile', () => {
	it('maps a minor key from its tonic, la', () => {
		const sung = ['A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'G4'].map((p) => fasola(minor, p));
		assert.deepEqual(sung, ['la', 'mi', 'fa', 'sol', 'la', 'fa', 'sol']);
	});

	it('maps a major key from its tonic, fa', () => {
		const sung = ['G3', 'A3', 'B3', 'C4', 'D4', 'E4', 'F#4'].map((p) => fasola(major, p));
		assert.deepEqual(sung, ['fa', 'sol', 'la', 'fa', 'sol', 'la', 'mi']);
	});

	it('reads the letter, not the sounding pitch (the raised seventh is still sol)', () => {
		assert.equal(fasola(minor, 'G#3'), 'sol');
		assert.equal(fasola(minor, 'G3'), 'sol');
		assert.equal(syllableFor('fasola-four', { tonic: 'Bb', mode: 'major' }, 'Bb3'), 'fa');
		// The same sounding pitch, spelled two ways, takes two shapes.
		assert.notEqual(fasola(major, 'F#4'), fasola(major, 'Gb4'));
	});

	it('is the same in every octave', () => {
		assert.equal(fasola(minor, 'E2'), fasola(minor, 'E5'));
	});

	it('names only the four fasola heads', () => {
		assert.deepEqual(
			['fa', 'sol', 'la', 'mi'].map((s) => headFor('fasola-four', s as 'fa')),
			['fasola-fa', 'fasola-sol', 'fasola-la', 'fasola-mi'],
		);
		assert.throws(() => headFor('fasola-four', 'do'), /no syllable "do"/);
	});

	it('matches the heads printed for the opening of Idumea ("Flat Key on A")', () => {
		const pitches = ['A4', 'A4', 'G4', 'A4', 'C5', 'D5', 'C5'];
		assert.deepEqual(
			pitches.map((p) => headFor('fasola-four', fasola(minor, p))),
			['fasola-la', 'fasola-la', 'fasola-sol', 'fasola-la', 'fasola-fa', 'fasola-sol', 'fasola-fa'],
		);
	});
});

describe('swan-seven profile', () => {
	it('names the scale do ra mi fa sol la si', () => {
		assert.deepEqual(SWAN_SCALE, ['do', 'ra', 'mi', 'fa', 'sol', 'la', 'si']);
		assert.deepEqual(PROFILES['swan-seven'].scale, SWAN_SCALE);
	});

	it('maps a major key from do', () => {
		const sung = ['G3', 'A3', 'B3', 'C4', 'D4', 'E4', 'F#4'].map((p) => swan(major, p));
		assert.deepEqual(sung, ['do', 'ra', 'mi', 'fa', 'sol', 'la', 'si']);
	});

	it('keeps la as the minor tonic, through the relative major (Columbia, p. 6)', () => {
		const sung = ['A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'G4'].map((p) => swan(minor, p));
		assert.deepEqual(sung, ['la', 'si', 'do', 'ra', 'mi', 'fa', 'sol']);
	});

	it('gives every Swan syllable its own head', () => {
		assert.deepEqual(
			SWAN_SCALE.map((s) => headFor('swan-seven', s)),
			['swan-do', 'swan-ra', 'swan-mi', 'swan-fa', 'swan-sol', 'swan-la', 'swan-si'],
		);
	});
});

describe('written durations', () => {
	it('derives elapsed time from value, dots, and tuplet', () => {
		assert.equal(resolveDuration('whole')?.quarters, 4);
		assert.equal(resolveDuration({ value: 'half', dots: 1 })?.quarters, 3);
		assert.equal(resolveDuration({ value: 'quarter', dots: 2 })?.quarters, 1.75);
		assert.equal(resolveDuration('thirty-second')?.quarters, 0.125);
		assert.equal(resolveDuration({ value: 'eighth', tuplet: { actual: 3, normal: 2 } })?.quarters, 1 / 3);
	});

	it('prints whole and half notes open, quarters and shorter filled', () => {
		assert.deepEqual(
			(['whole', 'half', 'quarter', 'eighth', 'sixteenth', 'thirty-second'] as const).map((v) => resolveDuration(v)?.open),
			[true, true, false, false, false, false],
		);
		assert.equal(resolveDuration('thirty-second')?.flags, 3);
		assert.equal(resolveDuration('whole')?.stem, false);
	});

	it('refuses what is not a written duration', () => {
		assert.equal(resolveDuration('minim' as 'half'), undefined);
		assert.equal(resolveDuration({ value: 'half', dots: 3 as 2 }), undefined);
	});
});

describe('lyrics', () => {
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
			resolved.events.map((e) =>
				e.kind === 'rest' ? `rest ${e.dur.quarters}` : `${e.pitch} ${e.head} ${e.dur.quarters} ${e.syl ?? (e.continues ? '~' : '?')}`,
			),
			['A3 fasola-la 2 Be-', 'C4 fasola-fa 1 hold', 'B3 fasola-mi 1 ~', 'rest 2', 'G#3 fasola-sol 1.5 the', 'A3 fasola-la 4 end.'],
		);
	});

	it('resolves each system through its own profile, without conversion', () => {
		const notes = [{ pitch: 'A3', dur: 'half' as const, syl: 'la' }, { pitch: 'B3', dur: 'half' as const, syl: 'la' }];
		const four = resolvePhrase(phrase({ notes }));
		const seven = resolvePhrase(phrase({ system: 'swan-seven', notes }));
		assert.deepEqual(four.events.map((e) => e.kind === 'note' && e.head), ['fasola-la', 'fasola-mi']);
		assert.deepEqual(seven.events.map((e) => e.kind === 'note' && e.head), ['swan-la', 'swan-si']);
	});

	it('preserves contour as diatonic steps', () => {
		const steps = resolvePhrase(phrase()).events.flatMap((e) => (e.kind === 'note' ? [e.step] : []));
		assert.deepEqual(steps, [26, 28, 27, 25, 26]);
	});

	it('requires lyric continuation to be explicit', () => {
		const notes = [{ pitch: 'A3', dur: 'half' as const, syl: 'la' }, { pitch: 'B3', dur: 'half' as const }];
		assert.throws(() => resolvePhrase(phrase({ notes })), /note 2: has no syllable; give "syl", or "continues: true"/);
		const both = [{ pitch: 'A3', dur: 'half' as const, syl: 'la', continues: true }];
		assert.throws(() => resolvePhrase(phrase({ notes: both })), /also continues/);
	});

	it('keeps slurs, ties, and beams apart from the lyric, and checks them', () => {
		const notes = [
			{ pitch: 'A3', dur: 'eighth' as const, syl: 'one' },
			{ pitch: 'B3', dur: 'eighth' as const, syl: 'two' },
			{ pitch: 'B3', dur: 'half' as const, continues: true },
		];
		const resolved = resolvePhrase(phrase({ notes, spans: [{ kind: 'beam', from: 1, to: 2 }, { kind: 'tie', from: 2, to: 3 }] }));
		assert.deepEqual(resolved.spans, [{ kind: 'beam', from: 0, to: 1 }, { kind: 'tie', from: 1, to: 2 }]);
		// A beam does not make one syllable of two notes; the lyric says so on its own.
		assert.equal(resolved.lyric, 'one two');
		assert.throws(() => resolvePhrase(phrase({ notes, spans: [{ kind: 'tie', from: 1, to: 2 }] })), /same pitch/);
		assert.throws(() => resolvePhrase(phrase({ notes, spans: [{ kind: 'beam', from: 2, to: 3 }] })), /eighth notes and shorter/);
		assert.throws(() => resolvePhrase(phrase({ notes, spans: [{ kind: 'slur', from: 3, to: 4 }] })), /between notes 1 and 3/);
	});

	it('never adds a slur the record does not give', () => {
		assert.deepEqual(resolvePhrase(phrase()).spans, []);
	});

	it('sends a printed head that disagrees with the key back for review', () => {
		const notes = [{ pitch: 'A3', dur: 'half' as const, syl: 'la', sourceHead: 'swan-do' as const }];
		assert.throws(() => resolvePhrase(phrase({ system: 'swan-seven', notes })), /prints swan-do, but A3 in A minor is swan-la; check the transcription/);
		const agreeing = [{ pitch: 'A3', dur: 'half' as const, syl: 'la', sourceHead: 'swan-la' as const }];
		assert.doesNotThrow(() => resolvePhrase(phrase({ system: 'swan-seven', notes: agreeing })));
	});

	it('requires a citation, voice, and verse before a phrase can be published', () => {
		assert.deepEqual(citationProblems({ fixture: true, source: { tunebook: 'x', tune: 'x', voice: 'x' } }), []);
		const problems = citationProblems({ fixture: false, source: { tunebook: 'x', tune: 'x', voice: '' } });
		assert.ok(problems.some((p) => /source.voice/.test(p)));
		assert.ok(problems.some((p) => /source.verse/.test(p)));
		assert.ok(problems.some((p) => /source.page/.test(p)));
		assert.throws(() => resolvePhrase(phrase({ fixture: false, source: { ...source, verse: undefined } })), /source.verse is required/);
		assert.doesNotThrow(() => resolvePhrase(phrase({ fixture: false })));
	});

	it('reports every problem in malformed data', () => {
		const broken = phrase({
			notes: [
				{ pitch: 'H3', dur: 'half', syl: 'x' },
				{ pitch: 'A3', dur: 'minim' as 'half', syl: 'y' },
				{ rest: 'breve' as 'whole' },
				{ pitch: 'A3', dur: 'quarter', continues: true },
			],
		});
		assert.throws(
			() => resolvePhrase(broken),
			(error: unknown) =>
				error instanceof ShapeNoteError &&
				/"H3" is not a pitch/.test(error.message) &&
				/duration "minim" is not a written duration/.test(error.message) &&
				/rest duration "breve"/.test(error.message) &&
				/note 4: continues a syllable, but no sung note comes before it/.test(error.message),
		);
	});

	it('refuses a phrase with no notes or no words', () => {
		assert.throws(() => resolvePhrase(phrase({ notes: [] })), /has no notes/);
		assert.throws(() => resolvePhrase(phrase({ notes: [{ rest: 'half' }] })), /no lyric syllables/);
	});

	it('refuses a key or system it cannot read', () => {
		assert.throws(() => resolvePhrase(phrase({ key: { tonic: 'H', mode: 'minor' } })), /key tonic/);
		assert.throws(() => resolvePhrase(phrase({ system: 'seven-shape' as 'swan-seven' })), /unknown shape system/);
	});
});

describe('the verified phrases', () => {
	it('Old Hundred, tenor, verse 3 (New Harp of Columbia, p. 11): every head as printed', () => {
		const pitches = ['A4', 'A4', 'G#4', 'F#4', 'E4', 'A4', 'B4', 'C#5'];
		const printed = ['swan-do', 'swan-do', 'swan-si', 'swan-la', 'swan-sol', 'swan-do', 'swan-ra', 'swan-mi'];
		const key = { tonic: 'A', mode: 'major' } as const;
		assert.deepEqual(pitches.map((p) => headFor('swan-seven', swan(key, p))), printed);
	});

	it('Liverpool, tenor, verse 1 (The Southern Harmony, 1854): every head as printed', () => {
		const pitches = ['F4', 'F4', 'G4', 'A4', 'C5', 'D5', 'C5', 'A4', 'G4', 'F4'];
		const printed = ['fa', 'fa', 'sol', 'la', 'sol', 'la', 'sol', 'la', 'sol', 'fa'].map((s) => `fasola-${s}`);
		const key = { tonic: 'F', mode: 'major' } as const;
		assert.deepEqual(pitches.map((p) => headFor('fasola-four', fasola(key, p))), printed);
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
		assert.doesNotMatch(svg, /NaN|undefined|Infinity/);
	});

	it('draws every head of both systems, open and filled, without broken geometry', () => {
		for (const system of ['fasola-four', 'swan-seven'] as const) {
			for (const value of ['whole', 'half', 'quarter', 'eighth'] as const) {
				const notes = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4'].map((pitch) => ({ pitch, dur: value, syl: 'la' }));
				const { svg } = renderPhraseSvg(resolvePhrase(phrase({ system, key: { tonic: 'C', mode: 'major' }, notes })));
				assert.doesNotMatch(svg, /NaN|undefined|Infinity/, `${system} ${value}`);
			}
		}
		assert.equal(HEAD_IDS.length, 11);
	});

	it('cuts two counters into an open Swan do, one into an open ra', () => {
		const head = (pitch: string, dur: 'half' | 'quarter') => {
			const { svg } = renderPhraseSvg(resolvePhrase(phrase({ system: 'swan-seven', key: { tonic: 'C', mode: 'major' }, notes: [{ pitch, dur, syl: 'x' }] })));
			const d = /<g class="sn-note"[^>]*><path d="([^"]+)"/.exec(svg)?.[1] ?? '';
			return d.split('M').length - 1;
		};
		assert.equal(head('C4', 'half'), 3); // outline + two counters
		assert.equal(head('C4', 'quarter'), 1);
		assert.equal(head('D4', 'half'), 2); // outline + one counter
	});

	it('draws a beam instead of flags for beamed notes', () => {
		const notes = [
			{ pitch: 'A3', dur: 'eighth' as const, syl: 'one' },
			{ pitch: 'B3', dur: 'eighth' as const, continues: true },
		];
		const flagged = renderPhraseSvg(resolvePhrase(phrase({ notes }))).svg;
		const beamed = renderPhraseSvg(resolvePhrase(phrase({ notes, spans: [{ kind: 'beam', from: 1, to: 2 }] }))).svg;
		assert.equal((flagged.match(/C/g) ?? []).length > 0, true);
		assert.doesNotMatch(beamed.replace(/<defs>.*<\/defs>/, ''), /C[\d.]/);
		assert.match(beamed, /class="sn-note sn-spans"/);
	});

	it('keeps a short phrase within the divider width', () => {
		const { width, height } = renderPhraseSvg(resolvePhrase(phrase()));
		assert.ok(width <= 150, `width ${width}`);
		assert.ok(height < 50, `height ${height}`);
	});

	it('places higher notes higher', () => {
		const { svg } = renderPhraseSvg(resolvePhrase(phrase({ notes: [{ pitch: 'A3', dur: 'whole', syl: 'low' }, { pitch: 'E4', dur: 'whole', syl: 'high' }] })));
		const ys = [...svg.matchAll(/<g class="sn-note"[^>]*><path d="M[\d.]+ ([\d.]+)/g)].map((m) => Number(m[1]));
		assert.ok(ys[1] < ys[0], `y ${ys.join(', ')}`);
	});

	it('sets each notehead at its pitch: half a notehead per step, as on a staff', () => {
		// The opening of Idumea: A4 A4 G4 A4 C5 D5 C5.
		const pitches = ['A4', 'A4', 'G4', 'A4', 'C5', 'D5', 'C5'];
		const notes = pitches.map((pitch) => ({ pitch, dur: 'quarter' as const, syl: 'la' }));
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
		const notes = Array.from({ length: MAX_EVENTS + 1 }, () => ({ pitch: 'A3', dur: 'quarter' as const, syl: 'la' }));
		assert.throws(() => renderPhraseSvg(resolvePhrase(phrase({ notes }))), /at most/);
	});
});

describe('renderHeadPath', () => {
	it('draws the same head for the same seed, so the favicon is stable', () => {
		assert.deepEqual(renderHeadPath('fasola-fa', 'favicon'), renderHeadPath('fasola-fa', 'favicon'));
		assert.notEqual(renderHeadPath('fasola-fa', 'a').d, renderHeadPath('fasola-fa', 'b').d);
	});
});
