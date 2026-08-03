import { afterEach, describe, expect, it } from 'vitest'
import type { IDatom } from '@logseq/libs/dist/LSPlugin'
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
  isTaskCycleShortcut,
  isTopLevelBlock,
  markdownHeading,
  matchTimePrefix,
  parseListSetting,
  parseTimePrefixFormat,
  resolveLivePrefixAction,
  setTimePrefixFormat,
  stripTimePrefix,
  titleHasExcludedTag,
  titleIsExcluded,
  titleIsFencedCode,
  titleIsSlashCommand,
} from './time-prefix'

afterEach(() => {
  setTimePrefixFormat(DEFAULT_TIME_PREFIX_FORMAT)
})

describe('formatTimePrefix', () => {
  it('formats local time as HH:mm', () => {
    expect(formatTimePrefix(new Date(2026, 4, 4, 9, 7))).toBe('[09:07] ')
  })

  it('follows the configured format', () => {
    setTimePrefixFormat('({time}) ')
    expect(formatTimePrefix(new Date(2026, 4, 4, 9, 7))).toBe('(09:07) ')

    setTimePrefixFormat('{time} ')
    expect(formatTimePrefix(new Date(2026, 4, 4, 9, 7))).toBe('09:07 ')
  })
})

describe('hasTimePrefix', () => {
  it('recognizes a valid prefix', () => {
    expect(hasTimePrefix('[14:32] 内容')).toBe(true)
    expect(hasTimePrefix('内容')).toBe(false)
  })
})

describe('configurable prefix format', () => {
  it('keeps the built-in format for values without the time placeholder', () => {
    expect(parseTimePrefixFormat('no placeholder')).toBe(
      DEFAULT_TIME_PREFIX_FORMAT,
    )
    expect(parseTimePrefixFormat(undefined)).toBe(DEFAULT_TIME_PREFIX_FORMAT)
    expect(parseTimePrefixFormat('【{time}】')).toBe('【{time}】')
  })

  it('detects the configured wrapper', () => {
    setTimePrefixFormat('({time}) ')
    expect(hasTimePrefix('(14:32) 内容')).toBe(true)
    expect(hasTimePrefix('14:32 内容')).toBe(false)
    expect(stripTimePrefix('(14:32) 内容')).toBe('内容')
  })

  it('detects an empty wrapper', () => {
    setTimePrefixFormat('{time} ')
    expect(hasTimePrefix('14:32 内容')).toBe(true)
    expect(hasTimePrefix('内容')).toBe(false)
    expect(stripTimePrefix('14:32 内容')).toBe('内容')
  })

  it('still recognizes blocks written with the built-in format', () => {
    setTimePrefixFormat('【{time}】')
    expect(hasTimePrefix('[14:32] 旧内容')).toBe(true)
    expect(hasTimePrefix('【14:32】新内容')).toBe(true)
    expect(stripTimePrefix('[14:32] 旧内容')).toBe('旧内容')
    expect(matchTimePrefix('【14:32】新内容')).toBe('【14:32】')
  })

  it('treats regular expression characters in the format literally', () => {
    setTimePrefixFormat('({time}) ')
    expect(hasTimePrefix('a14:32b 内容')).toBe(false)
  })
})

describe('caretAfterPrefixInsertion', () => {
  it('moves a caret the browser placed as if the prefix were absent', () => {
    // Chromium leaves the caret at the length of an IME commit, so a four
    // character commit lands inside the prefix: `[12:|30] 今天天气`.
    expect(caretAfterPrefixInsertion('[12:30] 今天天气', 4, 8, 8)).toBe(12)
    expect(caretAfterPrefixInsertion('[12:30] pasted note', 11, 8, 8)).toBe(19)
  })

  it('leaves a correctly positioned caret alone', () => {
    expect(caretAfterPrefixInsertion('[12:30] h', 9, 8, 8)).toBeNull()
    expect(caretAfterPrefixInsertion('[12:30] 今天天气', 12, 8, 8)).toBeNull()
  })

  it('ignores a value that shrank below the inserted prefix', () => {
    expect(caretAfterPrefixInsertion('[12:3', 5, 8, 8)).toBeNull()
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

describe('classifyGraphSupport', () => {
  it('waits instead of deciding while no graph is loaded', () => {
    expect(classifyGraphSupport(null, false)).toBe('pending')
    expect(classifyGraphSupport(undefined, undefined)).toBe('pending')
    expect(classifyGraphSupport({}, false)).toBe('pending')
  })

  it('accepts a DB graph whatever the graph object looks like', () => {
    expect(classifyGraphSupport(null, true)).toBe('supported')
    expect(classifyGraphSupport({ url: 'logseq_db_Demo' }, true)).toBe(
      'supported',
    )
  })

  it('reports an unsupported graph only once one is loaded', () => {
    expect(classifyGraphSupport({ url: 'logseq_local_/tmp/graph' }, false)).toBe(
      'unsupported',
    )
    expect(classifyGraphSupport({ path: '/tmp/graph' }, false)).toBe(
      'unsupported',
    )
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

describe('slash command exclusion', () => {
  it('excludes a block whose content starts with a slash', () => {
    expect(titleIsSlashCommand('/')).toBe(true)
    expect(titleIsSlashCommand('/todo')).toBe(true)
  })

  it('treats leading whitespace as a command trigger, like Logseq does', () => {
    expect(titleIsSlashCommand(' /')).toBe(true)
    expect(titleIsSlashCommand('\t/query')).toBe(true)
  })

  it('keeps blocks that only contain a slash later on', () => {
    expect(titleIsSlashCommand('')).toBe(false)
    expect(titleIsSlashCommand('a /')).toBe(false)
    expect(titleIsSlashCommand('and/or')).toBe(false)
  })

  it('sees through a prefix that was already inserted', () => {
    expect(titleIsSlashCommand('[09:07] /todo')).toBe(true)
    setTimePrefixFormat('【{time}】')
    expect(titleIsSlashCommand('【09:07】/todo')).toBe(true)
  })
})

// Reproduces the reported bug: a prefix in front of a Markdown fence breaks the
// fence, so the block stops being a code block and its renderer stops firing.
describe('fenced code exclusion', () => {
  const fenced = '```d2\nA -> B\n```'
  const noExclusions = { excludedHeadingTitles: [], excludedTags: [] }
  const cleanContext = {
    headingLevel: null,
    excludedBySection: false,
    excludedByTag: false,
  }

  it('excludes a block that opens with a fence', () => {
    expect(titleIsFencedCode(fenced)).toBe(true)
    expect(titleIsFencedCode('~~~d2\nA -> B\n~~~')).toBe(true)
    expect(titleIsFencedCode('````\nnested ``` fence\n````')).toBe(true)
    expect(titleIsFencedCode('  ```')).toBe(true)
  })

  it('keeps blocks that are not fenced code', () => {
    expect(titleIsFencedCode('')).toBe(false)
    expect(titleIsFencedCode('`inline` code')).toBe(false)
    expect(titleIsFencedCode('``double`` backticks')).toBe(false)
    expect(titleIsFencedCode('~strike~ through')).toBe(false)
    expect(titleIsFencedCode('see the ```d2 block below')).toBe(false)
  })

  it('sees through a prefix that was already inserted', () => {
    expect(titleIsFencedCode(`[09:07] ${fenced}`)).toBe(true)
    setTimePrefixFormat('【{time}】')
    expect(titleIsFencedCode(`【09:07】${fenced}`)).toBe(true)
  })

  it('reports a fenced block as excluded', () => {
    expect(titleIsExcluded(fenced, cleanContext, noExclusions)).toBe(true)
    expect(
      titleIsExcluded(`[09:07] ${fenced}`, cleanContext, noExclusions),
    ).toBe(true)
  })

  // Editing an already-corrupted block repairs it instead of leaving the prefix.
  it('strips the prefix an earlier version added to a fenced block', () => {
    expect(
      resolveLivePrefixAction({
        value: `[09:07] ${fenced}`,
        pendingInsertion: '',
        requireContent: true,
        context: cleanContext,
        settings: noExclusions,
      }),
    ).toBe('strip')
    expect(
      resolveLivePrefixAction({
        value: fenced,
        pendingInsertion: '',
        requireContent: true,
        context: cleanContext,
        settings: noExclusions,
      }),
    ).toBe('strip')
  })
})

// Reproduces the reported bug: cmd+Enter makes the edited block a task node
// without touching its text, so the only signal available is the keydown itself.
describe('isTaskCycleShortcut', () => {
  it('recognizes the cycle-todo shortcut on either platform', () => {
    expect(isTaskCycleShortcut({ key: 'Enter', metaKey: true })).toBe(true)
    expect(isTaskCycleShortcut({ key: 'Enter', ctrlKey: true })).toBe(true)
  })

  it('leaves ordinary block editing keys alone', () => {
    expect(isTaskCycleShortcut({ key: 'Enter' })).toBe(false)
    expect(isTaskCycleShortcut({ key: 'ArrowDown', metaKey: true })).toBe(false)
    expect(isTaskCycleShortcut({ key: 'a', metaKey: true })).toBe(false)
  })
})

describe('live prefix action', () => {
  const noExclusions = { excludedHeadingTitles: [], excludedTags: [] }
  const cleanContext = {
    headingLevel: null,
    excludedBySection: false,
    excludedByTag: false,
  }

  it('prefixes the first character of an ordinary block', () => {
    expect(
      resolveLivePrefixAction({
        value: '',
        pendingInsertion: 'a',
        requireContent: false,
        context: cleanContext,
        settings: noExclusions,
      }),
    ).toBe('insert')
  })

  // Reproduces the reported bug: the exclusion answer is resolved when editing
  // starts, before `/TODO` tags the block, so it must not survive the command.
  it('asks for a fresh context while a slash command is in flight', () => {
    expect(
      resolveLivePrefixAction({
        value: '',
        pendingInsertion: '/',
        requireContent: false,
        context: cleanContext,
        settings: { excludedHeadingTitles: [], excludedTags: ['task'] },
      }),
    ).toBe('refresh')
    expect(
      resolveLivePrefixAction({
        value: '/todo',
        pendingInsertion: '',
        requireContent: true,
        context: cleanContext,
        settings: noExclusions,
      }),
    ).toBe('refresh')
    expect(
      resolveLivePrefixAction({
        value: '[09:07] /todo',
        pendingInsertion: '',
        requireContent: true,
        context: cleanContext,
        settings: noExclusions,
      }),
    ).toBe('refresh')
  })

  it('never prefixes a block the refreshed context reports as excluded', () => {
    const excludedByTag = { ...cleanContext, excludedByTag: true }
    expect(
      resolveLivePrefixAction({
        value: '',
        pendingInsertion: 'a',
        requireContent: false,
        context: excludedByTag,
        settings: { excludedHeadingTitles: [], excludedTags: ['task'] },
      }),
    ).toBe('strip')
    // The user removed the prefix by hand and keeps typing: it stays removed.
    expect(
      resolveLivePrefixAction({
        value: 'buy milk',
        pendingInsertion: '',
        requireContent: true,
        context: excludedByTag,
        settings: { excludedHeadingTitles: [], excludedTags: ['task'] },
      }),
    ).toBe('strip')
    expect(
      resolveLivePrefixAction({
        value: '[09:07] buy milk',
        pendingInsertion: '',
        requireContent: true,
        context: excludedByTag,
        settings: { excludedHeadingTitles: [], excludedTags: ['task'] },
      }),
    ).toBe('strip')
  })

  it('leaves an existing prefix and a blank block alone', () => {
    expect(
      resolveLivePrefixAction({
        value: '[09:07] done',
        pendingInsertion: '',
        requireContent: true,
        context: cleanContext,
        settings: noExclusions,
      }),
    ).toBe('none')
    expect(
      resolveLivePrefixAction({
        value: '   ',
        pendingInsertion: '',
        requireContent: true,
        context: cleanContext,
        settings: noExclusions,
      }),
    ).toBe('none')
    expect(
      resolveLivePrefixAction({
        value: '## Notes',
        pendingInsertion: '',
        requireContent: true,
        context: cleanContext,
        settings: noExclusions,
      }),
    ).toBe('none')
  })
})
