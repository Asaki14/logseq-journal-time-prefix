import '@logseq/libs'
import type { BlockEntity, PageEntity } from '@logseq/libs/dist/LSPlugin'
import {
  changedFromEmpty,
  formatTimePrefix,
  hasTimePrefix,
  isContentInsertion,
  isJournalPage,
  isTopLevelBlock,
} from './time-prefix'

const processingBlocks = new Set<string>()
const journalPageCache = new Map<number, boolean>()
const journalEditors = new WeakSet<HTMLTextAreaElement>()

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

async function addPrefix(blockUuid: string): Promise<void> {
  const latest = await logseq.Editor.getBlock(blockUuid)
  if (!latest?.title || hasTimePrefix(latest.title)) return

  // Never call editBlock while the user is typing. It replaces the live editor
  // state and can swallow subsequent keystrokes. The input listener owns this
  // case; DB.onChanged remains a fallback after the editor has been committed.
  if ((await logseq.Editor.checkEditing()) === blockUuid) return

  const current = await logseq.Editor.getBlock(blockUuid)
  if (current?.title && !hasTimePrefix(current.title)) {
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

  const stillEditing = await logseq.Editor.checkEditing()
  if (
    stillEditing === editingBlock &&
    textarea.isConnected &&
    textarea.ownerDocument.activeElement === textarea
  ) {
    journalEditors.add(textarea)
  }
}

function prefixLiveEditor(
  target: EventTarget | null,
  requireContent: boolean,
): void {
  const textarea = getTextarea(target)
  if (
    !textarea ||
    !journalEditors.has(textarea) ||
    hasTimePrefix(textarea.value) ||
    (requireContent && !textarea.value.trim()) ||
    (!requireContent && textarea.value.trim().length > 0)
  ) {
    return
  }

  // Runs during capture, before Logseq handles the same editing event. Updating
  // the live textarea here lets Logseq persist one coherent value and avoids
  // re-entering/repositioning the editor through async plugin APIs. Before an
  // ordinary character is inserted, move the caret behind the prefix; keeping
  // it at position 0 would produce `character[prefix]` and trigger a duplicate.
  textarea.setRangeText(
    formatTimePrefix(new Date()),
    0,
    0,
    requireContent ? 'preserve' : 'end',
  )
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
  prefixLiveEditor(event.target, false)
}

function onEditorInput(event: Event): void {
  if ('isComposing' in event && event.isComposing === true) return
  prefixLiveEditor(event.target, true)
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

  logseq.DB.onChanged(({ blocks, txData }) => {
    for (const block of blocks) {
      if (changedFromEmpty(block, txData)) {
        void handleBlock(block)
      }
    }
  })

  const hostDocument = getHostDocument()
  hostDocument.addEventListener('focusin', onEditorFocus, true)
  hostDocument.addEventListener('beforeinput', onBeforeEditorInput, true)
  hostDocument.addEventListener('input', onEditorInput, true)
  hostDocument.addEventListener('compositionend', onCompositionEnd, true)
  void rememberJournalEditor(hostDocument.activeElement)

  logseq.beforeunload(async () => {
    hostDocument.removeEventListener('focusin', onEditorFocus, true)
    hostDocument.removeEventListener('beforeinput', onBeforeEditorInput, true)
    hostDocument.removeEventListener('input', onEditorInput, true)
    hostDocument.removeEventListener('compositionend', onCompositionEnd, true)
  })

  logseq.App.onCurrentGraphChanged(() => {
    journalPageCache.clear()
  })

  console.info('[journal-time-prefix] Ready')
}

logseq.ready(main).catch((error) => {
  console.error('[journal-time-prefix] Failed to start', error)
})
