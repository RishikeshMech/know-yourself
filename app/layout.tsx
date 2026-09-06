import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'CalibiAI Score — Your verified employability score',
  description: 'One 1000-point CalibiAI Score: communication, problem solving, AI skills and cognition — assessed and verified.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen text-slate-800 antialiased">
        {/* Animated ambient blobs behind the frosted glass */}
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          <div className="blob-a absolute -top-24 -left-24 h-[26rem] w-[26rem] rounded-full bg-indigo-300/40 blur-3xl" />
          <div className="blob-b absolute top-1/3 -right-28 h-[28rem] w-[28rem] rounded-full bg-fuchsia-300/30 blur-3xl" />
          <div className="blob-a absolute bottom-0 left-1/3 h-[22rem] w-[22rem] rounded-full bg-sky-300/30 blur-3xl" />
        </div>
        {children}
      </body>
    </html>
  )
}
