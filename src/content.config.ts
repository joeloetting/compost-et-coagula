import { defineCollection, reference } from 'astro:content';
import { file, glob } from 'astro/loaders';
import { z } from 'astro/zod';

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
	loader: glob({ base: './src/content/writing', pattern: '**/*.{md,mdx}' }),
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
	loader: glob({ base: './src/content/projects', pattern: '**/*.md' }),
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
const notes = defineCollection({
	loader: glob({ base: './src/content/notes', pattern: '**/*.md' }),
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
// Musical phrases quoted by shape-note dividers. Shapes and lyrics are worked
// out from these records in src/lib/shapeNotes/; see that folder.
const optionalYear = z.number().int().min(1000).max(2100).nullish();
const shapeNotes = defineCollection({
	loader: file('src/data/shapeNotes/phrases.yaml'),
	schema: z
		.object({
			title: z.string().trim().min(1),
			/** Demonstration data (synthetic notes or a placeholder citation); `npm test` fails if one is published. */
			fixture: z.boolean().default(false),
			notation: z.enum(['four-shape', 'seven-shape']),
			key: z.object({ tonic: z.string().regex(/^[A-G](#|b)?$/), mode: z.enum(['major', 'minor']) }),
			meter: optionalText,
			/** The voice quoted, e.g. "tenor" (the melody in The Sacred Harp). */
			voice: optionalText,
			notes: z
				.array(
					z.union([
						z.strictObject({ pitch: z.string(), dur: z.number().positive(), syl: z.string().optional() }),
						z.strictObject({ rest: z.number().positive() }),
					]),
				)
				.min(1),
			/** The tune, the words, and the arrangement can each have their own maker and date. */
			tune: z.object({ composer: optionalText, year: optionalYear }).optional(),
			words: z.object({ author: optionalText, year: optionalYear, firstLine: optionalText }).optional(),
			arrangement: optionalText,
			/** The printed edition the notes were taken from. */
			source: z.object({
				title: z.string().trim().min(1),
				edition: optionalText,
				year: optionalYear,
				page: z.union([z.string(), z.number()]).nullish(),
				url: z.url().nullish(),
				identifier: optionalText,
			}),
			/** Excerpting, transposition, simplification, or any other change from the source. */
			editorial: z.array(z.string().trim().min(1)).default([]),
		})
		.refine((phrase) => phrase.fixture || phrase.source.url || phrase.source.identifier, {
			message: 'A historical phrase needs source.url or source.identifier, so the quotation can be traced.',
		}),
});

export const collections = { writing, projects, notes, shapeNotes };
