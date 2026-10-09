// @ts-check

import { satteri } from '@astrojs/markdown-satteri';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { defineConfig, fontProviders } from 'astro/config';
import { figurePlugins } from './src/plugins/figures.mjs';

// The site is published as a GitHub Pages project site. If a custom domain is
// added later, change `site` to that domain and remove `base`.
const SITE = 'https://joeloetting.github.io';
const BASE = '/compost-et-coagula';

// Unicode ranges matching the self-hosted subsets in src/assets/fonts/.
const LATIN =
	'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';
const LATIN_EXT =
	'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF';

const fontDir = './src/assets/fonts';

/**
 * Wrap Markdown tables in a focusable scroll region so wide tables scroll
 * inside the article instead of widening the page on small screens.
 * @type {import('satteri').HastVisitorInstance & { name: string }}
 */
const wrapTables = {
	name: 'wrap-tables',
	element: {
		filter: ['table'],
		visit(node, ctx) {
			ctx.wrapNode(node, {
				type: 'element',
				tagName: 'div',
				properties: { className: ['table-scroll'], tabIndex: 0, role: 'region', ariaLabel: 'Table' },
				children: [],
			});
		},
	},
};

// https://astro.build/config
export default defineConfig({
	site: SITE,
	base: BASE,
	trailingSlash: 'always',
	integrations: [mdx(), sitemap()],
	markdown: {
		processor: satteri({
			features: { gfm: { footnotes: { label: 'Notes' } } },
			// Figure numbers, figure references, and bibliography anchors.
			mdastPlugins: figurePlugins,
			hastPlugins: [wrapTables],
		}),
		shikiConfig: { theme: 'css-variables' },
	},
	fonts: [
		{
			provider: fontProviders.local(),
			name: 'Source Serif 4',
			cssVariable: '--font-serif',
			fallbacks: ['Georgia', 'Cambria', 'Times New Roman', 'serif'],
			options: {
				variants: [
					{ src: [`${fontDir}/source-serif-4-roman-latin.woff2`], weight: '400 700', style: 'normal', unicodeRange: [LATIN] },
					{ src: [`${fontDir}/source-serif-4-roman-latin-ext.woff2`], weight: '400 700', style: 'normal', unicodeRange: [LATIN_EXT] },
					{ src: [`${fontDir}/source-serif-4-italic-latin.woff2`], weight: '400 700', style: 'italic', unicodeRange: [LATIN] },
					{ src: [`${fontDir}/source-serif-4-italic-latin-ext.woff2`], weight: '400 700', style: 'italic', unicodeRange: [LATIN_EXT] },
				],
			},
		},
		{
			provider: fontProviders.local(),
			name: 'Source Sans 3',
			cssVariable: '--font-sans',
			fallbacks: ['system-ui', 'Segoe UI', 'Helvetica Neue', 'Arial', 'sans-serif'],
			options: {
				variants: [
					{ src: [`${fontDir}/source-sans-3-latin.woff2`], weight: '400 600', style: 'normal', unicodeRange: [LATIN] },
					{ src: [`${fontDir}/source-sans-3-latin-ext.woff2`], weight: '400 600', style: 'normal', unicodeRange: [LATIN_EXT] },
				],
			},
		},
		{
			provider: fontProviders.local(),
			name: 'IBM Plex Mono',
			cssVariable: '--font-mono',
			fallbacks: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
			options: {
				variants: [
					{ src: [`${fontDir}/ibm-plex-mono-latin.woff2`], weight: 400, style: 'normal', unicodeRange: [LATIN] },
					{ src: [`${fontDir}/ibm-plex-mono-latin-ext.woff2`], weight: 400, style: 'normal', unicodeRange: [LATIN_EXT] },
				],
			},
		},
	],
});
