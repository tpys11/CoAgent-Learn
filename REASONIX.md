# 项目工作规则（每次动手前必读）

## 一、必读错误记录清单

本项目历史开发中反复出现同一批错误。**每次修改代码前，先通读 `docs（已开发内容记录）/错误记录.md` 全文**，重点牢记：

1. **`\n` 转义**（最高频）：写含 `\n` 的代码到文件后，必须十六进制验证是 `0x5c 0x6e`（反斜杠+n），不是 `0x0a`（真实换行）——否则界面崩溃。写复杂代码用 write_file 生成脚本，少用 heredoc。
2. **改动前先 commit 或备份**（`cp 文件 文件.bak`），不随便 `git checkout`。
3. **新依赖必须进 requirements.txt**（容器重建丢手动装的包）。
4. **临时调试脚本放 /tmp 或 workspace，不进项目目录**；提交前 `git status` 检查。
5. **能自己验证的不麻烦用户**：查数据库、日志、用 playwright 自动化；不反复让用户刷新/发消息测试。
6. **数据库表结构变更要幂等**（`ALTER TABLE ... IF NOT EXISTS`）。
7. **改完用 `compile()` / `py_compile` 验证语法**，并重启对应容器。
8. **AI 返回解析用 `_extract_json`**（DeepSeek 常带非 JSON 前缀）。
9. **调用函数前核对签名与实参**。
10. **前端时序/缓存**：目标 div 始终渲染；fetch 加 `no-store`。

## 二、项目约定

- 用户是初学者，回答用大白话 + 必要术语解释。
- 数据库主机名在容器内用 `guashuai-postgres`/`guashuai-neo4j`/`guashuai-chroma`，不是 localhost。
- 项目的真实 DeepSeek key 在用户浏览器 localStorage（`coagent-apikey`），后端 .env 是占位符；需要 key 的功能让用户前端触发或说明。
- 记忆按 session 隔离（刷新清空）；知识库/图谱按项目 ID（localStorage 固定，刷新保留）。
- 比赛（挑战杯·揭榜挂帅）目标：作品完整性/技术创新/用户体验/实用价值四维评分，方案在 `C:\Users\21237\Desktop\比赛冲刺方案v2.md`。
