# codex-reset-watchdog

[English README](README.md)

本 skill 的主要作用是通过监控 Codex 负责人 thsottiaux 在 X 上的公开动态，及时发现未来仍可行动的 Codex reset 信号，并通过 Codex Automation 输出 finding，帮助用户在 reset 前了解可能影响 Codex 使用的重大变更，从而更有意识地消耗剩余额度，必要时切换 fast 模式，减少浪费。


## 如何使用？

### 第一步：复制 prompt，安装并初始化 skill

打开 Codex，点击 New Chats 按钮，新建一个 chat。然后直接复制黏贴以下这段 prompt。Codex 会自己安装本 skill、跑基础检查、初始化基线 state，但不会创建 Automation。

```text
请静默安装并初始化 codex-reset-watchdog skill：
https://github.com/thinkingjimmy/codex-reset-watchdog

只在两种情况中途回复我：需要我授权某个操作，或遇到必须由我处理的阻塞。
除此之外，不要输出过程进度、工具参数细节、命令尝试、重试过程、原始 JSON 或 state 文件内容。请自己完成下面任务，最后只给一段简洁 setup 总结。

任务：
1. 优先使用 Codex 的 skill installation workflow 安装这个 GitHub repo，skill 名称用 codex-reset-watchdog。没有 installer 时再 clone repo，并把该目录作为后续 Automation working directory。
2. 找到包含 SKILL.md、scripts/check_once.mjs、references/automation-prompt.md、.codex/config.toml 的目录。
3. 在该目录运行 node scripts/self_test.mjs。
4. 运行 node scripts/check_once.mjs --prime-state --json 创建基线 state。
5. 运行 node scripts/check_once.mjs --dry-run --json 确认 Dayclaw public source、JSON 解析和 state 去重正常。
6. 如果 node scripts/check_once.mjs 因 sandbox/network 权限失败，只请求允许 node scripts/check_once.mjs 这个窄入口重跑；不要请求 full access。若仍是 DNS/HTTPS 或 state 写入问题，按运行级问题总结，不要当成 reset/no-reset 结论。
7. 不要创建、更新或测试 Automation；我会在下一步手动创建。
8. 最终总结只包含：安装目录、self-test、prime/dry-run 状态、state.path、source health，以及下一步应使用的 Automation working directory。不要贴原始 JSON。
```

### 第二步：手动创建 Automation

在 Codex UI 里手动创建一个新的 cron/project Automation。不同版本 UI 的字段名可能会变，按下面这些含义填写即可：

1. 名称：`Codex Reset Watchdog`
2. 频率：每小时一次。
3. 类型：cron/project scheduled job；不要创建附着在当前 chat 上的 thread/heartbeat Automation。
4. Working directory/cwds：第一步总结里的 skill 安装目录，也就是包含 `SKILL.md`、`scripts/check_once.mjs`、`.codex/config.toml` 的目录。
5. Prompt：复制下面整段内容。
6. 权限：使用该目录里的 `.codex/config.toml`，它只允许写当前 workspace 并访问 `api.dayclaw.com`。

```text
Use the $codex-reset-watchdog skill.

Run from the installed codex-reset-watchdog working directory:

Command:
node scripts/check_once.mjs --json

Follow the skill's Automation run protocol. Return an emoji-led actionable/no-action report. Alert only for future actionable resets; treat completed or past reset posts as historical context.

Do not emit progress narration while running. Do not inspect or update automation memory during routine runs. If the initial working directory does not contain `scripts/check_once.mjs`, silently switch to the configured Automation working directory that does.

If JSON status is `transient_network_error`, `network_diagnostic`, or `error`, treat it as a watchdog operational issue, not a possible Codex reset. Never use the reset banners for source/network/state failures.

Omit the full repeated table on routine `new_items=0` runs when no future actionable or unclear signal remains. Do not output raw JSON, process narration, or routine memory notes.
```

创建完成后，在 Automation 详情页点击 Run Now 测试。不要把这段 Automation prompt 复制到普通 Chat/Agent 里当测试；普通 Chat 可能不在 skill 目录运行，也不会继承这个 Automation 的 working directory 和 `.codex/config.toml` 权限，容易出现 `api.dayclaw.com` DNS/HTTPS 失败或 `var/state.json` 无法写入。Cron/project Automation 的 finding 会作为独立 automation run 进入 Triage；普通运行输出可能只留在 Automations/Previous Runs 里。

[previous runs screenshot](images/previous-runs.png)

## 想要监控更多信息？

如果你想要监控 thsottiaux 账号以外的信息，比如其他账号、Reddit、新闻源等，你可以注册 [Dayclaw](https://dayclaw.com/)。

## 时区与 env

一般各位不需要修改或创建 env 文件，使用默认配置时，Codex 会监控 `@thsottiaux`，把状态写到 `var/state.json`，并使用 Automation 的运行环境来展示时间。但如果你想让输出 finding 里展示符合你的习惯的时间，就需要创建一个 env 文件，覆盖默认的 `REPORT_TIMEZONE`：

1. 复制 [`env.example`](env.example)。
2. 把副本改名为 `env` 或 `.env`。`env` 在 Finder 里更容易看到；`.env` 是开发者常用命名。
3. 只修改你真正需要的字段。如果要强制使用某个报告时区，把 `REPORT_TIMEZONE` 设为 IANA timezone：

```env
REPORT_TIMEZONE=America/Los_Angeles
```

常见示例：`Asia/Shanghai`、`America/Los_Angeles`、`America/New_York`、`Europe/London`、`Europe/Berlin`、`UTC`。

留空 `REPORT_TIMEZONE` 会使用 Automation 运行环境/用户时区。这是默认推荐方式。

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
