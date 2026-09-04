# Step FIXAUX 交接文档（测试档辅助链 key 路由 + 判卷 JSON 容错 + 前端残留清除，T1 承重轮）

> 会话：CoAgent-Learn FIX-AUX 执行会话。派发 HEAD=8a93049（实测一致，零漂移）。
> 落点 commit=8eed9ca（与预期一笔一致）；push 远端成功一致（`8a93049..8eed9ca master -> master`，一次通过无拒）。
> 分支 master。触碰面：backend/engine/pipeline_v2.py + backend/engine/llm_io.py +
> frontend/src/components/settings/ServiceSettings.tsx + serviceSettingsTestPreset.test.ts +
> 新建 tests/test_fixaux_tier_routing.py。一笔 commit（修复+守卫同笔）。

## 0. 复述门回答（开工前已答，经 owner 转总领）

1. **测试档注册表优先 / standard 保持 req 优先**：standard 档 `req.api_key` 本就是「用户主通道凭据」
   语义，req 优先+DEEPSEEK 兜底是 7b91c44 前序行为，逐字节等价是回归红线（76 处 monkeypatch 打桩语义
   依赖）。测试档里 `req.api_key` 是前端残留的**上一通道** key（如带 deepseek key 打 go 端点）——
   req 优先会拿错通道 key 打对端 401，落 DEEPSEEK 兜底则静默破坏三通道隔离契约（决策 38/40/41：
   key 来源=注册表定值格 or 链，R-D 单一决策点——路由决策只发生在格定义，调用端只消费 spec）。
2. **literal_eval 兜底放 think_then_json 而非 review.py**：指纹在 think_then_json 解析层产生，
   review.py 只是消费者；根因点修一次全链受益（断言审核/追问/设置推断等全部消费者），消费端补是
   症状医疗且 review.py 属禁碰区。失败语义保持：双失败抛**原** ValueError → 指纹仍如实产出。
3. **zen→go 复制必删（两条依据）**：① 7b91c44 owner 拍板三通道独立持键——复制让 provKeys.go 与
   zen 同值同源，LS 复制件成第二事实源，与后端 GO_API_KEY 独立落库必然漂移；② 对称 zai 先例（C1）
   已确立「未配 key 禁走+持久守卫」为正解——复制本质=铁律 35「凭据臆造」的前端形态。
4. **standard 逐字节不变钉法**：守卫①回归控制断言——monkeypatch DEEPSEEK_API_KEY=假值B≠req key，
   经 `_cached_llm` 捕获 fake 钉三元组 `(req.api_key, req.base_url, model_override or req.model or
   DEFAULT_MODEL)`，并真实构造断言 `DeepSeekLLM._api_key/_base_url/model_name/thinking` 四元组与
   改前公式逐项相等（test_fixaux1_standard_tier_byte_identical）。
5. **push 被拒序列**：`git pull --rebase`（禁 --force）→ 复跑全量（pytest+vitest+tsc）→ 全绿再 push
   → 仍拒或 rebase 冲突则 abort+停止上报。（本轮未触发——一次通过。）

## 1. 步骤命令实录

### S0 核对
```
$ git rev-parse HEAD
8a930497a907e829cb918ccee71fc7d0aed5221e
$ git status --short
?? coagent-learn-repomix.xml
?? repomix.config.json
```
判定：HEAD 与派发一致；仅两个无关 untracked（repomix 产物，不入库不触碰）；无其他会话同 worktree 写入。

### S1 修复+守卫
- 三处 before 锚点逐字核对全部命中（pipeline_v2.py:203-222 / llm_io.py:43-55 /
  ServiceSettings.tsx:289-292）后动笔。
- 修复①：两函数先 `detect_tier(req.base_url, req.model)`，非 standard 档走
  `resolve_model("main"/"fast", tier)`，`api_key = spec.api_key or req.api_key`，
  `model_override` 仍最优先；standard 档公式原样。REGISTRY 定义区零触碰（纯消费端）。
- 修复②：`import ast`；fence 与花括号两分支 `json.loads` 失败后 `ast.literal_eval` 兜底，
  注释「FIXAUX②：qwen3.8-flash 单引号 JSON 实录修复」，双失败 `raise _ve` 抛原 ValueError。
- 修复③：`:268` 改写为 `if (channel === 'go') {` 块（保留 goBaseUrl 守卫）+ 对称 zai 形态
  `!keysG.go && !svc.go_key_set` 禁走守卫；删除 S6 复制块（含两行注释）。
- 连带核查（grep `_mem_edit`/`_auto_settings`）：**两者均为 requests.post 独立构造**
  （memory_edit.py:53 / chat_context.py:33，Bearer req.api_key or DEEPSEEK_API_KEY，直打
  DEEPSEEK_BASE_URL），**不走 _make_llm/_make_fast_llm**——按红线**不扩，上报总领**：
  测试档下这两个辅助调用会仍走 standard 公式（DEEPSEEK 兜底），属决策 38 之外的遗留独立路径。
  另：core/outline_service.py:266 `_fast_llm` 亦独立构造（已自带 resolve_model(current_tier())
  判档，但 go/zai 档 provider 非 zen 时回落 req key=注释内「10 月窗口议」事项），同样不扩上报。

### S1 验证
```
$ $env:PYTHONPATH="backend"; .venv\Scripts\python.exe -m pytest tests/test_fixaux_tier_routing.py -q
8 passed in 2.10s
$ npx vitest run（frontend/）
Test Files 35 passed (35) / Tests 331 passed (331)
$ npx tsc --noEmit
（无输出）TSC_OK
```

### S2 变异三连（恰红 → 全还原复绿）
| 变异 | 注入 | 实测 | 还原后 |
|---|---|---|---|
| ① go 分支改 `req.api_key or spec.api_key`（还原 req 优先） | pipeline_v2.py | `2 failed, 6 passed`——恰红 test_fixaux1_go_tier_registry_key_wins + test_fixaux1_cache_key_new_triple，standard 回归控制仍绿 | 8/8 绿 |
| ② fence 分支删 literal_eval 兜底（if True: raise 短路） | llm_io.py | `1 failed, 7 passed`——恰红 test_fixaux2_fence_single_quote_json_parses | 8/8 绿 |
| ③ 还原 `go: keys.zen` 复制行（含 MUTATION③ 注释） | ServiceSettings.tsx | `1 failed, 7 passed`——恰红 FIXAUX③ not.toContain 守卫 | 8/8 绿 |

### S3 全量回归
```
$ $env:PYTHONPATH="backend"; .venv\Scripts\python.exe -m pytest -q
646 passed, 1 warning in 56.66s
```
对照：638 基线 + 8 新守卫 = 646，**逐条吻合，零意外红**（warning=starlette httpx 弃用提示，存量）。

### S4 一笔 commit + push
```
$ git diff --stat（E-42 对照）
 backend/engine/llm_io.py                        | 20 +++++++++--
 backend/engine/pipeline_v2.py                   | 39 +++++++++++++++++-----
 .../settings/ServiceSettings.tsx                 | 12 ++++---
 .../serviceSettingsTestPreset.test.ts            | 13 ++++++++
 4 files changed, 69 insertions(+), 15 deletions(-)   （+新文件 tests/test_fixaux_tier_routing.py）
$ git add <5 目标文件>; git commit
[master 8eed9ca] FIXAUX: 测试档辅助链 key 路由+判卷 JSON 容错+zen→go 复制清除——三修复三守卫同笔
 5 files changed, 241 insertions(+), 15 deletions(-)
$ git push origin master
8a93049..8eed9ca  master -> master   （EXIT 0，一次通过无拒）
```

**两行原文**：
```
8eed9ca FIXAUX: 测试档辅助链 key 路由+判卷 JSON 容错+zen→go 复制清除——三修复三守卫同笔
8a93049..8eed9ca  master -> master
```

### S5 容器重启（E-43：禁 --build）
```
$ docker restart guashuai-backend
guashuai-backend
$ docker ps --filter "name=guashuai-backend" --format "{{.Names}} {{.Status}}"
guashuai-backend Up 22 seconds (healthy)
```
注：镜像为 restart 前构建（E-43 禁 --build），修复代码进运行容器需下一次镜像构建/部署——按守则不做。

## 2. 被否方案
1. **zai 判定字段猜名**：规格提示「svc 字段名以实测为准」——实测 `svc.go_key_set`（ServiceSettings.tsx
   saveGoKey 成功分支 `go_key_set: !!g.go?.api_key_set` 落态），与 zai 的 `svc.zai_key_set` 同构，未猜。
2. **go key 守卫裸放 :268 之后**：若 `keysG` 判定不包 `channel === 'go'` 条件，zen/zai 切换会被
   go 的 key 状态误拦——改为对称 zai 的块级守卫（`if (channel === 'go') { … }`），goBaseUrl 守卫
   语义逐字保留。
3. **守卫①只用捕获三元组**：仅钉 `_cached_llm` 入参不足以钉「产出的 client key」——fake 内真实
   调用 `build()`，同时断言 `DeepSeekLLM._api_key/_base_url/model_name`（OpenAI 构造离线无网）。
4. **_mem_edit/_auto_settings 顺手同修**：独立构造命中，但规格红线明示「若有独立构造，不扩，上报」
   ——不动，见 §1 连带核查。

## 3. 清理清单 / 遗留
1. **上报总领（不扩）**：`_mem_edit`（memory_edit.py:53）、`_auto_settings`（chat_context.py:33）
   独立 requests.post 构造，测试档下仍走 DEEPSEEK 公式；outline_service.py:266 `_fast_llm` go/zai
   档回落 req key——三者待总领排期（属「req 无 key 时按档位取注册表格 key」10 月窗口议题）。
2. 旧 `agents/graph.py` think_then_json 副本（服务旧路径）未动——Loop5 删除时一并消亡，单引号
   兜底未同步（与本修边界一致：llm_io.py 为规格指定唯一落点）。
3. untracked：`coagent-learn-repomix.xml`、`repomix.config.json`（非本会话产物，保持原状）；
   本交接文档 docs/progress/step-FIXAUX.md 待 owner 回传后归档。
4. CI：push 后远端 CI 状态建议 owner 总领侧核对（本地三绿：pytest 646 / vitest 331 / tsc 净）。
