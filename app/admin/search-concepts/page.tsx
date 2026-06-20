import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { checkIsAdmin } from '@/lib/supabase/admin'
import { DEFAULT_SEARCH_CONFIG } from '@/lib/placeSearch'
import { fetchConcepts } from './actions'
import SearchConceptsAdmin from './SearchConceptsAdmin'

export const dynamic = 'force-dynamic'

export default async function SearchConceptsPage() {
  // Defense-in-depth (admin layout also gates) — never render config to non-admins.
  if (!(await checkIsAdmin())) redirect('/')

  const t = await getTranslations('searchConceptsAdmin')
  const { rows, tableMissing, error } = await fetchConcepts()

  // Built-in fallback facet keys — shown as "default" so an admin never thinks a
  // concept was deleted when it is still loaded from DEFAULT_SEARCH_CONFIG.
  const defaultFacetKeys = DEFAULT_SEARCH_CONFIG.facets.map((f) => f.key)

  return (
    <main className="max-w-[1240px] mx-auto px-4 sm:px-6 py-8 pb-20">
      <div className="mb-6">
        <a href="/admin" className="text-[13px] text-muted hover:text-rose transition-colors">← {t('back_to_admin')}</a>
        <h1 className="font-serif font-black text-[26px] sm:text-[30px] text-ink mt-2">{t('title')}</h1>
        <p className="text-[14px] text-muted mt-1 max-w-[680px]">{t('subtitle')}</p>
      </div>

      <SearchConceptsAdmin
        initialRows={rows}
        tableMissing={tableMissing}
        loadError={!!error}
        defaultFacetKeys={defaultFacetKeys}
        migrationPath="supabase/migration_search_concepts.sql"
      />
    </main>
  )
}
