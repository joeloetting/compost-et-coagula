import { getContainerRenderer as getMDXRenderer } from '@astrojs/mdx/container-renderer';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { loadRenderers } from 'astro:container';
import { render } from 'astro:content';
import sanitizeHtml from 'sanitize-html';
import type { Article } from './content';

let container: AstroContainer | undefined;

/**
 * The full text of an article as standalone HTML for feed readers: rendered
 * with the same components as the site, then reduced to plain, portable
 * markup. Scripts, styles, inline SVG, and interactive elements are removed,
 * and every link and image points at an absolute URL so it works outside the
 * site. `pageUrl` is the article's absolute URL; in-page links such as
 * footnote references resolve against it.
 */
export async function feedHtml(article: Article, pageUrl: string): Promise<string> {
	container ??= await AstroContainer.create({ renderers: await loadRenderers([getMDXRenderer()]) });
	const { Content } = await render(article);
	const html = await container.renderToString(Content);
	const absolute = (value: string) => new URL(value, pageUrl).href;

	return sanitizeHtml(html, {
		allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img', 'figure', 'figcaption', 'details', 'summary', 'del', 'ins'],
		allowedAttributes: {
			a: ['href', 'title', 'id'],
			img: ['src', 'srcset', 'sizes', 'alt', 'title', 'width', 'height'],
			'*': ['id', 'lang', 'dir'],
			th: ['colspan', 'rowspan', 'scope'],
			td: ['colspan', 'rowspan'],
			ol: ['start'],
		},
		// Dropped together with their contents rather than unwrapped.
		nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript', 'svg', 'template', 'button'],
		allowedSchemes: ['http', 'https', 'mailto'],
		transformTags: {
			// The margin copy of a later note repeats the "Later notes" list; as a
			// template (a non-text tag above) it is dropped with its contents.
			span: (tagName, attribs) =>
				/\blater-margin\b/.test(attribs.class ?? '') ? { tagName: 'template', attribs: {} } : { tagName, attribs },
			a: (tagName, attribs) => ({
				tagName,
				attribs: attribs.href ? { ...attribs, href: absolute(attribs.href) } : attribs,
			}),
			img: (tagName, attribs) => ({
				tagName,
				attribs: {
					...attribs,
					...(attribs.src && { src: absolute(attribs.src) }),
					...(attribs.srcset && {
						srcset: attribs.srcset
							.split(',')
							.map((candidate) => {
								const [src, ...descriptor] = candidate.trim().split(/\s+/);
								return [absolute(src), ...descriptor].join(' ');
							})
							.join(', '),
					}),
				},
			}),
		},
	});
}
