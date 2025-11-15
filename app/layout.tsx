import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Document Chat Assistant',
  description: 'Upload documents and chat with AI to get answers',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

