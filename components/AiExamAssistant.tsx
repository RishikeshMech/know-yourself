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
  Lightbulb,
  ShieldAlert,
  ArrowDownToLine,
  User,
  Lock,
} from 'lucide-react'

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
  onApplyCode?: (codeSnippet: string) => void
  defaultExpanded?: boolean
}

/**
 * Hard cap on how many user prompts the in-exam assistant answers per task.
 * After this the assistant locks, so the candidate plans their best prompts
 * instead of leaning on it. Mirrored in the assessment instructions page.
 */
const MAX_PROMPTS = 5

const DEFAULT_SUGGESTIONS: Record<string, string[]> = {
  AD1: [
    '💡 Explain the off-by-one bug',
    '🔍 What edge cases are tested for AD1?',
    '🛠️ Show me the corrected Python function',
    '📋 Review my current code',
  ],
  AD2: [
    '💡 How does Promise caching prevent race conditions?',
    '🔄 How do I handle fetch failures and retries?',
    '🛠️ Show me the fixed async get() function',
    '📋 Review my current code',
  ],
  AD3: [
    '💡 Why does Python skip items when removing in a loop?',
    '🛠️ What is the cleanest fix using list comprehension?',
    '🔍 What edge cases are tested for AD3?',
    '📋 Review my current code',
  ],
  AF1: [
    '💡 How does the sliding window algorithm work?',
    '🌐 How do I write the Express middleware with 429 status?',
    '🧹 How do I clean expired timestamps to avoid memory leaks?',
    '📋 Review my rate limiter implementation',
  ],
}

/**
 * Render basic markdown elements: headings, bold, bullet points, inline code, and code blocks
 * with "Copy" and "Apply to Editor" buttons.
 */
function FormattedAssistantMessage({
  content,
  onApplyCode,
}: {
  content: string
  onApplyCode?: (code: string) => void
}) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const [appliedIndex, setAppliedIndex] = useState<number | null>(null)

  const copyToClipboard = (text: string, idx: number) => {
    navigator.clipboard.writeText(text)
    setCopiedIndex(idx)
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  const applyCode = (text: string, idx: number) => {
    if (onApplyCode) {
      onApplyCode(text)
      setAppliedIndex(idx)
      setTimeout(() => setAppliedIndex(null), 2000)
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
                  {onApplyCode && (
                    <button
                      onClick={() => applyCode(part.text, pIdx)}
                      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[10px] shadow-sm transition active:scale-95"
                      title="Paste directly into your code editor"
                    >
                      {appliedIndex === pIdx ? (
                        <>
                          <Check className="w-3 h-3 text-white" />
                          <span>Applied!</span>
                        </>
                      ) : (
                        <>
                          <ArrowDownToLine className="w-3 h-3" />
                          <span>Apply to Editor</span>
                        </>
                      )}
                    </button>
                  )}
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
  onApplyCode,
  defaultExpanded = true,
}: AiExamAssistantProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [engine, setEngine] = useState<'deepseek' | 'heuristic' | null>(null)
  const [promptsUsed, setPromptsUsed] = useState(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const locked = promptsUsed >= MAX_PROMPTS
  const promptsLeft = Math.max(0, MAX_PROMPTS - promptsUsed)

  // Prompt budget: load the per-task count so the 5-prompt limit survives
  // navigation and page reloads — and deliberately NOT reset by "clear chat".
  useEffect(() => {
    try {
      const n = parseInt(localStorage.getItem(`calibiai_prompt_count_${taskId}`) || '0', 10)
      if (Number.isFinite(n)) setPromptsUsed(Math.max(0, Math.min(MAX_PROMPTS, n)))
    } catch {
      /* ignore */
    }
  }, [taskId])

  useEffect(() => {
    try {
      localStorage.setItem(`calibiai_prompt_count_${taskId}`, String(promptsUsed))
    } catch {
      /* ignore */
    }
  }, [promptsUsed, taskId])

  // Initialize greeting message per task
  useEffect(() => {
    const saved = localStorage.getItem(`calibiai_chat_${taskId}`)
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed)
          return
        }
      } catch {
        /* fallback to greeting */
      }
    }

    const greeting: ChatMsg = {
      id: 'greet_' + Date.now(),
      role: 'assistant',
      content: `👋 **Welcome to CalibiAI Assistant for ${taskTitle}!**\n\nBecause this is a proctored assessment, you are not permitted to switch browser tabs. I am provided here directly inside your exam so you can:\n- Ask for explanations of the bug or architecture.\n- Check edge cases and test harness requirements.\n- Request step-by-step guidance or code examples.\n- Have me review your draft solution before running tests.\n\n🔒 **Prompt limit:** you get exactly **${MAX_PROMPTS} prompts** for this task. Once they're used, I lock and you'll continue on your own — so make each question count and ask for your most valuable help first.\n\n*How can I help you tackle this task?*`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }
    setMessages([greeting])
  }, [taskId, taskTitle])

  // Persist messages per task
  useEffect(() => {
    if (messages.length > 0) {
      try {
        localStorage.setItem(`calibiai_chat_${taskId}`, JSON.stringify(messages))
      } catch {
        /* ignore */
      }
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
    const text = (textToSend || input).trim()
    if (!text || busy || locked) return

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
    // Consume one of the task's prompts the moment the candidate sends.
    setPromptsUsed((n) => Math.min(MAX_PROMPTS, n + 1))

    try {
      const res = await fetch('/api/ai/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId,
          taskTitle,
          taskPrompt,
          buggyOrSpec,
          currentCode,
          messages: updatedMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
      })

      const data = await res.json()
      if (data.ok && data.reply) {
        setEngine(data.engine)
        const assistantMsg: ChatMsg = {
          id: 'asst_' + Date.now(),
          role: 'assistant',
          content: data.reply,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        }
        setMessages((prev) => [...prev, assistantMsg])
      } else {
        const errorMsg: ChatMsg = {
          id: 'err_' + Date.now(),
          role: 'assistant',
          content:
            '⚠️ I encountered a temporary issue answering. Please try asking again or check your network connection.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        }
        setMessages((prev) => [...prev, errorMsg])
      }
    } catch {
      const errorMsg: ChatMsg = {
        id: 'err_' + Date.now(),
        role: 'assistant',
        content:
          '⚠️ Assistant offline. Please click one of the quick chips or try re-sending your question.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }
      setMessages((prev) => [...prev, errorMsg])
    } finally {
      setBusy(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleResetChat = () => {
    if (confirm('Clear chat history for this task?')) {
      localStorage.removeItem(`calibiai_chat_${taskId}`)
      const greeting: ChatMsg = {
        id: 'greet_' + Date.now(),
        role: 'assistant',
        content: `👋 **Chat reset.** What would you like help with regarding **${taskTitle}**?`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }
      setMessages([greeting])
    }
  }

  const suggestions = DEFAULT_SUGGESTIONS[taskId] || [
    '💡 Explain the problem approach',
    '🔍 What edge cases should I consider?',
    '🛠️ Show me a sample solution',
    '📋 Review my current code',
  ]

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
            title={locked ? 'Prompt limit reached for this task' : 'Prompts remaining for this task'}
          >
            {locked ? <Lock className="w-2.5 h-2.5" /> : null}
            {locked ? 'Locked' : `${promptsLeft} prompt${promptsLeft === 1 ? '' : 's'} left`}
          </span>
          {engine && (
            <span className="hidden sm:inline-flex px-2 py-0.5 rounded-md bg-white/10 text-[9.5px] font-mono text-indigo-200">
              {engine === 'deepseek' ? 'DeepSeek' : 'Heuristic Engine'}
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

          {/* Quick Suggestion Prompt Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
            <span className="text-[10px] font-bold text-indigo-900/70 shrink-0 uppercase tracking-wider flex items-center gap-1 mr-1">
              <Lightbulb className="w-3 h-3 text-amber-500" /> Suggested:
            </span>
            {suggestions.map((sug, i) => (
              <button
                key={i}
                disabled={busy || locked}
                onClick={() => handleSend(sug)}
                className="shrink-0 px-2.5 py-1 rounded-full bg-white/90 hover:bg-indigo-600 hover:text-white border border-indigo-200 text-slate-700 text-[11px] font-medium shadow-sm transition-all duration-200 hover:shadow disabled:opacity-50 active:scale-95"
              >
                {sug}
              </button>
            ))}
          </div>

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
                      <FormattedAssistantMessage content={msg.content} onApplyCode={onApplyCode} />
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
                  locked
                    ? 'Prompt limit reached — the assistant is locked for this task.'
                    : 'Ask about the bug, edge cases, syntax, or review your code… (Press Enter to send)'
                }
                rows={1}
                disabled={busy || locked}
                className="w-full resize-none bg-transparent px-3.5 py-2.5 text-xs text-slate-800 placeholder:text-slate-400 outline-none max-h-24 min-h-[40px]"
              />
              <button
                type="button"
                disabled={!input.trim() || busy || locked}
                onClick={() => handleSend()}
                className="m-1.5 p-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold transition hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                title={locked ? 'Prompt limit reached' : 'Send question'}
              >
                {locked ? <Lock className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
              </button>
            </div>
            <div className="flex items-center justify-between px-1 text-[10px] text-slate-400">
              <span className="flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full inline-block ${locked ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                {locked ? `Prompt limit reached — ${MAX_PROMPTS}/${MAX_PROMPTS} used` : `${promptsLeft} prompt${promptsLeft === 1 ? '' : 's'} left · context synced with editor`}
              </span>
              <span>{locked ? 'Assistant locked for this task' : 'Press Enter to send · Shift+Enter for new line'}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
