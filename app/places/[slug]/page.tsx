import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations, getLocale } from "next-intl/server";
import { proxyStorageImages } from "@/lib/imageProxy";
import { getPlace, places, getAllPlacesFromDb, getPlaceFromDb, getPlaceComments, getPlaceRating, attachPlaceTags, formatArea, type Place } from "@/lib/places";
import { checkIsAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { stripHtml } from "@/lib/sanitize";
import { SITE_URL, SITE_NAME, DEFAULT_OG_IMAGE, OG_LOCALE, breadcrumbJsonLd, jsonLdString } from "@/lib/seo";
import SmartImg from "@/components/SmartImg";
import StarsDisplay from "@/components/marketplace/StarsDisplay";
import PlaceCard from "@/components/PlaceCard";
import PlaceActions from "@/components/places/PlaceActions";
import PlaceVisitInfo from "@/components/places/PlaceVisitInfo";
import PlacePhrases from "@/components/places/PlacePhrases";
import PlaceActionBar from "@/components/places/PlaceActionBar";
import PlaceSaveShare from "@/components/places/PlaceSaveShare";
import AddToCollection from "@/components/places/AddToCollection";
import RecentViewRecorder from "@/components/places/RecentViewRecorder";
import PlaceQuestions from "@/components/places/PlaceQuestions";
import PlaceReport from "@/components/places/PlaceReport";
import VisitedButton from "@/components/places/VisitedButton";
import { getPlaceQuestions, getVisitInfo } from "../qa-actions";
import TagList from "@/components/tags/TagList";
import { getTagsForContent, type Tag } from "@/lib/tags";
import { openStatus } from "@/lib/placeOpenNow";
import { phrasesForCategory } from "@/lib/japanesePhrases";
import { availableActions, directionsUrl, telHref } from "@/lib/placeActions";
import PlaceRating from "./PlaceRating";
import PlaceComments from "./PlaceComments";

// Hero open-status badge colors per state (hours_unknown is hidden).
const OPEN_BADGE: Record<string, string> = {
  open: "bg-[#e7f6e0] text-[#3f8f1f]",
  closing_soon: "bg-[#fbeee0] text-[#a8671d]",
  closed: "bg-[rgba(255,253,248,0.94)] text-[#6b5d54]",
  opens_later: "bg-[#e8f3f6] text-teal",
  temporarily_closed: "bg-[#fbe0e0] text-[#a8261d]",
  hours_unknown: "",
};

async function getPlaceTagsBySlug(slug: string): Promise<Tag[]> {
  try {
    const supabase = createClient();
    const { data } = await supabase.from("places").select("id").eq("slug", slug).maybeSingle();
    const id = (data as { id: string } | null)?.id;
    if (!id) return [];
    return await getTagsForContent(supabase, "place", id);
  } catch {
    return [];
  }
}

async function getCurrentUser() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const name = (user.user_metadata?.display_name as string) || user.email?.split("@")[0] || "?";
    const { data: profile } = await supabase.from("profiles").select("avatar_url").eq("id", user.id).single();
    return { id: user.id, initial: name[0]?.toUpperCase() ?? "?", name, avatar: profile?.avatar_url ?? null };
  } catch {
    return null;
  }
}

export const dynamic = "force-dynamic";

const CAT_EMOJI: Record<string, string> = {
  landmark: "🏯", food: "🍜", sea: "🏖️", camp: "⛺",
  mountain: "⛰️", park: "🌳", viet: "🥢", grocery: "🛒", izakaya: "🍺",
  japanese: "🍣", thai: "🌶️", chinese: "🥡", korean: "🥩",
  cafe_milk_tea: "☕",
  kids_playground: "🎠",
  onsen: "♨️",
};

// schema.org type per place category (falls back to LocalBusiness).
const PLACE_SCHEMA_TYPE: Record<string, string> = {
  food: "Restaurant", viet: "Restaurant", izakaya: "Restaurant", japanese: "Restaurant",
  thai: "Restaurant", chinese: "Restaurant", korean: "Restaurant",
  cafe_milk_tea: "CafeOrCoffeeShop",
  park: "Park",
  landmark: "TouristAttraction", sea: "TouristAttraction", camp: "TouristAttraction",
  mountain: "TouristAttraction", onsen: "TouristAttraction", kids_playground: "TouristAttraction",
  grocery: "GroceryStore",
};

function placeDescription(p: Place): string {
  const raw = (p.body ? stripHtml(p.body) : "") || p.desc || "";
  return raw.length > 200 ? `${raw.slice(0, 197).trimEnd()}…` : raw;
}

function placeImage(p: Place): string {
  const src = p.img || p.imgFallback || "";
  return /^https?:\/\//i.test(src) ? src : DEFAULT_OG_IMAGE;
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const locale = await getLocale();
  const p = (await getPlaceFromDb(params.slug, locale)) ?? getPlace(params.slug);
  if (!p) return { title: SITE_NAME, robots: { index: false, follow: true } };

  const canonical = `${SITE_URL}/places/${p.slug}`;
  const description = placeDescription(p) || `${p.name} — ${p.area}`;
  const image = placeImage(p);
  const tagNames = (await getPlaceTagsBySlug(p.slug)).map((tag) => tag.name);
  const keywords = [p.name, p.categoryLabel, p.area, p.city, p.prefecture, ...tagNames, "Nhật Bản"]
    .filter(Boolean) as string[];

  return {
    title: p.name,
    description,
    keywords,
    alternates: { canonical },
    openGraph: {
      type: "article",
      url: canonical,
      locale: OG_LOCALE[locale] ?? "vi_VN",
      siteName: SITE_NAME,
      title: `${p.name} · ${SITE_NAME}`,
      description,
      images: [{ url: image }],
    },
    twitter: { card: "summary_large_image", title: `${p.name} · ${SITE_NAME}`, description, images: [image] },
  };
}

export default async function PlaceDetail({ params }: { params: { slug: string } }) {
  const locale = await getLocale()
  const currentUser = await getCurrentUser();
  const [dbPlace, isAdmin, dbAllPlaces, comments, rating, tags, questions, visitInfo] = await Promise.all([
    getPlaceFromDb(params.slug, locale),
    checkIsAdmin(),
    getAllPlacesFromDb(locale),
    getPlaceComments(params.slug),
    getPlaceRating(params.slug, currentUser?.id),
    getPlaceTagsBySlug(params.slug),
    getPlaceQuestions(params.slug),
    getVisitInfo(params.slug),
  ]);

  const place = dbPlace ?? getPlace(params.slug);
  if (!place) notFound();

  const t = await getTranslations("common");
  const tCat = await getTranslations("categories");
  const tMeta = await getTranslations("meta");
  const tp = await getTranslations("place_fields");
  const tmap = await getTranslations("map_explore");
  const td = await getTranslations("place_detail");

  const displayArea = formatArea(place, (k, v) => t(k as never, v as never));
  const displayCategory = tCat(place.category as Parameters<typeof tCat>[0]);

  // Open-now status (Asia/Tokyo) for the hero badge.
  const openState = openStatus(place.openingHours, place.closedDays, { temporaryStatus: place.temporaryStatus });

  // Action availability + targets (never render an action without a valid target).
  const acts = availableActions(place);
  const shareUrl = `${SITE_URL}/places/${place.slug}`;
  const dirUrl = directionsUrl(place);
  const tel = telHref(place);

  // Useful Japanese: per-place (admin) + category templates, de-duplicated by ja.
  const phraseSeen = new Set<string>();
  const phrases = [
    ...(place.japanesePhrases ?? []),
    ...phrasesForCategory(place.category).map((p) => ({ ja: p.ja, romaji: p.romaji, vi: p.vi })),
  ].filter((p) => (p.ja && !phraseSeen.has(p.ja) ? (phraseSeen.add(p.ja), true) : false));

  const allPlaces = dbAllPlaces ?? places;
  const related = await attachPlaceTags(
    allPlaces
      .filter((x) => x.category === place.category && x.slug !== place.slug)
      .slice(0, 3),
  );

  const canonical = `${SITE_URL}/places/${place.slug}`;
  const hasGeo = typeof place.lat === "number" && typeof place.lng === "number";
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": PLACE_SCHEMA_TYPE[place.category] ?? "LocalBusiness",
        "@id": `${canonical}#place`,
        name: place.name,
        description: placeDescription(place) || undefined,
        url: canonical,
        image: placeImage(place),
        address: {
          "@type": "PostalAddress",
          addressLocality: place.city || place.area || undefined,
          addressRegion: place.prefecture || undefined,
          addressCountry: "JP",
        },
        geo: hasGeo ? { "@type": "GeoCoordinates", latitude: place.lat, longitude: place.lng } : undefined,
        hasMap: place.mapUrl || undefined,
      },
      breadcrumbJsonLd([
        { name: SITE_NAME, path: "/" },
        { name: tMeta("places"), path: "/places" },
        { name: place.name, path: `/places/${place.slug}` },
      ]),
    ],
  };

  return (
    <article className="pb-28 lg:pb-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />
      <RecentViewRecorder slug={place.slug} />
      {/* ── HERO ─────────────────────────────────────────────── */}
      <div className="relative h-[45vh] min-h-[340px] max-h-[540px] overflow-hidden bg-gradient-to-br from-[#f3e1d2] to-[#e9cdb6]">
        <SmartImg
          src={place.img.replace("/680/460/", "/1400/900/")}
          fallback={place.imgFallback.replace("/680/460", "/1400/900")}
          alt={place.name}
          className="w-full h-full object-cover"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[rgba(36,26,23,0.82)] via-[rgba(36,26,23,0.18)] to-transparent" />
        <div className="absolute inset-x-0 bottom-0">
          <div className="max-w-[1100px] mx-auto px-6 pb-8">
            <Link href="/" className="inline-flex items-center gap-1.5 text-white/80 text-[13px] mb-3 hover:text-white transition-colors">
              {t("back_home")}
            </Link>
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="bg-[rgba(255,253,248,0.94)] text-rose-deep text-[11.5px] font-bold tracking-[0.4px] px-3 py-[5px] rounded-full">
                {CAT_EMOJI[place.category]} {displayCategory}
              </span>
              {place.fee === "free" && (
                <span className="text-[11.5px] font-bold px-3 py-[5px] rounded-full bg-[#e7f6e0] text-[#3f8f1f]">{t("fee_free")}</span>
              )}
              {openState !== "hours_unknown" && (
                <span className={`text-[11.5px] font-bold px-3 py-[5px] rounded-full ${OPEN_BADGE[openState]}`}>
                  {tmap(`state_${openState}` as "state_open")}
                </span>
              )}
              {place.fee === "paid" && (
                <span className="text-[11.5px] font-bold px-3 py-[5px] rounded-full bg-[#fbeee0] text-[#a8671d]">{t("fee_paid")}</span>
              )}
              <span className="text-white/85 text-[13px] font-semibold tracking-[0.4px]">📍 {displayArea}</span>
              {rating.count > 0 && (
                <span className="inline-flex items-center gap-1.5 bg-[rgba(255,253,248,0.94)] text-[#a8671d] text-[11.5px] font-bold px-3 py-[5px] rounded-full">
                  <StarsDisplay value={rating.average} className="w-3 h-3" />
                  {rating.average.toFixed(1)} · {t("rating_count", { count: rating.count })}
                </span>
              )}
            </div>
            <h1 className="font-serif font-black text-white text-[clamp(28px,5vw,52px)] leading-[1.06] tracking-[-1px] drop-shadow">
              {place.name}
            </h1>
          </div>
        </div>
      </div>

      {/* Temporary closure banner */}
      {(place.temporaryStatus === "temporarily_closed" || place.temporaryStatus === "permanently_closed") && (
        <div className="max-w-[1100px] mx-auto px-6 mt-6">
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-[13.5px] font-semibold text-amber-800">
            ⚠️ {place.temporaryStatus === "permanently_closed" ? tp("pub_perm_closed") : tp("pub_temp_closed")}
          </div>
        </div>
      )}

      {/* ── BODY — 2-column desktop. DOM order intro → rail → body so the rail
            (with the visit-info card) sits right under the intro on mobile;
            grid placement restores intro/body in col 1 and the rail in col 2. */}
      <div className="max-w-[1100px] mx-auto px-6 mt-10 grid lg:grid-cols-[1fr_268px] gap-x-10 gap-y-8 items-start">

        {/* ── INTRO — short description (col 1, row 1) ───────── */}
        <div className="min-w-0 order-1 lg:order-none lg:col-start-1 lg:row-start-1">
          <p className="font-serif text-[20px] leading-[1.6] text-[#3a2d22]">
            {place.desc}
          </p>
        </div>

        {/* ── LEFT — main content (col 1, row 2). order-3 on mobile so the
              rail (order-2) reflows between the intro and the article body. */}
        <div className="min-w-0 order-3 lg:order-none lg:col-start-1 lg:row-start-2">
          {/* Rich text body */}
          {place.body ? (
            <div
              className="rich-content text-[#3a2d22] mb-8"
              dangerouslySetInnerHTML={{ __html: proxyStorageImages(place.body) }}
            />
          ) : isAdmin ? (
            <p className="text-[14px] text-muted mb-8 flex items-center gap-2">
              {t("no_desc")}
              {" "}
              <Link href={`/admin/places/${place.slug}`} className="text-rose font-semibold hover:underline">
                {t("add_desc")}
              </Link>
            </p>
          ) : null}

          {/* Tags */}
          {tags.length > 0 && (
            <div className="mb-8">
              <TagList tags={tags} />
            </div>
          )}

          {/* "I visited this place" — self-reported, private */}
          <div className="mb-8">
            <VisitedButton slug={place.slug} initialCount={visitInfo.count} initialVisited={visitInfo.visited} />
          </div>

          {/* Know before you go */}
          {place.knowBeforeYouGo && (
            <section className="mb-8">
              <h3 className="font-serif font-bold text-[18px] mb-3 text-ink">ℹ️ {tp("pub_kbyg")}</h3>
              <div className="rich-content text-[#3a2d22]" dangerouslySetInnerHTML={{ __html: proxyStorageImages(place.knowBeforeYouGo) }} />
            </section>
          )}

          {/* Tips for Vietnamese visitors */}
          {place.viTips && (
            <section className="mb-8 bg-rose-soft/40 border border-rose/15 rounded-2xl p-5">
              <h3 className="font-serif font-bold text-[18px] mb-3 text-rose-deep">🇻🇳 {tp("pub_vi_tips")}</h3>
              <div className="rich-content text-[#3a2d22]" dangerouslySetInnerHTML={{ __html: proxyStorageImages(place.viTips) }} />
            </section>
          )}

          {/* Editorial extras: items to bring / duration / best time */}
          {(place.itemsToBring?.length || place.recommendedDurationMinutes != null || place.bestVisitTime) && (
            <section className="mb-8 text-[13.5px] text-[#3a2d22] space-y-2">
              {place.itemsToBring && place.itemsToBring.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-[#5c4d44]">🎒 {tp("pub_bring")}:</span>
                  {place.itemsToBring.map((it) => (
                    <span key={it} className="inline-flex text-[12px] font-medium px-2.5 py-1 rounded-full bg-cream border border-line">{it}</span>
                  ))}
                </div>
              )}
              {place.recommendedDurationMinutes != null && (
                <p><span className="font-semibold text-[#5c4d44]">⏱️ </span>{tp("pub_duration", { min: place.recommendedDurationMinutes })}</p>
              )}
              {place.bestVisitTime && (
                <p><span className="font-semibold text-[#5c4d44]">🌤️ {tp("pub_best_time")}: </span>{place.bestVisitTime}</p>
              )}
            </section>
          )}

          {/* Useful Japanese phrases (per-place + category templates, copy/speak) */}
          {phrases.length > 0 && (
            <section className="mb-8">
              <h3 className="font-serif font-bold text-[18px] mb-3 text-ink">🗣️ {td("phrases_title")}</h3>
              <PlacePhrases phrases={phrases} />
            </section>
          )}

          {/* Source & verification */}
          {(place.sourceUrl || place.lastVerifiedAt || (place.verificationStatus && place.verificationStatus !== "unverified")) && (
            <footer className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-muted border-t border-line pt-4">
              {place.verificationStatus && place.verificationStatus !== "unverified" && (
                <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                  ✓ {tp(`vs_${place.verificationStatus}` as "vs_verified")}
                </span>
              )}
              {place.lastVerifiedAt && <span>{tp("pub_verified_on", { date: place.lastVerifiedAt })}</span>}
              {place.sourceUrl && (
                <a href={place.sourceUrl} target="_blank" rel="noopener nofollow" className="text-teal hover:underline">
                  {tp("pub_source")} ↗
                </a>
              )}
              <PlaceReport slug={place.slug} variant="button" />
            </footer>
          )}
          {!(place.sourceUrl || place.lastVerifiedAt || (place.verificationStatus && place.verificationStatus !== "unverified")) && (
            <div className="mb-2 border-t border-line pt-4"><PlaceReport slug={place.slug} variant="button" /></div>
          )}
        </div>

        {/* ── RIGHT — sticky sidebar (col 2, spans both rows) ─── */}
        <aside className="order-2 lg:order-none lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:sticky lg:top-[88px] h-fit space-y-3">
          {/* Save + Share (desktop) */}
          <PlaceSaveShare slug={place.slug} name={place.name} shareUrl={shareUrl} />

          {/* Primary action */}
          <a
            href={dirUrl}
            target="_blank"
            rel="noopener"
            className="flex items-center justify-center gap-2 font-semibold text-[14px] px-5 py-3.5 rounded-2xl bg-rose text-white shadow-[0_8px_20px_-6px_rgba(200,30,91,0.55)] hover:bg-rose-deep hover:-translate-y-px transition-all"
          >
            {t("open_maps")}
          </a>

          {/* Secondary action */}
          <a
            href={place.photoUrl}
            target="_blank"
            rel="noopener"
            className="flex items-center justify-center gap-2 font-semibold text-[14px] px-5 py-3.5 rounded-2xl bg-paper text-rose border border-rose/35 hover:bg-rose/5 hover:border-rose/55 hover:-translate-y-px transition-all"
          >
            {t("view_photos")}
          </a>

          {/* Structured actions: reserve / website / call / social (only if present) */}
          <PlaceActions place={place} />

          {/* Add to a custom list or trip plan */}
          <AddToCollection slug={place.slug} variant="button" />

          {/* Merged visit-info card: status + price + station + topic/area/
              prefecture/address + reservation/suitability/facility pills */}
          <PlaceVisitInfo place={place} displayCategory={displayCategory} displayArea={displayArea} />

          {/* Place rating */}
          <PlaceRating
            slug={place.slug}
            average={rating.average}
            count={rating.count}
            myStars={rating.myStars}
            myReview={rating.myReview}
            isLoggedIn={!!currentUser}
          />

        </aside>
      </div>

      {/* ── COMMENTS / KINH NGHIỆM ───────────────────────────── */}
      <div className="max-w-[1100px] mx-auto px-6">
        <div className="lg:max-w-[calc(100%-308px)]">
          <PlaceComments
            slug={place.slug}
            comments={comments}
            currentUser={currentUser}
            isAdmin={isAdmin}
          />
          {/* Place Q&A (reuses place_comments via kind question/answer) */}
          <PlaceQuestions
            slug={place.slug}
            questions={questions}
            currentUserId={currentUser?.id ?? null}
            isAdmin={!!isAdmin}
          />
        </div>
      </div>

      {/* ── RELATED ──────────────────────────────────────────── */}
      {related.length > 0 && (
        <div className="max-w-[1100px] mx-auto px-6 mt-14 pb-2">
          <h3 className="font-serif font-bold text-[24px] mb-6">{t("related")}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {related.map((p) => <PlaceCard key={p.slug} place={p} />)}
          </div>
        </div>
      )}

      {/* Sticky mobile action bar (desktop uses the sidebar) */}
      <PlaceActionBar
        slug={place.slug}
        name={place.name}
        directionsUrl={dirUrl}
        tel={tel}
        reservationUrl={acts.reserve ? place.reservationUrl ?? null : null}
        reservationProvider={place.reservationProvider ?? null}
        website={acts.website ? place.officialWebsite ?? null : null}
        shareUrl={shareUrl}
        askUrl="/community"
      />
    </article>
  );
}
