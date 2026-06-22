import 'server-only';
import { unstable_cache } from 'next/cache';

// Public community-activity signals for the Explore landing page. All are
// aggregate / public data (no private user info), read via the service-role
// client (no cookies → cacheable) and wrapped in unstable_cache. Every loader
// degrades to [] / {} when its table is missing (pre-migration safe).

export interface QuestionNeedingAnswer {
  id: string;
  placeSlug: string;
  content: string;
  createdAt: string;
}

/** Approved questions (kind='question') that have no answer yet. */
const loadOpenQuestions = unstable_cache(
  async (): Promise<QuestionNeedingAnswer[]> => {
    try {
      const { createAdminClient } = await import('@/lib/supabase/admin');
      const admin = createAdminClient();
      const { data, error } = await admin
        .from('place_comments')
        .select('id, place_slug, content, created_at, parent_id, kind, status')
        .eq('kind', 'question')
        .eq('status', 'approved')
        .order('created_at', { ascending: false })
        .limit(40);
      if (error || !data) return []; // pre-migration (no kind column) → empty
      const questions = data as { id: string; place_slug: string; content: string; created_at: string }[];
      // Which question ids already have an answer?
      const ids = questions.map((q) => q.id);
      const answered = new Set<string>();
      if (ids.length) {
        const { data: ans } = await admin
          .from('place_comments')
          .select('parent_id')
          .eq('kind', 'answer')
          .in('parent_id', ids);
        for (const a of (ans ?? []) as { parent_id: string }[]) if (a.parent_id) answered.add(a.parent_id);
      }
      return questions
        .filter((q) => !answered.has(q.id))
        .slice(0, 6)
        .map((q) => ({ id: q.id, placeSlug: q.place_slug, content: q.content, createdAt: q.created_at }));
    } catch {
      return [];
    }
  },
  ['feed-open-questions-v1'],
  { tags: ['community-feed'], revalidate: 300 },
);

export async function getQuestionsNeedingAnswers(): Promise<QuestionNeedingAnswer[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return [];
  return loadOpenQuestions();
}

/** place_slug → save count, for "popular saved places" (only real data). */
const loadSaveCounts = unstable_cache(
  async (): Promise<Record<string, number>> => {
    try {
      const { createAdminClient } = await import('@/lib/supabase/admin');
      const admin = createAdminClient();
      const { data, error } = await admin.from('place_saves').select('place_slug').limit(5000);
      if (error || !data) return {};
      const counts: Record<string, number> = {};
      for (const r of data as { place_slug: string }[]) counts[r.place_slug] = (counts[r.place_slug] ?? 0) + 1;
      return counts;
    } catch {
      return {};
    }
  },
  ['feed-save-counts-v1'],
  { tags: ['community-feed'], revalidate: 600 },
);

/** Slugs of the most-saved places (min N saves so it's backed by real data). */
export async function getPopularSavedSlugs(minSaves = 2, limit = 8): Promise<string[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return [];
  const counts = await loadSaveCounts();
  return Object.entries(counts)
    .filter(([, n]) => n >= minSaves)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([slug]) => slug);
}
