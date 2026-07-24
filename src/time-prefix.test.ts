import { describe, expect, it } from 'vitest'
import type { IDatom } from '@logseq/libs/dist/LSPlugin'
import {
  changedFromEmpty,
  compareBlockOrder,
  formatTimePrefix,
  getHeading,
  hasTimePrefix,
  headingTitleIsExcluded,
  isContentInsertion,
  isInExcludedHeadingSection,
  isJournalPage,
  isTopLevelBlock,
  markdownHeading,
  parseListSetting,
  stripTimePrefix,
  titleHasExcludedTag,
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

describe('exclusion settings', () => {
  it('parses newline and comma separated values without duplicates', () => {
    expect(parseListSetting('Work\nIdeas, Work，Personal')).toEqual([
      'Work',
      'Ideas',
      'Personal',
    ])
  })

  it('strips a generated time prefix', () => {
    expect(stripTimePrefix('[09:07] 内容')).toBe('内容')
    expect(stripTimePrefix('内容')).toBe('内容')
  })
})

describe('heading exclusions', () => {
  it('sorts Logseq fractional orders by raw code points', () => {
    const blocks = [
      { order: 'b8f' },
      { order: 'b8a' },
      { order: 'b8Z' },
      { order: 'b8eV' },
      { order: 'b8e' },
    ]

    expect(blocks.sort(compareBlockOrder).map(({ order }) => order)).toEqual([
      'b8Z',
      'b8a',
      'b8e',
      'b8eV',
      'b8f',
    ])
  })

  it('reads Markdown and DB heading levels', () => {
    expect(markdownHeading('## Ideas')).toEqual({ level: 2, title: 'Ideas' })
    expect(
      getHeading({
        title: 'Ideas',
        properties: { 'logseq.property/heading': 1 },
      }),
    ).toEqual({ level: 1, title: 'Ideas' })
  })

  it('matches exact heading titles case-insensitively', () => {
    expect(headingTitleIsExcluded(' Ideas ', ['ideas'])).toBe(true)
    expect(headingTitleIsExcluded('Ideas later', ['Ideas'])).toBe(false)
  })

  it('excludes through the next heading of the same or higher level', () => {
    const blocks = [
      { uuid: 'a', title: '# Work' },
      { uuid: 'b', title: 'task' },
      { uuid: 'c', title: '## Detail' },
      { uuid: 'd', title: 'note' },
      { uuid: 'e', title: '# Personal' },
      { uuid: 'f', title: 'home' },
    ]

    expect(isInExcludedHeadingSection(blocks, 'a', ['Work'])).toBe(true)
    expect(isInExcludedHeadingSection(blocks, 'd', ['Work'])).toBe(true)
    expect(isInExcludedHeadingSection(blocks, 'e', ['Work'])).toBe(false)
    expect(isInExcludedHeadingSection(blocks, 'f', ['Work'])).toBe(false)
  })

  it('recognizes DB graph heading fields returned by Logseq', () => {
    const blocks = [
      { uuid: 'ling', title: 'Ling', heading: 1, order: 'b8f' },
      { uuid: 'target', title: '[23:40] test', order: 'b8eV' },
      { uuid: 'investment', title: 'Investment', heading: 1, order: 'b8Z' },
      { uuid: 'older', title: 'old', order: 'b8a' },
    ].sort(compareBlockOrder)

    expect(
      isInExcludedHeadingSection(blocks, 'target', ['Investment']),
    ).toBe(true)
    expect(isInExcludedHeadingSection(blocks, 'ling', ['Investment'])).toBe(
      false,
    )
  })
})

describe('tag exclusions', () => {
  it('matches plain and bracketed tags without partial matches', () => {
    expect(titleHasExcludedTag('skip this #no-time', ['no-time'])).toBe(true)
    expect(titleHasExcludedTag('skip #[[No Time]]', ['#no time'])).toBe(true)
    expect(titleHasExcludedTag('keep #no-timer', ['no-time'])).toBe(false)
    expect(titleHasExcludedTag('[09:07] #no-time item', ['no-time'])).toBe(true)
  })
})
