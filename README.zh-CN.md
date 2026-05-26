# codex-reset-watchdog

[English README](README.md)

这是一个零依赖 Codex skill 仓库，用 **Codex Automation** 通过 TwitterAPI.io 监控 [`@thsottiaux`](https://x.com/thsottiaux) 的 tweets 和 replies。脚本会把所有新抓到且未处理过的内容交给 Automation LLM 判断；只有 LLM 发现 Codex usage / quota / rate-limit reset 信号时，才通过 Codex Automation / Triage 输出 finding。

## 功能

- 只依赖 Node.js；不需要 Python、pip、venv、npm install 或 build。
- 默认包含 replies，因为 reset 通知可能只是 thread 里的短回复。
- 对 reply 拉取 thread context，让 LLM 能理解 “yes, later today” 这类语义。
- 所有新的未见 tweet/reply 都进入 LLM 审阅，不再由规则预先裁剪。
- 用一个 JSON 状态文件去重，不使用数据库。
- TwitterAPI.io DNS/network 短暂失败会先自动重试，连续失败才报警。
- 不接 Telegram、Discord、Slack、email、ntfy 或通用 webhook。

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

你只需要准备一个 TwitterAPI.io API key。项目没有依赖要安装。

最省心的方式：

1. 用 VS Code 打开这个文件夹。
2. 打开可见文件 `env.example`。
3. 复制一份，重命名为 `env`。
4. 把 `TWITTERAPI_IO_KEY=PASTE_YOUR_TWITTERAPI_IO_KEY_HERE` 里的占位文字换成你的真实 key。
5. 回到 Codex，告诉它：“帮我运行自测并 prime state。”

也可以把复制出来的文件命名为 `.env`，这是开发者常用名字；但 macOS Finder 默认会隐藏点开头文件。对普通用户，`env` 更直观，脚本会自动读取。

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

## 给 AI 的设置指令

用户填好 `env` 后，可以直接对 Codex 说：

```text
请帮我运行 codex-reset-watchdog 的 self_test，然后 prime state。不要把我的 API key 输出到聊天里。
```

Codex 应该代用户执行：

```bash
node scripts/self_test.mjs
node scripts/check_once.mjs --prime-state --json
```

之后可以 dry run 一次：

```bash
node scripts/check_once.mjs --include-replies true --hydrate-reply-context true --dry-run --json
```

## Automation

创建 Codex Automation 时使用 [`references/automation-prompt.md`](references/automation-prompt.md)。推荐每 30-60 分钟运行一次。

运行命令：

```bash
node scripts/check_once.mjs --include-replies true --hydrate-reply-context true --json
```

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
