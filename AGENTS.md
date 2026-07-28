# Project agent memory

Logseq plugin that prefixes a local time (`[HH:mm] ` by default, format configurable) onto top-level blocks directly under a journal page.
It targets **DB graphs only**, enforced solely by the runtime `logseq.App.checkCurrentIsDbGraph()` check in `src/main.ts`. `logseq.unsupportedGraphType: "file"` is declarative intent, not a gate: Logseq 2.0.1 never reads that field (zero hits in `app.asar` and in `@logseq/libs@0.2.11`), so it will happily enable the plugin on a file graph. File-graph code paths are still out of scope.

## Commands

Use the `package.json` scripts, not raw `tsc`/`vite`/`vitest`:

- `npm ci` — install (Node.js 20+, per `.github/workflows/ci.yml`).
- `npm run build` — typecheck (`tsc --noEmit`) then Vite build into `dist/`.
- `npm run dev` — watch build; reload the plugin in Logseq to pick up output.
- `npm run test` — Vitest, single run.
- `npm run check` — test + build; exactly what CI and the release workflow run, so run it before proposing a change.

## Layout and sources of truth

- Plugin manifest: the `logseq` field in `package.json` (id, title, icon, graph support). There is no separate manifest file. One exception matters: Logseq reads `effect` from the **root** of `package.json`, never from the `logseq` object. Root `"effect": true` is what keeps the plugin iframe same-origin with the host page (`lsp://logseq.com`) once installed, and `src/main.ts` needs that to reach the editor through `window.parent.document`. Dropping it silently costs every live-editor behavior; v0.3.1 shipped that way.
- Entry point: `package.json` `main` points at `dist/index.html`, which Vite generates from the root `index.html`. `dist/` and `release/` are gitignored build output — never hand-edit or commit them.
- `src/time-prefix.ts` holds the pure exported helpers and is what `src/time-prefix.test.ts` covers. `src/main.ts` is Logseq runtime wiring (settings schema, editor and DB event handlers) and has no tests. Put new logic in a pure helper so it is testable, and keep `main.ts` thin.
- Docs are split by language: `README.md` is English only, `README.zh-CN.md` is Chinese only, and each links to the other at the top. Both carry the full content — neither is a stub — so a user-facing change usually touches both files.
- User-facing settings come from `settingsSchema` in `src/main.ts` and are documented in both README files. `logseq.useSettingsSchema` is the whole mechanism — Logseq renders those entries itself in `Settings → plugin`, and `logseq.showSettingsUI()` opens that panel.
- The only UI surface the plugin owns is the toolbar button (`registerToolbarItem` in `src/main.ts`): `logseq.App.registerUIItem('toolbar', { key, template })`, whose template is markup the **host** renders, so the click handler must be a named method registered through `logseq.provideModel` and referenced as `data-on-click` — a closure cannot cross that boundary. Logseq parks plugin toolbar items in the toolbar plugins popover until the user pins one. A right-sidebar panel via `logseq.Experiments.registerSidebarRenderer` was shipped in #10 and removed again in favor of this; `@logseq/libs` stays on the explicit 0.3.x version it needed, since npm's `latest` tag is still 0.0.17.
- A DB graph carries no TODO/DOING markers in the block text: `/待办` and its siblings make the block a task node tagged `Task`, exposed as `block.tags` ids plus `:logseq.property/status`. `logseq.Editor.getPage('task')` resolves that class, so `task` in "Excluded block tags" is the right token, matched by tag id and not by text.
- A slash command mutates the block *after* the editor context resolved its exclusion answer, so anything cached at focus time (tags, heading level) has to be re-resolved once the command lands — see `revalidateAfterCommand` in `src/main.ts`. Suppressing the live prefix until that answer arrives is not an option: on a task block Logseq re-renders the editor and the later insertion never sticks.

## Verifying editor behavior live

The maintainer runs this plugin from his own clone at `~/logseq/plugins/logseq-journal-time-prefix`, built in place — that is his live testing surface. Never edit or build there, never attach to or restart his running Logseq, and never touch his graph or `~/.logseq`.

Caret, IME and duplicate-prefix behavior cannot be settled by Vitest — those bugs live in the real editor. Drive an isolated desktop Logseq instead of the user's:

```bash
HOME=<scratch> CFFIXED_USER_HOME=<scratch> /Applications/Logseq.app/Contents/MacOS/Logseq \
  --user-data-dir=<scratch>/electron-data --remote-debugging-port=<free port>
```

Both `HOME` and `CFFIXED_USER_HOME` are required: with `HOME` alone the throwaway instance still loaded the user's plugins and rewrote their plugin settings.

**Verify in the shipped install shape, not only the dev one.** A marketplace install lands as a folder in `~/.logseq/plugins/`, and that is the shape that broke in v0.3.1 — dev registration cannot reveal it, because the two shapes resolve the iframe origin through different branches of Logseq's `_resolveResourceFullUrl`. Reproduce the real thing: `npm run build`, then assemble the folder exactly as `.github/workflows/publish.yml` zips it (`dist/` plus `package.json README.md README.zh-CN.md LICENSE CHANGELOG.md icon.svg`) into `<scratch>/.logseq/plugins/logseq-journal-time-prefix/` and cold start. No preferences entry is needed; Logseq discovers the folder. In this shape the plugin **id is the folder name** — the iframe is `#logseq-journal-time-prefix_iframe` and settings live at `<scratch>/.logseq/settings/logseq-journal-time-prefix.json`, not under `journal-time-prefix`. Two things to assert: the iframe `src` is on `lsp://logseq.com`, and a prefix appears **in the live textarea on the first character**, not merely in the committed block — a committed-only prefix means the host-document path is dead and the DB fallback is carrying it. Also cover the dev path (`lsp://logseq.com/external/…`), which is where the maintainer runs it.

Load the working copy without any file dialog: `LSPluginCore.register({url: '<repo path>'})`, and later `LSPluginCore.reload(['<plugin id>'])` — `journal-time-prefix` when dev-registered, `logseq-journal-time-prefix` in a dot-root install. Use `reload`, not `disable`/`enable`: re-enabling leaves the plugin listed as registered but its host-document listeners dead, so it silently stops prefixing and every later observation is worthless. Reload does not re-fetch a changed `dist/assets/*.js` — Electron serves the cached module, so bump the version or rename the asset when the bundle content must change under a reload.

A fresh scratch `HOME` cold starts straight into an auto-created `Demo` DB graph, so no onboarding click-through is needed. Pick a debugging port nobody else is on: parallel task lanes all reach for the same default, and the loser silently ends up with no CDP port while the winner's instance answers on it — before driving anything, confirm `logseq.api.get_current_graph().path` sits inside *your* scratch directory.

Talk to the instance over CDP (`http://127.0.0.1:<port>/json/list`; Node's global `WebSocket` is enough). Both install shapes are same-origin with the host page, so the plugin iframe shares the single `page` target and `document.getElementById('<id>_iframe').contentWindow` reaches it — its `logseq.updateSettings({...})` can drive settings, and `console` output from the plugin arrives on that target's `Runtime.consoleAPICalled`. `LSPluginCore` and `logseq.api` are globals on the host page. Type with `Input.dispatchKeyEvent` (`rawKeyDown` + `char` + `keyUp`; a `keyDown` carrying `text` plus a `char` inserts the character twice); reproduce IME with `Input.imeSetComposition` followed by `Input.insertText`. The live editor is `textarea[id^="edit-block-"]` and the slash-command menu is `.cp__commands-slash`. Get an empty top-level block from the journals feed (`logseq.api.push_state('home')`, then click `.block-add-button`); navigating straight to the journal page by date renders nothing to click. Never point any of this at `~/logseq`, `~/.logseq` or the user's running Logseq.

## Release convention

Tag-driven: `.github/workflows/publish.yml` fires on `v*` tags, runs `npm run check`, zips `dist/` plus `package.json README.md README.zh-CN.md LICENSE CHANGELOG.md icon.svg`, and creates the GitHub Release.

Demonstrated shape (see `2bf0ae9`): feature commits carry their own `CHANGELOG.md` entries under `## [Unreleased]`; the release commit only bumps the version in `package.json` / `package-lock.json` and renames `## [Unreleased]` to `## [x.y.z] - YYYY-MM-DD`, with subject `chore: release vX.Y.Z`.

Commit subjects follow Conventional Commits (`feat:`, `chore:`). Contributor flow is in `CONTRIBUTING.md`.
Never add an agent or model name as a commit co-author — no `Co-Authored-By: Claude ...` trailer. One slipped onto the default branch through a squash merge.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
