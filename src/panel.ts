import { parseTimePrefixFormat } from './time-prefix'

// What the right-sidebar panel reports about the plugin. Mirrors the graph
// classification in `time-prefix.ts`, seen from the user's side.
export type PluginStatus = 'active' | 'pending' | 'unsupported'

export interface PanelRow {
  label: string
  value: string
}

const STATUS_VALUES: Record<PluginStatus, string> = {
  active: 'Active on journal pages',
  pending: 'Waiting for a graph to load',
  unsupported: 'Inactive — DB graphs only',
}

export function panelRows(
  status: PluginStatus,
  formatSetting: unknown,
  nextPrefix: string,
): PanelRow[] {
  return [
    { label: 'Status', value: STATUS_VALUES[status] },
    { label: 'Prefix format', value: parseTimePrefixFormat(formatSetting) },
    { label: 'Next prefix', value: nextPrefix },
  ]
}
