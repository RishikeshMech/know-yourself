'use client'
import { useState } from 'react'
import type { CodeLang } from '@/lib/company/languages.ts'

const LANGS: Array<{ id: CodeLang; label: string }> = [
  { id: 'python', label: 'Python' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'java', label: 'Java' },
  { id: 'cpp', label: 'C++' },
]

export function CodeEditorPanel({
  starterCode,
  onRun,
  running,
  results,
}: {
  starterCode: Record<string, string>
  onRun: (code: string, lang: CodeLang) => Promise<void>
  running: boolean
  results?: { passed: number; total: number; results: any[] } | null
}) {
  const [lang, setLang] = useState<CodeLang>('python')
  const [code, setCode] = useState(starterCode['python'] || starterCode['javascript'] || '')

  const switchLang = (newLang: CodeLang) => {
    setLang(newLang)
    setCode(starterCode[newLang] || starterCode['python'] || '')
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-3 py-2">
        <div className="flex gap-1">
          {LANGS.map(l => (
            <button
              key={l.id}
              onClick={() => switchLang(l.id)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition ${lang === l.id ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'}`}
            >
              {l.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => onRun(code, lang)}
          disabled={running}
          className="btn-primary !py-1.5 !px-4 !text-xs disabled:opacity-50"
        >
          {running ? 'Running…' : '▶ Run tests'}
        </button>
      </div>
      <textarea
        value={code}
        onChange={e => setCode(e.target.value)}
        spellCheck={false}
        className="w-full min-h-[280px] bg-slate-900 p-4 font-mono text-xs leading-relaxed text-slate-100 outline-none"
        placeholder="Write your solution here…"
      />
      {results && (
        <div className="border-t border-slate-100 bg-slate-50 p-3 text-xs">
          <div className="font-bold text-slate-700">{results.passed}/{results.total} tests passed</div>
          <div className="mt-2 space-y-1">
            {results.results.slice(0, 8).map((r: any, i: number) => (
              <div key={i} className={`flex items-center gap-2 ${r.passed ? 'text-emerald-700' : 'text-rose-700'}`}>
                <span>{r.passed ? '✓' : '✗'}</span>
                <span className="truncate">{r.name}</span>
                {r.ms != null && <span className="text-slate-400">· {r.ms}ms</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
