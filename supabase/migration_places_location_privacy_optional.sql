-- ============================================================
-- OPTIONAL — Map UX Phase 4: hide PRIVATE audit metadata from public reads.
--
-- The Phase-4 migration adds an audit trail (location_source, confirmed_at/by,
-- manually_adjusted, provider_data_updated_at). These are operational metadata,
-- not public content. The public-facing fields (location_provider,
-- provider_place_id, provider_formatted_address, provider_maps_url, country_code)
-- stay readable so the public map can "open in Google", show an address, etc.
--
-- This migration uses COLUMN-LEVEL privileges (PostgREST honours them): anon /
-- authenticated keep table SELECT, but lose SELECT on the audit columns only.
-- The Admin client (service_role) bypasses and still sees everything.
--
-- ⚠️ APPLY ONLY AFTER VALIDATING IN STAGING that `select('*')` on `places` still
--    works for the app. PostgREST expands `*` to the columns the role may read,
--    so getAllPlacesFromDb()'s select('*') should transparently omit these. The
--    public RPC places_nearby already lists columns explicitly and does NOT
--    return any of them. Validate, then apply.
--
-- This is SEPARATE from the additive migration so the core change carries ZERO
-- RLS/grant risk. Reversible (grants restored below).
-- ============================================================

-- Hide private audit metadata from public roles (column-level).
revoke select (location_source, location_confirmed_at, location_confirmed_by,
               location_manually_adjusted, provider_data_updated_at)
  on public.places from anon, authenticated;

notify pgrst, 'reload schema';

-- ── ROLLBACK (restore public read of those columns) ────────────────────────
-- grant select (location_source, location_confirmed_at, location_confirmed_by,
--               location_manually_adjusted, provider_data_updated_at)
--   on public.places to anon, authenticated;
-- notify pgrst, 'reload schema';
