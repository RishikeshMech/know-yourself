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
        {/* Favicon: .ico (classic) + SVG (sharp) + PNG (retina/Apple). Next also
            auto-serves app/icon.png, so the tab icon is always present. */}
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" type="image/svg+xml" href="/icon.svg" />
        <link rel="apple-touch-icon" href="/icon-512.png" sizes="512x512" />
        {/* Inter is applied to every element (`* { font-family: Inter, … }`), so
            the webfont arriving late repaints the whole page — a visible flash
            on arrival. Start the TLS handshakes immediately so the stylesheet
            and the font files are on their way before the HTML finishes
            parsing, shrinking the fallback→Inter swap window. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
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
