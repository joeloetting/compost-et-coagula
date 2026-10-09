import { type CollectionEntry, getCollection } from 'astro:content';

export type Article = CollectionEntry<'writing'>;
export type Project = CollectionEntry<'projects'>;

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

/** Published writing that belongs to the given project, newest first. */
export async function getWritingForProject(projectId: string): Promise<Article[]> {
	const entries = await getWriting();
	return entries.filter((entry) => entry.data.projects.some((project) => project.id === projectId));
}

export async function getProjects(): Promise<Project[]> {
	const entries = await getCollection('projects');
	return entries.sort((a, b) => a.data.order - b.data.order || a.data.title.localeCompare(b.data.title));
}

export const typeLabels: Record<Article['data']['type'], string> = {
	essay: 'Essay',
	'working-note': 'Working note',
	'development-journal': 'Development journal',
};

export function writingPath(entry: Article): string {
	return `/writing/${entry.id}/`;
}

export function projectPath(entry: Project | { id: string }): string {
	return `/projects/${entry.id}/`;
}
