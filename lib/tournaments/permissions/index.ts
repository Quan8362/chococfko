// Public surface of the tournament PERMISSION engine — pure TypeScript, no I/O. Safe to import
// from anywhere (client or server). The server-only resolver + checker (which touch Supabase /
// ADMIN_EMAILS) live in lib/tournaments/permissions/server.ts and are NOT re-exported here.
export * from './types.ts'
export * from './roles.ts'
export * from './errors.ts'
export * from './check.ts'
