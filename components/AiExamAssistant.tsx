'use client'

import React, { useState, useRef, useEffect } from 'react'
import {
  Sparkles,
  Send,
  Bot,
  Copy,
  Check,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Code2,
  ShieldAlert,
  User,
  Lock,
  Trash2,
  X,
} from 'lucide-react'
import { postJsonWithRetry } from '@/lib/clientApi'

export interface ChatMsg {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

interface AiExamAssistantProps {
  taskId: string
  taskTitle: string
  taskPrompt?: string
  buggyOrSpec?: string
  currentCode?: string
  onPromptsChange?: (prompts: string[]) => void
  defaultExpanded?: boolean
}

/**
 * Hard cap on successfully answered, candidate-written prompts per task. Failed
 * network requests do not consume the candidate's prompt budget.
 */
const MAX_PROMPTS = 5

const chatStorageKey = (taskId: string) => `calibiai_chat_${taskId}`
const promptCountKey = (taskId: string) => `calibiai_prompt_count_${taskId}`
const promptHistoryKey = (taskId: string) => `calibiai_prompt_history_${taskId}`

function readPromptHistory(taskId: string): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(promptHistoryKey(taskId)) || '[]')
    return Array.isArray(parsed) ? parsed.map((value) => String(value)).filter(Boolean).slice(-MAX_PROMPTS) : []
  } catch {
    return []
  }
}

/** Render basic markdown elements: headings, bold, bullet points, and code blocks with Copy. */
function FormattedAssistantMessage({ content }: { content: string }) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)

  const copyToClipboard = async (text: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedIndex(idx)
      setTimeout(() => setCopiedIndex(null), 2000)
    } catch {
      // Clipboard permissions can be unavailable in some embedded browsers.
    }
  }

  // Split content by code blocks ```lang ... ```
  const parts: Array<{ type: 'text' | 'code'; lang?: string; text: string }> = []
  const codeBlockRegex = /```([a-zA-Z]*)\n([\s\S]*?)```/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', text: content.slice(lastIndex, match.index) })
    }
    parts.push({
      type: 'code',
      lang: match[1] || 'code',
      text: match[2].trimEnd(),
    })
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < content.length) {
    parts.push({ type: 'text', text: content.slice(lastIndex) })
  }

  return (
    <div className="space-y-3 text-xs leading-relaxed text-slate-800">
      {parts.map((part, pIdx) => {
        if (part.type === 'code') {
          return (
            <div
              key={pIdx}
              className="my-2.5 rounded-xl border border-slate-800 bg-slate-900 text-slate-100 overflow-hidden shadow-md"
            >
              <div className="flex items-center justify-between px-3 py-1.5 bg-slate-800/90 border-b border-slate-700/80 text-[11px] font-mono">
                <span className="text-indigo-300 font-semibold uppercase tracking-wider flex items-center gap-1.5">
                  <Code2 className="w-3.5 h-3.5 text-indigo-400" />
                  {part.lang || 'code'}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => copyToClipboard(part.text, pIdx)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-700/70 hover:bg-slate-700 text-slate-200 text-[10px] transition active:scale-95"
                    title="Copy code"
                  >
                    {copiedIndex === pIdx ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span className="text-emerald-400">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
              <pre className="p-3 font-mono text-[11.5px] overflow-x-auto whitespace-pre leading-normal selection:bg-indigo-500/30">
                {part.text}
              </pre>
            </div>
          )
        }

        // Render text lines with basic markdown parsing
        const lines = part.text.split('\n')
        return (
          <div key={pIdx} className="space-y-1.5">
            {lines.map((line, lIdx) => {
              const trimmed = line.trim()
              if (!trimmed) return <div key={lIdx} className="h-1" />

              if (trimmed.startsWith('### ')) {
                return (
                  <h4 key={lIdx} className="font-black text-slate-900 text-xs mt-2 mb-1 flex items-center gap-1.5">
                    {trimmed.replace('### ', '')}
                  </h4>
                )
              }
              if (trimmed.startsWith('## ')) {
                return (
                  <h3 key={lIdx} className="font-black text-slate-900 text-sm mt-2.5 mb-1">
                    {trimmed.replace('## ', '')}
                  </h3>
                )
              }
              if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                const item = trimmed.replace(/^[-*]\s+/, '')
                return (
                  <div key={lIdx} className="flex items-start gap-2 ml-1 text-slate-700">
                    <span className="text-indigo-500 font-bold shrink-0 mt-0.5">•</span>
                    <span>{renderInlineMarkdown(item)}</span>
                  </div>
                )
              }

              return (
                <p key={lIdx} className="text-slate-700">
                  {renderInlineMarkdown(line)}
                </p>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

function renderInlineMarkdown(str: string): React.ReactNode {
  // Parse inline `code` and **bold**
  const tokens = str.split(/(`[^`]+`|\*\*[^*]+\*\*)/g)
  return tokens.map((token, i) => {
    if (token.startsWith('`') && token.endsWith('`')) {
      return (
        <code
          key={i}
          className="px-1.5 py-0.5 rounded-md bg-indigo-50 border border-indigo-200/60 font-mono text-indigo-700 text-[11px]"
        >
          {token.slice(1, -1)}
        </code>
      )
    }
    if (token.startsWith('**') && token.endsWith('**')) {
      return (
        <strong key={i} className="font-bold text-slate-900">
          {token.slice(2, -2)}
        </strong>
      )
    }
    return token
  })
}

export function AiExamAssistant({
  taskId,
  taskTitle,
  taskPrompt = '',
  buggyOrSpec = '',
  currentCode = '',
  onPromptsChange,
  defaultExpanded = true,
}: AiExamAssistantProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [engine, setEngine] = useState<'calibiai' | 'heuristic' | null>(null)
  const [promptCounts, setPromptCounts] = useState<Record<string, number>>({})
  // Inline confirm for "clear chat" — a native window.confirm() blurs the page
  // and (in fullscreen) drops the tab out of fullscreen, which the proctoring
  // system counts as focus violations. This in-card confirm never leaves the
  // tab, so it can't trigger a warning.
  const [confirmReset, setConfirmReset] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const sendingRef = useRef(false)
  const promptsChangeRef = useRef(onPromptsChange)
  const promptsUsed = promptCounts[taskId] ?? 0
  const promptCountLoaded = Object.prototype.hasOwnProperty.call(promptCounts, taskId)
  const locked = promptCountLoaded && promptsUsed >= MAX_PROMPTS
  const promptsLeft = Math.max(0, MAX_PROMPTS - promptsUsed)

  useEffect(() => {
    promptsChangeRef.current = onPromptsChange
  }, [onPromptsChange])

  // Prompt budgets are stored per task and do not reset when the chat is cleared.
  useEffect(() => {
    try {
      const raw = Number.parseInt(localStorage.getItem(promptCountKey(taskId)) || '0', 10)
      const count = Number.isFinite(raw) ? Math.max(0, Math.min(MAX_PROMPTS, raw)) : 0
      setPromptCounts((prev) => Object.prototype.hasOwnProperty.call(prev, taskId) ? prev : { ...prev, [taskId]: count })
    } catch {
      setPromptCounts((prev) => Object.prototype.hasOwnProperty.call(prev, taskId) ? prev : { ...prev, [taskId]: 0 })
    }
  }, [taskId])

  useEffect(() => {
    if (!promptCountLoaded) return
    try { localStorage.setItem(promptCountKey(taskId), String(promptsUsed)) } catch { /* storage is optional */ }
  }, [promptCountLoaded, promptsUsed, taskId])

  // Restore the conversation and the separately retained prompt evidence per task.
  useEffect(() => {
    let restored: ChatMsg[] | null = null
    try {
      const saved = localStorage.getItem(chatStorageKey(taskId))
      const parsed = saved ? JSON.parse(saved) : null
      if (Array.isArray(parsed) && parsed.length > 0) restored = parsed
    } catch {
      /* storage can be unavailable; start a fresh conversation */
    }
    const promptHistory = readPromptHistory(taskId)
    promptsChangeRef.current?.(promptHistory)

    if (restored) {
      setMessages(restored)
      return
    }

    setMessages([{
      id: 'greet_' + Date.now(),
      role: 'assistant',
      content: `👋 **CalibiAI is ready for ${taskTitle}.**\n\nNothing is sent or suggested automatically. Write your own question and send it when you are ready.\n\nYou have up to **${MAX_PROMPTS} answered prompts** for this task.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }])
  }, [taskId, taskTitle])

  // Persist messages per task. Prompt evidence is stored separately so clearing
  // the visible chat cannot erase the prompts used for assessment.
  useEffect(() => {
    if (messages.length > 0) {
      try { localStorage.setItem(chatStorageKey(taskId), JSON.stringify(messages)) } catch { /* storage is optional */ }
    }
  }, [messages, taskId])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    if (expanded) {
      scrollToBottom()
    }
  }, [messages, expanded, busy])

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend ?? input).trim()
    if (!text || busy || sendingRef.current || !promptCountLoaded || locked) return

    sendingRef.current = true
    const userMsg: ChatMsg = {
      id: 'usr_' + Date.now(),
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }

    const updatedMessages = [...messages, userMsg]
    setMessages(updatedMessages)
    setInput('')
    setBusy(true)

    // The opening greeting, failed requests, and the errors explaining them are
    // UI-only. Only actual user turns and successful assistant answers go to AI.
    const conversation = updatedMessages.filter((msg, index) => {
      if (msg.role === 'assistant' && (msg.id.startsWith('greet_') || msg.id.startsWith('err_'))) return false
      if (msg.role === 'user') {
        const nextAssistant = updatedMessages.slice(index + 1).find((next) => next.role === 'assistant')
        if (nextAssistant?.id.startsWith('err_')) return false
      }
      return true
    }).slice(-12).map((msg) => ({
      role: msg.role,
      content: msg.content.slice(0, 8_000),
    }))

    try {
      const { data } = await postJsonWithRetry<any>('/api/ai/assistant', {
        taskId,
        taskTitle,
        taskPrompt,
        buggyOrSpec,
        currentCode: currentCode.slice(0, 60_000),
        messages: conversation,
      }, { timeoutMs: 30_000, retries: 1 })

      if (!data?.ok || typeof data.reply !== 'string' || !data.reply.trim()) {
        throw new Error(String(data?.detail || data?.error || 'The assistant returned an empty response.'))
      }

      setEngine(data.engine === 'calibiai' ? 'calibiai' : 'heuristic')
      const assistantMsg: ChatMsg = {
        id: 'asst_' + Date.now(),
        role: 'assistant',
        content: data.reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }
      setMessages((prev) => [...prev, assistantMsg])

      // Count and retain only successfully answered, user-authored prompts.
      const promptHistory = [...readPromptHistory(taskId), text].slice(-MAX_PROMPTS)
      try { localStorage.setItem(promptHistoryKey(taskId), JSON.stringify(promptHistory)) } catch { /* storage is optional */ }
      promptsChangeRef.current?.(promptHistory)
      const nextCount = Math.min(MAX_PROMPTS, promptsUsed + 1)
      setPromptCounts((prev) => ({ ...prev, [taskId]: Math.min(MAX_PROMPTS, (prev[taskId] ?? promptsUsed) + 1) }))
      try { localStorage.setItem(promptCountKey(taskId), String(nextCount)) } catch { /* storage is optional */ }
    } catch (error: any) {
      setInput(text)
      const detail = String(error?.message || 'The assistant could not answer this request.')
      const errorMsg: ChatMsg = {
        id: 'err_' + Date.now(),
        role: 'assistant',
        content: `⚠️ ${detail} Your prompt was not counted. Please retry or rephrase it.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }
      setMessages((prev) => [...prev, errorMsg])
    } finally {
      sendingRef.current = false
      setBusy(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const doResetChat = () => {
    try { localStorage.removeItem(chatStorageKey(taskId)) } catch { /* storage is optional */ }
    setMessages([{
      id: 'greet_' + Date.now(),
      role: 'assistant',
      content: `👋 **Chat reset.** Nothing is sent automatically. Type your own question when you are ready.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }])
    promptsChangeRef.current?.(readPromptHistory(taskId))
    setInput('')
    setConfirmReset(false)
  }

  const handleResetChat = () => setConfirmReset((v) => !v)

  return (
    <div className="mt-4 rounded-3xl border border-indigo-200/90 bg-gradient-to-b from-white/95 to-indigo-50/40 backdrop-blur-xl shadow-lg shadow-indigo-100/50 overflow-hidden transition-all duration-300">
      {/* Top Header */}
      <div className="px-4 py-3 bg-gradient-to-r from-indigo-900 via-indigo-800 to-violet-900 text-white flex items-center justify-between gap-3 select-none">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-500 to-fuchsia-500 flex items-center justify-center shadow-md shadow-indigo-500/40">
              <Sparkles className="w-4 h-4 text-white animate-pulse" />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-indigo-900" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black tracking-wide">CalibiAI Coding Assistant</span>
              <span className="px-2 py-0.5 rounded-full bg-indigo-500/40 border border-indigo-400/40 text-[9.5px] font-bold text-indigo-100 flex items-center gap-1">
                <ShieldAlert className="w-2.5 h-2.5 text-emerald-300" /> Exam Safe
              </span>
            </div>
            <div className="text-[10px] text-indigo-200/80">
              In-tab companion for {taskTitle} · No tab switching required
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <span
            className={`hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9.5px] font-bold border ${
              locked
                ? 'bg-rose-500/30 border-rose-400/50 text-rose-100'
                : 'bg-emerald-500/20 border-emerald-400/40 text-emerald-100'
            }`}
            title={!promptCountLoaded ? 'Loading the saved prompt count' : locked ? 'Prompt limit reached for this task' : 'Prompts remaining for this task'}
          >
            {locked ? <Lock className="w-2.5 h-2.5" /> : null}
            {!promptCountLoaded ? 'Loading…' : locked ? 'Locked' : `${promptsLeft} prompt${promptsLeft === 1 ? '' : 's'} left`}
          </span>
          {engine && (
            <span className="hidden sm:inline-flex px-2 py-0.5 rounded-md bg-white/10 text-[9.5px] font-mono text-indigo-200">
              {engine === 'calibiai' ? 'CalibiAI' : 'Heuristic Engine'}
            </span>
          )}
          <button
            onClick={handleResetChat}
            className="p-1.5 rounded-lg text-indigo-200 hover:text-white hover:bg-white/10 transition"
            title="Reset conversation"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 rounded-lg text-indigo-200 hover:text-white hover:bg-white/10 transition flex items-center gap-1 text-xs font-medium"
          >
            {expanded ? (
              <>
                <span className="text-[11px] hidden sm:inline">Collapse</span>
                <ChevronUp className="w-4 h-4" />
              </>
            ) : (
              <>
                <span className="text-[11px] hidden sm:inline">Expand</span>
                <ChevronDown className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Inline "clear chat" confirm — replaces window.confirm() so the tab
          never loses focus / leaves fullscreen (which would trip the
          proctoring focus monitor). */}
      {confirmReset && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 border-b border-amber-200 bg-amber-50/90 animate-slide-down">
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-600 animate-shake">
              <Trash2 className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0">
              <div className="text-xs font-bold text-amber-800">Clear the chat for this task?</div>
              <div className="text-[11px] text-amber-700/80">Only the conversation is cleared — your {MAX_PROMPTS}-prompt limit stays as it is.</div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setConfirmReset(false)}
              className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-white px-3 py-1.5 text-[11px] font-bold text-amber-800 transition hover:bg-amber-100 active:scale-95"
            >
              <X className="h-3 w-3" /> Cancel
            </button>
            <button
              onClick={doResetChat}
              className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-3 py-1.5 text-[11px] font-bold text-white shadow-sm shadow-amber-200 transition hover:bg-amber-600 active:scale-95"
            >
              <RotateCcw className="h-3 w-3" /> Yes, clear
            </button>
          </div>
        </div>
      )}

      {/* Collapsible Content */}
      {expanded && (
        <div className="p-4 space-y-3.5 animate-fade-in">
          {/* Locked state — the prompt budget is exhausted */}
          {locked && (
            <div className="flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 animate-fade-in">
              <Lock className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                <b>Assistant locked.</b> You've used all {MAX_PROMPTS} prompts for this task.
                Review your work with what you've learned, run the tests, and submit your best solution.
              </span>
            </div>
          )}

          {/* Messages Container */}
          <div className="max-h-[360px] min-h-[160px] overflow-y-auto space-y-3 pr-1 rounded-2xl bg-slate-50/70 border border-slate-200/70 p-3.5">
            {messages.map((msg) => {
              const isUser = msg.role === 'user'
              return (
                <div
                  key={msg.id}
                  className={`flex items-start gap-2.5 ${isUser ? 'justify-end' : 'justify-start'} animate-fade-up`}
                >
                  {!isUser && (
                    <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-white shrink-0 shadow-sm mt-0.5">
                      <Bot className="w-3.5 h-3.5" />
                    </div>
                  )}

                  <div
                    className={`max-w-[85%] rounded-2xl p-3 shadow-sm ${
                      isUser
                        ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-tr-none'
                        : 'bg-white border border-slate-200/90 rounded-tl-none text-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3 mb-1 text-[10px] opacity-75">
                      <span className="font-bold">{isUser ? 'You (Candidate)' : 'CalibiAI Assistant'}</span>
                      <span className="font-mono">{msg.timestamp}</span>
                    </div>

                    {isUser ? (
                      <div className="text-xs leading-relaxed whitespace-pre-wrap">{msg.content}</div>
                    ) : (
                      <FormattedAssistantMessage content={msg.content} />
                    )}
                  </div>

                  {isUser && (
                    <div className="w-6 h-6 rounded-lg bg-slate-200 border border-slate-300 flex items-center justify-center text-slate-600 shrink-0 mt-0.5">
                      <User className="w-3.5 h-3.5" />
                    </div>
                  )}
                </div>
              )
            })}

            {/* Busy / Typing Indicator */}
            {busy && (
              <div className="flex items-start gap-2.5 justify-start animate-fade-in">
                <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-white shrink-0 shadow-sm mt-0.5">
                  <Bot className="w-3.5 h-3.5" />
                </div>
                <div className="rounded-2xl rounded-tl-none bg-white border border-indigo-200/90 p-3 shadow-sm flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                  <span className="text-xs text-indigo-600 font-medium ml-1.5">Analyzing code & context…</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Form */}
          <div className="space-y-1.5">
            <div className="relative flex items-center rounded-2xl border border-indigo-200 bg-white shadow-sm focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-100 transition">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  !promptCountLoaded
                    ? 'Loading prompt limit…'
                    : locked
                      ? 'Prompt limit reached — the assistant is locked for this task.'
                      : 'Type your own question for the assistant…'
                }
                rows={1}
                disabled={busy || locked || !promptCountLoaded}
                className="w-full resize-none bg-transparent px-3.5 py-2.5 text-xs text-slate-800 placeholder:text-slate-400 outline-none max-h-24 min-h-[40px]"
              />
              <button
                type="button"
                disabled={!input.trim() || busy || locked || !promptCountLoaded}
                onClick={() => handleSend()}
                className="m-1.5 p-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold transition hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                title={locked ? 'Prompt limit reached' : 'Send your question'}
              >
                {locked ? <Lock className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
              </button>
            </div>
            <div className="flex items-center justify-between px-1 text-[10px] text-slate-400">
              <span className="flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full inline-block ${locked ? 'bg-rose-500' : promptCountLoaded ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                {!promptCountLoaded ? 'Loading saved prompt count…' : locked ? `Prompt limit reached — ${MAX_PROMPTS}/${MAX_PROMPTS} used` : `${promptsLeft} answered prompt${promptsLeft === 1 ? '' : 's'} left · editor context synced`}
              </span>
              <span>{locked ? 'Assistant locked for this task' : promptCountLoaded ? 'Enter to send · Shift+Enter for new line' : 'Preparing assistant…'}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
