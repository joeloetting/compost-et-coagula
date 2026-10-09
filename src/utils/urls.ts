/**
 * Prefix an internal path with the configured base path, so links work when the
 * site is served from a subdirectory such as /compost-et-coagula/.
 *
 *   url('/writing/')  -> '/compost-et-coagula/writing/'
 */
export function url(path = '/'): string {
	const base = import.meta.env.BASE_URL.replace(/\/$/, '');
	return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Absolute URL for canonical links, feeds, and Open Graph metadata. */
export function absoluteUrl(path: string, site: URL | undefined): string {
	return new URL(url(path), site).href;
}
