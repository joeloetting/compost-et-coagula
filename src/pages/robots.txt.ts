import type { APIContext } from 'astro';
import { absoluteUrl } from '../utils/urls';

export function GET(context: APIContext) {
	const body = `User-agent: *\nAllow: /\n\nSitemap: ${absoluteUrl('/sitemap-index.xml', context.site)}\n`;
	return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
