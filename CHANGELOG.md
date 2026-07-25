# Changelog

All notable changes to this project are documented here.

## [0.3.1] - 2026-07-25

### Fixed

- Do not prefix a block whose content starts with `/`, so Logseq's slash-command menu keeps working in a journal. Logseq only opens the menu when the `/` starts the block or follows whitespace, so a prefix format without a trailing space (`【14:32】/`) suppressed the menu entirely; with the default `[14:32] ` the menu still opened, but the timestamp stayed behind as stray text after the command ran. The prefix is not added back later, so type a character before the command when a block needs a timestamp.

### Documentation

- Add a demo GIF of the prefix appearing while typing in a journal block and embed it in both README language sections, plus a short usage section in each.
- Split the bilingual README into an English-only `README.md` and a Chinese-only `README.zh-CN.md`, cross-linked at the top; both files ship in the release ZIP.

## [0.3.0] - 2026-07-25

### Added

- Add a configurable time prefix format, so the brackets around the time can be changed or removed. Prefix detection follows the configured format and still recognizes blocks written as `[HH:mm] `.

### Fixed

- Keep the caret behind the prefix when the browser applies the insertion itself. A Chinese IME commit or a paste in an empty journal block left the caret inside the prefix, for example `[12:|30] 今天天气`, because Chromium positions the caret from the target range captured before the prefix was inserted.

## [0.2.0] - 2026-07-24

### Added

- Add configurable heading-section exclusions.
- Add configurable block-tag exclusions.

### Fixed

- Refresh exclusion state when Logseq reuses the same textarea for a newly created block.
- Persist asynchronous live-editor corrections through a synthetic input event.
- Read ordered DB heading sections directly from Datascript, with sibling API fallback.
- Sort Logseq fractional block orders by raw code points instead of locale collation, which misplaced `b8Z` after lowercase orders and broke section detection.
- Resolve DB block tags from tag entity IDs after Logseq removes tag markup from the title.

## [0.1.0] - 2026-07-24

### Added

- Add a local `[HH:mm] ` prefix when content is first entered in a journal block.
- Limit automatic prefixes to top-level blocks directly under a journal page.
- Support ordinary keyboard input and Chinese IME composition.
- Use DB transaction handling as a fallback when live editor events are unavailable.
