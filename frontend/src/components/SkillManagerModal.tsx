import { useState, useEffect } from 'react'
import { X, Upload, Trash2, Package } from 'lucide-react'

interface Props { onClose: () => void }

export default function SkillManagerModal({ onClose }: Props) {
  const [skills, setSkills] = useState<Array<{name: string; description: string; folder: string}>>([])
  const [uploadName, setUploadName] = useState('')
  const [uploadCode, setUploadCode] = useState('')

  useEffect(() => {
    fetch('/api/skills').then(r => r.json()).then(d => setSkills(d.skills || []))
  }, [])

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col mx-4" onMouseDown={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#dad4cd] flex-shrink-0">
          <h2 className="text-base font-bold flex items-center gap-2"><Package size={18} className="text-purple-500" /> Skill 管理</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
        </div>

        {/* 已安装列表 */}
        <div className="flex-1 overflow-y-auto p-5">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">已安装 Skill</h3>
          {skills.length === 0 ? (
            <p className="text-xs text-gray-400">暂无 Skill</p>
          ) : (
            <div className="flex flex-col gap-2">
              {skills.map(s => (
                <div key={s.name} className="border border-[#dad4cd] rounded-lg p-3 flex items-center justify-between">
                  <div>
                    <span className="text-sm font-semibold">{s.name}</span>
                    <p className="text-[11px] text-gray-400 mt-0.5">{s.description}</p>
                    <span className="text-[10px] text-gray-300">📁 skills/{s.folder}/</span>
                  </div>
                  <button className="p-1.5 text-gray-400 hover:text-red-500 transition-colors" title="删除"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}

          {/* 上传 */}
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mt-5 mb-3 flex items-center gap-1"><Upload size={12} /> 上传新 Skill</h3>
          <div className="border border-dashed border-[#c4beb6] rounded-lg p-4 bg-[#faf8f5] space-y-3">
            <input value={uploadName} onChange={e => setUploadName(e.target.value)} placeholder="Skill 名称（英文，如 my_search）"
              className="w-full px-3 py-2 border border-[#c4beb6] rounded-lg text-sm outline-none focus:border-[#c75f1a] bg-white" />
            <textarea value={uploadCode} onChange={e => setUploadCode(e.target.value)} placeholder="粘贴 Skill 代码..." rows={5}
              className="w-full px-3 py-2 border border-[#c4beb6] rounded-lg text-xs font-mono outline-none resize-none focus:border-[#c75f1a] bg-white" />
            <button className="px-4 py-2 bg-[#c75f1a] text-white text-sm font-semibold rounded-lg hover:bg-[#a84a10] w-full">
              上传 Skill
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
