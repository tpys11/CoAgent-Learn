# 三、界面搭建 — React 前端 + NiceGUI 后端 UI

本文档描述 CoAgent-Learn 前后端界面的全部功能。

## 技术栈

| 层次 | 技术 |
|------|------|
| 前端框架 | React 19 + TypeScript |
| 构建工具 | Vite 6 |
| 样式系统 | Tailwind CSS 3 |
| 节点图可视化 | @xyflow/react 12（React Flow，预留） |
| 后端 UI 框架 | NiceGUI（内嵌 FastAPI） |
| 项目构建 | pyproject.toml（PEP 621） |

## 设计来源

| 来源文档 | 设计内容 |
|----------|---------|
| `界面总述.md` | 三栏布局、学习反馈横条、右侧第二对话窗口、知识图谱缩略图 |
| `界面左侧与项目栏.md` | 左侧项目列表、知识诊断（10→5→5三层测试） |
| `输入时交互与处理（总）.md` | 智能体工作过程可视化、AI向用户提问 |
| `输入框附近.md` | 检索设定、输出设定 |
| `可视化展示——知识图谱.md` | 知识图谱树状缩略图 |
| `四、输出/0、总述.md` | 学情诊断、可视化反馈、学习时长统计 |

## 功能总览

### 1. 三栏布局（呼吸感）

- 全屏容器四周留 8px 空白，三栏之间 8px 间隙
- **左侧 240px**：项目列表 + 新建/删除 + 左下角设置
- **中间弹性区**：反馈横条 → 工作过程可视化 → 消息列表 → 欢迎页 → 输入区
- **右侧 260px**：知识图谱缩略图 + 第二对话窗口

### 2. 左侧项目栏

- "+ 新建项目" 按钮，弹出命名对话框
- 新建后弹出"开始知识诊断？"三选一弹窗（开始 / 跳过 / 不再提示）
- 项目项选中高亮，右键删除；左下角齿轮按钮 → 主题切换

### 3. 知识诊断

- 三层自适应测试：首轮10个宽泛概念 → 第二轮5个收窄 → 第三轮5个深入
- 完成后弹出结果卡片：熟悉程度、分类进度条、盲区标签、总结报告

### 4. 反馈横条 + 实时计时器

- 黑色可见边框包裹，可收起/展开
- 时间段下拉（总时长/30天/7天/1天/本次会话）
- 实时秒级计时，30秒无操作自动暂停
- 显示专注时长 + Token 用量

### 5. 智能体工作过程可视化

- 4个步骤的圆点动画：活跃橙色脉冲，完成后变绿

### 6. 消息区 + 输入区

- 消息气泡（用户浅橙右对齐，助手透明左对齐），Markdown 渲染
- 输入框上方 4 个下拉框（白底黑边框包裹）：检索模式/输出格式/输出深度/思考展示
- Enter 发送，Shift+Enter 换行，发送按钮 Claude 橙色

### 7. 右侧面板

- 知识图谱预览（虚线边框占位卡片）
- 第二对话窗口：6 个追问模板 + 多窗口切换

### 8. 主题

- Claude 风格浅色（微黄 `#faf8f5`）+ 深色（黑灰 `#0d0d0d`），系统自适应

### 9. 前端独立启动（React）

- React 项目位于 `frontend/`，npm run dev 启动（端口 5173）
- 构建验证通过（1577模块/36s），零 TypeScript 错误

## 文件清单

| 文件 | 职责 |
|------|------|
| `frontend/src/App.tsx` | React 三栏布局主框架 |
| `frontend/src/components/Sidebar.tsx` | 左侧项目栏：新建/选择/删除 |
| `frontend/src/components/CenterPanel.tsx` | 消息气泡 + 4下拉框 + 输入 |
| `frontend/src/components/RightPanel.tsx` | 知识图谱占位 + 6追问 |
| `backend/main.py` | FastAPI+NiceGUI入口，三栏全屏布局 |
| `backend/ui/theme.py` | 双主题定义+全局CSS |
| `backend/ui/sidebar.py` | NiceGUI左侧项目栏 |
| `backend/ui/diagnosis.py` | 三层自适应诊断弹窗 |
| `backend/ui/stats_bar.py` | 反馈横条+实时计时器 |
| `backend/ui/chat_input.py` | 输入框+4下拉框 |
| `backend/ui/settings.py` | 设置面板 |
| `backend/ui/second_window.py` | 第二对话窗口 |

## 启动方式

| 服务 | 命令 | 端口 |
|------|------|------|
| 后端 | `python run.py` 或双击 `start-backend.bat` | 8000 |
| 前端 | `cd frontend && npm run dev` 或双击 `start-frontend.bat` | 5173 |
| 一键 | 双击 `start-all.bat`（两个窗口同时启动） | — |
