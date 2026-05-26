# codex-reset-watch

[English README](README.md)

这是一个 Codex skill 仓库，用 **Codex Automation** 通过 TwitterAPI.io 监控 [`@thsottiaux`](https://x.com/thsottiaux) 的 tweets 和 replies。命中 Codex usage / quota / rate-limit reset 相关内容时，只通过 Codex Automation / Triage 输出 finding。

## 功能

- 默认包含 replies，因为 reset 通知可能只是 thread 里的短回复。
- 对 reply 拉取 thread context，避免漏掉 “yes, later today” 这类语义。
- 高置信度命中由规则自动推送。
- 中低置信度候选交给 Codex Automation 的 LLM 复判。
- 用一个 JSON 状态文件去重，不使用数据库。
- 不接 Telegram、Discord、Slack、email、ntfy 或通用 webhook。

## Skill 结构

这个仓库本身就是一个单 skill 目录：根目录放 `SKILL.md`，旁边放可选的 `agents/`、`references/`、`scripts/`。如果要嵌入到另一个仓库，把本目录复制到 `.agents/skills/codex-reset-watch/`。

```text
codex-reset-watch/
  SKILL.md                         # skill 元数据和运行指令
  README.md                        # 英文说明
  README.zh-CN.md                  # 中文说明
  requirements.txt                 # Python 依赖
  .env.example                     # 本地配置模板
  .gitignore                       # 忽略密钥、缓存和本地状态
  agents/
    openai.yaml                    # 可选 Codex skill 展示元数据
  references/
    automation-prompt.md           # 创建 Codex Automation 时使用的 prompt
    deployment.md                  # 运行维护清单
    llm-judge-rubric.md            # 模糊候选的 LLM 复判规则
  scripts/
    check_once.py                  # Automation 单次运行入口
    self_test.py                   # 本地确定性自测
    common.py                      # 兼容导出层
    codex_reset_watch/
      classifier.py                # reset 分类器和 LLM review gate
      config.py                    # .env 加载、env helper、API key 查找
      models.py                    # TweetCandidate / MatchDecision 数据结构
      output.py                    # finding 格式化和 payload 处理
      state.py                     # JSON 状态文件去重
      text.py                      # 文本归一化和匹配 helper
      tweets.py                    # tweet 抽取、URL、reply/thread helper
```

## 使用

创建本地 `.env`：

```bash
cp .env.example .env
```

先只改 API key：

```env
TWITTERAPI_IO_KEY=PASTE_YOUR_TWITTERAPI_IO_KEY_HERE
```

推荐默认值：

```env
TARGET_X_HANDLE=thsottiaux
STATE_FILE_PATH=~/.cache/codex-reset-watch/state.json
INCLUDE_REPLIES=true
HYDRATE_REPLY_CONTEXT=true
CODEX_LLM_REVIEW_ENABLED=true
```

安装并自测：

```bash
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
python scripts/self_test.py
```

## 第一次运行

先 prime state，避免历史 tweets/replies 被当成新 finding：

```bash
python scripts/check_once.py --prime-state --json
```

再 dry run：

```bash
python scripts/check_once.py --include-replies true --hydrate-reply-context true --dry-run --json
```

## Automation

创建 Codex Automation 时使用 [`references/automation-prompt.md`](references/automation-prompt.md)。推荐每 30-60 分钟运行一次。

运行命令：

```bash
python scripts/check_once.py --include-replies true --hydrate-reply-context true --json
```

## 状态与去重

`STATE_FILE_PATH` 指向持久 JSON 文件：

- `seen_tweets`：同一 tweet/reply 不会每次重复推送。
- `reported_events`：同一个 conversation/thread 内的多条短回复不会刷屏。
- 未来新的 reset tweet/reply 有新 tweet ID 或 event key，仍然可以产生新 finding。
- `EVENT_DEDUPE_ALLOW_PHASE_UPDATES=true` 允许同一 thread 后续再推送一次 `completed_reset`。

状态文件建议放在一次性 worktree 外：

```env
STATE_FILE_PATH=~/.cache/codex-reset-watch/state.json
```

## 输出格式

`check_once.py --json` 输出一个 JSON 对象。重要字段：

- `alerts`：规则判断出的高置信度 finding 数量。
- `has_finding`：是否应该把 `finding_markdown` 推到 Codex Triage。
- `finding_markdown`：高置信度命中时可直接发布的 Markdown。
- `llm_review_candidates`：需要 Codex Automation LLM 复判的候选。
- `reply_context_fetches`：本次拉取 thread context 的次数。
- `results`：每条 tweet/reply 的分类细节。

## 链接

- 目标账号：<https://x.com/thsottiaux>
- TwitterAPI.io 文档：<https://docs.twitterapi.io/introduction>
- TwitterAPI.io 认证：<https://docs.twitterapi.io/authentication>
- TwitterAPI.io `last_tweets`：<https://docs.twitterapi.io/api-reference/endpoint/get_user_last_tweets>
- TwitterAPI.io `thread_context`：<https://docs.twitterapi.io/api-reference/endpoint/get_tweet_thread_context>
- Codex Skills 文档：<https://developers.openai.com/codex/skills>
- Codex Automations 文档：<https://developers.openai.com/codex/app/automations>
