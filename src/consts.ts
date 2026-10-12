export const SITE_TITLE = 'Compost et Coagula';
/**
 * The publication's author, shown in article bylines, page metadata, RSS, and
 * JSON-LD. Every article is attributed through `articleAuthor()` in
 * src/utils/content.ts, so guest authors can later be added there without
 * touching the pages that display the name.
 */
export const SITE_AUTHOR = {
	name: 'Joel Oetting',
	/** Site path of the page that introduces the author. */
	path: '/about/',
};
export const SITE_DESCRIPTION =
	'An independent publication of essays, research notes, and work in progress across theology, environmental science, history, literature, and software.';
/**
 * The default license for the publication's original content. An article can
 * declare its own with `license` and `licenseUrl` in its front matter, and a
 * figure with the same props on <Figure>. Third-party material keeps its own
 * rights status regardless. The full statement is at /license/.
 */
export const SITE_LICENSE = {
	name: 'CC BY-NC-SA 4.0',
	title: 'Creative Commons Attribution–NonCommercial–ShareAlike 4.0 International License',
	url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
	/** Site path of the copyright and reuse statement. */
	path: '/license/',
};
