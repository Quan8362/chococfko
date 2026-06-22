// Pure helpers for place Q&A: report-kind validation, thread building, sorting.

export const REPORT_KINDS = [
  'price_changed', 'hours_changed', 'temporarily_closed', 'permanently_closed',
  'reservation_invalid', 'wrong_address', 'wrong_map', 'facility_incorrect', 'image_outdated', 'other',
] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export function isReportKind(s: string | null | undefined): s is ReportKind {
  return !!s && (REPORT_KINDS as readonly string[]).includes(s);
}

export interface QaRow {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  author_name: string | null;
  author_avatar: string | null;
  kind: string;
  parent_id: string | null;
  helpful: boolean;
  status?: string;
}

export interface QaAnswer {
  id: string; user_id: string; content: string; created_at: string;
  author_name: string | null; author_avatar: string | null; helpful: boolean;
}
export interface QaQuestion extends QaAnswer { answers: QaAnswer[] }

/** Build nested question→answers threads from flat rows (approved only). */
export function buildQuestionThreads(rows: QaRow[]): QaQuestion[] {
  const approved = rows.filter((r) => (r.status ?? 'approved') === 'approved');
  const answersByParent = new Map<string, QaAnswer[]>();
  for (const r of approved) {
    if (r.kind === 'answer' && r.parent_id) {
      const a: QaAnswer = { id: r.id, user_id: r.user_id, content: r.content, created_at: r.created_at, author_name: r.author_name, author_avatar: r.author_avatar, helpful: r.helpful };
      const list = answersByParent.get(r.parent_id) ?? [];
      list.push(a);
      answersByParent.set(r.parent_id, list);
    }
  }
  return approved
    .filter((r) => r.kind === 'question')
    .map((r) => ({
      id: r.id, user_id: r.user_id, content: r.content, created_at: r.created_at,
      author_name: r.author_name, author_avatar: r.author_avatar, helpful: r.helpful,
      // helpful answers first, then newest
      answers: (answersByParent.get(r.id) ?? []).sort((a, b) => Number(b.helpful) - Number(a.helpful) || b.created_at.localeCompare(a.created_at)),
    }));
}

export type QaSort = 'newest' | 'helpful';

function helpfulCount(q: QaQuestion): number {
  return q.answers.reduce((n, a) => n + (a.helpful ? 1 : 0), 0);
}

/** Sort questions by newest or by "most helpful" (helpful answers, then answer count). */
export function sortQuestions(questions: QaQuestion[], sort: QaSort): QaQuestion[] {
  const copy = [...questions];
  if (sort === 'helpful') {
    copy.sort((a, b) => helpfulCount(b) - helpfulCount(a) || b.answers.length - a.answers.length || b.created_at.localeCompare(a.created_at));
  } else {
    copy.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  return copy;
}

/** Visit-count wording key + value (never exposes who/when). */
export function visitLabelKey(count: number): 'none' | 'some' {
  return count > 0 ? 'some' : 'none';
}
