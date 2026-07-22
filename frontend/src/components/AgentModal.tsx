import { useState } from 'react'
import { X, RotateCcw } from 'lucide-react'
import type { AgentConfig } from '../types'

interface Props {
  agent: AgentConfig
  onSave: (updated: AgentConfig) => void
  onClose: () => void
}

export default function AgentModal({ agent, onSave, onClose }: Props) {
  const [mode, setMode] = useState(agent.mode)
  const [prompt, setPrompt] = useState(agent.systemPrompt)
  const [skill, setSkill] = useState(agent.skill)

  const currentMode = agent.modes.find(m => m.label === mode)

  const handleModeChange = (label: string) => {
    setMode(label)
    // 恢复默认提示词再叠加模式
    setPrompt(agent.defaultPrompt)
  }

  const handleSave = () => {
    onSave({ ...agent, mode, systemPrompt: prompt, skill })
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col mx-4"
           onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#dad4cd]">
          <h2 className="text-base font-bold flex items-center gap-2">
            <span>{agent.icon}</span> {agent.name}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
          {/* 模式选择 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">模式</label>
              <button
                onClick={() => { setMode('标准'); setPrompt(agent.defaultPrompt) }}
                className="text-[10px] text-gray-400 hover:text-[#c75f1a] flex items-center gap-1"
              >
                <RotateCcw size={10} /> 恢复默认
              </button>
            </div>
            <div className="flex gap-2">
              {agent.modes.map((m) => (
                <button
                  key={m.label}
                  onClick={() => handleModeChange(m.label)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    mode === m.label
                      ? 'bg-[#fef3eb] text-[#c75f1a] border border-[#c75f1a]/30'
                      : 'bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            {currentMode?.promptOverride && (
              <p className="text-[10px] text-gray-400 mt-1.5">模式叠加：{currentMode.promptOverride}</p>
            )}
          </div>

          {/* 全局性提示词 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">全局性提示词</label>
              <button
                onClick={() => setPrompt(agent.defaultPrompt)}
                className="text-[10px] text-gray-400 hover:text-[#c75f1a] flex items-center gap-1"
              >
                <RotateCcw size={10} /> 恢复默认
              </button>
            </div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={6}
              className="w-full px-3 py-2 border border-[#c4beb6] rounded-lg text-xs font-mono outline-none resize-none focus:border-[#c75f1a] bg-[#faf8f5]"
            />
          </div>

          {/* Skill */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Skill</label>
              <button
                onClick={() => setSkill(agent.defaultSkill)}
                className="text-[10px] text-gray-400 hover:text-[#c75f1a] flex items-center gap-1"
              >
                <RotateCcw size={10} /> 恢复默认
              </button>
            </div>
            <textarea
              value={skill}
              onChange={(e) => agent.skillEditable ? setSkill(e.target.value) : null}
              readOnly={!agent.skillEditable}
              rows={4}
              className={`w-full px-3 py-2 border border-[#c4beb6] rounded-lg text-xs font-mono outline-none resize-none ${
                agent.skillEditable ? 'focus:border-[#c75f1a] bg-[#faf8f5]' : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            />
            {!agent.skillEditable && (
              <p className="text-[10px] text-gray-400 mt-1">此 Skill 为系统预设，不可编辑</p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 justify-end px-5 py-3 border-t border-[#dad4cd]">
          <button onClick={onClose} className="px-4 py-1.5 text-sm text-gray-500 hover:bg-gray-100 rounded-lg">取消</button>
          <button onClick={handleSave} className="px-4 py-1.5 bg-[#c75f1a] text-white text-sm font-semibold rounded-lg hover:bg-[#a84a10]">保存</button>
        </div>
      </div>
    </div>
  )
}
