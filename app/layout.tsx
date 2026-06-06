import type { Metadata } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import './globals.css'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import ScrollToTopButton from '@/components/ScrollToTopButton'
import AnalyticsTracker from '@/components/AnalyticsTracker'

const SITE_NAME = 'Chợ Cóc FKO'
const SITE_URL  = 'https://chococfko.com'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} · Cẩm nang Fukuoka của người Việt`,
    template: `%s · ${SITE_NAME}`,
  },
  description:
    'Cộng đồng người Việt tại Fukuoka — chia sẻ địa điểm ăn uống, biển, núi, công viên, quán Việt và những chuyến đi.',
  keywords: ['Fukuoka', 'người Việt', 'địa điểm', 'cộng đồng', 'ăn uống', 'du lịch', 'Nhật Bản'],
  authors: [{ name: 'Chợ Cóc FKO', url: SITE_URL }],
  creator: 'Chợ Cóc FKO',
  openGraph: {
    type:        'website',
    locale:      'vi_VN',
    url:         SITE_URL,
    siteName:    SITE_NAME,
    title:       `${SITE_NAME} · Cẩm nang Fukuoka của người Việt`,
    description: 'Cộng đồng người Việt tại Fukuoka — chia sẻ địa điểm ăn uống, biển, núi, công viên, quán Việt và những chuyến đi.',
    images: [
      {
        url:    '/og-image.png',
        width:  1200,
        height: 630,
        alt:    'Chợ Cóc FKO — Cẩm nang Fukuoka',
      },
    ],
  },
  twitter: {
    card:        'summary_large_image',
    title:       `${SITE_NAME} · Cẩm nang Fukuoka`,
    description: 'Cộng đồng người Việt tại Fukuoka — địa điểm ăn uống, biển, công viên, quán Việt.',
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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale   = await getLocale()
  const messages = await getMessages()

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
          <div className="flex flex-col min-h-screen">
            <Nav />
            <main className="flex-1">{children}</main>
            <Footer />
            <ScrollToTopButton />
            <AnalyticsTracker />
          </div>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
