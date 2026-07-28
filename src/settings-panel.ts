import { parseTimePrefixFormat, renderTimePrefix } from './time-prefix'

export const PANEL_ROOT_ID = 'journal-time-prefix-panel'
export const PANEL_OPEN_CLASS = 'jtp-open'

const PANEL_WIDTH = 320
const VIEWPORT_MARGIN = 8

export type PanelFieldKey =
  | 'timePrefixFormat'
  | 'excludedHeadingTitles'
  | 'excludedTags'

export interface PanelField {
  key: PanelFieldKey
  label: string
  hint: string
  control: 'text' | 'textarea'
  placeholder: string
}

// The same three settings the schema declares, worded for a compact popover
// instead of the settings modal's full descriptions.
export const PANEL_FIELDS: PanelField[] = [
  {
    key: 'timePrefixFormat',
    label: 'Time prefix format / 时间前缀格式',
    // Plain text, not Markdown: unlike the schema descriptions, this panel
    // renders the hint as written.
    hint: '{time} is the 24-hour HH:mm. / {time} 代表 24 小时制 HH:mm。',
    control: 'text',
    placeholder: '[{time}] ',
  },
  {
    key: 'excludedHeadingTitles',
    label: 'Excluded heading titles / 排除的标题',
    hint: 'One exact title per line. / 每行一个完整标题。',
    control: 'textarea',
    placeholder: 'Daily review',
  },
  {
    key: 'excludedTags',
    label: 'Excluded block tags / 排除的 block 标签',
    hint: 'One tag per line, # optional. / 每行一个标签，可省略 #。',
    control: 'textarea',
    placeholder: 'task',
  },
]

export type PanelValues = Record<PanelFieldKey, string>

export function panelValuesFromSettings(
  settings: Record<string, unknown> | null | undefined,
): PanelValues {
  const read = (key: PanelFieldKey): string => {
    const value = settings?.[key]
    return typeof value === 'string' ? value : ''
  }

  return {
    // An unset or malformed format falls back to the default at prefix time, so
    // show the format actually in effect rather than an empty field.
    timePrefixFormat: parseTimePrefixFormat(settings?.timePrefixFormat),
    excludedHeadingTitles: read('excludedHeadingTitles'),
    excludedTags: read('excludedTags'),
  }
}

export function previewTimePrefix(format: string, date: Date): string {
  return renderTimePrefix(format, date)
}

export interface AnchorRect {
  left: number
  right: number
  bottom: number
  top: number
}

export interface PanelPlacement {
  left: number
  top: number
}

// Anchors the popover under the toolbar button, right-aligned like Logseq's own
// toolbar dropdowns, and keeps it inside the viewport.
export function panelPlacement(
  anchor: AnchorRect | null,
  viewport: { width: number; height: number },
  panel: { width: number; height: number },
): PanelPlacement {
  const width = panel.width || PANEL_WIDTH
  const right = anchor ? anchor.right : viewport.width - VIEWPORT_MARGIN
  const maxLeft = Math.max(VIEWPORT_MARGIN, viewport.width - width - VIEWPORT_MARGIN)
  const left = Math.min(Math.max(right - width, VIEWPORT_MARGIN), maxLeft)

  const below = anchor ? anchor.bottom + 6 : VIEWPORT_MARGIN + 40
  const overflowsBelow = below + panel.height > viewport.height - VIEWPORT_MARGIN
  const above = anchor ? anchor.top - 6 - panel.height : VIEWPORT_MARGIN
  const top = overflowsBelow && above >= VIEWPORT_MARGIN ? above : below

  return {
    left: Math.round(left),
    top: Math.round(Math.max(VIEWPORT_MARGIN, top)),
  }
}

export const PANEL_STYLE = `
#${PANEL_ROOT_ID} {
  position: fixed;
  z-index: 999;
  display: none;
  box-sizing: border-box;
  width: ${PANEL_WIDTH}px;
  max-height: calc(100vh - 96px);
  overflow-y: auto;
  padding: 12px 14px 8px;
  border: 1px solid var(--ls-border-color, #e3e3e3);
  border-radius: 8px;
  background-color: var(--ls-primary-background-color, #fff);
  color: var(--ls-primary-text-color, #303030);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18);
  font-size: 13px;
  line-height: 1.5;
}
#${PANEL_ROOT_ID}.${PANEL_OPEN_CLASS} { display: block; }
#${PANEL_ROOT_ID} .jtp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
#${PANEL_ROOT_ID} .jtp-title { font-weight: 600; }
#${PANEL_ROOT_ID} .jtp-icon-button,
#${PANEL_ROOT_ID} .jtp-link {
  display: inline-flex;
  align-items: center;
  border: 0;
  border-radius: 4px;
  background-color: transparent;
  color: var(--ls-secondary-text-color, #8b8b8b);
  cursor: pointer;
}
#${PANEL_ROOT_ID} .jtp-icon-button { padding: 3px; }
#${PANEL_ROOT_ID} .jtp-link { padding: 3px 6px; font-size: 12px; }
#${PANEL_ROOT_ID} .jtp-icon-button:hover,
#${PANEL_ROOT_ID} .jtp-link:hover {
  background-color: var(--ls-secondary-background-color, #f0f0f0);
  color: var(--ls-primary-text-color, #303030);
}
#${PANEL_ROOT_ID} .jtp-field { margin-bottom: 12px; }
#${PANEL_ROOT_ID} .jtp-label { display: block; }
#${PANEL_ROOT_ID} .jtp-label span { display: block; margin-bottom: 4px; font-weight: 500; }
#${PANEL_ROOT_ID} .jtp-hint {
  margin: 4px 0 0;
  font-size: 11px;
  color: var(--ls-secondary-text-color, #8b8b8b);
}
#${PANEL_ROOT_ID} input,
#${PANEL_ROOT_ID} textarea {
  box-sizing: border-box;
  width: 100%;
  padding: 5px 8px;
  border: 1px solid var(--ls-border-color, #dcdcdc);
  border-radius: 4px;
  background-color: var(--ls-secondary-background-color, #fafafa);
  color: inherit;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.5;
}
#${PANEL_ROOT_ID} textarea { min-height: 54px; resize: vertical; }
#${PANEL_ROOT_ID} input:focus,
#${PANEL_ROOT_ID} textarea:focus {
  outline: none;
  border-color: var(--ls-active-primary-color, #6c8cd7);
}
#${PANEL_ROOT_ID} .jtp-preview {
  margin: 6px 0 0;
  font-size: 11px;
  color: var(--ls-secondary-text-color, #8b8b8b);
}
#${PANEL_ROOT_ID} .jtp-preview code {
  padding: 0 3px;
  border-radius: 3px;
  background-color: var(--ls-secondary-background-color, #f0f0f0);
  color: var(--ls-primary-text-color, #303030);
}
#${PANEL_ROOT_ID} .jtp-footer {
  display: flex;
  justify-content: flex-end;
  padding-top: 6px;
  border-top: 1px solid var(--ls-border-color, #ececec);
}
`

export interface SettingsPanelCallbacks {
  onChange(key: PanelFieldKey, value: string): void
  onClose(): void
  onOpenFullSettings(): void
}

export interface SettingsPanel {
  root: HTMLElement
  // Writes the stored values back into the controls, leaving a field the user is
  // typing in untouched so a settings round-trip cannot fight the caret.
  sync(values: PanelValues): void
}

export function renderSettingsPanel(
  root: HTMLElement,
  callbacks: SettingsPanelCallbacks,
): SettingsPanel {
  const doc = root.ownerDocument
  const controls = new Map<PanelFieldKey, HTMLInputElement | HTMLTextAreaElement>()

  const create = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className?: string,
    text?: string,
  ): HTMLElementTagNameMap[K] => {
    const element = doc.createElement(tag)
    if (className) element.className = className
    if (text) element.textContent = text
    return element
  }

  root.textContent = ''

  const header = create('div', 'jtp-header')
  header.append(create('span', 'jtp-title', 'Journal Time Prefix'))
  const closeButton = create('button', 'jtp-icon-button')
  closeButton.type = 'button'
  closeButton.title = 'Close'
  closeButton.append(create('i', 'ti ti-x'))
  closeButton.addEventListener('click', () => callbacks.onClose())
  header.append(closeButton)
  root.append(header)

  let updatePreview = (): void => {}

  for (const field of PANEL_FIELDS) {
    const wrapper = create('div', 'jtp-field')
    const label = create('label', 'jtp-label')
    label.append(create('span', undefined, field.label))
    const control =
      field.control === 'textarea'
        ? create('textarea')
        : Object.assign(create('input'), { type: 'text' })
    control.placeholder = field.placeholder
    control.spellcheck = false
    control.addEventListener('input', () => {
      callbacks.onChange(field.key, control.value)
      if (field.key === 'timePrefixFormat') updatePreview()
    })
    label.append(control)
    wrapper.append(label)

    if (field.key === 'timePrefixFormat') {
      const preview = create('p', 'jtp-preview')
      const sample = create('code')
      preview.append('Next block / 下一个 block：', sample, 'Note')
      wrapper.append(preview)
      updatePreview = () => {
        sample.textContent = previewTimePrefix(control.value, new Date())
      }
    }

    wrapper.append(create('p', 'jtp-hint', field.hint))
    root.append(wrapper)
    controls.set(field.key, control)
  }

  const footer = create('div', 'jtp-footer')
  const fullSettings = create('button', 'jtp-link', 'Full settings / 完整设置')
  fullSettings.type = 'button'
  fullSettings.addEventListener('click', () => callbacks.onOpenFullSettings())
  footer.append(fullSettings)
  root.append(footer)

  return {
    root,
    sync(values) {
      for (const [key, control] of controls) {
        if (doc.activeElement === control) continue
        control.value = values[key]
      }
      updatePreview()
    },
  }
}
