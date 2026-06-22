import { NextResponse } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { getAllPlacesFromDb, places as staticPlaces, categories, type Place } from '@/lib/places';
import { loadSearchConfig } from '@/lib/searchConcepts';
import { buildInternalResponse, MIN_QUERY_CHARS, type TopicDef } from '@/lib/maps/unifiedSearch';
import { getMapConfig, externalSearchAvailable } from '@/lib/maps/config';

export const dynamic = 'force-dynamic';

/**
 * GET /api/places/search?q=&external=
 * INTERNAL-FIRST unified search. Returns Chợ Cóc FKO editorial place results plus
 * station/area and topic suggestions. NEVER calls Google — it only reports
 * whether the UI should OFFER external Google results (offerExternal), which the
 * client runs separately and only on explicit interaction.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') ?? '').trim();
  if (q.length < MIN_QUERY_CHARS) {
    return NextResponse.json({ internal: [], stationAreas: [], topics: [], internalTotal: 0, offerExternal: false, externalReason: 'none' });
  }

  const config = getMapConfig();
  // External is only ever OFFERED when the master Google switch + browser key +
  // external-POI flag are all set — all default OFF (internal-only by default).
  const externalEnabled = externalSearchAvailable(config);

  const [searchConfig, tc, places] = await Promise.all([
    loadSearchConfig(),
    getTranslations('categories'),
    (async () => (await getAllPlacesFromDb()) ?? staticPlaces)(),
  ]);

  // Topic defs: categories (real counts + localized labels + multilingual
  // synonyms) and feature concepts (facets) with structured-flag counts.
  const eligible = (places as Place[]).filter((p) => p.searchEligible !== false);
  const catCount = (code: string) => eligible.filter((p) => p.category === code).length;
  const categoryTopics: TopicDef[] = categories.map((c) => ({
    topicType: 'category',
    code: c.code,
    label: tc(c.code as Parameters<typeof tc>[0]),
    aliases: searchConfig.categories[c.code] ?? '',
    count: catCount(c.code),
  }));

  const conceptCount: Record<string, (p: Place) => boolean> = {
    bbq: (p) => p.bbqAvailable === true,
    camping: (p) => p.campingAvailable === true,
  };
  const tms = await getTranslations('map_search');
  const conceptTopics: TopicDef[] = searchConfig.facets.map((f) => ({
    topicType: 'concept',
    code: f.key,
    label: safeTopicLabel(tms, f.key),
    aliases: f.aliases.join(' '),
    count: conceptCount[f.key] ? eligible.filter(conceptCount[f.key]).length : 0,
  }));

  const response = buildInternalResponse(places as Place[], q, [...categoryTopics, ...conceptTopics], {
    externalEnabled,
    config: searchConfig,
  });
  return NextResponse.json(response);
}

/** Localized concept label, falling back to the humanized key if no message. */
function safeTopicLabel(t: (k: string) => string, key: string): string {
  try {
    const v = t(`topic_${key}`);
    if (v && !v.startsWith('map_search.')) return v;
  } catch { /* missing key → fall through */ }
  return key.replace(/_/g, ' ');
}
