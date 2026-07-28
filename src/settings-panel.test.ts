import { describe, expect, it } from 'vitest'
import { DEFAULT_TIME_PREFIX_FORMAT } from './time-prefix'
import {
  PANEL_FIELDS,
  panelPlacement,
  panelValuesFromSettings,
  previewTimePrefix,
} from './settings-panel'

const at = (hours: number, minutes: number): Date =>
  new Date(2026, 6, 28, hours, minutes)

describe('panelValuesFromSettings', () => {
  it('reads the stored values for every declared field', () => {
    expect(
      panelValuesFromSettings({
        timePrefixFormat: '({time}) ',
        excludedHeadingTitles: 'Daily review',
        excludedTags: 'task\nidea',
      }),
    ).toEqual({
      timePrefixFormat: '({time}) ',
      excludedHeadingTitles: 'Daily review',
      excludedTags: 'task\nidea',
    })
  })

  it('shows the format in effect when the setting is unset or malformed', () => {
    expect(panelValuesFromSettings(null).timePrefixFormat).toBe(
      DEFAULT_TIME_PREFIX_FORMAT,
    )
    expect(
      panelValuesFromSettings({ timePrefixFormat: 'no placeholder' })
        .timePrefixFormat,
    ).toBe(DEFAULT_TIME_PREFIX_FORMAT)
  })

  it('falls back to an empty string for the list fields', () => {
    const values = panelValuesFromSettings({ excludedTags: 42 })
    expect(values.excludedTags).toBe('')
    expect(values.excludedHeadingTitles).toBe('')
  })

  it('covers exactly the fields the panel renders', () => {
    expect(PANEL_FIELDS.map((field) => field.key).sort()).toEqual(
      Object.keys(panelValuesFromSettings(null)).sort(),
    )
  })
})

describe('previewTimePrefix', () => {
  it('renders the typed format without touching the active one', () => {
    expect(previewTimePrefix('【{time}】', at(9, 5))).toBe('【09:05】')
    expect(previewTimePrefix('', at(9, 5))).toBe('[09:05] ')
  })
})

describe('panelPlacement', () => {
  const viewport = { width: 1200, height: 800 }
  const panel = { width: 320, height: 400 }

  it('right-aligns under the toolbar anchor', () => {
    expect(
      panelPlacement(
        { left: 1100, right: 1130, top: 8, bottom: 36 },
        viewport,
        panel,
      ),
    ).toEqual({ left: 810, top: 42 })
  })

  it('flips above the anchor when the panel would overflow the viewport', () => {
    expect(
      panelPlacement(
        { left: 1100, right: 1130, top: 700, bottom: 730 },
        viewport,
        panel,
      ).top,
    ).toBe(294)
  })

  it('keeps the panel on screen without an anchor and in a narrow window', () => {
    expect(panelPlacement(null, viewport, panel).left).toBe(872)
    expect(
      panelPlacement({ left: 260, right: 290, top: 8, bottom: 36 }, {
        width: 300,
        height: 800,
      }, panel).left,
    ).toBe(8)
  })
})
