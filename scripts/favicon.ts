// Writes public/favicon.svg: a single solid fa notehead from the shape-note
// renderer, in the ink on the paper. Run with `npm run favicon`; the .ico and
// apple-touch-icon.png in public/ are rasterized from the SVG it writes.
import { writeFileSync } from 'node:fs';
import { renderHeadPath } from '../src/lib/shapeNotes/render.ts';

const PAPER = '#f6f3ec';
const INK = '#262820';
const SIZE = 64;
// The head fills most of the square: 48 units across leaves 8 on each side.
const WIDTH = 48;

const { d, ink } = renderHeadPath('fasola-fa', 'favicon');
const xs: number[] = [];
const ys: number[] = [];
for (const [, x, y] of d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)) {
	xs.push(Number(x));
	ys.push(Number(y));
}
const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
const scale = WIDTH / (x1 - x0);
const round = (v: number) => Math.round(v * 1000) / 1000;
const tx = round(SIZE / 2 - ((x0 + x1) / 2) * scale);
const ty = round(SIZE / 2 - ((y0 + y1) / 2) * scale);

const svg =
	`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}">` +
	`<title>Compost et Coagula</title>` +
	`<rect width="${SIZE}" height="${SIZE}" rx="6" fill="${PAPER}"/>` +
	`<path transform="translate(${tx} ${ty}) scale(${round(scale)})" d="${d}" fill="${INK}" fill-opacity="${ink}" fill-rule="evenodd"/>` +
	`</svg>\n`;
writeFileSync(new URL('../public/favicon.svg', import.meta.url), svg);
console.log(svg);
