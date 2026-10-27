<div align="center">
  <img src="https://raw.githubusercontent.com/Asaki14/logseq-journal-time-prefix/main/icon.svg" width="120" />
  <h1>Journal Time Prefix</h1>
  <p><b>开始写日志 block 时，自动加上本地时间。</b></p>
  <p><a href="README.md">English</a> · 中文</p>
  <a href="https://github.com/Asaki14/logseq-journal-time-prefix/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/Asaki14/logseq-journal-time-prefix/ci.yml?branch=main&style=flat-square&label=tests" alt="测试"></a>
  <a href="https://github.com/Asaki14/logseq-journal-time-prefix/stargazers"><img src="https://img.shields.io/github/stars/Asaki14/logseq-journal-time-prefix?style=flat-square" alt="Stars"></a>
  <a href="https://github.com/Asaki14/logseq-journal-time-prefix/tags"><img src="https://img.shields.io/github/v/tag/Asaki14/logseq-journal-time-prefix?label=version&style=flat-square" alt="版本"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="许可证"></a>
</div>

<br/>

<div align="center">
  <img src="https://raw.githubusercontent.com/Asaki14/logseq-journal-time-prefix/main/docs/demo.gif" alt="在日志 block 输入时自动添加时间前缀" />
</div>

## 功能

| 功能 | 适用场景 | 作用 |
| :--- | :--- | :--- |
| 输入时加时间 | 开始填写日志 block | 首次输入时给页面直属的一级 block 加上本地时间，支持粘贴和中文输入法。 |
| 前缀格式 | 想换一种显示样式 | 默认使用 `[{time}] `，可在设置中调整或去掉括号。 |
| 排除内容 | 某些标题或 block 不应加时间 | 可排除指定标题的 section、带标签的 block 及其子树、斜杠命令和代码围栏。 |

## 安装

在 Logseq 中打开 `Plugins` → `Marketplace`，搜索 `Journal Time Prefix` 并安装。0.3.1 及更早版本只在 block 提交后添加前缀；升级到 0.3.2 或更高版本即可输入时实时添加。

手动安装 Release：

1. 从[最新 Release](https://github.com/Asaki14/logseq-journal-time-prefix/releases/latest)下载 `logseq-journal-time-prefix-v*.zip`。不要下载 GitHub 自动生成的 `Source code` 压缩包。
2. 解压 ZIP，并在 Logseq 中开启 Developer Mode。
3. 打开 `Plugins` → `Load unpacked plugin`，选择解压出的 `logseq-journal-time-prefix` 文件夹。

手动安装后更新时，用最新 Release 中的文件夹替换旧文件夹，再重新加载插件。

## 使用与设置

打开日志页面，在页面直属的一级 block 中输入内容。首次输入时会出现时间前缀，光标停在前缀之后。插件不会改动嵌套 block 或普通页面。插件仅支持 DB graph；Logseq 仍可能允许在 file graph 上启用，此时插件会提示一次并保持不工作。

在时钟按钮弹出面板或 `Plugins` → `Journal Time Prefix` → `Settings` 中设置：

- `Time prefix format / 时间前缀格式`（`timePrefixFormat`，默认 `[{time}] `）：`{time}` 固定为 24 小时制 `HH:mm`。例如 `({time}) ` 会显示 `(14:32) `，`【{time}】` 会显示 `【14:32】`，`{time} ` 会显示不带括号的 `14:32 `。不含 `{time}` 的值会被忽略并回退到默认格式。
- `Excluded heading titles / 排除的标题`（`excludedHeadingTitles`，默认空）：每行一个完整标题，不含 `#`；匹配时忽略大小写。标题及其 section 会被排除，范围到下一个同级或更高级标题为止。
- `Excluded block tags / 排除的 block 标签`（`excludedTags`，默认空）：每行一个标签，`#` 可写可不写；支持 `#tag` 和 `#[[tag name]]`。带标签的 block 及其子树都会被排除。

插件会同时识别当前设置格式和内置的 `[HH:mm] ` 前缀，因此更改格式不会重复添加这种内置格式的前缀。自定义格式的前缀只会在对应格式仍被选中时识别，建议固定使用一种格式。不加括号时，手写的 `09:00 standup` 也会被当成已有前缀并跳过。

内容以 `/` 开头的 block 不会添加时间。斜杠命令执行后也不会补加前缀；需要时间时，请先输入一个字符，再打开命令菜单。以三个或更多反引号或波浪号开头的 Markdown 代码围栏 block 也会被排除。

时钟按钮会打开紧凑设置面板，显示下一个 block 将使用的前缀，并支持边改边生效。在顶栏插件弹出面板中可将按钮固定到顶栏。`Full settings / 完整设置` 会打开 Logseq 内置设置页，编辑的是同一组选项。插件没有命令或快捷键。

## 为什么

日志 block 显示记录时间后更容易浏览。手动输入时间会打断记录，也容易出现格式不一致。

Journal Time Prefix 在首次输入时添加时间，不改动嵌套 block 或普通页面。时间固定为本地 24 小时制 `HH:mm`，括号样式和排除项可以配置。

## 参与贡献

贡献流程见 [CONTRIBUTING.md](CONTRIBUTING.md)。用户可见的改动请记录在 [CHANGELOG.md](CHANGELOG.md) 的 `Unreleased` 下；Agent 说明见 [AGENTS.md](AGENTS.md)。

## 许可证

[MIT](LICENSE)
