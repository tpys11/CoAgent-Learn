# Step FIXEVAL 交接文档（T2 轮：评测 runner 灌库轮询终态判定修复——双信号收口）

> 会话：CoAgent-Learn FIXEVAL 执行会话。派发 HEAD≥10c567a（实测精确一致：HEAD=10c567a，零漂移；开工 git pull 一次 Already up to date）。
> 落点 commit=456119d（与预期一笔一致）；push 一次通过无拒（`10c567a..456119d master -> master`）。
> 分支 master。触碰面：tests/eval/eval_runner.py（+15，_poll_progress 单函数内追加兜底分支）+ 新建 tests/test_fixeval_poll.py（+128，4 守卫）。
> 一笔 commit（修复+守卫同笔）。禁碰区零触碰：backend/** 全程未动（仅只读核对 list_docs 形状与路由包裹键）；tests/eval/ 其他文件零触碰。
> **S5 零容器动作**：runner=宿主进程运行（pytest 直接 import），改完下次运行即生效，backend 镜像零改动——与以往轮次不同，未执行任何 docker 命令。

## 0. 复述门回答（开工前已答，经 owner 转总领）

1. **为什么终态判定用库内可见（list chunks>0）而不是修 upload-progress 后端**：三根因形态（进程内存字典
   不落盘、后台直投路径不写进度、enhance 阶段异常吞掉把 done 重置）全在 backend 进度态实现上；修后端要
   动产品代码且前端真实用户路径依赖该语义，深夜轮次不宜动；而 runner 是宿主进程运行的 eval 基建，改完
   即生效。库内事实（list 返回 chunks>0）是"入库真正完成"的唯一可靠终态信号，进度字典只是它的不完整
   投影——以事实为准、以进度为快路径，才是正确的终态判定。
2. **enhance 卡住（done=0/total=1）为什么修复后不再阻塞**：旧逻辑唯一信号是进度字典，done 重置后 LLM
   异常被吞，永停在 done<total，只能等满 900s。修复后 error 判定之后追加库内兜底：list 中该 source
   chunks>0（后台入库实际已完成）即立即返回 ok/via=doc-list，不再依赖进度字典翻正。
3. **快路径/error 路径为什么逐字节保留**：两者语义正确且被守卫②③锁定为回归基线；新兜底只对"进度态
   失效但库内已完成"形态补位，纯增量。逐字节保留保证正常路径零行为变更，变异才能精确归因（删兜底→仅①红）。
4. **为什么本修不需要 docker restart**：eval_runner.py 由 runner 以宿主进程方式运行（pytest 直接
   import），每次启动重新加载源码；不涉及 backend 容器内任何代码变更，镜像零改动。
5. **push 被拒序列**：`git pull --rebase` → 复跑守卫与全量 → 再 push，禁 `--force`；rebase 冲突即停止
   上报。（本轮未触发——一次通过。）

## 1. 步骤命令实录

### S0 核对
```
$ git pull                      # Already up to date
$ git log --oneline -3          # HEAD=10c567a（docs(board): IMGKEY acceptance row）
$ git status --short            # 仅 2 untracked（repomix 产物，非并行写入），已跟踪零修改=无并行写入
$ git rev-parse HEAD            # 10c567a82db80c344bd57062bb84a407b057fd4b
```
判定：HEAD=10c567a 精确命中 ≥ 要求 ✓；无并行未推改动 ✓。

### S1 修复+守卫（锚点逐字核对后动笔）
- **before 锚点核对**（实测 eval_runner.py:174-197）：`def _poll_progress(base, pid, source, log,
  timeout=900)` 与规格一致；快路径返回 `{"status": "ok", "chunks": total, "progress": p,
  "parse_engine": ...}`、error 路径 `{"status": "error", "progress": p}`、timeout
  `{"status": "timeout", "progress": last}`——三处即守卫②③④回归基线。
- **list_docs 形状实测核对**：backend/core/knowledge_service.py:525-555 `list_docs` 每条
  `{"source", "chunks", "vectorized", "preview", "tree"}`（按 source 聚合）；路由
  backend/routers/knowledge.py:714-717 `/api/knowledge/list` → `{"docs": list_docs(project_id)}`。
  与规格假设（source/chunks/vectorized）吻合。
- **修改**（error 判定之后、进度展示行 `cur = f"{done}/{total}"` 之前追加，+15 行）：
  ```python
  # FIXEVAL 库内事实兜底（双信号收口）：进度态是 backend 进程内存字典——后台直投
  # 路径不写进度、进程重启即丢、enhance 阶段把 done 重置后 LLM 异常被吞不阻断，
  # 三种形态都让上面的快路径永假、轮询耗满 timeout 假性卡死；而后台日志"入库完成"。
  # 故以库内可见事实（list 中该 source chunks>0）为终态判定兜底；进度快路径与
  # error 路径原样保留，正常形态行为零变更。
  try:
      docs = _get_json(base, f"/api/knowledge/list?project_id={pid}",
                        timeout=15).get("docs") or []
  except Exception as e:  # noqa: BLE001 —— list 探测失败等同暂无库内事实，续走原轮询节奏
      log(f"    [progress] {source}: doc-list probe failed {str(e)[:80]}")
      docs = []
  for d in docs:
      if (d.get("source") or d.get("name")) == source and (d.get("chunks") or 0) > 0:
          log(f"    [progress] {source}: rescued-by-doc-list chunks={d.get('chunks')}")
          return {"status": "ok", "chunks": d.get("chunks"), "via": "doc-list"}
  ```
  红线逐项：快路径/error/timeout 三处返回逐字节未动 ✓；轮询节奏 `time.sleep(3)` 与
  `timeout=900` 缺省未动 ✓；与规格代码的唯一偏差=except 分支追加一行 log（诊断可观测性，
  非行为变更，return 值零影响）。
- **守卫**（tests/test_fixeval_poll.py 新建，4 条，monkeypatch eval_runner 模块级
  `_get_json`+`time`，零真网零真实 key）：
  1. 守卫① progress 恒 `{"status":"none"}` + list 含目标 source(chunks=3) →
     `{"status":"ok","chunks":3,"via":"doc-list"}` + rescued 日志行；
  2. 守卫②（回归）progress done=2,total=2 → 快路径 ok，与改前形状逐字典相等
     （含 progress/parse_engine 键），且 list_calls==0；
  3. 守卫③（回归）progress `{"status":"error","error":"x"}` → error 形状逐字典相等，
     且 list_calls==0；
  4. 守卫④ progress 恒 none + list 恒空 + timeout=0.3（假钟 sleep 只推仿真钟，零真实
     等待）→ `{"status":"timeout","progress":"None/None"}` 逐字节 + sleeps==[3]（3s
     节奏实证）+ 恰一轮有界。

### S1 验证
```
$ $env:PYTHONPATH='backend'; .venv\Scripts\python.exe -m pytest tests/test_fixeval_poll.py -q
4 passed in 0.15s
```

### S2 变异恰红 → 复绿（备份文件快照往返，非 git 回退）
| 轮 | 变异 | 实测 | 还原后 |
|---|---|---|---|
| 1 | 删库内兜底分支（换 MUTATION 注释） | `2 failed, 2 passed`：①红 ✓、②③绿 ✓、**④也红**（见下） | `4 passed` |
| 2 | 收窄守卫④后重放同一变异体 | **恰红**：`1 failed, 3 passed`（仅守卫①恰变 timeout 红，②③④同轮绿） | `4 passed` |

轮 1 的 ④ 误红是**守卫写超**（我给④加了规格外的 `list_calls==1` 断言——删兜底后 list 永不被调，
必红），非变异问题：收窄④到规格判据（timeout 形状+节奏+进度探测）后重放，恰红达成。变异体与修复版
均以 %TEMP% 文件快照做逐字节往返（Copy-Item），还原后 git diff 目检=仅 +15 行预期变更，临时件已清。

### S3 全量回归
```
$ $env:PYTHONPATH='backend'; .venv\Scripts\python.exe -m pytest -q
660 passed, 1 warning in 58.39s
```
对照：回填基线 656（step-IMGKEY.md S3）+ 新增守卫 4 = 660，**逐条吻合，零意外红**
（warning=starlette httpx 弃用提示，存量，与基线同源）。

### S4 一笔 commit + push（E-42 对照）
```
$ git diff --stat
 tests/eval/eval_runner.py | 15 ++++++++++++++
 1 file changed, 15 insertions(+)
$ git add tests/eval/eval_runner.py tests/test_fixeval_poll.py; git diff --cached --stat
 tests/eval/eval_runner.py  |  15 ++++++
 tests/test_fixeval_poll.py | 128 +++++++++++++++++++++++++++++++++++++++++++++
 2 files changed, 143 insertions(+)
$ git commit   # FIXEVAL: 前缀，附变异恰红记录与全量对照
[master 456119d] （一笔落定）
$ git push
10c567a..456119d  master -> master   （一次通过无拒，未触发 rebase 序列）
```

**两行原文**：
```
456119d FIXEVAL: runner _poll_progress 双信号收口——error 判定后追加库内事实兜底(list chunks>0 判 ok via=doc-list)，根治进度内存字典三形态(后台直投不写进度/进程重启丢/enhance 重置 done 后异常吞掉)轮询永等 900s 假性卡死；快路径/error/timeout 返回形状逐字节保留，节奏 3s 与 timeout=900 缺省不变。守卫4件全假件(monkeypatch _get_json+time 零真网)。变异恰红实证: 删兜底分支→守卫①恰变timeout红、②③④同轮绿；还原复绿。全量 660 passed=656回填+4守卫。
10c567a..456119d  master -> master
```

### S5 容器动作
按规格执行零容器动作：runner=宿主进程（pytest 直接 import eval_runner），改完下次运行即生效；
backend/** 零触碰，镜像零改动。全程未执行任何 docker 命令。

## 2. 被否方案
1. **修 backend upload-progress 语义**：见复述门①——动产品代码、前端依赖、深夜风险；改为 runner 层
   双信号（进度=快路径，库内事实=兜底）。
2. **加长 timeout / 加密轮询**：治标——三根因形态下 done 永不翻正，多等只是更久的假性卡死。
3. **以 backend 日志为终态信号**：日志是带外产物，解析脆弱且不在进程内；库内 list 接口是稳定契约。
4. **把 poll_error 形态判为终态 error**：poll_error 是瞬时网络抖动（:183-184 捕获后继续轮询的既有
   语义），判终态会把抖动误报成失败；保持续轮，由库内兜底与 timeout 兜住。
5. **变异用 git checkout 回退整文件**：会连守卫与修复一起回退测不出红；用临时快照 Copy-Item 做
   逐字节往返，红得"恰"（①孤立红+②③④同轮绿即证据），还原可 diff 目检。
6. **守卫④断言 list_calls==1**（轮 1 误红教训）：该断言测的是"兜底探测了 list"而非 timeout 语义，
   变异下必连坐；④的职责锁 timeout 形状与节奏，兜底探测行为由守卫①自己锁。

## 3. 清理清单 / 遗留
1. untracked：`coagent-learn-repomix.xml`、`repomix.config.json`（非本会话产物，保持原状）。
2. 本交接文档 docs/progress/step-FIXEVAL.md 本笔不 commit（维持一笔 commit 纪律），全文经 owner
   回传总领，待回传后归档。
3. CI：push 后远端 CI 状态建议 owner 总领侧核对（本地三绿证据：守卫 4 passed / 全量 660 passed /
   变异恰红复绿）。
4. **效果验证（真网，非本会话职责）**：需 owner/总领侧跑一轮 eval 栈灌库，观察 runner 日志出现
   `rescued-by-doc-list chunks=...` 行且不再 900s 假性卡死；三种根因形态（后台直投/进程重启/enhance
   重置）分别复测更佳。本会话守则零真网未发起。
5. 已知未覆盖语义（守卫裁剪记录，未来加固候选）：兜底匹配键的 name 回退路径（list_docs 实证恒有
   source 键，name 分支为防御性）、同名 source chunks=0 时续轮不误收口。两草案曾写入后为保"变异恰红
   ①孤立红"判据干净而裁掉；实现行为不变，仅守卫未锁。
6. 与规格代码的偏差仅一处：兜底 except 分支追加一行 log（`doc-list probe failed ...`），诊断可观测性
   用，return 值与红线零影响。
