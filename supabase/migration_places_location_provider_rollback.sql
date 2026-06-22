-- ============================================================
-- ROLLBACK for migration_places_location_provider.sql (Map UX Phase 4)
--
-- Drops ONLY the columns/constraints/index added by that migration. Loses only
-- the data held in those new columns; editorial lat/lng/address/map_url and all
-- other place data are untouched. Idempotent (IF EXISTS everywhere).
--
-- Run in Supabase SQL Editor only if you need to fully revert Phase 4 schema.
-- (Normal "rollback" during staged rollout is just NOT writing these columns —
--  the app treats them as optional. You rarely need to drop them.)
-- ============================================================

drop index  if exists public.places_provider_place_uidx;

alter table public.places drop constraint if exists places_location_provider_check;
alter table public.places drop constraint if exists places_location_source_check;
alter table public.places drop constraint if exists places_country_code_check;
alter table public.places drop constraint if exists places_provider_pair_check;

alter table public.places drop column if exists location_provider;
alter table public.places drop column if exists provider_place_id;
alter table public.places drop column if exists provider_formatted_address;
alter table public.places drop column if exists provider_maps_url;
alter table public.places drop column if exists provider_data_updated_at;
alter table public.places drop column if exists country_code;
alter table public.places drop column if exists location_source;
alter table public.places drop column if exists location_manually_adjusted;
alter table public.places drop column if exists location_confirmed_at;
alter table public.places drop column if exists location_confirmed_by;

notify pgrst, 'reload schema';
