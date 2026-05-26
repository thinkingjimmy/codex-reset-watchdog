# .codex/

> L2 | 父级: ../README.md

[PROTOCOL]: 变更时更新此头部，然后检查 README.md

成员清单

- `config.toml`: Codex 项目级权限配置，定义 `codex-reset-watchdog-net`，只允许当前 workspace 写入和访问 `api.twitterapi.io`。
- `rules/codex-reset-watchdog.rules`: 旧 sandbox 模式兼容规则，只允许 `node scripts/check_once.mjs` 这个入口在需要网络时越过 sandbox。

设计边界

这个目录只保存 Codex 运行配置，不保存 API key、state 或用户私有数据。权限 profile 是首选路径；rules 是旧 `workspace-write` sandbox 下的兼容兜底，用命令前缀约束替代全局 full access。
