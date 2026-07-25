# Project agent memory

Logseq plugin that prefixes a local time (`[HH:mm] ` by default, format configurable) onto top-level blocks directly under a journal page.
It targets **DB graphs only** — `package.json` declares `logseq.unsupportedGraphType: "file"`, so file-graph code paths are out of scope, not merely untested.

## Commands

Use the `package.json` scripts, not raw `tsc`/`vite`/`vitest`:

- `npm ci` — install (Node.js 20+, per `.github/workflows/ci.yml`).
- `npm run build` — typecheck (`tsc --noEmit`) then Vite build into `dist/`.
- `npm run dev` — watch build; reload the plugin in Logseq to pick up output.
- `npm run test` — Vitest, single run.
- `npm run check` — test + build; exactly what CI and the release workflow run, so run it before proposing a change.

## Layout and sources of truth

- Plugin manifest: the `logseq` field in `package.json` (id, title, icon, graph support). There is no separate manifest file.
- Entry point: `package.json` `main` points at `dist/index.html`, which Vite generates from the root `index.html`. `dist/` and `release/` are gitignored build output — never hand-edit or commit them.
- `src/time-prefix.ts` holds the pure exported helpers and is what `src/time-prefix.test.ts` covers. `src/main.ts` is Logseq runtime wiring (settings schema, editor and DB event handlers) and has no tests. Put new logic in a pure helper so it is testable, and keep `main.ts` thin.
- User-facing settings come from `settingsSchema` in `src/main.ts`; the README documents them in both Chinese and English, so a behavior change usually touches both language sections.

## Verifying editor behavior live

Caret, IME and duplicate-prefix behavior cannot be settled by Vitest — those bugs live in the real editor. Drive an isolated desktop Logseq instead of the user's:

```bash
HOME=<scratch> CFFIXED_USER_HOME=<scratch> /Applications/Logseq.app/Contents/MacOS/Logseq \
  --user-data-dir=<scratch>/electron-data --remote-debugging-port=9333
```

It opens a throwaway DB `Demo` graph. Talk to it over CDP (`http://127.0.0.1:9333/json/list`, one `page` target; Node's global `WebSocket` is enough). Load the working copy without any file dialog: `LSPluginCore.register({url: '<repo path>'})`, and later `LSPluginCore.reload(['journal-time-prefix'])`, `enable`/`disable`. `LSPluginCore` and `logseq.api` are globals on the host page; the plugin iframe is `document.getElementById('journal-time-prefix_iframe').contentWindow` and is same-origin, so its `logseq.updateSettings({...})` can drive settings.
Type with `Input.dispatchKeyEvent`; reproduce IME with `Input.imeSetComposition` followed by `Input.insertText`. Never point any of this at `~/logseq`, `~/.logseq` or the user's running Logseq.

## Release convention

Tag-driven: `.github/workflows/publish.yml` fires on `v*` tags, runs `npm run check`, zips `dist/` plus `package.json README.md LICENSE CHANGELOG.md icon.svg`, and creates the GitHub Release.

Demonstrated shape (see `2bf0ae9`): feature commits carry their own `CHANGELOG.md` entries under `## [Unreleased]`; the release commit only bumps the version in `package.json` / `package-lock.json` and renames `## [Unreleased]` to `## [x.y.z] - YYYY-MM-DD`, with subject `chore: release vX.Y.Z`.

Commit subjects follow Conventional Commits (`feat:`, `chore:`). Contributor flow is in `CONTRIBUTING.md`.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
