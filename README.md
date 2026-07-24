# Journal Time Prefix

[中文](#中文) · [English](#english)

## 中文

一个仅适用于 **Logseq DB graph** 的轻量插件。开始填写 Journal 页面直属的一级 block 时，自动在正文前添加本地时间：

```text
[14:32] 今天完成了……
```

### 行为

- 仅支持 DB graph，不支持 file graph。
- 仅处理 Journal 页面直属的一级 block。
- 二级及更深层级的 block 不添加时间。
- 仅在空 block 第一次输入内容时添加时间。
- 支持普通键盘输入、粘贴和中文 IME 组合输入。
- 已有 `[HH:mm] ` 前缀时不会重复添加。
- 时间取自操作系统本地时区。
- 可按完整标题名排除 section：标题本身到下一个同级或更高级标题之间均不添加时间。
- 可按标签排除 block 及其子树。

### 排除规则

在插件设置中配置：

- `Excluded heading titles / 排除的标题`：每行一个完整标题，不含 `#`。匹配忽略大小写。
- `Excluded block tags / 排除的 block 标签`：每行一个标签，`#` 可写可不写；支持 `#tag` 与 `#[[tag name]]`。

两项留空时保持原有行为。插件仍然只处理 Journal page，不处理普通 page。

### 安装

#### 从 GitHub Release 安装

1. 打开 [Releases](https://github.com/Asaki14/logseq-journal-time-prefix/releases/latest)。
2. 下载 `logseq-journal-time-prefix-v*.zip`，不要下载 GitHub 自动生成的 `Source code` 压缩包。
3. 解压 ZIP。
4. 在 Logseq 中开启 Developer Mode。
5. 打开 `Plugins`，选择 `Load unpacked plugin`。
6. 选择解压后的 `logseq-journal-time-prefix` 文件夹。

更新时下载新版 Release ZIP，替换旧文件夹，然后在 Logseq 中 Reload 插件。

### 开发

要求 Node.js 20 或更高版本。

```bash
npm ci
npm run check
```

持续构建：

```bash
npm run dev
```

修改源码后执行 `npm run build`，然后在 Logseq 中 Reload 插件。

## English

A lightweight plugin for **Logseq DB graphs**. When you first enter content in a top-level block directly under a journal page, the plugin adds the current local time:

```text
[14:32] Finished today’s task…
```

### Behavior

- Supports DB graphs only; file graphs are not supported.
- Only prefixes top-level blocks directly under journal pages.
- Nested blocks at level 2 or deeper are ignored.
- Adds a prefix only when an empty block receives its first content.
- Supports regular keyboard input, paste, and Chinese IME composition.
- Never duplicates an existing `[HH:mm] ` prefix.
- Uses the operating system’s local time zone.
- Can exclude a section by its exact heading title, through the next heading of the same or higher level.
- Can exclude a tagged block and its subtree.

### Exclusion rules

Configure these fields in the plugin settings:

- `Excluded heading titles / 排除的标题`: one exact title per line, without `#`. Matching is case-insensitive.
- `Excluded block tags / 排除的 block 标签`: one tag per line, with or without `#`; both `#tag` and `#[[tag name]]` are supported.

Leave both fields empty to preserve the original behavior. The plugin still only processes journal pages, not regular pages.

### Installation

1. Open the [latest release](https://github.com/Asaki14/logseq-journal-time-prefix/releases/latest).
2. Download `logseq-journal-time-prefix-v*.zip`. Do not download GitHub’s automatically generated `Source code` archives.
3. Extract the ZIP.
4. Enable Developer Mode in Logseq.
5. Open `Plugins` and select `Load unpacked plugin`.
6. Select the extracted `logseq-journal-time-prefix` folder.

To update, replace the old folder with the folder from the latest release and reload the plugin in Logseq.

### Development

Node.js 20 or later is required.

```bash
npm ci
npm run check
```

## License

[MIT](LICENSE)
