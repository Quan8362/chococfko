// ─────────────────────────────────────────────────────────────────────────────
// Machine-readable training/evaluation reports.
//
// Every production-scale run writes a structured JSON report to disk so results are
// comparable later (not just scrollback text). A report carries enough to reproduce
// the run: the exact configuration, the disjoint seed-set metadata, candidate
// weights, validation/holdout metrics, paired confidence intervals, scenario
// results, move-type distribution, timing, and the promotion decision + reasons.
// ─────────────────────────────────────────────────────────────────────────────
import { execSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type BotStrategyWeights } from '../ai/weights.ts'
import { type EvalMetrics } from './evaluation.ts'
import { type PairedResult } from './stats.ts'
import { TRAINING_BASE, VALIDATION_BASE, HOLDOUT_BASE } from './seeds.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
export const REPORTS_DIR = join(HERE, 'reports')

export function sourceCommit(): string {
  try { return execSync('git rev-parse --short HEAD', { cwd: HERE, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() }
  catch { return 'unknown' }
}

export interface SeedSetMetadata {
  trainingBase: number; validationBase: number; holdoutBase: number
  trainingCount: number; validationCount: number; holdoutCount: number
  disjoint: true
  note: string
}

export function seedSetMetadata(trainingCount: number, validationCount: number, holdoutCount: number): SeedSetMetadata {
  return {
    trainingBase: TRAINING_BASE, validationBase: VALIDATION_BASE, holdoutBase: HOLDOUT_BASE,
    trainingCount, validationCount, holdoutCount, disjoint: true,
    note: 'Each seed expands to ×playerCount games via seat rotation. Bases are 4M apart so the three sets never overlap.',
  }
}

export interface NamedEval { label: string; metrics: EvalMetrics }
export interface NamedPaired { label: string; result: PairedResult }

export interface TrainingReport {
  runId: string
  createdAt: string
  sourceCommit: string
  configuration: Record<string, unknown>
  seedSets: SeedSetMetadata
  opponentField: string[]
  candidateVersion: string
  candidateWeights: BotStrategyWeights | null
  trainHistory?: Array<{ generation: number; bestFitness: number; meanFitness: number }>
  validation?: NamedEval[]
  holdout?: NamedEval[]
  paired?: NamedPaired[]
  scenarios?: { total: number; passed: number; failures: string[]; byPolicy?: Record<string, { passed: number; total: number }> }
  timing?: Record<string, unknown>
  promotedPolicy: string | null
  rejectionReasons: string[]
}

export function writeReport(report: TrainingReport): string {
  mkdirSync(REPORTS_DIR, { recursive: true })
  const path = join(REPORTS_DIR, `${report.runId}.json`)
  writeFileSync(path, JSON.stringify(report, null, 2))
  return path
}

export function runId(prefix: string): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  return `${prefix}-${ts}`
}
