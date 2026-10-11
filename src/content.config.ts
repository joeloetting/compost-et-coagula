import { defineCollection, reference } from 'astro:content';
import { resolve } from 'node:path';
import { file, glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { citationProblems, HEAD_IDS, type HeadId } from './lib/shapeNotes/notation';
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
// out from these records in src/lib/shapeNotes/; see that folder.
const optionalYear = z.number().int().min(1000).max(2100).nullish();
const noteValue = z.enum(['whole', 'half', 'quarter', 'eighth', 'sixteenth', 'thirty-second']);
/** A written duration: a bare note value, or { value, dots, tuplet }. */
const writtenDuration = z.union([
	noteValue,
	z.strictObject({
		value: noteValue,
		dots: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
		tuplet: z.strictObject({ actual: z.number().int().positive(), normal: z.number().int().positive() }).optional(),
	}),
]);
const shapeNotes = defineCollection({
	loader: strictFile('src/data/shapeNotes/phrases.yaml'),
	schema: z
		.object({
			title: z.string().trim().min(1),
			/** Demonstration data (synthetic notes or a placeholder citation); `npm test` fails if one is published. */
			fixture: z.boolean().default(false),
			/** The named shape system of the source; never converted to another. */
			system: z.enum(['fasola-four', 'swan-seven']),
			key: z.object({ tonic: z.string().regex(/^[A-G](#|b)?$/), mode: z.enum(['major', 'minor']) }),
			meter: optionalText,
			notes: z
				.array(
					z.union([
						z.strictObject({
							pitch: z.string(),
							dur: writtenDuration,
							syl: z.string().optional(),
							continues: z.boolean().optional(),
							sourceHead: z.enum(HEAD_IDS as [HeadId, ...HeadId[]]).optional(),
						}),
						z.strictObject({ rest: writtenDuration }),
					]),
				)
				.min(1),
			/** Slurs, ties, and beams printed in the source; never inferred. */
			spans: z
				.array(z.strictObject({ kind: z.enum(['slur', 'tie', 'beam']), from: z.number().int(), to: z.number().int() }))
				.default([]),
			/** The tune, the words, and the arrangement can each have their own maker and date. */
			tune: z.object({ composer: optionalText, year: optionalYear }).optional(),
			words: z.object({ author: optionalText, year: optionalYear, firstLine: optionalText }).optional(),
			arrangement: optionalText,
			/** The printed tunebook the notes and words were taken from, and which voice and verse. */
			source: z.object({
				tunebook: z.string().trim().min(1),
				compiler: optionalText,
				edition: optionalText,
				year: optionalYear.transform((value) => value ?? undefined),
				page: z.union([z.string(), z.number()]).nullish().transform((value) => value ?? undefined),
				tune: z.string().trim().min(1),
				voice: z.string().trim().min(1),
				verse: z.number().int().positive().nullish().transform((value) => value ?? undefined),
				locator: optionalText,
				url: z.url().nullish().transform((value) => value ?? undefined),
			}),
			/** Excerpting, transposition, simplification, or any other change from the source. */
			editorial: z.array(z.string().trim().min(1)).default([]),
		})
		.superRefine((phrase, context) => {
			for (const message of citationProblems(phrase)) context.addIssue({ code: 'custom', message, path: ['source'] });
		}),
});

export const collections = { writing, projects, notes, shapeNotes };
