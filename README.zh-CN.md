# codex-reset-watchdog

[English README](README.md)

本 skill 的主要作用是通过监控 Codex 负责人 thsottiaux 在 X 上的公开动态，及时发现未来仍可行动的 Codex reset 信号，并通过 Codex Automation 输出 finding，帮助用户在 reset 前了解可能影响 Codex 使用的重大变更，从而更有意识地消耗剩余额度，必要时切换 fast 模式，减少浪费。


## 如何使用？

### 复制黏贴 prompt

打开 Codex，点击 New Chats 按钮，新建一个 chat。然后直接复制黏贴以下这段 prompt。Codex 会自己安装本 skill、跑基础检查、初始化基线 state，并创建每小时运行的 Automation。

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
   - working directory/cwds：已安装的 codex-reset-watchdog 目录
   - prompt：完整使用 references/automation-prompt.md，不要自由改写；它只是让 Automation 使用 skill 的薄启动器
   - permissions：如果 Automation tool 没有 permissions 字段，就依赖安装目录里的 .codex/config.toml profile codex-reset-watchdog-net
6. 调用 Codex Automation 创建工具时，不要猜参数形态：
   - 先查看工具 schema 或现有 Automation config；
   - 使用当前工具接受的 hourly schedule 格式；如果 schema 显示 `rrule`，优先用 `RRULE:FREQ=HOURLY;INTERVAL=1`；
   - working directory 按当前工具要求传 `cwd` 或 `cwds`，不要猜数组/字符串；
   - 如果 schema 没有 `command` 或 `permissions` 字段，不要硬造字段；命令写在 thin prompt 里，权限来自 `.codex/config.toml`；
   - 如果当前工具实际要求 `model` 和 `reasoningEffort`/`reasoning`，即使 schema 标成 optional 也要补上；
   - 创建后读回 Automation，确认频率、working directory、active 状态、command 和 prompt 没有被工具层改写。
7. 最后给我一个简洁 setup 总结：成功/失败、Automation 频率、working directory、state 路径，以及我点击 Codex Test/Run Now 时应该看到什么。注意 Test/Run Now 只是马上运行同一份 Automation prompt，不是特殊测试模式，也不能为这一次运行单独传参数。

不要贴原始 JSON，除非我明确要求。最终总结里不要叙述已经成功绕过的 schema 重试；只有创建最终失败或我要求 debug 时才提。不要开启 full access，除非窄网络权限路径不可用，并且你先解释取舍。
```

### 测试 Automation

如果一切顺利，你可以点击 Codex 左导航的 Automations 标签，看到一个名为「Codex Reset Watchdog」的 Automation。点击它进入详情页，然后右上角的 Run Now 按钮。你应该会在 Previous Runs 看到一次新的运行记录，点开它可以看到运行的细节。Automation 的运行输出可能只留在 Automations 里，不一定出现在普通 chats；真正面向用户的提醒路径应由 Codex Automation 的通知配置承载。没有新信号时不应该创建 finding。如果你能看到 thsottiaux 最近的动态被正确解析，并且报告明确说明是否需要行动，那就说明基础流程是通的。

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
