window.__ModuleLoader__.load({ id: 'dsh-session-dots', factory: (require) => { var module = { exports: {} }; var exports = module.exports;

// src/client/logic.js
var STATES = ["manual", "running", "feedback", "done", "error"];
var DEFAULT_CONFIG = Object.freeze({
  enabled: true,
  mode: "overlay",
  size: 8,
  offset: 6,
  ringWidth: 3,
  feedbackMarker: "ring",
  clickToToggle: true,
  colors: Object.freeze({
    manual: "#3b82f6",
    running: "#eab308",
    feedback: "#ff5a1f",
    done: "#22c55e",
    error: "#ef4444"
  }),
  manualUnreadKey: "dsm-manual-unread-v1"
});
var MODES = ["overlay", "own", "off"];
var MARKERS = ["none", "ring", "pulse", "diamond"];
function safeColor(value, fallback) {
  if (typeof value !== "string") return fallback;
  const v = value.trim();
  if (!v || v.length > 64) return fallback;
  if (/[;{}<>\\]/.test(v)) return fallback;
  return v;
}
function clampNumber(value, min, max, fallback) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
function normalizeConfig(raw) {
  const c = raw && typeof raw === "object" ? raw : {};
  const colors = { ...DEFAULT_CONFIG.colors };
  if (c.colors && typeof c.colors === "object") {
    for (const state of STATES) colors[state] = safeColor(c.colors[state], colors[state]);
  }
  let mode = MODES.includes(c.mode) ? c.mode : DEFAULT_CONFIG.mode;
  if (c.enabled === false) mode = "off";
  const manualUnreadKey = typeof c.manualUnreadKey === "string" && c.manualUnreadKey.trim() ? c.manualUnreadKey.trim() : DEFAULT_CONFIG.manualUnreadKey;
  return {
    enabled: mode !== "off",
    mode,
    size: clampNumber(c.size, 4, 16, DEFAULT_CONFIG.size),
    offset: clampNumber(c.offset, -8, 32, DEFAULT_CONFIG.offset),
    ringWidth: clampNumber(c.ringWidth, 0, 6, DEFAULT_CONFIG.ringWidth),
    feedbackMarker: MARKERS.includes(c.feedbackMarker) ? c.feedbackMarker : DEFAULT_CONFIG.feedbackMarker,
    clickToToggle: c.clickToToggle !== false,
    colors,
    manualUnreadKey
  };
}
function resolveDotState({ manualUnread = false, dataState = "", isActive = false } = {}) {
  if (manualUnread) return "manual";
  switch (String(dataState || "")) {
    case "ongoing":
    case "running":
      return "running";
    case "warning":
    case "waiting":
    case "needs-attention":
      return "feedback";
    case "error":
      return "error";
    case "done":
      return isActive ? null : "done";
    default:
      return null;
  }
}
function colorDeclarations(selectorFor, colors) {
  return STATES.map((state) => `${selectorFor(state)}{background:${colors[state]} !important}`).join("\n");
}
function buildCss(config) {
  const cfg = normalizeConfig(config);
  if (!cfg.enabled) return "";
  const overlay = colorDeclarations((s) => `[data-dsd-state="${s}"] .dsm-dot`, cfg.colors);
  const own = colorDeclarations((s) => `[data-dsd-state="${s}"] .dsd-dot`, cfg.colors);
  const marker = cfg.feedbackMarker;
  let markerCss = "";
  if (marker === "none") {
    markerCss = "";
  } else if (marker === "diamond") {
    markerCss = `
[data-dsd-state="feedback"] .dsm-dot,
[data-dsd-state="feedback"] .dsd-dot{border-radius:2px !important;transform:translateY(-50%) rotate(45deg) !important}`;
  } else {
    const ring = `box-shadow:0 0 0 ${cfg.ringWidth}px ${cfg.colors.feedback} !important`;
    const pulse = marker === "pulse" ? `animation:dsd-pulse 1.4s ease-in-out infinite !important` : "";
    markerCss = `
[data-dsd-state="feedback"] .dsm-dot,
[data-dsd-state="feedback"] .dsd-dot{${ring};${pulse}}
@keyframes dsd-pulse{0%,100%{box-shadow:0 0 0 ${cfg.ringWidth}px ${cfg.colors.feedback}}50%{box-shadow:0 0 0 ${cfg.ringWidth + 3}px transparent}}`;
  }
  const ownBase = `
.dsd-dot{position:absolute;left:${cfg.offset}px;top:50%;transform:translateY(-50%);width:${cfg.size}px;height:${cfg.size}px;border-radius:50%;box-sizing:border-box;z-index:2;pointer-events:none}
.dsd-dot[data-dsd-clickable="1"]{pointer-events:auto;cursor:pointer}`;
  const hideNative = cfg.mode === "own" ? "\n.dsm-dot{display:none !important}" : "";
  return [overlay, own, markerCss, ownBase, hideNative].filter(Boolean).join("\n");
}

// src/client/index.js
var ROW_SELECTOR = '[role="treeitem"][data-row-key^="session:"]';
var DOT_ATTR = "data-dsd-dot";
var ROW_ATTR = "data-dsd-state";
var CLICKABLE_ATTR = "data-dsd-clickable";
function sessionIdOf(row) {
  const key = row.getAttribute("data-row-key") || "";
  return key.startsWith("session:") ? key.slice("session:".length) : key;
}
function readManual(key) {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(raw) ? new Set(raw.map(String)) : /* @__PURE__ */ new Set();
  } catch (e) {
    return /* @__PURE__ */ new Set();
  }
}
function writeManual(key, set) {
  try {
    localStorage.setItem(key, JSON.stringify([...set]));
  } catch (e) {
  }
}
function install(config) {
  const cfg = normalizeConfig(config);
  const disposers = [];
  if (!cfg.enabled) return () => {
  };
  const style = document.createElement("style");
  style.setAttribute("data-dsd", "style");
  style.textContent = buildCss(cfg);
  document.head.appendChild(style);
  disposers.push(() => style.remove());
  const paint = () => {
    let rows;
    try {
      rows = document.querySelectorAll(ROW_SELECTOR);
    } catch (e) {
      return;
    }
    const manual = readManual(cfg.manualUnreadKey);
    for (const row of rows) {
      try {
        const core = row.querySelector("[data-state]");
        const dataState = core ? core.getAttribute("data-state") || "" : "";
        const isActive = row.getAttribute("aria-selected") === "true";
        const id = sessionIdOf(row);
        const state = resolveDotState({ manualUnread: manual.has(id), dataState, isActive });
        if (state) row.setAttribute(ROW_ATTR, state);
        else row.removeAttribute(ROW_ATTR);
        if (cfg.mode === "own") syncOwnDot(row, state, id);
      } catch (e) {
      }
    }
  };
  function syncOwnDot(row, state, id) {
    const existing = row.querySelector("[" + DOT_ATTR + "]");
    if (!state) {
      if (existing) existing.remove();
      return;
    }
    let dot = existing;
    if (!dot) {
      dot = document.createElement("span");
      dot.setAttribute(DOT_ATTR, "");
      dot.className = "dsd-dot";
      if (cfg.clickToToggle) dot.setAttribute(CLICKABLE_ATTR, "1");
      if (getComputedStyle(row).position === "static") row.style.position = "relative";
      dot.addEventListener("click", (event) => {
        event.stopPropagation();
        event.preventDefault();
        const set = readManual(cfg.manualUnreadKey);
        const target = dot.dataset.dsdId || "";
        if (!target) return;
        if (set.has(target)) set.delete(target);
        else set.add(target);
        writeManual(cfg.manualUnreadKey, set);
        paint();
      });
      row.insertBefore(dot, row.firstChild);
    }
    dot.dataset.dsdId = id;
  }
  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    const run = () => {
      queued = false;
      paint();
    };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
    else setTimeout(run, 16);
  };
  let observer = null;
  if (typeof MutationObserver === "function") {
    observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state", "aria-selected", "data-dsm-dot"]
    });
    disposers.push(() => observer.disconnect());
  }
  const timer = setInterval(schedule, 1e3);
  disposers.push(() => clearInterval(timer));
  paint();
  const kick1 = setTimeout(paint, 250);
  const kick2 = setTimeout(paint, 1200);
  disposers.push(() => {
    clearTimeout(kick1);
    clearTimeout(kick2);
  });
  disposers.push(() => {
    document.querySelectorAll("[" + ROW_ATTR + "]").forEach((row) => row.removeAttribute(ROW_ATTR));
    document.querySelectorAll("[" + DOT_ATTR + "]").forEach((dot) => dot.remove());
  });
  return () => {
    for (const dispose of disposers) {
      try {
        dispose();
      } catch (e) {
      }
    }
  };
}
function apply(ctx, config) {
  try {
    if (ctx && typeof ctx.effect === "function") {
      ctx.effect(() => install(config), "dsh-session-dots: sidebar dots");
      return;
    }
  } catch (e) {
    try {
      console.warn("[dsh-session-dots] ctx.effect unavailable, installing directly:", e);
    } catch (ignored) {
    }
  }
  try {
    install(config);
  } catch (e) {
    try {
      console.warn("[dsh-session-dots] install failed:", e);
    } catch (ignored) {
    }
  }
}
exports.name = "dsh-session-dots";
exports.inject = [];
exports.apply = apply;
return module.exports; } });
//# sourceMappingURL=client.js.map
