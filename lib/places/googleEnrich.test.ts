import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  googleHoursToInternal, inferIndoorOutdoor, mapGoogleToProposal, applyEnrichment,
  nameSimilarity, nameContainment, matchConfidence,
  type GoogleOpeningHours,
} from './googleEnrich.ts';
import { isOpenNow } from '../placeOpenNow.ts';

// ── Fixtures ──────────────────────────────────────────────────────────────────

// A park open every day 09:00–17:30 EXCEPT Tuesday (no period for Tuesday).
const tuesdayClosedPark: GoogleOpeningHours = {
  periods: [0, 1, 3, 4, 5, 6].map((day) => ({
    open: { day, hour: 9, minute: 0 },
    close: { day, hour: 17, minute: 30 },
  })),
};

// A late-night izakaya open 17:30 → 23:30 daily, and Fri/Sat until 02:00 next day.
const lateNightIzakaya: GoogleOpeningHours = {
  periods: [
    ...[0, 1, 2, 3, 4].map((day) => ({ open: { day, hour: 17, minute: 30 }, close: { day, hour: 23, minute: 30 } })),
    { open: { day: 5, hour: 17, minute: 30 }, close: { day: 6, hour: 2, minute: 0 } }, // Fri → Sat 02:00
    { open: { day: 6, hour: 17, minute: 30 }, close: { day: 0, hour: 2, minute: 0 } }, // Sat → Sun 02:00
  ],
};

// 2026-06-23 is a Tuesday; 12:00 JST → 03:00Z.
const tueNoonUtc = new Date('2026-06-23T03:00:00Z');
// 2026-06-22 is a Monday; 12:00 JST.
const monNoonUtc = new Date('2026-06-22T03:00:00Z');
// Saturday 2026-06-27, 01:00 JST → still inside Fri's overnight wrap; 2026-06-26 16:00Z = Sat 01:00 JST.
const satEarlyUtc = new Date('2026-06-26T16:00:00Z');

// ── Hours conversion ──────────────────────────────────────────────────────────

test('Tuesday-closed park: Tuesday becomes explicitly closed ([]), open other days', () => {
  const oh = googleHoursToInternal(tuesdayClosedPark);
  assert.ok(oh);
  assert.deepEqual(oh!.tue, []); // explicitly closed, NOT unknown
  assert.deepEqual(oh!.mon, [{ open: '09:00', close: '17:30' }]);
  // closed on Tuesday noon, open on Monday noon
  assert.equal(isOpenNow(oh, null, tueNoonUtc), false);
  assert.equal(isOpenNow(oh, null, monNoonUtc), true);
});

test('Late-night izakaya: overnight wrap keeps it open after midnight', () => {
  const oh = googleHoursToInternal(lateNightIzakaya);
  assert.ok(oh);
  assert.deepEqual(oh!.fri, [{ open: '17:30', close: '02:00' }]); // wrap stored on open day
  // Sat 01:00 JST → still open via Friday's wrap
  assert.equal(isOpenNow(oh, null, satEarlyUtc), true);
});

test('Place with no hours → null (filter excludes, never guesses open)', () => {
  assert.equal(googleHoursToInternal(undefined), null);
  assert.equal(googleHoursToInternal({ periods: [] }), null);
  assert.equal(isOpenNow(null, null, tueNoonUtc), null);
});

test('24/7 single period → all days open', () => {
  const oh = googleHoursToInternal({ periods: [{ open: { day: 0, hour: 0, minute: 0 } }] });
  assert.ok(oh);
  assert.deepEqual(oh!.wed, [{ open: '00:00', close: '00:00' }]);
  assert.equal(isOpenNow(oh, null, tueNoonUtc), true);
});

// ── Indoor inference ────────────────────────────────────────────────────────

test('indoor map: mall→indoor, park→outdoor, unknown→null', () => {
  assert.equal(inferIndoorOutdoor('shopping_mall', []), 'indoor');
  assert.equal(inferIndoorOutdoor('park', ['tourist_attraction']), 'outdoor');
  assert.equal(inferIndoorOutdoor('locality', ['point_of_interest']), null);
  // primaryType wins; restaurant inside is indoor
  assert.equal(inferIndoorOutdoor('restaurant', ['food', 'point_of_interest']), 'indoor');
});

// ── Positive-only price rules ───────────────────────────────────────────────

test('priceLevel FREE → fee=free; INEXPENSIVE → under-3000 (price_max=3000)', () => {
  const free = mapGoogleToProposal({ priceLevel: 'PRICE_LEVEL_FREE' });
  assert.equal(free.updates.fee, 'free');
  assert.equal(free.updates.price_type, 'free');

  const cheap = mapGoogleToProposal({ priceLevel: 'PRICE_LEVEL_INEXPENSIVE' });
  assert.equal(cheap.updates.price_max, 3000);
  assert.equal(cheap.updates.price_type, 'paid');
});

test('priceRange in JPY → numeric bounds; null priceLevel → no free, no price', () => {
  const ranged = mapGoogleToProposal({
    priceRange: { startPrice: { currencyCode: 'JPY', units: '1000' }, endPrice: { currencyCode: 'JPY', units: '2500' } },
  });
  assert.equal(ranged.updates.price_min, 1000);
  assert.equal(ranged.updates.price_max, 2500);

  // Paid-admission park where Google returns nothing → never a free badge.
  const unknown = mapGoogleToProposal({ primaryType: 'park', types: ['tourist_attraction'] });
  assert.equal(unknown.updates.fee, undefined);
  assert.equal(unknown.updates.price_max, undefined);
  assert.equal(unknown.updates.indoor_outdoor, 'outdoor'); // indoor false for a seaside park
});

test('parking: any free option → free; only paid/valet → paid; all-false → unset', () => {
  assert.equal(mapGoogleToProposal({ parkingOptions: { freeParkingLot: true } }).updates.parking, 'free');
  assert.equal(mapGoogleToProposal({ parkingOptions: { valetParking: true } }).updates.parking, 'paid');
  assert.equal(mapGoogleToProposal({ parkingOptions: { freeParkingLot: false } }).updates.parking, undefined);
});

test('reservable & goodForChildren are positive-only', () => {
  assert.equal(mapGoogleToProposal({ reservable: true }).updates.reservation_recommended, true);
  assert.equal(mapGoogleToProposal({ reservable: false }).updates.reservation_recommended, undefined);
  assert.equal(mapGoogleToProposal({ goodForChildren: true }).updates.good_for_children, true);
  assert.equal(mapGoogleToProposal({ goodForChildren: false }).updates.good_for_children, undefined);
});

test('indoor inference also sets rainy_day_ok (rainy filter payoff)', () => {
  const p = mapGoogleToProposal({ primaryType: 'shopping_mall' });
  assert.equal(p.updates.indoor_outdoor, 'indoor');
  assert.equal(p.updates.rainy_day_ok, true);
});

test('hoursOnly proposal: only opening_hours, nothing else', () => {
  const p = mapGoogleToProposal(
    { regularOpeningHours: tuesdayClosedPark, priceLevel: 'PRICE_LEVEL_FREE', goodForChildren: true },
    { hoursOnly: true },
  );
  assert.ok(p.updates.opening_hours);
  assert.equal(p.updates.fee, undefined);
  assert.equal(p.updates.good_for_children, undefined);
});

// ── Write protection (never overwrite human data) ───────────────────────────

test('manual field is never overwritten by Google', () => {
  const proposal = mapGoogleToProposal({ parkingOptions: { freeParkingLot: true } });
  const row = { parking: 'none', field_sources: { parking: 'manual' as const } };
  const applied = applyEnrichment(row, proposal);
  assert.equal(applied.update.parking, undefined);
  assert.ok(applied.protectedKeys.includes('parking'));
});

test('legacy non-null value (unknown provenance) is protected', () => {
  const proposal = mapGoogleToProposal({ priceLevel: 'PRICE_LEVEL_FREE' });
  // Seed row had fee='paid' with NO field_sources → must not be flipped to free.
  const row = { fee: 'paid' };
  const applied = applyEnrichment(row, proposal);
  assert.equal(applied.update.fee, undefined);
  assert.ok(applied.protectedKeys.includes('fee'));
});

test('empty column gets written and stamped with provenance', () => {
  const proposal = mapGoogleToProposal({ goodForChildren: true });
  const row = { good_for_children: null };
  const applied = applyEnrichment(row, proposal);
  assert.equal(applied.update.good_for_children, true);
  assert.equal(applied.fieldSources.good_for_children, 'google');
  assert.deepEqual(applied.changedKeys, ['good_for_children']);
});

test('a previous google value can be refreshed by a new google value', () => {
  const proposal = mapGoogleToProposal({ parkingOptions: { paidParkingLot: true } });
  const row = { parking: 'free', field_sources: { parking: 'google' as const } };
  const applied = applyEnrichment(row, proposal);
  assert.equal(applied.update.parking, 'paid');
});

// ── Match confidence ────────────────────────────────────────────────────────

test('name similarity & low-confidence flagging', () => {
  assert.ok(nameSimilarity('Canal City Hakata', 'Canal City Hakata') > 0.99);
  assert.ok(nameSimilarity('AKT Store', 'Lawson Hakata') < 0.2);

  const good = matchConfidence({
    queryName: 'Canal City Hakata',
    resultName: 'Canal City Hakata',
    queryLatLng: { latitude: 33.589, longitude: 130.411 },
    resultLatLng: { latitude: 33.5896, longitude: 130.4115 },
  });
  assert.equal(good.lowConfidence, false);

  const bad = matchConfidence({
    queryName: 'Bách Hóa AKT',
    resultName: 'FamilyMart Tenjin',
    queryLatLng: { latitude: 33.59, longitude: 130.40 },
    resultLatLng: { latitude: 33.70, longitude: 130.60 },
  });
  assert.equal(bad.lowConfidence, true);
});

test('containment rescues a bilingual superset name', () => {
  // Jaccard is penalized by the extra romaji tokens; containment is 1.0.
  assert.ok(nameSimilarity('奈多海岸 / Nata Beach', '奈多海岸') < 0.5);
  assert.equal(nameContainment('奈多海岸 / Nata Beach', '奈多海岸'), 1);
  // No stored coordinate, but the shared full CJK name is strong evidence → not low.
  const c = matchConfidence({ queryName: '奈多海岸 / Nata Beach', resultName: '奈多海岸' });
  assert.equal(c.lowConfidence, false);
});

test('a lone shared latin/romaji token is NOT enough without coords', () => {
  // "Nakasu Yatai" vs "Nakasu Food Stalls Street": only "nakasu" shared → stays flagged.
  const c = matchConfidence({ queryName: 'Nakasu Yatai', resultName: 'Nakasu Food Stalls Street' });
  assert.equal(c.lowConfidence, true);
});

test('coordinate priority: a very close result confirms despite a weak name', () => {
  // Romaji vs Japanese name (no overlap) but the pin is ~50m from the known coord.
  const c = matchConfidence({
    queryName: 'Mount Tachibana',
    resultName: 'Tachibanayama',
    queryLatLng: { latitude: 33.69, longitude: 130.47 },
    resultLatLng: { latitude: 33.6903, longitude: 130.4704 },
  });
  assert.equal(c.lowConfidence, false);

  // Same weak name but the pin is far away → rejected.
  const far = matchConfidence({
    queryName: 'Mount Tachibana',
    resultName: 'Tachibanayama',
    queryLatLng: { latitude: 33.69, longitude: 130.47 },
    resultLatLng: { latitude: 34.20, longitude: 131.10 },
  });
  assert.equal(far.lowConfidence, true);
});
