# Compost et Coagula — VS Code authoring snippets

The snippets live in `.vscode/compost-et-coagula.code-snippets` and load automatically when this repository is opened as a VS Code workspace.

1. Open an `.mdx` file, type `;shape` (or another trigger), select the suggestion, and press Tab through fields. Use **Insert Snippet** from the command palette if suggestions are not visible.
2. The recommended workspace settings are already in `.vscode/settings.json`:

```json
{
  "editor.snippetSuggestions": "top",
  "editor.tabCompletion": "on",
  "editor.wordWrap": "on"
}
```

These snippets use the exact MDX component names and bibliography conventions found in the supplied essays. They do **not** alter Astro and do **not** auto-import dependencies. A `;figure` needs `;impfigure` once and `;image` for each local asset; `;figref` needs `;impfigref` once; `;shape` needs `;impshape` once. Put imports immediately after YAML frontmatter. A shape-note `ref` must exist in the site's registered phrase data. `;cite` assumes the currently used `[key]` reference convention and does not query your `.bib`. `;bib` is for the current manually maintained bibliography; don't use it to duplicate a generated bibliography.

The suggested `;foot` inserts both reference and definition at the cursor; `;fnref` / `;fndef` are more convenient for collecting definitions at the bottom of an essay. For research questions, use `;question` in prose and `;questiondef` near the end of the essay; the question is set in the margin under the label *Quaestio*. A question that comes up after publication is a later note instead (`;later`, then pick `?`).

Snippets are workspace-scoped but not language-scoped (so they'll appear elsewhere in that repository, too); this avoids ambiguity in MDX language identifiers across extensions.

## Triggers

| Trigger | Inserts | Notes |
|---|---|---|
| `;impfigure` | `import Figure …` | Once per article |
| `;impfigref` | `import FigureRef …` | Once per article |
| `;impshape` | `import ShapeNoteDivider …` | Once per article |
| `;impexcursus` | `import Excursus …` | Once per article |
| `;image` | `import name from './<article>/file.png';` | The folder is filled in from the file name |
| `;figure` | `<Figure>` with id, src, alt, credit, source, cite, license, caption | Delete the attributes you don't need; `cite` must match a bibliography key |
| `;figref` | `<FigureRef to="…" />` | |
| `;shape` | `<ShapeNoteDivider ref="…" />` | |
| `;shapefn` | A divider with a footnote citing the music | |
| `;foot` | `[^label]` and `[^label]: …` together | |
| `;fnref` / `;fndef` | Footnote reference / definition | |
| `;cite` | `[key, 45]` | Inside a footnote; delete the locator if there is none |
| `;bib` | `- [key] Surname, First. *Title*. City: Publisher, Year.` | Under `## Bibliography`, `## References`, or `## Works Cited` |
| `;question` / `;questiondef` | Research question reference / `[margin: ? Quaestio]` definition | |
| `;margin` | `[^label]: [margin] …` | Commentary only, never a citation |
| `;marginmark` | `[^label]: [margin: ☞ Obs.] …` | Choose ☞ ? ↗ † or ※ |
| `;later` | `[^label]: [? YYYY-MM-DD] …` dated today | Choose ? ↺ + or ×; keep `[^label]` in the passage |
| `;excursus` | `<Excursus title="…">…</Excursus>` | |

## Reducing imports further (optional, later)

If you want zero repeated component imports, a developer could check whether your Astro renderer can provide named MDX components through `<Content components={...} />`; changing only snippets cannot make them globally available. Local images imported as modules still need an import, unless you intentionally redesign your image workflow. Don't remove imports until the Astro rendering path is tested.
