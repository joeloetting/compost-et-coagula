/** The fragment id of a named figure: <Figure id="map"> is at #figure-map. */
export function figureAnchor(id: string): string {
	return `figure-${id}`;
}
