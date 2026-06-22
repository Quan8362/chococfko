// Extensible achievement definitions + server-side evaluation. PURE module.
// Titles/descriptions are NOT stored here — the UI resolves them from i18n by
// code (games.jp60.ach.<code>.title / .desc) so all 5 locales stay in sync.

export type Jp60AchievementCategory = 'milestone' | 'combo' | 'score' | 'level' | 'streak' | 'volume' | 'category' | 'social' | 'daily'

export type Jp60AchievementDef = {
  code: string
  category: Jp60AchievementCategory
  icon: string
  // Sort order in the collection grid.
  order: number
}

// Adding a new achievement = append a def + i18n keys. No schema change.
export const JP60_ACHIEVEMENTS: readonly Jp60AchievementDef[] = [
  { code: 'first_game', category: 'milestone', icon: '🎮', order: 10 },
  { code: 'first_perfect', category: 'milestone', icon: '💯', order: 20 },
  { code: 'combo_5', category: 'combo', icon: '🔥', order: 30 },
  { code: 'combo_10', category: 'combo', icon: '⚡', order: 40 },
  { code: 'score_1000', category: 'score', icon: '🏅', order: 50 },
  { code: 'score_2000', category: 'score', icon: '🏆', order: 60 },
  { code: 'level_n5', category: 'level', icon: '🌱', order: 70 },
  { code: 'level_n4', category: 'level', icon: '🌿', order: 80 },
  { code: 'level_n3', category: 'level', icon: '🌳', order: 90 },
  { code: 'level_n2', category: 'level', icon: '🎍', order: 100 },
  { code: 'level_n1', category: 'level', icon: '🗻', order: 110 },
  { code: 'streak_3', category: 'streak', icon: '📅', order: 120 },
  { code: 'streak_7', category: 'streak', icon: '🗓️', order: 130 },
  { code: 'streak_30', category: 'streak', icon: '📆', order: 140 },
  { code: 'daily_winner', category: 'daily', icon: '👑', order: 150 },
  { code: 'questions_100', category: 'volume', icon: '📚', order: 160 },
  { code: 'questions_1000', category: 'volume', icon: '🎓', order: 170 },
  { code: 'master_vocab', category: 'category', icon: '🈁', order: 180 },
  { code: 'kanji_explorer', category: 'category', icon: '🈶', order: 190 },
  { code: 'grammar_explorer', category: 'category', icon: '📝', order: 200 },
  { code: 'challenge_friend', category: 'social', icon: '🤝', order: 210 },
  { code: 'win_challenge', category: 'social', icon: '🥇', order: 220 },
]

export const JP60_ACHIEVEMENT_CODES = JP60_ACHIEVEMENTS.map((a) => a.code)

// Aggregate state used to evaluate achievements after a finished session.
export type AchievementContext = {
  // Lifetime (AFTER this session has been folded in).
  totalGames: number
  totalQuestions: number
  bestScoreEver: number
  bestComboEver: number
  streakCurrent: number
  vocabCorrect: number
  kanjiCorrect: number
  grammarCorrect: number
  // This session.
  sessionLevel: string // N5..N1, MIXED
  sessionPerfect: boolean // all answered correct AND >=1 answered
  // Server-confirmed social/daily events (only set when truly earned/finalised).
  dailyWinnerFinalized: boolean
  friendChallengeCreated: boolean
  friendChallengeWon: boolean
}

const COMPLETED_LEVEL_CODE: Record<string, string> = {
  N5: 'level_n5',
  N4: 'level_n4',
  N3: 'level_n3',
  N2: 'level_n2',
  N1: 'level_n1',
}

// Returns every achievement code currently SATISFIED. The caller diffs this
// against already-unlocked codes so each is awarded at most once.
export function evaluateAchievements(ctx: AchievementContext): string[] {
  const out: string[] = []
  const add = (code: string) => out.push(code)

  if (ctx.totalGames >= 1) add('first_game')
  if (ctx.sessionPerfect) add('first_perfect')
  if (ctx.bestComboEver >= 5) add('combo_5')
  if (ctx.bestComboEver >= 10) add('combo_10')
  if (ctx.bestScoreEver >= 1000) add('score_1000')
  if (ctx.bestScoreEver >= 2000) add('score_2000')

  const levelCode = COMPLETED_LEVEL_CODE[ctx.sessionLevel]
  if (levelCode) add(levelCode)

  if (ctx.streakCurrent >= 3) add('streak_3')
  if (ctx.streakCurrent >= 7) add('streak_7')
  if (ctx.streakCurrent >= 30) add('streak_30')

  if (ctx.dailyWinnerFinalized) add('daily_winner')

  if (ctx.totalQuestions >= 100) add('questions_100')
  if (ctx.totalQuestions >= 1000) add('questions_1000')

  if (ctx.vocabCorrect >= 200) add('master_vocab')
  if (ctx.kanjiCorrect >= 100) add('kanji_explorer')
  if (ctx.grammarCorrect >= 100) add('grammar_explorer')

  if (ctx.friendChallengeCreated) add('challenge_friend')
  if (ctx.friendChallengeWon) add('win_challenge')

  return out
}
