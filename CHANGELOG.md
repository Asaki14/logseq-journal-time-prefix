# Changelog

All notable changes to this project are documented here.

## [0.1.0] - 2026-07-24

### Added

- Add a local `[HH:mm] ` prefix when content is first entered in a journal block.
- Limit automatic prefixes to top-level blocks directly under a journal page.
- Support ordinary keyboard input and Chinese IME composition.
- Use DB transaction handling as a fallback when live editor events are unavailable.
