import type { BlockEntity, IDatom, PageEntity } from '@logseq/libs/dist/LSPlugin'

// Blocks written before the format became configurable always use this shape,
// so it stays part of prefix detection whatever the current format is.
const LEGACY_TIME_PREFIX_PATTERN = /^\[\d{2}:\d{2}\]\s/
const MARKDOWN_HEADING_PATTERN = /^(#{1,6})(?:\s+(.*)|\s*)$/
const TAG_BOUNDARY_PATTERN = /[\s,.;:!?，。；：！？、()[\]{}]/u

const TIME_PLACEHOLDER = '{time}'
const TIME_PATTERN_SOURCE = '\\d{2}:\\d{2}'

export const DEFAULT_TIME_PREFIX_FORMAT = '[{time}] '

type BlockLike = Pick<BlockEntity, 'uuid' | 'title'> &
  Partial<Pick<BlockEntity, 'properties'>> &
  Record<string, unknown>

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

function buildTimePrefixPattern(format: string): RegExp {
  const placeholder = format.indexOf(TIME_PLACEHOLDER)
  const before = escapeForRegExp(format.slice(0, placeholder))
  const after = escapeForRegExp(
    format.slice(placeholder + TIME_PLACEHOLDER.length),
  )
  return new RegExp(`^${before}${TIME_PATTERN_SOURCE}${after}`)
}

export function parseTimePrefixFormat(value: unknown): string {
  return typeof value === 'string' && value.includes(TIME_PLACEHOLDER)
    ? value
    : DEFAULT_TIME_PREFIX_FORMAT
}

let timePrefixFormat = DEFAULT_TIME_PREFIX_FORMAT
let timePrefixPattern = buildTimePrefixPattern(DEFAULT_TIME_PREFIX_FORMAT)

export function setTimePrefixFormat(value: unknown): string {
  timePrefixFormat = parseTimePrefixFormat(value)
  timePrefixPattern = buildTimePrefixPattern(timePrefixFormat)
  return timePrefixFormat
}

export function renderTimePrefix(format: unknown, date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return parseTimePrefixFormat(format).replace(
    TIME_PLACEHOLDER,
    `${hours}:${minutes}`,
  )
}

export function formatTimePrefix(date: Date): string {
  return renderTimePrefix(timePrefixFormat, date)
}

// Detection has to cover the configured format and the built-in one, otherwise
// changing the format would add a second prefix to every existing block.
export function matchTimePrefix(title: string): string | null {
  const match =
    timePrefixPattern.exec(title) ?? LEGACY_TIME_PREFIX_PATTERN.exec(title)
  return match?.[0] ?? null
}

export function hasTimePrefix(title: string): boolean {
  return matchTimePrefix(title) !== null
}

export function stripTimePrefix(title: string): string {
  const prefix = matchTimePrefix(title)
  return prefix === null ? title : title.slice(prefix.length)
}

// Chromium applies a browser-driven insertion (an IME commit, a paste) at the
// caret the `beforeinput` listener moved, but then places the caret using the
// target range it captured before that listener ran. The caret therefore lands
// `prefixLength` characters early, which for a short insertion is inside the
// prefix itself: `[12:|30] 今天`. Returns the corrected caret, or null when the
// browser already positioned it correctly.
export function caretAfterPrefixInsertion(
  value: string,
  caret: number,
  prefixLength: number,
  valueLengthWithPrefix: number,
): number | null {
  const insertedLength = value.length - valueLengthWithPrefix
  if (insertedLength < 0 || caret !== insertedLength) return null
  return caret + prefixLength
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

export type GraphSupport = 'supported' | 'unsupported' | 'pending'

// `checkCurrentIsDbGraph()` answers false while the graph is still loading, and
// at that point `getCurrentGraph()` is still null. Treating that first answer as
// final kills the plugin for the whole session and shows a file-graph warning on
// a DB graph, so a falsy answer only counts once a graph actually exists.
export function classifyGraphSupport(
  graph: { url?: string; path?: string } | null | undefined,
  isDbGraph: unknown,
): GraphSupport {
  if (isDbGraph === true) return 'supported'
  if (!graph?.url && !graph?.path) return 'pending'
  return 'unsupported'
}

export function isJournalPage(
  page: Pick<PageEntity, 'type' | 'journal?' | 'journalDay'> | null,
): boolean {
  return Boolean(
    page &&
      (page.type === 'journal' || page['journal?'] === true || page.journalDay),
  )
}

export function parseListSetting(value: unknown): string[] {
  if (typeof value !== 'string') return []
  return [...new Set(
    value
      .split(/[\n,，]/u)
      .map((item) => item.trim())
      .filter(Boolean),
  )]
}

function normalizeHeadingTitle(title: string): string {
  return stripTimePrefix(title).trim().toLocaleLowerCase()
}

function toHeadingLevel(value: unknown): number | null {
  const level = typeof value === 'string' ? Number(value) : value
  return typeof level === 'number' && Number.isInteger(level) && level >= 1 && level <= 6
    ? level
    : null
}

export function markdownHeading(title: string): {
  level: number
  title: string
} | null {
  const match = stripTimePrefix(title).trimStart().match(MARKDOWN_HEADING_PATTERN)
  if (!match) return null
  return { level: match[1].length, title: (match[2] ?? '').trim() }
}

export function getHeading(
  block: Pick<BlockEntity, 'title'> &
    Partial<Pick<BlockEntity, 'properties'>> &
    Record<string, unknown>,
): { level: number; title: string } | null {
  const properties = block.properties ?? {}
  const level = [
    block['logseq.property/heading'],
    block.heading,
    block.headingLevel,
    properties['logseq.property/heading'],
    properties.heading,
    properties.headingLevel,
  ]
    .map(toHeadingLevel)
    .find((candidate) => candidate !== null)

  if (level !== undefined) {
    return { level, title: stripTimePrefix(block.title).trim() }
  }
  return markdownHeading(block.title)
}

export function headingTitleIsExcluded(
  title: string,
  excludedHeadingTitles: string[],
): boolean {
  const normalized = normalizeHeadingTitle(title)
  return excludedHeadingTitles.some(
    (candidate) => normalizeHeadingTitle(candidate) === normalized,
  )
}

// Logseq opens its slash-command menu when `/` starts the block or follows
// whitespace, so a prefix whose format does not end in a space (`【14:32】/`)
// leaves the menu unreachable, and even the default `[14:32] ` prefix survives
// the command as stray text. Leading whitespace is a valid trigger position for
// Logseq, so ` /` counts as a command here as well.
export function titleIsSlashCommand(title: string): boolean {
  return stripTimePrefix(title).trimStart().startsWith('/')
}

// Logseq's cycle-todo shortcut (cmd+Enter on macOS, ctrl+Enter elsewhere) turns
// the edited block into a task node tagged `Task` in place, leaving its text
// untouched — so unlike a slash command it gives the editor path no in-band
// signal. Its transaction also lands tens of milliseconds after the keydown,
// later than any exclusion refresh scheduled from that keydown, which is why the
// answer has to be re-checked once a prefix is about to be inserted.
export function isTaskCycleShortcut(
  event: Pick<KeyboardEvent, 'key'> &
    Partial<Pick<KeyboardEvent, 'metaKey' | 'ctrlKey'>>,
): boolean {
  return event.key === 'Enter' && (event.metaKey === true || event.ctrlKey === true)
}

export function normalizeTag(tag: string): string {
  return tag
    .trim()
    .replace(/^#/, '')
    .replace(/^\[\[|\]\]$/g, '')
    .trim()
    .toLocaleLowerCase()
}

function isTagBoundary(character: string | undefined): boolean {
  return character === undefined || TAG_BOUNDARY_PATTERN.test(character)
}

export function titleHasExcludedTag(
  title: string,
  excludedTags: string[],
): boolean {
  const normalizedTitle = stripTimePrefix(title).toLocaleLowerCase()

  return excludedTags.some((configuredTag) => {
    const tag = normalizeTag(configuredTag)
    if (!tag) return false

    if (normalizedTitle.includes(`#[[${tag}]]`)) return true

    const needle = `#${tag}`
    let index = normalizedTitle.indexOf(needle)
    while (index >= 0) {
      const before = index === 0 ? undefined : normalizedTitle[index - 1]
      const after = normalizedTitle[index + needle.length]
      if (isTagBoundary(before) && isTagBoundary(after)) return true
      index = normalizedTitle.indexOf(needle, index + needle.length)
    }
    return false
  })
}

export interface EditorExclusionContext {
  headingLevel: number | null
  excludedBySection: boolean
  excludedByTag: boolean
}

export interface ExclusionSettings {
  excludedHeadingTitles: string[]
  excludedTags: string[]
}

export function titleIsExcluded(
  title: string,
  context: EditorExclusionContext,
  settings: ExclusionSettings,
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

// `refresh` strips any prefix like `strip` does, and additionally asks the caller
// to re-resolve exclusion once Logseq has applied the command: the answer it
// holds describes the block from before the command.
export type LivePrefixAction = 'insert' | 'strip' | 'none' | 'refresh'

// Decides what the live editor path does before Logseq handles the editing
// event. `context` carries the exclusion answer resolved when editing started;
// `pendingInsertion` is the `beforeinput` data, which is not in `value` yet.
export function resolveLivePrefixAction(input: {
  value: string
  pendingInsertion: string
  requireContent: boolean
  context: EditorExclusionContext
  settings: ExclusionSettings
}): LivePrefixAction {
  const { value, requireContent, context, settings } = input
  // On `beforeinput` the character has not been inserted yet, so exclusion has
  // to judge the value the block is about to have. That path only runs on an
  // otherwise blank block, so prepending the insertion is enough to decide it.
  const title = input.pendingInsertion + value

  // A slash command lets Logseq rewrite the block itself — `/TODO` turns it into
  // a task node tagged `Task` — so an exclusion answer resolved before the
  // command ran no longer describes the block and has to be re-resolved.
  if (titleIsSlashCommand(title)) return 'refresh'

  if (titleIsExcluded(title, context, settings)) return 'strip'

  if (
    hasTimePrefix(value) ||
    (requireContent && !value.trim()) ||
    (!requireContent && value.trim().length > 0)
  ) {
    return 'none'
  }

  // A raw Markdown heading must remain at the start until Logseq parses its
  // heading level. The committed-block fallback prefixes it later when it is
  // not part of an excluded section.
  if (/^#{1,6}(?:\s|$)/u.test(value.trimStart())) return 'none'

  return 'insert'
}

export function compareBlockOrder(
  left: Pick<BlockEntity, 'order'>,
  right: Pick<BlockEntity, 'order'>,
): number {
  // Logseq fractional order strings use raw code-point ordering. localeCompare
  // applies language collation (for example, sorting `b8a` before `b8Z`) and
  // therefore corrupts the page sequence at uppercase/lowercase boundaries.
  if (left.order === right.order) return 0
  return left.order < right.order ? -1 : 1
}

export function isInExcludedHeadingSection(
  blocks: BlockLike[],
  targetUuid: string,
  excludedHeadingTitles: string[],
): boolean {
  let excludedSectionLevel: number | null = null

  for (const block of blocks) {
    const heading = getHeading(block)
    if (
      heading &&
      excludedSectionLevel !== null &&
      heading.level <= excludedSectionLevel
    ) {
      excludedSectionLevel = null
    }

    if (
      heading &&
      headingTitleIsExcluded(heading.title, excludedHeadingTitles)
    ) {
      excludedSectionLevel = heading.level
    }

    if (block.uuid === targetUuid) {
      return excludedSectionLevel !== null
    }
  }

  return false
}
