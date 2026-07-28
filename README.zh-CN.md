# Journal Time Prefix

[English](README.md)

一个仅适用于 **Logseq DB graph** 的轻量插件。开始填写 Journal 页面直属的一级 block 时，自动在正文前添加本地时间：

```text
[14:32] 今天完成了……
```

![在 Journal 页面输入时自动加上时间前缀，最后一条使用自定义格式 `({time}) `](https://raw.githubusercontent.com/Asaki14/logseq-journal-time-prefix/main/docs/demo.gif)

## 行为

- 仅支持 DB graph。在 file graph 上 Logseq 仍允许启用本插件，此时插件只提示一次并保持不生效。
- 仅处理 Journal 页面直属的一级 block。
- 二级及更深层级的 block 不添加时间。
- 仅在空 block 第一次输入内容时添加时间。
- 支持普通键盘输入、粘贴和中文 IME 组合输入。
- 已有前缀时不会重复添加。
- 时间取自操作系统本地时区。
- 时间两侧的括号可自定义，也可以完全去掉。
- 可按完整标题名排除 section：标题本身到下一个同级或更高级标题之间均不添加时间。
- 可按标签排除 block 及其子树。

## 前缀格式

在插件设置中配置 `Time prefix format / 时间前缀格式`：

- `{time}` 代表 24 小时制 `HH:mm`，时间格式本身不可改。
- 默认 `[{time}] `，即 `[14:32] `。
- 其他写法：`({time}) ` → `(14:32) `；`【{time}】` → `【14:32】`；`{time} ` → `14:32 `（不加括号）。
- 不含 `{time}` 的取值会被忽略，回退到默认格式。

识别规则随设置变化，同时始终识别默认的 `[HH:mm] ` 前缀，因此改格式不会给已有 block 再加一个前缀。反之，自定义格式写下的旧 block 只在该格式仍生效时才被识别，建议选定一种格式后不要频繁更换。

不加括号时无法区分插件写入的 `14:32 ` 和你手写的 `09:00 开会`：这类 block 会被当作已有前缀而跳过，不会重复加时间。

## 排除规则

在插件设置中配置：

- `Excluded heading titles / 排除的标题`：每行一个完整标题，不含 `#`。匹配忽略大小写。
- `Excluded block tags / 排除的 block 标签`：每行一个标签，`#` 可写可不写；支持 `#tag` 与 `#[[tag name]]`。

两项留空时保持原有行为。插件仍然只处理 Journal page，不处理普通 page。

还有一条无需配置的排除规则：以 `/` 开头的 block 不加时间前缀，Logseq 的斜杠命令菜单因此可以正常使用。命令执行后也不会补加前缀——需要时间戳时，先输入一个字符再打开命令菜单。

## 右侧栏面板

打开右侧栏，点击顶栏的拼图按钮，选择 `Journal Time Prefix`。面板显示：

- `Status`：插件是否已在 Journal page 上生效、仍在等待图谱加载，还是因为当前图谱不是 DB 图谱而未启用。
- `Prefix format`：当前生效的格式；配置值不可用时显示回退到的默认格式。
- `Next prefix`：下一个 block 将得到的前缀。

面板中的 `Open settings` 打开插件设置，在那里编辑格式与两个排除列表。设置变更后面板立即刷新。

Logseq 2.0.1 的侧栏条目标题显示的是渲染器原始 key（`:logseq-journal-time-prefix/_sidebar.status`），而不是注册的标题。这属于宿主端的标签问题，不影响面板内容。

## 安装

### 从 Logseq 插件市场安装

打开 `Plugins` → `Marketplace`，搜索 `Journal Time Prefix` 并安装。0.3.1 及更早版本以这种方式安装时只在 block 提交后才补上前缀，请升级到 0.3.2 或更高版本以恢复输入时即时加前缀。

### 从 GitHub Release 安装

1. 打开 [Releases](https://github.com/Asaki14/logseq-journal-time-prefix/releases/latest)。
2. 下载 `logseq-journal-time-prefix-v*.zip`，不要下载 GitHub 自动生成的 `Source code` 压缩包。
3. 解压 ZIP。
4. 在 Logseq 中开启 Developer Mode。
5. 打开 `Plugins`，选择 `Load unpacked plugin`。
6. 选择解压后的 `logseq-journal-time-prefix` 文件夹。

更新时下载新版 Release ZIP，替换旧文件夹，然后在 Logseq 中 Reload 插件。

## 使用

1. 打开今天的 Journal 页面。
2. 在 Journal 直属的一级 block 里输入第一个字符，时间前缀自动出现，光标停在前缀之后，继续输入即可。
3. 需要改前缀样式或排除某些内容时，在 `Plugins` → `Journal Time Prefix` → `Settings` 里调整上面几项设置。

插件没有命令和快捷键，安装后即生效。

## 开发

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

## License

[MIT](LICENSE)
