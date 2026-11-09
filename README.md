# dsh-session-dots

可配置的 DSH 侧栏会话状态圆点。解决一个具体问题：**会话在「弹审批等待反馈」和「正在运行」时，原生状态点几乎同色，看不出区别。**

它不改官方插件、不动 profile 之外的东西，两种工作模式：

| 模式 | 行为 | 适用 |
|---|---|---|
| `overlay`（默认） | 不新建元素，只通过注入的样式表**改色**已有圆点，并给审批态加环/脉冲/菱形标记 | 官方 `dsh-sessions-manager` 仍在用，你只想改配色与审批辨识度 |
| `own` | 隐藏别的插件画的 `.dsm-dot`，**自己画**圆点（颜色、尺寸、偏移、点击标未读都可配） | 想完全接管这一格 |
| `off` | 什么都不做（`enabled: false` 等价） | 临时停用 |

## 配置

在 profile 的 `cordis.patch.yml` 里按 id 覆盖（整段 config 会替换插件 bundle 里的默认值，缺省字段仍取默认）：

```yaml
- update:
    - id: dsh-session-dots
      config:
        mode: overlay            # overlay | own | off
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

配色只接受普通 CSS 颜色（`#rgb`、`#rrggbb`、`rgb()`、`var(--x)`），长度 ≤64，含 `; { } < > \\` 的值会被丢弃并回退默认——因为它会被拼进样式表。

## 状态语义

与宿主原生点一致，优先级从高到低：

1. `manual` —— 本地标记未读（`manualUnreadKey` 里的会话 id）；
2. `running` —— 宿主 `data-state` 为 `ongoing` / `running`；
3. `feedback` —— `warning` / `waiting` / `needs-attention`；
4. `error` —— `error`；
5. `done` —— `done` 且该行不是当前选中会话；
6. 其余（`idle`、选中态下的 `done`）不显示。

## 安装

两种方式，任选其一（本仓库交付时**未**改动你的 profile）：

```powershell
# A. 用 DSH 的插件命令加本地目录
dsh plugin --profile web add "C:\path\to\dsh-session-dots"

# B. 手工改 profile 的 package.json：dependencies 里加
#    "dsh-session-dots": "file:C:/path/to/dsh-session-dots"
#    再把它加进 dsh.profile.bundles，然后安装/重启
```

装完后在设置 → 插件里能看到 `dsh-session-dots`，改配置后重启 DSH 生效。

## 验证

```js
// 1. 行上有没有被打标
[...document.querySelectorAll('[role="treeitem"][data-row-key^="session:"]')]
  .map(r => [r.dataset.rowKey.slice(0, 24), r.getAttribute('data-dsd-state')])

// 2. 样式表是否注入（overlay 模式下改色的来源）
document.querySelector('style[data-dsd]')?.textContent.slice(0, 200)

// 3. own 模式是否接管
document.querySelectorAll('[data-dsd-dot]').length
```

审批弹窗出现时，对应行应为 `data-dsd-state="feedback"`，圆点呈配置的橙红并带环/脉冲；运行中的行是 `running`，保持黄色。

## 与官方插件共存

- `overlay` 模式**不产生新元素**，所以不会出现两个点；它只覆盖颜色/描边，官方插件的点击、归档、菜单全部照旧。
- `own` 模式会隐藏 `.dsm-dot`（官方插件的点），由本插件接管；官方其余功能不受影响。切回 `overlay` 或 `off` 后立即恢复官方的点。
- 两者共用 `dsm-manual-unread-v1`，手动标记未读的状态互通。

## 已知依赖与限制

- 依赖宿主结构：行选择器 `[role="treeitem"][data-row-key^="session:"]`、状态元素 `[data-state]`。这些假设与官方插件一致；DSH 改版时两边会一起失效。
- `overlay` 模式如果没有任何插件在画点，就没有东西可改色（此时用 `own`）。
- 圆点状态来自宿主 `data-state`；若宿主在审批时仍报 `ongoing`，那它和运行中就是同一状态，任何配色都分不开（此时需要监听审批弹窗另做标记，本版本未做）。

## 构建与测试

```powershell
node build.mjs              # 优先 esbuild；环境禁止派生子进程时自动回退 build-plain.mjs
node --test tests/*.test.js # 纯逻辑单测（配置归一化、状态映射、CSS 生成）
```

产物：`lib/index.js`（host 半，ESM）、`lib/client.js`（浏览器半，CJS + `__ModuleLoader__` 握手）。

## 来源与许可

MIT。圆点的状态判定与优先级参考了上游 [TOBYCAI/dsh-sessions-manager](https://github.com/TOBYCAI/dsh-sessions-manager)（亦为 MIT）的 `installSidebarStatusDots`，见 [NOTICE](./NOTICE)。本包为独立插件（新 id），不包含上游其余功能。
