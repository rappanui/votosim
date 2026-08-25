import { IndiceSobre } from '@/components/sobre/IndiceSobre'

/**
 * Shared frame for /sobre and every /sobre/[secao]: the section index on the
 * left, the text on the right. Below md the index collapses above the text.
 */
export default function SobreLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <div className="flex flex-col gap-8 md:flex-row md:gap-12">
        <aside className="md:w-64 md:shrink-0">
          <IndiceSobre />
        </aside>

        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  )
}
