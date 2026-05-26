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
- 每次运行命令：node scripts/check_once.mjs --include-replies true --hydrate-reply-context true --json
- 每次读取 JSON 里的 review_items
- 按 references/llm-judge-rubric.md 判断是否有 Codex usage / quota / rate-limit reset、refill、restored allowance 或 remediation 信号
- 只有判断为有信号时才发 Codex Triage finding
- 没有信号时静默归档
- 不要输出、复制或写入我的 API key
```

Codex 会先验证脚本能跑，再把当前已有 tweets/replies 标记为基线，最后用 [`references/automation-prompt.md`](references/automation-prompt.md) 的完整内容创建定时 Automation。之后你只需要等 Triage finding；没有 reset 信号时不会打扰你。

底层 Automation 规则写在 [`references/automation-prompt.md`](references/automation-prompt.md)，LLM 判断标准写在 [`references/llm-judge-rubric.md`](references/llm-judge-rubric.md)。创建 Automation 时应当使用这些文件作为准绳，而不是让 Codex 临场发挥。

## 状态与去重

`STATE_FILE_PATH` 指向持久 JSON 文件：

- `seen_tweets`：同一 tweet/reply 不会每次重复交给 LLM。
- `operational_failures`：记录连续 TwitterAPI.io 网络故障。
- 未来新的 reset tweet/reply 有新 tweet ID，仍然可以进入 LLM 审阅并产生 finding。

默认状态文件位置：

```env
STATE_FILE_PATH=~/.cache/codex-reset-watchdog/state.json
```

## 输出格式

`check_once.mjs --json` 输出一个 JSON 对象。重要字段：

- `status`：`ok`、`primed`、`state_updated`、`transient_network_error` 或 `error`。
- `review_count`：交给 LLM 审阅的新 tweet/reply 数量。
- `has_review_items`：`review_items` 是否非空。
- `review_items`：所有新的未见 tweet/reply，包含正文、URL、作者、回复元数据、event key 和回复上下文。
- `api_pages`：每一页 API 返回的摘要，包括返回键、状态、message 和提取到的 tweet 数量。
- `api_warning`：API 成功但没有提取到任何 tweet/reply 时出现，用来诊断目标账号、user id 或返回结构问题。
- `llm_instruction`：给 Automation LLM 的简短判断指令。
- `reply_context_fetches`：本次拉取 thread context 的次数。
- `operational_error`：网络或运行错误；是否报警由 Automation prompt 决定。
- `results`：每条 tweet/reply 的处理细节，例如 `queued_for_llm`、`already_seen`、`ignored_repost`。

`api.twitterapi.io` 的 DNS 抖动会在同一轮内自动重试。如果重试后仍失败，脚本会输出 `status: "transient_network_error"` 并正常退出，避免一次网络抖动就刷 Triage。

## 链接

- 目标账号：<https://x.com/thsottiaux>
- TwitterAPI.io 文档：<https://docs.twitterapi.io/introduction>
- TwitterAPI.io 认证：<https://docs.twitterapi.io/authentication>
- TwitterAPI.io `last_tweets`：<https://docs.twitterapi.io/api-reference/endpoint/get_user_last_tweets>
- TwitterAPI.io `thread_context`：<https://docs.twitterapi.io/api-reference/endpoint/get_tweet_thread_context>
- Codex Skills 文档：<https://developers.openai.com/codex/skills>
- Codex Automations 文档：<https://developers.openai.com/codex/app/automations>
