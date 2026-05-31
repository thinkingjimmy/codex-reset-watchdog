# codex-reset-watchdog

[English README](README.md)

这是一个零依赖 Codex skill 仓库，用 **Codex Automation** 通过 Dayclaw 公共 X source 监控 [`@thsottiaux`](https://x.com/thsottiaux)。脚本会把所有新抓到且未处理过的 item 交给 Automation LLM 判断；只有 LLM 发现 Codex usage / quota / rate-limit reset 信号时，才通过 Codex Automation / Triage 输出 finding。

## 功能

- 一段 prompt 完成 setup：Codex 从 GitHub 安装 skill、跑基础验证、初始化 state，并创建 hourly Automation。
- 不需要付费 API key：默认 source 是 `https://apitest.dayclaw.com/api/source/public/x/thsottiaux/items`。
- 判断更像人：Codex Automation LLM 会审阅所有新 item，减少规则预筛带来的漏判。
- 只在值得注意时打扰：没有 reset / refill / restored allowance 信号时不发 Triage、不写 routine memory。
- 不重复提醒：同一个 item 只处理一次，后续新消息仍可继续触发。
- 网络抖动不刷屏：短暂 Dayclaw DNS/network 失败不会立刻变成噪声告警。
- Automation 运行结果返回人话总结：用户点 Test 或查看 run log 时，不应该看到整坨 JSON。
- 通知面单一：所有结果只进入 Codex Automation / Triage，不外发到聊天软件或 webhook。

## Skill 结构

这个仓库本身就是一个单 skill 目录：根目录放 `SKILL.md`，旁边放可选的 `agents/`、`references/`、`scripts/`。如果要嵌入到另一个仓库，把本目录复制到 `.agents/skills/codex-reset-watchdog/`。

```text
codex-reset-watchdog/
  .codex/
    config.toml                   # Codex 最小权限 profile
    rules/
      codex-reset-watchdog.rules  # 旧 sandbox 模式下的命令级网络兜底
  SKILL.md                         # skill 元数据和运行指令
  README.md                        # 英文说明
  README.zh-CN.md                  # 中文说明
  env.example                      # 可见配置模板
  .gitignore                       # 忽略缓存和本地状态
  agents/
    openai.yaml                    # 可选 Codex skill 展示元数据
  references/
    automation-prompt.md           # 创建 Codex Automation 时使用的 prompt
    deployment.md                  # 运行维护清单
    llm-judge-rubric.md            # LLM 审阅 review_items 的规则
  scripts/
    check_once.mjs                 # 零依赖 Automation 入口
    self_test.mjs                  # 本地确定性自测
```

## 一段 Prompt 完成安装

打开 Codex，直接复制这段 prompt。Codex 应该自己安装 skill、跑基础检查、初始化基线 state，并创建每小时运行的 Automation。

```text
请从 GitHub 安装并设置 codex-reset-watchdog skill：
https://github.com/thinkingjimmy/codex-reset-watchdog

优先使用 Codex 的 skill installation workflow。如果没有可用 installer，就 clone 这个 repo，并把该目录作为 Automation working directory。

安装后：
1. 找到包含 SKILL.md 和 scripts/check_once.mjs 的 skill 目录。
2. 运行 node scripts/self_test.mjs。
3. 运行 node scripts/check_once.mjs --prime-state --json 创建基线 state。
4. 运行 node scripts/check_once.mjs --dry-run --json 一次，确认 Dayclaw public source、JSON 解析和 state 去重正常。
5. 创建一个每小时运行的 Codex Automation：
   - working directory：已安装的 codex-reset-watchdog 目录
   - command：node scripts/check_once.mjs --json
   - prompt：完整使用 references/automation-prompt.md，不要自由改写
   - permissions：优先使用项目 .codex/config.toml 里的 codex-reset-watchdog-net；否则只授予 workspace write 和到 apitest.dayclaw.com 的 outbound HTTPS
6. 最后给我一个简洁 setup 总结：成功/失败、Automation 频率、working directory、state 路径，以及我点击 Codex Test 按钮时应该看到什么。

不要贴原始 JSON，除非我明确要求。不要开启 full access，除非窄网络权限路径不可用，并且你先解释取舍。
```

不需要申请 API key。默认 source 是：

```text
https://apitest.dayclaw.com/api/source/public/x/thsottiaux/items
```

Codex 会先验证脚本能跑，再把当前已有 public items 标记为基线，最后用 [`references/automation-prompt.md`](references/automation-prompt.md) 的完整内容创建定时 Automation。之后你只需要等 Triage finding；没有 reset 信号时不会打扰你。

底层 Automation 规则写在 [`references/automation-prompt.md`](references/automation-prompt.md)，LLM 判断标准写在 [`references/llm-judge-rubric.md`](references/llm-judge-rubric.md)。创建 Automation 时应当使用这些文件作为准绳，而不是让 Codex 临场发挥。

## Test 应该显示什么

Setup 后，点击 Codex Automations 里的 **Test**。Codex 对 Test 和定时运行使用同一份 Automation prompt，所以每次运行都会用一段简短 LLM 总结收尾，例如：

```text
Codex Reset Watchdog 运行正常。
- Dayclaw public source 可达。
- state 持久化在 var/state.json。
- 基线之后没有新的 public items。
- 没有发现 Codex usage/quota/rate-limit reset 信号。
```

结果不应该直接贴 `check_once.mjs --json` 的完整对象。健康 no-op 运行不应创建 Triage finding、不应外发通知、不应写 routine memory；简短总结可以出现在 Automation run log 和 Test 结果里。

## 状态与去重

`STATE_FILE_PATH` 指向持久 JSON 文件：

- `seen_tweets`：同一 public source item 不会每次重复交给 LLM。
- `operational_failures`：记录连续 Dayclaw 网络故障。
- 未来新的 reset item 有新 tweet/item ID，仍然可以进入 LLM 审阅并产生 finding。

默认状态文件位置：

```env
STATE_FILE_PATH=var/state.json
```

`var/` 已被 git 忽略，并且在 Codex 沙箱运行时可写。如果你自己配置了 home 目录下的路径而 Codex 没有权限写入，脚本会自动 fallback 到 `var/state.json`，并在输出 JSON 的 `state` 字段里说明。

## 输出格式

`check_once.mjs --json` 输出一个 JSON 对象。重要字段：

- `status`：`ok`、`primed`、`state_updated`、`transient_network_error`、`network_diagnostic` 或 `error`。
- `source_url`：本次使用的 Dayclaw public source endpoint。
- `review_count`：交给 LLM 审阅的新 item 数量。
- `has_review_items`：`review_items` 是否非空。
- `review_items`：所有新的未见 item，包含正文、URL、作者、回复元数据、event key 和可用上下文字段。
- `api_pages`：API 返回摘要，包括返回键、source URL、limit 和提取到的 item 数量。
- `api_warning`：API 成功但没有提取到任何 item 时出现。
- `state`：实际使用的状态文件路径、用户请求的路径、是否发生 fallback，以及相关 warning。
- `fetch_strategy`：固定为 `dayclaw_public_items`。
- `llm_instruction`：给 Automation LLM 的简短判断指令。
- `operational_error`：网络或运行错误；是否报警由 Automation prompt 决定。
- `results`：每条 item 的处理细节，例如 `queued_for_llm`、`already_seen`、`ignored_reply`。

`apitest.dayclaw.com` 的 DNS 抖动会在同一轮内自动重试。如果重试后仍失败，脚本会输出 `status: "transient_network_error"` 并正常退出，避免一次网络抖动就刷 Triage。

## Public Source 说明

Dayclaw endpoint 当前返回固定数量的公开最近 items：

```text
https://apitest.dayclaw.com/api/source/public/x/thsottiaux/items
```

运行逻辑是：

- 首次 prime 时把当前 batch 标记为已见。
- 普通定时运行抓取 public batch，并用本地 state 按稳定 tweet/item ID 去重。
- public feed 有可用 reply metadata 时会保留，但不提供完整 parent-thread hydration。
- 如果 feed 没有返回可提取 item，脚本会输出 `api_warning`，让 Automation 报告一次运行问题。

## 权限建议

这个 skill 的真实权限需求很小：

- 读取当前项目里的 `env` / `.env`。
- 写入当前项目里的 `var/state.json`。
- 通过 HTTPS 访问 `https://apitest.dayclaw.com`。

仓库已经内置推荐配置：`.codex/config.toml`。它定义了 `codex-reset-watchdog-net`，只给当前 workspace 写入权限，并且只放行 `apitest.dayclaw.com`：

```toml
default_permissions = "codex-reset-watchdog-net"

[permissions.codex-reset-watchdog-net.filesystem]
":minimal" = "read"

[permissions.codex-reset-watchdog-net.filesystem.":workspace_roots"]
"." = "write"

[permissions.codex-reset-watchdog-net.network]
enabled = true

[permissions.codex-reset-watchdog-net.network.domains]
"apitest.dayclaw.com" = "allow"
```

第一次用 Codex 打开这个项目时，如果 Codex 提示是否信任项目配置，请先查看 `.codex/config.toml`，确认只包含上面的最小权限后再信任。如果权限选择器里有 `Custom (config.toml)`，请选择它。

注意：Codex 的 permission profiles 和旧 `sandbox_mode` 不会叠加。如果当前 Codex 仍使用旧的 `workspace-write` sandbox，`default_permissions` 可能不会生效，Node CLI 依然会被挡在网络外。为兼容这种情况，仓库还内置了 `.codex/rules/codex-reset-watchdog.rules`，只允许 `node scripts/check_once.mjs` 这个入口越过 sandbox。

不建议为了这个 skill 开启 full access。full access 会扩大文件系统读写范围，超过了脚本需要的最小权限。

## 网络诊断

如果 Automation 返回 `status: "transient_network_error"`、`root_cause: "connection_error"` 或 `detail: "fetch failed"`，先在同一个 Automation 工作目录运行：

```bash
node scripts/check_once.mjs --diagnose-network --json
```

这个命令会检查 `apitest.dayclaw.com` 的 DNS 解析和 HTTPS 触达能力。如果 `dns.ok=false` 或 `http.reached=false`，问题在运行环境的出站网络，不是 item 内容、LLM 判断或 state 去重。解决方式是给 Automation runtime 放行到 `https://apitest.dayclaw.com` 的出站 HTTPS，而不是扩大文件系统权限。

如果 `network_ok=true` 但正式检查仍失败，再检查 `source_url`、`api_pages` 和 `api_warning`。

## 链接

- 目标账号：<https://x.com/thsottiaux>
- Dayclaw public source：<https://apitest.dayclaw.com/api/source/public/x/thsottiaux/items>
- Codex Skills 文档：<https://developers.openai.com/codex/skills>
- Codex Automations 文档：<https://developers.openai.com/codex/app/automations>
