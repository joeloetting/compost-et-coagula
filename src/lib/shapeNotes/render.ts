// SVG for a shape-note phrase: noteheads, stems, flags, dots and rests, set
// without a staff. Horizontal spacing follows the rhythm; vertical position
// follows the melodic contour (diatonic steps), so the melody is legible but
// the figure stays small.
//
// The "printed" look comes from deterministic irregularity: every outline is
// sampled as a polygon, each point is nudged by a pseudo-random amount seeded
// from the phrase id and note index, and the corners are slightly softened.
// Ink density and stem weight vary a little from note to note, and a light
// SVG filter roughens edges and drops out a few specks of ink. The same
// phrase always produces byte-identical SVG.

import type { ResolvedEvent, ResolvedNote, ResolvedPhrase, Shape } from './notation.ts';

/** Notehead size and spacing, in SVG units (1 unit = 1 CSS px at the default size). */
const HEAD_W = 8.4;
const HEAD_H = 6.8;
// One diatonic step is half a notehead, as on a staff: a note on a line and
// the note in the next space overlap by half their height.
const STEP = HEAD_H / 2;
const STEM = 10.5;
const PAD = 2;
const MAX_WIDTH = 150;
/** Closest spacing allowed when a phrase is compressed to fit; longer phrases are refused. */
const MIN_ADVANCE = HEAD_W + 2.6;
export const MAX_EVENTS = 16;

export interface RenderedPhrase {
	svg: string;
	width: number;
	height: number;
	/** Vertical centre of the noteheads' range, where the rule passes. */
	ruleY: number;
}

type Point = [number, number];

/** FNV-1a hash of a string, for seeding. */
function hash(text: string): number {
	let h = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) {
		h ^= text.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return h >>> 0;
}

/** Small deterministic PRNG (mulberry32): the same seed gives the same sequence. */
function random(seed: number): () => number {
	let a = seed;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const n = (value: number) => {
	const rounded = Math.round(value * 100) / 100;
	return Object.is(rounded, -0) ? '0' : String(rounded);
};

/** The outline of a notehead, centred on (0, 0), before irregularity. */
function outline(shape: Shape, stemUp: boolean): Point[] {
	const w = HEAD_W / 2;
	const h = HEAD_H / 2;
	switch (shape) {
		case 'triangle':
			// Fa: a right triangle on a flat base, its upright side towards the stem.
			return stemUp
				? [[-w, h], [w, h], [w, -h]]
				: [[-w, -h], [-w, h], [w, h]];
		case 'square':
			return [[-w * 0.8, -h * 0.82], [w * 0.8, -h * 0.82], [w * 0.8, h * 0.82], [-w * 0.8, h * 0.82]];
		case 'diamond':
			return [[0, -h * 1.08], [w, 0], [0, h * 1.08], [-w, 0]];
		case 'oval': {
			// Sol: a slightly tilted oval, as in the round notes of the period.
			const points: Point[] = [];
			const tilt = -0.32;
			for (let i = 0; i < 20; i++) {
				const a = (i / 20) * Math.PI * 2;
				const x = Math.cos(a) * w * 0.96;
				const y = Math.sin(a) * h * 0.8;
				points.push([x * Math.cos(tilt) - y * Math.sin(tilt), x * Math.sin(tilt) + y * Math.cos(tilt)]);
			}
			return points;
		}
	}
}

/** Where a stem meets the head: x offset from the centre, and y. */
function stemAnchor(shape: Shape, stemUp: boolean): Point {
	const w = HEAD_W / 2;
	const h = HEAD_H / 2;
	switch (shape) {
		case 'triangle':
			return stemUp ? [w, -h] : [-w, h];
		case 'square':
			return stemUp ? [w * 0.8, -h * 0.5] : [-w * 0.8, h * 0.5];
		case 'diamond':
			return stemUp ? [w, 0] : [-w, 0];
		case 'oval':
			return stemUp ? [w * 0.86, -h * 0.3] : [-w * 0.86, h * 0.3];
	}
}

/** Split straight edges so they can be nudged irregularly, like worn type. */
function subdivide(points: Point[], parts: number): Point[] {
	if (points.length > 8) return points;
	const result: Point[] = [];
	points.forEach((p, i) => {
		const q = points[(i + 1) % points.length];
		for (let k = 0; k < parts; k++) {
			const t = k / parts;
			result.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
		}
	});
	return result;
}

/** Nudge each point towards or away from the centre by a small, seeded amount. */
function roughen(points: Point[], rand: () => number, amount: number): Point[] {
	return points.map(([x, y]) => {
		const length = Math.hypot(x, y) || 1;
		const d = (rand() - 0.5) * 2 * amount;
		return [x + (x / length) * d, y + (y / length) * d];
	});
}

/** One pass of corner cutting, so corners read as softened rather than drawn. */
function soften(points: Point[], ratio: number): Point[] {
	const result: Point[] = [];
	points.forEach((p, i) => {
		const q = points[(i + 1) % points.length];
		result.push([p[0] + (q[0] - p[0]) * ratio, p[1] + (q[1] - p[1]) * ratio]);
		result.push([p[0] + (q[0] - p[0]) * (1 - ratio), p[1] + (q[1] - p[1]) * (1 - ratio)]);
	});
	return result;
}

function path(points: Point[], dx: number, dy: number): string {
	return `M${points.map(([x, y]) => `${n(x + dx)} ${n(y + dy)}`).join('L')}Z`;
}

function headPath(note: ResolvedNote, stemUp: boolean, x: number, y: number, rand: () => number): string {
	const base = subdivide(outline(note.shape, stemUp), 3);
	const outer = soften(roughen(base, rand, 0.16), 0.14);
	let d = path(outer, x, y);
	if (note.glyph === 'whole' || note.glyph === 'half') {
		// Open notes: an inner counter, a little irregular too, cut out with evenodd.
		const sx = note.shape === 'triangle' ? 0.5 : 0.54;
		const sy = note.shape === 'triangle' ? 0.46 : 0.46;
		const cx = outer.reduce((s, p) => s + p[0], 0) / outer.length;
		const cy = outer.reduce((s, p) => s + p[1], 0) / outer.length;
		const inner = roughen(base, rand, 0.1).map(([px, py]): Point => [cx + (px - cx) * sx, cy + (py - cy) * sy]);
		d += path(soften(inner, 0.2), x, y);
	}
	return d;
}

/** Advance after an event, in units: grows with duration, but less than proportionally. */
function advance(dur: number): number {
	return 6.5 + 4.6 * Math.sqrt(dur);
}

interface Placed {
	event: ResolvedEvent;
	x: number;
}

export function renderPhraseSvg(phrase: ResolvedPhrase, options: { filterId?: string } = {}): RenderedPhrase {
	const filterId = options.filterId ?? `shapenote-ink-${phrase.id}`;
	if (phrase.events.length > MAX_EVENTS) {
		throw new Error(`Shape-note phrase "${phrase.id}" has ${phrase.events.length} notes and rests; a divider quotes at most ${MAX_EVENTS}.`);
	}
	const notes = phrase.events.filter((e): e is ResolvedNote => e.kind === 'note');
	const maxStep = Math.max(...notes.map((e) => e.step));
	const minStep = Math.min(...notes.map((e) => e.step));
	const midStep = (maxStep + minStep) / 2;

	// Horizontal placement by rhythm, compressed if the phrase would be too wide.
	const placed: Placed[] = [];
	let x = 0;
	for (const event of phrase.events) {
		placed.push({ event, x });
		x += advance(event.dur);
	}
	const natural = placed.length ? placed[placed.length - 1].x : 0;
	const available = MAX_WIDTH - HEAD_W - PAD * 2 - 3;
	const tightest = Math.min(...phrase.events.slice(0, -1).map((e) => advance(e.dur)));
	const scale = natural > available ? Math.max(available / natural, MIN_ADVANCE / tightest) : 1;
	const left = PAD + HEAD_W / 2;

	// Contour: the highest note sits STEM + PAD from the top, so a downward
	// stem on a low note and an upward stem on a high note both fit.
	const top = PAD + STEM;
	const yOf = (step: number) => top + (maxStep - step) * STEP;
	const ruleY = (yOf(maxStep) + yOf(minStep)) / 2;
	const height = yOf(minStep) + STEM + PAD;

	const parts: string[] = [];
	placed.forEach(({ event, x: px }, i) => {
		const cx = left + px * scale;
		const rand = random(hash(`${phrase.id}:${event.index}`));
		const ink = 0.86 + rand() * 0.12;
		let body = '';
		if (event.kind === 'rest') {
			body = restPath(event.glyph, cx, ruleY, rand);
		} else {
			const cy = yOf(event.step);
			const stemUp = event.step <= midStep;
			body = `<path d="${headPath(event, stemUp, cx, cy, rand)}" fill-rule="evenodd"/>`;
			if (event.glyph !== 'whole') {
				const [ax, ay] = stemAnchor(event.shape, stemUp);
				const sw = 0.7 + rand() * 0.22;
				const lean = (rand() - 0.5) * 0.2;
				const x0 = cx + ax;
				const y0 = cy + ay;
				const y1 = stemUp ? cy - STEM : cy + STEM;
				const half = sw / 2;
				body += `<path d="M${n(x0 - half)} ${n(y0)}L${n(x0 + lean - half)} ${n(y1)}L${n(x0 + lean + half)} ${n(y1)}L${n(x0 + half)} ${n(y0)}Z"/>`;
				const flags = event.glyph === 'eighth' ? 1 : event.glyph === 'sixteenth' ? 2 : 0;
				for (let f = 0; f < flags; f++) {
					const fy = y1 + (stemUp ? f * 2.6 : -f * 2.6);
					const dir = stemUp ? 1 : -1;
					const fx = x0 + lean;
					body += `<path d="M${n(fx)} ${n(fy)}C${n(fx + 1.4)} ${n(fy + dir * 2.4)} ${n(fx + 4.4)} ${n(fy + dir * 3.2)} ${n(fx + 3.4)} ${n(fy + dir * 6.4)}C${n(fx + 3.6)} ${n(fy + dir * 4)} ${n(fx + 1.6)} ${n(fy + dir * 3.2)} ${n(fx)} ${n(fy + dir * 2.4)}Z"/>`;
				}
			}
			if (event.dotted) {
				// A dot sits in a space: raise it half a step when the note is on a line.
				const onLine = event.step % 2 === 0;
				body += `<circle cx="${n(cx + HEAD_W / 2 + 2.2)}" cy="${n(cy - (onLine ? STEP / 2 : 0))}" r="0.85"/>`;
			}
		}
		parts.push(`<g class="sn-note" style="--i:${i}" fill-opacity="${n(ink)}">${body}</g>`);
	});

	const width = left + natural * scale + HEAD_W / 2 + PAD + 3;
	const seed = hash(phrase.id) % 1000;
	const defs =
		`<defs><filter id="${filterId}" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">` +
		`<feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="${seed}" result="warp"/>` +
		`<feDisplacementMap in="SourceGraphic" in2="warp" scale="0.55" xChannelSelector="R" yChannelSelector="G" result="edge"/>` +
		`<feTurbulence type="fractalNoise" baseFrequency="2.2" numOctaves="1" seed="${seed + 1}" result="grain"/>` +
		`<feColorMatrix in="grain" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -7 0 0 0 5.3" result="speck"/>` +
		`<feComposite in="edge" in2="speck" operator="in"/>` +
		`</filter></defs>`;
	const svg =
		`<svg class="sn-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(width)} ${n(height)}" width="${n(width)}" height="${n(height)}" aria-hidden="true" focusable="false">` +
		defs +
		`<g fill="currentColor" filter="url(#${filterId})">${parts.join('')}</g></svg>`;
	return { svg, width: Number(n(width)), height: Number(n(height)), ruleY: Number(n(ruleY)) };
}

/** Rests, kept simple at this size: a block for whole and half, a stroke for shorter values. */
function restPath(glyph: string, cx: number, y: number, rand: () => number): string {
	const j = (rand() - 0.5) * 0.2;
	if (glyph === 'whole' || glyph === 'half') {
		// The whole rest hangs below its line, the half rest sits on it.
		const y0 = glyph === 'whole' ? y : y - 1.8;
		return `<path d="M${n(cx - 2.6)} ${n(y0 + j)}L${n(cx + 2.6)} ${n(y0 - j)}L${n(cx + 2.6)} ${n(y0 + 1.8 - j)}L${n(cx - 2.6)} ${n(y0 + 1.8 + j)}Z"/>`;
	}
	// Quarter and shorter: a small slanted hook, the shape of the period's crotchet rest.
	return `<path d="M${n(cx - 1)} ${n(y - 4)}L${n(cx + 1.4)} ${n(y - 0.6)}L${n(cx - 0.6)} ${n(y + 1)}L${n(cx + 1.2)} ${n(y + 4)}L${n(cx + 0.4)} ${n(y + 4)}L${n(cx - 1.6)} ${n(y + 1.2)}L${n(cx + 0.2)} ${n(y - 0.4)}L${n(cx - 1.8)} ${n(y - 3.4)}Z"/>`;
}
