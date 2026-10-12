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

import type { HeadId, ResolvedEvent, ResolvedNote, ResolvedPhrase } from './notation.ts';

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

type Stem = 'up' | 'down' | 'none';

/**
 * A notehead's geometry, centred on (0, 0), before irregularity.
 * `counters` are the white of an open note when it needs its own shape (Swan
 * do is two counters, one in each half of the hourglass); otherwise the
 * counter is the outline scaled down by `counterScale`. `solid` parts are
 * drawn in addition to the outline, such as the upright of Swan ra.
 */
interface HeadShape {
	outline: Point[];
	counters?: Point[][];
	counterScale?: [number, number];
	solid?: Point[][];
	/** Where a stem meets the head, by direction. */
	anchor: { up: Point; down: Point };
}

function ellipse(rx: number, ry: number, tilt: number, count = 20): Point[] {
	const points: Point[] = [];
	for (let i = 0; i < count; i++) {
		const a = (i / count) * Math.PI * 2;
		const x = Math.cos(a) * rx;
		const y = Math.sin(a) * ry;
		points.push([x * Math.cos(tilt) - y * Math.sin(tilt), x * Math.sin(tilt) + y * Math.cos(tilt)]);
	}
	return points;
}

/** The leftmost and rightmost points of an outline: where a stem meets a round head. */
function sides(points: Point[]): { left: Point; right: Point } {
	let left = points[0];
	let right = points[0];
	for (const p of points) {
		if (p[0] < left[0]) left = p;
		if (p[0] > right[0]) right = p;
	}
	return { left, right };
}

/**
 * Move each edge of a convex polygon inwards by its own distance, so a
 * counter can have thick and thin sides like cast type.
 */
function inset(points: Point[], distance: (edge: number) => number): Point[] {
	let area = 0;
	points.forEach((p, i) => {
		const q = points[(i + 1) % points.length];
		area += p[0] * q[1] - q[0] * p[1];
	});
	const sign = area > 0 ? 1 : -1;
	const lines = points.map((p, i) => {
		const q = points[(i + 1) % points.length];
		const length = Math.hypot(q[0] - p[0], q[1] - p[1]);
		const nx = (-(q[1] - p[1]) / length) * sign;
		const ny = ((q[0] - p[0]) / length) * sign;
		return { nx, ny, c: nx * p[0] + ny * p[1] + distance(i) };
	});
	return lines.map((b, i) => {
		const a = lines[(i - 1 + lines.length) % lines.length];
		const det = a.nx * b.ny - a.ny * b.nx;
		return [(a.c * b.ny - a.ny * b.c) / det, (a.nx * b.c - a.c * b.nx) / det];
	});
}

/**
 * Noteheads. The four fasola shapes are drawn after The Southern Harmony and
 * The Sacred Harp; the seven Swan shapes after the scale on page 4 of The New
 * Harp of Columbia and the tunes printed in it (Old Hundred, Albion), where
 * the heads are cast type with heavy horizontals and hairline sides.
 */
function headShape(head: HeadId, stem: Stem): HeadShape {
	const w = HEAD_W / 2;
	const h = HEAD_H / 2;
	const stemUp = stem === 'up';
	switch (head) {
		case 'fasola-fa':
			// A right triangle on a flat base, its upright side towards the stem.
			return {
				outline: stemUp || stem === 'none' ? [[-w, h], [w, h], [w, -h]] : [[-w, -h], [-w, h], [w, h]],
				counterScale: [0.5, 0.46],
				anchor: { up: [w, -h], down: [-w, h] },
			};
		case 'fasola-la':
			return {
				outline: [[-w * 0.8, -h * 0.82], [w * 0.8, -h * 0.82], [w * 0.8, h * 0.82], [-w * 0.8, h * 0.82]],
				anchor: { up: [w * 0.8, -h * 0.5], down: [-w * 0.8, h * 0.5] },
			};
		case 'fasola-mi':
			return {
				outline: [[0, -h * 1.08], [w, 0], [0, h * 1.08], [-w, 0]],
				anchor: { up: [w, 0], down: [-w, 0] },
			};
		case 'fasola-sol':
			// A slightly tilted oval, as in the round notes of the period.
			return {
				outline: ellipse(w * 0.96, h * 0.8, -0.32),
				anchor: { up: [w * 0.86, -h * 0.3], down: [-w * 0.86, h * 0.3] },
			};
		case 'swan-do': {
			// An hourglass: two triangles meeting point to point, closed by
			// heavy bars at top and bottom. The stem leaves from the middle of a bar.
			const a = w * 0.8;
			const neck = 0.35;
			const upper: Point[] = [[-a, -h], [a, -h], [0, 0]];
			const lower: Point[] = [[a, h], [-a, h], [0, 0]];
			const bar = 1.05;
			const side = 0.62;
			return {
				outline: [[-a, -h], [a, -h], [neck, 0], [a, h], [-a, h], [-neck, 0]],
				counters: [inset(upper, (i) => (i === 0 ? bar : side)), inset(lower, (i) => (i === 0 ? bar : side))],
				anchor: { up: [0, -h], down: [0, h] },
			};
		}
		case 'swan-ra': {
			// A half disc whose flat side stands on the left as an upright; the
			// stem continues the upright, up or down. The bowl is heaviest at the right.
			const x0 = -2.5;
			const rx = 5;
			const ry = h * 0.95;
			const bowl: Point[] = [];
			const inner: Point[] = [];
			const flat = 0.8;
			for (let i = 0; i <= 12; i++) {
				const t = -Math.PI / 2 + (i / 12) * Math.PI;
				bowl.push([x0 + rx * Math.cos(t), ry * Math.sin(t)]);
				inner.push([x0 + flat + (rx - flat - 1.5) * Math.cos(t), (ry - 0.7) * Math.sin(t)]);
			}
			const over = 0.7;
			return {
				outline: bowl,
				counters: [inner],
				solid: [[[x0 - 0.05, -ry - over], [x0 + flat, -ry - over], [x0 + flat, ry + over], [x0 - 0.05, ry + over]]],
				anchor: { up: [x0 + 0.4, -ry], down: [x0 + 0.4, ry] },
			};
		}
		case 'swan-mi': {
			// A diamond leaning to the right, longer than it is tall.
			const L: Point = [-4.4, 0.99];
			const R: Point = [4.4, -0.99];
			return {
				outline: [L, [0.7, -3.1], R, [-0.7, 3.1]],
				counterScale: [0.56, 0.4],
				anchor: { up: R, down: L },
			};
		}
		case 'swan-fa': {
			// A right triangle: upright on the left, flat base, the long side
			// falling to the right. The stem runs on from the upright.
			const a = w * 0.9;
			const b = h * 0.94;
			return {
				outline: [[-a, -b], [-a, b], [a, b]],
				counterScale: [0.48, 0.44],
				anchor: { up: [-a, -b], down: [-a, b] },
			};
		}
		case 'swan-sol': {
			// A long oval rising to the right.
			const outline = ellipse(w * 1.02, h * 0.62, -0.38);
			const { left, right } = sides(outline);
			return { outline, counterScale: [0.62, 0.4], anchor: { up: right, down: left } };
		}
		case 'swan-la': {
			// A square with heavy top and bottom and hairline sides.
			const s = h * 0.88;
			const square: Point[] = [[-s, -s], [s, -s], [s, s], [-s, s]];
			return {
				outline: square,
				counters: [inset(square, (i) => (i % 2 === 0 ? 1.25 : 0.7))],
				anchor: { up: [s, -s * 0.5], down: [-s, s * 0.5] },
			};
		}
		case 'swan-si': {
			// An isosceles triangle pointing away from its stem; with no stem it points up.
			const a = w * 0.9;
			const b = h * 0.86;
			return {
				outline: stemUp ? [[-a, -b], [a, -b], [0, b]] : [[0, -b], [a, b], [-a, b]],
				counterScale: [0.5, 0.42],
				anchor: { up: [0, -b], down: [0, b] },
			};
		}
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

/** The head's paths: the outline with any counters cut out (evenodd), then solid parts. */
function headPaths(shape: HeadShape, open: boolean, x: number, y: number, rand: () => number): string[] {
	const base = subdivide(shape.outline, 3);
	const outer = soften(roughen(base, rand, 0.16), 0.14);
	let d = path(outer, x, y);
	if (open) {
		if (shape.counters) {
			for (const counter of shape.counters) d += path(soften(roughen(subdivide(counter, 2), rand, 0.05), 0.2), x, y);
		} else {
			// The outline scaled down, a little irregular too.
			const [sx, sy] = shape.counterScale ?? [0.54, 0.46];
			const cx = outer.reduce((s, p) => s + p[0], 0) / outer.length;
			const cy = outer.reduce((s, p) => s + p[1], 0) / outer.length;
			const inner = roughen(base, rand, 0.1).map(([px, py]): Point => [cx + (px - cx) * sx, cy + (py - cy) * sy]);
			d += path(soften(inner, 0.2), x, y);
		}
	}
	return [d, ...(shape.solid ?? []).map((part) => path(roughen(part, rand, 0.06), x, y))];
}

/** Advance after an event, in units: grows with elapsed time, but less than proportionally. */
function advance(quarters: number): number {
	return 6.5 + 4.6 * Math.sqrt(quarters);
}

interface Placed {
	event: ResolvedEvent;
	x: number;
}

/** A thin crescent from one point to another, bowed up (-1) or down (1). */
function arc(x1: number, y1: number, x2: number, y2: number, dir: number): string {
	const mx = (x1 + x2) / 2;
	const my = (y1 + y2) / 2;
	const lift = Math.min(3.2, 1.2 + (x2 - x1) * 0.08);
	return `<path d="M${n(x1)} ${n(y1)}Q${n(mx)} ${n(my + dir * lift)} ${n(x2)} ${n(y2)}Q${n(mx)} ${n(my + dir * (lift - 0.9))} ${n(x1)} ${n(y1)}Z"/>`;
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
		x += advance(event.dur.quarters);
	}
	const natural = placed.length ? placed[placed.length - 1].x : 0;
	const available = MAX_WIDTH - HEAD_W - PAD * 2 - 3;
	const tightest = Math.min(...phrase.events.slice(0, -1).map((e) => advance(e.dur.quarters)));
	const scale = natural > available ? Math.max(available / natural, MIN_ADVANCE / tightest) : 1;
	const left = PAD + HEAD_W / 2;
	const xOf = (index: number) => left + placed[index].x * scale;

	// Contour: the highest note sits STEM + PAD from the top, so a downward
	// stem on a low note and an upward stem on a high note both fit.
	const top = PAD + STEM;
	const yOf = (step: number) => top + (maxStep - step) * STEP;
	const ruleY = (yOf(maxStep) + yOf(minStep)) / 2;
	const height = yOf(minStep) + STEM + PAD;

	// Stem directions: by contour, except that a beamed group shares one
	// direction, and its stems end on the beam.
	const stemUp = new Map<number, boolean>();
	const beamEnd = new Map<number, number>();
	const beams: string[] = [];
	for (const event of notes) stemUp.set(event.index, event.step <= midStep);
	for (const span of phrase.spans.filter((s) => s.kind === 'beam')) {
		const group = notes.filter((e) => e.index >= span.from && e.index <= span.to);
		const up = group.reduce((sum, e) => sum + e.step, 0) / group.length <= midStep;
		const stemX = group.map((e) => xOf(e.index) + headShape(e.head, up ? 'up' : 'down').anchor[up ? 'up' : 'down'][0]);
		const ends = group.map((e) => yOf(e.step) + (up ? -STEM : STEM));
		const first = 0;
		const last = group.length - 1;
		const slope = Math.max(-0.2, Math.min(0.2, (ends[last] - ends[first]) / (stemX[last] - stemX[first] || 1)));
		// Shift the beam so that no stem is shorter than three quarters of a full stem.
		let shift = 0;
		group.forEach((e, i) => {
			const lineY = ends[first] + slope * (stemX[i] - stemX[first]);
			const shortest = yOf(e.step) + (up ? -STEM * 0.75 : STEM * 0.75);
			shift = up ? Math.min(shift, shortest - lineY) : Math.max(shift, shortest - lineY);
		});
		const beamY = (sx: number) => ends[first] + shift + slope * (sx - stemX[first]);
		group.forEach((e, i) => {
			stemUp.set(e.index, up);
			beamEnd.set(e.index, beamY(stemX[i]));
		});
		const count = Math.min(...group.map((e) => e.dur.flags));
		const x1 = stemX[first] - 0.4;
		const x2 = stemX[last] + 0.4;
		for (let b = 0; b < count; b++) {
			const off = (up ? 1 : -1) * b * 2.4;
			const t = up ? 1.5 : -1.5;
			beams.push(
				`<path d="M${n(x1)} ${n(beamY(x1) + off)}L${n(x2)} ${n(beamY(x2) + off)}L${n(x2)} ${n(beamY(x2) + off + t)}L${n(x1)} ${n(beamY(x1) + off + t)}Z"/>`,
			);
		}
	}

	const parts: string[] = [];
	placed.forEach(({ event }, i) => {
		const cx = xOf(i);
		const rand = random(hash(`${phrase.id}:${event.index}`));
		const ink = 0.86 + rand() * 0.12;
		let body = '';
		if (event.kind === 'rest') {
			body = restPath(event.dur.value, cx, ruleY, rand);
			for (let d = 0; d < event.dur.dots; d++) body += `<circle cx="${n(cx + 4 + d * 2)}" cy="${n(ruleY - STEP / 2)}" r="0.85"/>`;
		} else {
			const cy = yOf(event.step);
			const up = stemUp.get(event.index) ?? true;
			const stem: Stem = event.dur.stem ? (up ? 'up' : 'down') : 'none';
			const shape = headShape(event.head, stem);
			body = headPaths(shape, event.dur.open, cx, cy, rand)
				.map((d) => `<path d="${d}" fill-rule="evenodd"/>`)
				.join('');
			if (event.dur.stem) {
				const [ax, ay] = shape.anchor[up ? 'up' : 'down'];
				const sw = 0.7 + rand() * 0.22;
				const beamed = beamEnd.get(event.index);
				const lean = beamed === undefined ? (rand() - 0.5) * 0.2 : 0;
				const x0 = cx + ax;
				const y0 = cy + ay;
				const y1 = beamed ?? (up ? cy - STEM : cy + STEM);
				const half = sw / 2;
				body += `<path d="M${n(x0 - half)} ${n(y0)}L${n(x0 + lean - half)} ${n(y1)}L${n(x0 + lean + half)} ${n(y1)}L${n(x0 + half)} ${n(y0)}Z"/>`;
				const flags = beamed === undefined ? event.dur.flags : 0;
				for (let f = 0; f < flags; f++) {
					const fy = y1 + (up ? f * 2.6 : -f * 2.6);
					const dir = up ? 1 : -1;
					const fx = x0 + lean;
					body += `<path d="M${n(fx)} ${n(fy)}C${n(fx + 1.4)} ${n(fy + dir * 2.4)} ${n(fx + 4.4)} ${n(fy + dir * 3.2)} ${n(fx + 3.4)} ${n(fy + dir * 6.4)}C${n(fx + 3.6)} ${n(fy + dir * 4)} ${n(fx + 1.6)} ${n(fy + dir * 3.2)} ${n(fx)} ${n(fy + dir * 2.4)}Z"/>`;
				}
			}
			for (let d = 0; d < event.dur.dots; d++) {
				// A dot sits in a space: raise it half a step when the note is on a line.
				const onLine = event.step % 2 === 0;
				body += `<circle cx="${n(cx + HEAD_W / 2 + 2.2 + d * 2)}" cy="${n(cy - (onLine ? STEP / 2 : 0))}" r="0.85"/>`;
			}
		}
		parts.push(`<g class="sn-note" style="--i:${i}" fill-opacity="${n(ink)}">${body}</g>`);
	});

	// Slurs and ties, as transcribed: a thin arc on the side away from the stems.
	const arcs: string[] = [];
	for (const span of phrase.spans.filter((s) => s.kind !== 'beam')) {
		const a = phrase.events[span.from];
		const b = phrase.events[span.to];
		if (a.kind !== 'note' || b.kind !== 'note') continue;
		const below = stemUp.get(a.index) ?? true;
		const dir = below ? 1 : -1;
		const gap = HEAD_H / 2 + 1.2;
		arcs.push(arc(xOf(span.from) + 1, yOf(a.step) + dir * gap, xOf(span.to) - 1, yOf(b.step) + dir * gap, dir));
	}
	if (beams.length || arcs.length) {
		parts.push(`<g class="sn-note sn-spans" style="--i:${placed.length}">${beams.join('')}${arcs.join('')}</g>`);
	}

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

/**
 * One notehead on its own, with no stem, drawn as the phrases draw theirs: the
 * same outline, irregularity and ink density, seeded from `seed`. Centred on
 * (0, 0). Used for the favicon.
 */
export function renderHeadPath(head: HeadId, seed: string, open = false): { d: string; ink: number } {
	const rand = random(hash(seed));
	const ink = 0.86 + rand() * 0.12;
	const d = headPaths(headShape(head, 'none'), open, 0, 0, rand).join('');
	return { d, ink: Number(n(ink)) };
}

/** Rests, kept simple at this size: a block for whole and half, a stroke for shorter values. */
function restPath(value: string, cx: number, y: number, rand: () => number): string {
	const j = (rand() - 0.5) * 0.2;
	if (value === 'whole' || value === 'half') {
		// The whole rest hangs below its line, the half rest sits on it.
		const y0 = value === 'whole' ? y : y - 1.8;
		return `<path d="M${n(cx - 2.6)} ${n(y0 + j)}L${n(cx + 2.6)} ${n(y0 - j)}L${n(cx + 2.6)} ${n(y0 + 1.8 - j)}L${n(cx - 2.6)} ${n(y0 + 1.8 + j)}Z"/>`;
	}
	// Quarter and shorter: a small slanted hook, the shape of the period's crotchet rest.
	return `<path d="M${n(cx - 1)} ${n(y - 4)}L${n(cx + 1.4)} ${n(y - 0.6)}L${n(cx - 0.6)} ${n(y + 1)}L${n(cx + 1.2)} ${n(y + 4)}L${n(cx + 0.4)} ${n(y + 4)}L${n(cx - 1.6)} ${n(y + 1.2)}L${n(cx + 0.2)} ${n(y - 0.4)}L${n(cx - 1.8)} ${n(y - 3.4)}Z"/>`;
}
