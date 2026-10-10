import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Cite } from '@citation-js/core';
import '@citation-js/plugin-bibtex';
import '@citation-js/plugin-csl';

const bibPath = fileURLToPath(
  new URL('../../data/references.bib', import.meta.url)
);

export function getBibliography() {
  const bibtex = readFileSync(bibPath, 'utf8');

  return new Cite(bibtex);
}

export function getReference(key: string) {
  const bibliography = getBibliography();

  return bibliography.data.find(
    (reference: any) => reference.id === key
  );
}