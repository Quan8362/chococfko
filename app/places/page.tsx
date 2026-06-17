import type { Metadata } from "next";
import { getTranslations, getLocale } from "next-intl/server";
import { getAllPlacesFromDb, places as staticPlaces } from "@/lib/places";
import { SITE_URL, SITE_NAME, DEFAULT_OG_IMAGE, OG_LOCALE, breadcrumbJsonLd, jsonLdString } from "@/lib/seo";
import PlaceCard from "@/components/PlaceCard";

export const dynamic = "force-dynamic";

const CANONICAL = `${SITE_URL}/places`;

export async function generateMetadata(): Promise<Metadata> {
  const [t, locale] = await Promise.all([getTranslations("meta"), getLocale()]);
  const title = t("places");
  const description = t("places_description");
  return {
    title,
    description,
    keywords: t("places_keywords").split(",").map((k) => k.trim()).filter(Boolean),
    alternates: { canonical: CANONICAL },
    openGraph: {
      type: "website",
      url: CANONICAL,
      locale: OG_LOCALE[locale] ?? "vi_VN",
      siteName: SITE_NAME,
      title: `${title} · ${SITE_NAME}`,
      description,
      images: [{ url: DEFAULT_OG_IMAGE }],
    },
    twitter: { card: "summary_large_image", title: `${title} · ${SITE_NAME}`, description, images: [DEFAULT_OG_IMAGE] },
  };
}

export default async function PlacesPage() {
  const [t, locale] = await Promise.all([getTranslations("meta"), getLocale()]);
  const list = (await getAllPlacesFromDb(locale)) ?? staticPlaces;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${CANONICAL}#page`,
        url: CANONICAL,
        name: `${t("places")} · ${SITE_NAME}`,
        description: t("places_description"),
        isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: list.length,
          itemListElement: list.slice(0, 100).map((p, i) => ({
            "@type": "ListItem",
            position: i + 1,
            url: `${SITE_URL}/places/${p.slug}`,
            name: p.name,
          })),
        },
      },
      breadcrumbJsonLd([
        { name: SITE_NAME, path: "/" },
        { name: t("places"), path: "/places" },
      ]),
    ],
  };

  return (
    <div className="max-w-[1240px] mx-auto px-6 py-10 pb-20">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />

      <header className="mb-8">
        <h1 className="font-serif font-bold text-[clamp(26px,4vw,40px)] leading-tight tracking-[-0.4px] text-ink mb-3">
          {t("places")}
        </h1>
        <p className="text-[15px] text-muted max-w-[640px] leading-relaxed">{t("places_description")}</p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {list.map((place) => (
          <PlaceCard key={place.slug} place={place} />
        ))}
      </div>
    </div>
  );
}
