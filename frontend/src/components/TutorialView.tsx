/** 项目介绍：多智能体协同学习系统（原"使用引导"）
 * 内容 = AgentsView 三大区块：agent 管理 / skill 管理 / 对话流程 */
import AgentsView from './AgentsView'
import type { AgentConfig } from '../types'

interface Props {
  agents: AgentConfig[]
  onSave: (updated: AgentConfig) => void
  onReplace: (next: AgentConfig[]) => void
  projectId?: string | null
}

export default function TutorialView({ agents, onSave, onReplace, projectId }: Props) {
  return (
    <div className="flex-1 min-w-0 flex flex-col gap-4 p-6">
      <h1 className="text-2xl font-bold px-2">项目介绍</h1>
      <div className="flex-1 min-h-0">
        <AgentsView agents={agents} onSave={onSave} onReplace={onReplace} projectId={projectId ?? null} />
      </div>
    </div>
  )
}
