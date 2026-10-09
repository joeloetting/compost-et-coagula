import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { SITE_DESCRIPTION, SITE_TITLE } from '../consts';
import { getWriting, writingPath } from '../utils/content';
import { absoluteUrl } from '../utils/urls';

export async function GET(context: APIContext) {
	const entries = await getWriting();
	return rss({
		title: SITE_TITLE,
		description: SITE_DESCRIPTION,
		site: absoluteUrl('/', context.site),
		items: entries.map((entry) => ({
			title: entry.data.title,
			description: entry.data.description,
			pubDate: entry.data.published,
			link: absoluteUrl(writingPath(entry), context.site),
			categories: entry.data.topics,
		})),
		customData: '<language>en-us</language>',
	});
}
