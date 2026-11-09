// dsh-session-dots — browser half.
//
// Two modes, both driven by the same config:
//   overlay (default): leave whoever drew the dot alone, recolour it through a
//     generated stylesheet keyed on a row attribute we set. Safe to run while
//     the official session manager is still installed — nothing is duplicated.
//   own: hide the foreign dot and draw our own element. Use this when you are
//     not running another dot provider.
//
// Nothing here throws on purpose: a client plugin that fails to activate takes
// the whole web boot down, so every entry point is wrapped.
import { normalizeConfig, resolveDotState, buildCss } from './logic.js'

const ROW_SELECTOR = '[role="treeitem"][data-row-key^="session:"]'
const DOT_ATTR = 'data-dsd-dot'
const ROW_ATTR = 'data-dsd-state'
const CLICKABLE_ATTR = 'data-dsd-clickable'

function sessionIdOf(row) {
  const key = row.getAttribute('data-row-key') || ''
  return key.startsWith('session:') ? key.slice('session:'.length) : key
}

function readManual(key) {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(raw) ? new Set(raw.map(String)) : new Set()
  } catch (e) {
    return new Set()
  }
}

function writeManual(key, set) {
  try {
    localStorage.setItem(key, JSON.stringify([...set]))
  } catch (e) {
    /* storage disabled: the dot still works, the mark just will not persist */
  }
}

function install(config) {
  const cfg = normalizeConfig(config)
  const disposers = []
  if (!cfg.enabled) return () => {}

  const style = document.createElement('style')
  style.setAttribute('data-dsd', 'style')
  style.textContent = buildCss(cfg)
  document.head.appendChild(style)
  disposers.push(() => style.remove())

  const paint = () => {
    let rows
    try {
      rows = document.querySelectorAll(ROW_SELECTOR)
    } catch (e) {
      return
    }
    const manual = readManual(cfg.manualUnreadKey)
    for (const row of rows) {
      try {
        const core = row.querySelector('[data-state]')
        const dataState = core ? core.getAttribute('data-state') || '' : ''
        const isActive = row.getAttribute('aria-selected') === 'true'
        const id = sessionIdOf(row)
        const state = resolveDotState({ manualUnread: manual.has(id), dataState, isActive })

        if (state) row.setAttribute(ROW_ATTR, state)
        else row.removeAttribute(ROW_ATTR)

        if (cfg.mode === 'own') syncOwnDot(row, state, id)
      } catch (e) {
        /* one broken row must not stop the rest */
      }
    }
  }

  function syncOwnDot(row, state, id) {
    const existing = row.querySelector('[' + DOT_ATTR + ']')
    if (!state) {
      if (existing) existing.remove()
      return
    }
    let dot = existing
    if (!dot) {
      dot = document.createElement('span')
      dot.setAttribute(DOT_ATTR, '')
      dot.className = 'dsd-dot'
      if (cfg.clickToToggle) dot.setAttribute(CLICKABLE_ATTR, '1')
      if (getComputedStyle(row).position === 'static') row.style.position = 'relative'
      dot.addEventListener('click', (event) => {
        event.stopPropagation()
        event.preventDefault()
        const set = readManual(cfg.manualUnreadKey)
        const target = dot.dataset.dsdId || ''
        if (!target) return
        if (set.has(target)) set.delete(target)
        else set.add(target)
        writeManual(cfg.manualUnreadKey, set)
        paint()
      })
      row.insertBefore(dot, row.firstChild)
    }
    dot.dataset.dsdId = id
  }

  let queued = false
  const schedule = () => {
    if (queued) return
    queued = true
    const run = () => {
      queued = false
      paint()
    }
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run)
    else setTimeout(run, 16)
  }

  let observer = null
  if (typeof MutationObserver === 'function') {
    observer = new MutationObserver(schedule)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-state', 'aria-selected', 'data-dsm-dot'],
    })
    disposers.push(() => observer.disconnect())
  }

  // The sidebar mounts asynchronously and some state changes are not DOM
  // mutations we can observe (the host may only update its own store), so keep a
  // slow sweep. Three rows of work once a second is not measurable.
  const timer = setInterval(schedule, 1000)
  disposers.push(() => clearInterval(timer))

  paint()
  const kick1 = setTimeout(paint, 250)
  const kick2 = setTimeout(paint, 1200)
  disposers.push(() => {
    clearTimeout(kick1)
    clearTimeout(kick2)
  })

  disposers.push(() => {
    document.querySelectorAll('[' + ROW_ATTR + ']').forEach((row) => row.removeAttribute(ROW_ATTR))
    document.querySelectorAll('[' + DOT_ATTR + ']').forEach((dot) => dot.remove())
  })

  return () => {
    for (const dispose of disposers) {
      try {
        dispose()
      } catch (e) {
        /* best effort */
      }
    }
  }
}

function apply(ctx, config) {
  try {
    if (ctx && typeof ctx.effect === 'function') {
      ctx.effect(() => install(config), 'dsh-session-dots: sidebar dots')
      return
    }
  } catch (e) {
    try {
      console.warn('[dsh-session-dots] ctx.effect unavailable, installing directly:', e)
    } catch (ignored) {}
  }
  try {
    install(config)
  } catch (e) {
    try {
      console.warn('[dsh-session-dots] install failed:', e)
    } catch (ignored) {}
  }
}

exports.name = 'dsh-session-dots'
exports.inject = []
exports.apply = apply
