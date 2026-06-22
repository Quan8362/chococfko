'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { trackEvent } from '@/lib/analytics'
import { answerScore } from '@/lib/games/jp60/scoring'
import { JP60_LEVELS, JP60_PRACTICE_COUNTS, type Jp60Difficulty } from '@/lib/games/jp60/constants'
import { JP60_ACHIEVEMENTS } from '@/lib/games/jp60/achievements'
import {
  startJp60Session,
  submitJp60Answer,
  finishJp60Session,
  type Jp60Settings,
  type FinishSummary,
  type ReviewItem,
} from './actions'
import { reportJp60Question } from './social-actions'
import { ChallengeButton } from './ChallengeButton'
import { Switch } from './Switch'
import { questionPresentation } from '@/lib/games/jp60/presentation'
import type { ClientQuestion } from '@/lib/games/jp60/generate'

type Screen = 'mode' | 'level' | 'loading' | 'play' | 'result' | 'review' | 'error'
type Mode = 'daily' | 'rush' | 'practice'

const SELECTABLE_LEVELS = JP60_LEVELS.filter((l) => l !== 'MIXED')
const REPORT_REASONS = ['wrong_answer', 'multiple_answers', 'unnatural', 'wrong_reading', 'wrong_furigana', 'wrong_translation', 'typo', 'inappropriate', 'other'] as const

export function Jp60Game({
  settings,
  signedIn,
  dailyDone,
  challengeCode,
  autoStart,
}: {
  settings: Jp60Settings
  signedIn: boolean
  dailyDone: Record<string, boolean>
  challengeCode?: string | null
  autoStart?: { level: string } | null
}) {
  const t = useTranslations('games.jp60')
  const [screen, setScreen] = useState<Screen>(challengeCode ? 'level' : 'mode')
  const [mode, setMode] = useState<Mode>('daily')
  const [level, setLevel] = useState<string>('N5')
  const [count, setCount] = useState<number>(10)
  const [timed, setTimed] = useState(true)
  const [errorKey, setErrorKey] = useState<string>('err_generic')

  // session
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [ranked, setRanked] = useState(false)
  const [total, setTotal] = useState(0)
  const [question, setQuestion] = useState<ClientQuestion | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const [revealed, setRevealed] = useState<{ correctKey: string; correct: boolean } | null>(null)

  // live stats
  const [score, setScore] = useState(0)
  const [combo, setCombo] = useState(0)
  const [bestCombo, setBestCombo] = useState(0)
  const [answered, setAnswered] = useState(0)
  const [correctCount, setCorrectCount] = useState(0)
  const [timeLeft, setTimeLeft] = useState(60)
  const [durationSec, setDurationSec] = useState(60)

  const [summary, setSummary] = useState<FinishSummary | null>(null)
  const [exitOpen, setExitOpen] = useState(false)

  const reduceMotion = usePrefersReducedMotion()
  const submittingRef = useRef(false)
  const shownAtRef = useRef<number>(0)
  const deadlineRef = useRef<number>(0)
  const finishingRef = useRef(false)

  // ── start ──
  const start = useCallback(
    async (m: Mode, lv: string, opts?: { count?: number; timed?: boolean }) => {
      setScreen('loading')
      trackEvent('jp60_game_started', { metadata: { mode: m, level: lv, ranked: signedIn } })
      const res = await startJp60Session({
        mode: m,
        level: lv,
        count: opts?.count,
        timed: opts?.timed,
        challengeCode: challengeCode ?? null,
      })
      if (!res.ok) {
        setErrorKey(mapError(res.error))
        setScreen('error')
        return
      }
      setSessionId(res.sessionId)
      setRanked(res.ranked)
      setTotal(res.total)
      setQuestion(res.question)
      setScore(0); setCombo(0); setBestCombo(0); setAnswered(0); setCorrectCount(0)
      setPicked(null); setRevealed(null)
      setTimed(res.timed)
      setDurationSec(res.durationSec || 60)
      setTimeLeft(res.durationSec || 0)
      deadlineRef.current = res.timed ? Date.now() + res.durationSec * 1000 : 0
      shownAtRef.current = Date.now()
      setScreen('play')
    },
    [challengeCode, signedIn]
  )

  useEffect(() => {
    if (autoStart) start('rush', autoStart.level)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── timer ──
  const doFinish = useCallback(async () => {
    if (finishingRef.current || !sessionId) return
    finishingRef.current = true
    setScreen('loading')
    const res = await finishJp60Session(sessionId)
    if (res.ok) {
      setSummary(res)
      setScreen('result')
      trackEvent('jp60_game_completed', { metadata: { mode, level, ranked: res.ranked, score: res.score } })
    } else {
      setErrorKey(mapError(res.error))
      setScreen('error')
    }
    finishingRef.current = false
  }, [sessionId, mode, level])

  useEffect(() => {
    if (screen !== 'play' || !timed) return
    const id = setInterval(() => {
      const left = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000))
      setTimeLeft(left)
      if (left <= 0) {
        clearInterval(id)
        doFinish()
      }
    }, 250)
    return () => clearInterval(id)
  }, [screen, timed, doFinish])

  // Warn before leaving an active ranked game (refresh / close tab).
  useEffect(() => {
    if (screen !== 'play' || !ranked) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [screen, ranked])

  // ── answer ──
  const answer = useCallback(
    async (key: string | null) => {
      if (submittingRef.current || !sessionId || !question || revealed) return
      submittingRef.current = true
      setPicked(key)
      const responseMs = Date.now() - shownAtRef.current
      const res = await submitJp60Answer({ sessionId, questionId: question.id, selectedKey: key })
      if (!res.ok) {
        submittingRef.current = false
        if (res.error === 'session_expired') { doFinish(); return }
        setErrorKey(mapError(res.error)); setScreen('error'); return
      }
      setRevealed({ correctKey: res.correctKey, correct: res.correct })
      setAnswered((n) => n + 1)
      // Live (cosmetic) score mirrors the server formula; final score is server-authoritative.
      let newCombo = combo
      if (key != null && res.correct) {
        newCombo = combo + 1
        setCorrectCount((n) => n + 1)
        const pts = answerScore({ isCorrect: true, difficulty: question.difficulty as Jp60Difficulty, responseMs, comboAfter: newCombo })
        setScore((s) => s + pts)
      } else {
        newCombo = 0
      }
      setCombo(newCombo)
      setBestCombo((b) => Math.max(b, newCombo))
      trackEvent('jp60_question_answered', { metadata: { correct: res.correct, qType: res.qType } })

      // Brief reveal, then advance.
      const delay = reduceMotion ? 250 : 650
      setTimeout(() => {
        submittingRef.current = false
        if (res.next) {
          setQuestion(res.next)
          setPicked(null)
          setRevealed(null)
          shownAtRef.current = Date.now()
        } else {
          doFinish()
        }
      }, delay)
    },
    [sessionId, question, revealed, combo, reduceMotion, doFinish]
  )

  // Keyboard: 1-4 / A-D to answer.
  useEffect(() => {
    if (screen !== 'play' || !question) return
    const h = (e: KeyboardEvent) => {
      const map: Record<string, number> = { '1': 0, '2': 1, '3': 2, '4': 3, a: 0, b: 1, c: 2, d: 3 }
      const idx = map[e.key.toLowerCase()]
      if (idx != null && question.options[idx]) answer(question.options[idx].key)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [screen, question, answer])

  // ── render ──
  if (screen === 'error') {
    return (
      <Shell>
        <div className="text-center py-16">
          <p className="text-[15px] text-ink mb-6">{t(errorKey)}</p>
          <div className="flex gap-3 justify-center">
            <button onClick={() => setScreen('mode')} className="btn-secondary">{t('retry')}</button>
            <Link href="/games" className="btn-secondary">{t('back_to_games')}</Link>
          </div>
        </div>
      </Shell>
    )
  }

  if (screen === 'loading') {
    return <Shell><div className="py-24 text-center text-muted animate-pulse">{t('loading')}</div></Shell>
  }

  if (screen === 'play' && question) {
    return (
      <PlayScreen
        t={t}
        question={question}
        picked={picked}
        revealed={revealed}
        score={score}
        combo={combo}
        timed={timed}
        timeLeft={timeLeft}
        durationSec={durationSec}
        answered={answered}
        total={total}
        ranked={ranked}
        reduceMotion={reduceMotion}
        onAnswer={answer}
        onExit={() => (ranked ? setExitOpen(true) : setScreen('mode'))}
        exitOpen={exitOpen}
        onExitConfirm={() => { setExitOpen(false); setScreen('mode') }}
        onExitCancel={() => setExitOpen(false)}
      />
    )
  }

  if (screen === 'result' && summary) {
    return (
      <Shell>
        <ResultScreen
          t={t}
          summary={summary}
          level={level}
          signedIn={signedIn}
          sessionId={sessionId}
          onReview={() => setScreen('review')}
          onPlayAgain={() => start(mode, level, { count, timed })}
          onChangeLevel={() => setScreen('mode')}
        />
      </Shell>
    )
  }

  if (screen === 'review' && summary) {
    return (
      <Shell>
        <ReviewScreen t={t} review={summary.review} sessionId={sessionId} onBack={() => setScreen('result')} />
      </Shell>
    )
  }

  // mode / level setup
  return (
    <Shell>
      <SetupScreen
        t={t}
        screen={screen as 'mode' | 'level'}
        settings={settings}
        mode={mode}
        level={level}
        count={count}
        timed={timed}
        dailyDone={dailyDone}
        challengeCode={challengeCode}
        signedIn={signedIn}
        onPickMode={(m: Mode) => { setMode(m); setScreen('level') }}
        onPickLevel={setLevel}
        onPickCount={setCount}
        onToggleTimer={() => setTimed((v) => !v)}
        onBack={() => setScreen('mode')}
        onStart={() => start(mode, level, { count, timed })}
      />
    </Shell>
  )
}

/* ─────────────────────────── sub-screens ─────────────────────────── */

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="max-w-[640px] mx-auto px-5 sm:px-6 py-8 pb-20">{children}</div>
}

function SetupScreen(p: any) {
  const { t, screen, settings, mode, level, count, timed, dailyDone, challengeCode, signedIn } = p
  const enabledModes = (['daily', 'rush', 'practice'] as const).filter((m) => settings.modes[m])
  const enabledLevels = SELECTABLE_LEVELS.filter((l) => settings.levels[l])

  if (screen === 'mode') {
    return (
      <div>
        <header className="mb-6 text-center">
          <span className="inline-block text-[10.5px] font-bold tracking-[2.5px] uppercase text-rose bg-rose/10 border border-rose/20 px-3 py-1.5 rounded-full mb-3">JLPT · 60s</span>
          <h1 className="font-serif font-bold text-[clamp(24px,5vw,34px)] text-ink leading-tight">{t('title')}</h1>
          <p className="text-[14px] text-muted mt-2 max-w-[420px] mx-auto leading-relaxed">{t('subtitle')}</p>
        </header>
        <h2 className="sr-only">{t('mode_select_title')}</h2>
        <div className="space-y-3">
          {enabledModes.map((m) => (
            <button
              key={m}
              onClick={() => p.onPickMode(m)}
              className="w-full text-left bg-paper border border-line rounded-2xl p-4 hover:border-rose/40 hover:shadow-[0_4px_20px_-8px_rgba(194,24,91,0.25)] transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-serif font-bold text-[17px] text-ink">{t(`mode_${m}`)}</span>
                {m === 'practice' || !signedIn
                  ? <Badge tone="muted">{t('unranked_badge')}</Badge>
                  : <Badge tone="rose">{t('ranked_badge')}</Badge>}
              </div>
              <p className="text-[13px] text-muted leading-relaxed">{t(`mode_${m}_desc`)}</p>
            </button>
          ))}
        </div>
        <div className="flex gap-4 justify-center mt-6 text-[13px]">
          <Link href="/games/japanese-60/leaderboard" className="text-rose font-semibold hover:underline">{t('view_leaderboard')}</Link>
          {signedIn && <Link href="/games/japanese-60/stats" className="text-rose font-semibold hover:underline">{t('view_stats')}</Link>}
          <Link href="/games" className="text-muted hover:underline">{t('back_to_games')}</Link>
        </div>
      </div>
    )
  }

  // level
  return (
    <div>
      <button onClick={p.onBack} className="text-[13px] text-muted hover:text-ink mb-4">← {t('back')}</button>
      <h2 className="font-serif font-bold text-[20px] text-ink mb-4">{t('level_select_title')}</h2>
      <div className="grid grid-cols-3 gap-2.5 mb-6">
        {enabledLevels.map((l: string) => {
          const done = mode === 'daily' && dailyDone[l]
          return (
            <button
              key={l}
              onClick={() => p.onPickLevel(l)}
              aria-pressed={level === l}
              className={`relative py-3 rounded-xl border text-[15px] font-bold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose ${level === l ? 'bg-rose text-white border-rose' : 'bg-paper text-ink border-line hover:border-rose/40'}`}
            >
              {l === 'MIXED' ? t('level_mixed') : l}
              {done && <span className="absolute -top-1.5 -right-1.5 text-[8px] font-bold bg-gold text-white px-1.5 py-0.5 rounded-full">✓</span>}
            </button>
          )
        })}
        {settings.levels.MIXED && (
          <button
            onClick={() => p.onPickLevel('MIXED')}
            aria-pressed={level === 'MIXED'}
            className={`col-span-3 py-3 rounded-xl border text-[15px] font-bold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose ${level === 'MIXED' ? 'bg-rose text-white border-rose' : 'bg-paper text-ink border-line hover:border-rose/40'}`}
          >
            {t('level_mixed')}
          </button>
        )}
      </div>

      {mode === 'practice' && (
        <>
          <h3 className="text-[13px] font-bold text-ink mb-2">{t('practice_count_title')}</h3>
          <div className="grid grid-cols-3 gap-2.5 mb-5">
            {JP60_PRACTICE_COUNTS.map((c) => (
              <button key={c} onClick={() => p.onPickCount(c)} aria-pressed={count === c}
                className={`py-2.5 rounded-xl border text-[14px] font-semibold transition-all ${count === c ? 'bg-teal text-white border-teal' : 'bg-paper text-ink border-line hover:border-teal/40'}`}>
                {t('count_questions', { count: c })}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between bg-paper border border-line rounded-xl px-4 py-3 mb-2 min-h-[52px]">
            <div>
              <span className="text-[14px] text-ink font-medium block">{t('timer_label')}</span>
              <span className="text-[12px] text-muted">{timed ? t('timer_limit_on_hint', { sec: settings.duration_sec }) : t('timer_limit_off_hint')}</span>
            </div>
            <Switch checked={timed} onChange={p.onToggleTimer} label={t('timer_label')} stateOnText={t('timer_on')} stateOffText={t('timer_off')} />
          </div>
          <div className="mb-6" />
        </>
      )}

      <button onClick={p.onStart} className="w-full py-3.5 rounded-xl bg-rose text-white font-bold text-[16px] hover:bg-rose/90 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose">
        {t('start_btn')}
      </button>
      {challengeCode && <p className="text-center text-[12px] text-muted mt-3">{t('challenge_title')}: {challengeCode}</p>}
    </div>
  )
}

function PlayScreen(p: any) {
  const { t, question, picked, revealed, score, combo, timed, timeLeft, durationSec, answered, total, reduceMotion } = p
  const q: ClientQuestion = question
  const dur = durationSec || 60
  const pct = timed ? Math.max(0, Math.min(100, (timeLeft / dur) * 100)) : 100
  const danger = timed && timeLeft <= 10
  const pres = questionPresentation(q.qType)
  // Long prompts (cleaned glosses, sentences) shrink; short prompts (kanji/word) stay large.
  const promptSize = q.prompt.length > 28 ? 'clamp(18px, 4.5vw, 26px)' : 'clamp(26px, 7vw, 40px)'

  return (
    <div className="fixed inset-0 z-[130] bg-cream flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {/* top status bar */}
      <div className="shrink-0 px-4 pt-3 pb-2 border-b border-line/60">
        <div className="flex items-center justify-between gap-3 mb-2">
          <button onClick={p.onExit} aria-label={t('back')} className="w-10 h-10 -ml-1 rounded-full flex items-center justify-center text-ink hover:bg-ink/5">✕</button>
          <div className="flex items-center gap-3 sm:gap-4">
            {combo >= 2 && (
              <span className={`text-[13px] font-bold text-gold ${reduceMotion ? '' : 'animate-pulse'}`} aria-label={`${t('combo')} ${combo}`}>×{(1 + Math.min(1, (combo - 1) * 0.1)).toFixed(1)} 🔥</span>
            )}
            {total > 0 && <span className="text-[13px] text-muted tabular-nums" aria-label={`${answered}/${total}`}>{answered}/{total}</span>}
            <span className="text-[15px] font-bold text-rose tabular-nums" aria-label={`${t('score')} ${score}`}>{score}</span>
            {timed && <span className={`text-[15px] font-bold tabular-nums w-8 text-right ${danger ? 'text-rose' : 'text-ink'}`} role="timer" aria-label={`${t('time_left')} ${timeLeft}`}>{timeLeft}</span>}
          </div>
        </div>
        <div className="h-1.5 rounded-full bg-line overflow-hidden">
          <div className={`h-full rounded-full transition-[width] duration-300 ease-linear ${timed ? (danger ? 'bg-rose' : 'bg-teal') : 'bg-teal'}`}
            style={{ width: timed ? `${pct}%` : total ? `${(answered / total) * 100}%` : '0%' }} />
        </div>
      </div>

      {/* question + answers — centered in a compact card, not floating in a void */}
      <div className="flex-1 flex flex-col justify-center px-4 py-4 min-h-0 overflow-y-auto">
        <div className="w-full max-w-[480px] mx-auto">
          <div className="bg-paper border border-line rounded-2xl shadow-card px-5 py-6 text-center mb-4">
            <div className="flex items-center justify-center gap-2 mb-3">
              <span className="text-[10px] font-bold uppercase tracking-[1.5px] text-rose bg-rose/10 px-2.5 py-1 rounded-full">{t(pres.labelKey)}</span>
            </div>
            <p className="text-[13px] text-muted mb-3 leading-snug">{t(pres.instrKey)}</p>
            <p className="font-serif font-bold text-ink leading-snug break-words" lang={isJapanesePrompt(q.qType) ? 'ja' : undefined} style={{ fontSize: promptSize }}>{q.prompt}</p>
            {q.promptSub && <p className="text-[15px] text-muted mt-2" lang="ja">{q.promptSub}</p>}
          </div>

          <div className="grid grid-cols-1 gap-2.5" role="group" aria-label={t(pres.instrKey)}>
          {q.options.map((o) => {
            const isPicked = picked === o.key
            const isCorrectKey = revealed?.correctKey === o.key
            let cls = 'bg-paper border-line text-ink hover:border-rose/40'
            if (revealed) {
              if (isCorrectKey) cls = 'bg-teal/15 border-teal text-ink'
              else if (isPicked) cls = 'bg-rose/15 border-rose text-ink'
              else cls = 'bg-paper border-line text-muted opacity-70'
            }
            return (
              <button
                key={o.key}
                onClick={() => p.onAnswer(o.key)}
                disabled={!!revealed}
                className={`min-h-[52px] px-4 py-3 rounded-xl border text-[16px] font-medium text-left transition-all flex items-center gap-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose ${cls}`}
              >
                <span className="shrink-0 w-6 h-6 rounded-md bg-ink/5 text-[12px] font-bold flex items-center justify-center">{o.key}</span>
                <span className="flex-1">{o.text}</span>
                {revealed && isCorrectKey && <span aria-hidden className="text-teal">✓</span>}
                {revealed && isPicked && !isCorrectKey && <span aria-hidden className="text-rose">✕</span>}
              </button>
            )
          })}
          </div>
        </div>
      </div>

      <div className="shrink-0 px-5 py-3 text-center" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
        <button onClick={() => p.onAnswer(null)} disabled={!!revealed} className="text-[13px] text-muted hover:text-ink disabled:opacity-40 min-h-[44px] px-4">{t('skip')}</button>
      </div>

      {p.exitOpen && (
        <Dialog onClose={p.onExitCancel} title={t('exit_title')}>
          <p className="text-[14px] text-muted mb-5">{t('exit_desc')}</p>
          <div className="flex gap-3">
            <button onClick={p.onExitCancel} className="flex-1 py-2.5 rounded-xl border border-line text-ink font-semibold">{t('exit_cancel')}</button>
            <button onClick={p.onExitConfirm} className="flex-1 py-2.5 rounded-xl bg-rose text-white font-semibold">{t('exit_confirm')}</button>
          </div>
        </Dialog>
      )}
    </div>
  )
}

function ResultScreen(p: any) {
  const { t, summary, level, signedIn, sessionId } = p as { t: any; summary: FinishSummary; level: string; signedIn: boolean; sessionId: string | null }
  const [shared, setShared] = useState(false)

  const share = async () => {
    const text = t('share_text', { score: summary.score, level })
    const url = typeof window !== 'undefined' ? `${window.location.origin}/games/japanese-60` : ''
    trackEvent('jp60_result_shared', {})
    try {
      if (navigator.share) { await navigator.share({ text, url }); return }
    } catch { /* fall through */ }
    try { await navigator.clipboard.writeText(`${text} ${url}`); setShared(true); setTimeout(() => setShared(false), 2000) } catch { /* noop */ }
  }

  return (
    <div>
      <div className="text-center mb-6">
        {summary.isPersonalRecord && <p className="text-[13px] font-bold text-gold mb-2">🏆 {t('result_personal_best')}</p>}
        <p className="text-[12px] uppercase tracking-wide text-muted">{t('result_title')}</p>
        <p className="font-serif font-bold text-rose tabular-nums" style={{ fontSize: 'clamp(44px,12vw,72px)' }}>{summary.score}</p>
        {!summary.ranked && <p className="text-[12px] text-muted">{t('result_unranked_note')}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-5">
        <Cell label={t('result_correct')} value={`${summary.correct}`} tone="teal" />
        <Cell label={t('result_wrong')} value={`${summary.wrong}`} tone="rose" />
        <Cell label={t('result_accuracy')} value={`${summary.accuracy}%`} />
        <Cell label={t('result_best_combo')} value={`×${summary.bestCombo}`} />
        <Cell label={t('result_avg_time')} value={`${(summary.avgCorrectMs / 1000).toFixed(1)}s`} />
        {summary.streakCurrent != null
          ? <Cell label={t('result_streak')} value={t('result_days', { n: summary.streakCurrent })} />
          : <Cell label={t('result_xp')} value={`+${summary.xp}`} />}
      </div>

      {signedIn && summary.persisted && (
        <div className="bg-paper border border-line rounded-2xl p-4 mb-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[13px] font-bold text-ink">{t('result_level')} {summary.level_now}</span>
            <span className="text-[13px] font-bold text-rose">+{summary.xp} XP</span>
          </div>
          <div className="h-2.5 rounded-full bg-line overflow-hidden">
            <div className="h-full bg-gradient-to-r from-rose to-gold rounded-full transition-[width] duration-700" style={{ width: `${Math.round((summary.level_progress ?? 0) * 100)}%` }} />
          </div>
        </div>
      )}

      {summary.newAchievements.length > 0 && (
        <div className="mb-5">
          <div className="flex flex-wrap gap-2">
            {summary.newAchievements.map((code) => {
              const def = JP60_ACHIEVEMENTS.find((a) => a.code === code)
              return (
                <span key={code} className="inline-flex items-center gap-1.5 bg-gold/10 border border-gold/30 rounded-full px-3 py-1.5 text-[12px] font-semibold text-ink">
                  <span aria-hidden>{def?.icon ?? '🏅'}</span>{t(`ach.${code}.title`)}
                </span>
              )
            })}
          </div>
        </div>
      )}

      {!signedIn && (
        <div className="bg-rose/5 border border-rose/20 rounded-2xl p-4 mb-5 text-center">
          <p className="text-[13px] text-ink mb-3">{t('result_guest_note')}</p>
          <Link href="/login" className="inline-block px-5 py-2 rounded-lg bg-rose text-white font-semibold text-[14px]">{t('result_sign_in')}</Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 mb-3">
        <button onClick={p.onPlayAgain} className="py-3 rounded-xl bg-rose text-white font-bold">{t('play_again')}</button>
        <button onClick={p.onReview} className="py-3 rounded-xl border border-line text-ink font-semibold">{t('view_review')}</button>
        <button onClick={share} className="py-3 rounded-xl border border-line text-ink font-semibold">{shared ? t('share_copied') : t('share')}</button>
        {signedIn && sessionId
          ? <ChallengeButton sessionId={sessionId} label={t('challenge_friend')} copyLabel={t('challenge_copy_link')} />
          : <button onClick={p.onChangeLevel} className="py-3 rounded-xl border border-line text-ink font-semibold">{t('change_level')}</button>}
      </div>
      <div className="flex justify-center gap-4 text-[13px]">
        <Link href="/games/japanese-60/leaderboard" className="text-rose font-semibold hover:underline">{t('view_leaderboard')}</Link>
        <Link href="/games" className="text-muted hover:underline">{t('back_to_games')}</Link>
      </div>
    </div>
  )
}

function ReviewScreen({ t, review, sessionId, onBack }: { t: any; review: ReviewItem[]; sessionId: string | null; onBack: () => void }) {
  const wrong = review.filter((r) => !r.isCorrect)
  const list = wrong.length > 0 ? wrong : review
  return (
    <div>
      <button onClick={onBack} className="text-[13px] text-muted hover:text-ink mb-4">← {t('back')}</button>
      <h2 className="font-serif font-bold text-[20px] text-ink mb-4">{t('review_title')}</h2>
      {wrong.length === 0 && <p className="text-[14px] text-teal font-semibold mb-4">{t('review_all_correct')}</p>}
      <div className="space-y-3">
        {list.map((r, i) => <ReviewCard key={i} t={t} item={r} sessionId={sessionId} />)}
      </div>
    </div>
  )
}

function ReviewCard({ t, item, sessionId }: { t: any; item: ReviewItem; sessionId: string | null }) {
  const [reportOpen, setReportOpen] = useState(false)
  const correctText = item.options.find((o) => o.key === item.correctKey)?.text ?? ''
  const yourText = item.selectedKey ? item.options.find((o) => o.key === item.selectedKey)?.text ?? '' : null
  return (
    <div className={`bg-paper border rounded-2xl p-4 ${item.isCorrect ? 'border-teal/30' : 'border-rose/30'}`}>
      <p className="font-serif font-bold text-[18px] text-ink mb-1">{item.prompt}</p>
      {item.promptSub && <p className="text-[13px] text-muted mb-2">{item.promptSub}</p>}
      <dl className="text-[13px] space-y-1 mt-2">
        {!item.isCorrect && (
          <div className="flex gap-2"><dt className="text-muted shrink-0">{t('review_your_answer')}:</dt><dd className="text-rose font-medium">{yourText ?? t('review_no_answer')}</dd></div>
        )}
        <div className="flex gap-2"><dt className="text-muted shrink-0">{t('review_correct_answer')}:</dt><dd className="text-teal font-semibold">{correctText}</dd></div>
        {item.explanation && <div className="flex gap-2"><dt className="text-muted shrink-0">→</dt><dd className="text-ink">{item.explanation}</dd></div>}
      </dl>
      <button onClick={() => setReportOpen(true)} className="text-[11px] text-muted hover:text-rose mt-2">{t('report_question')}</button>
      {reportOpen && <ReportDialog t={t} item={item} sessionId={sessionId} onClose={() => setReportOpen(false)} />}
    </div>
  )
}

function ReportDialog({ t, item, sessionId, onClose }: { t: any; item: ReviewItem; sessionId: string | null; onClose: () => void }) {
  const [reason, setReason] = useState<string>('wrong_answer')
  const [note, setNote] = useState('')
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    setBusy(true)
    trackEvent('jp60_question_reported', { metadata: { reason } })
    await reportJp60Question({
      sessionId, sourceType: item.sourceType, sourceId: item.sourceId, qType: item.qType,
      questionText: item.prompt, options: item.options,
      correctAnswer: item.options.find((o) => o.key === item.correctKey)?.text ?? '',
      reason, note, locale: typeof document !== 'undefined' ? document.documentElement.lang : undefined,
    })
    setDone(true); setBusy(false)
  }
  return (
    <Dialog onClose={onClose} title={t('report_title')}>
      {done ? (
        <p className="text-[14px] text-teal py-4 text-center">{t('report_thanks')}</p>
      ) : (
        <>
          <label className="block text-[12px] font-bold text-ink mb-1.5">{t('report_reason')}</label>
          <select value={reason} onChange={(e) => setReason(e.target.value)} className="w-full border border-line rounded-lg px-3 py-2 text-[14px] bg-paper mb-3">
            {REPORT_REASONS.map((r) => <option key={r} value={r}>{t(`reason_${r}`)}</option>)}
          </select>
          <label className="block text-[12px] font-bold text-ink mb-1.5">{t('report_note')}</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder={t('report_note_ph')} className="w-full border border-line rounded-lg px-3 py-2 text-[14px] bg-paper mb-4" />
          <button onClick={submit} disabled={busy} className="w-full py-2.5 rounded-xl bg-rose text-white font-semibold disabled:opacity-50">{t('report_submit')}</button>
        </>
      )}
    </Dialog>
  )
}

/* ─────────────────────────── primitives ─────────────────────────── */

function Stat({ label, value }: { label: string; value: number }) {
  return <span className="text-[15px] font-bold text-ink tabular-nums" aria-label={`${label} ${value}`}>{value}</span>
}
function Cell({ label, value, tone }: { label: string; value: string; tone?: 'teal' | 'rose' }) {
  const c = tone === 'teal' ? 'text-teal' : tone === 'rose' ? 'text-rose' : 'text-ink'
  return (
    <div className="bg-paper border border-line rounded-xl p-3 text-center">
      <p className="text-[11px] text-muted mb-0.5">{label}</p>
      <p className={`text-[20px] font-bold tabular-nums ${c}`}>{value}</p>
    </div>
  )
}
function Badge({ children, tone }: { children: React.ReactNode; tone: 'rose' | 'muted' }) {
  const c = tone === 'rose' ? 'bg-rose text-white' : 'bg-ink/5 text-muted'
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${c}`}>{children}</span>
}

function Dialog({ children, title, onClose }: { children: React.ReactNode; title: string; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const first = ref.current?.querySelector<HTMLElement>('button,select,textarea,a,input')
    first?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', onKey) }
  }, [onClose])
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-ink/40 p-4" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div ref={ref} className="bg-cream rounded-2xl p-5 w-full max-w-[420px] max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-serif font-bold text-[18px] text-ink mb-3">{title}</h3>
        {children}
      </div>
    </div>
  )
}

function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(false)
  useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduce(m.matches)
    const h = () => setReduce(m.matches)
    m.addEventListener('change', h)
    return () => m.removeEventListener('change', h)
  }, [])
  return reduce
}

// Prompts that display Japanese script (so we can tag lang="ja" for correct font).
function isJapanesePrompt(qType: string): boolean {
  return qType === 'vocab_ja_to_meaning' || qType === 'vocab_reading' ||
    qType === 'kanji_to_meaning' || qType === 'kanji_reading' || qType === 'grammar_blank' ||
    qType === 'grammar_pattern_to_meaning'
}

function mapError(err?: string): string {
  const map: Record<string, string> = {
    game_disabled: 'err_game_disabled', mode_disabled: 'err_mode_disabled', level_disabled: 'err_level_disabled',
    no_questions: 'err_no_questions', rate_limited: 'err_rate_limited', session_expired: 'err_session_expired',
    challenge_not_found: 'err_challenge_not_found', challenge_expired: 'err_challenge_expired',
    not_authenticated: 'err_not_authenticated',
  }
  return (err && map[err]) || 'err_generic'
}
