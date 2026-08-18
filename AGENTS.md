# AGENTS.md

## Repo status
- Implemented as a **pure static frontend** — no framework, no build step, no `package.json`, no test/lint tooling. Do not assume a toolchain or run installs/builds.
- **Runtime dependencies come from CDN only** (`jsdelivr`): `marked` for markdown parsing, `highlight.js` for syntax highlighting (loaded in `index.html`; do not vendor or add package managers).
- Design documents (`RESEARCH.md`, `PRD.md`, `TECH_DESIGN.md`) are written in **Chinese**; match that language for any new/updated docs and UI copy.

## File layout
- `index.html` — single entry page. Load order matters: `marked`, `highlight.js` (CDN) then `js/storage.js`, `js/markdown.js`, `js/app.js` (plain scripts, no ES modules).

- `js/storage.js` — `Storage` IIFE. All LocalStorage access under key `markdownEditor.notes.v1`. Validates each note via `isValidNote`; malformed data filtered/reset to `[]` instead of crashing. Also: `createNote`, `sortByUpdateDesc`, in-memory `search`. Save failures are silently tolerated.

- `js/markdown.js` — `Markdown` IIFE. `render()` uses `marked` (function or `.parse`), falls back to escaped plain text if the lib is missing. `highlight()` runs `hljs.highlightElement` on `pre code` blocks; unrecognized languages are kept as-is.

- `js/app.js` — `App` IIFE. App state, event binding, list rendering, search filtering, editor↔preview sync, auto-save scheduling, delete confirmation. State is module-level variables, not a class.

- `css/style.css` — dark theme, three-column layout, code blocks wrap (`white-space: pre-wrap`).

## Product = Markdown note tool (no backend)
- Pure static frontend; no server, no database. All data in browser **LocalStorage** as a JSON array.
- Note shape: `{id, title, content, createTime, updateTime}`; `id` is base36 timestamp+random via `Date.now().toString(36)` + random suffix.
- Three-column layout: left = note list (sorted by updateTime desc, selected note highlighted), middle = editor, right = live preview (fixed 45% width).
- Autosave with **500ms debounce**; also save on switch/close (`beforeunload`).
- Malformed LocalStorage data must reset to empty array rather than crash.
- Search filters title+content in-memory (case-insensitive, trimmed); delete requires confirmation and is permanent.
- Preview renders markdown with syntax highlighting, dark theme default, code wraps to avoid overflow.
- PC-only; target latest Chrome/Edge/Firefox. Mobile is out of scope.