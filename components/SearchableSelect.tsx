'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Search } from 'lucide-react'

/**
 * Searchable + scrollable single-select (combobox) for a fixed option list.
 *
 * Used for the Degree field (47 programmes). Unlike the plain `Dropdown`, this
 * one:
 *   • shows a search box inside the menu so you can type to filter, and
 *   • keeps the menu capped at a fixed height with its own scrollbar, so every
 *     option is always reachable.
 * Keyboard: ArrowUp/Down to move, Enter to pick, Escape to close.
 */

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

export function SearchableSelect({
  value,
  onChange,
  invalid,
  id,
  options,
  placeholder,
  ariaLabel,
  emptyText = 'No matches — try a different search.',
}: {
  value: string
  onChange: (v: string) => void
  invalid: boolean
  id: string
  options: readonly string[]
  placeholder: string
  ariaLabel: string
  emptyText?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return [...options]
    return options.filter((o) => o.toLowerCase().includes(q))
  }, [options, query])

  // Close on outside click / Escape anywhere in the control.
  useEffect(() => {
    if (!open) return
    const onDocDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', onDocDown)
    return () => document.removeEventListener('mousedown', onDocDown)
  }, [open])

  // Focus the search box the moment the menu opens.
  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  // Keep the highlighted option visible while moving / filtering.
  useEffect(() => {
    if (!open || !listRef.current) return
    listRef.current
      .querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [open, active, query])

  const openMenu = () => {
    setQuery('')
    setActive(Math.max(0, filtered.indexOf(value)))
    setOpen(true)
  }

  const closeMenu = () => {
    setOpen(false)
    setQuery('')
  }

  const toggleMenu = () => {
    if (open) closeMenu()
    else openMenu()
  }

  const choose = (v: string) => {
    onChange(v)
    setQuery('')
    setOpen(false)
  }

  const move = (dir: 1 | -1) => {
    if (!filtered.length) return
    setActive((a) => (a + dir + filtered.length) % filtered.length)
  }

  return (
    <div ref={root} className="relative">
      <button
        id={id}
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={`${id}-list`}
        aria-invalid={invalid}
        onClick={toggleMenu}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            if (!open) openMenu()
          } else if (e.key === 'Escape') {
            setOpen(false)
            setQuery('')
          }
        }}
        className={`flex w-full items-center justify-between gap-2 rounded-xl border bg-white/80 px-3.5 py-2.5 text-left text-sm transition focus:outline-none focus:ring-4 ${
          invalid
            ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-100'
            : 'border-slate-200 focus:border-indigo-400 focus:ring-indigo-100'
        }`}
      >
        <span className={`truncate ${value ? 'font-semibold text-slate-800' : 'text-slate-400'}`}>
          {value || placeholder}
        </span>
        <ChevronDown
          aria-hidden
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="animate-pop absolute z-40 mt-2 w-full overflow-hidden rounded-2xl border border-white/70 bg-white/95 shadow-2xl shadow-indigo-200/60 backdrop-blur-xl">
          {/* Search box pinned to the top of the menu */}
          <div className="flex items-center gap-2 border-b border-slate-100 bg-white/70 px-3 py-2.5">
            <Search aria-hidden className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              ref={inputRef}
              type="text"
              role="searchbox"
              autoComplete="off"
              placeholder="Type to search…"
              value={query}
              aria-label={`Search ${ariaLabel.toLowerCase()}`}
              onChange={(e) => {
                setQuery(e.target.value)
                setActive(0)
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  move(1)
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  move(-1)
                } else if (e.key === 'Enter') {
                  e.preventDefault()
                  if (filtered[active]) choose(filtered[active])
                } else if (e.key === 'Escape') {
                  setQuery('')
                  setOpen(false)
                  triggerRef.current?.focus()
                }
              }}
              className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
            />
          </div>

          <ul
            id={`${id}-list`}
            ref={listRef}
            role="listbox"
            aria-label={ariaLabel}
            className="max-h-72 overflow-y-auto overscroll-contain p-1.5"
          >
            {filtered.length === 0 && (
              <li className="px-3 py-2.5 text-sm text-slate-400">{emptyText}</li>
            )}
            {filtered.map((opt, i) => {
              const isActive = i === active
              const isSelected = opt === value
              return (
                <li key={opt} role="option" aria-selected={isSelected}>
                  <button
                    type="button"
                    data-active={isActive}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => choose(opt)}
                    className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                      isActive ? 'calibiai-gradient text-white shadow-md shadow-indigo-300/50' : 'text-slate-700 hover:bg-indigo-50'
                    }`}
                  >
                    <span className={`font-semibold ${isActive ? 'text-white' : ''}`}>{mark(opt, query)}</span>
                    {isSelected && <span aria-hidden className="text-xs font-bold">✓</span>}
                  </button>
                </li>
              )
            })}
          </ul>

          <p className="border-t border-slate-100 bg-white/60 px-3 py-1.5 text-[10px] font-semibold text-slate-400">
            {filtered.length} {filtered.length === 1 ? 'option' : 'options'} · ↑↓ to move · Enter to pick
          </p>
        </div>
      )}
    </div>
  )
}
