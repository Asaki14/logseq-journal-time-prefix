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

export function formatTimePrefix(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return timePrefixFormat.replace(TIME_PLACEHOLDER, `${hours}:${minutes}`)
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
