import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeConfig, resolveDotState, buildCss, safeColor, DEFAULT_CONFIG } from '../src/client/logic.js'

test('defaults are stable', () => {
  const cfg = normalizeConfig(undefined)
  assert.equal(cfg.mode, 'overlay')
  assert.equal(cfg.size, 8)
  assert.equal(cfg.offset, 6)
  assert.deepEqual(cfg.colors, DEFAULT_CONFIG.colors)
})

test('enabled:false forces mode off', () => {
  assert.equal(normalizeConfig({ enabled: false, mode: 'own' }).mode, 'off')
  assert.equal(buildCss({ enabled: false }), '')
})

test('numbers are clamped, junk falls back', () => {
  assert.equal(normalizeConfig({ size: 99 }).size, 16)
  assert.equal(normalizeConfig({ size: 1 }).size, 4)
  assert.equal(normalizeConfig({ offset: -99 }).offset, -8)
  assert.equal(normalizeConfig({ size: 'abc' }).size, 8)
  assert.equal(normalizeConfig({ mode: 'nope' }).mode, 'overlay')
  assert.equal(normalizeConfig({ feedbackMarker: 'nope' }).feedbackMarker, 'ring')
})

test('colours that could break out of CSS are rejected', () => {
  assert.equal(safeColor('red} .x{color:red', '#000'), '#000')
  assert.equal(safeColor('red; background:url(x)', '#000'), '#000')
  assert.equal(safeColor('', '#000'), '#000')
  assert.equal(safeColor('#ff5a1f', '#000'), '#ff5a1f')
  assert.equal(safeColor('var(--x)', '#000'), 'var(--x)')
})

test('state precedence matches the host dot', () => {
  assert.equal(resolveDotState({ manualUnread: true, dataState: 'ongoing' }), 'manual')
  assert.equal(resolveDotState({ dataState: 'ongoing' }), 'running')
  assert.equal(resolveDotState({ dataState: 'running' }), 'running')
  assert.equal(resolveDotState({ dataState: 'warning' }), 'feedback')
  assert.equal(resolveDotState({ dataState: 'waiting' }), 'feedback')
  assert.equal(resolveDotState({ dataState: 'needs-attention' }), 'feedback')
  assert.equal(resolveDotState({ dataState: 'error' }), 'error')
  assert.equal(resolveDotState({ dataState: 'done' }), 'done')
  assert.equal(resolveDotState({ dataState: 'done', isActive: true }), null)
  assert.equal(resolveDotState({ dataState: 'idle' }), null)
  assert.equal(resolveDotState({}), null)
})

test('css carries the configured colours and the overlay selectors', () => {
  const css = buildCss({ colors: { feedback: '#ff5a1f', running: '#facc15' }, mode: 'overlay' })
  assert.match(css, /\[data-dsd-state="feedback"\] \.dsm-dot\{background:#ff5a1f !important\}/)
  assert.match(css, /\[data-dsd-state="running"\] \.dsm-dot\{background:#facc15 !important\}/)
  assert.doesNotMatch(css, /\.dsm-dot\{display:none/)
})

test('own mode hides the foreign dot and draws its own geometry', () => {
  const css = buildCss({ mode: 'own', size: 10, offset: 4 })
  assert.match(css, /\.dsm-dot\{display:none !important\}/)
  assert.match(css, /width:10px;height:10px/)
  assert.match(css, /left:4px/)
})

test('feedback marker variants', () => {
  assert.equal(buildCss({ feedbackMarker: 'none' }).includes('dsd-pulse'), false)
  assert.match(buildCss({ feedbackMarker: 'ring' }), /box-shadow:0 0 0 3px #ff5a1f !important/)
  assert.match(buildCss({ feedbackMarker: 'pulse' }), /animation:dsd-pulse/)
  assert.match(buildCss({ feedbackMarker: 'diamond' }), /rotate\(45deg\)/)
})
