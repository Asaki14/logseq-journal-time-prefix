import '@logseq/libs'
import type {
  BlockEntity,
  PageEntity,
  SettingSchemaDesc,
} from '@logseq/libs/dist/LSPlugin'
import type {
  EditorExclusionContext,
  ExclusionSettings,
  GraphSupport,
} from './time-prefix'
import type { PanelFieldKey, SettingsPanel } from './settings-panel'
import {
  PANEL_OPEN_CLASS,
  PANEL_ROOT_ID,
  PANEL_STYLE,
  panelPlacement,
  panelValuesFromSettings,
  renderSettingsPanel,
} from './settings-panel'
import {
  caretAfterPrefixInsertion,
  changedFromEmpty,
  classifyGraphSupport,
  compareBlockOrder,
  DEFAULT_TIME_PREFIX_FORMAT,
  formatTimePrefix,
  getHeading,
  hasTimePrefix,
  headingTitleIsExcluded,
  isContentInsertion,
  isInExcludedHeadingSection,
  isJournalPage,
  isTopLevelBlock,
  matchTimePrefix,
  normalizeTag,
  parseListSetting,
  resolveLivePrefixAction,
  setTimePrefixFormat,
  titleHasExcludedTag,
  titleIsExcluded,
  titleIsSlashCommand,
} from './time-prefix'

const settingsSchema: SettingSchemaDesc[] = [
  {
    key: 'timePrefixFormat',
    type: 'string',
    default: DEFAULT_TIME_PREFIX_FORMAT,
    title: 'Time prefix format / 时间前缀格式',
    description:
      '`{time}` stands for the 24-hour `HH:mm` time. Examples: `[{time}] `, `({time}) `, `【{time}】`, or `{time} ` for no brackets. Blocks already written as `[HH:mm] ` stay recognized. / `{time}` 代表 24 小时制 `HH:mm`。例如 `[{time}] `、`({time}) `、`【{time}】`，或 `{time} ` 表示不加括号。已写成 `[HH:mm] ` 的 block 仍会被识别。',
  },
  {
    key: 'excludedHeadingTitles',
    type: 'string',
    default: '',
    title: 'Excluded heading titles / 排除的标题',
    description:
      'One exact title per line. The heading and its section, up to the next heading of the same or higher level, will not receive timestamps. / 每行一个完整标题；该标题至下一个同级或更高级标题之间不加时间戳。',
    inputAs: 'textarea',
  },
  {
    key: 'excludedTags',
    type: 'string',
    default: '',
    title: 'Excluded block tags / 排除的 block 标签',
    description:
      'One tag per line, with or without #. A block carrying the tag and its subtree will not receive timestamps. / 每行一个标签，可省略 #；带此标签的 block 及其子树不加时间戳。',
    inputAs: 'textarea',
  },
]

logseq.useSettingsSchema(settingsSchema)

interface EditorContext extends EditorExclusionContext {
  blockUuid: string
}

// Logseq answers the DB-graph question from the loaded graph, so the wait covers
// the graph load rather than a fixed startup delay.
const GRAPH_WAIT_INTERVAL_MS = 500
const GRAPH_WAIT_ATTEMPTS = 60

let started = false
let startupPending = false
let warnedUnsupported = false

const processingBlocks = new Set<string>()
const journalPageCache = new Map<number, boolean>()
const journalEditors = new WeakMap<HTMLTextAreaElement, EditorContext>()
const syntheticEditorUpdates = new WeakSet<HTMLTextAreaElement>()
const commandedEditors = new WeakSet<HTMLTextAreaElement>()
const pendingCaretRepairs = new WeakMap<
  HTMLTextAreaElement,
  { prefixLength: number; valueLength: number }
>()

function applyTimePrefixFormat(): void {
  setTimePrefixFormat(logseq.settings?.timePrefixFormat)
}

function getSettings(): ExclusionSettings {
  return {
    excludedHeadingTitles: parseListSetting(
      logseq.settings?.excludedHeadingTitles,
    ),
    excludedTags: parseListSetting(logseq.settings?.excludedTags),
  }
}

// Reaching the host document needs the plugin iframe to be same-origin with the
// host page, which Logseq only does for a plugin declaring root-level
// `"effect": true` in its package.json. Without it an installed plugin is served
// from `lsp://logseq.io` and this throws a SecurityError.
function getHostDocument(): Document | null {
  try {
    return window.parent.document
  } catch (error) {
    console.error(
      '[journal-time-prefix] Cannot reach the Logseq host document, so live-editor prefixing is disabled and only the committed-block fallback runs. Expected `"effect": true` at the root of the plugin package.json.',
      error,
    )
    return null
  }
}

function getTextarea(target: EventTarget | null): HTMLTextAreaElement | null {
  if (!target || !('nodeType' in target)) return null
  const element = target as HTMLElement
  return element.tagName === 'TEXTAREA'
    ? (element as HTMLTextAreaElement)
    : null
}

async function blockIsOnJournal(block: BlockEntity): Promise<boolean> {
  const pageId = block.page?.id
  if (!pageId) return false

  const cached = journalPageCache.get(pageId)
  if (cached !== undefined) return cached

  const page = (await logseq.Editor.getPage(pageId)) as PageEntity | null
  const result = isJournalPage(page)
  journalPageCache.set(pageId, result)
  return result
}

function blockTagIds(block: BlockEntity): Set<number> {
  const tags = (block as Record<string, unknown>).tags
  if (!Array.isArray(tags)) return new Set()

  return new Set(
    tags.flatMap((tag) => {
      if (typeof tag === 'number') return [tag]
      if (tag && typeof tag === 'object' && 'id' in tag) {
        const id = (tag as { id?: unknown }).id
        return typeof id === 'number' ? [id] : []
      }
      return []
    }),
  )
}

async function blockHasExcludedTag(
  block: BlockEntity,
  excludedTags: string[],
): Promise<boolean> {
  if (titleHasExcludedTag(block.title, excludedTags)) return true

  const tagIds = blockTagIds(block)
  if (tagIds.size === 0) return false

  for (const configuredTag of excludedTags) {
    const tagName = normalizeTag(configuredTag)
    if (!tagName) continue
    const tagPage = await logseq.Editor.getPage(tagName)
    if (tagPage && tagIds.has(tagPage.id)) return true
  }
  return false
}

async function getSiblingBlocksFromDb(
  block: BlockEntity,
): Promise<BlockEntity[] | null> {
  const parentId = block.parent?.id
  if (!parentId) return null

  try {
    const rows = (await logseq.DB.datascriptQuery(`
      [:find ?uuid ?title ?order ?heading
       :where
       [?b :block/parent ${parentId}]
       [?b :block/uuid ?uuid]
       [?b :block/title ?title]
       [?b :block/order ?order]
       [(get-else $ ?b :logseq.property/heading 0) ?heading]]
    `)) as Array<[string, string, string, number]> | null

    if (!rows) return null
    return rows
      .map(([uuid, title, order, heading]) => ({
        uuid,
        title,
        order,
        heading,
      } as unknown as BlockEntity))
      .sort(compareBlockOrder)
  } catch (error) {
    console.warn('[journal-time-prefix] Failed to query sibling blocks', error)
    return null
  }
}

async function blockIsInExcludedHeadingSection(
  block: BlockEntity,
  excludedHeadingTitles: string[],
): Promise<boolean> {
  if (excludedHeadingTitles.length === 0) return false

  const currentHeading = getHeading(block)
  if (
    currentHeading &&
    headingTitleIsExcluded(currentHeading.title, excludedHeadingTitles)
  ) {
    return true
  }

  const siblingBlocks = await getSiblingBlocksFromDb(block)
  if (siblingBlocks?.some((sibling) => sibling.uuid === block.uuid)) {
    return isInExcludedHeadingSection(
      siblingBlocks,
      block.uuid,
      excludedHeadingTitles,
    )
  }

  // Fall back to the editor sibling API if the direct DB query is unavailable.
  let enclosingLevel = 7
  let previous = await logseq.Editor.getPreviousSiblingBlock(block.uuid)
  const visited = new Set<string>()

  while (previous && !visited.has(previous.uuid)) {
    visited.add(previous.uuid)
    const heading = getHeading(previous)
    if (heading && heading.level < enclosingLevel) {
      if (headingTitleIsExcluded(heading.title, excludedHeadingTitles)) {
        return true
      }
      enclosingLevel = heading.level
      if (enclosingLevel === 1) return false
    }
    previous = await logseq.Editor.getPreviousSiblingBlock(previous.uuid)
  }

  return false
}

async function blockIsExcluded(
  block: BlockEntity,
  settings = getSettings(),
): Promise<boolean> {
  if (titleIsSlashCommand(block.title)) return true

  const excludedByTag = await blockHasExcludedTag(
    block,
    settings.excludedTags,
  )
  const excludedBySection = await blockIsInExcludedHeadingSection(
    block,
    settings.excludedHeadingTitles,
  )
  return excludedByTag || excludedBySection
}

async function addPrefix(blockUuid: string): Promise<void> {
  const latest = await logseq.Editor.getBlock(blockUuid)
  if (
    !latest?.title ||
    hasTimePrefix(latest.title) ||
    (await blockIsExcluded(latest))
  ) {
    return
  }

  // Never call editBlock while the user is typing. It replaces the live editor
  // state and can swallow subsequent keystrokes. The input listener owns this
  // case; DB.onChanged remains a fallback after the editor has been committed.
  if ((await logseq.Editor.checkEditing()) === blockUuid) return

  const current = await logseq.Editor.getBlock(blockUuid)
  if (
    current?.title &&
    !hasTimePrefix(current.title) &&
    !(await blockIsExcluded(current))
  ) {
    await logseq.Editor.updateBlock(
      blockUuid,
      `${formatTimePrefix(new Date())}${current.title}`,
    )
  }
}

async function handleBlock(block: BlockEntity): Promise<void> {
  if (processingBlocks.has(block.uuid)) return

  processingBlocks.add(block.uuid)
  try {
    if (!isTopLevelBlock(block) || !(await blockIsOnJournal(block))) return
    await addPrefix(block.uuid)
  } catch (error) {
    console.error('[journal-time-prefix] Failed to prefix block', error)
  } finally {
    processingBlocks.delete(block.uuid)
  }
}

async function createEditorContext(
  block: BlockEntity,
): Promise<EditorContext> {
  const settings = getSettings()
  const heading = getHeading(block)
  const [excludedBySection, excludedByTag] = await Promise.all([
    blockIsInExcludedHeadingSection(block, settings.excludedHeadingTitles),
    blockHasExcludedTag(block, settings.excludedTags),
  ])

  return {
    blockUuid: block.uuid,
    headingLevel: heading?.level ?? null,
    excludedBySection,
    excludedByTag,
  }
}

async function rememberJournalEditor(
  target: EventTarget | null,
): Promise<void> {
  const textarea = getTextarea(target)
  if (!textarea) return

  // A textarea node can be reused after navigation. Remove its previous page
  // classification before resolving the currently edited block.
  journalEditors.delete(textarea)

  const editingBlock = await logseq.Editor.checkEditing()
  if (typeof editingBlock !== 'string') return

  const block = await logseq.Editor.getBlock(editingBlock)
  if (
    !block ||
    !isTopLevelBlock(block) ||
    !(await blockIsOnJournal(block))
  ) {
    return
  }

  const context = await createEditorContext(block)
  const stillEditing = await logseq.Editor.checkEditing()
  if (
    stillEditing === editingBlock &&
    textarea.isConnected &&
    textarea.ownerDocument.activeElement === textarea
  ) {
    journalEditors.set(textarea, context)
  }
}

function removeLivePrefix(textarea: HTMLTextAreaElement): boolean {
  const prefix = matchTimePrefix(textarea.value)
  if (!prefix) return false
  textarea.setRangeText('', 0, prefix.length, 'preserve')
  return true
}

function prefixLiveEditor(
  target: EventTarget | null,
  requireContent: boolean,
  pendingInsertion = '',
): boolean {
  const textarea = getTextarea(target)
  const context = textarea ? journalEditors.get(textarea) : undefined
  if (!textarea || !context) return false

  const action = resolveLivePrefixAction({
    value: textarea.value,
    pendingInsertion,
    requireContent,
    context,
    settings: getSettings(),
  })

  if (action === 'refresh') commandedEditors.add(textarea)
  if (action === 'refresh' || action === 'strip') return removeLivePrefix(textarea)
  if (action === 'none') return false

  // Runs during capture, before Logseq handles the same editing event. Updating
  // the live textarea here lets Logseq persist one coherent value and avoids
  // re-entering/repositioning the editor through async plugin APIs. Before an
  // ordinary character is inserted, move the caret behind the prefix; keeping
  // it at position 0 would produce `character[prefix]` and trigger a duplicate.
  const prefix = formatTimePrefix(new Date())
  textarea.setRangeText(prefix, 0, 0, requireContent ? 'preserve' : 'end')

  if (!requireContent) {
    // The browser still has to apply the insertion this event announced, and it
    // may place the caret as if the prefix were not there. Let the following
    // input event verify where the caret actually landed.
    pendingCaretRepairs.set(textarea, {
      prefixLength: prefix.length,
      valueLength: textarea.value.length,
    })
  }

  // This prefix was decided from the exclusion answer resolved before the slash
  // command ran, and a command can turn the block into an excluded shape — `/TODO`
  // makes it a task node tagged `Task`. Confirm it against the block Logseq has
  // now, once the command's own transaction has landed.
  if (commandedEditors.delete(textarea)) void revalidateAfterCommand(textarea)
  return true
}

async function revalidateAfterCommand(
  textarea: HTMLTextAreaElement,
): Promise<void> {
  const context = journalEditors.get(textarea)
  if (!context) return

  const block = await logseq.Editor.getBlock(context.blockUuid)
  if (!block || journalEditors.get(textarea) !== context) return

  const refreshed = await createEditorContext(block)
  if (journalEditors.get(textarea) !== context || !textarea.isConnected) return
  journalEditors.set(textarea, refreshed)

  if (!titleIsExcluded(textarea.value, refreshed, getSettings())) return
  // The original input event has already reached Logseq, so the removal needs
  // its own event to be persisted.
  if (removeLivePrefix(textarea)) dispatchSyntheticEditorInput(textarea)
}

function repairPrefixCaret(textarea: HTMLTextAreaElement): void {
  const pending = pendingCaretRepairs.get(textarea)
  if (!pending) return
  pendingCaretRepairs.delete(textarea)

  if (
    textarea.selectionStart !== textarea.selectionEnd ||
    !hasTimePrefix(textarea.value)
  ) {
    return
  }

  const caret = caretAfterPrefixInsertion(
    textarea.value,
    textarea.selectionStart,
    pending.prefixLength,
    pending.valueLength,
  )
  if (caret !== null) textarea.setSelectionRange(caret, caret)
}

function dispatchSyntheticEditorInput(textarea: HTMLTextAreaElement): void {
  const InputEventConstructor = textarea.ownerDocument.defaultView?.InputEvent
  if (!InputEventConstructor) return
  syntheticEditorUpdates.add(textarea)
  textarea.dispatchEvent(
    new InputEventConstructor('input', {
      bubbles: true,
      inputType: 'insertText',
    }),
  )
}

async function recoverEditorContext(
  textarea: HTMLTextAreaElement,
): Promise<void> {
  await rememberJournalEditor(textarea)
  if (
    !textarea.isConnected ||
    textarea.ownerDocument.activeElement !== textarea
  ) {
    return
  }

  if (prefixLiveEditor(textarea, true)) {
    // The original input event has already reached Logseq while the async
    // context was loading. Emit one synthetic event so the corrected textarea
    // value (especially a removed stale prefix) is persisted.
    dispatchSyntheticEditorInput(textarea)
  }
}

function onEditorStructureKeydown(event: KeyboardEvent): void {
  if (!['Enter', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
  const textarea = getTextarea(event.target)
  if (!textarea) return

  // Logseq reuses one textarea when Enter creates the next block. focusin does
  // not fire, so retaining the old block's section classification causes the
  // first character in the new block to use stale exclusion rules.
  journalEditors.delete(textarea)
  window.setTimeout(() => {
    void recoverEditorContext(textarea)
  }, 0)
}

function onBeforeEditorInput(event: Event): void {
  const inputType = 'inputType' in event ? event.inputType : undefined
  const isComposing =
    ('isComposing' in event && event.isComposing === true) ||
    inputType === 'insertCompositionText'
  if (isComposing || !isContentInsertion(inputType)) return

  // Ordinary keyboard input can receive its prefix before the character is
  // inserted. IME input must wait until compositionend to avoid placing the
  // prefix inside the active composition range.
  const data = 'data' in event && typeof event.data === 'string' ? event.data : ''
  prefixLiveEditor(event.target, false, data)
}

function onEditorInput(event: Event): void {
  const textarea = getTextarea(event.target)
  if (!textarea) return

  repairPrefixCaret(textarea)
  if ('isComposing' in event && event.isComposing === true) return
  if (syntheticEditorUpdates.delete(textarea)) return

  prefixLiveEditor(textarea, true)
  if (!journalEditors.has(textarea)) {
    void recoverEditorContext(textarea)
  }
}

function onCompositionEnd(event: Event): void {
  // Prefix only after the user commits the IME candidate. The following input
  // event sees the existing prefix and therefore cannot add a duplicate.
  prefixLiveEditor(event.target, true)
}

function onEditorFocus(event: FocusEvent): void {
  void rememberJournalEditor(event.target)
}

async function start(): Promise<void> {
  applyTimePrefixFormat()

  logseq.DB.onChanged(({ blocks, txData }) => {
    for (const block of blocks) {
      if (changedFromEmpty(block, txData)) {
        void handleBlock(block)
      }
    }
  })

  const hostDocument = getHostDocument()
  if (!hostDocument) {
    // The fallback above is already wired up, so prefixes still appear once a
    // block is committed. Say so instead of degrading silently, as v0.3.1 did.
    await logseq.UI.showMsg(
      'Journal Time Prefix: live typing support is unavailable, so a prefix only appears after a block is committed. Install the latest release to restore it.',
      'warning',
    )
    return
  }

  provideSettingsPanelUI()

  hostDocument.addEventListener('focusin', onEditorFocus, true)
  hostDocument.addEventListener('keydown', onEditorStructureKeydown, true)
  hostDocument.addEventListener('beforeinput', onBeforeEditorInput, true)
  hostDocument.addEventListener('input', onEditorInput, true)
  hostDocument.addEventListener('compositionend', onCompositionEnd, true)
  void rememberJournalEditor(hostDocument.activeElement)

  const removeSettingsListener = logseq.onSettingsChanged(() => {
    applyTimePrefixFormat()
    settingsPanel?.sync(panelValuesFromSettings(logseq.settings))
    void rememberJournalEditor(hostDocument.activeElement)
  })

  logseq.beforeunload(async () => {
    closeSettingsPanel()
    hostDocument.removeEventListener('focusin', onEditorFocus, true)
    hostDocument.removeEventListener('keydown', onEditorStructureKeydown, true)
    hostDocument.removeEventListener('beforeinput', onBeforeEditorInput, true)
    hostDocument.removeEventListener('input', onEditorInput, true)
    hostDocument.removeEventListener('compositionend', onCompositionEnd, true)
    removeSettingsListener()
  })

  console.info('[journal-time-prefix] Ready')
}

const SETTINGS_WRITE_DELAY_MS = 300
const TOOLBAR_ANCHOR_SELECTOR = '[data-on-click="openTimePrefixSettings"]'
const PANEL_MOUNT_ATTEMPTS = 20
const PANEL_MOUNT_INTERVAL_MS = 50

let settingsPanel: SettingsPanel | null = null
let settingsPanelIsOpen = false
const pendingSettingWrites = new Map<PanelFieldKey, string>()
let settingWriteTimer = 0

function flushSettingWrites(): void {
  window.clearTimeout(settingWriteTimer)
  if (pendingSettingWrites.size === 0) return
  const patch = Object.fromEntries(pendingSettingWrites)
  pendingSettingWrites.clear()
  logseq.updateSettings(patch)
}

// Typing in the panel writes through to the same settings the schema declares,
// so the edit takes effect live. Debounced to keep one keystroke from becoming
// one settings write.
function queueSettingWrite(key: PanelFieldKey, value: string): void {
  pendingSettingWrites.set(key, value)
  window.clearTimeout(settingWriteTimer)
  settingWriteTimer = window.setTimeout(
    flushSettingWrites,
    SETTINGS_WRITE_DELAY_MS,
  )
}

// Host-document nodes come from the parent realm, where `instanceof Node` is
// false, so membership is checked structurally.
function eventElement(target: EventTarget | null): Element | null {
  if (!target || !('nodeType' in target)) return null
  const node = target as Node
  return node.nodeType === 1 ? (node as Element) : node.parentElement
}

function onPanelOutsidePointerDown(event: Event): void {
  const root = settingsPanel?.root
  const element = eventElement(event.target)
  if (!root || !element || root.contains(element)) return
  // The toolbar button toggles the panel itself. Closing on its pointerdown
  // would let the following click reopen it and look like nothing happened.
  if (element.closest(TOOLBAR_ANCHOR_SELECTOR)) return
  closeSettingsPanel()
}

function onPanelKeydown(event: Event): void {
  if ((event as KeyboardEvent).key !== 'Escape') return
  event.stopPropagation()
  closeSettingsPanel()
}

function closeSettingsPanel(): void {
  const root = settingsPanel?.root
  if (!settingsPanelIsOpen || !root) return
  settingsPanelIsOpen = false
  root.classList.remove(PANEL_OPEN_CLASS)
  root.ownerDocument.removeEventListener(
    'pointerdown',
    onPanelOutsidePointerDown,
    true,
  )
  root.ownerDocument.removeEventListener('keydown', onPanelKeydown, true)
  flushSettingWrites()
}

// The host mounts injected UI asynchronously over the plugin bridge, so the
// container is looked up rather than assumed present.
async function resolvePanelRoot(
  hostDocument: Document,
): Promise<HTMLElement | null> {
  for (let attempt = 0; attempt < PANEL_MOUNT_ATTEMPTS; attempt += 1) {
    const root = hostDocument.getElementById(PANEL_ROOT_ID)
    if (root) return root
    await new Promise((resolve) =>
      window.setTimeout(resolve, PANEL_MOUNT_INTERVAL_MS),
    )
  }
  return null
}

function provideSettingsPanelUI(): void {
  logseq.provideStyle({ key: 'journal-time-prefix-panel', style: PANEL_STYLE })
  // Only the empty container is host-rendered markup; the controls are built and
  // wired from here, which the same-origin host document already allows.
  logseq.provideUI({
    key: 'journal-time-prefix-panel',
    path: 'body',
    template: `<div id="${PANEL_ROOT_ID}"></div>`,
  })
}

async function ensureSettingsPanel(): Promise<SettingsPanel | null> {
  if (settingsPanel) return settingsPanel

  const hostDocument = getHostDocument()
  if (!hostDocument) return null

  const root = await resolvePanelRoot(hostDocument)
  if (!root) return null

  settingsPanel = renderSettingsPanel(root, {
    onChange: queueSettingWrite,
    onClose: closeSettingsPanel,
    onOpenFullSettings() {
      closeSettingsPanel()
      logseq.showSettingsUI()
    },
  })
  return settingsPanel
}

function placeSettingsPanel(root: HTMLElement): void {
  const hostDocument = root.ownerDocument
  const view = hostDocument.defaultView
  const anchor = hostDocument
    .querySelector(TOOLBAR_ANCHOR_SELECTOR)
    ?.getBoundingClientRect()
  const placement = panelPlacement(
    anchor ?? null,
    {
      width: view?.innerWidth ?? root.offsetWidth,
      height: view?.innerHeight ?? root.offsetHeight,
    },
    { width: root.offsetWidth, height: root.offsetHeight },
  )
  root.style.left = `${placement.left}px`
  root.style.top = `${placement.top}px`
}

async function toggleSettingsPanel(): Promise<void> {
  if (settingsPanelIsOpen) {
    closeSettingsPanel()
    return
  }

  const panel = await ensureSettingsPanel()
  if (!panel) {
    // Nothing to mount the panel on, so the schema-driven settings modal — still
    // registered — carries the same options.
    logseq.showSettingsUI()
    return
  }

  panel.sync(panelValuesFromSettings(logseq.settings))
  // Measuring needs the panel displayed, and placing it needs the measurement.
  panel.root.style.visibility = 'hidden'
  panel.root.classList.add(PANEL_OPEN_CLASS)
  placeSettingsPanel(panel.root)
  panel.root.style.visibility = ''
  settingsPanelIsOpen = true

  panel.root.ownerDocument.addEventListener(
    'pointerdown',
    onPanelOutsidePointerDown,
    true,
  )
  panel.root.ownerDocument.addEventListener('keydown', onPanelKeydown, true)
}

// The toolbar item is markup rendered by the host, so its click handler cannot
// be a closure: `data-on-click` names a method the host looks up in the model
// registered here.
function registerToolbarItem(): void {
  logseq.provideModel({
    openTimePrefixSettings() {
      void toggleSettingsPanel()
    },
  })

  logseq.App.registerUIItem('toolbar', {
    key: 'journal-time-prefix',
    template: `
      <a data-on-click="openTimePrefixSettings"
         class="button"
         title="Journal Time Prefix settings">
        <i class="ti ti-clock-hour-4" style="font-size: 20px"></i>
      </a>
    `,
  })
}

async function resolveGraphSupport(): Promise<GraphSupport> {
  const [graph, isDbGraph] = await Promise.all([
    logseq.App.getCurrentGraph(),
    logseq.App.checkCurrentIsDbGraph(),
  ])
  return classifyGraphSupport(graph, isDbGraph)
}

// A plugin becomes ready before Logseq has loaded the graph, so the DB-graph
// question stays unanswerable for a while. Keep asking until a graph exists
// rather than exiting for the session on the first falsy answer.
async function startWhenDbGraph(): Promise<void> {
  if (started || startupPending) return
  startupPending = true

  try {
    for (let attempt = 0; attempt < GRAPH_WAIT_ATTEMPTS; attempt += 1) {
      const support = await resolveGraphSupport()
      if (support === 'supported') {
        started = true
        await start()
        return
      }
      if (support === 'unsupported') {
        if (warnedUnsupported) return
        warnedUnsupported = true
        await logseq.UI.showMsg(
          'Journal Time Prefix only supports Logseq DB graphs.',
          'warning',
        )
        return
      }
      await new Promise((resolve) =>
        window.setTimeout(resolve, GRAPH_WAIT_INTERVAL_MS),
      )
    }

    console.warn(
      '[journal-time-prefix] No graph loaded yet; waiting for a graph change',
    )
  } finally {
    startupPending = false
  }
}

async function main(): Promise<void> {
  applyTimePrefixFormat()
  registerToolbarItem()

  logseq.App.onCurrentGraphChanged(() => {
    journalPageCache.clear()
    void startWhenDbGraph()
  })

  await startWhenDbGraph()
}

logseq.ready(main).catch((error) => {
  console.error('[journal-time-prefix] Failed to start', error)
})
