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
| `npm test` | Diagnostics, build, then check links and draft exclusion |

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
- `fullSize` adds a "View full size" link to the original image file, for maps and photographs with detail too fine for the page. Give it a URL instead (`fullSize="https://…"`) to link to a larger copy elsewhere, such as an archive's scan.
- `wide` lets the figure extend beyond the text column (up to about 1000px). Leave it off for ordinary figures.
- `unnumbered` leaves a decorative image out of the numbering.
- SVG, PNG, JPEG, and WebP all work. Raster images are resized and converted to WebP automatically at several widths, never larger than the original; nothing is cropped.

**Bibliography keys.** In a list directly under a heading named *Bibliography*, *References*, or *Works Cited*, start an entry with a key in brackets, like `[survey-1942]`. The key is removed from the page and the entry becomes a link target for `cite`. Keys start with a lowercase letter or digit and use letters, digits, `-`, `_`, `.`, and `:`. Don't write `[@survey-1942]`: in Pandoc and Zettlr that is a citation, which their citation processor would replace, so the build rejects it. A bare `[survey-1942]` stays plain text in those tools. This works in `.md` articles too.

**Mistakes stop the build.** A `FigureRef` or `cite` that matches nothing, or two figures with the same `id`, is reported with the article's file name when you run `npm run dev` or `npm run build`, so a broken reference cannot be published.

`src/content/writing/holy-saturday-in-oak-ridge.mdx` is a working example of every element above.

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
  content.config.ts    metadata schemas
  consts.ts            site title, description, and author name
  pages/               routes: home, writing, projects, about, search, RSS, 404
  layouts/             page and article layouts
  components/          header, footer, article lists, Figure, FigureRef
  plugins/figures.mjs  figure numbers, figure references, bibliography keys
  styles/global.css    design tokens and typography
  styles/edition.css   article margin, marginal notes, editorial note
  plugins/apparatus.mjs  [margin] footnotes into marginal notes
  styles/print.css     print layout
  utils/               content queries, URL, metadata, and feed helpers
  assets/fonts/        self-hosted fonts (SIL Open Font License)
scripts/check-dist.mjs build checks used by `npm test`
pagefind.yml           search index settings
```

Fonts: Source Serif 4, Source Sans 3, and IBM Plex Mono, self-hosted as Latin and Latin Extended WOFF2 subsets. Their licenses are in `src/assets/fonts/`.
