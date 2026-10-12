import { type CollectionEntry, getCollection, getEntries, render } from 'astro:content';
import { SITE_AUTHOR, SITE_LICENSE } from '../consts';

export type Article = CollectionEntry<'writing'>;
export type Project = CollectionEntry<'projects'>;
export type Note = CollectionEntry<'notes'>;

/**
 * Drafts are visible while running `npm run dev` so they can be previewed, and
 * excluded from every production build: article pages, lists, RSS, and sitemap
 * all read through this function.
 */
export const showDrafts = import.meta.env.DEV;

/** Published writing, newest first. */
export async function getWriting(): Promise<Article[]> {
	const entries = await getCollection('writing', ({ data }) => showDrafts || !data.draft);
	return entries.sort((a, b) => b.data.published.valueOf() - a.data.published.valueOf());
}

/**
 * The years of the copyright notice: from the earliest published article to
 * the year of the build, e.g. "2025–2026", or one year when they are the same.
 */
export async function copyrightYears(): Promise<string> {
	const writing = await getWriting();
	const thisYear = new Date().getUTCFullYear();
	const first = Math.min(thisYear, ...writing.map((entry) => entry.data.published.getUTCFullYear()));
	return first < thisYear ? `${first}–${thisYear}` : `${thisYear}`;
}

/** Published writing that belongs to the given project, newest first. */
export async function getWritingForProject(projectId: string): Promise<Article[]> {
	const entries = await getWriting();
	return entries.filter((entry) => entry.data.projects.some((project) => project.id === projectId));
}

/** The projects an article lists, stopping the build on a name that matches no project. */
export async function articleProjects(article: Article): Promise<Project[]> {
	const projects = await getEntries(article.data.projects);
	const missing = article.data.projects.filter((_, i) => !projects[i]).map((project) => project.id);
	if (missing.length) {
		throw new Error(
			`${article.filePath ?? article.id}: projects lists ${missing.map((id) => `"${id}"`).join(', ')}, but there is no such file in src/content/projects/. Check the spelling against the project file names.`,
		);
	}
	return projects;
}

export async function getProjects(): Promise<Project[]> {
	const entries = await getCollection('projects');
	return entries.sort((a, b) => a.data.order - b.data.order || a.data.title.localeCompare(b.data.title));
}

/** Published notes, in their set order, then by title. Drafts as for writing. */
export async function getNotes(): Promise<Note[]> {
	const entries = await getCollection('notes', ({ data }) => showDrafts || !data.draft);
	return entries.sort((a, b) => a.data.order - b.data.order || a.data.title.localeCompare(b.data.title));
}

export const typeLabels: Record<Article['data']['type'], string> = {
	essay: 'Essay',
	'working-note': 'Working note',
	'development-journal': 'Development journal',
};

/**
 * The author of an article. Every article is currently by the site author; a
 * per-article `author` field for guest writers would be read here.
 */
export function articleAuthor(_entry: Article): typeof SITE_AUTHOR {
	return SITE_AUTHOR;
}

/**
 * The license an article is published under: its own `license` from the front
 * matter, or the site default. `custom` is true when the article sets its own,
 * which is the only case the article page mentions it.
 */
export function articleLicense(entry: Article): { name: string; url?: string; rights?: string; custom: boolean } {
	const { license, licenseUrl, rights } = entry.data;
	if (license) return { name: license, url: licenseUrl, rights, custom: true };
	return { name: SITE_LICENSE.name, url: SITE_LICENSE.url, rights, custom: false };
}

export function writingPath(entry: Article): string {
	return `/writing/${entry.id}/`;
}

export function projectPath(entry: Project | { id: string }): string {
	return `/projects/${entry.id}/`;
}

export function notePath(entry: Note | { id: string }): string {
	return `/notes/${entry.id}/`;
}

/**
 * Render an entry, stopping the build if its Markdown failed. A plain Markdown
 * (.md) file is rendered when the content is loaded, and an error there, such
 * as a citation that matches nothing, is only logged: the page would be built
 * with an empty body and the build would pass. (MDX errors already stop it.)
 */
export async function renderEntry(entry: Article | Project | Note) {
	if (entry.filePath?.endsWith('.md') && !entry.rendered) {
		throw new Error(`${entry.filePath} could not be rendered; the reason is in the "Error rendering" message above.`);
	}
	return render(entry);
}
