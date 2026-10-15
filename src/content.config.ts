import { defineCollection, reference } from 'astro:content';
import { resolve } from 'node:path';
import { file, glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { phraseSchema } from './lib/shapeNotes/catalog';
import { LIBRARY_DIR, libraryStamp } from './plugins/bibtex.mjs';

/**
 * A glob loader whose entries are rendered again when the .bib library in
 * src/data/ changes, not only when the article itself does, so a re-exported
 * library reaches every article that cites it, in `npm run dev` as in a build.
 */
function citingGlob(options: Parameters<typeof glob>[0]): ReturnType<typeof glob> {
	const loader = glob(options);
	return {
		...loader,
		load: (context) => {
			context.watcher?.add(LIBRARY_DIR);
			context.watcher?.on('change', (path) => {
				if (!path.endsWith('.bib')) return;
				// Ask the glob loader to sync each article again; the digest below differs now.
				for (const entry of context.store.values()) if (entry.filePath) context.watcher?.emit('change', resolve(entry.filePath));
			});
			return loader.load({
				...context,
				generateDigest: (data) => context.generateDigest(typeof data === 'string' ? `${data}\n${libraryStamp()}` : data),
			});
		},
	};
}

/**
 * A file loader that stops the build when its file cannot be read or parsed.
 * Astro's own only logs the error and leaves the collection empty, so a stray
 * quotation mark in the YAML would otherwise remove every divider without a failure.
 */
function strictFile(fileName: string): ReturnType<typeof file> {
	const loader = file(fileName);
	return {
		...loader,
		load: async (context) => {
			await loader.load(context);
			if (context.store.keys().length === 0) {
				throw new Error(
					`${fileName} could not be read, or it has no entries. Check its YAML syntax; for example, a line that begins with a quoted phrase and goes on after it must be quoted as a whole.`,
				);
			}
		},
	};
}

// Treat an empty YAML value (`updated:`) the same as an omitted one.
const optionalDate = z.coerce
	.date()
	.nullish()
	.transform((value) => value ?? undefined);
const optionalText = z
	.string()
	.trim()
	.nullish()
	.transform((value) => value || undefined);

const writing = defineCollection({
	// Each file name becomes the article's URL slug: writing/my-essay.md -> /writing/my-essay/
	loader: citingGlob({ base: './src/content/writing', pattern: '**/*.{md,mdx}' }),
	schema: z.object({
		title: z.string().trim().min(1),
		/** Optional scholarly subtitle; added to the page title and og:title for search engines. */
		subtitle: optionalText,
		description: z.string().trim().min(1),
		published: z.coerce.date(),
		updated: optionalDate,
		type: z.enum(['essay', 'working-note', 'development-journal']).default('essay'),
		topics: z.array(z.string().trim().min(1)).nullish().transform((value) => value ?? []),
		projects: z.array(reference('projects')).nullish().transform((value) => value ?? []),
		correction: optionalText,
		/**
		 * This article's own license, when it differs from the site default (SITE_LICENSE),
		 * e.g. "CC BY 4.0" or "All rights reserved". Shown at the end of the article.
		 */
		license: optionalText,
		licenseUrl: z.url().nullish().transform((value) => value ?? undefined),
		/** A short rights note shown with the license, e.g. for incorporated archival material. */
		rights: optionalText,
		draft: z.boolean().default(false),
	}),
});

const projects = defineCollection({
	loader: glob({ base: './src/content/projects', pattern: '**/*.{md,mdx}' }),
	schema: z.object({
		title: z.string().trim().min(1),
		description: z.string().trim().min(1),
		order: z.number().int().default(0),
		links: z
			.array(z.object({ label: z.string().trim().min(1), url: z.url() }))
			.nullish()
			.transform((value) => value ?? []),
	}),
});
// Short standing notes about the site and its conventions, e.g. on shape notes:
// notes/on-shape-notes.md -> /notes/on-shape-notes/
const notes = defineCollection({
	loader: glob({ base: './src/content/notes', pattern: '**/*.{md,mdx}' }),
	schema: z.object({
		title: z.string().trim().min(1),
		description: z.string().trim().min(1),
		order: z.number().int().default(0),
		links: z
			.array(z.object({ label: z.string().trim().min(1), url: z.url() }))
			.nullish()
			.transform((value) => value ?? []),
		draft: z.boolean().default(false),
	}),
});

// Musical phrases quoted by shape-note dividers. Shapes and lyrics are worked
// out from these records in src/lib/shapeNotes/; the schema is shared with the
// phrase:* authoring commands, in src/lib/shapeNotes/catalog.ts.
const shapeNotes = defineCollection({
	loader: strictFile('src/data/shapeNotes/phrases.yaml'),
	schema: phraseSchema,
});

export const collections = { writing, projects, notes, shapeNotes };
