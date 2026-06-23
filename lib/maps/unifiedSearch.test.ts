import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Place } from '../places.ts';
import {
  searchInternalPlaces, extractStationAreas, extractTopics, scoreInternalPlace,
  shouldOfferExternalSearch, buildInternalResponse, queryTokens, MIN_QUERY_CHARS,
  type TopicDef,
} from './unifiedSearch.ts';

function mk(p: Partial<Place> & { slug: string; name: string }): Place {
  return {
    area: '', desc: '', category: 'food', categoryLabel: 'Ẩm thực', fee: 'paid',
    mapUrl: '', photoUrl: '', img: '', imgFallback: '',
    ...p,
  } as Place;
}

const PLACES: Place[] = [
  mk({ slug: 'dazaifu', name: '太宰府天満宮', categoryLabel: 'Tham quan', category: 'landmark', area: 'Dazaifu', nearestStation: 'Dazaifu Station', address: '福岡県太宰府市宰府4丁目7-1', lat: 33.52, lng: 130.53 }),
  mk({ slug: 'pho-quan', name: 'Phở Quán Hakata', categoryLabel: 'Quán Việt', category: 'viet', area: 'Hakata', nearestStation: 'Hakata Station', address: 'Fukuoka, Hakata-ku' }),
  mk({ slug: 'ohori', name: 'Ohori Park', categoryLabel: 'Công viên', category: 'park', area: 'Ohori', nearestStation: 'Ohorikoen Station', lat: 33.58, lng: 130.37 }),
  mk({ slug: 'ramen-x', name: 'Ramen Ichiban', categoryLabel: 'Quán Nhật', category: 'japanese', area: 'Tenjin', nearestStation: 'Tenjin Station' }),
  mk({ slug: 'hidden', name: 'Hidden Spot', searchEligible: false, area: 'Tenjin' }),
];

const TOPIC_DEFS: TopicDef[] = [
  { topicType: 'category', code: 'viet', label: 'Quán Việt', aliases: 'quan viet vietnamese pho ベトナム 베트남 越南', count: 1 },
  { topicType: 'category', code: 'park', label: 'Công viên', aliases: 'cong vien park garden 公園 공원', count: 1 },
  { topicType: 'concept', code: 'bbq', label: 'BBQ', aliases: 'bbq barbecue バーベキュー 바비큐 烧烤', count: 0 },
];

// 1. internal results only — Japanese query
test('Japanese query matches internal place by name', () => {
  const r = searchInternalPlaces(PLACES, '太宰府');
  assert.equal(r[0]?.slug, 'dazaifu');
});

// Global internal search must find the SAME internal place by EVERY required
// query form, independent of any map viewport (regression: Map V2 mobile search).
// A realistic place carries both the romaji title and the Japanese name (here in
// a localized tag) so Latin, lowercase and CJK queries all resolve to it.
test('all required Dazaifu queries resolve to the same internal place', () => {
  const dz = mk({
    slug: 'dazaifu', name: 'Dazaifu Tenmangu', category: 'landmark', categoryLabel: 'Tham quan',
    area: 'Dazaifu', nearestStation: 'Dazaifu Station', lat: 33.52, lng: 130.53,
    tags: [{ name: 'dazaifu-tenmangu', display_name_ja: '太宰府天満宮' }] as Place['tags'],
  });
  const catalog = [dz, ...PLACES.filter((p) => p.slug !== 'dazaifu')];
  for (const q of ['Dazaifu Tenmangu', 'dazaifu', '太宰府天満宮', 'Dazaifu']) {
    const r = searchInternalPlaces(catalog, q);
    assert.ok(r.some((x) => x.slug === 'dazaifu'), `query "${q}" should find Dazaifu`);
  }
});

// Vietnamese query (diacritics-insensitive)
test('Vietnamese query matches via normalized name', () => {
  const r = searchInternalPlaces(PLACES, 'pho quan');
  assert.equal(r[0]?.slug, 'pho-quan');
});

// English query via name
test('English query matches park by name', () => {
  const r = searchInternalPlaces(PLACES, 'Ohori');
  assert.ok(r.some((x) => x.slug === 'ohori'));
});

// station search
test('station token matches places via nearestStation field', () => {
  const r = searchInternalPlaces(PLACES, 'Hakata Station');
  assert.ok(r.some((x) => x.slug === 'pho-quan'));
});

// address search
test('address token matches via address field', () => {
  const r = searchInternalPlaces(PLACES, '宰府4丁目');
  assert.ok(r.some((x) => x.slug === 'dazaifu'));
});

// search_eligible=false excluded
test('search-ineligible places are excluded', () => {
  const r = searchInternalPlaces(PLACES, 'Hidden');
  assert.equal(r.length, 0);
});

// boundary matching: a Latin substring of a word must not match the whole word
test('Latin token matches on word boundary, not substring', () => {
  // "hori" is a substring of "Ohori" but not a whole word → must NOT match.
  assert.equal(searchInternalPlaces(PLACES, 'hori').length, 0);
  // the full word still matches.
  assert.ok(searchInternalPlaces(PLACES, 'ohori').some((x) => x.slug === 'ohori'));
});

// coordinate-less places still searchable
test('places without coordinates are still returned (hasCoordinates=false)', () => {
  const r = searchInternalPlaces(PLACES, 'Ramen');
  const item = r.find((x) => x.slug === 'ramen-x');
  assert.ok(item);
  assert.equal(item!.hasCoordinates, false);
  assert.equal(item!.lat, null);
});

test('places with coordinates report hasCoordinates=true', () => {
  const r = searchInternalPlaces(PLACES, 'Ohori');
  const item = r.find((x) => x.slug === 'ohori');
  assert.equal(item!.hasCoordinates, true);
  assert.equal(item!.lat, 33.58);
});

// scoreInternalPlace AND semantics
test('scoreInternalPlace returns null when a token matches nothing', () => {
  const p = mk({ slug: 's', name: 'Ohori Park' });
  assert.equal(scoreInternalPlace(p, queryTokens('Ohori zzzqqq')), null);
  assert.ok((scoreInternalPlace(p, queryTokens('Ohori')) ?? 0) > 0);
});

// stations & areas group
test('extractStationAreas returns matching stations and areas with counts', () => {
  const r = extractStationAreas(PLACES, 'Tenjin');
  // Tenjin is an area (2 eligible? hidden excluded) and Tenjin Station a station.
  assert.ok(r.some((x) => x.type === 'station' && x.label === 'Tenjin Station'));
  assert.ok(r.some((x) => x.type === 'area' && x.label === 'Tenjin'));
  const station = r.find((x) => x.type === 'station')!;
  assert.ok(station.count >= 1);
});

test('extractStationAreas excludes ineligible places from counts', () => {
  const r = extractStationAreas(PLACES, 'Tenjin');
  const area = r.find((x) => x.type === 'area' && x.label === 'Tenjin')!;
  assert.equal(area.count, 1); // ramen-x only; hidden is searchEligible:false
});

// topics group — category & concept
test('extractTopics matches category by multilingual alias', () => {
  assert.ok(extractTopics('越南', TOPIC_DEFS).some((t) => t.code === 'viet'));
  assert.ok(extractTopics('park', TOPIC_DEFS).some((t) => t.code === 'park'));
  assert.ok(extractTopics('bbq', TOPIC_DEFS).some((t) => t.code === 'bbq' && t.topicType === 'concept'));
});

test('extractTopics matches by localized label', () => {
  assert.ok(extractTopics('Công viên', TOPIC_DEFS).some((t) => t.code === 'park'));
});

// external offer decision
test('shouldOfferExternalSearch: off when externalEnabled=false', () => {
  assert.deepEqual(
    shouldOfferExternalSearch({ internalTotal: 0, queryLength: 5, externalEnabled: false }),
    { offer: false, reason: 'none' },
  );
});
test('shouldOfferExternalSearch: off below min chars', () => {
  assert.equal(shouldOfferExternalSearch({ internalTotal: 0, queryLength: MIN_QUERY_CHARS - 1, externalEnabled: true }).offer, false);
});
test('shouldOfferExternalSearch: offered when internal insufficient', () => {
  const r = shouldOfferExternalSearch({ internalTotal: 1, queryLength: 5, externalEnabled: true });
  assert.deepEqual(r, { offer: true, reason: 'insufficient_internal' });
});
test('shouldOfferExternalSearch: NOT offered when internal sufficient', () => {
  assert.equal(shouldOfferExternalSearch({ internalTotal: 10, queryLength: 5, externalEnabled: true }).offer, false);
});
test('shouldOfferExternalSearch: explicit always offers (within min chars)', () => {
  const r = shouldOfferExternalSearch({ internalTotal: 99, queryLength: 5, explicit: true, externalEnabled: true });
  assert.deepEqual(r, { offer: true, reason: 'explicit' });
});

// full response assembly — internal prioritized, external never auto-included
test('buildInternalResponse assembles all internal groups, external offer flag only', () => {
  const r = buildInternalResponse(PLACES, 'Hakata', TOPIC_DEFS, { externalEnabled: true });
  assert.ok(r.internal.some((x) => x.slug === 'pho-quan'));
  assert.ok(r.stationAreas.some((x) => x.label === 'Hakata Station'));
  assert.equal(typeof r.offerExternal, 'boolean');
  assert.ok(!('google' in r)); // no external results produced server-side
});

test('buildInternalResponse with empty query yields nothing', () => {
  const r = buildInternalResponse(PLACES, '', TOPIC_DEFS, { externalEnabled: true });
  assert.equal(r.internal.length, 0);
  assert.equal(r.internalTotal, 0);
  assert.equal(r.offerExternal, false);
});
