import { useState, useEffect } from 'react'
import { Database, Check } from 'lucide-react'
import { api } from '../../api'

function Section({ icon: Icon, title, desc, children }: { icon: any; title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-xs font-semibold text-dim uppercase tracking-wider flex items-center gap-1.5"><Icon size={13} /> {title}</p>
        {desc && <p className="text-[10px] text-dim mt-1">{desc}</p>}
      </div>
      {children}
    </div>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)}
      className={`w-9 h-5 rounded-full flex items-center px-0.5 transition-colors flex-shrink-0 ${
        checked ? 'bg-[#1a1a1a] justify-end' : 'bg-[var(--bg-active)] justify-start'
      }`}>
      <span className="w-4 h-4 rounded-full bg-white shadow" />
    </button>
  )
}

const inputCls = 'w-full px-3 py-2 input-surface rounded-lg text-xs outline-none focus:border-[var(--accent)]'

/** AI 服务配置：硅基流动 Key / 知识库服务 / 图片描述 / 独立审核模型（后端存 SQLite settings 表） */
export default function ServiceSettings() {
  const [svc, setSvc] = useState({
    kb_mode: 'full',
    embedding_key_set: false, embedding_key_hint: '',
    review_enabled: false,
    review_model: 'Qwen/Qwen2.5-72B-Instruct',
  })
  // key 输入框（不回显已存 key，只显示"已配置"状态）
  const [svcKeys, setSvcKeys] = useState({ embedding_api_key: '' })
  const [svcSaved, setSvcSaved] = useState(false)
  const [keyEditing, setKeyEditing] = useState(false)
  const [feedback, setFeedback] = useState('')

  useEffect(() => {
    api.getSettings().then(d => {
      setSvc({
        kb_mode: d.kb_mode === 'light' ? 'light' : 'full',
        embedding_key_set: !!d.embedding?.api_key_set,
        embedding_key_hint: d.embedding?.api_key_hint || '',
        review_enabled: !!d.review?.enabled,
        review_model: d.review?.model || 'Qwen/Qwen2.5-72B-Instruct',
      })
    }).catch(() => {})
  }, [])

  const flash = (msg: string) => { setFeedback(msg); setTimeout(() => setFeedback(''), 2000) }

  // 构造后端 SettingsSave 提交体（显式下划线字段，避免 spread 驼峰/多余字段不匹配）
  const buildSvcBody = () => ({
    vector_model: 'bge',
    embedding_backend: 'api',
    embedding_base_url: 'https://api.siliconflow.cn/v1',
    embedding_api_key: svcKeys.embedding_api_key,
    embedding_model: 'BAAI/bge-m3',
    embedding_local_model: 'BAAI/bge-small-zh-v1.5',
    embedding_dim: 1024,
    rerank_backend: 'api',
    rerank_base_url: '',
    rerank_api_key: '',
    rerank_model: 'BAAI/bge-reranker-v2-m3',
    rerank_local_model: 'BAAI/bge-reranker-base',
    image_backend: 'api',
    image_base_url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    image_api_key: '',
    image_model: 'glm-4v-flash',
    vl_api_key: '',
    zhipu_api_key: '',
    image_desc_model: 'Qwen/Qwen3.5-4B',
    kb_mode: svc.kb_mode,
    review_enabled: svc.review_enabled,
    review_model: svc.review_model,
  })

  const saveService = async () => {
    try {
      await api.saveSettings(buildSvcBody())
      const g = await api.getSettings()
      setSvc(s => ({ ...s,
        embedding_key_set: !!g.embedding?.api_key_set,
        embedding_key_hint: g.embedding?.api_key_hint || '',
        review_enabled: !!g.review?.enabled }))
      setSvcSaved(true)
      setKeyEditing(false)
    } catch {
      setSvcSaved(false)
      flash('保存失败（后端不可达）')
    }
  }

  return (
    <Section icon={Database} title="AI 服务配置" desc="各能力独立配置，保存后即时生效，无需重启">
      <div className="flex flex-col gap-4">
        {/* 硅基流动 API Key */}
        <div className="border hairline rounded-xl p-4 bg-[var(--bg-panel)] flex flex-col gap-2.5">
          <p className="text-sm font-semibold">硅基流动 API Key</p>
          <div className="flex items-center gap-2">
            {svc.embedding_key_set && !keyEditing ? (
              <>
                <span className="flex-1 text-xs font-medium text-green-700">✓ 已配置：{svc.embedding_key_hint}</span>
                <button onClick={() => { setKeyEditing(true); setSvcKeys({ embedding_api_key: '' }); setSvcSaved(false) }}
                  className="text-[10px] text-dim hover:text-[var(--text)] flex-shrink-0">修改</button>
              </>
            ) : (
              <input type="password" name="siliconflow-api-key" autoComplete="new-password" value={svcKeys.embedding_api_key} placeholder="sk-...（硅基流动）"
                onChange={e => { setSvcKeys({ embedding_api_key: e.target.value }); setSvcSaved(false) }} className={inputCls} />
            )}
            {(!svc.embedding_key_set || keyEditing) && (
              <button onClick={saveService}
                className={`px-4 py-1.5 text-[11px] rounded-lg font-semibold flex-shrink-0 ${svcSaved ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-[#1a1a1a] text-white'}`}>保存</button>
            )}
          </div>
          <p className="text-[10px] text-dim">该 key 可实现多种模型调用</p>
        </div>

        {/* 知识库服务 */}
        <div className="border hairline rounded-xl p-4 bg-[var(--bg-panel)] flex flex-col gap-2.5">
          <p className="text-sm font-semibold">知识库服务</p>
          <div className="flex flex-col gap-2">
            {[
              { mode: 'light', name: 'bge-reranker-v2-m3', desc: '知识库上传时实现文字向量化、重排，模型轻、高效' },
              { mode: 'full', name: 'Qwen3-VL-Embedding-8B', desc: '知识库上传时实现文字向量化、重排、图片向量化、跨模态检索，模型中、全面' },
            ].map(o => (
              <button key={o.mode} onClick={() => { setSvc(s => ({ ...s, kb_mode: o.mode })); setSvcSaved(false) }}
                className={`flex flex-col gap-0.5 text-left px-3 py-2.5 rounded-xl transition-colors ${svc.kb_mode === o.mode ? 'bg-[#1a1a1a] text-white shadow-soft' : 'bg-[var(--bg-hover)] hover:bg-[var(--bg-panel)]'}`}>
                <span className="text-[12px] font-semibold flex items-center gap-1.5">
                  <span className={`w-3 h-3 rounded-full border flex items-center justify-center flex-shrink-0 ${svc.kb_mode === o.mode ? 'border-white' : 'border-[var(--text)]/40'}`}>
                    {svc.kb_mode === o.mode && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </span>
                  {o.name}
                </span>
                <span className={`text-[10px] pl-[18px] ${svc.kb_mode === o.mode ? 'text-white/70' : 'text-dim'}`}>{o.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 图片描述 */}
        <div className="border hairline rounded-xl p-4 bg-[var(--bg-panel)] flex flex-col gap-2">
          <p className="text-sm font-semibold">图片描述</p>
          <div className="flex flex-col gap-0.5 px-3 py-2.5 rounded-xl bg-[var(--bg-hover)]">
            <span className="text-[12px] font-semibold">Qwen3.5-4B</span>
            <span className="text-[10px] text-dim">主模型缺乏多模态能力时自动调用</span>
          </div>
        </div>

        {/* 独立审核模型 */}
        <div className="border hairline rounded-xl p-4 bg-[var(--bg-panel)] flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">独立审核模型</p>
            <Toggle checked={svc.review_enabled} onChange={v => { setSvc(s => ({ ...s, review_enabled: v })); setSvcSaved(false) }} />
          </div>
          <div className="flex flex-col gap-0.5 px-3 py-2.5 rounded-xl bg-[var(--bg-hover)]">
            <span className="text-[12px] font-semibold">Qwen/Qwen2.5-72B-Instruct</span>
            <span className="text-[10px] text-dim">全学科知识点校验、概念辨析、主观论述正误判断</span>
          </div>
          <p className="text-[10px] text-dim">不开启时审核默认调用 deepseek v4 flash</p>
        </div>

        {feedback && <span className="text-[11px] text-green-600 flex items-center gap-1"><Check size={11} /> {feedback}</span>}
      </div>
    </Section>
  )
}
