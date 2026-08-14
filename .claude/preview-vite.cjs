#!/usr/bin/env node
// Preview 专用启动脚本：chdir 到 frontend 后启动 vite。
// 直接从项目根跑 vite 时 Tailwind content 扫描路径会基于错误的 cwd，导致工具类缺失（排版乱）。
// 用法：node .claude/preview-vite.cjs 5174
const { execFile } = require('child_process')
const path = require('path')
const root = path.resolve(__dirname, '..')
process.chdir(path.join(root, 'frontend'))
const port = process.argv[2] || '5174'
const child = execFile(
  process.execPath,
  [path.join('node_modules', 'vite', 'bin', 'vite.js'), '--port', port, '--strictPort'],
  { cwd: path.join(root, 'frontend'), env: { ...process.env } },
)
child.stdout.pipe(process.stdout)
child.stderr.pipe(process.stderr)
child.on('exit', (c) => process.exit(c || 0))
