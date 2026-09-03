# CoAgent-Learn 协作纪律（Reasonix 本地，勿提交仓库）

> 来源：协作者方法论（5(1)-5(4) 单步执行/会话管理）+ 用户提醒。每次会话开始先读本文件。

## 一、协作纪律（最高优先）
1. 不调用子 agent（除非用户明确授权）
2. 小闭环就 commit（一笔一子步；每步跑全量回归；改前 commit 当前状态）
3. 拿不准就问，不盲目推测——需求澄清宁可多问，不自行拍板方向
4. 输入修正：用户构想/知识不贴合现实 → 直接指出，先给正确表述再让其对齐
5. 执行反馈：难题如实上报；失败 2 次即停；超预算先 push 已完成
6. 状态外置到文档（用户强调：agent 记忆靠不住，文档是核心记忆资产）

## 二、改前端/界面逻辑的强制前置
- 先了解现状 + 布局逻辑 + 数据流，再对齐想要什么样，最后才动手
- 别自己怎么想就怎么做——用户多次因我盲改返工

## 三、本项目关键事实（防忘）
- 项目根 C:/Users/21237/CoAgent-Learn；协作者共用远程仓库，会 rebase/force push（历史重写过）
- 评测系统两套：我们的 evaluation/（黑盒+智谱）与协作者 backend/eval/+tests/eval/（内嵌 judge）——对外只报一套口径
- 官方比赛：≥50 组用例、幻觉<5%/适配≥85%/覆盖≥90%；协作者已备 54 组 tests/eval/eval_cases.json + data/documents/ 7 份知识库
- .env 的 DEEPSEEK_API_KEY 是占位符（真实 key 靠前端传）；评测对话烧 DeepSeek 钱、判分走智谱免费
- Docker 前端 5173 / 后端 8000；git 需代理 127.0.0.1:7993，常 SSL 抖动 fetch 多试

## 四、前端布局逻辑（2026-09 实读）
- 主结构 App.tsx：外层 flex-col；`ActivityBar` 最左导航细轨（view: chat主页/resources/memory/knowledge/agents/obsidian本地文档），expanded=`view!=='chat'||!chatOpen`（进项目对话才折叠）
- chat 视图两态：!chatOpen→HomeView 主页；chatOpen→ProjectSidebar(左,对话按 projectId 过滤)+可拖拽宽度+CenterPanel(中,消息流/AgentFlow/stats条)+RightPanel(右,知识图谱/第二对话/特殊输出)
- 各视图懒加载：resources→ResourceView / memory→MemoryView / knowledge→KnowledgeView / obsidian→ObsidianView
- ResourceView：左领域栏(domains=默认2+preset扫描+自定义localStorage)→顶部3分类(教程资源/技术工具/百科词条)+预设资源页签；点领域选中(已修:不再自动跳转)
- 项目资源(config弹窗)：ProjectSidebar 里 onOpenMemory/onOpenResource → setShowProjectConfig + projectConfigTab
- CenterPanel：sendMessage → SSE流式；AgentFlow 折叠已做

## 五、记忆系统逻辑（2026-09 实读）
- 前端入口：App view='memory'→MemoryView(585行)，两级 level: global(个人全局记忆)/project(课程记忆)
- 个人全局(global)：三栏=基本情况/学习情况/阅读偏好 + 固定字段表单 + 课程摘要(只读)；可编辑→scheduleSave→api.saveGlobalProfile；右侧记忆对话 sendMc 改记忆
- 课程记忆(project)：全部课程列表→选中课程→fields(概况/进度/时间)+BASIC_FIELDS(抽象目的/抽象项目情况+arrayKeys 偏好/知识点/难点/薄弱点/兴趣)+进度与细节页签
- 后端：routers/memory.py(getGlobalProfile/saveGlobalProfile/getProjectMemory/getMemoryProgress等) + core/memory_service.py + core/memory_analysis.py(update_memories后台生成画像)
- 表：global_profile(JSON) / project_memories(JSON) / dialogue_memories；messages表存对话
- 数据链：对话→存messages→update_memories(后台线程,调LLM读messages生成)→写global_profile/project_memories→前端getGlobalProfile显示
- "记忆空"原因判断：界面真实现(非空壳)但表没数据=update_memories没成功跑/被合并改动破坏

## 六、官方方案对照（用户要求：后面每个操作都给意见/评价）
> 官方方案 XH-202630（揭榜挂帅）见用户持有 PDF。评分=完整性30/创新25/体验15/实用30。
- 实用价值 30（最挂钩评测）：≥50组用例、真实领域数据、三硬指标(幻觉<5%/适配≥85%/覆盖≥90%)、泛化可迁移
- 完整性 30：学情画像→多Agent调度(诊断/生成/审核)→个性化生成→交互反馈→动态决策 全流程闭环
- 创新 25：多Agent交叉验证辩论消幻觉、高保真溯源、动态追问启发导学
- 体验 15：界面简洁、协同调度可视化流畅、资源排版规范
- 提交物：材料+10min演示视频 / 源码+部署+单测 / 测试数据(1领域知识库切片+≥2组画像完整示例)
- 多Agent≥3角色；≥3资源形态(定制资源/实操指南/分阶测试题)；学情匹配报告(盲区/难度曲线/路径图)；答错降维/连对进阶；数据脱敏
- 操作前自问：这一步对着官方哪条评分/扣分点？做了对哪个指标/材料有贡献？
