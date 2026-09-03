/**
 * 学情匹配度报告（评估体系 §五 v1）：四要素可视化。
 * 数据全部来自 GET /api/report/match 服务端拼装——本组件只做呈现，零业务规则。
 * 图表用全量 echarts 引入（与 KbReaderModal 同源，vendor 分包已按需加载）。
 */
import { useEffect, useRef, useState } from 'react'
import * as echarts from 'echarts'
import { ChevronDown, ChevronRight, TrendingUp } from 'lucide-react'
import { api } from '../../api'
import type { MatchReportData } from '../../types'

const STATUS_COLOR: Record<string, string> = {
  blind: '#ef4444',
  learning: '#f59e0b',
  mastered: '#10b981',
  untouched: 'var(--dim)',
}
const STATUS_LABEL: Record<string, string> = {
  blind: '盲区', learning: '学习中', mastered: '已掌握', untouched: '未涉及',
}

function TreeList({ nodes, depth = 0 }: {
  nodes: MatchReportData['path_tree']; depth?: number
}): React.ReactElement {
  return (
    <ul className="m-0 list-none p-0" style={{ paddingLeft: depth ? 14 : 0 }}>
      {nodes.map(n => (
        <li key={n.name + depth} className="flex items-center gap-1.5 py-[2px] text-[12px]">
          <span className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
                style={{ background: STATUS_COLOR[n.status] || 'var(--dim)' }} />
          <span style={{ color: n.status === 'untouched' ? 'var(--dim)' : 'var(--text)' }}>{n.name}</span>
          {n.prereq && n.prereq.length > 0 && (
            <span className="rounded px-1 text-[10px]"
                  style={{ border: '1px dashed var(--dim)', color: 'var(--dim)' }}>
              先修: {n.prereq.map(p => `《${p}》`).join('')}
            </span>
          )}
          <span className="text-[10px]" style={{ color: 'var(--dim)' }}>{STATUS_LABEL[n.status]}</span>
          {n.children.length > 0 && <TreeList nodes={n.children} depth={depth + 1} />}
        </li>
      ))}
    </ul>
  )
}

export default function MatchReport({ projectId }: { projectId: string }): React.ReactElement {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<MatchReportData | null>(null)
  const [loading, setLoading] = useState(false)
  const trendRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || !projectId) return
    let alive = true
    setLoading(true)
    api.getMatchReport(projectId)
      .then(d => { if (alive) setData(d) })
      .catch(() => { if (alive) setData(null) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [open, projectId])

  // 图表渲染：数据到位且面板展开时初始化；卸载/数据更新前 dispose 防泄漏
  useEffect(() => {
    if (!open || !data) return
    const charts: echarts.ECharts[] = []
    if (trendRef.current && data.trend.length >= 2) {
      const c = echarts.init(trendRef.current)
      c.setOption({
        grid: { left: 40, right: 12, top: 18, bottom: 24 },
        xAxis: { type: 'category', data: data.trend.map(p => p.t?.slice(5, 16) ?? ''),
                 axisLabel: { fontSize: 10 } },
        yAxis: { type: 'value', min: 0, max: 1, axisLabel: { fontSize: 10 } },
        series: [{ type: 'line', data: data.trend.map(p => p.score), smooth: true,
                   areaStyle: { opacity: 0.15 }, lineStyle: { width: 2 }, symbolSize: 5 }],
        tooltip: { trigger: 'axis' },
      })
      charts.push(c)
    }
    if (barRef.current && data.kp_accuracy.length > 0) {
      const th = data.thresholds
      const c = echarts.init(barRef.current)
      c.setOption({
        grid: { left: 90, right: 20, top: 18, bottom: 24 },
        xAxis: { type: 'value', max: 1, axisLabel: { fontSize: 10 } },
        yAxis: { type: 'category', data: data.kp_accuracy.map(k => k.kp),
                 axisLabel: { fontSize: 11, width: 80, overflow: 'truncate' } },
        series: [{
          type: 'bar', data: data.kp_accuracy.map(k => k.accuracy),
          itemStyle: {
            color: (p: { dataIndex: number }) => {
              const a = data.kp_accuracy[p.dataIndex]?.accuracy ?? 0
              return a >= th.master ? '#10b981' : a >= th.blind ? '#f59e0b' : '#ef4444'
            },
          },
          label: { show: true, position: 'right', formatter: '{c}', fontSize: 10 },
          markLine: {
            symbol: 'none', silent: true,
            lineStyle: { type: 'dashed', color: '#ef4444' },
            data: [{ xAxis: th.blind, label: { formatter: '盲区线', fontSize: 9 } }],
          },
        }],
        tooltip: { trigger: 'axis' },
      })
      charts.push(c)
    }
    return () => { charts.forEach(c => c.dispose()) }
  }, [open, data])

  const pct = (v: number | null | undefined): string =>
    (typeof v === 'number' ? Math.round(v * 100) : 0) + '%'

  return (
    <div className="flex flex-col gap-2 max-w-3xl">
      <button onClick={() => setOpen(o => !o)}
              className="flex w-fit items-center gap-1 border-none bg-transparent p-0 text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: 'var(--dim)' }}
              aria-expanded={open}>
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        学情匹配度报告 <TrendingUp size={12} />
      </button>

      {open && (
        loading ? <div className="py-3 text-[12px]" style={{ color: 'var(--dim)' }}>报告生成中…</div>
        : !data ? <div className="py-3 text-[12px]" style={{ color: 'var(--dim)' }}>
            暂无学情数据：先进行几轮对话或完成一次测验</div>
        : (
          <div className="flex flex-col gap-3">
            {/* 综合徽章行 */}
            <div className="flex flex-wrap items-center gap-4 rounded-xl border p-3"
                 style={{ borderColor: 'var(--border-color)', background: 'var(--bg-panel)' }}>
              <div className="flex items-baseline gap-1.5">
                <span className="text-[26px] font-bold leading-none" style={{ color: 'var(--accent)' }}>
                  {pct(data.overall.score)}
                </span>
                <span className="text-[11px]" style={{ color: 'var(--dim)' }}>综合匹配度 · {data.overall.label}</span>
              </div>
              <div className="text-[11px]" style={{ color: 'var(--dim)' }}>
                当前学情分 {pct(data.level_now.score)}
                {data.level_now.evidence ? ` · ${data.level_now.evidence}` : ''}
              </div>
            </div>

            {/* 双图 */}
            {data.trend.length >= 2 && (
              <div className="rounded-xl border p-2" style={{ borderColor: 'var(--border-color)' }}>
                <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--dim)' }}>学情水平曲线</p>
                <div ref={trendRef} style={{ height: 200 }} />
              </div>
            )}
            {data.kp_accuracy.length > 0 && (
              <div className="rounded-xl border p-2" style={{ borderColor: 'var(--border-color)' }}>
                <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--dim)' }}>知识点正确率（红色虚线 = 盲区线）</p>
                <div ref={barRef} style={{ height: Math.max(140, data.kp_accuracy.length * 34) }} />
              </div>
            )}

            {/* 盲区 / 强项 */}
            {(data.weak_points.length > 0 || data.strong_points.length > 0) && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border p-3" style={{ borderColor: 'var(--border-color)' }}>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#ef4444' }}>知识盲区定位</p>
                  <div className="flex flex-wrap gap-1.5">
                    {data.weak_points.length === 0
                      ? <span className="text-[12px]" style={{ color: 'var(--dim)' }}>暂无</span>
                      : data.weak_points.map(w => (
                        <span key={w} className="rounded-full px-2 py-0.5 text-[11px]"
                              style={{ background: 'rgba(239,68,68,.1)', color: '#ef4444' }}>{w}</span>))}
                  </div>
                </div>
                <div className="rounded-xl border p-3" style={{ borderColor: 'var(--border-color)' }}>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#10b981' }}>已掌握强项</p>
                  <div className="flex flex-wrap gap-1.5">
                    {data.strong_points.length === 0
                      ? <span className="text-[12px]" style={{ color: 'var(--dim)' }}>暂无</span>
                      : data.strong_points.map(s => (
                        <span key={s} className="rounded-full px-2 py-0.5 text-[11px]"
                              style={{ background: 'rgba(16,185,129,.1)', color: '#10b981' }}>{s}</span>))}
                  </div>
                </div>
              </div>
            )}

            {/* 路径规划树 */}
            {data.path_tree.length > 0 && (
              <div className="rounded-xl border p-3" style={{ borderColor: 'var(--border-color)' }}>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--dim)' }}>学习路径规划图（章节掌握状态）</p>
                <TreeList nodes={data.path_tree} />
              </div>
            )}
          </div>
        )
      )}
    </div>
  )
}
