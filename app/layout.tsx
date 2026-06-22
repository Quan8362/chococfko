import type { Metadata, Viewport } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages, getTranslations } from 'next-intl/server'
import './globals.css'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import ScrollToTopButton from '@/components/ScrollToTopButton'
import AnalyticsTracker from '@/components/AnalyticsTracker'
import { checkIsAdmin } from '@/lib/supabase/admin'
import MentionNotificationProvider from '@/components/MentionNotificationProvider'
import AdminNotificationPopup from '@/components/AdminNotificationPopup'
import NotificationPermissionBanner from '@/components/NotificationPermissionBanner'
import CommunityNotificationProvider from '@/components/CommunityNotificationProvider'
import ImageProtection from '@/components/ImageProtection'
import AuthSync from '@/components/AuthSync'
import SavedPlacesProvider from '@/components/SavedPlacesProvider'

// Run server functions in Tokyo (hnd1) — same region as the Supabase DB and
// closest to our Fukuoka users. Default was iad1 (US East), which forced every
// DB round-trip across the Pacific and dominated server render time.
export const preferredRegion = 'hnd1'

const SITE_NAME = 'Chợ Cóc FKO'
const SITE_URL  = 'https://chococfko.com'

// Tô vùng status bar / thanh địa chỉ Safari iOS bằng đúng màu cream của header,
// tránh tình trạng lộ nội dung trang chạy phía sau ở mép trên khi cuộn.
export const viewport: Viewport = {
  themeColor: '#faf4ea',
}

const OG_LOCALE: Record<string, string> = {
  vi: 'vi_VN', en: 'en_US', ja: 'ja_JP', ko: 'ko_KR', zh: 'zh_CN',
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale()
  const t = await getTranslations('meta')
  const tagline = `${SITE_NAME} · ${t('site_tagline')}`
  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: tagline,
      template: `%s · ${SITE_NAME}`,
    },
    description: t('site_description'),
    keywords: t('site_keywords').split(',').map(k => k.trim()),
    authors: [{ name: SITE_NAME, url: SITE_URL }],
    creator: SITE_NAME,
    openGraph: {
      type:        'website',
      locale:      OG_LOCALE[locale] ?? 'vi_VN',
      url:         SITE_URL,
      siteName:    SITE_NAME,
      title:       tagline,
      description: t('site_description'),
      images: [
        {
          url:    '/og-image.png',
          width:  1200,
          height: 630,
          alt:    t('site_og_image_alt'),
        },
      ],
    },
    twitter: {
      card:        'summary_large_image',
      title:       `${SITE_NAME} · ${t('site_tagline_short')}`,
      description: t('site_twitter_description'),
      images:      ['/og-image.png'],
    },
    robots: {
      index:       true,
      follow:      true,
      googleBot:   { index: true, follow: true, 'max-image-preview': 'large' },
    },
    alternates: {
      canonical: SITE_URL,
    },
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale   = await getLocale()
  const messages = await getMessages()
  const isAdmin  = await checkIsAdmin()

  return (
    <html lang={locale}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;0,900;1,400;1,600&family=Be+Vietnam+Pro:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans leading-relaxed">
        <NextIntlClientProvider messages={messages}>
          <SavedPlacesProvider>
          <div className="flex flex-col min-h-screen">
            <AuthSync />
            <Nav />
            <main className="flex-1">{children}</main>
            <Footer />
            <ScrollToTopButton />
            <ImageProtection />
            <AnalyticsTracker isAdmin={isAdmin} />
            <MentionNotificationProvider />
            <CommunityNotificationProvider />
            <AdminNotificationPopup />
            <NotificationPermissionBanner />
          </div>
          </SavedPlacesProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
