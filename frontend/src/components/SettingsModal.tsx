import { useState, useEffect } from 'react'
import { X, Sun, Moon, Monitor, Type, Key } from 'lucide-react'

interface Props {
  onClose: () => void
}

export default function SettingsModal({ onClose }: Props) {
  const [fontSize, setFontSize] = useState(() => parseInt(localStorage.getItem('coagent-fontSize') || '15'))
  const [theme, setTheme] = useState(() => localStorage.getItem('coagent-theme') || 'system')
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('coagent-apikey') || '')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    document.documentElement.style.fontSize = `${fontSize}px`
    localStorage.setItem('coagent-fontSize', String(fontSize))
  }, [fontSize])

  useEffect(() => {
    localStorage.setItem('coagent-theme', theme)
    if (theme === 'dark') document.documentElement.classList.add('dark')
    else if (theme === 'light') document.documentElement.classList.remove('dark')
  }, [theme])

  const handleApiKeySave = () => {
    localStorage.setItem('coagent-apikey', apiKey)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#dad4cd]">
          <h2 className="text-base font-bold">设置</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
        </div>

        <div className="p-5 flex flex-col gap-5">
          {/* 字体大小 */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5 mb-2">
              <Type size={14} /> 字体大小
            </label>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400">12</span>
              <input
                type="range" min="12" max="20" value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                className="flex-1 accent-[#c75f1a]"
              />
              <span className="text-xs text-gray-400">20</span>
              <span className="text-xs font-semibold text-[#c75f1a] w-8 text-right">{fontSize}px</span>
            </div>
          </div>

          {/* 主题 */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">页面主题</label>
            <div className="flex gap-2">
              {[
                { value: 'light', icon: Sun, label: '日间' },
                { value: 'dark', icon: Moon, label: '夜间' },
                { value: 'system', icon: Monitor, label: '跟随系统' },
              ].map(({ value, icon: Icon, label }) => (
                <button
                  key={value}
                  onClick={() => setTheme(value)}
                  className={`flex-1 flex flex-col items-center gap-1 py-3 rounded-lg text-xs font-medium transition-colors ${
                    theme === value
                      ? 'bg-[#fef3eb] text-[#c75f1a] border border-[#c75f1a]/30'
                      : 'bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  <Icon size={18} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* API Key */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5 mb-2">
              <Key size={14} /> API Key
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                onMouseDown={(e) => e.stopPropagation()}
                placeholder="输入 DEEPSEEK_API_KEY"
                className="flex-1 px-3 py-2 border border-[#c4beb6] rounded-lg text-sm outline-none focus:border-[#c75f1a] bg-[#faf8f5]"
              />
              <button
                onClick={handleApiKeySave}
                className="px-4 py-2 bg-[#c75f1a] text-white text-sm font-semibold rounded-lg hover:bg-[#a84a10]"
              >
                保存
              </button>
              {saved && <span className="text-xs text-green-600 font-medium ml-2">✓ 已保存</span>}
            </div>
            <p className="text-[10px] text-gray-400 mt-1.5">API Key 仅保存在浏览器本地，不会上传到服务器。</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export function ApiKeyPrompt({ onClose }: { onClose: () => void }) {
  const [key, setKey] = useState('')

  const handleSave = () => {
    if (key.trim()) {
      localStorage.setItem('coagent-apikey', key.trim())
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
        <h2 className="text-lg font-bold mb-2">配置 API Key</h2>
        <p className="text-sm text-gray-500 mb-4">请输入 DeepSeek API Key 以启用 Agent 功能。后续可在设置中修改。</p>
        <input
          autoFocus
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          placeholder="sk-..."
          className="w-full px-3 py-2.5 border border-[#c4beb6] rounded-lg text-sm outline-none focus:border-[#c75f1a] mb-4"
        />
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg">跳过</button>
          <button onClick={handleSave} className="px-4 py-2 bg-[#c75f1a] text-white text-sm font-semibold rounded-lg hover:bg-[#a84a10]">确认</button>
        </div>
      </div>
    </div>
  )
}
