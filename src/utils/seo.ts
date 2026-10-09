import { SITE_DESCRIPTION, SITE_TITLE } from '../consts';
import { type Article, typeLabels, writingPath } from './content';
import { absoluteUrl } from './urls';

/**
 * Join a title and subtitle the way a bibliography would:
 *   "Holy Saturday in Oak Ridge: Historical Memory and the Geomorphology…"
 * A title that already ends in punctuation ("Why Soil?") takes no colon.
 */
export function fullHeadline(title: string, subtitle?: string): string {
	if (!subtitle) return title;
	return /[?!:.…]$/.test(title) ? `${title} ${subtitle}` : `${title}: ${subtitle}`;
}

/** schema.org metadata for an article page, emitted as JSON-LD in the page head. */
export function articleSchema(article: Article, site: URL | undefined): Record<string, unknown> {
	const { title, subtitle, description, published, updated, topics, type } = article.data;
	const pageUrl = absoluteUrl(writingPath(article), site);
	const publication = {
		'@type': 'Periodical',
		name: SITE_TITLE,
		description: SITE_DESCRIPTION,
		url: absoluteUrl('/', site),
	};
	return {
		'@context': 'https://schema.org',
		'@type': type === 'essay' ? 'ScholarlyArticle' : 'BlogPosting',
		headline: title,
		...(subtitle && { alternativeHeadline: subtitle }),
		name: fullHeadline(title, subtitle),
		description,
		genre: typeLabels[type],
		datePublished: published.toISOString(),
		dateModified: (updated ?? published).toISOString(),
		url: pageUrl,
		mainEntityOfPage: { '@type': 'WebPage', '@id': pageUrl },
		image: absoluteUrl('/og-default.png', site),
		inLanguage: 'en',
		isAccessibleForFree: true,
		...(topics.length > 0 && { keywords: topics.join(', ') }),
		author: { '@type': 'Organization', name: SITE_TITLE, url: absoluteUrl('/about/', site) },
		publisher: { '@type': 'Organization', name: SITE_TITLE, url: absoluteUrl('/', site) },
		isPartOf: publication,
	};
}

/**
 * Serialize JSON-LD for a <script type="application/ld+json"> element. "<" is
 * escaped so text in the data cannot close the script element.
 */
export function jsonLd(data: Record<string, unknown>): string {
	return JSON.stringify(data).replaceAll('<', '\\u003c');
}
