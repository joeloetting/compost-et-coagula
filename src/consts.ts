export const SITE_TITLE = 'Compost et Coagula';
/**
 * The publication's author, shown in article bylines, page metadata, RSS, and
 * JSON-LD. Every article is attributed through `articleAuthor()` in
 * src/utils/content.ts, so guest authors can later be added there without
 * touching the pages that display the name.
 */
export const SITE_AUTHOR = {
	name: 'Joel O',
	/** Site path of the page that introduces the author. */
	path: '/about/',
};
export const SITE_DESCRIPTION =
	'An independent publication of essays, research notes, and work in progress across theology, environmental science, history, literature, and software.';
