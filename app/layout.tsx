import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Calibiai Score — Global Employability Standard',
  description: 'The credit score for employability. 1000-point unified readiness score.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen bg-navy-900 text-white antialiased">
        {children}
      </body>
    </html>
  )
}
