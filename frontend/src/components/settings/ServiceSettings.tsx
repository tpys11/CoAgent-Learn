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

/** AI 服务配置：硅基流动 Key / 知识库服务 / 文档解析引擎 / 独立审核模型（后端存 SQLite settings 表）
 *  图片理解由视觉主模型直接处理，无独立描述服务（2026-08-22 移除）。 */
export default function ServiceSettings() {
  const [svc, setSvc] = useState({
    embedding_key_set: false, embedding_key_hint: '',
    review_enabled: false,
    review_model: 'Qwen/Qwen2.5-72B-Instruct',
    parse_engine: 'pymupdf4llm',
    mineru_key_set: false,
    mathpix_key_set: false,
    chunk_mode: 'auto',
    chunk_size: 512,
    chunk_overlap: 50,
    rrf_k: 60,
    fetch_mult: 3,
  })
  // key 输入框（不回显已存 key，只显示"已配置"状态）
  const [svcKeys, setSvcKeys] = useState({
    embedding_api_key: '',
    mineru_api_token: '', mathpix_app_id: '', mathpix_app_key: '',
  })
  const [svcSaved, setSvcSaved] = useState(false)
  const [keyEditing, setKeyEditing] = useState(false)
  const [feedback, setFeedback] = useState('')

  useEffect(() => {
    api.getSettings().then(d => {
      setSvc(s => ({
        ...s,
        embedding_key_set: !!d.embedding?.api_key_set,
        embedding_key_hint: d.embedding?.api_key_hint || '',
        review_enabled: !!d.review?.enabled,
        review_model: d.review?.model || 'Qwen/Qwen2.5-72B-Instruct',
        chunk_mode: d.chunking?.mode || 'auto',
        parse_engine: d.parse?.engine || 'pymupdf4llm',
        mineru_key_set: !!d.parse?.mineru_key_set,
        mathpix_key_set: !!d.parse?.mathpix_key_set,
        chunk_size: d.chunking?.chunk_size ?? 512,
        chunk_overlap: d.chunking?.chunk_overlap ?? 50,
        rrf_k: d.chunking?.rrf_k ?? 60,
        fetch_mult: d.chunking?.fetch_mult ?? 3,
      }))
    }).catch(() => {})
  }, [])

  const flash = (msg: string) => { setFeedback(msg); setTimeout(() => setFeedback(''), 2000) }

  // 构造后端 SettingsSave 提交体（统一向量化模型固定 Qwen3-VL-Embedding-8B@1024）
  const buildSvcBody = () => ({
    vector_model: 'qwen',
    embedding_backend: 'api',
    embedding_base_url: 'https://api.siliconflow.cn/v1',
    embedding_api_key: svcKeys.embedding_api_key,
    embedding_model: 'Qwen/Qwen3-VL-Embedding-8B',
    embedding_dim: 1024,
    rerank_backend: 'api',
    rerank_base_url: '',
    rerank_api_key: '',
    rerank_model: 'BAAI/bge-reranker-v2-m3',
    vl_api_key: '',
    zhipu_api_key: '',
    kb_mode: 'full',
    review_enabled: svc.review_enabled,
    review_model: svc.review_model,
    parse_engine: svc.parse_engine,
    chunk_mode: svc.chunk_mode,
    mineru_api_token: svcKeys.mineru_api_token,
    mathpix_app_id: svcKeys.mathpix_app_id,
    mathpix_app_key: svcKeys.mathpix_app_key,
    chunk_size: svc.chunk_size,
    chunk_overlap: svc.chunk_overlap,
    rrf_k: svc.rrf_k,
    fetch_mult: svc.fetch_mult,
  })

  const saveService = async () => {
    try {
      await api.saveSettings(buildSvcBody())
      const g = await api.getSettings()
      setSvc(s => ({ ...s,
        embedding_key_set: !!g.embedding?.api_key_set,
        embedding_key_hint: g.embedding?.api_key_hint || '',
        review_enabled: !!g.review?.enabled,
        chunk_mode: g.chunking?.mode || s.chunk_mode,
        parse_engine: g.parse?.engine || s.parse_engine,
        mineru_key_set: !!g.parse?.mineru_key_set,
        mathpix_key_set: !!g.parse?.mathpix_key_set,
        chunk_size: g.chunking?.chunk_size ?? s.chunk_size,
        chunk_overlap: g.chunking?.chunk_overlap ?? s.chunk_overlap,
        rrf_k: g.chunking?.rrf_k ?? s.rrf_k,
        fetch_mult: g.chunking?.fetch_mult ?? s.fetch_mult }))
      setSvcSaved(true)
      setKeyEditing(false)
      setSvcKeys(k => ({ ...k, mineru_api_token: '', mathpix_app_id: '', mathpix_app_key: '' }))
      flash('解析设置已保存')
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
                <button onClick={() => { setKeyEditing(true); setSvcKeys(k => ({ ...k, embedding_api_key: '' })); setSvcSaved(false) }}
                  className="text-[10px] text-dim hover:text-[var(--text)] flex-shrink-0">修改</button>
              </>
            ) : (
              <input type="password" name="siliconflow-api-key" autoComplete="new-password" value={svcKeys.embedding_api_key} placeholder="sk-...（硅基流动）"
                onChange={e => { setSvcKeys(k => ({ ...k, embedding_api_key: e.target.value })); setSvcSaved(false) }} className={inputCls} />
            )}
            {(!svc.embedding_key_set || keyEditing) && (
              <button onClick={saveService}
                className={`px-4 py-1.5 text-[11px] rounded-lg font-semibold flex-shrink-0 ${svcSaved ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-[#1a1a1a] text-white'}`}>保存</button>
            )}
          </div>
          <p className="text-[10px] text-dim">该 key 可实现多种模型调用</p>
        </div>

        {/* 知识库服务：统一向量化模型只读展示（不可选） */}
        <div className="border hairline rounded-xl p-4 bg-[var(--bg-panel)] flex flex-col gap-2">
          <p className="text-sm font-semibold">知识库服务</p>
          <div className="flex flex-col gap-0.5 px-3 py-2.5 rounded-xl bg-[var(--bg-hover)]">
            <span className="text-[12px] font-semibold">Qwen/Qwen3-VL-Embedding-8B</span>
            <span className="text-[10px] text-dim">统一向量化模型 · 1024 维 · 文字与图片同一向量空间（上传自动切块向量化 + 重排 + 跨模态检索）</span>
          </div>
        </div>

        {/* 文档解析引擎（ParsePort） */}
        <div className="border hairline rounded-xl p-4 bg-[var(--bg-panel)] flex flex-col gap-2.5">
          <p className="text-sm font-semibold">文档解析引擎</p>
          <p className="text-[10px] text-dim">教材 PDF 的版面/表格/公式解析质量由它决定；失败自动降级到本地快道</p>
          {([
            { id: 'pymupdf4llm', name: 'PyMuPDF4LLM', tag: '本地快道', desc: '原生文字层 PDF 秒出，零依赖离线可用' },
            { id: 'mineru', name: 'MinerU', tag: '高保真云解析', desc: '版面/表格/公式 SOTA，每日免费额度（mineru.net 申请 Token）' },
            { id: 'mathpix', name: 'Mathpix', tag: '公式专家', desc: '英文原版书与手写公式金标准（按页计费，mathpix.com 开通）' },
          ] as const).map(opt => (
            svc.parse_engine === opt.id ? (
              <div key={opt.id} className="flex flex-col gap-2 px-3 py-2.5 rounded-xl bg-[var(--bg-hover)] border border-[var(--accent)]">
                <button className="flex items-center justify-between text-left" onClick={() => setSvc(s => ({ ...s, parse_engine: opt.id }))}>
                  <span className="text-[12px] font-semibold">{opt.name}</span>
                  <span className="text-[10px] text-dim">{opt.tag}</span>
                </button>
                <span className="text-[10px] text-dim">{opt.desc}</span>
                {opt.id === 'mineru' && (
                  <div className="flex items-center gap-2 pt-1">
                    {svc.mineru_key_set ? (
                      <span className="flex-1 text-xs font-medium text-green-700">✓ Token 已配置</span>
                    ) : (
                      <input type="password" autoComplete="new-password" value={svcKeys.mineru_api_token} placeholder="粘贴 MinerU API Token"
                        onChange={e => { setSvcKeys(k => ({ ...k, mineru_api_token: e.target.value })); setSvcSaved(false) }} className={inputCls} />
                    )}
                  </div>
                )}
                {opt.id === 'mathpix' && (
                  <div className="flex flex-col gap-2 pt-1">
                    {svc.mathpix_key_set ? (
                      <span className="text-xs font-medium text-green-700">✓ App 凭据已配置</span>
                    ) : (
                      <>
                        <input type="text" autoComplete="off" value={svcKeys.mathpix_app_id} placeholder="App ID"
                          onChange={e => { setSvcKeys(k => ({ ...k, mathpix_app_id: e.target.value })); setSvcSaved(false) }} className={inputCls} />
                        <input type="password" autoComplete="new-password" value={svcKeys.mathpix_app_key} placeholder="App Key"
                          onChange={e => { setSvcKeys(k => ({ ...k, mathpix_app_key: e.target.value })); setSvcSaved(false) }} className={inputCls} />
                      </>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <button key={opt.id}
                className="flex items-center justify-between px-3 py-2 rounded-xl border hairline bg-[var(--bg-panel)] hover:bg-[var(--bg-hover)] text-left"
                onClick={() => { setSvc(s => ({ ...s, parse_engine: opt.id })); setSvcSaved(false) }}>
                <span className="text-[12px] font-medium">{opt.name}</span>
                <span className="text-[10px] text-dim">{opt.tag}</span>
              </button>
            )
          ))}
          <button onClick={saveService}
            className={`self-start px-4 py-1.5 text-[11px] rounded-lg font-semibold ${svcSaved ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-[#1a1a1a] text-white'}`}>保存解析设置</button>
        </div>

        {/* 切块与检索参数 */}
        <div className="border hairline rounded-xl p-4 bg-[var(--bg-panel)] flex flex-col gap-2.5">
          <p className="text-sm font-semibold">切块与检索参数</p>
          <p className="text-[10px] text-dim">改动仅影响之后入库的内容；已有文档需删除重传才会按新参数重切</p>
          <label className="flex flex-col gap-1 px-3 py-2 rounded-xl bg-[var(--bg-hover)]">
            <span className="text-[10px] text-dim">切块模式</span>
            <select value={svc.chunk_mode}
              onChange={e => { setSvc(s => ({ ...s, chunk_mode: e.target.value })); setSvcSaved(false) }}
              className="w-full bg-transparent text-xs outline-none">
              <option value="auto">自动（有标题走结构，无标题走窗口）</option>
              <option value="markdown">按标题结构（每节一块，自带标题路径）</option>
              <option value="window">固定窗口（句子累积+重叠）</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2.5">
            {([
              { key: 'chunk_size', label: '切块大小（字符）', min: 100, max: 4000 },
              { key: 'chunk_overlap', label: '相邻块重叠', min: 0, max: 500 },
              { key: 'rrf_k', label: 'RRF 融合常数 K', min: 1, max: 200 },
              { key: 'fetch_mult', label: '召回倍数 ×top_k', min: 1, max: 10 },
            ] as const).map(f => (
              <label key={f.key} className="flex flex-col gap-1 px-3 py-2 rounded-xl bg-[var(--bg-hover)]">
                <span className="text-[10px] text-dim">{f.label}</span>
                <input type="number" min={f.min} max={f.max} value={svc[f.key]}
                  onChange={e => {
                    const v = Math.max(f.min, Math.min(f.max, parseInt(e.target.value || String(f.min), 10) || f.min))
                    setSvc(s => ({ ...s, [f.key]: v })); setSvcSaved(false)
                  }}
                  className="w-full bg-transparent text-xs outline-none" />
              </label>
            ))}
          </div>
          <button onClick={saveService}
            className={`self-start px-4 py-1.5 text-[11px] rounded-lg font-semibold ${svcSaved ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-[#1a1a1a] text-white'}`}>保存参数</button>
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
