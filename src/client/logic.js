// Pure logic for dsh-session-dots: config normalisation, host-state mapping and
// stylesheet generation. No DOM access here, so it is unit-testable in Node.
//
// The state names and their precedence mirror the behaviour the sidebar dot has
// in DSH's own session list: a manually-marked-unread session wins over
// everything, then the live host state, and `done` hides itself while the row
// is the one you are currently looking at.

export const STATES = ['manual', 'running', 'feedback', 'done', 'error']

// Which elements a dot can live on:
//   dsm    — the .dsm-dot element another plugin (dsh-sessions-manager) draws
//   native — the host's own [data-state] element, visible when nobody hides it
export const TARGETS = ['dsm', 'native']

export const DEFAULT_CONFIG = Object.freeze({
  enabled: true,
  mode: 'overlay',
  targets: Object.freeze(['dsm']),
  size: 8,
  offset: 6,
  ringWidth: 3,
  feedbackMarker: 'ring',
  clickToToggle: true,
  colors: Object.freeze({
    manual: '#3b82f6',
    running: '#eab308',
    feedback: '#ff5a1f',
    done: '#22c55e',
    error: '#ef4444',
  }),
  manualUnreadKey: 'dsm-manual-unread-v1',
})

const MODES = ['overlay', 'own', 'off']
const MARKERS = ['none', 'ring', 'pulse', 'diamond']

// A colour ends up inside a generated stylesheet, so refuse anything that could
// close a declaration or a rule. Length-capped as well: real colours are short.
export function safeColor(value, fallback) {
  if (typeof value !== 'string') return fallback
  const v = value.trim()
  if (!v || v.length > 64) return fallback
  if (/[;{}<>\\]/.test(v)) return fallback
  return v
}

function clampNumber(value, min, max, fallback) {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

export function normalizeTargets(value) {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : []
  const out = []
  for (const item of raw) {
    const target = String(item).trim().toLowerCase()
    if (TARGETS.includes(target) && !out.includes(target)) out.push(target)
  }
  return out.length ? out : [...DEFAULT_CONFIG.targets]
}

export function normalizeConfig(raw) {
  const c = raw && typeof raw === 'object' ? raw : {}
  const colors = { ...DEFAULT_CONFIG.colors }
  if (c.colors && typeof c.colors === 'object') {
    for (const state of STATES) colors[state] = safeColor(c.colors[state], colors[state])
  }
  let mode = MODES.includes(c.mode) ? c.mode : DEFAULT_CONFIG.mode
  if (c.enabled === false) mode = 'off'
  const manualUnreadKey =
    typeof c.manualUnreadKey === 'string' && c.manualUnreadKey.trim()
      ? c.manualUnreadKey.trim()
      : DEFAULT_CONFIG.manualUnreadKey
  return {
    enabled: mode !== 'off',
    mode,
    targets: normalizeTargets(c.targets),
    size: clampNumber(c.size, 4, 16, DEFAULT_CONFIG.size),
    offset: clampNumber(c.offset, -8, 32, DEFAULT_CONFIG.offset),
    ringWidth: clampNumber(c.ringWidth, 0, 6, DEFAULT_CONFIG.ringWidth),
    feedbackMarker: MARKERS.includes(c.feedbackMarker) ? c.feedbackMarker : DEFAULT_CONFIG.feedbackMarker,
    clickToToggle: c.clickToToggle !== false,
    colors,
    manualUnreadKey,
  }
}

/**
 * Which dot (if any) a session row should show.
 * @param {{manualUnread?: boolean, dataState?: string, isActive?: boolean}} input
 * @returns {'manual'|'running'|'feedback'|'done'|'error'|null}
 */
export function resolveDotState({ manualUnread = false, dataState = '', isActive = false } = {}) {
  if (manualUnread) return 'manual'
  switch (String(dataState || '')) {
    case 'ongoing':
    case 'running':
      return 'running'
    case 'warning':
    case 'waiting':
    case 'needs-attention':
      return 'feedback'
    case 'error':
      return 'error'
    case 'done':
      return isActive ? null : 'done'
    default:
      return null
  }
}

const SELECTOR_OF = {
  dsm: (state) => `[data-dsd-state="${state}"] .dsm-dot`,
  native: (state) => `[data-dsd-state="${state}"] [data-state]`,
}
const FEEDBACK_OF = {
  dsm: '[data-dsd-state="feedback"] .dsm-dot',
  native: '[data-dsd-state="feedback"] [data-state]',
}

function colorDeclarations(selectorFor, colors) {
  return STATES.map((state) => `${selectorFor(state)}{background:${colors[state]} !important}`).join('\n')
}

/**
 * Builds the stylesheet for both modes.
 * - overlay: recolours dots another plugin / the host already drew. Selectors
 *   key off the row attribute we set, so they do not depend on load order or on
 *   the other plugin's inline colour strings.
 * - own: recolours and shapes the dot we draw ourselves, and hides every foreign
 *   dot first.
 */
export function buildCss(config) {
  const cfg = normalizeConfig(config)
  if (!cfg.enabled) return ''

  const overlay = cfg.targets
    .map((target) => colorDeclarations(SELECTOR_OF[target], cfg.colors))
    .join('\n')
  const own = colorDeclarations((state) => `[data-dsd-state="${state}"] .dsd-dot`, cfg.colors)

  const markerTargets = [
    ...cfg.targets.map((target) => FEEDBACK_OF[target]),
    '[data-dsd-state="feedback"] .dsd-dot',
  ]

  const marker = cfg.feedbackMarker
  let markerCss = ''
  if (marker === 'none') {
    markerCss = ''
  } else if (marker === 'diamond') {
    markerCss = `
${markerTargets.join(',\n')}{border-radius:2px !important;transform:translateY(-50%) rotate(45deg) !important}`
  } else {
    const ring = `box-shadow:0 0 0 ${cfg.ringWidth}px ${cfg.colors.feedback} !important`
    const pulse = marker === 'pulse' ? `animation:dsd-pulse 1.4s ease-in-out infinite !important` : ''
    markerCss = `
${markerTargets.join(',\n')}{${ring};${pulse}}
@keyframes dsd-pulse{0%,100%{box-shadow:0 0 0 ${cfg.ringWidth}px ${cfg.colors.feedback}}50%{box-shadow:0 0 0 ${cfg.ringWidth + 3}px transparent}}`
  }

  const ownBase = `
.dsd-dot{position:absolute;left:${cfg.offset}px;top:50%;transform:translateY(-50%);width:${cfg.size}px;height:${cfg.size}px;border-radius:50%;box-sizing:border-box;z-index:2;pointer-events:none}
.dsd-dot[data-dsd-clickable="1"]{pointer-events:auto;cursor:pointer}`

  // own mode owns the dot slot, so every foreign dot goes away — both the one
  // another plugin draws and the host's own element (which is what surfaces when
  // no other dot plugin is installed).
  const hideForeign =
    cfg.mode === 'own'
      ? '\n.dsm-dot{display:none !important}\n[role="treeitem"] [data-state]{display:none !important}'
      : ''

  return [overlay, own, markerCss, ownBase, hideForeign].filter(Boolean).join('\n')
}
