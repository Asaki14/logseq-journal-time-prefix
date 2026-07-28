# Journal Time Prefix

[中文](README.zh-CN.md)

A lightweight plugin for **Logseq DB graphs**. When you first enter content in a top-level block directly under a journal page, the plugin adds the current local time:

```text
[14:32] Finished today’s task…
```

![Typing in a journal page adds the time prefix; the last block uses the custom format `({time}) `](https://raw.githubusercontent.com/Asaki14/logseq-journal-time-prefix/main/docs/demo.gif)

## Behavior

- Supports DB graphs only. Logseq still lets you enable it on a file graph, where the plugin warns once and stays inactive.
- Only prefixes top-level blocks directly under journal pages.
- Nested blocks at level 2 or deeper are ignored.
- Adds a prefix only when an empty block receives its first content.
- Supports regular keyboard input, paste, and Chinese IME composition.
- Never duplicates an existing prefix.
- Uses the operating system’s local time zone.
- The brackets around the time are configurable and can be removed entirely.
- Can exclude a section by its exact heading title, through the next heading of the same or higher level.
- Can exclude a tagged block and its subtree.

## Prefix format

Configure `Time prefix format / 时间前缀格式` in the plugin settings:

- `{time}` stands for the 24-hour `HH:mm` time; the time format itself is fixed.
- The default is `[{time}] `, which produces `[14:32] `.
- Other examples: `({time}) ` → `(14:32) `; `【{time}】` → `【14:32】`; `{time} ` → `14:32 ` (no brackets).
- A value without `{time}` is ignored and the default format is used.

Detection follows the configured format and always also recognizes the built-in `[HH:mm] ` prefix, so changing the format never adds a second prefix to existing blocks. The reverse is not true: blocks written with a custom format are only recognized while that format is configured, so pick one format and keep it.

Without brackets the plugin cannot tell its own `14:32 ` apart from a hand-written `09:00 standup`. Such blocks count as already prefixed and are skipped, so no duplicate time is added.

## Exclusion rules

Configure these fields in the plugin settings:

- `Excluded heading titles / 排除的标题`: one exact title per line, without `#`. Matching is case-insensitive.
- `Excluded block tags / 排除的 block 标签`: one tag per line, with or without `#`; both `#tag` and `#[[tag name]]` are supported.

Leave both fields empty to preserve the original behavior. The plugin still only processes journal pages, not regular pages.

One exclusion needs no configuration: a block whose content starts with `/` never gets a prefix, so Logseq's slash-command menu keeps working. The prefix is not added back after the command runs — type a character before opening the menu if that block should carry a timestamp.

## Toolbar button

The plugin contributes a clock button to the toolbar's plugin area, next to Logseq's own settings button. Clicking it opens the plugin settings, where the format and both exclusion lists are edited.

Logseq collects plugin buttons in the toolbar plugins popover, so open that popover and pin `Journal Time Prefix` to keep the button on the toolbar itself.

## Installation

### From the Logseq marketplace

Open `Plugins` → `Marketplace`, search for `Journal Time Prefix` and install it. Versions up to 0.3.1 added the prefix only after a block was committed when installed this way; update to 0.3.2 or later to get the prefix while typing.

### From a GitHub release

1. Open the [latest release](https://github.com/Asaki14/logseq-journal-time-prefix/releases/latest).
2. Download `logseq-journal-time-prefix-v*.zip`. Do not download GitHub’s automatically generated `Source code` archives.
3. Extract the ZIP.
4. Enable Developer Mode in Logseq.
5. Open `Plugins` and select `Load unpacked plugin`.
6. Select the extracted `logseq-journal-time-prefix` folder.

To update, replace the old folder with the folder from the latest release and reload the plugin in Logseq.

## Usage

1. Open today’s journal page.
2. Type the first character in a top-level block directly under the journal. The time prefix appears and the caret stays behind it, so you can keep typing.
3. To change the prefix style or exclude some content, adjust the settings above under `Plugins` → `Journal Time Prefix` → `Settings`.

The plugin has no commands or keybindings; it works as soon as it is installed.

## Development

Node.js 20 or later is required.

```bash
npm ci
npm run check
```

Continuous build:

```bash
npm run dev
```

After changing the sources run `npm run build`, then reload the plugin in Logseq.

## License

[MIT](LICENSE)
