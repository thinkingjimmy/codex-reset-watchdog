# codex-reset-watchdog

[English README](README.md)

这是一个零依赖 Codex skill 仓库，用 **Codex Automation** 通过 TwitterAPI.io 监控 [`@thsottiaux`](https://x.com/thsottiaux) 的 tweets 和 replies。脚本会把所有新抓到且未处理过的内容交给 Automation LLM 判断；只有 LLM 发现 Codex usage / quota / rate-limit reset 信号时，才通过 Codex Automation / Triage 输出 finding。

## 功能

- 开箱即跑：普通用户只填 API key，不需要安装 Python、依赖包或构建工具。
- 不错过短回复：thread 里的 “yes, later today” 也能被放到完整语境中判断。
- 判断更像人：Codex Automation LLM 会审阅所有新内容，减少规则预筛带来的漏判。
- 只在值得注意时打扰：没有 reset / refill / restored allowance 信号时静默归档。
- 不重复提醒：同一条 tweet/reply 只处理一次，后续新消息仍可继续触发。
- 网络抖动不刷屏：短暂 DNS/network 失败不会立刻变成噪声告警。
- 通知面单一：所有结果只进入 Codex Automation / Triage，不外发到聊天软件或 webhook。

## Skill 结构

这个仓库本身就是一个单 skill 目录：根目录放 `SKILL.md`，旁边放可选的 `agents/`、`references/`、`scripts/`。如果要嵌入到另一个仓库，把本目录复制到 `.agents/skills/codex-reset-watchdog/`。

```text
codex-reset-watchdog/
  .codex/
    config.toml                   # Codex 最小权限 profile，替代 full access
    README.md                     # Codex 配置说明
    rules/
      codex-reset-watchdog.rules  # 旧 sandbox 模式下的命令级网络兜底
  SKILL.md                         # skill 元数据和运行指令
  README.md                        # 英文说明
  README.zh-CN.md                  # 中文说明
  env.example                      # 可见配置模板
  .gitignore                       # 忽略密钥、缓存和本地状态
  agents/
    openai.yaml                    # 可选 Codex skill 展示元数据
  references/
    automation-prompt.md           # 创建 Codex Automation 时使用的 prompt
    deployment.md                  # 运行维护清单
    llm-judge-rubric.md            # LLM 审阅 review_items 的规则
  scripts/
    README.md                      # 运行脚本模块地图
    check_once.mjs                 # 零依赖 Automation 入口
    self_test.mjs                  # 本地确定性自测
```

## 你只需要做什么

你只需要下载这个 skill 文件夹，再填一个 TwitterAPI.io API key。项目没有依赖要安装。

从 GitHub 开始：

1. 打开这个项目的 GitHub 页面。
2. 点击绿色 `Code` 按钮。
3. 选择 `Download ZIP`。
4. 下载完成后解压 ZIP。
5. 用 VS Code 或 Codex 打开解压出来的 `codex-reset-watchdog` 文件夹。
6. 打开可见文件 `env.example`。
7. 复制一份 `env.example`，把副本重命名为 `env`。
8. 打开 `env`，只替换这一行里的占位文字：

```env
TWITTERAPI_IO_KEY=PASTE_YOUR_TWITTERAPI_IO_KEY_HERE
```

## 如何申请 API Key

1. 打开 <https://twitterapi.io/>。
2. 注册或登录。
3. 进入 Dashboard：<https://twitterapi.io/dashboard>。
4. 在 Dashboard 首页复制 API key。
5. 粘贴到本地 `env` 文件：

```env
TWITTERAPI_IO_KEY=你的_key_粘贴在这里
```

不要把 API key 发到聊天里，不要提交到 GitHub。

## 在 Codex 里创建 Automation

填好 `env` 后，打开 Codex，然后使用 Codex 打开这个项目文件夹，然后在 Chat 里发送：

```text
请使用当前文件夹里的 codex-reset-watchdog skill 创建一个 Codex Automation。

创建前先做两件事：
1. 运行 node scripts/self_test.mjs
2. 运行 node scripts/check_once.mjs --prime-state --json 初始化状态

然后创建一个每 1 小时运行的 Automation：
- Automation prompt 必须直接使用 references/automation-prompt.md 的完整内容，不要自由改写
- 工作目录使用当前 codex-reset-watchdog 文件夹
- 权限使用项目里的 .codex/config.toml，也就是 codex-reset-watchdog-net；不要为了这个脚本开启 full access
- 每次运行命令：node scripts/check_once.mjs --include-replies true --hydrate-reply-context true --json
- 每次读取 JSON 里的 review_items
- 按 references/llm-judge-rubric.md 判断是否有 Codex usage / quota / rate-limit reset、refill、restored allowance 或 remediation 信号
- 只有判断为有信号时才发 Codex Triage finding
- 没有信号时静默归档
- 不要输出、复制或写入我的 API key
```

Codex 会先验证脚本能跑，再把当前已有 tweets/replies 标记为基线，最后用 [`references/automation-prompt.md`](references/automation-prompt.md) 的完整内容创建定时 Automation。之后你只需要等 Triage finding；没有 reset 信号时不会打扰你。

底层 Automation 规则写在 [`references/automation-prompt.md`](references/automation-prompt.md)，LLM 判断标准写在 [`references/llm-judge-rubric.md`](references/llm-judge-rubric.md)。创建 Automation 时应当使用这些文件作为准绳，而不是让 Codex 临场发挥。

启用后的普通定时运行只应该执行主命令。`self_test`、`--prime-state` 和 `--dry-run` 是创建/启用前检查，不应每轮重复执行。状态已经初始化后，反复看到 `status=ok`、`fetched=40`、`new_items=0`、`review_count=0` 是正常静默巡检，Automation 不应为这种 no-op 写 memory。

## 状态与去重

`STATE_FILE_PATH` 指向持久 JSON 文件：

- `seen_tweets`：同一 tweet/reply 不会每次重复交给 LLM。
- `operational_failures`：记录连续 TwitterAPI.io 网络故障。
- 未来新的 reset tweet/reply 有新 tweet ID，仍然可以进入 LLM 审阅并产生 finding。

默认状态文件位置：

```env
STATE_FILE_PATH=var/state.json
```

`var/` 已被 git 忽略，并且在 Codex 沙箱运行时可写。如果你自己配置了 home 目录下的路径而 Codex 没有权限写入，脚本会自动 fallback 到 `var/state.json`，并在输出 JSON 的 `state` 字段里说明。

## 输出格式

`check_once.mjs --json` 输出一个 JSON 对象。重要字段：

- `status`：`ok`、`primed`、`state_updated`、`transient_network_error` 或 `error`。
- `review_count`：交给 LLM 审阅的新 tweet/reply 数量。
- `has_review_items`：`review_items` 是否非空。
- `review_items`：所有新的未见 tweet/reply，包含正文、URL、作者、回复元数据、event key 和回复上下文。
- `api_pages`：每一页 API 返回的摘要，包括返回键、状态、message 和提取到的 tweet 数量。
- `api_warning`：API 成功但没有提取到任何 tweet/reply 时出现，用来诊断目标账号、user id 或返回结构问题。
- `state`：实际使用的状态文件路径、用户请求的路径、是否发生 fallback，以及相关 warning。
- `llm_instruction`：给 Automation LLM 的简短判断指令。
- `reply_context_fetches`：本次拉取 thread context 的次数。
- `operational_error`：网络或运行错误；是否报警由 Automation prompt 决定。
- `results`：每条 tweet/reply 的处理细节，例如 `queued_for_llm`、`already_seen`、`ignored_repost`。

`api.twitterapi.io` 的 DNS 抖动会在同一轮内自动重试。如果重试后仍失败，脚本会输出 `status: "transient_network_error"` 并正常退出，避免一次网络抖动就刷 Triage。

## 权限建议

这个 skill 的真实权限需求很小：

- 读取当前项目里的 `env` / `.env`。
- 写入当前项目里的 `var/state.json`。
- 通过 HTTPS 访问 `https://api.twitterapi.io`。

仓库已经内置推荐配置：`.codex/config.toml`。它定义了 `codex-reset-watchdog-net`，只给当前 workspace 写入权限，并且只放行 `api.twitterapi.io`：

```toml
default_permissions = "codex-reset-watchdog-net"

[permissions.codex-reset-watchdog-net.filesystem]
":minimal" = "read"

[permissions.codex-reset-watchdog-net.filesystem.":workspace_roots"]
"." = "write"

[permissions.codex-reset-watchdog-net.network]
enabled = true

[permissions.codex-reset-watchdog-net.network.domains]
"api.twitterapi.io" = "allow"
```

第一次用 Codex 打开这个项目时，如果 Codex 提示是否信任项目配置，请先查看 `.codex/config.toml`，确认只包含上面的最小权限后再信任。如果权限选择器里有 `Custom (config.toml)`，请选择它。

注意：Codex 的 permission profiles 和旧 `sandbox_mode` 不会叠加。如果当前 Codex 仍使用旧的 `workspace-write` sandbox，`default_permissions` 可能不会生效，Node CLI 依然会被挡在网络外。为兼容这种情况，仓库还内置了 `.codex/rules/codex-reset-watchdog.rules`，只允许 `node scripts/check_once.mjs` 这个入口越过 sandbox；这比给整个 Automation 开 full access 更窄。

如果你已经创建过 Automation，请确认 Automation 的工作目录里也有最新的 `.codex/`。只更新这个仓库不一定会更新旧测试目录；要么把最新 `.codex/` 同步到 Automation 的工作目录，要么用最新仓库重新创建 Automation。

不建议为了这个 skill 开启 full access。full access 会扩大文件系统读写范围，超过了脚本需要的最小权限。最佳实践是使用这个项目级 profile；只有当当前 Codex 版本无法应用项目级权限配置、且用户明确接受风险时，才把 full access 当作临时 fallback。

有些 skill 在非 full access 下也能联网，是因为它们可能使用 Codex 内置工具、浏览器插件、MCP connector 或远端托管能力；这些网络请求不一定走本地 `node fetch`。本项目的 `scripts/check_once.mjs` 是普通 Node CLI，所以会受到当前 shell/Automation sandbox 的网络权限限制。

## 网络诊断

如果 Automation 返回 `status: "transient_network_error"`、`root_cause: "connection_error"` 或 `detail: "fetch failed"`，先在同一个 Automation 工作目录运行：

```bash
node scripts/check_once.mjs --diagnose-network --json
```

这个命令会检查 `api.twitterapi.io` 的 DNS 解析和 HTTPS 触达能力。如果 `dns.ok=false` 或 `http.reached=false`，问题在运行环境的出站网络，不是 tweet 内容、LLM 判断或 state 去重。解决方式是给 Automation runtime 放行到 `https://api.twitterapi.io` 的出站 HTTPS，而不是扩大文件系统权限。

如果 `network_ok=true` 但正式检查仍失败，再检查 API key、目标账号 handle/userId，以及输出里的 `api_pages` / `api_warning`。

## 链接

- 目标账号：<https://x.com/thsottiaux>
- TwitterAPI.io 文档：<https://docs.twitterapi.io/introduction>
- TwitterAPI.io 认证：<https://docs.twitterapi.io/authentication>
- TwitterAPI.io `last_tweets`：<https://docs.twitterapi.io/api-reference/endpoint/get_user_last_tweets>
- TwitterAPI.io `thread_context`：<https://docs.twitterapi.io/api-reference/endpoint/get_tweet_thread_context>
- Codex Skills 文档：<https://developers.openai.com/codex/skills>
- Codex Automations 文档：<https://developers.openai.com/codex/app/automations>
