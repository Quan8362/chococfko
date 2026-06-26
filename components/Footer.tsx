import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { MailIcon, ChatIcon, FeedbackIcon } from '@/components/icons/CommunityIcons'

const LINK_CLS =
  'text-[13.5px] text-white/60 hover:text-white transition-colors duration-150 leading-snug'

const SOCIAL_CLS =
  'grid place-items-center w-9 h-9 rounded-full border border-white/15 text-white/70 hover:text-white hover:border-white/40 hover:bg-white/[0.06] transition-colors duration-150'

export default async function Footer() {
  const t = await getTranslations('footer')

  return (
    <footer id="footer" className="bg-ink">
      {/* ── Main content ───────────────────────────────────── */}
      <div className="max-w-[1200px] mx-auto px-6 pt-14 pb-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr] gap-10 lg:gap-8">

          {/* ── Brand ──────────────────────────────────────── */}
          <div>
            <div className="mb-5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo-footer.png"
                alt="Chợ Cóc FKO"
                className="h-10 w-auto max-w-[200px] object-contain opacity-95"
              />
            </div>
            <p className="font-serif italic text-[15.5px] text-white/70 leading-[1.75] max-w-[240px]">
              {t('tagline')}
            </p>

            {/* Connect / social row */}
            <div className="flex items-center gap-2.5 mt-6">
              <a href="mailto:chococfko@gmail.com" aria-label={t('email')} className={SOCIAL_CLS}>
                <MailIcon className="h-[18px] w-[18px]" />
              </a>
              <Link href="/community/chat" aria-label={t('community_chat')} className={SOCIAL_CLS}>
                <ChatIcon className="h-[18px] w-[18px]" />
              </Link>
              <Link href="/feedback" aria-label={t('feedback')} className={SOCIAL_CLS}>
                <FeedbackIcon className="h-[18px] w-[18px]" />
              </Link>
            </div>
          </div>

          {/* ── Khám phá ───────────────────────────────────── */}
          <div>
            <h4 className="text-[10.5px] tracking-[2.5px] uppercase font-semibold mb-4 text-gold/70">
              {t('col_explore')}
            </h4>
            <ul className="space-y-3">
              <li>
                <Link href="/places" className={LINK_CLS}>
                  {t('all_places')}
                </Link>
              </li>
              <li>
                <Link href="/#categories" className={LINK_CLS}>
                  {t('place_categories')}
                </Link>
              </li>
              <li>
                <Link href="/map" className={LINK_CLS}>
                  {t('map')}
                </Link>
              </li>
              <li>
                <Link href="/about" className={LINK_CLS}>
                  {t('about')}
                </Link>
              </li>
            </ul>
          </div>

          {/* ── Cộng đồng ──────────────────────────────────── */}
          <div>
            <h4 className="text-[10.5px] tracking-[2.5px] uppercase font-semibold mb-4 text-gold/70">
              {t('col_community')}
            </h4>
            <ul className="space-y-3">
              <li>
                <Link href="/community" className={LINK_CLS}>
                  {t('posts')}
                </Link>
              </li>
              <li>
                <Link href="/community/write" className={LINK_CLS}>
                  {t('write')}
                </Link>
              </li>
              <li>
                <Link href="/posting-guide" className={LINK_CLS}>
                  {t('guide')}
                </Link>
              </li>
              <li>
                <Link href="/games/destination-wheel" className={LINK_CLS}>
                  {t('destination_wheel')}
                </Link>
              </li>
            </ul>
          </div>

          {/* ── Hỗ trợ ─────────────────────────────────────── */}
          <div>
            <h4 className="text-[10.5px] tracking-[2.5px] uppercase font-semibold mb-4 text-gold/70">
              {t('col_support')}
            </h4>
            <ul className="space-y-3">
              <li>
                <Link href="/feedback" className={LINK_CLS}>
                  {t('feedback')}
                </Link>
              </li>
              <li>
                <Link href="/contact" className={LINK_CLS}>
                  {t('contact')}
                </Link>
              </li>
              <li>
                <Link href="/privacy-policy" className={LINK_CLS}>
                  {t('policy')}
                </Link>
              </li>
              <li>
                <Link href="/delete-data" className={LINK_CLS}>
                  {t('delete_data')}
                </Link>
              </li>
            </ul>
          </div>

        </div>
      </div>

      {/* ── Copyright ──────────────────────────────────────── */}
      <div className="border-t border-white/[0.06]">
        <div className="max-w-[1200px] mx-auto px-6 py-5 text-center">
          <p className="text-[12px] text-white/50 tracking-[0.3px]">
            {t('copyright')} · chococfko.com
          </p>
        </div>
      </div>
    </footer>
  )
}
