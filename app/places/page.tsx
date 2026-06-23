import type { Metadata } from "next";
import { getTranslations, getLocale } from "next-intl/server";
import {
  getAllPlacesFromDb,
  places as staticPlaces,
  attachPlaceTags,
  attachCommunityActivity,
  categories,
  categoryEmoji,
} from "@/lib/places";
import { loadSearchConfig } from "@/lib/searchConcepts";
import { getPopularSearches } from "@/lib/searchInsights";
import { prefectureName } from "@/lib/japan";
import { decodeFilters, type ExploreFilters } from "@/lib/exploreParams";
import { SITE_URL, SITE_NAME, DEFAULT_OG_IMAGE, OG_LOCALE, breadcrumbJsonLd, jsonLdString } from "@/lib/seo";
import PlaceCard from "@/components/PlaceCard";
import PlacesExplorer from "@/components/places/PlacesExplorer";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | undefined>;

function validCategory(code: string | undefined): string | null {
  return code && categories.some((c) => c.code === code) ? code : null;
}

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
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
  const [t, tc, locale] = await Promise.all([
    getTranslations("meta"),
    getTranslations("categories"),
    getLocale(),
  ]);

  const base = (await getAllPlacesFromDb(locale)) ?? staticPlaces;
  const withTags = await attachPlaceTags(base);
  const [all, searchConfig, popular] = await Promise.all([
    attachCommunityActivity(withTags),
    loadSearchConfig(),
    getPopularSearches(8),
  ]);

  // Localized category list + prefectures that actually have places.
  const cats = categories.map((c) => ({ code: c.code, label: `${categoryEmoji[c.code] ?? ""} ${tc(c.code as Parameters<typeof tc>[0])}`.trim() }));
  const prefCounts = new Map<string, number>();
  for (const p of all) {
    const code = p.prefecture ?? "fukuoka";
    prefCounts.set(code, (prefCounts.get(code) ?? 0) + 1);
  }
  const prefectures = Array.from(prefCounts.entries())
    .map(([code, count]) => ({ code, name: `${prefectureName(code)} (${count})` }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Pre-render PlaceCard server nodes (PlaceCard is async) so the client explorer
  // can pick the matching ones without re-fetching (same pattern as the homepage).
  const cards: Record<string, React.ReactNode> = Object.fromEntries(
    all.map((p) => [p.slug, <PlaceCard key={p.slug} place={p} showCategoryBadge />]),
  );

  // Initial filter state from the URL (?category=, ?q=, ...).
  const initial: ExploreFilters = decodeFilters((k) => searchParams[k] ?? null);

  const canonical = `${SITE_URL}/places`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${canonical}#page`,
        url: canonical,
        name: `${t("places")} · ${SITE_NAME}`,
        description: t("places_description"),
        isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
      },
      breadcrumbJsonLd([
        { name: SITE_NAME, path: "/" },
        { name: t("places"), path: "/places" },
      ]),
    ],
  };

  return (
    <div className="max-w-[1240px] mx-auto px-5 sm:px-6 py-6 sm:py-10 pb-20">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />
      <header className="mb-5 sm:mb-7 max-w-[680px]">
        <h1 className="font-serif font-bold text-[clamp(24px,4vw,40px)] leading-tight tracking-[-0.4px] text-ink mb-2 sm:mb-2.5">
          {t("places")}
        </h1>
        <p className="text-[14px] sm:text-[15px] text-muted leading-relaxed text-pretty">{t("places_description")}</p>
      </header>

      <PlacesExplorer
        places={all}
        cards={cards}
        categories={cats}
        prefectures={prefectures}
        searchConfig={searchConfig}
        popular={popular}
        initial={initial}
        locale={locale}
      />
    </div>
  );
}
