// Checks the production build in dist/ after `astro build`:
//   1. every internal link and asset reference resolves to a built file, and
//      includes the configured base path;
//   2. no draft article appears anywhere: no page, no RSS item, no sitemap entry;
//   3. no published page quotes a synthetic shape-note fixture as music.
// Run with `npm run check:dist`. Exits non-zero on any problem.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const BASE = '/compost-et-coagula/';
const dist = new URL('../dist/', import.meta.url).pathname;
const content = new URL('../src/content/writing/', import.meta.url).pathname;
const problems = [];

function walk(dir) {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		return statSync(path).isDirectory() ? walk(path) : [path];
	});
}

// 1. Internal links
const htmlFiles = walk(dist).filter((file) => file.endsWith('.html'));
for (const file of htmlFiles) {
	const html = readFileSync(file, 'utf8');
	for (const [, ref] of html.matchAll(/(?:href|src)="([^"#?]*)[^"]*"/g)) {
		if (!ref || /^[a-z]+:/i.test(ref) || ref.startsWith('//')) continue;
		if (!ref.startsWith(BASE)) {
			problems.push(`${relative(dist, file)}: link without base path: ${ref}`);
			continue;
		}
		const target = join(dist, decodeURI(ref.slice(BASE.length)));
		const resolved = ref.endsWith('/') ? join(target, 'index.html') : target;
		if (!existsSync(resolved)) problems.push(`${relative(dist, file)}: broken link: ${ref}`);
	}
}

// 2. Drafts
const drafts = walk(content)
	.filter((file) => /\.mdx?$/.test(file))
	.filter((file) => /^draft:\s*true\s*$/m.test(readFileSync(file, 'utf8').split(/^---$/m)[1] ?? ''))
	.map((file) => relative(content, file).replace(/\.mdx?$/, '').replace(/\/index$/, ''));
const feeds = ['rss.xml', 'sitemap-0.xml'].filter((name) => existsSync(join(dist, name)));
for (const slug of drafts) {
	const path = `writing/${slug}/`;
	if (existsSync(join(dist, path))) problems.push(`draft page was built: ${path}`);
	for (const file of [...htmlFiles, ...feeds.map((name) => join(dist, name))]) {
		if (readFileSync(file, 'utf8').includes(path)) problems.push(`${relative(dist, file)}: mentions draft ${path}`);
	}
}

// 3. Shape-note fixtures are test data, never published.
for (const file of htmlFiles) {
	if (readFileSync(file, 'utf8').includes('data-shapenote-fixture')) {
		problems.push(`${relative(dist, file)}: uses a synthetic shape-note fixture; quote a sourced phrase instead`);
	}
}

console.log(`Checked ${htmlFiles.length} pages; ${drafts.length} draft(s) confirmed absent unless listed below.`);
if (problems.length) {
	console.error(problems.join('\n'));
	process.exit(1);
}
console.log('No problems found.');
