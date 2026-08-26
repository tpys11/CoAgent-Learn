# 链接摄取通道（未启用 · 保留件）

> 状态：**前端入口已下线（2026-08-24）**。产品决策：资源上传只保留 文件 / 文本 / 系统资源卡 三来源，
> 链接粘贴入口移除。本目录统一收存链接摄取的前端实现，**后端 API 全部保留且可用**。

## 本目录内容

- `UrlProbeShared.tsx` —— 链接结构预扫描全套：ProbeState 状态机、useProbeOnce 一次性探测、
  ProbePreviewCard 预览卡（徽章/计数/分组勾选/折叠）、buildScopeFrom 范围构建。
  配套后端：`POST /api/knowledge/upload-url/probe`。

## 为什么保留而不是删除

后端管线（web_fetch.py 抓取/分组/语言门 + upload-url + progress）已完整测试
（李博杰站 26 分组、liyupi 仓库 9 组、进度轨迹采样均通过）。删除意味着将来
重启该功能时重写已验证的代码；封装在单一目录下则零干扰。

## 恢复指南（三步）

1. `UploadPanel.tsx`：恢复 link 模式——从本目录 re-export `useProbeOnce` /
   `ProbePreviewCard` / `buildScopeFrom`，恢复 upUrl 输入框、防抖探测 effect、
   upIngestUrl 与队列 link 分支（历史实现见 git：`81e30cd`、`6595b2c`、`15a7ab6`）。
2. `ProjectConfigModal.tsx`：如需预设卡恢复「结构确认」交互，重新接入
   `useProbeOnce` + probeItem 弹窗（历史实现见 git `81e30cd`）。
3. 后端无需任何改动；`/api/knowledge/upload-url`（支持 include_groups /
   exclude_groups / max_files）与 `/probe` 均在线。

## 注意

- `resource/ingestProgress.ts` 的 watchIngestProgress **不属于本保留件**——
  系统预设卡的异步摄取仍在使用它（活动代码）。
