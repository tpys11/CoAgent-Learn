# Step FIXLLM 交接文档——base_llm 三缺陷修复（T1 承重轮）

> 会话：CoAgent-Learn FIX-LLM 执行会话。派发源：owner 消息文本（§0-§6 全文）。
> 基线 commit=9c9d962（与派发预期一致），收工 commit=4c9972e（push 远端两行一致）。
> 分支 master；工作树改动仅 backend/core/base_llm.py + tests/test_base_llm_stream_fix.py，一笔 commit（修复+三守卫同笔）。

## 0. 复述门回答（开工前已交 owner 转总领）

1. **①失败机理**：chat() `create(max_tokens=2000, **kwargs)` 与 kwargs 显式 max_tokens 撞车 → `TypeError: got multiple values for keyword argument 'max_tokens'`；②网关尾部 usage-only 空 choices chunk → `chunk.choices[0]` IndexError 崩流；③except 块尾 Python `del e` → 块外 `str(e)` 触发 UnboundLocalError，真实异常被吞、异常链丢失、429 文案永不出现。
2. **②同笔 commit**：分笔必产生中间 ref（守卫先行→旧代码红；修复先行→无守卫），同笔保 CI 每个 ref 恒绿。
3. **③禁 --build**：代码 volume 挂载 alive，restart 重导即生效；--build 违反 E-43（慢+依赖漂移）。
4. **④push 被拒**：pull --rebase → 复跑全量测试 → 再推；禁 --force（已按此执行，见 §3）。
5. **⑤禁碰**：tests/eval/**（协作者领地）、frontend/**、backend/engine/**（本修不需要）、review.py/llm_io.py（已核实无缺陷）——均未触碰。

## 1. 逐命令输出实录

### S0 核对
```
$ git rev-parse HEAD
9c9d96266a2020d1081f73c2cef05d71b90820ee
$ git branch --show-current
master
$ git status --short
?? coagent-learn-repomix.xml
?? repomix.config.json
```
符合预期（HEAD≈9c9d962、仅 repomix 两未跟踪文件、无其他会话写入痕迹）。

### S1 修复+守卫
- 三处修复按 §2 规格逐字落笔（锚点实测吻合：①:29-41 ②:167 ③:179-186）。
- 守卫文件 tests/test_base_llm_stream_fix.py：4 条测试（守卫①拆显式/缺省两分支，守卫③非429/429 同用例——保证变异③恰 1 红）。
- 假件搭建迭代两次（透明记录，属守卫文件自身调试，非产品代码红）：
  1. 首跑 4 errors：`ModuleNotFoundError: No module named 'core'`（conftest autouse fixture 收集期 import）→ 查 CI workflow 实锤标准跑法 `PYTHONPATH: backend`，按此复跑。
  2. 二跑 4 failed：假件漏 `client.chat` 层（`AttributeError: '_XxxChat' object has no attribute 'chat'`）→ 假件补 Client→chat→completions→create 三层结构。
- 终跑：`4 passed in 1.45s`。

### S2 变异三连（守卫文件不动，仅改 base_llm.py；每轮 `pytest tests/test_base_llm_stream_fix.py -q`）

| 变异 | 操作 | 结果 | 红的恰是 | 失败机理原文 |
|---|---|---|---|---|
| ① | 还原硬编码 `max_tokens=2000` 进 create() + 条件式 kwargs | **1 failed, 3 passed in 7.52s** | test_chat_explicit_max_tokens_reaches_create_once | `TypeError: got multiple values for keyword argument 'max_tokens'` |
| ② | 删空 choices continue 防御 | **1 failed, 3 passed in 1.50s** | test_chat_stream_skips_empty_choices_chunk | `IndexError: list index out of range`（chunk.choices[0]） |
| ③ | 还原块外 `str(e)` | **1 failed, 3 passed in 1.52s** | test_chat_stream_retry_exhausted_raises_runtimeerror_with_chain | `UnboundLocalError: cannot access local variable 'e' where it is not associated with a value` |
| 全还原 | 三修复复位 | **4 passed in 1.39s** | —（复绿） | — |

恰红面设计说明：守卫①缺省分支在变异①下仍绿（旧代码缺省路径同样产出 2000），显式/缺省分两条使变异①恰 1 红；守卫③两分支合一条用例，使变异③恰 1 红（分开写会 2 红）。

### S3 全量回归
```
$ PYTHONPATH=backend .venv/Scripts/python.exe -m pytest tests -q --tb=short
638 passed, 1 warning in 55.47s
```
基线 634 + 新增 4 = 638，精确吻合。唯一 warning 为既有 StarletteDeprecationWarning（与本次改动无关，改前已存在）。

### S4 commit + push
```
$ git diff --stat        （commit 前 E-42 核对）
 backend/core/base_llm.py | 14 +++++++++-----
 1 file changed, 9 insertions(+), 5 deletions(-)
```
14 行变动，无全文件 diff，行尾零污染。diff 原文逐块核对与 §2 规格逐字吻合；chat_with_json :77 硬编码未动。

首次 push 被拒：`! [rejected] master -> master (fetch first)`（远端有协作者新提交）。按预案④：
```
$ git pull --rebase origin master
  9c9d962..86d6196  master     -> origin/master
Rebasing (1/1)
Successfully rebased and updated refs/heads/master.
```
拉入协作者 3 个 EVALOPT 提交（86d6196/bfc1536/a6e5c8c），零冲突（改动文件不重叠）。commit 重建为 **4c9972e**。rebase 后复跑全量：**638 passed, 1 warning in 56.12s**。

**commit message 编码验证**（透明记录）：`git log --format=%B` 经 PowerShell 控制台显示乱码，经 python `subprocess` 直取原始字节权威判定——`['免费模型限流','638 passed','got multiple values','UnboundLocalError','变异验证']` 五项 `'in s'` 全部 True，仓库内字节为合法 UTF-8，乱码纯属控制台显示假象，无需返工。

```
$ git push origin master
   86d6196..4c9972e  master -> master      （exit 0）
```

**两行原文（成功判据）**：
```
$ git ls-remote origin refs/heads/master
4c9972e248285ad73884d854470fa579e256725d	refs/heads/master
$ git rev-parse HEAD
4c9972e248285ad73884d854470fa579e256725d
```
两行一致 ✅。

### S5 dev 栈生效
```
$ docker restart guashuai-backend
guashuai-backend
$ docker ps --filter "name=guashuai-backend" --format "{{.Names}} {{.Status}}"
guashuai-backend Up 29 seconds (healthy)
```
禁 --build（E-43）遵守；代码挂载 alive，restart 重导即生效。

## 2. 改动清单

| 文件 | 类型 | 说明 | commit |
|---|---|---|---|
| backend/core/base_llm.py | 改 | 修复① chat() max_tokens 单点供给（删 create 硬编码，缺省 2000）；修复② chat_stream 空 choices chunk continue 防御；修复③ last_exc 哨兵捕获 + `raise ... from last_exc`（异常链保留、429 文案不变）；各带 FIXLLM①②③ 注释 | 4c9972e |
| tests/test_base_llm_stream_fix.py | 新增 | 4 条假件注入守卫（api_key="test-fake" 占位，零真网）：显式 max_tokens=300 恰收一次/缺省=2000；空 choices chunk 正常收完；重试耗尽 RuntimeError 无 UnboundLocalError 且 __cause__=原始异常 + 429 含「免费模型限流」 | 4c9972e |
| docs/progress/step-FIXLLM.md | 新增 | 本交接文档（**未 commit**，待 owner 决定入库方式） | — |

CI 提示：push 后 build-push.yml（决策 36 push 后三重验证 pytest/tsc/vitest）将自动运行；本次 push 的 CI 徽章请总领在 GitHub Actions 页核对——执行会话无 gh 凭据，未代查（如需代查请派发 gh 认证环境）。

## 3. 关键决策与被否方案

**关键决策**
1. **守卫①拆两条、守卫③合一条**——纯为满足「每变异恰 1 红」判据：①缺省分支对变异①天然免疫（拆开才不产生第二红）；③非429/429 分支对变异③双双变红（合并才恰 1 红）。
2. **守卫③用 `__cause__ is orig` 实例同一性断言**——比 `==` 更强：证明 `from last_exc` 链接的就是原始异常对象本身，变异③（裸 raise 无 from）下 `__cause__` 为 None，恰红。
3. **retry_delays=[0,0] 实例级覆写**——流式重试延迟 [2,4,8]s 会让守卫③/变异②跑 14s+，实例属性覆写零产品代码侵入；变异①下 chat() 显式分支仍需 6s（其 sleep 在 chat 内部、测试未覆写），接受。
4. **commit message 经临时文件 `git commit -F`**——PowerShell 5.1 管道/参数传中文有代码页损坏风险，-F 文件路径规避；提交后以 python 原始字节验证 5/5 关键串完好。
5. **e 赋值放 except 块首行**（`last_exc = e`）——规格原文；放在 warning 之前确保任何后续语句异常也不丢引用。

**被否的方案**
- ❌ 守卫③拆成两条独立测试（非429/429 各一条）——变异③下两条齐红=2 红，违反「恰 1 红」判据，合并为一条。
- ❌ 假件用类属性共享（test_d3 参考文件的 `chat = _FakeChat()` 类属性风格）——改实例属性 `__init__` 注入，避免类级可变状态跨测试渗漏（capture/chunks/exc 均测试内显式重置）。
- ❌ 在守卫里 monkeypatch `time.sleep`——实例属性覆写更直接且不依赖 import 路径；`core.base_llm.time.sleep` patch 也可行但收益为零。
- ❌ 变异验证用 `git stash`/`git checkout` 切换——三处修复在同一函数邻近区域，checkout 粒度太粗会连带还原其他修复；按规格逐处 edit 还原、逐处复位，diff --stat 全程盯行数。
- ❌ 交接文档随修一笔 commit——派发令 §1 只授权「一笔 commit（修复+三守卫同笔）」，文档入库未经授权，留 owner 决定。

## 4. 清理清单

| 项 | 状态 | 说明 |
|---|---|---|
| 临时文件 fixllm-commit-msg.txt | 待清理 | `C:\Users\31639\AppData\Local\Temp\opencode\fixllm-commit-msg.txt`（commit message 载体，已用毕，可删） |
| repomix 两未跟踪文件 | 未动 | coagent-learn-repomix.xml / repomix.config.json（S0 即存在，非本会话产物，留原状） |
| docs/progress/step-FIXLLM.md | 未 commit | 待 owner 回传总领后决定入库 |
| dev 栈 | healthy | guashuai-backend 已 restart 并通过 healthcheck |
| 分支/远端 | 同步 | 本地 HEAD == origin/master == 4c9972e，工作树净（除上述未跟踪文件与本交接文档） |

## 5. 遗留与风险

- **CI 徽章**：本会话无 gh 认证，未核对 push 后 Actions 运行结果；rebase 后基线（协作者 3 个 EVALOPT 提交）+本修全量 638 绿，预 passing，但请总领以 Actions 实际徽章为准（成功判据「CI 徽章绿」的最终回填点）。
- **守卫覆盖边界**：守卫②只喂「空 chunk 在前、正常 chunk 在后」的序列（规格原文）；真实网关的空 chunk 多在尾部，语义等价（continue 对任意位置空 chunk 生效），如需尾部特化用例可在后续轮追加。
- **429 文案回归面**：chat()/chat_with_json() 的 429 文案分支本次未动、无守卫钉住（属既有行为，锚点外）；本修未触碰其代码路径。
