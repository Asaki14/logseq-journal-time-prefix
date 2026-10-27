<div align="center">
  <img src="https://raw.githubusercontent.com/Asaki14/logseq-journal-time-prefix/main/icon.svg" width="120" />
  <h1>Journal Time Prefix</h1>
  <p><b>Add your local time as you start a journal block.</b></p>
  <p>English · <a href="README_CN.md">中文</a></p>
  <a href="https://github.com/Asaki14/logseq-journal-time-prefix/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/Asaki14/logseq-journal-time-prefix/ci.yml?branch=main&style=flat-square&label=tests" alt="Tests"></a>
  <a href="https://github.com/Asaki14/logseq-journal-time-prefix/stargazers"><img src="https://img.shields.io/github/stars/Asaki14/logseq-journal-time-prefix?style=flat-square" alt="Stars"></a>
  <a href="https://github.com/Asaki14/logseq-journal-time-prefix/tags"><img src="https://img.shields.io/github/v/tag/Asaki14/logseq-journal-time-prefix?label=version&style=flat-square" alt="Version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="License"></a>
</div>

<br/>

<div align="center">
  <img src="https://raw.githubusercontent.com/Asaki14/logseq-journal-time-prefix/main/docs/demo.gif" alt="Typing in a journal block adds a time prefix" />
</div>

## Features

| Feature | When | What it does |
|:--- |:--- |:--- |
| Live timestamp | You start a journal block | Adds the current local time to the first top-level block input, including paste and Chinese IME input. |
| Prefix format | You want another style | Uses `[{time}] ` by default; change or remove the brackets in settings. |
| Exclusions | A section or block should stay untouched | Skip an exact heading section, a tagged block and its subtree, slash commands, and fenced code blocks. |

## Install

In Logseq, open `Plugins` → `Marketplace`, search for `Journal Time Prefix`, and install it. Versions through 0.3.1 added the prefix only after a block was committed; update to 0.3.2 or later for live typing.

To install a release manually:

1. Download `logseq-journal-time-prefix-v*.zip` from the [latest release](https://github.com/Asaki14/logseq-journal-time-prefix/releases/latest). Do not use GitHub's automatically generated `Source code` archives.
2. Extract the ZIP and enable Developer Mode in Logseq.
3. Open `Plugins` → `Load unpacked plugin` and select the extracted `logseq-journal-time-prefix` folder.

To update a manual install, replace the old folder with the latest release folder and reload the plugin.

## Usage and settings

Open a journal page and type in a top-level block directly under the page. The prefix appears with your first input, and the caret stays after it. Nested blocks and regular pages are not changed. This plugin supports DB graphs only. Logseq may still enable it on a file graph; it warns once and remains inactive.

Configure these settings in the clock-button popover or under `Plugins` → `Journal Time Prefix` → `Settings`:

- `Time prefix format / 时间前缀格式` (`timePrefixFormat`, default `[{time}] `): `{time}` is fixed to 24-hour `HH:mm`. For example, `({time}) ` gives `(14:32) `, `【{time}】` gives `【14:32】`, and `{time} ` gives `14:32 ` without brackets. A value without `{time}` is ignored and the default is used.
- `Excluded heading titles / 排除的标题` (`excludedHeadingTitles`, default empty): one exact title per line, without `#`; matching is case-insensitive. The heading and its section are excluded through the next heading of the same or higher level.
- `Excluded block tags / 排除的 block 标签` (`excludedTags`, default empty): one tag per line, with or without `#`; supports `#tag` and `#[[tag name]]`. The tagged block and its subtree are excluded.

The plugin always recognizes the built-in `[HH:mm] ` prefix as well as the configured format, so changing formats will not duplicate that built-in form. Custom-format prefixes are recognized only while that format is configured, so keep one format selected. Without brackets, a hand-written value such as `09:00 standup` is treated as an existing prefix and skipped.

A block whose content starts with `/` never gets a prefix. The plugin does not add one after the command runs, so type a character before opening the slash-command menu if that block needs a timestamp. A block starting with a Markdown fence of three or more backticks or tildes is also excluded.

The clock button opens a compact popover with a preview of the next prefix and edits that apply as you type. Use the toolbar plugins popover to pin the button. `Full settings / 完整设置` opens Logseq's built-in settings for the same options. The plugin has no commands or keybindings.

## Why

Logseq journal entries are easier to scan when each top-level block shows when it was written. Adding the time by hand interrupts writing and makes timestamps inconsistent.

Journal Time Prefix adds the time at the first input, without changing nested blocks or regular pages. The time format stays fixed at local 24-hour `HH:mm`; brackets and exclusions are configurable.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution workflow. User-visible changes belong under `Unreleased` in [CHANGELOG.md](CHANGELOG.md); agent notes are in [AGENTS.md](AGENTS.md).

## License

[MIT](LICENSE)
