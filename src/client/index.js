// dsh-session-dots — browser half.
//
// Two modes, both driven by the same config:
//   overlay (default): leave whoever drew the dot alone, recolour it through a
//     generated stylesheet keyed on a row attribute we set. Safe to run while
//     the official session manager is still installed — nothing is duplicated.
//   own: hide the foreign dot and draw our own element. Use this when you are
//     not running another dot provider.
//
// Why the override survives any load order: the official dot is coloured with
// an *inline, non-important* style, and a stylesheet declaration carrying
// `!important` outranks it in the cascade no matter which plugin ran first or
// which one repaints last. Our selectors are attribute-based, so they also keep
// matching when the other plugin removes and recreates its element.
//
// Nothing here throws on purpose: a client plugin that fails to activate takes
// the whole web boot down, so every entry point is wrapped. HMR re-evaluates
// bundles, so install() is a singleton guarded through window.__dshSessionDots.
import { normalizeConfig, resolveDotState, buildCss } from './logic.js'

const ROW_SELECTOR = '[role="treeitem"][data-row-key^="session:"]'
const DOT_ATTR = 'data-dsd-dot'
const ROW_ATTR = 'data-dsd-state'
const CLICKABLE_ATTR = 'data-dsd-clickable'
const GLOBAL_KEY = '__dshSessionDots'

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

function parseColor(value) {
  if (typeof value !== 'string') return null
  const v = value.trim().toLowerCase()
  const hex = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/)
  if (hex) {
    const h = hex[1]
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16))
  }
  const rgb = v.match(/^rgba?\(\s*(\d+)\s*[, ]\s*(\d+)\s*[, ]\s*(\d+)/)
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]
  return null
}

function sameColor(a, b) {
  const x = parseColor(a)
  const y = parseColor(b)
  if (!x || !y) return null
  return x[0] === y[0] && x[1] === y[1] && x[2] === y[2]
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

  // Evidence that our colour actually reached the pixels: compare what the
  // browser resolved against what the config asked for. A mismatch means
  // somebody else's declaration still wins (or the state never reached us).
  const report = () => {
    const out = []
    let rows = []
    try {
      rows = [...document.querySelectorAll(ROW_SELECTOR)]
    } catch (e) {
      return out
    }
    for (const row of rows) {
      const state = row.getAttribute(ROW_ATTR)
      if (!state) continue
      const dot = row.querySelector('.dsd-dot') || row.querySelector('.dsm-dot')
      const expected = cfg.colors[state]
      const actual = dot ? getComputedStyle(dot).backgroundColor : '(no dot)'
      out.push({
        row: (row.getAttribute('data-row-key') || '').slice(0, 28),
        state,
        expected,
        actual,
        match: dot ? sameColor(actual, expected) : false,
      })
    }
    return out
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
  // slow sweep. A handful of rows once a second is not measurable.
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

  const dispose = () => {
    for (const fn of disposers) {
      try {
        fn()
      } catch (e) {
        /* best effort */
      }
    }
  }

  const handle = { config: cfg, paint, report, dispose }
  try {
    window[GLOBAL_KEY] = handle
  } catch (e) {
    /* ignore */
  }
  disposers.push(() => {
    try {
      if (window[GLOBAL_KEY] === handle) delete window[GLOBAL_KEY]
    } catch (e) {
      /* ignore */
    }
  })

  return dispose
}

function apply(ctx, config) {
  // HMR re-evaluates this bundle. A previous instance may still be installed
  // (and its observers still running), so tear it down before installing.
  try {
    const previous = window.__dshSessionDots
    if (previous && typeof previous.dispose === 'function') previous.dispose()
  } catch (e) {
    /* ignore */
  }

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
