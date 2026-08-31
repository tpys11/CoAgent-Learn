/**
 * F10-S1 知识库处理选择事件桥（kbScopeBus）。
 *
 * 为什么存在：上传「切割完成→留存选择」事件原本锁死在 UploadPanel 组件闭包里——
 * 课程配置弹窗一关（组件卸载）完成事件全丢，留存面板永不再现，
 * 「先传文档→（关弹窗）→再走向导」全链断头（S0 交叉点 3 实测）。
 * bus = 模块级单例 store，双通道：
 * - ingestDone（事件）：上传/补传发起点在后台入库完成时广播（广播语义，不关心谁在听）；
 * - pending（状态）：App 推进器拉到章节树后写入的「待选择目标」，单一事实源——
 *   呈现面（UploadPanel 内联面板 / ProfileWizard 向导步）都从它读，消费即撤销。
 * 状态通道按 (projectId, source) 去重：同一资源二次完成不重复弹面板（覆盖刷新树）。
 * 跨项目不合并：同 source 不同 projectId 是两条（项目域隔离，跨项目防护精神）。
 */
import type { ScopeNode } from '../components/resource/RetentionScopePanel'

export type { ScopeNode }

export interface ScopeTarget {
  projectId: string
  source: string
  tree: ScopeNode[]
}

/** 合并待选择目标（纯函数）：按 (projectId, source) 去重，incoming 覆盖同键 tree（重传后内容新鲜度）。 */
export function dedupeTargets(existing: ScopeTarget[], incoming: ScopeTarget[]): ScopeTarget[] {
  const byKey = new Map<string, ScopeTarget>()
  for (const x of existing) byKey.set(x.projectId + '\n' + x.source, x)
  for (const x of incoming) byKey.set(x.projectId + '\n' + x.source, x) // 同键覆盖：树取最新
  return [...byKey.values()]
}

/** 呈现裁决（纯函数）：向导开着 → 'wizard'（向导步呈现，S2 渲染；S1 挂起）；
 *  没开 → 'inline'（UploadPanel 内联面板，F9 现状）。同一目标同一时刻只喂一个呈现面。 */
export function resolveScopeSurface(wizardOpen: boolean): 'wizard' | 'inline' {
  return wizardOpen ? 'wizard' : 'inline'
}

// ---------- 模块级单例状态（pending 通道） ----------

let pendingTargets: ScopeTarget[] = []
const pendingListeners = new Set<() => void>()

function notifyPending() {
  for (const l of [...pendingListeners]) l()
}

/** useSyncExternalStore 订阅形态：返回退订函数；快照引用稳定（无变化不换引用）。 */
export function subscribePending(listener: () => void): () => void {
  pendingListeners.add(listener)
  return () => { pendingListeners.delete(listener) }
}

export function getPendingScopeTargets(): ScopeTarget[] {
  return pendingTargets
}

/** 推进器写入待选择目标：去重入列（同键覆盖树）并通知；消费后同键可再入列（重传再选场景）。 */
export function addPendingScopeTargets(targets: ScopeTarget[]): void {
  if (!targets.length) return
  const next = dedupeTargets(pendingTargets, targets)
  // 免通知条件：键集与树引用完全未变（同一资源同树二次上报——幂等静默，不惊动呈现面）
  const unchanged = next.length === pendingTargets.length &&
    next.every((x, i) => x.source === pendingTargets[i].source &&
      x.projectId === pendingTargets[i].projectId && x.tree === pendingTargets[i].tree)
  if (unchanged) return
  pendingTargets = next
  notifyPending()
}

/** 消费（内联面板 apply 完成 / 向导步选择或跳过）：撤销目标并通知；不存在则无副作用。 */
export function consumeScopeTarget(projectId: string, source: string): void {
  const next = pendingTargets.filter(x => !(x.projectId === projectId && x.source === source))
  if (next.length === pendingTargets.length) return
  pendingTargets = next
  notifyPending()
}

// ---------- ingestDone 通道（完成事件广播） ----------

type IngestDoneListener = (projectId: string, sources: string[]) => void
const ingestListeners = new Set<IngestDoneListener>()

export function subscribeIngestDone(listener: IngestDoneListener): () => void {
  ingestListeners.add(listener)
  return () => { ingestListeners.delete(listener) }
}

/** 发起点（UploadPanel 完成态 / 向导补传完成）调用：广播「这些资源已入库完成」。
 *  与组件生命周期解耦——发起点卸载后调用依然送达（模块级函数）。 */
export function reportIngestDone(projectId: string, sources: string[]): void {
  if (!sources.length) return
  for (const l of [...ingestListeners]) l(projectId, [...sources])
}
