# 评测器（自动化质量评测系统）

对「多 Agent 个性化学习系统」做自动化质量评测的黑盒工具。
**不 import 系统任何模块**，只通过 HTTP 调用系统的 `/api/chat` 接口——模拟不同类型学习者提问，用**独立裁判模型**给回答打分，产出评测报告。

---

## 一、为什么这么设计（3 个关键决策）

| 决策 | 原因 |
|------|------|
| **黑盒调用** | 不依赖系统内部实现，测的是真实效果（用户实际会得到什么回答） |
| **异构判分** | 被测系统用 DeepSeek 回答，判分用**智谱**（另一家厂商）。避免"自己人判自己"的偏袒，评委加分 |
| **独立 key** | 系统本身不持有 key（key 靠调用方每次传入），评测器没有浏览器，只能自带 key 调系统 |

---

## 二、目录结构

```
evaluation/
├── config.py               # 配置文件：被测系统地址 + 两个 key
├── runner.py               # ① 跑用例：黑盒调 /api/chat，存原始回答
├── full_eval.py            # ② 判分：三项指标 + Ragas，出报告
├── annotate.py             # ③ 标注：读知识切片 → LLM 自动生成标注草稿
├── upload_slices.py        # 把知识切片上传到被测系统的知识库（评测前置）
├── datasets/
│   ├── learners/learners.json     # 学习者画像（3 种：新手/进阶/资深）
│   ├── learners/questions.json    # 问题集（按知识切片分组）
│   ├── kb_slice/*.txt             # 知识切片（5 个机器学习基础主题）
│   ├── annotations/annotations.json # 标注（核心事实/陷阱事实/知识点/难度）
│   └── results.json               # runner 跑出来的原始结果
└── metrics/                # 三项指标的计算实现
    ├── hallucination.py    # 幻觉率
    ├── adaptation.py       # 难度适配准确率
    └── coverage.py         # 知识点覆盖率
```

---

## 三、评测流程（数据流）

```
① 准备：upload_slices.py 把 5 个知识切片上传到被测系统知识库
        （让系统有知识库可检索）

② 跑用例：runner.py
    遍历【学习者画像 × 问题】→ 调 /api/chat（带 debug=1）→
    收到回答 reply + 系统真正检索到的知识库片段 internals.knowledge →
    存 datasets/results.json

③ 判分：full_eval.py
    幻觉率/难度适配：用智谱判分（陷阱事实判错、难度是否匹配画像）
    Faithfulness/覆盖率：用 Ragas 框架（智谱为裁判模型）
    → 输出 report.md / report.json

④ 解读：把报告数字导入前端 stats 条展示
```

**debug=1 是关键**：被测系统 `/api/chat` 加了这个开关后，`done` 事件会附带 `internals`（`profile` 画像 / `knowledge` 真正检索到的知识库 / `reviewed` 审核结果）——评测器据此判断"系统到底检索到了什么"，而不是只看最终回答。

---

## 四、指标定义

| 指标 | 怎么算 | 目标 |
|------|--------|------|
| **幻觉率**（陷阱判错率）| 数据集的标注里预埋"陷阱事实"（错误说法）。系统回答时若把陷阱当真（如"牛顿是物理学家"是对的，预埋"牛顿是化学家"看它是否反驳/不采用）→ 判错。错得越少越好 | <5% |
| **难度适配准确率** | 标注里给每个问题定了"难度档"（新手/进阶/资深）。用智谱判断系统回答的难度，与学习者画像匹配则正确 | ≥85% |
| **知识点覆盖率** | 标注里的"核心知识点清单"是否都在回答里出现（检索/回答层面） | ≥90% |
| **Faithfulness**（忠实度）| Ragas 标准指标：回答的每个论断是否都能在"检索到的知识库"里找到依据（不凭空捏造） | 越高越好 |
| **Context Recall**（上下文召回）| Ragas 标准指标：回答所需的关键信息，是否被知识库检索命中了 | 越高越好 |

---

## 五、怎么运行（4 步）

```bash
cd evaluation

# 0. 装依赖（只需一次）
python -m venv .venv
.venv/Scripts/python.exe -m pip install ragas requests python-dotenv

# 1. 填配置 evaluation/config.py
#    SYSTEM_API_KEY = 被测系统要用的 key（DeepSeek）
#    JUDGE_API_KEY  = 判分模型的 key（智谱，换厂商避免同源偏差）

# 2. 上传知识切片到被测系统（让系统有知识库）
.venv/Scripts/python.exe upload_slices.py

# 3. 跑用例（默认 3 组；改 datasets/ 里的画像/问题可加量）
.venv/Scripts/python.exe runner.py

# 4. 判分出报告
.venv/Scripts/python.exe full_eval.py
```

---

## 六、一次真实结果（3 组样例）

| 指标 | 结果 | 目标 |
|------|------|------|
| 幻觉率 | 31.7% | <5% |
| 难度适配 | 66.7% | ≥85% |
| 覆盖率 | 100% | ≥90% |
| Faithfulness | 100% | — |

**怎么解读**：
- 覆盖率/Faithfulness 满分 → 系统检索到了知识库、回答没凭空捏造
- 幻觉率 31.7% 偏高 → 评测时知识库可能没传对（`eval_test` 项目下没有内容），系统只能通识回答，被陷阱事实带偏 → **这暴露了真实问题**：评测能测出"知识库没生效"这种 bug

---

## 七、注意事项（重要）

1. **token 消耗归属**：
   - 对话（runner 调 `/api/chat`）= 被测系统的 key（DeepSeek）→ **花钱**
   - 判分（Ragas + 三项指标）= 智谱 key → **免费**
   - 所以评测成本 ≈ 3 组对话的 DeepSeek 消耗（量小）
2. **key 管理**：`config.py` 的 `SYSTEM_API_KEY` 是被测系统用的 key，**不是**项目 `.env` 的 key（项目 `.env` 是占位符，真实 key 靠调用方传）
3. **数据量控制**：默认 3 组。加量 = 改 `learners.json` / `questions.json`（组合数 = 画像数 × 问题数），**加量前确认预算**
4. **标注需人工复核**：`annotations.json` 是 LLM 预标草稿，正式评测前建议人工校对（尤其陷阱事实）
5. **被测系统需要 debug 支持**：`/api/chat` 的 `done` 事件要带 `internals`（profile/knowledge/reviewed），否则评测器拿不到检索证据
