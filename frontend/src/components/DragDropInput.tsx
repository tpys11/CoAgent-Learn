import { useState, useRef, DragEvent } from 'react'
import { Upload, X, FileText } from 'lucide-react'

interface Props {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
  label?: string
}

export default function DragDropInput({ value, onChange, placeholder = '', rows = 4, label }: Props) {
  const [files, setFiles] = useState<Array<{name: string; size: string}>>([])
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const handleDrop = (e: DragEvent) => {
    e.preventDefault(); setDragOver(false)
    const dropped = Array.from(e.dataTransfer.files)
    dropped.forEach(f => {
      setFiles(prev => [...prev, { name: f.name, size: formatSize(f.size) }])
      // TODO: 实际读取文件内容并填入 value
      const reader = new FileReader()
      reader.onload = () => {
        const text = reader.result as string
        onChange(value ? value + '\n\n' + text : text)
      }
      reader.readAsText(f)
    })
  }

  const removeFile = (name: string) => setFiles(prev => prev.filter(f => f.name !== name))

  return (
    <div>
      {label && <label className="text-xs font-semibold text-gray-500 mb-1.5 block">{label}</label>}
      <div
        className={`relative rounded-lg transition-colors ${dragOver ? 'border-[#c75f1a] bg-[#fef3eb]/30' : 'border-[#c4beb6] bg-[#faf8f5]'}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        {/* 已上传文件 */}
        {files.length > 0 && (
          <div className="px-3 pt-2 flex flex-wrap gap-1.5">
            {files.map(f => (
              <span key={f.name} className="inline-flex items-center gap-1 text-[11px] bg-white border border-[#dad4cd] rounded px-2 py-0.5">
                <FileText size={10} className="text-blue-500" />
                {f.name} ({f.size})
                <button onClick={() => removeFile(f.name)} className="hover:text-red-500"><X size={10} /></button>
              </span>
            ))}
          </div>
        )}
        <textarea
          ref={inputRef}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={dragOver ? '释放文件即可上传' : placeholder || '输入内容，或拖拽文件到此处上传'}
          rows={rows}
          className="w-full px-3 py-2 border-0 bg-transparent text-sm outline-none resize-none"
        />
      </div>
      <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
        <Upload size={10} /> 支持拖拽上传 MD、PDF、TXT 文件
      </p>
    </div>
  )
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + 'B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB'
  return (bytes / (1024 * 1024)).toFixed(1) + 'MB'
}
