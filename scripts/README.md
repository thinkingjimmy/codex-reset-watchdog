# scripts/

> L2 | 父级: ../README.md

[PROTOCOL]: 变更时更新此头部，然后检查 README.md

成员清单

- `check_once.mjs`: Codex Automation 单次运行入口，零依赖抓取 TwitterAPI.io、补回复上下文、诊断网络、维护 state，并输出 LLM-first JSON。
- `self_test.mjs`: 本地确定性回归测试，覆盖 tweet 规范化、回复上下文、状态去重和“所有新项进 LLM”路径。

设计边界

`check_once.mjs` 只做事实搬运和记忆维护；Codex Automation LLM 负责 reset 语义判断。脚本不再写规则审判分支，避免机器先把证据裁掉。
