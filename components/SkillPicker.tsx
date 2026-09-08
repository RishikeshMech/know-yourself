'use client'

import { useMemo, useState } from 'react'
import { Plus, Search, Sparkles, X } from 'lucide-react'
import { SKILL_GROUPS, TOP_SKILLS } from '@/lib/skills'

/** Soft cap so the report/skills area stays readable. */
export const MAX_SKILLS = 15

/** Parse a comma-separated skills string into a de-duplicated, trimmed list. */
export function parseSkills(value: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of String(value ?? '').split(',')) {
    const skill = raw.trim()
    if (!skill) continue
    const key = skill.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(skill)
  }
  return out
}

/**
 * Friendly skill picker: a search box (type + press Enter to add any skill),
 * a click-to-add list of trending skills grouped by discipline, and the
 * selected skills as removable chips. Emits the same comma-separated string
 * the rest of the app already stores, so nothing downstream changes.
 */
export function SkillPicker({
  value,
  onChange,
  id = 'skills',
}: {
  value: string
  onChange: (v: string) => void
  id?: string
}) {
  const [query, setQuery] = useState('')

  const selected = useMemo(() => parseSkills(value), [value])
  const selectedKeys = useMemo(() => new Set(selected.map((s) => s.toLowerCase())), [selected])

  const q = query.trim()
  const ql = q.toLowerCase()
  const atMax = selected.length >= MAX_SKILLS

  const emit = (list: string[]) => onChange(list.join(', '))

  const add = (name: string) => {
    const n = name.trim().replace(/\s+/g, ' ')
    if (!n || atMax) return
    if (selectedKeys.has(n.toLowerCase())) return
    emit([...selected, n])
  }

  const remove = (name: string) => {
    emit(selected.filter((s) => s.toLowerCase() !== name.toLowerCase()))
  }

  const toggle = (name: string) => {
    if (selectedKeys.has(name.toLowerCase())) remove(name)
    else add(name)
  }

  const clearAll = () => {
    emit([])
    setQuery('')
  }

  /** Add whatever is typed (Enter key or the "Add" row); supports "a, b, c". */
  const commitQuery = () => {
    const parts = q.split(',').map((p) => p.trim()).filter(Boolean)
    if (!parts.length) return
    const next = [...selected]
    for (const p of parts) {
      if (next.length >= MAX_SKILLS) break
      if (!next.some((s) => s.toLowerCase() === p.toLowerCase())) next.push(p)
    }
    emit(next)
    setQuery('')
  }

  // Groups filtered by the search query, with already-selected skills removed.
  const groups = useMemo(() => {
    return SKILL_GROUPS.map((g) => ({
      ...g,
      skills: g.skills.filter(
        (s) => !selectedKeys.has(s.toLowerCase()) && (!ql || s.toLowerCase().includes(ql)),
      ),
    })).filter((g) => g.skills.length > 0)
  }, [ql, selectedKeys])

  const isListed = ql ? TOP_SKILLS.some((s) => s.toLowerCase() === ql) : false
  const canAddQuery = !!ql && !selectedKeys.has(ql) && !isListed

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/70 p-3">
      {/* Search / free-text entry */}
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white/80 px-3 transition focus-within:border-indigo-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-indigo-100">
        <Search aria-hidden className="h-4 w-4 shrink-0 text-slate-400" />
        <input
          id={id}
          type="text"
          autoComplete="off"
          value={query}
          placeholder="Search or type a skill…"
          aria-label="Search or type a skill"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commitQuery()
            } else if (e.key === 'Backspace' && !query && selected.length) {
              remove(selected[selected.length - 1])
            }
          }}
          className="w-full bg-transparent py-2.5 text-sm text-slate-800 outline-none placeholder:text-slate-400"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Clear search"
            className="text-slate-400 transition hover:text-slate-600"
          >
            <X aria-hidden className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Selected skills */}
      <div className="mt-3">
        {selected.length ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {selected.map((skill) => (
              <span
                key={skill}
                className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700"
              >
                {skill}
                <button
                  type="button"
                  onClick={() => remove(skill)}
                  aria-label={`Remove ${skill}`}
                  className="grid h-4 w-4 place-items-center rounded-full text-indigo-400 transition hover:bg-indigo-200 hover:text-indigo-800"
                >
                  <X aria-hidden className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-400">
            No skills yet — tap the trending skills below or type your own and press Enter.
          </p>
        )}
      </div>

      {/* Custom skill (only when the query isn't already a listed chip) */}
      {canAddQuery && (
        <button
          type="button"
          onClick={commitQuery}
          disabled={atMax}
          className="mt-2.5 flex w-full items-center gap-2 rounded-xl border border-dashed border-indigo-200 bg-indigo-50/60 px-3 py-2 text-left text-sm font-semibold text-indigo-700 transition hover:bg-indigo-50 disabled:opacity-40"
        >
          <Plus aria-hidden className="h-4 w-4 shrink-0" />
          Add “{q}”
        </button>
      )}

      {/* Trending suggestions */}
      {groups.length > 0 && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
            <Sparkles aria-hidden className="h-3 w-3 text-indigo-400" />
            Trending skills — tap to add
          </p>
          <div className="mt-2 space-y-2.5">
            {groups.map((group) => (
              <div key={group.label}>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{group.label}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {group.skills.map((skill) => (
                    <button
                      key={skill}
                      type="button"
                      onClick={() => toggle(skill)}
                      disabled={atMax}
                      className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white/70 px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Plus aria-hidden className="h-3 w-3 text-slate-300" />
                      {skill}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      {selected.length > 0 && (
        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5">
          <span className="text-[11px] font-semibold text-slate-400">
            {selected.length} / {MAX_SKILLS} selected{atMax ? ' · maximum reached' : ''}
          </span>
          <button
            type="button"
            onClick={clearAll}
            className="text-[11px] font-bold text-rose-500 transition hover:text-rose-600"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  )
}
