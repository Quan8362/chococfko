import { getTranslations } from 'next-intl/server'
import TagList, { type TagChip } from './TagList'

/**
 * "Popular tags" block. Server component — pass already-fetched tags
 * (e.g. from getPopularTags). Renders nothing when there are no tags.
 */
export default async function PopularTags({
  tags,
  title,
}: {
  tags: TagChip[]
  title?: string
}) {
  if (!tags || tags.length === 0) return null
  const t = await getTranslations('tags')
  return (
    <section className="bg-paper border border-line rounded-2xl p-5">
      <h3 className="font-semibold text-[14px] text-ink mb-3">{title ?? t('popular')}</h3>
      <TagList tags={tags} />
    </section>
  )
}
