import { describe, expect, it } from 'vitest'
import { panelRows } from './panel'
import { DEFAULT_TIME_PREFIX_FORMAT } from './time-prefix'

describe('panelRows', () => {
  it('reports the status, the configured format and the next prefix', () => {
    expect(panelRows('active', '({time}) ', '(09:30) ')).toEqual([
      { label: 'Status', value: 'Active on journal pages' },
      { label: 'Prefix format', value: '({time}) ' },
      { label: 'Next prefix', value: '(09:30) ' },
    ])
  })

  it('falls back to the default format when the setting is unusable', () => {
    const rows = panelRows('pending', 'no placeholder', '[09:30] ')
    expect(rows[0].value).toBe('Waiting for a graph to load')
    expect(rows[1].value).toBe(DEFAULT_TIME_PREFIX_FORMAT)
  })

  it('says the plugin is inactive on an unsupported graph', () => {
    expect(panelRows('unsupported', undefined, '[09:30] ')[0].value).toBe(
      'Inactive — DB graphs only',
    )
  })
})
