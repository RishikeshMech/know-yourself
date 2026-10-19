import './globals.css'
import type { Metadata } from 'next'
import { StoreProvider } from '@/lib/store'
import { ThemeProvider } from '@/components/ThemeProvider'
import CookieConsent from '@/components/CookieConsent'

export const metadata: Metadata = {
  title: 'Calibi Score — Your verified employability score',
  description: 'One 1000-point Calibi Score: communication, problem solving, AI skills and cognition — assessed and verified.',
  icons: {
    icon: [
      { url: '/logo.png', type: 'image/png' },
      { url: '/favicon.ico?v=3', sizes: 'any' },
    ],
    apple: [
      { url: '/logo.png', sizes: '96x96' },
    ],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen text-slate-800 dark:text-slate-100 antialiased transition-colors duration-300">
        {/* Anti-flash script to apply dark theme immediately before first paint */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var t = localStorage.getItem('calibi_theme');
                if (t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                  document.documentElement.classList.add('dark');
                } else {
                  document.documentElement.classList.remove('dark');
                }
              } catch (_) {}
            `,
          }}
        />
        {/* Animated ambient blobs behind the frosted glass */}
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          <div className="blob-a absolute -top-24 -left-24 h-[26rem] w-[26rem] rounded-full bg-indigo-300/40 dark:bg-indigo-600/20 blur-3xl" />
          <div className="blob-b absolute top-1/3 -right-28 h-[28rem] w-[28rem] rounded-full bg-fuchsia-300/30 dark:bg-purple-600/15 blur-3xl" />
          <div className="blob-a absolute bottom-0 left-1/3 h-[22rem] w-[22rem] rounded-full bg-sky-300/30 dark:bg-sky-600/15 blur-3xl" />
        </div>
        <ThemeProvider>
          <StoreProvider>
            {children}
            <CookieConsent />
          </StoreProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
