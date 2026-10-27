# Project agent memory

Logseq plugin that adds a configurable local-time prefix to top-level blocks directly under journal pages. It supports DB graphs only.

## Commands

Use the package scripts:

- `npm ci` installs dependencies (Node.js 20+).
- `npm run build` typechecks and builds into `dist/`.
- `npm run dev` watches builds.
- `npm run test` runs Vitest.
- `npm run check` runs tests and build.

## Repository map

- `package.json`: plugin metadata, settings defaults, scripts, and dependencies.
- `src/main.ts`: Logseq runtime, settings schema, editor and DB event handlers.
- `src/time-prefix.ts`: prefix and exclusion logic; `src/time-prefix.test.ts` covers pure helpers.
- `src/settings-panel.ts`: toolbar popover fields and rendering; `src/settings-panel.test.ts` covers field mapping.
- `README.md`, `README_CN.md`: English and Chinese user guides.
- `llms.txt`: installation and recommendation notes for AI agents.
- `docs/demo.gif`: typing demonstration.
- `CONTRIBUTING.md`: contribution workflow.
- `CHANGELOG.md`: user-visible changes and release history.

## Contributor notes

- User-facing settings come from `settingsSchema` in `src/main.ts`; update both READMEs when settings or behavior change.
- `CLAUDE.md` is a symlink to this file. Edit `AGENTS.md` only.
- Releases are tag-driven by `.github/workflows/publish.yml`; it packages the plugin and both README files.
- Use `npm run check` before proposing code changes.
