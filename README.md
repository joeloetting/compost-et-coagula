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
| `npm run build` | Build the production site into `dist/` |
| `npm run preview` | Serve the built `dist/` locally, exactly as it will be published |
| `npm run check` | Type and Astro diagnostics |
| `npm test` | Diagnostics, build, then check links and draft exclusion |

## Writing an article

Every article is one file in `src/content/writing/`. The file name becomes the URL:

```text
src/content/writing/holy-saturday-in-oak-ridge.md  ->  /writing/holy-saturday-in-oak-ridge/
```

Choose the file name carefully and do not change it after publishing, since that would break existing links.

Use `.md` (plain Markdown) by default. Use `.mdx` only when the article needs captioned figures (see below).

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

Ordinary Markdown tables and fenced code blocks (with a language, e.g. ` ```ts `) work as expected. Wide tables and long code lines scroll sideways inside their own box on small screens.

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

**With a caption**, rename the article to `.mdx` and use the `Figure` component:

```mdx
import Figure from '../../components/Figure.astro';
import map from './holy-saturday-in-oak-ridge/map.svg';

<Figure src={map} alt="Short description of the map." credit="Source: …" wide>
  The caption, which may contain *Markdown*.

  <Fragment slot="description">
    <p>An optional longer description for maps and diagrams, shown when the reader opens it.</p>
  </Fragment>
</Figure>
```

- `alt` is required. Describe what the image shows; use `alt=""` only for purely decorative images.
- `wide` lets the figure extend beyond the text column (up to about 1000px). Leave it off for ordinary figures.
- `credit` is optional and appears after the caption.
- SVG, PNG, JPEG, and WebP all work. Raster images are resized and converted automatically; nothing is cropped.

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

Small fixes such as typos need neither.

## How deployment works

`.github/workflows/deploy.yml` runs on every push to `master`. It installs dependencies with `npm ci`, runs `npm run check`, builds the site, checks links and draft exclusion, and publishes `dist/` to GitHub Pages. Pull requests run the same checks without publishing.

The site lives at a GitHub Pages project address, so every internal link includes the `/compost-et-coagula/` base path. In components, build internal links with `url()` from `src/utils/urls.ts` rather than writing paths that begin with `/`. If you later move to a custom domain, change `site` and remove `base` in `astro.config.mjs`.

## Project structure

```text
src/
  content/writing/     articles (Markdown)
  content/projects/    project pages (Markdown)
  content.config.ts    metadata schemas
  pages/               routes: home, writing, projects, about, RSS, 404
  layouts/             page and article layouts
  components/          header, footer, article lists, Figure
  styles/global.css    design tokens and typography
  utils/               published-content queries and URL helpers
  assets/fonts/        self-hosted fonts (SIL Open Font License)
scripts/check-dist.mjs build checks used by `npm test`
```

Fonts: Source Serif 4, Source Sans 3, and IBM Plex Mono, self-hosted as Latin and Latin Extended WOFF2 subsets. Their licenses are in `src/assets/fonts/`.
