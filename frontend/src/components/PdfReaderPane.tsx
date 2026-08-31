/** F13-S3 PDF 阅读器面板：react-pdf（pdf.js）——Outline 侧栏 + 缩略图栏 + 文本层可复制 + 页导航/缩放。
 *  为什么自管渲染窗口：大部头教材数百页，全量渲染会拖垮内存——主页面按可视窗口渲染
 *  （IntersectionObserver 驱动 + 远离当前页回收），缩略图为小画布、首次可见渲染后保留。
 *  书签优先（与 F9 大纲共用事实源思路）：PDF 自带 outline 即侧栏；无书签时显示提示不显示假树。
 *  加载失败经 onBroken 上报调用方走 iframe 兜底（派发单 §三.S3）。 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/TextLayer.css'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

// worker 一次性配置（Vite ?url 模式，构建产物内离线可用）
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

/** pdf.js outline 项（getOutline 产物子集） */
interface OutlineItem { title: string; dest?: unknown; items?: OutlineItem[] }

const RENDER_WINDOW = 6 // 主页面渲染窗口半径：超出当前页 N 页的已渲染页回收（控内存）

/** dest → 页码（命名 dest 先查 getDestination；解析失败返回 null 不跳转） */
async function destToPage(pdf: any, dest: unknown): Promise<number | null> {
  try {
    let d = dest
    if (typeof d === 'string') d = await pdf.getDestination(d)
    if (!Array.isArray(d) || !d[0]) return null
    const idx = await pdf.getPageIndex(d[0])
    return idx + 1
  } catch {
    return null
  }
}

export default function PdfReaderPane({ fileUrl, onBroken }: {
  fileUrl: string
  /** 文档加载失败 → 调用方切换 iframe 兜底 */
  onBroken: () => void
}) {
  const [numPages, setNumPages] = useState(0)
  const [curPage, setCurPage] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [outline, setOutline] = useState<OutlineItem[] | null>(null)
  const [rendered, setRendered] = useState<Set<number>>(new Set())
  const [thumbVisible, setThumbVisible] = useState<Set<number>>(new Set())
  const pdfRef = useRef<any>(null)
  const pageRefs = useRef<Map<number, HTMLElement>>(new Map())
  const bodyRef = useRef<HTMLDivElement>(null)
  const [bodyWidth, setBodyWidth] = useState(0)

  // 容器宽度（缩放基准=fit-width）；ResizeObserver 跟随侧栏/窗口变化
  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    const update = () => setBodyWidth(el.clientWidth - 32)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const pageWidth = Math.max(320, Math.floor(bodyWidth * zoom))

  // 主页面渲染窗口回收：远离当前页的已渲染页释放（canvas 内存）
  useEffect(() => {
    setRendered(prev => {
      let changed = false
      const next = new Set<number>()
      for (const p of prev) {
        if (Math.abs(p - curPage) <= RENDER_WINDOW) next.add(p)
        else changed = true
      }
      return changed ? next : prev
    })
  }, [curPage])

  // IntersectionObserver：主页面槽进入视口 → 记入渲染集 + 更新当前页；缩略图槽 → 懒渲染
  useEffect(() => {
    const io = new IntersectionObserver(entries => {
      for (const en of entries) {
        const el = en.target as HTMLElement
        const p = Number(el.dataset.page)
        if (!en.isIntersecting || !p) continue
        if (el.dataset.kind === 'page') {
          setCurPage(cur => (cur === p ? cur : p))
          setRendered(prev => (prev.has(p) ? prev : new Set(prev).add(p)))
        } else if (el.dataset.kind === 'thumb') {
          setThumbVisible(prev => (prev.has(p) ? prev : new Set(prev).add(p)))
        }
      }
    }, { root: bodyRef.current, rootMargin: '600px 0px', threshold: 0 })
    const root2 = new IntersectionObserver(entries => {
      for (const en of entries) {
        const el = en.target as HTMLElement
        const p = Number(el.dataset.page)
        if (en.isIntersecting && p) setThumbVisible(prev => (prev.has(p) ? prev : new Set(prev).add(p)))
      }
    }, { rootMargin: '300px 0px', threshold: 0 })
    bodyRef.current?.querySelectorAll<HTMLElement>('[data-kind="page"]').forEach(el => io.observe(el))
    bodyRef.current?.querySelectorAll<HTMLElement>('[data-kind="thumb"]').forEach(el => root2.observe(el))
    return () => { io.disconnect(); root2.disconnect() }
  }, [numPages, outline])

  // 页码跳转：等目标页渲染完成后滚动（轮询重试，同 KbReaderModal 定位模式）
  const goToPage = useCallback((p: number) => {
    const target = Math.min(Math.max(1, p), numPages || 1)
    setRendered(prev => new Set(prev).add(target))
    setCurPage(target)
    let attempts = 0
    const tryScroll = () => {
      attempts++
      const el = pageRefs.current.get(target)
      if (el) { el.scrollIntoView({ block: 'start' }); return }
      if (attempts < 20) setTimeout(tryScroll, 150)
    }
    setTimeout(tryScroll, 60)
  }, [numPages])

  const onDocLoadSuccess = useCallback(async (pdf: any) => {
    pdfRef.current = pdf
    setNumPages(pdf.numPages)
    try {
      const ol = await pdf.getOutline()
      setOutline(Array.isArray(ol) && ol.length ? ol : null)
    } catch {
      setOutline(null)
    }
  }, [])

  const onOutlineClick = useCallback(async (it: OutlineItem) => {
    if (!pdfRef.current) return
    const p = await destToPage(pdfRef.current, it.dest)
    if (p) goToPage(p)
  }, [goToPage])

  /** 书签树渲染（无书签=提示行，不造假树） */
  const outlineList = useMemo(() => {
    if (!outline) return null
    const walk = (items: OutlineItem[], depth: number): React.ReactNode[] =>
      items.map((it, i) => (
        <div key={depth + '-' + i}>
          <button onClick={() => onOutlineClick(it)}
            className="w-full text-left px-1.5 py-1 rounded-lg text-[11px] leading-snug text-dim hover:bg-[var(--bg-hover)] hover:text-[var(--text)] transition-colors truncate"
            style={{ paddingLeft: 6 + depth * 12 }}
            title={it.title}>
            {it.title || '（无标题）'}
          </button>
          {it.items?.length ? walk(it.items, depth + 1) : null}
        </div>
      ))
    return walk(outline, 0)
  }, [outline, onOutlineClick])

  const pages = useMemo(() => Array.from({ length: numPages }, (_, i) => i + 1), [numPages])

  return (
    <div className="flex-1 flex min-h-0">
      {/* Document 包裹三栏（v10：Page 从 Document 上下文取 pdf，缩略图栏必须在其子树内） */}
      <Document file={fileUrl} onLoadSuccess={onDocLoadSuccess} onLoadError={() => onBroken()}
        error={null}
        loading={<div className="flex-1 flex items-center justify-center gap-2 text-[11px] text-dim"><Loader2 size={14} className="animate-spin" /> PDF 加载中…</div>}
        className="flex-1 flex min-h-0">
        {/* 左栏一：书签大纲（PDF 自带 outline；书签缺失时明示） */}
        <div className="w-52 flex-shrink-0 border-r hairline overflow-y-auto p-2">
          <p className="text-[10px] font-bold text-dim uppercase tracking-wider px-1.5 mt-1 mb-1">书签大纲</p>
          {outlineList ? outlineList : <p className="text-[10px] text-dim px-1.5 py-2">该 PDF 无书签大纲</p>}
        </div>
        {/* 左栏二：缩略图（首次可见渲染后保留；点击跳页） */}
        <div className="w-32 flex-shrink-0 border-r hairline overflow-y-auto p-2 flex flex-col gap-2">
          {pages.map(p => (
            <div key={p} data-kind="thumb" data-page={p} onClick={() => goToPage(p)}
              className={`cursor-pointer rounded-lg border p-0.5 transition-colors ${curPage === p ? 'border-[var(--accent)]' : 'border-transparent hover:border-[var(--border-color)]'}`}>
              {thumbVisible.has(p) ? (
                <Page pageNumber={p} width={104} renderTextLayer={false} renderAnnotationLayer={false} />
              ) : (
                <div className="w-[104px] h-[140px] rounded bg-[var(--bg-hover)] flex items-center justify-center text-[10px] text-dim">{p}</div>
              )}
              <p className="text-center text-[9px] text-dim mt-0.5">{p}</p>
            </div>
          ))}
        </div>
        {/* 主体：页面流（文本层可选中复制）+ 底部页导航 */}
        <div className="flex-1 flex flex-col min-w-0">
          <div ref={bodyRef} className="flex-1 overflow-auto bg-[var(--bg-hover)] p-4">
            {pages.map(p => (
              <div key={p} data-kind="page" data-page={p} ref={el => { if (el) pageRefs.current.set(p, el); else pageRefs.current.delete(p) }}
                className="mx-auto mb-4 bg-white shadow-md rounded-sm overflow-hidden"
                style={{ width: pageWidth, height: rendered.has(p) ? undefined : Math.round(pageWidth * 1.35) }}>
                {rendered.has(p) ? (
                  <Page pageNumber={p} width={pageWidth} renderTextLayer renderAnnotationLayer={false} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[11px] text-dim">{p}</div>
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center justify-center gap-2 py-2 border-t hairline flex-shrink-0">
            <button onClick={() => goToPage(curPage - 1)} disabled={curPage <= 1}
              className="p-1 rounded-lg hover:bg-[var(--bg-hover)] disabled:opacity-30"><ChevronLeft size={14} /></button>
            <input type="number" min={1} max={numPages || 1} value={curPage}
              onChange={e => { const v = Number(e.target.value); if (v >= 1 && v <= numPages) goToPage(v) }}
              className="w-14 px-1.5 py-0.5 text-[11px] input-surface rounded-lg outline-none text-center" />
            <span className="text-[11px] text-dim">/ {numPages || '…'} 页</span>
            <button onClick={() => goToPage(curPage + 1)} disabled={!numPages || curPage >= numPages}
              className="p-1 rounded-lg hover:bg-[var(--bg-hover)] disabled:opacity-30"><ChevronRight size={14} /></button>
            <span className="mx-2 h-4 w-px bg-[var(--border-color)]" />
            <button onClick={() => setZoom(z => Math.max(0.5, +(z - 0.1).toFixed(2)))}
              className="px-2 py-0.5 text-[11px] rounded-lg hover:bg-[var(--bg-hover)]">-</button>
            <span className="text-[11px] text-dim w-10 text-center">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(z => Math.min(2.5, +(z + 0.1).toFixed(2)))}
              className="px-2 py-0.5 text-[11px] rounded-lg hover:bg-[var(--bg-hover)]">+</button>
          </div>
        </div>
      </Document>
    </div>
  )
}
