import { useState, useEffect, useCallback, useRef } from 'react'
import { BookOpen, Sparkles, Upload, FileText, Trash2, Wrench, ExternalLink, Plus, X, FolderTree, FolderOpen, Library, Download, ChevronRight } from 'lucide-react'

interface Artifact {
  id: string
  dialogue_id: string
  dialogue_name: string
  type: string
  title: string
  content: string
  created_at: string
}

interface Resource {
  id: string
  name: string
  content?: string
  created_at?: string
}

interface KbDoc {
  source: string
  chunks: number
  preview: string
}

interface Tutorial {
  id: string
  title: string
  url: string
  desc: string
  category: string
  domain?: string
  preset?: boolean
}

/** 百科词条 */
interface WikiEntry {
  name: string
  theme: string
  intro: string
  detail: string
  domain: string
}

type Tab = 'tutorials' | 'generated' | 'uploads'

type ListItem = {
  id: string; title: string; sub: string; body: string; icon: any
  kind: 'tutorial' | 'artifact' | 'resource' | 'kb' | 'wiki' | 'gen'; url?: string
  deletable: boolean
  time?: string
}

const TYPE_ICONS: Record<string, any> = {
  '定制讲义': BookOpen, '讲义': BookOpen,
  '实操指南': Wrench,
  '分阶测试题': FileText, '测试题': FileText,
}

/** 时间格式化：ISO/sqlite 时间 → YYYY-MM-DD */
const fmtTime = (s?: string) => {
  if (!s) return ''
  const d = new Date(s)
  if (isNaN(d.getTime())) return String(s).slice(0, 10)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 领域：系统预设，不可增删（教程资源为预设内容，手动添加仅限我的上传） */
const DEFAULT_DOMAINS = ['Agent 应用与开发', 'Python 编程']

/** 分类：固定三类 */
const CATEGORIES: Array<{ key: string; desc: string }> = [
  { key: '系统学习', desc: '入门路线与系统性教程' },
  { key: '技术工具', desc: '框架、协议与 API 文档' },
  { key: '百科词条', desc: '名词速览与深入介绍' },
]
const WIKI_CAT = '百科词条'

/** 分类图标（竖向展开列表用） */
const CAT_ICONS: Record<string, any> = { '系统学习': BookOpen, '技术工具': Wrench, '百科词条': Library }

/** 旧数据分类名 → 新三类 */
const LEGACY_CAT_MAP: Record<string, string> = {
  '系统教程': '系统学习', '技术教程': '系统学习', '实践案例': '系统学习',
  '工具与框架': '技术工具',
}
const normalizeCat = (c?: string) => (c && LEGACY_CAT_MAP[c]) || c || CATEGORIES[0].key

/** 预置第三方教程（领域 + 分类归位） */
const PRESET_TUTORIALS: Tutorial[] = [
  { id: 'preset-hello-agent', title: 'Hello Agent 入门教程', url: '', desc: 'GitHub 上的 Hello Agent 经典入门项目：从零理解并搭建一个 Agent 的最小实现（链接待补充）', category: '系统学习', domain: 'Agent 应用与开发', preset: true },
  { id: 'preset-libo-jie', title: '李博杰的教程', url: '', desc: '系统性 AI / 智能体学习教程，覆盖从基础到实践的学习路线（链接待补充）', category: '系统学习', domain: 'Agent 应用与开发', preset: true },
  { id: 'preset-langgraph', title: 'LangGraph 官方文档', url: 'https://langchain-ai.github.io/langgraph/', desc: '多智能体工作流编排框架官方文档：StateGraph、节点、条件边', category: '技术工具', domain: 'Agent 应用与开发', preset: true },
  { id: 'preset-mcp', title: 'MCP 官方文档', url: 'https://modelcontextprotocol.io/', desc: 'Model Context Protocol：Agent 与外部工具连接的标准协议', category: '技术工具', domain: 'Agent 应用与开发', preset: true },
  { id: 'preset-deepseek', title: 'DeepSeek API 文档', url: 'https://api-docs.deepseek.com/', desc: 'DeepSeek 大模型 API 调用指南（对话补全、流式输出）', category: '技术工具', domain: 'Agent 应用与开发', preset: true },
  { id: 'preset-python', title: 'Python 官方教程', url: 'https://docs.python.org/zh-cn/3/tutorial/', desc: 'Python 入门到进阶的官方教程（中文）', category: '系统学习', domain: 'Python 编程', preset: true },
  { id: 'preset-fastapi', title: 'FastAPI 官方文档', url: 'https://fastapi.tiangolo.com/zh/', desc: 'Python 异步 Web 框架官方文档：构建 API 与后端服务', category: '技术工具', domain: 'Python 编程', preset: true },
]

/** 内置百科词条（按领域 + 主题分组） */
const WIKI_ENTRIES: WikiEntry[] = [
  // ---- Agent 应用与开发 ----
  { name: 'Agent（智能体）', theme: '核心概念', domain: 'Agent 应用与开发',
    intro: '能感知环境、自主规划并调用工具完成任务的大模型程序',
    detail: 'Agent 是以大语言模型为"大脑"的智能程序：它接收用户目标后，自主拆解任务（规划）、选择合适的手段（工具调用）、执行并迭代直到完成。与普通对话机器人的区别在于"自主性"——它能多轮思考、修正错误、与环境交互。现代 Agent 通常由 模型、提示词、工具集、记忆、工作流 五部分构成。' },
  { name: 'LLM（大语言模型）', theme: '核心概念', domain: 'Agent 应用与开发',
    intro: '以海量文本训练、擅长理解和生成自然语言的深度学习模型',
    detail: 'LLM（Large Language Model）基于 Transformer 架构，在海量文本上通过"预测下一个词"预训练获得语言能力，再经指令微调与人类反馈对齐（RLHF）变得"听话"。它的能力来自统计规律而非真正的理解，因此既强大也会产生幻觉。它是当前所有 Agent 应用的核心基座。' },
  { name: '多智能体系统', theme: '核心概念', domain: 'Agent 应用与开发',
    intro: '多个各司其职的 Agent 协同协作解决复杂任务',
    detail: '多智能体系统（Multi-Agent System）将一个复杂任务拆给多个角色化 Agent：如本项目中的主 Agent（规划与生成）、学情与记忆管理、知识库管理、审核。它们通过"编排"（流程调度）与"协作"（传递中间产物、互相评审）实现单 Agent 难以完成的复杂目标。编排方式有顺序、并行、图式（如 LangGraph）等。' },
  { name: 'RAG（检索增强生成）', theme: '核心概念', domain: 'Agent 应用与开发',
    intro: '先从知识库检索相关内容，再交给大模型生成回答',
    detail: 'RAG（Retrieval-Augmented Generation）解决"大模型不知道私有知识、容易编造"的问题：先把用户问题转成向量，从向量数据库检索最相关的文档片段，与问题一起拼进提示词让模型"照着资料回答"。流程为：文档切片 → 向量化 → 语义检索 → 生成。它让回答可溯源、降低幻觉，是知识库类产品的核心。' },
  { name: 'Prompt（提示词）', theme: '核心概念', domain: 'Agent 应用与开发',
    intro: '引导大模型行为的输入文本，Agent 的"说明书"',
    detail: '提示词（Prompt）是与大模型沟通的输入文本。好的提示词明确 角色、任务、约束、输出格式，能显著提升效果。本项目每个 Agent 都有专属 system prompt：如规划节点的"输出 JSON"、生成节点的"强制引用来源"。工程上通过"少样本示例""思维链""结构化输出"等技巧进一步约束模型行为。' },
  { name: '工具调用（Tool Use）', theme: '核心概念', domain: 'Agent 应用与开发',
    intro: '大模型通过调用外部函数/API 获取实时信息并执行动作',
    detail: '工具调用（Function Calling）让大模型不只输出文字，还能按需调用预定义的函数：搜索网页、查数据库、执行代码、调 API。模型根据任务选工具并生成参数，程序执行后把结果回传给模型继续推理。本项目通过 Skill 注册中心统一管理工具（知识检索、联网搜索等），为将来接入 MCP 标准协议预留了路径。' },
  { name: '记忆系统', theme: '核心概念', domain: 'Agent 应用与开发',
    intro: '让 Agent 记住上下文与用户画像的分层存储机制',
    detail: '记忆让 Agent 在多次对话间保持连续。本项目采用三层记忆：对话记忆（原子画像）→ 项目记忆（项目级汇总）→ 全局画像（跨项目简历式融合）。记忆经后台提炼（LLM 总结）写入数据库，需要时读回注入提示词，形成"记得住、用得对"的长效体验。' },
  { name: '幻觉（Hallucination）', theme: '核心概念', domain: 'Agent 应用与开发',
    intro: '大模型一本正经地编造不存在的答案',
    detail: '幻觉指大模型生成看似合理实则错误或虚构的内容，源于其"统计续写"本质——它不知道事实，只追求"像"。缓解手段：接入知识库（RAG）强制引用来源、要求回答标注不确定、增加审核节点校验、降低模型温度。本项目审核 Agent 的职责之一就是检查生成内容与知识库的一致性。' },
  { name: 'MCP（模型上下文协议）', theme: '协议与框架', domain: 'Agent 应用与开发',
    intro: '大模型与外部工具之间连接的标准协议',
    detail: 'MCP（Model Context Protocol）由 Anthropic 提出，是"AI 界的 USB 接口"：它定义了大模型应用与工具/数据源之间的统一通信协议。服务端暴露 资源、工具、提示 三类能力，客户端（Agent）通过 HTTP/SSE 或 stdio 连接。本项目技术选型采用 MCP + HTTP/SSE，当前以进程内 Skill 注册中心实现，后续可无缝升级为独立 MCP Server。' },
  { name: 'LangGraph', theme: '协议与框架', domain: 'Agent 应用与开发',
    intro: '用图（StateGraph）编排多智能体工作流的框架',
    detail: 'LangGraph 是 LangChain 生态的工作流编排框架：把 Agent 流程建模为 节点 + 条件边 的有向图，支持并行、循环、状态共享。本项目后端用它实现 4-Agent 工作流：plan（规划）→ study_memory/kb（并行）→ generate → review → output，一次规划并行执行，大幅减少 LLM 调用次数。' },
  { name: 'API Base URL', theme: '协议与框架', domain: 'Agent 应用与开发',
    intro: '大模型 API 的服务地址，决定请求发往哪个模型厂商',
    detail: 'Base URL 是大模型 API 的根地址（如 https://api.deepseek.com/v1），OpenAI 兼容 SDK 用它 + api_key + model 发起请求。本项目支持多厂家（DeepSeek/OpenAI/通义/智谱/月之暗面/豆包），模型卡里选择厂家即自动带出对应 Base URL，方便切换不同模型服务。' },
  { name: '流式输出（Streaming）', theme: '协议与框架', domain: 'Agent 应用与开发',
    intro: '答案逐字逐句实时返回，无需等待完整生成',
    detail: '流式输出让模型边生成边把 Token 推给前端（SSE 或 chunked 流），用户看到"打字机"效果，首字延迟大幅降低。本项目 /api/chat 返回流式响应，前端用 ReadableStream 逐段读取渲染；同时在工作流节点间传递时仍保留完整结构化数据供审核与记忆使用。' },
  { name: 'Embedding（向量化）', theme: '协议与框架', domain: 'Agent 应用与开发',
    intro: '把文本转成高维向量，用"距离"衡量语义相似度',
    detail: 'Embedding 模型把文本映射到高维向量空间，语义相近的文本向量距离也近。它是 RAG 的基石：文档切片向量化后存入向量库，查询时把问题向量化做相似度检索。常见模型如 bge、text-embedding；向量库如 Chroma、FAISS、pgvector。' },
  { name: '向量数据库', theme: '协议与框架', domain: 'Agent 应用与开发',
    intro: '专为向量相似度检索优化的存储引擎',
    detail: '向量数据库以向量为索引核心，提供高效的近似最近邻（ANN）检索。相比普通数据库按字段匹配，它按"语义距离"召回内容。本项目知识库文档切片后向量化存入向量库，检索时支持 Small-to-Big 两阶段重排，保证"强制引用来源"。' },
  { name: 'Token 与上下文窗口', theme: '协议与框架', domain: 'Agent 应用与开发',
    intro: '模型处理文本的基本单位及其单次输入上限',
    detail: 'Token 是模型处理文本的最小单位（中文约 1 字 ≈ 1-2 Token）。上下文窗口是模型单次能容纳的输入+输出上限，超出会被截断。因此 Agent 需管理上下文：只注入相关记忆与检索结果、压缩历史对话，避免"爆窗"。本项目在生成节点组装上下文时做了裁剪（历史取最近 10 条等）。' },

  // ---- Python 编程 ----
  { name: 'GIL（全局解释器锁）', theme: '语言基础', domain: 'Python 编程',
    intro: '同一时刻只允许一个线程执行 Python 字节码的机制',
    detail: 'GIL 是 CPython 解释器中的一把全局锁，保证同一时刻只有一个线程在执行字节码，简化了内存管理（引用计数）。代价是多线程在 CPU 密集任务上无法真正并行。应对：CPU 密集用 多进程（multiprocessing）或 C 扩展；IO 密集（网络/文件）用多线程或 asyncio，因为等待 IO 时会释放 GIL。' },
  { name: '装饰器（Decorator）', theme: '语言基础', domain: 'Python 编程',
    intro: '不修改原函数就给它增强功能的高阶函数语法糖',
    detail: '装饰器是一个接收函数并返回新函数的"包装器"，用 @ 语法应用：@timer 等价于 f = timer(f)。常用于日志、计时、鉴权、缓存、重试。实现上依赖"函数是一等公民"：函数可作参数传递、可嵌套定义、可返回。带参数的装饰器需要再包一层，掌握后能大幅提升代码复用度。' },
  { name: '生成器（Generator）', theme: '语言基础', domain: 'Python 编程',
    intro: '用 yield 惰性产出序列，边算边出、省内存',
    detail: '生成器是包含 yield 的函数：调用时不立即执行，每次 next() 运行到 yield 暂停并返回值，下次继续。特点：惰性求值（处理大文件/无限序列不占内存）、可保存执行状态。配合生成器表达式、itertools 可写出简洁高效的数据管道；生成器也可用作协程基础（yield 接收值）。' },
  { name: '上下文管理器（with）', theme: '语言基础', domain: 'Python 编程',
    intro: '用 with 语句自动管理资源（打开/关闭、加锁/释放）',
    detail: '上下文管理器通过 __enter__ / __exit__ 协议实现，配合 with 语句确保资源无论正常或异常都被清理：文件自动关闭、数据库连接提交/回滚、锁释放。也可用 contextlib.contextmanager 装饰器把生成器函数快速变成上下文管理器。是 Python 最常用的"确定性资源管理"手段。' },
  { name: '类型注解（Type Hints）', theme: '语言基础', domain: 'Python 编程',
    intro: '在代码中标注变量与函数的类型，配合工具静态检查',
    detail: '类型注解（def add(a: int, b: int) -> int）运行时无开销，但能被 mypy、pyright 等静态检查器发现类型错误，也让 IDE 提供补全与跳转。配合 typing 模块（Optional、List、Union、TypedDict）可表达复杂结构。大型项目（尤其 API 层、数据模型）强烈推荐，本项目前后端类型即靠此协作。' },
  { name: '虚拟环境（venv）', theme: '语言基础', domain: 'Python 编程',
    intro: '为每个项目隔离独立的 Python 依赖环境',
    detail: '虚拟环境（python -m venv .venv）创建项目专属的 site-packages，避免不同项目依赖版本冲突（如 A 要 Django 4、B 要 Django 5）。激活后 pip 安装的包只进当前环境。进阶工具有 poetry/uv 管理依赖锁定；容器化项目则把依赖装进镜像（requirements.txt + Dockerfile）。' },
  { name: '包管理（pip）', theme: '语言基础', domain: 'Python 编程',
    intro: '安装、卸载、管理 Python 第三方库的标准工具',
    detail: 'pip 是 Python 官方包管理器：pip install 从 PyPI 安装包，可用 -i 指定镜像（国内常用清华源加速）。最佳实践：requirements.txt 记录依赖、用 pip freeze 锁定版本、虚拟环境中使用避免污染全局。新趋势是 uv（Rust 编写）速度提升数十倍。' },
  { name: '异步编程（asyncio）', theme: '进阶主题', domain: 'Python 编程',
    intro: '用 async/await 单线程高效处理海量 IO 任务',
    detail: 'asyncio 通过事件循环实现协程并发：遇到 IO 等待（网络请求、数据库）自动让出控制权处理其他任务。语法核心 async def（定义协程）与 await（等待结果）。配合 httpx、aiohttp 可让并发请求吞吐提升一个量级。注意：CPU 密集任务不适合 asyncio（会阻塞事件循环），且同步库调用需放线程池。' },
  { name: '多线程与多进程', theme: '进阶主题', domain: 'Python 编程',
    intro: '线程适合 IO 密集，进程适合 CPU 密集（绕开 GIL）',
    detail: 'threading 开线程：适合 IO 密集（等待网络/磁盘），共享内存但受 GIL 限制；concurrent.futures.ThreadPoolExecutor 提供简单线程池。multiprocessing 开进程：每个进程独立解释器与 GIL，可真正并行 CPU 计算，但进程间通信（Queue/Pipe/共享内存）成本高。选型口诀：IO 密集用线程/协程，CPU 密集用进程。' },
  { name: 'PEP（Python 增强提案）', theme: '进阶主题', domain: 'Python 编程',
    intro: 'Python 社区制定新特性与规范的标准流程文档',
    detail: 'PEP（Python Enhancement Proposal）是 Python 的设计文档，编号管理：PEP 8 代码风格、PEP 20 设计哲学（The Zen of Python）、PEP 484 类型注解、PEP 257 文档字符串。新语法特性先经 PEP 讨论评审再实现，保证语言演进有章可循。读 PEP 是理解"为什么这样设计"的最佳入口。' },
  { name: '鸭子类型（Duck Typing）', theme: '进阶主题', domain: 'Python 编程',
    intro: '"走起来像鸭子、叫起来像鸭子，那就是鸭子"——按行为而非继承判断类型',
    detail: '鸭子类型指不要求对象继承特定类，只要具备所需方法/属性即可使用（"如果它叫得像鸭子，就是鸭子"）。Python 大量依赖此特性：len() 只需 __len__、迭代只需 __iter__。配合协议（Protocol）可显式声明接口。它让代码灵活，也要求编写者遵循约定（"面向接口编程"）。' },
  { name: 'itertools 函数式工具', theme: '进阶主题', domain: 'Python 编程',
    intro: '高效组合迭代器的标准库模块（无限序列、排列组合、链式）',
    detail: 'itertools 提供一批惰性迭代器工具：chain（串联多个可迭代对象）、product/permutations/combinations（笛卡尔积/排列/组合）、groupby（相邻分组）、islice（切片）、count/cycle/repeat（无限序列）。与生成器结合可写出内存友好、表达力强的数据管道，是函数式编程在 Python 的基石。' },
  { name: '元类（Metaclass）', theme: '进阶主题', domain: 'Python 编程',
    intro: '创建类的类，在类定义时拦截并修改行为（ORM 与框架的魔法）',
    detail: '类是 type 的实例，元类即"类的类"：通过 __new__ 在类定义完成时介入，可自动注册子类、校验字段、注入方法。Django/SQLAlchemy 的模型定义、dataclass 都依赖元类机制。属于进阶话题：日常少用，但理解它能真正理解"Python 一切皆对象"。' },
]

const TUTORIALS_KEY = 'coagent-tutorials'
const CUSTOM_GENS_KEY = 'coagent-custom-gens'

/** 我的生成：预设分类（按生成物类型匹配） */
const GEN_CATS = [
  { key: 'all', label: '全部' },
  { key: '讲义', label: '讲义' },
  { key: '实操指南', label: '实操指南' },
  { key: '测试题', label: '测试题' },
]
const GEN_MATCH: Record<string, string[]> = { '讲义': ['讲义'], '实操指南': ['实操指南'], '测试题': ['测试题'] }

const NAV: Array<{ key: Tab; icon: any; label: string; desc: string }> = [
  { key: 'tutorials', icon: BookOpen, label: '教程资源', desc: '按领域与分类组织的学习资料与百科' },
  { key: 'generated', icon: Sparkles, label: '我的生成', desc: 'AI 生成的讲义 / 实操指南 / 测试题' },
  { key: 'uploads', icon: Upload, label: '我的上传', desc: '知识库文档与保存的资料' },
]

/** 资源界面：hyper.ai 风格——顶部 Hero + 领域/分类选择 + 分区卡片流（配色跟随主题变量） */
// ---------- Obsidian 文件夹导入（复用 Obsidian 界面的 IndexedDB 连接句柄） ----------
interface DirNode { name: string; path: string; children: DirNode[] }
function obsIdbOpen(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const rq = indexedDB.open('coagent-fs', 1)
    rq.onupgradeneeded = () => rq.result.createObjectStore('handles')
    rq.onsuccess = () => res(rq.result)
    rq.onerror = () => rej(rq.error)
  })
}
async function obsLoadRoot(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await obsIdbOpen()
    return await new Promise((res) => {
      const tx = db.transaction('handles', 'readonly')
      const rq = tx.objectStore('handles').get('root')
      rq.onsuccess = () => res(rq.result || null)
      rq.onerror = () => res(null)
    })
  } catch { return null }
}
async function buildDirs(h: FileSystemDirectoryHandle, prefix: string, depth: number): Promise<DirNode[]> {
  if (depth > 8) return []
  const out: DirNode[] = []
  for await (const [name, hh] of (h as any).entries()) {
    if (hh.kind === 'directory') {
      const kids = await buildDirs(hh, prefix + '/' + name, depth + 1)
      out.push({ name, path: prefix + '/' + name, children: kids })
    }
  }
  out.sort((a, b) => a.name.localeCompare(b.name))
  return out
}
const OBS_EXT = new Set(['md', 'txt', 'pdf', 'docx', 'doc', 'pptx', 'xlsx', 'csv', 'json'])
async function collectObsFiles(h: FileSystemDirectoryHandle, depth: number, out: Array<{ name: string; file: File }>) {
  if (depth > 8) return
  for await (const [name, hh] of (h as any).entries()) {
    if (hh.kind === 'directory') await collectObsFiles(hh, depth + 1, out)
    else {
      const ext = name.split('.').pop()?.toLowerCase() || ''
      if (OBS_EXT.has(ext)) {
        const f = await hh.getFile()
        out.push({ name, file: f })
      }
    }
  }
}

export default function ResourceView({ projectId, onUseItem }: { projectId: string | null; onUseItem?: (title: string, body: string) => void }) {
  const [tab, setTab] = useState<Tab>('tutorials')
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [resources, setResources] = useState<Resource[]>([])
  const [kbDocs, setKbDocs] = useState<KbDoc[]>([])
  const [tutorials, setTutorials] = useState<Tutorial[]>(() => {
    try { return JSON.parse(localStorage.getItem(TUTORIALS_KEY) || '[]') } catch { return [] }
  })
  // 领域（系统预设）
  const [selectedDomain, setSelectedDomain] = useState(DEFAULT_DOMAINS[0])
  // 分类（固定三类）
  const [selectedCat, setSelectedCat] = useState(CATEGORIES[0].key)
  // 百科：主题筛选（顶部按钮）
  const [wikiTheme, setWikiTheme] = useState('all')
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<ListItem | null>(null)
  // 我的生成：分类（预设 + 自定义）
  const [genCat, setGenCat] = useState('all')
  const [uploadCat, setUploadCat] = useState('all')
  const [customGens, setCustomGens] = useState<Array<{ id: string; name: string; items: Array<{ id: string; title: string; content: string }> }>>(() => {
    try { return JSON.parse(localStorage.getItem(CUSTOM_GENS_KEY) || '[]') } catch { return [] }
  })
  const [showNewGenCat, setShowNewGenCat] = useState(false)
  const [newGenCatName, setNewGenCatName] = useState('')
  const [showNewGenItem, setShowNewGenItem] = useState(false)
  const [gTitle, setGTitle] = useState('')
  const [gContent, setGContent] = useState('')
  // 我的上传：添加资料表单
  const [showAddResource, setShowAddResource] = useState(false)
  const [rName, setRName] = useState('')
  const [rContent, setRContent] = useState('')

  // ---------- Obsidian 文件夹导入 ----------
  const [obsOpen, setObsOpen] = useState(false)
  const [obsDirs, setObsDirs] = useState<DirNode[]>([])
  const [obsExpanded, setObsExpanded] = useState<Set<string>>(new Set())
  const [obsSel, setObsSel] = useState('')
  const [obsErr, setObsErr] = useState('')
  const [obsProgress, setObsProgress] = useState('')
  const [obsImporting, setObsImporting] = useState(false)
  const obsRootRef = useRef<FileSystemDirectoryHandle | null>(null)

  const openObsPicker = async () => {
    setObsErr(''); setObsProgress(''); setObsSel('')
    try {
      const h = await obsLoadRoot()
      if (!h) {
        setObsErr('尚未连接本地文档库：请先在最左侧栏的「本地文档」界面点「连接本地文档文件夹」')
        setObsOpen(true)
        return
      }
      obsRootRef.current = h
      setObsDirs(await buildDirs(h, '', 0))
      setObsOpen(true)
    } catch (e) {
      setObsErr('读取失败：' + String(e))
      setObsOpen(true)
    }
  }
  const toggleObsDir = (p: string) => {
    setObsExpanded(prev => { const n = new Set(prev); n.has(p) ? n.delete(p) : n.add(p); return n })
  }
  const renderObsDirs = (dirs: DirNode[], depth: number): React.ReactNode => dirs.map(d => (
    <div key={d.path}>
      <div onClick={() => setObsSel(d.path)}
        className={`flex items-center gap-1.5 pr-2 py-1.5 rounded-lg text-xs cursor-pointer transition-colors ${obsSel === d.path ? 'bg-[#1a1a1a] text-white' : 'hover:bg-[var(--bg-hover)]'}`}
        style={{ paddingLeft: depth * 18 + 6 }}>
        <button onClick={(e) => { e.stopPropagation(); toggleObsDir(d.path) }}
          className="w-4 flex items-center justify-center flex-shrink-0">
          <ChevronRight size={12} className={`transition-transform ${obsExpanded.has(d.path) ? 'rotate-90' : ''}`} />
        </button>
        <FolderTree size={13} className="text-dim flex-shrink-0" />
        <span className="truncate">{d.name}</span>
      </div>
      {obsExpanded.has(d.path) && d.children.length > 0 && renderObsDirs(d.children, depth + 1)}
    </div>
  ))
  const importObsFolder = async () => {
    if (!obsSel || !obsRootRef.current) return
    setObsImporting(true)
    setObsProgress('扫描文件…')
    try {
      const parts = obsSel.split('/').filter(Boolean)
      let cur: any = obsRootRef.current
      for (const p of parts) cur = await cur.getDirectoryHandle(p)
      const files: Array<{ name: string; file: File }> = []
      await collectObsFiles(cur, 0, files)
      if (files.length === 0) {
        setObsProgress('该文件夹下没有可导入的文件（md/txt/pdf/docx 等）')
        setObsImporting(false)
        return
      }
      let done = 0
      for (const { name, file } of files) {
        const fd = new FormData()
        fd.append('project_id', projectId || 'default')
        fd.append('session_id', 'resource')
        fd.append('api_key', localStorage.getItem('coagent-apikey') || '')
        fd.append('file', file, name)
        await fetch('/api/knowledge/upload-file', { method: 'POST', body: fd })
        done++
        setObsProgress(`导入中 ${done} / ${files.length}：${name}`)
      }
      setObsProgress(`完成，导入 ${done} 个文件（正在后台处理）`)
      setObsImporting(false)
      setTimeout(() => load(), 3000)
    } catch (e) {
      setObsProgress('导入失败：' + String(e))
      setObsImporting(false)
    }
  }

  const load = useCallback(() => {
    if (!projectId) return
    setLoading(true)
    fetch('/api/artifacts?project_id=' + encodeURIComponent(projectId), { cache: 'no-store' })
      .then(r => r.json()).then(d => setArtifacts(d.artifacts || [])).catch(() => {})
    fetch('/api/resources?project_id=' + encodeURIComponent(projectId), { cache: 'no-store' })
      .then(r => r.json()).then(d => setResources(d.resources || [])).catch(() => {})
    fetch('/api/knowledge/list?project_id=' + encodeURIComponent(projectId), { cache: 'no-store' })
      .then(r => r.json()).then(d => setKbDocs(d.docs || [])).catch(() => {})
      .finally(() => setLoading(false))
  }, [projectId])

  useEffect(() => { setDetail(null); load() }, [load])

  // 教程资源
  const allTutorials = [...PRESET_TUTORIALS, ...tutorials]
  const saveTutorials = (next: Tutorial[]) => {
    setTutorials(next)
    localStorage.setItem(TUTORIALS_KEY, JSON.stringify(next))
  }
  const removeTutorial = (id: string) => {
    setDetail(null)
    saveTutorials(tutorials.filter(t => t.id !== id))
  }

  // ---------- 我的上传 ----------
  const deleteResource = (id: string) => {
    if (!window.confirm('确定删除该资料？')) return
    fetch('/api/resources/' + id, { method: 'DELETE' }).then(() => {
      setResources(prev => prev.filter(r => r.id !== id))
      setDetail(null)
    })
  }
  const deleteKbDoc = (source: string) => {
    if (!window.confirm(`确定删除知识库文档「${source}」？`)) return
    fetch('/api/knowledge/delete?project_id=' + encodeURIComponent(projectId || 'default') + '&source=' + encodeURIComponent(source), { method: 'DELETE' })
      .then(() => {
        setKbDocs(prev => prev.filter(d => d.source !== source))
        setDetail(null)
      })
  }
  // 我的上传：手动添加资料
  const saveResource = () => {
    if (!rName.trim()) return
    fetch('/api/resources', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: rName.trim(), content: rContent, project_id: projectId || 'default' }),
    }).then(() => {
      setRName(''); setRContent(''); setShowAddResource(false); load()
    })
  }

  // 我的生成：自定义分类与内容
  const saveCustomGens = (next: typeof customGens) => {
    setCustomGens(next)
    localStorage.setItem(CUSTOM_GENS_KEY, JSON.stringify(next))
  }
  const addGenCat = () => {
    const name = newGenCatName.trim()
    if (!name || customGens.some(c => c.name === name)) return
    const id = 'cg-' + Date.now()
    saveCustomGens([...customGens, { id, name, items: [] }])
    if (tab === 'generated') setGenCat(id); else setUploadCat(id)
    setNewGenCatName(''); setShowNewGenCat(false)
  }
  const addGenItem = () => {
    if (!gTitle.trim()) return
    const curCat = tab === 'generated' ? genCat : uploadCat
    saveCustomGens(customGens.map(c => c.id === curCat ? { ...c, items: [...c.items, { id: 'gi-' + Date.now(), title: gTitle.trim(), content: gContent }] } : c))
    setGTitle(''); setGContent(''); setShowNewGenItem(false)
  }
  const removeGenCat = (id: string) => {
    if (!window.confirm('确定删除该分类及其内容？')) return
    saveCustomGens(customGens.filter(c => c.id !== id))
    if (genCat === id) setGenCat('all')
    if (uploadCat === id) setUploadCat('all')
  }
  const removeGenItem = (id: string) => {
    setDetail(null)
    const curCat = tab === 'generated' ? genCat : uploadCat
    saveCustomGens(customGens.map(c => c.id === curCat ? { ...c, items: c.items.filter(i => i.id !== id) } : c))
  }

  // ---------- 列表组装 ----------
  // 当前领域 + 当前分类下的教程
  const domainTutorials = allTutorials.filter(t => (t.domain || DEFAULT_DOMAINS[0]) === selectedDomain)
  const catTutorials = domainTutorials.filter(t => normalizeCat(t.category) === selectedCat)
  const tutorialList: ListItem[] = catTutorials.map(t => ({
    id: t.id, title: t.title,
    sub: '',
    time: '',
    body: t.desc || '暂无简介', icon: BookOpen,
    kind: 'tutorial' as const, url: t.url,
    deletable: !t.id.startsWith('preset-'),
  }))

  // 百科词条（当前领域）
  const wikiEntries = WIKI_ENTRIES.filter(w => w.domain === selectedDomain)
  const wikiThemes = Array.from(new Set(wikiEntries.map(w => w.theme)))
  const filteredWiki = wikiTheme === 'all' ? wikiEntries : wikiEntries.filter(w => w.theme === wikiTheme)

  let list: ListItem[] = []
  if (tab === 'generated') {
    const matched = artifacts.filter(a => {
      if (genCat === 'all') return true
      const keys = GEN_MATCH[genCat] || []
      return keys.some(k => String(a.type).includes(k))
    })
    list = matched.map(a => ({
      id: a.id, title: a.title, sub: a.dialogue_name ? `来自「${a.dialogue_name}」` : '对话生成',
      body: a.content, icon: TYPE_ICONS[a.type] || FileText,
      kind: 'artifact' as const, deletable: false, time: fmtTime(a.created_at),
    }))
  } else if (tab === 'uploads') {
    const kbItems: ListItem[] = kbDocs.map(d => ({ id: 'kb:' + d.source, title: d.source, sub: `知识库文档 · ${d.chunks} 块`, body: d.preview || '（无预览内容）', icon: Upload, kind: 'kb' as const, deletable: true, time: '' }))
    const resItems: ListItem[] = resources.map(r => ({ id: r.id, title: r.name, sub: '保存的资料', body: r.content || '', icon: FileText, kind: 'resource' as const, deletable: true, time: fmtTime(r.created_at) }))
    if (uploadCat === 'all') list = [...kbItems, ...resItems]
    else if (uploadCat === 'kb') list = kbItems
    else if (uploadCat === 'resource') list = resItems
    else list = []
  }

  const removeItem = (item: ListItem) => {
    if (item.kind === 'tutorial') removeTutorial(item.id)
    else if (item.kind === 'resource') deleteResource(item.id)
    else if (item.kind === 'kb') deleteKbDoc(item.title)
    else if (item.kind === 'gen') removeGenItem(item.id)
  }

  /** 导出卡片内容为 Markdown 文件（wiki 详情 / 生成物 / 资料正文） */
const exportItem = (item: ListItem) => {
  const content = item.body || ''
  const safeName = (item.title || '导出').replace(/[\\/:*?"<>|]/g, '-')
  const blob = new Blob(['# ' + item.title + '\n\n' + content], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = safeName + '.md'; a.click()
  URL.revokeObjectURL(url)
}

/** 普通卡片网格 */
  const cardGrid = (items: ListItem[]) => (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
      {items.map(item => {
        const Icon = item.icon
        return (
          <div
            key={item.id}
            onClick={() => setDetail(item)}
            draggable={!!onUseItem}
            onDragStart={onUseItem ? (e) => { e.dataTransfer.setData('text/obs-item', JSON.stringify({ title: item.title, body: item.body || '' })); e.dataTransfer.effectAllowed = 'copy' } : undefined}
            className="group card-surface rounded-2xl p-6 flex flex-col gap-4 cursor-pointer transition-all hover:shadow-lg hover:-translate-y-1 hover:border-[var(--border-strong)]"
          >
            <div className="flex items-start justify-between">
              <span className="w-12 h-12 rounded-xl bg-[#1a1a1a] text-white flex items-center justify-center">
                <Icon size={20} />
              </span>
              <div className="flex items-center gap-1.5">
                {item.url && (
                  <a href={item.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--bg-hover)] text-dim hover:bg-[var(--bg-active)] hover:text-[var(--accent)] transition-colors" title="打开链接">
                    <ExternalLink size={15} />
                  </a>
                )}
                {item.kind !== 'tutorial' && item.body && (
                  <button onClick={(e) => { e.stopPropagation(); exportItem(item) }}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--bg-hover)] text-dim hover:bg-[var(--bg-active)] hover:text-[var(--accent)] transition-colors" title="导出为文件">
                    <Download size={15} />
                  </button>
                )}
                {item.deletable && (
                  <button
                    onClick={(e) => { e.stopPropagation(); removeItem(item) }}
                    className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-[var(--bg-hover)] text-dim hover:bg-[var(--bg-active)] hover:text-red-500 transition-colors" title="删除"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
            <p className="text-base font-semibold leading-snug">{item.title}</p>
          </div>
        )
      })}
    </div>
  )

  /** 空状态 */
  const emptyState = (title: string, hint: string) => (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-14 h-14 rounded-2xl bg-[var(--bg-hover)] flex items-center justify-center mb-4">
        <FolderOpen size={22} className="text-dim" />
      </div>
      <p className="text-sm font-semibold text-[var(--text-muted)]">{title}</p>
      <p className="text-xs text-dim mt-1.5">{hint}</p>
    </div>
  )

  /** 教程资源区（系统学习 / 技术工具） */
  const tutorialSection = (
    <>
      <div className="flex items-end justify-between mb-5">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <FolderTree size={18} /> {selectedDomain} · {selectedCat}
          </h2>
        </div>
      </div>

      {loading && <p className="text-xs text-dim text-center py-16">加载中…</p>}
      {!loading && tutorialList.length === 0 && emptyState(`「${selectedCat}」暂无教程`, '教程资源为系统预设内容')}
      {!loading && tutorialList.length > 0 && cardGrid(tutorialList)}
    </>
  )

  /** 百科区：顶部主题筛选按钮 + 词条卡片（带百度百科链接） */
  const wikiSection = (
    <>
      <div className="flex items-end justify-between mb-5">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Library size={18} /> {selectedDomain} · 百科词条
        </h2>
      </div>
      {/* 主题筛选按钮（顶部排开） */}
      <div className="flex gap-2 flex-wrap mb-6">
        <button onClick={() => setWikiTheme('all')}
          className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
            wikiTheme === 'all' ? 'bg-[#1a1a1a] text-white shadow-soft' : 'bg-[var(--bg-hover)] text-dim hover:bg-[var(--bg-active)]'
          }`}>全部</button>
        {wikiThemes.map(theme => (
          <button key={theme} onClick={() => setWikiTheme(theme)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
              wikiTheme === theme ? 'bg-[#1a1a1a] text-white shadow-soft' : 'bg-[var(--bg-hover)] text-dim hover:bg-[var(--bg-active)]'
            }`}>{theme}</button>
        ))}
      </div>
      {filteredWiki.length === 0 ? (
        emptyState('该领域暂无百科词条', '')
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredWiki.map(w => (
            <div
              key={w.name}
              onClick={() => setDetail({ id: 'wiki:' + w.name, title: w.name, sub: `${w.theme} · ${w.domain}`, body: w.detail, icon: Library, kind: 'wiki', deletable: false })}
              className="group card-surface rounded-2xl p-6 flex flex-col gap-4 cursor-pointer transition-all hover:shadow-lg hover:-translate-y-1 hover:border-[var(--border-strong)]"
            >
              <div className="flex items-start justify-between">
                <span className="w-12 h-12 rounded-xl bg-[#1a1a1a] text-white flex items-center justify-center">
                  <Library size={20} />
                </span>
                <div className="flex items-center gap-1.5">
                  <a href={'https://baike.baidu.com/item/' + encodeURIComponent(w.name)} target="_blank" rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--bg-hover)] text-dim hover:bg-[var(--bg-active)] hover:text-[var(--accent)] transition-colors" title="百度百科">
                    <ExternalLink size={15} />
                  </a>
                  <button onClick={(e) => { e.stopPropagation(); exportItem({ id: 'wiki:' + w.name, title: w.name, sub: w.theme, body: w.detail, icon: Library, kind: 'wiki', deletable: false }) }}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--bg-hover)] text-dim hover:bg-[var(--bg-active)] hover:text-[var(--accent)] transition-colors" title="导出为文件">
                    <Download size={15} />
                  </button>
                </div>
              </div>
              <p className="text-base font-semibold leading-snug">{w.name}</p>
            </div>
          ))}
        </div>
      )}
    </>
  )

  // 我的生成：当前是否为自定义分类 + 其内容列表
  const isCustomCat = customGens.some(c => c.id === genCat)
  const isCustomUploadCat = customGens.some(c => c.id === uploadCat)
  const customItems: ListItem[] = (customGens.find(c => c.id === (tab === 'generated' ? genCat : uploadCat))?.items || []).map(i => ({
    id: i.id, title: i.title, sub: '自定义内容', body: i.content, icon: Sparkles,
    kind: 'gen' as const, deletable: true, time: '',
  }))

  /** 左侧栏「我的分类」公共区块（我的生成 / 我的上传 共用） */
  const renderMyCats = (active: string, onSelect: (id: string) => void) => (
    <>
      <div className="w-px h-3 bg-[var(--border-color)] my-1.5 self-center" />
      <p className="text-[10px] font-bold text-dim uppercase tracking-wider px-2.5 mb-0.5">我的分类</p>
      {customGens.map(c => (
        <div key={c.id} className="group flex items-center rounded-xl">
          <button onClick={() => { onSelect(c.id); setDetail(null) }}
            className={`flex-1 flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-left transition-colors ${
              active === c.id ? 'bg-[#1a1a1a] text-white shadow-soft' : 'text-dim hover:bg-[var(--bg-hover)]'
            }`}>
            <Sparkles size={13} /> {c.name}
          </button>
          <button onClick={(e) => { e.stopPropagation(); removeGenCat(c.id) }}
            className="opacity-0 group-hover:opacity-100 p-1 mr-1 rounded text-gray-300 hover:text-red-500 flex-shrink-0" title="删除分类">
            <Trash2 size={11} />
          </button>
        </div>
      ))}
      {showNewGenCat ? (
        <div className="flex gap-1 px-1 pt-1">
          <input autoFocus value={newGenCatName} onChange={e => setNewGenCatName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addGenCat() }}
            placeholder="分类名" className="flex-1 px-2 py-1.5 text-[11px] input-surface rounded-lg outline-none" />
          <button onClick={addGenCat} className="px-2 py-1 text-[11px] bg-[#1a1a1a] text-white rounded-lg font-semibold">加</button>
        </div>
      ) : (
        <button onClick={() => setShowNewGenCat(true)}
          className="flex items-center gap-1.5 px-3 py-2 mt-1 text-[11px] text-dim hover:text-[#1a1a1a] rounded-xl hover:bg-[var(--bg-hover)] transition-colors">
          <Plus size={12} /> 新建分类
        </button>
      )}
    </>
  )

  return (
    <div className="flex-1 h-full min-w-0 flex flex-col panel rounded-3xl overflow-hidden">
      {/* 顶部 Hero：主题化配色（跟随 light/dark/warm） */}
      <div className="flex-shrink-0 px-8 pt-6 pb-6 bg-[var(--bg-panel)] border-b border-[var(--border-color)]">
          {/* 领域选择（逻辑上最先选领域：置于最顶、靠左展开） */}
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            {DEFAULT_DOMAINS.map(d => (
              <button
                key={d}
                onClick={() => { setSelectedDomain(d); setSelectedCat(CATEGORIES[0].key); setDetail(null) }}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-all ${
                  selectedDomain === d
                    ? 'bg-[#1a1a1a] text-white shadow-soft ring-2 ring-[var(--accent)]/40'
                    : 'bg-[var(--bg-hover)] text-[var(--text-muted)] hover:bg-[var(--bg-active)] border border-[var(--border-color)]'
                }`}
              >
                <FolderTree size={15} />
                {d}
              </button>
            ))}
          </div>

          {/* 功能入口大按钮 */}
          <div className="flex flex-wrap gap-3 mt-4">
            {NAV.map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                onClick={() => { setTab(key); setDetail(null) }}
                className={`flex items-center gap-3 px-5 py-3 rounded-2xl border text-left transition-all ${
                  tab === key
                    ? 'border-[var(--border-strong)] bg-[var(--bg-hover)]'
                    : 'border-[var(--border-color)] bg-[var(--bg-panel)] hover:bg-[var(--bg-hover)]'
                }`}
              >
                <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-[#1a1a1a] text-white">
                  <Icon size={15} />
                </span>
                <span className="text-sm font-semibold">{label}</span>
              </button>
            ))}
          </div>
      </div>

      {/* 主体：左侧分类栏 + 内容区 */}
      <div className="flex-1 flex min-h-0">
        {tab === 'tutorials' && (
          <div className="w-40 flex-shrink-0 border-r hairline bg-[var(--bg-sidebar)] p-2.5 flex flex-col gap-1 overflow-y-auto">
            {CATEGORIES.map(c => {
              const Icon = CAT_ICONS[c.key]
              const active = selectedCat === c.key
              return (
                <button
                  key={c.key}
                  onClick={() => { setSelectedCat(c.key); setDetail(null) }}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium text-left transition-colors ${
                    active ? 'bg-[#1a1a1a] text-white shadow-soft' : 'text-dim hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  {Icon && <Icon size={14} className={active ? 'text-white' : 'text-dim'} />}
                  <span className="font-semibold">{c.key}</span>
                </button>
              )
            })}
          </div>
        )}
        {tab === 'generated' && (
          <div className="w-40 flex-shrink-0 border-r hairline bg-[var(--bg-sidebar)] p-2.5 flex flex-col gap-1 overflow-y-auto">
            <p className="text-[10px] font-bold text-dim uppercase tracking-wider px-2.5 mt-1 mb-0.5">预设分类</p>
            {GEN_CATS.map(c => (
              <button key={c.key} onClick={() => { setGenCat(c.key); setDetail(null) }}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-left transition-colors ${
                  genCat === c.key ? 'bg-[#1a1a1a] text-white shadow-soft' : 'text-dim hover:bg-[var(--bg-hover)]'
                }`}>
                <Sparkles size={13} /> {c.label}
              </button>
            ))}
            {renderMyCats(genCat, setGenCat)}
          </div>
        )}
        {tab === 'uploads' && (
          <div className="w-40 flex-shrink-0 border-r hairline bg-[var(--bg-sidebar)] p-2.5 flex flex-col gap-1 overflow-y-auto">
            <p className="text-[10px] font-bold text-dim uppercase tracking-wider px-2.5 mt-1 mb-0.5">预设分类</p>
            {[{ key: 'all', label: '全部' }, { key: 'kb', label: '知识库文档' }, { key: 'resource', label: '保存的资料' }].map(c => (
              <button key={c.key} onClick={() => { setUploadCat(c.key); setDetail(null) }}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-left transition-colors ${
                  uploadCat === c.key ? 'bg-[#1a1a1a] text-white shadow-soft' : 'text-dim hover:bg-[var(--bg-hover)]'
                }`}>
                <Upload size={13} /> {c.label}
              </button>
            ))}
            {renderMyCats(uploadCat, setUploadCat)}
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-10 py-8">
          <div className="max-w-6xl mx-auto">
          {tab === 'tutorials' && (selectedCat === WIKI_CAT ? wikiSection : tutorialSection)}
          {tab === 'generated' && (
            <>
              <div className="flex items-end justify-between mb-5">
                <h2 className="text-lg font-bold flex items-center gap-2"><Sparkles size={18} /> 我的生成</h2>
                {isCustomCat && !showNewGenItem && (
                  <button
                    onClick={() => setShowNewGenItem(true)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-[#1a1a1a] text-white text-xs font-semibold rounded-xl hover:bg-[#333333] transition-colors"
                  >
                    <Plus size={13} /> 新建内容
                  </button>
                )}
              </div>

              {isCustomCat && showNewGenItem && (
                <div className="border border-[var(--border-color)] rounded-2xl p-3 mb-5 flex flex-col gap-2 bg-[var(--bg-panel)] shadow-soft">
                  <input autoFocus value={gTitle} onChange={e => setGTitle(e.target.value)} placeholder="内容名称"
                    className="px-3 py-2 text-xs input-surface rounded-xl outline-none" />
                  <textarea value={gContent} onChange={e => setGContent(e.target.value)} placeholder="内容（支持多行）"
                    rows={4}
                    className="px-3 py-2 text-xs input-surface rounded-xl outline-none resize-none" />
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setShowNewGenItem(false)} className="px-3 py-1.5 text-[11px] text-dim rounded-xl row-hover">取消</button>
                    <button onClick={addGenItem} className="px-3 py-1.5 text-[11px] bg-[#1a1a1a] text-white font-semibold rounded-xl">保存</button>
                  </div>
                </div>
              )}

              {isCustomCat ? (
                <>
                  {loading && <p className="text-xs text-dim text-center py-16">加载中…</p>}
                  {!loading && customItems.length === 0 && emptyState('该分类暂无内容', '点击右上角「新建内容」添加')}
                  {!loading && customItems.length > 0 && cardGrid(customItems)}
                </>
              ) : (
                <>
                  {loading && <p className="text-xs text-dim text-center py-16">加载中…</p>}
                  {!loading && list.length === 0 && emptyState('暂无生成物', '对话生成讲义 / 指南 / 测试题后自动收录到这里')}
                  {!loading && list.length > 0 && cardGrid(list)}
                </>
              )}
            </>
          )}
          {tab === 'uploads' && (
            <>
              <div className="flex items-end justify-between mb-5">
                <h2 className="text-lg font-bold flex items-center gap-2"><Upload size={18} /> 我的上传</h2>
                <div className="flex items-center gap-2">
                  <button onClick={openObsPicker}
                    className="flex items-center gap-1.5 px-4 py-2 bg-[#1a1a1a] text-white text-xs font-semibold rounded-xl hover:bg-[#333333] transition-colors">
                    <BookOpen size={13} /> 从本地文档导入
                  </button>
                  {isCustomUploadCat ? (
                  !showNewGenItem && (
                    <button onClick={() => setShowNewGenItem(true)}
                      className="flex items-center gap-1.5 px-4 py-2 bg-[#1a1a1a] text-white text-xs font-semibold rounded-xl hover:bg-[#333333] transition-colors">
                      <Plus size={13} /> 新建内容
                    </button>
                  )
                ) : (
                  !showAddResource && (
                    <button onClick={() => setShowAddResource(true)}
                      className="flex items-center gap-1.5 px-4 py-2 bg-[#1a1a1a] text-white text-xs font-semibold rounded-xl hover:bg-[#333333] transition-colors">
                      <Plus size={13} /> 添加资料
                    </button>
                  )
                )}
                </div>
              </div>

              {/* 添加资料表单（预设分类下） */}
              {!isCustomUploadCat && showAddResource && (
                <div className="border border-[var(--border-color)] rounded-2xl p-3 mb-5 flex flex-col gap-2 bg-[var(--bg-panel)] shadow-soft">
                  <input autoFocus value={rName} onChange={e => setRName(e.target.value)} placeholder="资料名称"
                    className="px-3 py-2 text-xs input-surface rounded-xl outline-none" />
                  <textarea value={rContent} onChange={e => setRContent(e.target.value)} placeholder="资料内容（可选，支持多行）"
                    rows={3}
                    className="px-3 py-2 text-xs input-surface rounded-xl outline-none resize-none" />
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setShowAddResource(false)} className="px-3 py-1.5 text-[11px] text-dim rounded-xl row-hover">取消</button>
                    <button onClick={saveResource} className="px-3 py-1.5 text-[11px] bg-[#1a1a1a] text-white font-semibold rounded-xl">保存</button>
                  </div>
                </div>
              )}

              {/* 新建内容表单（自定义分类下） */}
              {isCustomUploadCat && showNewGenItem && (
                <div className="border border-[var(--border-color)] rounded-2xl p-3 mb-5 flex flex-col gap-2 bg-[var(--bg-panel)] shadow-soft">
                  <input autoFocus value={gTitle} onChange={e => setGTitle(e.target.value)} placeholder="内容名称"
                    className="px-3 py-2 text-xs input-surface rounded-xl outline-none" />
                  <textarea value={gContent} onChange={e => setGContent(e.target.value)} placeholder="内容（支持多行）"
                    rows={4}
                    className="px-3 py-2 text-xs input-surface rounded-xl outline-none resize-none" />
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setShowNewGenItem(false)} className="px-3 py-1.5 text-[11px] text-dim rounded-xl row-hover">取消</button>
                    <button onClick={addGenItem} className="px-3 py-1.5 text-[11px] bg-[#1a1a1a] text-white font-semibold rounded-xl">保存</button>
                  </div>
                </div>
              )}

              {isCustomUploadCat ? (
                <>
                  {loading && <p className="text-xs text-dim text-center py-16">加载中…</p>}
                  {!loading && customItems.length === 0 && emptyState('该分类暂无内容', '点击右上角「新建内容」添加')}
                  {!loading && customItems.length > 0 && cardGrid(customItems)}
                </>
              ) : (
                <>
                  {loading && <p className="text-xs text-dim text-center py-16">加载中…</p>}
                  {!loading && list.length === 0 && emptyState('暂无上传内容', '点击右上角「添加资料」或上传知识库文档后展示在这里')}
                  {!loading && list.length > 0 && cardGrid(list)}
                </>
              )}
            </>
          )}
          </div>
        </div>
      </div>

      {/* 详情模态 */}
      {detail && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setDetail(null)}>
          <div className="bg-[var(--bg-panel)] rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-color)] flex-shrink-0">
              <h3 className="text-base font-bold flex items-center gap-2">
                <detail.icon size={16} /> {detail.title}
              </h3>
              <button onClick={() => setDetail(null)} className="p-1 hover:bg-[var(--bg-hover)] rounded"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <p className="text-[11px] text-dim mb-3">{detail.sub}</p>
              <div className="text-sm leading-relaxed whitespace-pre-wrap text-[var(--text-muted)]">{detail.body}</div>
            </div>
            <div className="flex gap-2 justify-between items-center px-5 py-3 border-t border-[var(--border-color)] flex-shrink-0">
              {detail.kind === 'wiki' ? (
                <span className="text-[11px] text-dim">百科词条 · 由系统内置</span>
              ) : <span />}
              <div className="flex items-center gap-2">
                {onUseItem && detail.body && (
                  <button onClick={() => onUseItem(detail.title, detail.body)}
                    className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-white rounded-xl shadow-soft hover:scale-105 transition-transform"
                    style={{ background: 'var(--accent)' }}>
                    <Plus size={14} /> 加入项目
                  </button>
                )}
                {detail.deletable && (
                  <button onClick={() => removeItem(detail)}
                    className="flex items-center gap-1.5 px-3.5 py-2 text-sm text-red-500 hover:bg-red-50 rounded-xl transition-colors">
                    <Trash2 size={14} /> 删除
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Obsidian 文件夹导入弹窗 */}
      {obsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="w-[540px] max-h-[72vh] flex flex-col rounded-2xl panel shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b hairline flex items-center justify-between flex-shrink-0">
              <h3 className="text-sm font-bold flex items-center gap-2"><BookOpen size={16} /> 从本地文档导入</h3>
              <button onClick={() => setObsOpen(false)} className="w-7 h-7 flex items-center justify-center rounded-lg text-dim hover:bg-[var(--bg-hover)]">
                <X size={14} />
              </button>
            </div>
            <div className="px-5 py-2.5 border-b hairline flex items-center justify-between flex-shrink-0">
              <span className="text-[11px] text-dim truncate">{obsSel ? `已选择：${obsSel.replace(/^\//, '')}` : '请选择一个文件夹'}</span>
              <span className="text-[10px] text-dim flex-shrink-0 ml-3">md / txt / pdf / docx 等</span>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {obsErr ? (
                <p className="text-xs text-red-600 p-4 leading-relaxed">{obsErr}</p>
              ) : obsDirs.length === 0 ? (
                <p className="text-xs text-dim text-center py-8">库中没有子文件夹</p>
              ) : renderObsDirs(obsDirs, 0)}
            </div>
            <div className="px-5 py-3 border-t hairline flex items-center justify-between flex-shrink-0">
              <span className="text-[11px] text-dim truncate">{obsProgress}</span>
              <button onClick={importObsFolder} disabled={!obsSel || obsImporting}
                className={`px-4 py-2 rounded-xl text-xs font-semibold text-white shadow-soft transition-transform ${(!obsSel || obsImporting) ? 'opacity-40 cursor-not-allowed' : 'hover:scale-105'}`}
                style={{ background: 'var(--accent)' }}>
                {obsImporting ? '导入中…' : '导入此文件夹'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
