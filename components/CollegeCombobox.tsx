'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { COLLEGE_REGIONS, searchColleges, type College } from '@/lib/colleges'

/**
 * Searchable "College / University" picker.
 *
 * Unlike the fixed `Dropdown`, this one lets the candidate type to filter the
 * preloaded Pune & Amravati college directory, pick with keyboard or mouse,
 * and still type a free-text college name when theirs isn't listed (e.g. an
 * IIT/NIT or a college in another state). The stored value stays a plain
 * string, so nothing downstream changes.
 */

type Selectable =
  | { kind: 'custom'; label: string }
  | { kind: 'college'; college: College }

type Row =
  | { type: 'header'; label: string }
  | { type: 'custom'; label: string }
  | { type: 'college'; college: College }

const keyOf = (s: Selectable) => (s.kind === 'custom' ? `custom:${s.label}` : `college:${s.college.name}`)

function mark(text: string, query: string): React.ReactNode {
  const q = query.trim()
  if (!q) return text
  const idx = text.toLowerCase().indexOf(q.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <span className="rounded bg-indigo-100 px-0.5 font-extrabold text-indigo-700">{text.slice(idx, idx + q.length)}</span>
      {text.slice(idx + q.length)}
    </>
  )
}

export function CollegeCombobox({
  value,
  onChange,
  invalid,
  id,
  placeholder = 'Search your college…',
  ariaLabel = 'College / University',
}: {
  value: string
  onChange: (v: string) => void
  invalid: boolean
  id: string
  placeholder?: string
  ariaLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(value)
  const [activeKey, setActiveKey] = useState('')
  const root = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  // Keep the text in the input in sync with the externally selected value.
  useEffect(() => setQuery(value), [value])

  useEffect(() => {
    if (!open) return
    const onDocDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocDown)
    return () => document.removeEventListener('mousedown', onDocDown)
  }, [open])

  const q = query.trim()
  const ql = q.toLowerCase()

  const rows = useMemo<Row[]>(() => {
    const filtered = searchColleges(q)
    const exact = filtered.some((c) => c.name.toLowerCase() === ql)
    const out: Row[] = []
    // Free-text fallback: always offered while typing something not in the list.
    if (ql && !exact) out.push({ type: 'custom', label: q })
    for (const region of COLLEGE_REGIONS) {
      const items = filtered.filter((c) => c.region === region.id)
      if (!items.length) continue
      out.push({ type: 'header', label: region.label })
      for (const c of items) out.push({ type: 'college', college: c })
    }
    return out
  }, [ql, q])

  const selectable = useMemo<Selectable[]>(() => {
    const out: Selectable[] = []
    for (const r of rows) {
      if (r.type === 'header') continue
      out.push(r.type === 'custom' ? { kind: 'custom', label: r.label } : { kind: 'college', college: r.college })
    }
    return out
  }, [rows])

  const choose = (s: Selectable) => {
    const label = s.kind === 'custom' ? s.label : s.college.name
    onChange(label)
    setQuery(label)
    setOpen(false)
  }

  const move = (dir: 1 | -1) => {
    if (!selectable.length) return
    const i = selectable.findIndex((s) => keyOf(s) === activeKey)
    const next = i === -1 ? (dir === 1 ? 0 : selectable.length - 1) : (i + dir + selectable.length) % selectable.length
    const k = keyOf(selectable[next])
    setActiveKey(k)
    listRef.current?.querySelector<HTMLElement>(`[data-opt="${CSS.escape(k)}"]`)?.scrollIntoView({ block: 'nearest' })
  }

  const openMenu = () => {
    setOpen(true)
    if (!activeKey && selectable.length) setActiveKey(keyOf(selectable[0]))
  }

  return (
    <div ref={root} className="relative">
      <div
        className={`flex items-center gap-2 rounded-xl border bg-white/80 transition focus-within:bg-white focus-within:ring-4 ${
          invalid
            ? 'border-rose-300 focus-within:border-rose-400 focus-within:ring-rose-100'
            : 'border-slate-200 focus-within:border-indigo-400 focus-within:ring-indigo-100'
        }`}
      >
        <svg aria-hidden viewBox="0 0 20 20" className="ml-3 h-4 w-4 shrink-0 text-slate-400" fill="currentColor">
          <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.45 4.39l3.08 3.08a.75.75 0 1 1-1.06 1.06l-3.08-3.08A7 7 0 0 1 2 9Z" clipRule="evenodd" />
        </svg>
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={`${id}-list`}
          aria-label={ariaLabel}
          aria-autocomplete="list"
          aria-invalid={invalid}
          autoComplete="off"
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActiveKey('')
            setOpen(true)
          }}
          onFocus={openMenu}
          onClick={openMenu}
          onBlur={() => {
            // Commit free-text only when focus actually leaves the whole
            // control (clicking an option keeps focus inside `root`).
            const next = document.activeElement as Node | null
            if (!next || !root.current?.contains(next)) {
              if (query !== value) onChange(query)
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              if (!open) openMenu()
              else move(1)
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              if (!open) openMenu()
              else move(-1)
            } else if (e.key === 'Enter') {
              if (open && selectable.length) {
                e.preventDefault()
                const s = selectable.find((x) => keyOf(x) === activeKey) ?? selectable[0]
                choose(s)
              }
            } else if (e.key === 'Escape') {
              setQuery(value)
              setOpen(false)
            }
          }}
          className="w-full bg-transparent py-2.5 pr-3 text-sm text-slate-800 outline-none placeholder:text-slate-400"
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label="Clear college"
          onClick={() => {
            onChange('')
            setQuery('')
            setActiveKey('')
            setOpen(true)
          }}
          className={`mr-2 grid h-5 w-5 shrink-0 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 ${query ? '' : 'pointer-events-none opacity-0'}`}
        >
          <svg aria-hidden viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="currentColor">
            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
          </svg>
        </button>
      </div>

      {open && (
        <ul
          id={`${id}-list`}
          role="listbox"
          aria-label={ariaLabel}
          ref={listRef}
          className="animate-pop absolute z-40 mt-2 max-h-80 w-full overflow-y-auto rounded-2xl border border-white/70 bg-white/95 p-1.5 shadow-2xl shadow-indigo-200/60 backdrop-blur-xl"
        >
          {rows.length === 0 && (
            <li className="px-3 py-2.5 text-sm text-slate-400">No matches — type a different name.</li>
          )}
          {rows.map((row) => {
            if (row.type === 'header') {
              return (
                <li
                  key={`header-${row.label}`}
                  role="presentation"
                  className="sticky top-0 z-10 bg-white/95 px-3 pb-1 pt-2 text-[10px] font-black uppercase tracking-widest text-indigo-500"
                >
                  {row.label}
                </li>
              )
            }
            const s: Selectable = row.type === 'custom' ? { kind: 'custom', label: row.label } : { kind: 'college', college: row.college }
            const k = keyOf(s)
            const isActive = k === activeKey
            return (
              <li key={k} role="option" aria-selected={isActive}>
                <button
                  type="button"
                  data-opt={k}
                  onMouseEnter={() => setActiveKey(k)}
                  onClick={() => choose(s)}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                    isActive ? 'calibiai-gradient text-white shadow-md shadow-indigo-300/50' : 'text-slate-700 hover:bg-indigo-50'
                  }`}
                >
                  {row.type === 'custom' ? (
                    <span className="font-semibold">
                      Use “{row.label}” <span className={isActive ? 'text-indigo-100' : 'text-slate-400'}>(not in list)</span>
                    </span>
                  ) : (
                    <>
                      <span className="min-w-0">
                        <span className="font-semibold">{mark(row.college.name, q)}</span>
                        {row.college.alias && (
                          <span className={`ml-1.5 text-[11px] font-bold ${isActive ? 'text-indigo-100' : 'text-slate-400'}`}>
                            {row.college.alias}
                          </span>
                        )}
                      </span>
                      <span className={`shrink-0 text-[11px] font-semibold ${isActive ? 'text-indigo-100' : 'text-slate-400'}`}>
                        {row.college.city}
                      </span>
                    </>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
