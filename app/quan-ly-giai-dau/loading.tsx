import { getTranslations } from 'next-intl/server'
import TournamentShell from '@/components/tournaments/TournamentShell'

export default async function ManagementListLoading() {
  const t = await getTranslations('tournament_management')

  return (
    <TournamentShell size="wide">
      <div role="status" aria-busy="true" aria-label={t('loading_label')} className="animate-pulse">
        <div className="mb-7 flex items-center justify-between gap-5">
          <div className="flex items-center gap-3.5">
            <div className="h-12 w-12 rounded-2xl bg-rose-soft" />
            <div>
              <div className="h-8 w-52 rounded-lg bg-line/75" />
              <div className="mt-2 h-4 w-64 max-w-[60vw] rounded bg-line/55" />
            </div>
          </div>
          <div className="hidden h-11 w-36 rounded-xl bg-rose/20 sm:block" />
        </div>

        <div className="mb-5 grid grid-cols-1 gap-3 rounded-2xl border border-line bg-paper p-4 sm:grid-cols-2 lg:grid-cols-[minmax(280px,1fr)_190px_240px_110px]">
          <div className="h-11 rounded-xl bg-cream sm:col-span-2 lg:col-span-1" />
          <div className="h-11 rounded-xl bg-cream" />
          <div className="h-11 rounded-xl bg-cream" />
          <div className="h-11 rounded-xl bg-cream" />
        </div>

        <div className="space-y-3.5">
          {[0, 1, 2].map((item) => (
            <div key={item} className="rounded-2xl border border-line bg-paper p-5 sm:p-6">
              <div className="h-6 w-28 rounded-full bg-line/60" />
              <div className="mt-4 h-6 w-72 max-w-[70vw] rounded bg-line/75" />
              <div className="mt-2 h-4 w-40 rounded bg-line/50" />
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[0, 1, 2, 3].map((meta) => <div key={meta} className="h-8 rounded-lg bg-cream" />)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </TournamentShell>
  )
}
