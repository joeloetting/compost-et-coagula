import { defineCollection, reference } from 'astro:content';
import { glob } from 'astro/loaders';
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

export const collections = { writing, projects };
