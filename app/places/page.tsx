import type { Metadata } from "next";
import { getTranslations, getLocale } from "next-intl/server";
import {
  getAllPlacesFromDb,
  places as staticPlaces,
  attachPlaceTags,
  categories,
  categoryEmoji,
} from "@/lib/places";
import { SITE_URL, SITE_NAME, DEFAULT_OG_IMAGE, OG_LOCALE, breadcrumbJsonLd, jsonLdString } from "@/lib/seo";
import PlaceCard from "@/components/PlaceCard";
import LoadMoreGrid from "@/components/LoadMoreGrid";

export const dynamic = "force-dynamic";

type SearchParams = { category?: string; prefecture?: string };

// Normalize ?category= to a known category code (or null for "all places").
function validCategory(code: string | undefined): string | null {
  return code && categories.some((c) => c.code === code) ? code : null;
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const [t, tc, locale] = await Promise.all([
    getTranslations("meta"),
    getTranslations("categories"),
    getLocale(),
  ]);
  const cat = validCategory(searchParams.category);
  const title = cat ? tc(`${cat}_full` as Parameters<typeof tc>[0]) : t("places");
  const description = t("places_description");
  const canonical = cat ? `${SITE_URL}/places?category=${cat}` : `${SITE_URL}/places`;
  return {
    title,
    description,
    keywords: t("places_keywords").split(",").map((k) => k.trim()).filter(Boolean),
    alternates: { canonical },
    openGraph: {
      type: "website",
      url: canonical,
      locale: OG_LOCALE[locale] ?? "vi_VN",
      siteName: SITE_NAME,
      title: `${title} · ${SITE_NAME}`,
      description,
      images: [{ url: DEFAULT_OG_IMAGE }],
    },
    twitter: { card: "summary_large_image", title: `${title} · ${SITE_NAME}`, description, images: [DEFAULT_OG_IMAGE] },
  };
}

export default async function PlacesPage({ searchParams }: { searchParams: SearchParams }) {
  const [t, tc, th, locale] = await Promise.all([
    getTranslations("meta"),
    getTranslations("categories"),
    getTranslations("home"),
    getLocale(),
  ]);

  const all = await attachPlaceTags((await getAllPlacesFromDb(locale)) ?? staticPlaces);

  const cat = validCategory(searchParams.category);
  const pref = searchParams.prefecture || null;
  // Filter at the data level so the page only renders the relevant cards.
  let list = all;
  if (cat) list = list.filter((p) => p.category === cat);
  if (pref) list = list.filter((p) => (p.prefecture ?? "fukuoka") === pref);

  const heading = cat ? tc(`${cat}_full` as Parameters<typeof tc>[0]) : t("places");
  const emoji = cat ? categoryEmoji[cat] : null;
  const canonical = cat ? `${SITE_URL}/places?category=${cat}` : `${SITE_URL}/places`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${canonical}#page`,
        url: canonical,
        name: `${heading} · ${SITE_NAME}`,
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
      breadcrumbJsonLd(
        cat
          ? [
              { name: SITE_NAME, path: "/" },
              { name: t("places"), path: "/places" },
              { name: heading, path: `/places?category=${cat}` },
            ]
          : [
              { name: SITE_NAME, path: "/" },
              { name: t("places"), path: "/places" },
            ],
      ),
    ],
  };

  return (
    <div className="max-w-[1240px] mx-auto px-6 py-10 pb-20">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />

      <header className="mb-8">
        <div className="flex items-center gap-3.5 mb-3">
          {emoji && (
            <span className="w-11 h-11 flex-none rounded-xl bg-rose/10 text-[22px] grid place-items-center border border-rose/15" aria-hidden="true">
              {emoji}
            </span>
          )}
          <h1 className="font-serif font-bold text-[clamp(26px,4vw,40px)] leading-tight tracking-[-0.4px] text-ink">
            {heading}
          </h1>
        </div>
        <p className="text-[15px] text-muted max-w-[640px] leading-relaxed">
          {cat ? th("category_count", { count: list.length }) : t("places_description")}
        </p>
      </header>

      {list.length === 0 ? (
        <div className="bg-paper border border-line rounded-2xl p-10 text-center">
          <p className="text-muted text-[15px]">{th("search_empty")}</p>
        </div>
      ) : (
        <LoadMoreGrid cards={list.map((place) => <PlaceCard key={place.slug} place={place} showCategoryBadge={!cat} />)} />
      )}
    </div>
  );
}
