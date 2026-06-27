import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { QuizProvider } from '@/context/QuizContext'
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'VotoSim',
  description: 'Descubra quais candidatos pensam como você nas eleições 2026.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={`${inter.className} flex min-h-screen flex-col bg-white text-gray-900`}>
        <QuizProvider>
          <Header />
          <main className="mt-16 flex flex-1 flex-col">{children}</main>
          <Footer />
        </QuizProvider>
      </body>
    </html>
  )
}
