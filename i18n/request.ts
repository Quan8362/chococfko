import { getRequestConfig } from 'next-intl/server'
import { cookies } from 'next/headers'

const LOCALES = ['vi', 'en', 'ja', 'ko', 'zh'] as const
type Locale = (typeof LOCALES)[number]
const DEFAULT_LOCALE: Locale = 'vi'

export default getRequestConfig(async () => {
  const raw = cookies().get('locale')?.value ?? ''
  const locale: Locale = (LOCALES as readonly string[]).includes(raw)
    ? (raw as Locale)
    : DEFAULT_LOCALE

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  }
})
