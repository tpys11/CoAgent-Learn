/**
 * QuizViewer：交互式测试题渲染组件（资源生成 · 测试题）
 *
 * 数据契约：react-quiz-component 原生 JSON（后端 resource_gen 的 quiz 能力输出）。
 * 容错：content 剥 fence → JSON.parse → 结构校验；任何失败返回 null，
 * 由调用方（SpecialOutputPane）回退 Markdown 渲染，兼容存量静态测试题。
 */
import Quiz from 'react-quiz-component'
import type { QuizData } from 'react-quiz-component'

/** 库默认文案全量中文化（key 与库 defaultLocale 一一对应，缺一即回退英文） */
const APP_LOCALE: Record<string, string> = {
  landingHeaderText: '共 <questionLength> 题',
  question: '题目',
  startQuizBtn: '开始测验',
  resultFilterAll: '全部',
  resultFilterCorrect: '答对',
  resultFilterIncorrect: '答错',
  resultFilterUnanswered: '未作答',
  nextQuestionBtn: '下一题',
  prevQuestionBtn: '上一题',
  resultPageHeaderText: '测验完成！答对 <correctIndexLength> / <questionLength> 题',
  resultPagePoint: '得分 <correctPoints> / <totalPoints>',
  pauseScreenDisplay: '测验已暂停，点击继续按钮恢复',
  timerTimeRemaining: '剩余时间',
  timerTimeTaken: '用时',
  pauseScreenPause: '暂停',
  pauseScreenResume: '继续',
  singleSelectionTagText: '单选题',
  multipleSelectionTagText: '多选题',
  pickNumberOfSelection: '请选择 <numberOfSelection> 项',
  marksOfQuestion: '（<marks> 分）',
}

/** 从 content 中提取并解析测验 JSON；不合法返回 null */
export function parseQuizContent(content: string): QuizData | null {
  let raw = (content || '').trim()
  if (!raw) return null
  // 剥 ```json / ``` fence
  const fence = raw.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
  if (fence) raw = fence[1].trim()
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof data !== 'object' || data === null) return null
  const d = data as QuizData
  if (typeof d.quizTitle !== 'string' || !d.quizTitle.trim()) return null
  if (!Array.isArray(d.questions) || d.questions.length === 0) return null
  for (const q of d.questions) {
    if (typeof q !== 'object' || q === null) return null
    if (typeof q.question !== 'string' || !q.question.trim()) return null
    if (!Array.isArray(q.answers) || q.answers.length < 2) return null
    if (q.correctAnswer === undefined || q.correctAnswer === null) return null
  }
  return d
}

/** 交互式测试题：点击作答、即时反馈、计分、进度条（失败返回 null 由调用方回退） */
export default function QuizViewer({ content }: { content: string }): React.ReactElement | null {
  const data = parseQuizContent(content)
  if (!data) return null
  return (
    <div className="quiz-viewer">
      <Quiz
        quiz={data}
        showInstantFeedback
        enableProgressBar
        allowNavigation
        appLocale={APP_LOCALE}
      />
      <style>{`
        .quiz-viewer .react-quiz-container { max-width: 100%; margin: 0; }
        .quiz-viewer .react-quiz-container .quiz-title,
        .quiz-viewer .react-quiz-container h2 { color: var(--text); font-size: 14px; font-weight: 600; }
        .quiz-viewer .react-quiz-container .quiz-synopsis { color: var(--dim); font-size: 12px; }
        .quiz-viewer .react-quiz-container .startQuizWrapper { margin-top: 10px; }
        .quiz-viewer .react-quiz-container .startQuizBtn,
        .quiz-viewer .react-quiz-container .nextQuestionBtn,
        .quiz-viewer .react-quiz-container .prevQuestionBtn,
        .quiz-viewer .react-quiz-container .btn { background: var(--accent); border-color: var(--accent); border-radius: 10px; color: #fff; font-size: 12px; padding: 6px 14px; }
        .quiz-viewer .react-quiz-container .nextQuestionBtn:hover,
        .quiz-viewer .react-quiz-container .prevQuestionBtn:hover { opacity: .85; }
        .quiz-viewer .react-quiz-container .questionWrapper .btn { background: var(--bg-hover); border-color: var(--border-color); color: var(--text); border-radius: 10px; }
        .quiz-viewer .react-quiz-container .questionWrapper .btn.correct { background: #10b981; border-color: #10b981; color: #fff; }
        .quiz-viewer .react-quiz-container .questionWrapper .btn.incorrect { background: #ef4444; border-color: #ef4444; color: #fff; }
        .quiz-viewer .react-quiz-container .questionWrapper .btn:disabled { opacity: 1; }
        .quiz-viewer .react-quiz-container .questionWrapper .explanation { color: var(--text); font-size: 12px; background: var(--bg-hover); border-radius: 10px; padding: 8px 12px; margin-top: 8px; }
        .quiz-viewer .react-quiz-container .quiz-nav-buttons { margin-top: 12px; }
        .quiz-viewer .react-quiz-container .progressBar { background: var(--bg-hover); border-radius: 6px; height: 6px; overflow: hidden; }
        .quiz-viewer .react-quiz-container .quiz-tag { color: var(--dim); font-size: 11px; }
        .quiz-viewer .react-quiz-container .result-answer-wrapper { color: var(--text); font-size: 12px; }
        .quiz-viewer .react-quiz-container .result-answer-wrapper .btn { background: var(--bg-hover); border-color: var(--border-color); color: var(--text); border-radius: 10px; }
        .quiz-viewer .react-quiz-container .result-answer-wrapper .btn.correct { background: #10b981; border-color: #10b981; color: #fff; }
        .quiz-viewer .react-quiz-container .result-answer-wrapper .btn.incorrect { background: #ef4444; border-color: #ef4444; color: #fff; }
      `}</style>
    </div>
  )
}