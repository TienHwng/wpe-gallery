# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Python 3.13+, managed with uv.

```bash
uv sync
uv run wpe-gallery samples/*.txt --links-out output/links_dedup.txt
uv run wpe-gallery samples/list1.txt samples/list2.txt --no-open -o out.html
```

The `samples/*.txt` form needs a shell that expands globs (Git Bash). PowerShell passes the pattern literally and the tool does not expand it, so list the files explicitly there.

Lint and format with these commands. There are no tests.

```bash
uv run ruff check
uv run ruff format
npx prettier@3.3.3 --write src/wpe_gallery/web
```

`.prettierrc.json` turns off embedded formatting on purpose, because Prettier would otherwise rewrite the `$styles` and `$script` placeholders in `gallery.html`.

## Architecture

The package is `src/wpe_gallery/`. `cli.main` is the `wpe-gallery` console script, and it runs as a linear pipeline:

1. `links.collect_ids` regex-scans each input file for `?id=` / `&id=` values, so input format is free-form. It returns unique IDs in first-seen order, plus a map of duplicated IDs to their `file:line` sources.
2. `--links-out` is written next, before any network call.
3. `steam.fetch_details` reuses `output/cache/steam_details.json` for 7 days and POSTs only the missing IDs to Steam's `GetPublishedFileDetails` in batches of 100. `--refresh` ignores the cache. No API key is sent.
4. `render.render` returns one self-contained HTML page, which is written to `--out` (default `output/gallery.html`) and opened in the browser unless `--no-open` is set.

Everything the tool generates belongs in the git-ignored `output/` folder, relative to the current directory.

The page source lives in `src/wpe_gallery/web/`: `gallery.html` is the template, and `gallery.css` and `gallery.js` are inlined into it at render time.

## Things to watch

- `gallery.html` is a `string.Template` with `$count`, `$styles`, `$cards`, and `$script`, so any other literal `$` in that file must be written `$$`. The CSS and JS are substituted as values and need no escaping.
- `gallery.js` is inlined as a classic script, so it must not contain a literal `</script>`.
- Private or removed workshop items come back without `title` or `preview_url`. `render` must keep tolerating those missing fields.
- The client-side filter matches against each card's `data-t` attribute (lowercased title, ID, and tags), so a change to what is searchable belongs there.
- The page has four views (color atlas, sorting deck, wall, finish), all driven from the cards' `data-*` attributes. Keep/skip decisions persist in `localStorage`, so the gallery must stay usable when storage is unavailable.
- Galleries opened from disk share one `localStorage`, so `persist` must keep the IDs that belong to other galleries.
- The atlas reads each preview through canvas, which relies on Steam's CDN sending `Access-Control-Allow-Origin`. The CDN ignores resize parameters, so the browser builds 96px thumbnails once and caches them with their colors under a separate key.
- The UI text is Vietnamese (`lang="vi"`), while tag names come from Steam in English.
- `#filters` is a single element that `placeFilters` moves between the wall and the atlas, so the filter state is shared.
- Workshop previews are square and often small (GIFs can be 160px wide), so don't design around full-bleed 16:9 images.
