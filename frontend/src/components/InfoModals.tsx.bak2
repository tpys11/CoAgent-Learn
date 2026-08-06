import { useState, useEffect } from 'react'
import { X, Brain, Database, Plus, Trash2, Clock } from 'lucide-react'
import DragDropInput from './DragDropInput'

interface Props { onClose: () => void }

const closeOnBackdrop = (onClose: () => void) => (e: React.MouseEvent) => {
  if (e.target === e.currentTarget) onClose()
}

const ToggleBtn = ({ on, setOn }: { on: boolean; setOn: (v: boolean) => void }) => (
  <button onClick={() => setOn(!on)}
    className={`relative w-8 h-4 rounded-full transition-colors flex-shrink-0 ${on ? 'bg-gray-400' : 'bg-gray-300'}`}>
    <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all ${on ? 'left-4' : 'left-0.5'}`} />
  </button>
)

function OptionList({ items, active, onToggle, onRemove, onAdd, placeholder, accentColor }: {
  items: string[]; active: Set<string>; onToggle: (v: string) => void;
  onRemove: (v: string) => void; onAdd: (v: string) => void; placeholder: string; accentColor: string
}) {
  const [input, setInput] = useState('')
  return (
    <div className="space-y-1.5">
      {items.map(item => (
        <label key={item} className="flex items-center gap-2.5 py-1 px-2 rounded-lg hover:bg-gray-50 cursor-pointer group">
          <input type="checkbox" checked={active.has(item)} onChange={() => onToggle(item)}
            className="w-3.5 h-3.5 rounded" style={{ accentColor }} />
          <span className="flex-1 text-xs text-gray-700">{item}</span>
          <button onClick={(e) => { e.stopPropagation(); onRemove(item) }}
            className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-500"><Trash2 size={10} /></button>
        </label>
      ))}
      <div className="flex items-center gap-1.5 pl-7 pt-1">
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && input.trim()) { onAdd(input.trim()); setInput('') } }}
          placeholder={placeholder}
          className="flex-1 px-2 py-1 text-[11px] border border-dashed border-gray-300 rounded-md outline-none focus:border-gray-400 bg-transparent" />
        <button onClick={() => { if (input.trim()) { onAdd(input.trim()); setInput('') } }}
          className="p-0.5 text-gray-400 hover:text-gray-600"><Plus size={13} /></button>
      </div>
    </div>
  )
}

// ==================== 全局记忆系统 ====================
export function MemoryModal({ onClose }: Props) {
  const [autoMemory, setAutoMemory] = useState(true)
  useEffect(function(){
    var S=sessionStorage.getItem('coagent-s')||''
    fetch('/api/global-profile?session_id='+encodeURIComponent(S))
      .then(function(r){return r.json()})
      .then(function(d){
        if(d&&d.profile){
          var NL=String.fromCharCode(10)
          var txt=''
          if(d.profile.用户背景)txt+='用户背景: '+d.profile.用户背景+NL
          if(d.profile.偏好提问方式&&d.profile.偏好提问方式.length)txt+='偏好提问方式: '+d.profile.偏好提问方式.join(', ')+NL
          if(d.profile.偏好学习方式&&d.profile.偏好学习方式.length)txt+='偏好学习方式: '+d.profile.偏好学习方式.join(', ')+NL
          if(d.profile.偏好_输出&&d.profile.偏好_输出.length)txt+='偏好_输出: '+d.profile.偏好_输出.join(', ')+NL
          if(d.profile.学习时长)txt+='学习时长: '+d.profile.学习时长+NL
          if(d.profile.学习内容&&d.profile.学习内容.length)txt+='学习内容: '+d.profile.学习内容.join(', ')+NL
          if(d.profile.项目摘要){
            for(var pn in d.profile.项目摘要){
              var pi=d.profile.项目摘要[pn]
              txt+=pn+'项目摘要:'+NL
              if(pi.领域)txt+='  领域: '+pi.领域+NL
              if(pi.水平)txt+='  水平: '+pi.水平+NL
              if(pi.薄弱点&&pi.薄弱点.length)txt+='  薄弱点: '+pi.薄弱点.join(', ')+NL
              if(pi.兴趣&&pi.兴趣.length)txt+='  兴趣: '+pi.兴趣.join(', ')+NL
              if(pi.偏好&&pi.偏好.length)txt+='  偏好: '+pi.偏好.join(', ')+NL
            }
          }
          if(txt)setPersona(txt.trim())
        }
      }).catch(function(){})
  },[])

  const [purposePresets] = useState(['理解原理优先于记忆', '视觉型学习（图表/流程）', '动手实践优先', '自顶向下学习', '费曼输出法', '定期复习间隔'])
  const [activePurpose, setActivePurpose] = useState<Set<string>>(new Set(['理解原理优先于记忆', '自顶向下学习']))
  const [customPurpose, setCustomPurpose] = useState<string[]>([])

  const [methodPresets] = useState(['主用官方文档', '笔记工具辅助', '思维导图梳理', '代码实践验证', '视频教程补充', '参与社区讨论'])
  const [activeMethod, setActiveMethod] = useState<Set<string>>(new Set(['主用官方文档', '代码实践验证']))
  const [customMethod, setCustomMethod] = useState<string[]>([])

  const [constraintPresets] = useState(['需要举例说明', '需要类比辅助', '输出Markdown格式', '控制在500字以内', '给出课后练习', '标注信息来源', '附推荐阅读'])
  const [activeConstraint, setActiveConstraint] = useState<Set<string>>(new Set(['需要举例说明', '输出Markdown格式']))
  const [customConstraint, setCustomConstraint] = useState<string[]>([])

  const [persona, setPersona] = useState('')
  const [autoPersona, setAutoPersona] = useState(true)

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onMouseDown={closeOnBackdrop(onClose)}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl h-[85vh] flex flex-col mx-4" onMouseDown={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#e5e5e5] flex-shrink-0">
          <h2 className="text-base font-bold flex items-center gap-2"><Brain size={18} className="text-purple-500" /> 记忆系统</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
        </div>
        <div className="px-5 py-3 bg-[#ffffff] border-b border-[#e5e5e5] flex-shrink-0">
          <p className="text-xs text-gray-500 mb-2">系统根据行为自动更新记忆。勾选项即为已激活，取消勾选即关闭。</p>
          <button onClick={() => setAutoMemory(!autoMemory)}
            className={`relative w-full h-10 rounded-lg transition-colors flex items-center justify-center px-4 ${
              autoMemory ? 'bg-gray-50 border border-gray-300' : 'bg-gray-100 border border-gray-300'}`}>
            <span className="text-sm font-semibold mr-3">{autoMemory ? '自动管理：已开启' : '自动管理：已关闭'}</span>
            <span className={`relative w-10 h-5 rounded-full transition-colors ${autoMemory ? 'bg-gray-400' : 'bg-gray-300'}`}>
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${autoMemory ? 'left-5' : 'left-0.5'}`} />
            </span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          <div className="border border-blue-300 rounded-xl p-4 bg-blue-50/30">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-sm font-bold flex items-center gap-1.5 text-blue-700">👤 个人画像记忆</h3>
                <p className="text-[10px] text-gray-400 mt-0.5">基于所有项目记忆提炼的用户基础画像（≤500字）。</p>
              </div>
              <ToggleBtn on={autoPersona} setOn={setAutoPersona} />
            </div>
            <textarea value={persona} onChange={e => setPersona(e.target.value)}
              placeholder="例：该用户偏好理解原理而非记忆，视觉型学习者，动手实践能力强，关注AI Agent开发领域……"
              rows={5}
              className="w-full px-3 py-2 border border-blue-200 rounded-lg text-xs outline-none resize-none focus:border-blue-400 bg-white" />
          </div>
          <div className="border border-blue-200 rounded-xl p-4 bg-blue-50/20">
            <div className="flex items-center justify-between mb-3">
              <div><h3 className="text-sm font-bold text-blue-700">🧠 学习偏好</h3><p className="text-[10px] text-gray-400 mt-0.5">几乎不变的底层学习风格。</p></div>
            </div>
            <OptionList items={[...purposePresets, ...customPurpose]} active={activePurpose}
              onToggle={v => setActivePurpose(prev => { const n = new Set(prev); n.has(v) ? n.delete(v) : n.add(v); return n })}
              onRemove={v => { setCustomPurpose(prev => prev.filter(x => x !== v)); setActivePurpose(prev => { const n = new Set(prev); n.delete(v); return n }) }}
              onAdd={v => { setCustomPurpose(prev => [...prev, v]); setActivePurpose(prev => new Set([...prev, v])) }}
              placeholder="自定义" accentColor="#2563eb" />
          </div>
          <div className="border border-purple-200 rounded-xl p-4 bg-purple-50/20">
            <div className="flex items-center justify-between mb-3">
              <div><h3 className="text-sm font-bold text-purple-700">🔧 资源配置</h3><p className="text-[10px] text-gray-400 mt-0.5">较大困难时可更换。</p></div>
            </div>
            <OptionList items={[...methodPresets, ...customMethod]} active={activeMethod}
              onToggle={v => setActiveMethod(prev => { const n = new Set(prev); n.has(v) ? n.delete(v) : n.add(v); return n })}
              onRemove={v => { setCustomMethod(prev => prev.filter(x => x !== v)); setActiveMethod(prev => { const n = new Set(prev); n.delete(v); return n }) }}
              onAdd={v => { setCustomMethod(prev => [...prev, v]); setActiveMethod(prev => new Set([...prev, v])) }}
              placeholder="自定义" accentColor="#7c3aed" />
          </div>
          <div className="border border-green-200 rounded-xl p-4 bg-green-50/20">
            <div className="flex items-center justify-between mb-3">
              <div><h3 className="text-sm font-bold text-green-700">📝 本次要求</h3><p className="text-[10px] text-gray-400 mt-0.5">每次对话前可灵活调整。</p></div>
            </div>
            <OptionList items={[...constraintPresets, ...customConstraint]} active={activeConstraint}
              onToggle={v => setActiveConstraint(prev => { const n = new Set(prev); n.has(v) ? n.delete(v) : n.add(v); return n })}
              onRemove={v => { setCustomConstraint(prev => prev.filter(x => x !== v)); setActiveConstraint(prev => { const n = new Set(prev); n.delete(v); return n }) }}
              onAdd={v => { setCustomConstraint(prev => [...prev, v]); setActiveConstraint(prev => new Set([...prev, v])) }}
              placeholder="自定义" accentColor="#16a34a" />
          </div>
        </div>
      </div>
    </div>
  )
}

// ==================== 项目配置窗口 ====================
export function ProjectKnowledgeModal({ onClose, projectId }: Props & { projectId?: string }) {
  const [tab, setTab] = useState<'knowledge' | 'memory' | 'evaluate'>('knowledge')
  const [kbInput, setKbInput] = useState('')
  const [showGuide, setShowGuide] = useState(false)
  const [projectMemory, setProjectMemory] = useState('')
  useEffect(function(){
    if(!projectId)return
    var S=sessionStorage.getItem('coagent-s')||''
    fetch('/api/project-memory/'+projectId+'?session_id='+encodeURIComponent(S))
      .then(function(r){return r.json()})
      .then(function(d){
        if(d&&d.memory){
          var NL=String.fromCharCode(10)
          var txt=''
          if(d.memory.项目概述)txt+='项目概述: '+d.memory.项目概述+NL
          if(d.memory.当前进度)txt+='当前进度: '+d.memory.当前进度+NL
          if(d.memory.领域)txt+='领域: '+d.memory.领域+NL
          if(d.memory.水平)txt+='水平: '+d.memory.水平+NL
          if(d.memory.薄弱点&&d.memory.薄弱点.length)txt+='薄弱点: '+d.memory.薄弱点.join(', ')+NL
          if(d.memory.兴趣&&d.memory.兴趣.length)txt+='兴趣: '+d.memory.兴趣.join(', ')+NL
          if(d.memory.偏好&&d.memory.偏好.length)txt+='偏好: '+d.memory.偏好.join(', ')+NL
          if(txt)setEpisodicMemory(txt.trim())
          var txt2=''
          if(d.memory.知识点&&d.memory.知识点.length)txt2+='知识点: '+d.memory.知识点.join(', ')+NL
          if(d.memory.难点&&d.memory.难点.length)txt2+='难点: '+d.memory.难点.join(', ')+NL
          if(d.memory.对话摘要&&d.memory.对话摘要.length){
            txt2+='对话摘要:'+NL
            for(var i=0;i<d.memory.对话摘要.length;i++){
              txt2+='  '+(i+1)+'. '+(d.memory.对话摘要[i].摘要||'')+NL
            }
          }
          if(txt2)setProjectMemory(txt2.trim())
        }
      }).catch(function(){})
  },[projectId])
  const [episodicMemory, setEpisodicMemory] = useState('')
  const defaultResources = ['书籍', '百科', '论文', '官方文档', '教程', '视频', '代码仓库', '课件/PPT']
  const [selectedResources, setSelectedResources] = useState<Set<string>>(new Set(['书籍', '官方文档']))
  const [kbStatus, setKbStatus] = useState('')
  const [kbDocs, setKbDocs] = useState<Array<{source: string; chunks: number; preview: string; blocks: Array<{chunk: number; content: string}>}>>([])
  const [kbOpen, setKbOpen] = useState<string | null>(null)

  const refreshKb = function(){
    if(!projectId)return
    fetch('/api/knowledge/list?project_id='+encodeURIComponent(projectId))
      .then(function(r){return r.json()})
      .then(function(d){ if(d&&d.docs)setKbDocs(d.docs) })
      .catch(function(){})
    window.dispatchEvent(new Event('kb-updated'))
  }
  useEffect(function(){ refreshKb() }, [projectId])

  const [showResPick, setShowResPick] = useState(false)
  const [resList, setResList] = useState<Array<{id:string; name:string; content:string}>>([])

  const openResPick = function() {
    if(!projectId)return
    fetch('/api/resources?project_id=' + encodeURIComponent(projectId), { cache: 'no-store' })
      .then(function(r){return r.json()})
      .then(function(d){ setResList(d.resources || []); setShowResPick(true) })
  }

  const pickResource = function(r: any) {
    setKbInput(prev => prev ? prev + String.fromCharCode(10) + r.content : r.content)
    setShowResPick(false)
  }

  const [evalRunning, setEvalRunning] = useState(false)
  const [evalResult, setEvalResult] = useState<any>(null)
  const [evalErr, setEvalErr] = useState('')

  const runEval = function() {
    if(!projectId)return
    setEvalRunning(true); setEvalErr('')
    fetch('/api/evaluate?project_id='+encodeURIComponent(projectId)+'&api_key='+encodeURIComponent(localStorage.getItem('coagent-apikey')||''),{method:'POST'})
      .then(function(r){return r.json()})
      .then(function(d){ setEvalResult(d); setEvalRunning(false) })
      .catch(function(e){ setEvalErr('评估失败: '+e); setEvalRunning(false) })
  }

  const uploadKbFile = function(f: File) {
    if(!projectId){setKbStatus('请先选择项目');return}
    setKbStatus('上传中…')
    const fd = new FormData()
    fd.append('file', f)
    fd.append('project_id', projectId)
    fd.append('api_key', localStorage.getItem('coagent-apikey') || '')
    fetch('/api/knowledge/upload-file',{method:'POST',body:fd})
      .then(function(r){return r.json()})
      .then(function(d){
        if(d.status==='processing'){ setKbStatus('处理中…（内容较大时需十几秒）'); setTimeout(refreshKb, 5000); setTimeout(refreshKb, 12000) }
        else if(d.status==='ok'){ setKbStatus('已入库 '+d.chunks+' 块'); refreshKb() }
        else { setKbStatus('解析失败: '+(d.msg||'未知')) }
      })
      .catch(function(e){ setKbStatus('上传失败: '+e) })
  }

  const deleteKb = function(source: string) {
    if(!projectId)return
    if(!window.confirm('确定删除「'+source+'」？'))return
    fetch('/api/knowledge/delete?project_id='+encodeURIComponent(projectId)+'&source='+encodeURIComponent(source),{method:'DELETE'})
      .then(function(r){return r.json()})
      .then(function(d){ setKbStatus('已删除 '+d.deleted+' 块'); refreshKb() })
      .catch(function(e){ setKbStatus('删除失败: '+e) })
  }

  const saveKb = function(){
    if(!projectId||!kbInput.trim()){setKbStatus('请输入内容');return}
    setKbStatus('上传中…')
    fetch('/api/knowledge/upload',{method:'POST',headers:{'Content-Type':'application/json'},
      body: JSON.stringify({project_id:projectId, text:kbInput, source:'手动输入 '+new Date().toLocaleTimeString(), api_key: localStorage.getItem('coagent-apikey') || ''})})
      .then(function(r){return r.json()})
      .then(function(d){
        if(d.status==='processing'){ setKbStatus('处理中…（内容较大时需十几秒）'); setTimeout(refreshKb, 5000); setTimeout(refreshKb, 12000); setKbInput('') }
        else { setKbStatus('已入库 '+d.chunks+' 块'); refreshKb(); setKbInput('') }
      })
      .catch(function(e){ setKbStatus('上传失败: '+e) })
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onMouseDown={closeOnBackdrop(onClose)}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl h-[85vh] flex flex-col mx-4" onMouseDown={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#e5e5e5] flex-shrink-0">
          <h2 className="text-base font-bold flex items-center gap-2"><Database size={18} className="text-green-500" /> 项目配置</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
        </div>
        <div className="flex border-b border-[#e5e5e5] flex-shrink-0">
          {(['knowledge','memory','evaluate'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2 text-xs font-medium transition-colors ${
                tab === t ? 'text-[#1a1a1a] border-b-2 border-[#1a1a1a]' : 'text-gray-400 hover:text-gray-600'
              }`}>
              {{ knowledge: '知识库', memory: '项目记忆', evaluate: '评估' }[t]}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'knowledge' && (
            <div className="flex flex-col gap-5">
              {/* 系统资源选择 */}
              <div className="border border-[#e5e5e5] rounded-xl p-4">
                <h3 className="text-sm font-bold mb-2">选择系统资源</h3>
                <div className="flex flex-wrap gap-2 mb-3">
                  {defaultResources.map(r => (
                    <button key={r} onClick={() => setSelectedResources(prev => { const n = new Set(prev); n.has(r) ? n.delete(r) : n.add(r); return n })}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                        selectedResources.has(r) ? 'bg-[#f0f0f0] text-[#1a1a1a] border border-[#1a1a1a]/30' : 'bg-gray-50 text-gray-500 border border-gray-200'
                      }`}>{r}</button>
                  ))}
                </div>
              </div>
              {/* 上传资源 */}
              <div className="border border-[#e5e5e5] rounded-xl p-4">
                <h3 className="text-sm font-bold mb-2">上传资源</h3>
                <DragDropInput value={kbInput} onChange={(v) => setKbInput(v)} onFile={uploadKbFile} placeholder="拖拽文件到此处或点击上传" rows={1} />
              </div>
              {/* 知识库内容 */}
              <div className="border border-[#e5e5e5] rounded-xl p-4">
                <h3 className="text-sm font-bold mb-3">输入内容</h3>
                <DragDropInput value={kbInput} onChange={setKbInput} placeholder="输入知识库内容，或拖拽文件上传" rows={5} />
                <div className="flex items-center gap-3 mt-3">
                  <p className="text-[11px] text-gray-400 cursor-pointer hover:text-[#1a1a1a]" onClick={() => setShowGuide(!showGuide)}>💡 我需要引导</p>
                  <button onClick={openResPick} className="text-[11px] px-3 py-1.5 bg-white border border-gray-200 text-gray-600 rounded-lg hover:border-[#1a1a1a]/40 transition-colors">📁 从资源选择</button>
                  <button onClick={saveKb} className="text-[11px] px-3 py-1.5 bg-[#1a1a1a] text-white font-semibold rounded-lg hover:bg-[#333333] transition-colors">保存到知识库</button>
                </div>
                {showResPick && (
                  <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[70]" onMouseDown={e => { if (e.target === e.currentTarget) setShowResPick(false) }}>
                    <div className="bg-white rounded-2xl shadow-xl w-96 p-4" onMouseDown={e => e.stopPropagation()}>
                      <h3 className="text-sm font-bold mb-3">从资源中选择</h3>
                      {resList.length === 0 ? <p className="text-xs text-gray-400">暂无资源，请先在左侧"资源"区保存资料</p> : (
                        <div className="flex flex-col gap-1.5 max-h-60 overflow-y-auto">
                          {resList.map((r: any) => (
                            <button key={r.id} onClick={() => pickResource(r)} className="text-left px-3 py-2 border border-gray-200 rounded-lg text-xs hover:border-[#1a1a1a]/40">
                              <span className="font-medium">{r.name}</span>
                              <span className="text-gray-400 ml-2 truncate block">{String(r.content || '').slice(0, 40)}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      <button onClick={() => setShowResPick(false)} className="mt-3 text-xs px-3 py-1.5 text-gray-500">关闭</button>
                    </div>
                  </div>
                )}
                {kbStatus && <p className="mt-2 text-[11px] text-gray-500">{kbStatus}</p>}
                {/* 已入库文档 */}
                <div className="mt-3 border-t border-[#e5e5e5] pt-3">
                  <h4 className="text-xs font-bold mb-2">已入库内容（{kbDocs.length}）</h4>
                  {kbDocs.length === 0 ? (
                    <p className="text-[11px] text-gray-400">还没有入库内容</p>
                  ) : (
                    <div className="flex flex-col gap-2 max-h-40 overflow-y-auto">
                      {kbDocs.map((d,i) => (
                        <div key={i} className="border border-[#e5e5e5] rounded-lg p-2">
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2 cursor-pointer" onClick={() => setKbOpen(kbOpen === d.source ? null : d.source)}>
                              <span className="text-[11px] font-medium">{d.source}</span>
                              <span className="text-[10px] text-gray-400">{d.chunks} 块 {kbOpen === d.source ? '▲' : '▼'}</span>
                            </div>
                            <button onClick={() => deleteKb(d.source)} className="text-[10px] text-gray-400 hover:text-red-500 transition-colors" title="删除">删除</button>
                          </div>
                          <p className="text-[10px] text-gray-500 mt-1 truncate">{d.preview}</p>
                          {kbOpen === d.source && (
                            <div className="mt-2 pt-2 border-t border-[#e5e5e5] flex flex-col gap-2 max-h-64 overflow-y-auto">
                              {d.blocks && d.blocks.map((b,j) => (
                                <div key={j} className="bg-gray-50 rounded p-2">
                                  <p className="text-[10px] text-gray-400 mb-1">第 {b.chunk+1} 块</p>
                                  <p className="text-[10px] text-gray-700 whitespace-pre-wrap">{b.content}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          {tab === 'evaluate' && (
            <div className="flex flex-col gap-5">
              <div className="border border-[#e5e5e5] rounded-xl p-4">
                <h3 className="text-sm font-bold mb-2">三指标评估</h3>
                <p className="text-[11px] text-gray-500 mb-3">用预置的测试题、3组学习者画像和知识点清单，评估系统的幻觉率、资源难度适配准确率、知识点覆盖率（需真实 API key 才有结果）。</p>
                <button onClick={runEval} disabled={evalRunning}
                  className="text-xs px-4 py-2 bg-[#1a1a1a] text-white font-semibold rounded-lg hover:bg-[#333333] transition-colors disabled:opacity-50">
                  {evalRunning ? '评估中…（需几分钟）' : '一键运行评估'}
                </button>
                {evalResult && (
                  <div className="mt-4 flex flex-col gap-3">
                    <div className="border rounded-lg p-3">
                      <div className="flex justify-between text-xs"><span>幻觉率</span><span className={evalResult.hallucination.rate < 5 ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>{evalResult.hallucination.rate}% {evalResult.hallucination.rate < 5 ? '✓ 达标(<5%)' : '✗ 未达标'}</span></div>
                      <div className="text-[10px] text-gray-400 mt-1">断言 {evalResult.hallucination.total_claims} 条，幻觉 {evalResult.hallucination.hallucinated} 条</div>
                    </div>
                    <div className="border rounded-lg p-3">
                      <div className="flex justify-between text-xs"><span>画像-资源难度适配准确率</span><span className={evalResult.adaptation.rate >= 85 ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>{evalResult.adaptation.rate}% {evalResult.adaptation.rate >= 85 ? '✓ 达标(≥85%)' : '✗ 未达标'}</span></div>
                      <div className="text-[10px] text-gray-400 mt-1">测试 {evalResult.adaptation.total} 组，匹配 {evalResult.adaptation.matched} 组</div>
                    </div>
                    <div className="border rounded-lg p-3">
                      <div className="flex justify-between text-xs"><span>核心知识点覆盖率</span><span className={evalResult.coverage.rate >= 90 ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>{evalResult.coverage.rate}% {evalResult.coverage.rate >= 90 ? '✓ 达标(≥90%)' : '✗ 未达标'}</span></div>
                      <div className="text-[10px] text-gray-400 mt-1">共 {evalResult.coverage.total} 个知识点，覆盖 {evalResult.coverage.covered} 个</div>
                    </div>
                  </div>
                )}
                {evalErr && <p className="text-[11px] text-red-500 mt-2">{evalErr}</p>}
              </div>
            </div>
          )}
          {tab === 'memory' && (
            <div className="flex flex-col gap-5">
              <div className="border border-indigo-200 rounded-xl p-4 bg-indigo-50/20">
                <h3 className="text-sm font-bold flex items-center gap-1.5 text-indigo-700 mb-2"><Clock size={14} /> 情景记忆</h3>
                <p className="text-[10px] text-gray-400 mb-2">基于用户与AI对话内容的简要概述（≤1000字）。</p>
                <textarea value={episodicMemory} onChange={e => setEpisodicMemory(e.target.value)}
                  placeholder="例：用户询问了LangGraph的状态管理机制……"
                  rows={8}
                  className="w-full px-3 py-2 border border-indigo-200 rounded-lg text-xs outline-none resize-none focus:border-indigo-400 bg-white" />
              </div>
              <div className="border border-[#e5e5e5] rounded-xl p-4">
                <h3 className="text-sm font-bold mb-2">项目上下文记忆</h3>
                <textarea value={projectMemory} onChange={e => setProjectMemory(e.target.value)}
                  placeholder="例：本项目聚焦多智能体系统开发……"
                  rows={4}
                  className="w-full px-3 py-2 border border-[#d0d0d0] rounded-lg text-xs outline-none resize-none focus:border-[#1a1a1a] bg-[#fafafa]" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
