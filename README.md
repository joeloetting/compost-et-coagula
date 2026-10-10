# Compost et Coagula

An independent publication of essays, research notes, and work in progress, built with [Astro](https://docs.astro.build) and published to GitHub Pages.

Live site: <https://joeloetting.github.io/compost-et-coagula/>

## Setup

You need Node.js 22.12 or later.

```sh
npm install        # install dependencies
npm run dev        # start the local server at http://localhost:4321/compost-et-coagula/
```

Other commands:

| Command | What it does |
|---|---|
| `npm run build` | Build the production site into `dist/`, then build the search index |
| `npm run preview` | Serve the built `dist/` locally, exactly as it will be published |
| `npm run check` | Type and Astro diagnostics |
| `npm run test:unit` | Unit tests (shape-note notation and drawing) |
| `npm test` | Diagnostics, unit tests, build, then check links and draft exclusion |

## Writing an article

Every article is one file in `src/content/writing/`. The file name becomes the URL:

```text
src/content/writing/holy-saturday-in-oak-ridge.md  ->  /writing/holy-saturday-in-oak-ridge/
```

Choose the file name carefully and do not change it after publishing, since that would break existing links.

Use `.md` (plain Markdown) by default. Use `.mdx` only when the article needs figures with captions, numbers, or sources (see below).

### Template

Copy this into a new file:

```markdown
---
title: "The Title of the Article"
description: "One or two sentences. Shown under the title, in lists, in the RSS feed, and in search results."
published: 2026-10-08
type: essay
topics:
  - theology
projects:
  - the-cruciform-ground
draft: true
---

The first paragraph.

## A section heading

Text with a footnote.[^1]

[^1]: The footnote text.
```

### Metadata

| Field | Required | Notes |
|---|---|---|
| `title` | yes | |
| `subtitle` | no | A scholarly subtitle naming the specific subject. Added to the browser title, link previews, structured data, and the RSS title, so search engines index the subject and not only the title. |
| `description` | yes | Plain text, one or two sentences. |
| `published` | yes | `YYYY-MM-DD`. Lists are sorted by this date, newest first. |
| `updated` | no | `YYYY-MM-DD`. Shown as "Updated …" next to the publication date. |
| `type` | no | `essay` (default), `working-note`, or `development-journal`. |
| `topics` | no | A list of words. Included in the RSS feed. |
| `projects` | no | Project slugs: `the-cruciform-ground`, `deftere`. The article then appears on that project's page. |
| `correction` | no | A revision note shown at the top of the article (see below). |
| `draft` | no | `true` keeps the article out of the published site. Defaults to `false`. |

The build fails with a clear message if a required field is missing, a date is malformed, a `type` is not one of the three allowed values, or a project slug does not exist.

### Drafts and previewing

Articles marked `draft: true` appear (with a "Draft" label) when you run `npm run dev`, so you can see exactly how they will look. They are left out of every production build: no page, no listing, no RSS item, no sitemap entry. `npm test` checks this.

A draft is still visible to anyone who reads this repository on GitHub. Keep manuscripts that should stay private outside the repository until they are ready.

### Headings

The article title is the page's only first-level heading. Start sections in the Markdown at `##`, then `###` and `####`.

### Footnotes

Use standard Markdown footnotes. The number in the text links to the note, and each note links back.

```markdown
A sentence that needs a source.[^barth]

[^barth]: The full citation, with page numbers.
```

Notes are collected under "Notes" at the end of the article, in order of first use. The labels (`barth` above) are only for you; readers see numbers.

### Marginal notes

A marginal note is an ordinary Markdown footnote whose text starts with `[margin]`. It works in `.md` and `.mdx` alike:

```markdown
To begin with the Manhattan Project is already a decision.[^start]

[^start]: [margin] Where should the historical account begin? Compare [the Norris Basin essay](/writing/another-essay/).
```

- Footnotes carry evidence: sources, qualifications, clarifications. Marginal notes carry commentary: short interpretive observations and connections to other writing. Keep the two apart; a citation never goes in the margin.
- On wide screens a marginal note sits in the margin, level with the line that refers to it. On phones it becomes a small "note 1" mark that opens the note beneath it (tap elsewhere or press Esc to close); browsers without CSS anchor positioning show the note inline instead. In print it sits in the printed margin.
- Marginal notes are numbered automatically (Marginal note 01, 02...), and the ordinary footnotes are renumbered so they stay consecutive.
- Keep margin notes short, to plain paragraphs (no lists or quotations), and refer to each one only once. Leave most paragraphs without notes; the empty margin is part of the design.
- Any link that starts with `/` gets the site's base path automatically, so `/writing/another-essay/` works as written. A link to a page that does not exist fails `npm test`.

**Labels and editorial marks.** A marginal note can carry its own label instead of "Marginal note 01", written after a colon: `[margin: ☞ Obs.]`. The label may begin with one of the traditional editorial marks below, and must always include words, so a reader never needs to know what a mark means (`[margin: ☞]` alone stops the build). These are conventions for the writer, not a tagging system; use them sparingly, and leave most margins empty.

| Mark | Use it for | Example label | How the note reads |
|---|---|---|---|
| ☞ | An observation that genuinely matters | `[margin: ☞ Obs. 03]` | Label in the text colour |
| ? | An open question | `[margin: ? Quaestio]` | Note in italic |
| ↗ | A cross-reference to other writing | `[margin: ↗ See also]` | Note in the smaller sans |
| † | A textual or editorial qualification | `[margin: † Qualification]` | Note in the quieter grey |
| ※ | Special commentary | `[margin: ※ Commentary]` | As an ordinary note |
| Fig. | A pointer to a figure | `[margin: Fig. 2]` | As an ordinary note |

Screen readers skip the mark itself and read the words after it.

### Excursus

An excursus is a substantial digression that would otherwise derail the argument: a word's history, a geological process, a document examined closely. Unlike a footnote it stays in the reading column, set slightly smaller between a rule and a short closing rule, under a small "Excursus" label, so a reader can see where it begins and ends and skip it. It needs `.mdx`:

```mdx
import Excursus from '../../components/Excursus.astro';

<Excursus title="On the word “compost”">
  The paragraphs of the digression, in ordinary Markdown. Footnotes work as usual.
</Excursus>
```

`label="…"` replaces the word "Excursus" (for instance `label="Excursus II"`). Keep marginal notes out of an excursus.

### Block quotations

```markdown
> The quoted text.
>
> — Author, *Title*, page
```

### Bibliography

Write a heading named `## Bibliography`, `## References`, or `## Works Cited`, followed immediately by a list. The list is styled with hanging indents.

```markdown
## Bibliography

- Surname, First. *Title of Book*. City: Publisher, Year.
- Surname, First. "Title of Article." *Journal* 12, no. 3 (Year): 45–67.
```

### Citations

Give a bibliography entry a key in brackets at its start (see **Bibliography keys** below), then cite it in a footnote by that key, with page numbers or another locator after a comma:

```markdown
The whole is less than the sum of its parts.[^morton]

[^morton]: [morton-2017, 45–47]. Compare [turner-1969, chap. 3].

## Bibliography

- [morton-2017] Morton, Timothy. *Humankind: Solidarity with Nonhuman People*. London: Verso, 2017.
- [turner-1969] Turner, Victor. *The Ritual Process: Structure and Anti-Structure*. Chicago: Aldine, 1969.
```

The note then reads *Morton, Humankind, 45–47. Compare Turner, The Ritual Process, chap. 3.*, each citation a link to its bibliography entry, and each entry ends with links back to the notes that cite it ("Cited in note 2"). The short form is the surname and the italic (or quoted) title up to any colon, which is Chicago's short-note style for an article that has a full bibliography.

- The locator is kept exactly as written: `45`, `45–47`, `chap. 3`, `fol. 12r`.
- A citation key that matches no entry stops the build, naming the article and the key. Bracketed words that are not keys, such as `[sic]`, are left alone.
- Writing the whole citation by hand in a footnote still works; it just isn't linked.
- In Zettlr or Pandoc a citation like `[morton-2017, 45]` stays plain, readable text.

### Tables and code

Ordinary Markdown tables and fenced code blocks (with a language, e.g. ` ```ts `) work as expected. Tables are set in the booktabs style, with no vertical lines and a rule above, below, and under the header. Align a numeric column right (`|--:|`) and its figures line up. Wide tables and long code lines scroll sideways inside their own box on small screens.

### Images and figures

Put an article's images in a folder named after the article, next to it:

```text
src/content/writing/holy-saturday-in-oak-ridge.mdx
src/content/writing/holy-saturday-in-oak-ridge/map.svg
```

**Without a caption**, in `.md` or `.mdx`:

```markdown
![Alt text describing the image](./holy-saturday-in-oak-ridge/photo.jpg)
```

**As a numbered figure**, rename the article to `.mdx` and use the `Figure` component. Figures are numbered automatically in the order they appear (Figure 1, Figure 2, …), and the caption begins with that number:

```mdx
import Figure from '../../components/Figure.astro';
import FigureRef from '../../components/FigureRef.astro';
import map from './holy-saturday-in-oak-ridge/map.png';

The ridges run parallel to the valley (<FigureRef to="ridges" />).

<Figure
  id="ridges"
  src={map}
  alt="Short description of the map."
  credit="Drawn by Jane Doe."
  source="Survey Office, ridge and valley map, 1942"
  cite="survey-1942"
  license="Public domain"
  fullSize
  wide
>
  The caption, which may contain *Markdown*.

  <Fragment slot="description">
    <p>An optional longer description for maps and diagrams, shown when the reader opens it.</p>
  </Fragment>
</Figure>

## Bibliography

- [survey-1942] Survey Office. *Ridge and Valley Survey*. City: Publisher, 1942.
```

This renders as **Figure 1.** followed by the caption, then a line reading *Drawn by Jane Doe. · Source: Survey Office, ridge and valley map, 1942 · Public domain · View full size*, where the source links to the bibliography entry.

- `alt` is required. Describe what the image shows; use `alt=""` only for purely decorative images.
- `id` names the figure so the text can refer to it, and gives it a permanent link, `#figure-ridges`. `<FigureRef to="ridges" />` prints "Figure 1" as a link to the figure, and stays correct when figures are added or reordered. A reference may come before or after its figure. **Give an `id` to any figure you or anyone else may link to**: a figure without one is still numbered but has no link target, because its number changes when figures are added.
- `credit` names who made the image (photographer, illustrator, cartographer).
- `source` says where the image comes from. Link it with either `cite`, the key of an entry in the article's bibliography, or `sourceUrl`, for a source online. With `cite` alone, the source line shows the whole bibliography entry.
- `license` states the copyright or license status, e.g. "Public domain" or "CC BY 4.0"; add `licenseUrl` to link it.
- `date`, `medium`, `holder`, and `accession` describe the original when it matters, above all when an image is evidence: when it was made (`date="c. 1760"`), how (`medium="Woodcut"`), who holds it (`holder="Bibliothèque nationale de France"`), and under what number (`accession="Kh-34-4"`). They appear in the credit line, in that order. None is required.

**What every figure needs.** `alt` is required, and the build stops without it. In a published article, a numbered figure should also have a `credit` or a source (`source`, `sourceUrl`, or `cite`), and a figure taken from a source should have a `license`; when one is missing, `npm run dev` and `npm run build` print a warning naming the figure. Drafts are not checked, so placeholders can stay until publication.
- `fullSize` adds a "View full size" link to the original image file, for maps and photographs with detail too fine for the page. Give it a URL instead (`fullSize="https://…"`) to link to a larger copy elsewhere, such as an archive's scan.
- `wide` lets the figure extend beyond the text column (up to about 1000px). Leave it off for ordinary figures.
- `inset` sets a small figure (a sketch, a specimen) to the right with the text running beside it; with a margin it reaches halfway into the margin, and on phones it is centered. It occupies the margin beside it, so keep marginal notes away from the paragraphs it sits next to.
- `unnumbered` leaves a decorative image out of the numbering.
- SVG, PNG, JPEG, and WebP all work. Raster images are resized and converted to WebP automatically at several widths, never larger than the original; nothing is cropped.

**Bibliography keys.** In a list directly under a heading named *Bibliography*, *References*, or *Works Cited*, start an entry with a key in brackets, like `[survey-1942]`. The key is removed from the page and the entry becomes a link target for `cite` and for citations in footnotes. Keys start with a lowercase letter or digit and use letters, digits, `-`, `_`, `.`, and `:`. Don't write `[@survey-1942]`: in Pandoc and Zettlr that is a citation, which their citation processor would replace, so the build rejects it. A bare `[survey-1942]` stays plain text in those tools. This works in `.md` articles too.

**Mistakes stop the build.** A `FigureRef` or `cite` that matches nothing, or two figures with the same `id`, is reported with the article's file name when you run `npm run dev` or `npm run build`, so a broken reference cannot be published.

`src/content/writing/holy-saturday-in-oak-ridge.mdx` is a working example of every element above.

### Shape-note dividers

A section divider can quote a short phrase of shape-note music: a fine rule with the notes set in a gap at its centre. The notes fade in as the reader scrolls to them, and activating them (click, tap, Enter, or Space) shows the words and the source beneath. Rename the article to `.mdx` and write:

```mdx
import ShapeNoteDivider from '../../components/ShapeNoteDivider.astro';

<ShapeNoteDivider ref="idumea-opening" />
```

`ref` is the id of a phrase in `src/data/shapeNotes/phrases.yaml`. To cite the music in the article's notes, put an ordinary footnote reference inside the divider; its number follows the words:

```mdx
<ShapeNoteDivider ref="idumea-opening">[^idumea]</ShapeNoteDivider>

[^idumea]: Idumea, tenor. Tune attributed to Ananias Davisson; words by Isaac Watts. *Tunebook*, edition (year), page.
```

In print the divider is only the rule and the notes, without ink texture; the words and the Source link stay on screen, and a footnote prints with the article's other notes.

Each phrase records its notes once; shapes, spacing, and the drawing are worked out from them:

```yaml
- id: idumea-opening
  title: Idumea
  notation: four-shape          # seven-shape can be stored but is not drawn yet
  key: { tonic: A, mode: minor }
  meter: '3/2'
  voice: tenor
  notes:                        # pitches as printed; durations in quarter notes
    - { pitch: A3, dur: 2, syl: And }
    - { pitch: C4, dur: 1, syl: be- }   # "-" joins a syllable to the next one
    - { pitch: B3, dur: 1 }             # no syllable: a slur from the note before
    - { rest: 2 }
  tune: { composer: …, year: … }
  words: { author: …, year: … }
  source: { title: …, edition: …, year: …, page: …, url: … }
  editorial:
    - Excerpt: the opening phrase of the tenor. Not transposed.
```

- The shapes follow the four-shape (fasola) system from the key: fa triangle, sol oval, la square, mi diamond. An accidental does not change a shape.
- A historical phrase must give a source URL or identifier, and its edition, year, and page when known; record any excerpting, transposition, or simplification under `editorial`. The tune, the words, the arrangement, and the printed edition are recorded separately because they often differ in maker and date.
- Phrases marked `fixture: true` are demonstration data (synthetic notes, or a placeholder citation, as for Idumea at present). They can be used in drafts, but `npm test` fails if one appears on a published page.
- A divider quotes a phrase of at most 16 notes and rests. A bad pitch, a duration that is not a note value, or a missing phrase stops the build with a message naming the phrase.
- The staffless phrase is a quotation, not a full transcription: it keeps the order of pitches, their contour, the rhythm, and the words, but not exact pitch. The source is where the music can be read in full.

`src/content/writing/the-printers-ornament.mdx` is a working example (a draft).

## Notes

A note is a short standing page about the publication itself, such as *On Shape Notes*, which explains the musical figures in the dividers. Notes are not essays: they have no date, do not appear in the writing list or the RSS feed, and are listed at `/notes/`. Each is one Markdown file in `src/content/notes/`, and the file name becomes the URL (`on-shape-notes.md` -> `/notes/on-shape-notes/`).

```markdown
---
title: "On Shape Notes"
description: "A note on the musical typography of this site."
draft: true
---

The text of the note. The title is printed above it, so start any sections at `##`.
```

| Field | Required | Notes |
|---|---|---|
| `title` | yes | |
| `description` | yes | Shown in the list of notes and in link previews. |
| `order` | no | A number; notes are listed in this order, then by title. |
| `links` | no | A list of `{ label, url }` shown under the note. |
| `draft` | no | As for articles: shown with a "Draft" label in `npm run dev`, left out of production builds, and checked by `npm test`. |

The footer links to the notes once at least one is published.

## Publishing

1. Set `draft: false` (or remove the line).
2. Check the article with `npm run dev`, and optionally `npm test`.
3. Commit and push to `master`:

   ```sh
   git add src/content/writing/
   git commit -m "Publish: The Title of the Article"
   git push
   ```

GitHub Actions then builds the site and publishes it, usually within a couple of minutes. Progress is shown under the repository's **Actions** tab. If the build fails (for example, because of invalid metadata), the live site is left unchanged.

### Updating an article or adding a correction

Edit the file and push. For a change that matters to the argument, also:

- set `updated:` to the date of the revision, and
- add a `correction:` describing what changed, for example:

  ```yaml
  updated: 2026-11-12
  correction: "An earlier version misdated the survey. The date has been corrected; the argument is unchanged."
  ```

A "Revised" notice then appears under the dates at the top of the article, linking to an "Editorial note" at the end that gives the correction, dated by `updated:`. Small fixes such as typos need neither.

### Later notes

A later note comments on a passage of an essay after it has been published, without rewriting it, so the development of the argument stays visible. Write it as a footnote whose text starts with a type and the date you wrote it:

```markdown
Hope is perhaps the last and most seductive false god.[^hope]

[^hope]: [? 2026-10-09] Is the hope refused here hope as such, or only the hope that defers justice?
```

| Symbol | Or write | Type | Use it for |
|---|---|---|---|
| `?` | `question` | Open question | Something unresolved, or needing more thought |
| `↺` | `reconsideration` | Reconsideration | An interpretation you would now approach differently |
| `+` | `addition` | Addition | Evidence or scholarship you found later |
| `×` | `correction` | Correction | A factual error, corrected explicitly |

- The passage gets a small red symbol. It links to the note in a **Later notes** list at the end of the article, which gives the type, the date, and a link back to the passage. On wide screens the note also sits in the margin beside the passage. In print it sits in the printed margin. In the RSS feed it appears once, in the list.
- A **correction** is also announced at the top of the article ("Corrected October 9, 2026. Read the correction."), so it is found by readers who never open the notes. For a revision of the whole essay, use the `correction:` field instead (below).
- The footnote label (`hope` above) becomes the note's permanent link, `#later-hope`. Only the passages you annotate get one.
- If the passage is deleted along with its `[^hope]`, the build stops and says so rather than dropping the note or guessing where it belongs. A missing or malformed date also stops the build.
- Later notes may cite sources like any footnote, e.g. `[+ 2026-11-02] See [smith-2025, 12].` Keep them to plain paragraphs.

### Printing

Articles print as book pages: the navigation is dropped, marginal notes sit in the printed margin, web addresses are spelled out, and Chromium-based browsers add running heads (publication and title) and page numbers. Use the browser's Print or Save as PDF.

## How deployment works

`.github/workflows/deploy.yml` runs on every push to `master`. It installs dependencies with `npm ci`, runs `npm run check`, builds the site, checks links and draft exclusion, and publishes `dist/` to GitHub Pages. Pull requests run the same checks without publishing.

The site lives at a GitHub Pages project address, so every internal link includes the `/compost-et-coagula/` base path. In components, build internal links with `url()` from `src/utils/urls.ts` rather than writing paths that begin with `/`. If you later move to a custom domain, change `site` and remove `base` in `astro.config.mjs`.

### Search and feeds

The search page (`/search/`) uses [Pagefind](https://pagefind.app/). After every build, Pagefind reads the finished article pages in `dist/` and writes a static index to `dist/pagefind/`, so search needs no server or outside service. It only works on a built site: use `npm run build` and `npm run preview` to try it locally. Which parts of a page are indexed is set in `pagefind.yml`.

The RSS feed (`/rss.xml`) carries the full text of every published article, rendered with the same components as the site and reduced to plain HTML that feed readers can display. Each article page also carries schema.org metadata (JSON-LD) for search engines.

The author's name is set once, as `SITE_AUTHOR` in `src/consts.ts`. It appears in every article's byline, in the page metadata and JSON-LD, and as `dc:creator` in the RSS feed.

## Project structure

```text
src/
  content/writing/     articles (Markdown)
  content/projects/    project pages (Markdown)
  content/notes/       notes about the publication (Markdown)
  content.config.ts    metadata schemas
  consts.ts            site title, description, and author name
  pages/               routes: home, writing, projects, notes, about, search, RSS, 404
  layouts/             page and article layouts
  components/          header, footer, article lists, Figure, FigureRef, ShapeNoteDivider
  data/shapeNotes/     musical phrases quoted by shape-note dividers
  lib/shapeNotes/      shape-note notation, SVG drawing, and their unit tests
  plugins/figures.mjs  figure numbers, figure references, bibliography keys, citations
  styles/global.css    design tokens and typography
  styles/edition.css   article margin, marginal notes, later notes, editorial note
  plugins/apparatus.mjs  [margin] footnotes into marginal notes; later notes
  styles/print.css     print layout
  utils/               content queries, URL, metadata, and feed helpers
  assets/fonts/        self-hosted fonts (SIL Open Font License)
scripts/check-dist.mjs build checks used by `npm test`
pagefind.yml           search index settings
```

Fonts: Source Serif 4, Source Sans 3, and IBM Plex Mono, self-hosted as Latin and Latin Extended WOFF2 subsets. Their licenses are in `src/assets/fonts/`.
