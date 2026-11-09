import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeConfig, normalizeTargets, resolveDotState, buildCss, safeColor, DEFAULT_CONFIG } from '../src/client/logic.js'

test('defaults are stable', () => {
  const cfg = normalizeConfig(undefined)
  assert.equal(cfg.mode, 'overlay')
  assert.deepEqual(cfg.targets, ['dsm'])
  assert.equal(cfg.size, 8)
  assert.deepEqual(cfg.colors, DEFAULT_CONFIG.colors)
})

test('enabled:false forces mode off', () => {
  assert.equal(normalizeConfig({ enabled: false, mode: 'own' }).mode, 'off')
  assert.equal(buildCss({ enabled: false }), '')
})

test('targets accept array, csv, junk and empties', () => {
  assert.deepEqual(normalizeTargets(['native', 'dsm', 'native']), ['native', 'dsm'])
  assert.deepEqual(normalizeTargets('native, dsm'), ['native', 'dsm'])
  assert.deepEqual(normalizeTargets('bogus'), ['dsm'])
  assert.deepEqual(normalizeTargets([]), ['dsm'])
  assert.deepEqual(normalizeTargets(undefined), ['dsm'])
  assert.deepEqual(normalizeConfig({ targets: 'native' }).targets, ['native'])
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

test('overlay css carries the configured colours on the dsm target only by default', () => {
  const css = buildCss({ colors: { feedback: '#ff5a1f' } })
  assert.match(css, /\[data-dsd-state="feedback"\] \.dsm-dot\{background:#ff5a1f !important\}/)
  assert.doesNotMatch(css, /\[data-dsd-state="feedback"\] \[data-state\]/)
})

test('native target adds rules for the host element', () => {
  const css = buildCss({ targets: ['native'], colors: { running: '#facc15' } })
  assert.match(css, /\[data-dsd-state="running"\] \[data-state\]\{background:#facc15 !important\}/)
  assert.doesNotMatch(css, /\.dsm-dot\{background/)
})

test('both targets emit both selectors and share the marker rule', () => {
  const css = buildCss({ targets: ['dsm', 'native'], feedbackMarker: 'pulse' })
  assert.match(css, /\[data-dsd-state="feedback"\] \.dsm-dot/)
  assert.match(css, /\[data-dsd-state="feedback"\] \[data-state\]/)
  assert.match(css, /animation:dsd-pulse/)
})

test('own mode hides both foreign dots and draws its own geometry', () => {
  const css = buildCss({ mode: 'own', size: 10, offset: 4 })
  assert.match(css, /\.dsm-dot\{display:none !important\}/)
  assert.match(css, /\[data-state\]\{display:none !important\}/)
  assert.match(css, /width:10px;height:10px/)
  assert.match(css, /left:4px/)
})

test('feedback marker variants', () => {
  assert.equal(buildCss({ feedbackMarker: 'none' }).includes('dsd-pulse'), false)
  assert.match(buildCss({ feedbackMarker: 'ring' }), /box-shadow:0 0 0 3px #ff5a1f !important/)
  assert.match(buildCss({ feedbackMarker: 'pulse' }), /animation:dsd-pulse/)
  assert.match(buildCss({ feedbackMarker: 'diamond' }), /rotate\(45deg\)/)
})
