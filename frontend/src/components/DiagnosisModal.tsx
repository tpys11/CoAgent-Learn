import { useState } from 'react'

type DiagnosisAnswer = 'familiar' | 'known' | 'unknown' | string

interface DiagnosisResult {
  concept: string
  answer: DiagnosisAnswer
}

const ROUND1 = [
  'Python编程', 'Git版本控制', '大语言模型（LLM）', '提示词工程',
  'RAG检索增强生成', '向量数据库', 'Function Calling', 'AI Agent',
  'LangChain/LangGraph', 'MCP协议',
]
const ROUND2 = [
  'Embedding嵌入', '文档切块Chunking', '语义检索', '上下文窗口', 'Token分词器',
]
const ROUND3 = [
  'HNSW近邻检索', '稀疏稠密融合检索', 'Agent记忆分层', 'ReAct范式', 'GraphRAG',
]

const OPTIONS = [
  { label: '比较熟悉', value: 'familiar' as const },
  { label: '知道但不熟悉', value: 'known' as const },
  { label: '完全不知道', value: 'unknown' as const },
  { label: '自定义输入', value: 'custom' as const },
]

interface Props {
  onClose: () => void
}

export default function DiagnosisModal({ onClose }: Props) {
  const [stage, setStage] = useState<1 | 2 | 3>(1)
  const [round, setRound] = useState(0)
  const [questionIndex, setQuestionIndex] = useState(0)
  const [results, setResults] = useState<DiagnosisResult[]>([])
  const [customInput, setCustomInput] = useState('')
  const [showCustomInput, setShowCustomInput] = useState(false)

  const rounds = [ROUND1, ROUND2, ROUND3]
  const currentQuestions = rounds[round]
  const currentConcept = currentQuestions?.[questionIndex]

  const answer = (value: DiagnosisAnswer) => {
    setResults([...results, { concept: currentConcept, answer: value }])
    if (questionIndex + 1 < currentQuestions.length) {
      setQuestionIndex(questionIndex + 1)
    } else if (round < 2) {
      setRound(round + 1)
      setQuestionIndex(0)
    } else {
      setStage(3)
    }
  }

  const familiarCount = results.filter((r) => r.answer === 'familiar').length
  const knownCount = results.filter((r) => r.answer === 'known').length
  const unknownCount = results.filter((r) => r.answer === 'unknown' || (r.answer !== 'familiar' && r.answer !== 'known')).length

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 mx-4">

        {/* Stage 1: 触发弹窗 */}
        {stage === 1 && (
          <div className="flex flex-col gap-4">
            <h2 className="text-lg font-bold">开始知识诊断？</h2>
            <p className="text-sm text-gray-500">通过5分钟快速测试，系统能更准确地推荐适合你的学习内容。</p>
            <div className="flex gap-3 justify-end">
              <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg">不再提示</button>
              <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg">跳过</button>
              <button onClick={() => setStage(2)} className="px-4 py-2 text-sm bg-[#c75f1a] text-white font-semibold rounded-lg hover:bg-[#a84a10]">开始诊断</button>
            </div>
          </div>
        )}

        {/* Stage 2: 诊断流程 */}
        {stage === 2 && currentConcept && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-400">第 {round + 1} 轮</span>
              <span className="text-xs text-gray-300">{questionIndex + 1}/{currentQuestions.length}</span>
            </div>
            <h3 className="text-xl font-bold">{currentConcept}</h3>
            <div className="flex flex-col gap-2">
              {OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    if (opt.value === 'custom') {
                      setShowCustomInput(true)
                    } else {
                      answer(opt.value)
                    }
                  }}
                  className="w-full text-left px-4 py-2.5 border border-[#dad4cd] rounded-lg text-sm hover:border-[#c75f1a] hover:bg-[#fef3eb] transition-colors"
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {showCustomInput && (
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && customInput.trim()) {
                      answer(customInput.trim())
                      setCustomInput('')
                      setShowCustomInput(false)
                    }
                  }}
                  placeholder="请输入你的回答..."
                  className="flex-1 px-3 py-2 border border-[#c4beb6] rounded-lg text-sm outline-none focus:border-[#c75f1a]"
                />
                <button
                  onClick={() => {
                    if (customInput.trim()) {
                      answer(customInput.trim())
                      setCustomInput('')
                      setShowCustomInput(false)
                    }
                  }}
                  className="px-4 py-2 bg-[#c75f1a] text-white text-sm font-semibold rounded-lg"
                >
                  确认
                </button>
              </div>
            )}
            <button onClick={() => setStage(3)} className="text-xs text-gray-400 hover:text-gray-600 self-end">退出评估</button>
          </div>
        )}

        {/* Stage 3: 结果卡片 */}
        {stage === 3 && (
          <div className="flex flex-col gap-4">
            <h2 className="text-lg font-bold">诊断完成</h2>
            <div className="flex gap-4 justify-center">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{familiarCount}</div>
                <div className="text-xs text-gray-400">熟悉</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-500">{knownCount}</div>
                <div className="text-xs text-gray-400">了解</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-400">{unknownCount}</div>
                <div className="text-xs text-gray-400">待学</div>
              </div>
            </div>
            <button onClick={onClose} className="w-full py-2.5 bg-[#c75f1a] text-white font-semibold rounded-lg hover:bg-[#a84a10]">
              开始学习
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
