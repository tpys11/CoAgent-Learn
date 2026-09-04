# Step FIXAUX3 交接文档（T2 微轮：非流式 LLM 预算收口——缺省与 JSON 硬编码 2000→8000）

> 会话：CoAgent-Learn FIXAUX-3 执行会话。派发 HEAD=c938f2f（实测一致，零漂移）。
> 落点 commit=d83bd73（与预期一笔一致）；push 远端成功一次通过无拒（`c938f2f..d83bd73 master -> master`）。
> 分支 master。触碰面：backend/core/base_llm.py + tests/test_base_llm_stream_fix.py（2 文件，
> +51/-6）。一笔 commit（预算调整+守卫同步同笔）。禁碰区零触碰（tests/eval/**、review.py、
> REGISTRY 定义区、skills/** 全程未动，调用方零改动）。

## 0. 复述门回答（开工前已答，经 owner 转总领）

1. **为什么抬预算而不是透传思考开关（两条证据）**：① P2 实测 thinking 参数被 go 网关 400 拒——
   透传路径在该端点根本走不通，改网关/调用方超出本微轮边界（调用方零改动红线）；② P3 实测
   max_tokens=6000 → finish=stop、content 正常——仅抬预算即闭环，证明瓶颈在预算上限而非思考链路；
   P1 的 reasoning=4543 tok 佐证 2000 连推理都装不下。
2. **抬预算对 standard 档行为与成本的影响**：行为——max_tokens 是上限非目标，standard 档正常回答
   finish=stop 远低于上限，输出内容不变；仅病态长生成（本就该失败场景）天花板变高。成本——按
   实际生成 token 计费，抬上限不增加正常调用成本；反而旧 2000 上限烧穿后 content=0 是「全额花费
   零产出」的纯浪费。
3. **为什么 chat_with_json 也要改**：同风险面——go 档 JSON 调用同样烧推理 token，硬编码 2000 以
   相同方式烧穿 → content 为空 → JSON 解析必败；只改 chat() 则 JSON 链路留同一个坑。
4. **push 被拒序列**：push 被拒 → `git pull --rebase`（禁 --force）→ 复跑全量 pytest → 再 push；
   仍拒或 rebase 冲突则停止上报。（本轮未触发——一次通过。）

## 1. 步骤命令实录

### S0 核对
```
$ git rev-parse HEAD
c938f2fb8535a2de4d02ab9555688ef6121ed421
$ git status --porcelain
?? coagent-learn-repomix.xml
?? repomix.config.json
```
判定：HEAD 与派发锚点 c938f2f 一致；仅两个无关 untracked（repomix 产物，不入库不触碰）；
已跟踪文件零修改 = 无并行写入。

### S1 修复+守卫（before 锚点实测命中后动笔）
- 修复①（base_llm.py:32）：`kwargs["max_tokens"] = max_tokens if max_tokens is not None else 2000`
  → `else 8000`，FIXLLM① 注释「缺省 2000」同步改「缺省 8000」，新增 FIXAUX3 注释
  「思考型模型（glm-5.3-flash 实测 reasoning 4543 tok）在 go 端点烧穿 2000 预算致正文为空」。
- 修复②（base_llm.py:79）：chat_with_json() create 内硬编码 `max_tokens=2000,` → `max_tokens=8000,`，
  附一行同风险面注释。
- 守卫③（test_base_llm_stream_fix.py）：`test_chat_default_max_tokens_is_2000` → 原位改名
  `test_chat_default_max_tokens_is_8000`，断言 2000→8000（本修复变异探针）；显式入参断言
  `chat(max_tokens=300)=300`（test_chat_explicit_max_tokens_reaches_create_once）**未动**。
- 新增守卫④：`test_chat_with_json_max_tokens_is_8000`——`_CaptureJsonCompletions` 假件捕获
  create kwargs（返回合法 JSON 正文 `{"ok": true}`），断言 `captured["max_tokens"] == 8000`；
  api_key="test-fake" 仅本地假件，零真网。
- 变异探针即本修复守卫：恰红/复绿见 S2。

### S1 验证
```
$ $env:PYTHONPATH='backend'; .venv\Scripts\python.exe -m pytest tests/test_base_llm_stream_fix.py -q
5 passed in 1.67s
```
（原 3 条 + 缺省断言改名 1 条 + 新增守卫④ 1 条 = 5，全绿。）

### S2 变异恰红 → 复绿
| 变异 | 注入 | 实测 | 还原后 |
|---|---|---|---|
| ① chat() 缺省还原 2000 | base_llm.py:33 | 恰红 test_chat_default_max_tokens_is_8000 | 5/5 绿 |
| ② chat_with_json 硬编码还原 2000 | base_llm.py:79 | 恰红 test_chat_with_json_max_tokens_is_8000 | 5/5 绿 |

双变异并注一轮实测：`2 failed, 3 passed`——恰红恰为两条目标守卫，max_tokens=300 显式回归控制
同轮仍绿；还原后复绿 `5 passed in 1.47s`。复绿后 Read 复核两锚点与 FIXAUX3 注释逐字无损
（UTF-8 往返零损，控制台乱码仅为显示层）。

### S3 全量回归
```
$ $env:PYTHONPATH='backend'; .venv\Scripts\python.exe -m pytest -q
647 passed, 1 warning in 59.09s
```
对照：回填基线 646 + 新增守卫④ 1 条 = 647，**逐条吻合，零意外红**（warning=starlette httpx
弃用提示，存量，与本次无关）。

### S4 一笔 commit + push
```
$ git diff --stat（E-42 对照）
 backend/core/base_llm.py          |  8 ++++---
 tests/test_base_llm_stream_fix.py | 49 ++++++++++++++++++++++++++++++++++++---
 2 files changed, 51 insertions(+), 6 deletions(-)
$ git add backend/core/base_llm.py tests/test_base_llm_stream_fix.py; git commit
[master d83bd73] FIXAUX3: 非流式 LLM 预算收口——chat 缺省与 chat_with_json 硬编码 2000→8000，守卫同步
 2 files changed, 51 insertions(+), 6 deletions(-)
$ git push
（EXIT 0，一次通过无拒，未触发 rebase 序列）
```

**两行原文**：
```
d83bd73 FIXAUX3: 非流式 LLM 预算收口——chat 缺省与 chat_with_json 硬编码 2000→8000，守卫同步
c938f2f..d83bd73  master -> master
```

### S5 容器重启（派发口径：挂载即生效）
```
$ docker restart guashuai-backend
guashuai-backend
$ docker ps --filter "name=guashuai-backend" --format "{{.Names}} {{.Status}}"
guashuai-backend Up 5 seconds (healthy)
```

## 2. 被否方案
1. **透传 thinking 开关**：P2 实测 go 网关对 thinking 参数 400 拒，路径不通；且需改调用方/网关，
   违反调用方零改动红线。抬预算为 P3 实证的最小闭环。
2. **chat_with_json 改走 kwargs 复用 chat 缺省公式**：超出规格「硬编码行原地改值」的单点收口，
   引入结构改动扩面——按微轮纪律不扩，仅改值+注释。
3. **守卫④复用既有 `_CaptureCompletions` 假件**：其返回 content="ok" 非 JSON，chat_with_json 内
   `_parse_json` 必抛 ValueError 掩盖断言——改用 `_CaptureJsonCompletions` 返回合法 JSON 正文，
   断言可达且语义干净。
4. **变异①②分开注入跑两轮**：并注一轮的 2 红 一一对应两条守卫，且显式回归控制同轮验证，
   信息量等价、轮次减半；还原动作对称（8000↔2000 精确串替换），复绿后 Read 复核无损。

## 3. 清理清单 / 遗留
1. untracked：`coagent-learn-repomix.xml`、`repomix.config.json`（非本会话产物，保持原状）。
2. 本交接文档 docs/progress/step-FIXAUX3.md 全文经 owner 回传总领，待回传后归档（本笔不 commit，
   维持「一笔 commit」纪律）。
3. CI：push 后远端 CI 状态建议 owner 总领侧核对（本地三绿证据：守卫文件 5 passed / 全量 647
   passed / 变异恰红复绿）。
4. 显式入参语义不变承诺：chat(max_tokens=300) 仍=300（断言已在且未动，S2 双变异轮同轮验证仍绿）；
   thinking 透传（_thinking_kwargs）行为零触碰——deepseek 端点照旧，go/zen 端点照旧不透传。
