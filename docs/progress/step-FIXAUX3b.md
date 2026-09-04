# Step FIXAUX3b 交接文档（T2 微轮：go 端点低思考档——thinking=False 降 reasoning_effort=low，3 行分支+守卫）

> 会话：CoAgent-Learn FIXAUX-3b 执行会话。派发 HEAD=7ebbf1f（实测一致，零漂移；开工 git pull 一次 Already up to date）。
> 落点 commit=65d78d4（与预期一笔一致）；push 一次通过无拒（`7ebbf1f..65d78d4 master -> master`）。
> 分支 master。触碰面：backend/core/base_llm.py + tests/test_base_llm_stream_fix.py（2 文件，+57/-0）。
> 一笔 commit（修复+四守卫同笔）。禁碰区零触碰（tests/eval/**、review.py、REGISTRY 定义区、skills/** 全程未动）。

## 0. 复述门回答（开工前已答，经 owner 转总领）

1. **effort 为什么钉 go 端点子串而不含 zen/v1 与 zai**：`reasoning_effort` 的支持证据只覆盖 go
   网关——Pi opencode-go 元数据 `supportsReasoningEffort=Yes` + 宿主 P4/P5 实测（extra_body 传 low：
   推理归零、content 正常、延迟 23s→12-15s）。zen/v1 与 zai 路径零支持证据，写入未验证参数属行为
   未知的盲扩——红线规定这两条路径逐字节不变，防回归。
2. **为什么用 extra_body**：调用走 openai 兼容 SDK 的 `chat.completions.create`，`reasoning_effort`
   不是 SDK 顶层签名参数，`extra_body` 是官方非标参数透传通道；且 P4/P5 实测验证的正是
   `extra_body={"reasoning_effort":"low"}` 这一形态，修复 1:1 复刻已验证形态，不发明新变体。
3. **thinking=None 主对话路径零变化**：新分支守卫 `self.thinking is False`（严格 is False），None/True
   不满足即短路落入原 `return {}`；且函数首行既有 None 前置守卫（base_llm.py:139）结构性隔离在先，
   外层结构与结尾 return 均未动 → None、True、zen/v1、zai、deepseek 五类路径与修复前完全一致，
   守卫⑥⑦⑧把等价类钉进测试。
4. **push 被拒序列**：`git pull --rebase origin master` → 复跑 pytest 全绿 → 再次 push；全程禁
   `--force`；再拒或 rebase 冲突即停止上报。（本轮未触发——一次通过。）

## 1. 步骤命令实录

### S0 核对
```
$ git pull origin master        # Already up to date
$ git log --oneline -12         # HEAD=7ebbf1f（FIXAUX-3 acceptance 行；落点 d83bd73 在历史）
$ git status -sb                # ## master...origin/master；仅 2 untracked（repomix 产物）
```
判定：HEAD 为 FIXAUX-3 落点之后 ✓；已跟踪文件零修改 = 无并行写入 ✓。

### S1 修复+守卫（before 锚点实测命中后动笔）
- **before 锚点核对**：base_llm.py:141-142 实测命中——`if self._base_url and "deepseek" not in
  self._base_url:` / `return {}`（规格展示缩进以文件实际 8 空格为准）。函数首行既有
  `if getattr(self, "thinking", None) is None: return {}`（139 行），None 路径结构性隔离。
- **修复**：141 行分支体内插 3 行代码 + 2 行注释（规格逐字，缩进随文件）：
  ```python
  if self.thinking is False and "opencode.ai/zen/go" in (self._base_url or ""):
      # FIXAUX3b：go 网关官方支持 reasoning_effort（Pi 元数据）——thinking=False 的技能/快链
      # 降 low 档，推理归零防预算烧穿（P4/P5 实测）
      return {"extra_body": {"reasoning_effort": "low"}}
  ```
- **守卫⑤-⑧**（tests/test_base_llm_stream_fix.py 末尾并入，全部假件零真网）：新增 `_kwargs_llm`
  假件（指定 base_url/thinking 构造 `DeepSeekLLM(api_key="test-fake")` + 覆写既有 `_CaptureClient`），
  经 chat() 断言 create 实收 kwargs：
  - ⑤ go（https://opencode.ai/zen/go）+ thinking=False → `extra_body == {"reasoning_effort": "low"}`；
  - ⑥ zen/v1（https://opencode.ai/zen/v1）+ thinking=False → 无 reasoning_effort、无 extra_body
    （同域不同路径钉死 go 子串匹配不外溢，防误扩）；
  - ⑦ deepseek（https://api.deepseek.com）+ thinking=False → `extra_body == {"thinking":
    {"type": "disabled"}}` 逐字节不变且不混入 effort（回归断言）；
  - ⑧ go + thinking=None → 无 extra_body（主对话路径零变化）。

### S1 验证
```
$ $env:PYTHONPATH='backend'; .venv\Scripts\python.exe -m pytest tests/test_base_llm_stream_fix.py -q
9 passed in 2.13s
```
（原 5 条 + 新增守卫 4 条 = 9，全绿。）

### S2 变异恰红 → 复绿
| 动作 | 注入 | 实测 | 还原后 |
|---|---|---|---|
| 删 effort 分支（分支体精确还原 before 两行） | base_llm.py:141 | **恰红守卫⑤**：`1 failed, 8 passed`（KeyError: 'extra_body'） | 9/9 绿 |

变异轮⑥⑦⑧与原 5 条同轮全绿——红得"恰"，无连带。还原（规格块精确串替换回注）→
`9 passed in 2.07s` 复绿；git diff 目检净变化仅 +4 行，注释逐字无损（控制台乱码仅为显示层，
UTF-8 往返零损，与上轮记录一致）。

### S3 全量回归
```
$ $env:PYTHONPATH='backend'; .venv\Scripts\python.exe -m pytest -q
651 passed, 1 warning in 56.25s
```
对照：回填基线 647（step-FIXAUX3.md S3）+ 新增守卫 4 = 651，**逐条吻合，零意外红**
（warning=starlette httpx 弃用提示，存量，与基线同源）。

### S4 一笔 commit + push（E-42 对照）
```
$ git diff --stat
 backend/core/base_llm.py          |  4 +++
 tests/test_base_llm_stream_fix.py | 53 +++++++++++++++++++++++++++++++++++++++
 2 files changed, 57 insertions(+)
$ git add backend/core/base_llm.py tests/test_base_llm_stream_fix.py; git commit
[master 65d78d4] FIXAUX3b: go 端点 thinking=False 降 reasoning_effort=low——推理归零防预算烧穿，四守卫同步
 2 files changed, 57 insertions(+)
$ git push
（EXIT 0，一次通过无拒，未触发 rebase 序列）
```

**两行原文**：
```
65d78d4 FIXAUX3b: go 端点 thinking=False 降 reasoning_effort=low——推理归零防预算烧穿，四守卫同步
7ebbf1f..65d78d4  master -> master
```

### S5 容器重启（挂载即生效）
```
$ docker restart guashuai-backend
guashuai-backend
$ docker ps --filter "name=guashuai-backend" --format "{{.Names}} {{.Status}}"
guashuai-backend Up 8 seconds (healthy)
```

## 2. 被否方案
1. **顶层签名 reasoning_effort（同 deepseek 路径既有写法 kwargs["reasoning_effort"]=self.effort）**：
   go 端点 P4/P5 实测验证的形态是 extra_body 透传，1:1 复刻已验证形态是红线级约束；deepseek 顶层
   写法属既有代码非本轮触碰面，零触碰。
2. **effort 档位选 medium/high**：P4/P5 实测钉的是 low（推理归零）；更高档推理不归零，违背
   「防预算烧穿」目标且无实测背书。
3. **守卫直测 `_thinking_kwargs()` 返回值**：规格语义是「create 收到」，直测内部方法会绕过
   chat() 的 kwargs 合并层（max_tokens 注入路径），覆盖面弱，且与文件既有 _CaptureCompletions
   捕获风格不一致——统一走 chat()→create 捕获。
4. **变异用 git 回退整个文件**：会连守卫一起回退测不出红；精确串替换只动 effort 分支，
   红得「恰」（⑥⑦⑧同轮绿即证据），还原对称可 diff 目检。

## 3. 清理清单 / 遗留
1. untracked：`coagent-learn-repomix.xml`、`repomix.config.json`（非本会话产物，保持原状）。
2. 本交接文档 docs/progress/step-FIXAUX3b.md 本笔不 commit（维持一笔 commit 纪律），全文经 owner
   回传总领，待回传后归档。
3. CI：push 后远端 CI 状态建议 owner 总领侧核对（本地三绿证据：守卫文件 9 passed / 全量
   651 passed / 变异恰红复绿）。
4. 零变化承诺：thinking=None/True、zen/v1、zai、deepseek 路径与修复前逐字节一致（None 前置守卫
   未动 + 守卫⑥⑦⑧为证；zai 属「非 deepseek 且非 go 子串」一般路径，与⑥同构覆盖）；deepseek
   顶层 effort 透传（kwargs["reasoning_effort"]=self.effort）零触碰。
