import '@logseq/libs'
import type {
  BlockEntity,
  PageEntity,
  SettingSchemaDesc,
} from '@logseq/libs/dist/LSPlugin'
import {
  caretAfterPrefixInsertion,
  changedFromEmpty,
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
  markdownHeading,
  matchTimePrefix,
  normalizeTag,
  parseListSetting,
  setTimePrefixFormat,
  stripTimePrefix,
  titleHasExcludedTag,
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

interface PrefixSettings {
  excludedHeadingTitles: string[]
  excludedTags: string[]
}

interface EditorContext {
  blockUuid: string
  headingLevel: number | null
  excludedBySection: boolean
  excludedByTag: boolean
}

const processingBlocks = new Set<string>()
const journalPageCache = new Map<number, boolean>()
const journalEditors = new WeakMap<HTMLTextAreaElement, EditorContext>()
const syntheticEditorUpdates = new WeakSet<HTMLTextAreaElement>()
const pendingCaretRepairs = new WeakMap<
  HTMLTextAreaElement,
  { prefixLength: number; valueLength: number }
>()

function applyTimePrefixFormat(): void {
  setTimePrefixFormat(logseq.settings?.timePrefixFormat)
}

function getSettings(): PrefixSettings {
  return {
    excludedHeadingTitles: parseListSetting(
      logseq.settings?.excludedHeadingTitles,
    ),
    excludedTags: parseListSetting(logseq.settings?.excludedTags),
  }
}

function getHostDocument(): Document {
  return window.parent.document
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

function titleIsExcluded(
  title: string,
  context: EditorContext,
  settings: PrefixSettings,
): boolean {
  if (context.excludedBySection || context.excludedByTag) return true
  if (titleIsSlashCommand(title)) return true
  if (titleHasExcludedTag(title, settings.excludedTags)) return true

  const heading = markdownHeading(title)
  const isHeading = context.headingLevel !== null || heading !== null
  return Boolean(
    isHeading &&
      headingTitleIsExcluded(
        heading?.title ?? stripTimePrefix(title).trim(),
        settings.excludedHeadingTitles,
      ),
  )
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

  const settings = getSettings()
  // On `beforeinput` the character has not been inserted yet, so exclusion has
  // to judge the value the block is about to have. That path only runs on an
  // otherwise blank block, so prepending the insertion is enough to decide it.
  if (titleIsExcluded(pendingInsertion + textarea.value, context, settings)) {
    return removeLivePrefix(textarea)
  }

  if (
    hasTimePrefix(textarea.value) ||
    (requireContent && !textarea.value.trim()) ||
    (!requireContent && textarea.value.trim().length > 0)
  ) {
    return false
  }

  // A raw Markdown heading must remain at the start until Logseq parses its
  // heading level. The committed-block fallback prefixes it later when it is
  // not part of an excluded section.
  if (/^#{1,6}(?:\s|$)/u.test(textarea.value.trimStart())) return false

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
  return true
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

async function main(): Promise<void> {
  const isDbGraph = await logseq.App.checkCurrentIsDbGraph()
  if (!isDbGraph) {
    await logseq.UI.showMsg(
      'Journal Time Prefix only supports Logseq DB graphs.',
      'warning',
    )
    return
  }

  applyTimePrefixFormat()

  logseq.DB.onChanged(({ blocks, txData }) => {
    for (const block of blocks) {
      if (changedFromEmpty(block, txData)) {
        void handleBlock(block)
      }
    }
  })

  const hostDocument = getHostDocument()
  hostDocument.addEventListener('focusin', onEditorFocus, true)
  hostDocument.addEventListener('keydown', onEditorStructureKeydown, true)
  hostDocument.addEventListener('beforeinput', onBeforeEditorInput, true)
  hostDocument.addEventListener('input', onEditorInput, true)
  hostDocument.addEventListener('compositionend', onCompositionEnd, true)
  void rememberJournalEditor(hostDocument.activeElement)

  const removeSettingsListener = logseq.onSettingsChanged(() => {
    applyTimePrefixFormat()
    void rememberJournalEditor(hostDocument.activeElement)
  })

  logseq.beforeunload(async () => {
    hostDocument.removeEventListener('focusin', onEditorFocus, true)
    hostDocument.removeEventListener('keydown', onEditorStructureKeydown, true)
    hostDocument.removeEventListener('beforeinput', onBeforeEditorInput, true)
    hostDocument.removeEventListener('input', onEditorInput, true)
    hostDocument.removeEventListener('compositionend', onCompositionEnd, true)
    removeSettingsListener()
  })

  logseq.App.onCurrentGraphChanged(() => {
    journalPageCache.clear()
  })

  console.info('[journal-time-prefix] Ready')
}

logseq.ready(main).catch((error) => {
  console.error('[journal-time-prefix] Failed to start', error)
})
