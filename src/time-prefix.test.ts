import { describe, expect, it } from 'vitest'
import type { IDatom } from '@logseq/libs/dist/LSPlugin'
import {
  changedFromEmpty,
  formatTimePrefix,
  hasTimePrefix,
  isContentInsertion,
  isJournalPage,
  isTopLevelBlock,
} from './time-prefix'

describe('formatTimePrefix', () => {
  it('formats local time as HH:mm', () => {
    expect(formatTimePrefix(new Date(2026, 4, 4, 9, 7))).toBe('[09:07] ')
  })
})

describe('hasTimePrefix', () => {
  it('recognizes a valid prefix', () => {
    expect(hasTimePrefix('[14:32] 内容')).toBe(true)
    expect(hasTimePrefix('内容')).toBe(false)
  })
})

describe('isContentInsertion', () => {
  it('accepts content insertion and rejects deletion or empty line insertion', () => {
    expect(isContentInsertion('insertText')).toBe(true)
    expect(isContentInsertion('insertFromPaste')).toBe(true)
    expect(isContentInsertion('deleteContentBackward')).toBe(false)
    expect(isContentInsertion('insertLineBreak')).toBe(false)
    expect(isContentInsertion('insertParagraph')).toBe(false)
  })
})

describe('isTopLevelBlock', () => {
  it('accepts page children and rejects nested blocks', () => {
    expect(
      isTopLevelBlock({ parent: { id: 10 }, page: { id: 10 } }),
    ).toBe(true)
    expect(
      isTopLevelBlock({ parent: { id: 11 }, page: { id: 10 } }),
    ).toBe(false)
  })

  it('falls back to level when relation ids are unavailable', () => {
    expect(isTopLevelBlock({ level: 1 })).toBe(true)
    expect(isTopLevelBlock({ level: 2 })).toBe(false)
  })
})

describe('changedFromEmpty', () => {
  const block = { id: 42, title: '内容' }

  it('detects the first non-empty edit with an empty-title retraction', () => {
    const txData: IDatom[] = [
      [42, ':block/title', '', 1, false],
      [42, ':block/title', '内容', 1, true],
    ]
    expect(changedFromEmpty(block, txData)).toBe(true)
  })

  it('detects the DB transaction shape that only adds the first title', () => {
    const txData: IDatom[] = [[42, 'block/title', '内容', 1, true]]
    expect(changedFromEmpty(block, txData)).toBe(true)
  })

  it('ignores later edits and prefixed blocks', () => {
    const txData: IDatom[] = [
      [42, ':block/title', '内', 2, false],
      [42, ':block/title', '内容', 2, true],
    ]
    expect(changedFromEmpty(block, txData)).toBe(false)
    expect(changedFromEmpty({ id: 42, title: '[14:32] 内容' }, txData)).toBe(
      false,
    )
  })
})

describe('isJournalPage', () => {
  it('supports DB journal indicators', () => {
    expect(isJournalPage({ type: 'journal', 'journal?': false })).toBe(true)
    expect(isJournalPage({ type: 'page', 'journal?': true })).toBe(true)
    expect(isJournalPage({ type: 'page', 'journal?': false })).toBe(false)
    expect(isJournalPage(null)).toBe(false)
  })
})
