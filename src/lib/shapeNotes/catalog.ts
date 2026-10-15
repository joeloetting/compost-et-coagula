// The phrase catalog, src/data/shapeNotes/phrases.yaml, as both readers see
// it: the `shapeNotes` collection in src/content.config.ts, and the phrase:*
// authoring commands in scripts/phrase.ts, which run in plain Node and cannot
// import `astro:content`. Both use `phraseSchema`, so a record means the same
// thing to each.
import { z } from 'astro/zod';
import { parseDocument } from 'yaml';
import { citationProblems, HEAD_IDS, type HeadId, type PhraseRecord, resolvePhrase } from './notation.ts';
import { renderPhraseSvg } from './render.ts';

// Treat an empty YAML value the same as an omitted one.
const optionalText = z
	.string()
	.trim()
	.nullish()
	.transform((value) => value || undefined);
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

/** One phrase record, without its `id` (the collection's file loader takes that). */
export const phraseSchema = z
	.object({
		title: z.string().trim().min(1),
		/** Demonstration data (synthetic notes or a placeholder citation); `npm test` fails if one is published. */
		fixture: z.boolean().default(false),
		/**
		 * The notated passage this phrase quotes, shared by records that set the
		 * same notes to different words: one arrangement, one voice, one place in
		 * the tune. Not a tune title. Without it, the phrase is its own passage.
		 */
		passageId: z
			.string()
			.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'passageId is lower-case words joined by hyphens, e.g. new-harp-1919-old-hundred-tenor-line-1')
			.optional(),
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
	});

export type CatalogPhrase = z.output<typeof phraseSchema> & { id: string };

export interface Catalog {
	/** Valid records, in file order. */
	phrases: CatalogPhrase[];
	byId: Map<string, CatalogPhrase>;
	/** Anything wrong with the file or a record; the catalog must not be used for selection while any remain. */
	problems: string[];
}

/** Parse YAML exactly as Astro's file loader does. */
export function parseYaml(text: string): unknown {
	const document = parseDocument(text, { customTags: ['timestamp'], merge: true, schema: 'core' });
	if (document.errors.length > 0) throw document.errors[0];
	return document.contents === null ? undefined : document.toJS();
}

/** The passage a phrase belongs to, for --distinct-passages: its passageId, or else its own id. */
export const passageOf = (phrase: Pick<PhraseRecord, 'id' | 'passageId'>): string => phrase.passageId ?? phrase.id;

/**
 * Read the catalog's YAML and check every record against `phraseSchema`.
 * Duplicate ids are refused before any record is kept, so one record can
 * never silently replace another.
 */
export function readCatalog(text: string, fileName = 'phrases.yaml'): Catalog {
	const catalog: Catalog = { phrases: [], byId: new Map(), problems: [] };
	let data: unknown;
	try {
		data = parseYaml(text);
	} catch (error) {
		catalog.problems.push(`${fileName} could not be read: ${(error as Error).message}`);
		return catalog;
	}
	// The file loader accepts a list of records with ids, or a map from id to record.
	const items: { id: unknown; record: unknown }[] = Array.isArray(data)
		? data.map((record) => ({ id: (record as { id?: unknown } | null)?.id, record }))
		: data && typeof data === 'object'
			? Object.entries(data).map(([id, record]) => ({ id, record }))
			: [];
	if (items.length === 0) {
		catalog.problems.push(`${fileName} has no entries`);
		return catalog;
	}

	const positions = new Map<string, number[]>();
	items.forEach(({ id }, index) => {
		if (typeof id === 'string' && id.trim()) positions.set(id, [...(positions.get(id) ?? []), index + 1]);
		else catalog.problems.push(`${fileName}: entry ${index + 1} has no id`);
	});
	for (const [id, at] of positions) {
		if (at.length > 1) catalog.problems.push(`${fileName}: the id "${id}" is used by entries ${at.join(', ')}; every phrase needs its own id`);
	}

	for (const { id, record } of items) {
		if (typeof id !== 'string' || positions.get(id)?.length !== 1) continue;
		const parsed = phraseSchema.safeParse(record);
		if (!parsed.success) {
			for (const issue of parsed.error.issues) {
				catalog.problems.push(`phrase "${id}": ${issue.path.length ? `${issue.path.join('.')}: ` : ''}${issue.message}`);
			}
			continue;
		}
		const phrase = { id, ...parsed.data };
		catalog.phrases.push(phrase);
		catalog.byId.set(id, phrase);
	}
	return catalog;
}

/**
 * Resolve and draw every phrase that may be quoted (every non-fixture), as
 * the divider would, and return what fails. A broken phrase is reported by
 * name rather than quietly left out of the draw.
 */
export function phraseProblems(catalog: Catalog): string[] {
	const problems: string[] = [];
	for (const phrase of catalog.phrases) {
		if (phrase.fixture) continue;
		try {
			renderPhraseSvg(resolvePhrase(phrase));
		} catch (error) {
			problems.push((error as Error).message);
		}
	}
	return problems;
}
