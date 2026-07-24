import type { BlockEntity, IDatom, PageEntity } from '@logseq/libs/dist/LSPlugin'

const TIME_PREFIX_PATTERN = /^\[\d{2}:\d{2}\]\s/

export function formatTimePrefix(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `[${hours}:${minutes}] `
}

export function hasTimePrefix(title: string): boolean {
  return TIME_PREFIX_PATTERN.test(title)
}

export function isContentInsertion(inputType: unknown): boolean {
  if (typeof inputType !== 'string') return true
  return inputType.startsWith('insert') &&
    inputType !== 'insertLineBreak' &&
    inputType !== 'insertParagraph'
}

export function isTopLevelBlock(
  block: Pick<BlockEntity, 'level'> &
    Partial<Pick<BlockEntity, 'parent' | 'page'>>,
): boolean {
  if (block.parent?.id && block.page?.id) {
    return block.parent.id === block.page.id
  }
  return block.level === 1
}

export function changedFromEmpty(
  block: Pick<BlockEntity, 'id' | 'title'>,
  txData: IDatom[],
): boolean {
  if (!block.title.trim() || hasTimePrefix(block.title)) return false

  const titleDatoms = txData.filter(
    ([entityId, attribute]) =>
      entityId === block.id &&
      (attribute === ':block/title' || attribute === 'block/title'),
  )

  const addedNonEmptyTitle = titleDatoms.some(
    ([, , value, , added]) =>
      added && typeof value === 'string' && value.trim().length > 0,
  )
  const removedNonEmptyTitle = titleDatoms.some(
    ([, , value, , added]) =>
      !added && typeof value === 'string' && value.trim().length > 0,
  )

  // DB graphs do not consistently emit a retracted empty-title datom for a
  // block's first edit. A non-empty value without a previous non-empty value
  // is the stable signal shared by both transaction shapes.
  return addedNonEmptyTitle && !removedNonEmptyTitle
}

export function isJournalPage(
  page: Pick<PageEntity, 'type' | 'journal?' | 'journalDay'> | null,
): boolean {
  return Boolean(
    page &&
      (page.type === 'journal' || page['journal?'] === true || page.journalDay),
  )
}
