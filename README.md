# dsh-session-dots

可配置的 DSH 侧栏会话状态圆点。

要解决的具体问题：会话「弹审批等待反馈」和「正在运行」时，原生状态点几乎同色，看不出区别。

> **前提说明**：本插件只能改**表现**。它读宿主的 `data-state`；如果宿主在审批时仍上报 `ongoing`（与运行中同值），那两者在信息层就没有区别，任何配色都分不开。这种情况需要监听审批弹窗另做标记，本版本未实现（见「已知限制」）。

它不改官方插件的代码，只接管「一个圆点长什么样」。三种模式：

| 模式 | 行为 | 适用 |
|---|---|---|
| `overlay`（默认） | 不新建元素，用注入的样式表**改色**已有圆点，并给审批态加环/脉冲/菱形 | 别的插件在画点，或宿主的原生点在显示；你只想改配色与辨识度 |
| `own` | 隐藏所有外来圆点（`.dsm-dot` 与行内 `[data-state]`），**自己画** | 想完全接管这一格，或不想依赖任何别的点插件 |
| `off` | 什么都不做（`enabled: false` 等价） | 临时停用 |

## 配置

在 profile 的 `cordis.patch.yml` 里按 id 覆盖（整段 config 会替换插件 bundle 里的默认值，缺省字段仍取默认）：

```yaml
- update:
    - id: dsh-session-dots
      config:
        mode: overlay            # overlay | own | off
        targets: [dsm]           # dsm | native（可同时给两个）
        size: 8                  # own 模式圆点直径，4–16
        offset: 6                # own 模式距行首，-8–32
        ringWidth: 3             # 审批环宽度，0–6
        feedbackMarker: pulse    # none | ring | pulse | diamond
        clickToToggle: true      # own 模式下点圆点切换「手动未读」
        manualUnreadKey: dsm-manual-unread-v1
        colors:
          manual:   '#3b82f6'    # 手动标未读（蓝）
          running:  '#eab308'    # 正在运行（黄）
          feedback: '#ff5a1f'    # 等待审批/反馈（橙红 —— 关键差异）
          done:     '#22c55e'    # 完成未读（绿）
          error:    '#ef4444'    # 出错（红）
```

配色只接受普通 CSS 颜色（`#rgb`、`#rrggbb`、`rgb()`、`var(--x)`），长度 ≤64；包含 `; { } < >` 或反斜杠的值会被丢弃并回退默认——因为它会被拼进样式表。

## targets：改谁的点

| 值 | 目标选择器 | 什么时候可见 |
|---|---|---|
| `dsm`（默认） | `[data-dsd-state="x"] .dsm-dot` | 有别的插件（如 `dsh-sessions-manager`）在画点时 |
| `native` | `[data-dsd-state="x"] [data-state]` | 没有插件画点、宿主自己的原生点露出来时 |

两个都写就两条规则都发：`targets: [dsm, native]`。这样无论旁边有没有别的圆点插件，`overlay` 都能上色。

- 有 `dsh-sessions-manager` 在跑时，`native` 规则是**惰性**的（那个元素被它 `display:none` 了），无害；卸载它之后才生效。
- `native` 直接作用于宿主内部元素，比 `dsm` 稍微激进；判据仍是同一个 `data-state` 属性。
- `own` 模式不看 targets：它自己画点，并同时隐藏 `.dsm-dot` 与行内 `[data-state]`。

## 状态语义

与宿主原生点一致，优先级从高到低：

1. `manual` —— 本地标记未读（`manualUnreadKey` 里的会话 id）；
2. `running` —— 宿主 `data-state` 为 `ongoing` / `running`；
3. `feedback` —— `warning` / `waiting` / `needs-attention`；
4. `error` —— `error`；
5. `done` —— `done` 且该行不是当前选中会话；
6. 其余（`idle`、选中态下的 `done`）不显示。

## 验证

```js
// 0. 插件是否已加载（HMR 或重启之后）
!!document.querySelector('style[data-dsd]')          // true = 已加载
typeof window.__dshSessionDots                       // 'object' = 已装

// 1. 每行归类结果
[...document.querySelectorAll('[role="treeitem"][data-row-key^="session:"]')]
  .map(r => [r.dataset.rowKey.slice(0, 24), r.getAttribute('data-dsd-state')])

// 2. 覆盖是否真的到了像素上
__dshSessionDots.report()   // [{ row, state, expected, actual, match }]
                            // match:true 才算覆盖成功

// 3. own 模式是否接管
document.querySelectorAll('[data-dsd-dot]').length
```

审批弹窗出现时，对应行应为 `data-dsd-state="feedback"`，圆点呈配置的橙红并带环/脉冲；运行中的行是 `running`，保持黄色。

## 覆盖自检（为什么不依赖加载顺序）

官方圆点用的是**内联样式**（非 important），本插件注入的是带 `!important` 的样式表规则。按 CSS 层叠：important 的作者样式 **永远压过** 非 important 的内联声明——与两个插件谁先加载、谁后重绘都无关。选择器又基于行属性 `[data-dsd-state]`，所以对方删掉再重建圆点，规则依然命中。

HMR 会重复求值 bundle，`apply()` 里做了幂等守卫：先 `dispose()` 上一个实例，再装新的，避免 observer / 定时器叠加。

## 与官方插件共存

- `overlay` 模式**不产生新元素**，不会出现两个点；只覆盖颜色/描边，官方插件的点击、归档、菜单全部照旧。
- `own` 模式隐藏 `.dsm-dot` 与行内 `[data-state]`，由本插件接管；官方其余功能不受影响。切回 `overlay` 或 `off` 后立即恢复。
- 两者共用 `dsm-manual-unread-v1`，手动标记未读的状态互通。

## 安装 / 更新 / 卸载

本机现状：已以 `link:` 方式装入 web profile，指向本仓库工作区。

```powershell
# 安装（本地目录）
dsh plugin --profile web add "C:\Users\laios\Documents\DSH - SIMPLE\dsh-session-dots"

# 从 GitHub 安装（pnpm 原生支持 github: 协议；本机未实测）
dsh plugin --profile web add github:nysparia/dsh-session-dots

# 卸载
dsh plugin --profile web remove dsh-session-dots
```

安装会同时把它写进 profile 的 `package.json`（`dependencies` 与 `dsh.profile.bundles`）。

因为是 `link:` 安装，改代码后只需 `node build.mjs`，再让宿主重载（热重载或重启）即可，不必重装。配置改动则一定需要重启 DSH。

## 已知限制

- 依赖宿主结构：行选择器 `[role="treeitem"][data-row-key^="session:"]`、状态元素 `[data-state]`。这些假设与官方插件一致；DSH 改版时两边会一起失效。
- 圆点状态来自宿主 `data-state`；若宿主在审批时仍报 `ongoing`，两者在信息层相同，任何配色都分不开（需要监听审批弹窗，本版本未做）。
- `native` 目标直接作用于宿主内部元素，属于比 `dsm` 更强的耦合。

## 构建与测试

```powershell
node build.mjs               # 优先 esbuild；环境禁止派生子进程时自动回退 build-plain.mjs
node --test tests/*.test.js  # 11 个纯逻辑单测（配置归一化、目标解析、状态映射、CSS 生成）
```

产物：`lib/index.js`（host 半，ESM）、`lib/client.js`（浏览器半，CJS + `__ModuleLoader__` 握手）。

## 变更记录

- **0.2.0** —— 新增 `targets`（`dsm` / `native`）；`own` 模式同时隐藏宿主原生点；HMR 幂等守卫；`__dshSessionDots.report()` 覆盖自检。
- **0.1.0** —— 首个版本：`overlay` / `own` 两种模式、5 色可配、审批态环/脉冲/菱形标记。

## 来源与许可

MIT。圆点的状态判定与优先级参考了上游 [TOBYCAI/dsh-sessions-manager](https://github.com/TOBYCAI/dsh-sessions-manager)（亦为 MIT）的 `installSidebarStatusDots`，见 [NOTICE](./NOTICE) 与 [LICENSE-UPSTREAM](./LICENSE-UPSTREAM)。本包为独立插件（新 id），不包含上游其余功能。
