import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { SITE_DESCRIPTION, SITE_TITLE } from '../consts';
import { getWriting, writingPath } from '../utils/content';
import { feedHtml } from '../utils/feed';
import { fullHeadline } from '../utils/seo';
import { absoluteUrl } from '../utils/urls';

// Each item carries the complete text of the article, so it can be read in a
// feed reader without visiting the site.
export async function GET(context: APIContext) {
	const entries = await getWriting();
	const items = await Promise.all(
		entries.map(async (entry) => {
			const link = absoluteUrl(writingPath(entry), context.site);
			return {
				title: fullHeadline(entry.data.title, entry.data.subtitle),
				description: entry.data.description,
				content: await feedHtml(entry, link),
				pubDate: entry.data.published,
				link,
				categories: entry.data.topics,
			};
		}),
	);
	return rss({
		title: SITE_TITLE,
		description: SITE_DESCRIPTION,
		site: absoluteUrl('/', context.site),
		items,
		customData: '<language>en-us</language>',
	});
}
