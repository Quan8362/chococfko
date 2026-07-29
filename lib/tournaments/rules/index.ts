// Public surface of the tournament RULE ENGINE — pure TypeScript, no I/O. This is a config layer
// beside the domain engine (lib/tournaments/domain/**); it never re-implements standings/brackets.
export * from './types.ts'
export * from './errors.ts'
export * from './match-rules.ts'
export * from './handicap.ts'
export * from './validation.ts'
export * from './snapshot.ts'
export * from './presets.ts'
export * from './persistence.ts'
