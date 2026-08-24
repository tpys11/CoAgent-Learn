/**
 * 条目4：子 agent 显示模块（对外唯一出口）。
 *
 * ── 接线契约 ── 聊天管线如何接入显示机制；日后改动对话逻辑只需维持这四条：
 *   ① SSE 收到 subagent 信封事件 → subagentStore.applySse(data)     （useChatStream 已接）
 *   ② 发起新消息时               → subagentStore.reset()            （useChatStream 已接）
 *   ③ 流式区挂 <SubAgentLiveStrip />  ——子agent启动即出脉冲chip     （AssistantMessage streaming 区）
 *   ④ 思维链条目带 run_ids       → 自动渲染 🛰 按钮（ReasoningBlock 内置，无需接线）
 *
 * 后端对应物：agents/graph.py 的 _sub_run / _sub_finish / _sub_emit_local 三闭包；
 * delta 仅直播不入库（终值 output 全文入库），档案回看走 GET /api/chat/subagent/{run_id}。
 */
export { SubAgentWindow } from './SubAgentWindow'
export { SubAgentLiveStrip } from './LiveStrip'
