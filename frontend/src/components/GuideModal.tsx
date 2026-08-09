import { X, Bot, Rocket, Wrench, Trash2, Lightbulb, BookOpen, Brain, Waypoints, MessagesSquare, Paperclip, Plug, BarChart3 } from 'lucide-react'

export default function GuideModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60]" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-lift w-full max-w-lg mx-4 p-6 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg flex items-center gap-2"><BookOpen size={17} /> 使用指南</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400"><X size={16} /></button>
        </div>
        <div className="flex flex-col gap-5 text-xs leading-relaxed text-gray-700">
          <section>
            <h3 className="font-semibold text-sm mb-1.5 flex items-center gap-1.5"><Bot size={14} className="text-gray-500" /> 这是什么</h3>
            <p>多智能体协同的个性化学习系统：学情画像 → 多智能体调度（诊断/生成/审核）→ 个性化资源生成。</p>
          </section>
          <section>
            <h3 className="font-semibold text-sm mb-1.5 flex items-center gap-1.5"><Rocket size={14} className="text-gray-500" /> 快速上手</h3>
            <ol className="list-decimal pl-4 flex flex-col gap-1">
              <li>使用"默认课程"可直接聊天（自由区）</li>
              <li>新建"专项课程" → 填课程画像 → 学得更准</li>
              <li>课程下新建对话 → 填对话画像 → 开始学习</li>
            </ol>
          </section>
          <section>
            <h3 className="font-semibold text-sm mb-1.5 flex items-center gap-1.5"><Wrench size={14} className="text-gray-500" /> 功能说明</h3>
            <ul className="flex flex-col gap-1.5">
              <li className="flex gap-2"><BookOpen size={12} className="text-gray-400 mt-0.5 flex-shrink-0" /><span><b>知识库</b>：课程配置里上传 txt/md/PDF/Word/PPT，AI 回答基于知识库；切换"知识库模式"控制</span></li>
              <li className="flex gap-2"><Brain size={12} className="text-gray-400 mt-0.5 flex-shrink-0" /><span><b>记忆</b>：个人/课程/对话三级画像，刷新后保留</span></li>
              <li className="flex gap-2"><Waypoints size={12} className="text-gray-400 mt-0.5 flex-shrink-0" /><span><b>知识图谱</b>：右侧图谱展示文档实体关系，点击节点看详情</span></li>
              <li className="flex gap-2"><MessagesSquare size={12} className="text-gray-400 mt-0.5 flex-shrink-0" /><span><b>第二对话窗口</b>：右侧独立对话，查不懂的名词，不影响主对话</span></li>
              <li className="flex gap-2"><Paperclip size={12} className="text-gray-400 mt-0.5 flex-shrink-0" /><span><b>上传文件</b>：对话输入框左侧上传按钮，支持文本/PDF/Word/PPT</span></li>
              <li className="flex gap-2"><Plug size={12} className="text-gray-400 mt-0.5 flex-shrink-0" /><span><b>Skill</b>：设置里可上传/管理技能（可扩展能力）</span></li>
              <li className="flex gap-2"><BarChart3 size={12} className="text-gray-400 mt-0.5 flex-shrink-0" /><span><b>评估</b>：课程配置 → 评估 tab，一键测幻觉率/适配/覆盖率</span></li>
            </ul>
          </section>
          <section>
            <h3 className="font-semibold text-sm mb-1.5 flex items-center gap-1.5"><Trash2 size={14} className="text-gray-500" /> 删除</h3>
            <p>课程/对话条目有删除按钮，会连带清理相关数据（含知识库/图谱）。</p>
          </section>
          <section>
            <h3 className="font-semibold text-sm mb-1.5 flex items-center gap-1.5"><Lightbulb size={14} className="text-gray-500" /> 常见问题</h3>
            <ul className="list-disc pl-4 flex flex-col gap-1">
              <li><b>刷新后数据还在吗？</b>在——课程/对话/画像/知识库全部持久化</li>
              <li><b>回答不基于知识库？</b>检查知识库模式开关，或该内容未上传到知识库</li>
              <li><b>需要 API key？</b>首次使用在设置里填写你的 DeepSeek key</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}
