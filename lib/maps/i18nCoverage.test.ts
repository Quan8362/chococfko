import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ============================================================
// Map i18n coverage (Map UX Phase 9). Verifies the map/directions/search/picker
// namespaces are fully translated across all five locales with NO missing keys
// and NO empty values (which would surface a raw key or blank label in the UI).
// ============================================================

const LOCALES = ['vi', 'en', 'ja', 'ko', 'zh'] as const;
// Namespaces the map redesign owns (Phases 3–9).
const NAMESPACES = ['map_v2', 'map_search', 'directions', 'map_lab', 'place_picker'] as const;

const dir = fileURLToPath(new URL('../../messages/', import.meta.url));
const msgs = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(readFileSync(`${dir}${l}.json`, 'utf8')) as Record<string, Record<string, string>>]),
) as Record<(typeof LOCALES)[number], Record<string, Record<string, string>>>;

test('every map namespace exists in all five locales', () => {
  for (const ns of NAMESPACES) {
    for (const loc of LOCALES) {
      assert.ok(msgs[loc][ns], `messages/${loc}.json is missing namespace "${ns}"`);
    }
  }
});

test('namespaces have identical key sets across locales (no missing translations)', () => {
  for (const ns of NAMESPACES) {
    const base = Object.keys(msgs.en[ns] ?? {}).sort();
    for (const loc of LOCALES) {
      const keys = Object.keys(msgs[loc][ns] ?? {}).sort();
      assert.deepEqual(keys, base, `Namespace "${ns}" key set differs in ${loc}`);
    }
  }
});

test('no empty / whitespace-only values (would render a blank or raw key)', () => {
  for (const ns of NAMESPACES) {
    for (const loc of LOCALES) {
      for (const [k, v] of Object.entries(msgs[loc][ns] ?? {})) {
        assert.equal(typeof v, 'string', `${loc}.${ns}.${k} is not a string`);
        assert.ok((v as string).trim().length > 0, `${loc}.${ns}.${k} is empty`);
      }
    }
  }
});

test('directions namespace covers every travel mode + status + geo state in all locales', () => {
  const required = [
    'mode_walking', 'mode_driving', 'mode_bicycling', 'mode_transit',
    'open_in_google_maps', 'preview_route', 'status_no_route', 'status_quota', 'status_unavailable',
    'geo_denied', 'geo_insecure', 'use_current_location',
  ];
  for (const loc of LOCALES) {
    for (const k of required) assert.ok(msgs[loc].directions?.[k], `${loc}.directions.${k} missing`);
  }
});

test('map_search covers the four result-group labels + external/duplicate strings', () => {
  const required = ['group_internal', 'group_google', 'group_stations', 'group_topics', 'ext_duplicate', 'google_hint', 'searching', 'no_results'];
  for (const loc of LOCALES) {
    for (const k of required) assert.ok(msgs[loc].map_search?.[k], `${loc}.map_search.${k} missing`);
  }
});
