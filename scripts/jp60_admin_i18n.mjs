// i18n injector for the jp60 admin panel. Run: node scripts/jp60_admin_i18n.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'messages')

const T = {
  en: {
    title: '60-Second Challenge', breadcrumb: 'JP 60s Game', back: 'Back to admin',
    game_enabled: 'Game enabled', modes: 'Modes', levels: 'Levels',
    duration: 'Duration (sec)', daily_questions: 'Daily questions', save: 'Save settings', saved: 'Saved',
    mode_daily: 'Daily Challenge', mode_rush: '60-Second Rush', mode_practice: 'Practice',
    stats: 'Eligibility (published items)', sessions: 'Sessions', completed: 'Completed', suspicious: 'Suspicious',
    reports: 'Question reports', no_reports: 'No open reports', reason: 'Reason', note: 'Note',
    mark_reviewed: 'Mark reviewed', dismiss: 'Dismiss', disable_item: 'Disable from game',
    disabled_items: 'Disabled items', invalidate: 'Invalidate session', enable: 'Enabled', disable: 'Disabled',
  },
  vi: {
    title: 'Thử thách 60 giây', breadcrumb: 'Game JP 60s', back: 'Về trang admin',
    game_enabled: 'Bật trò chơi', modes: 'Chế độ', levels: 'Cấp độ',
    duration: 'Thời lượng (giây)', daily_questions: 'Số câu hằng ngày', save: 'Lưu cài đặt', saved: 'Đã lưu',
    mode_daily: 'Thử thách hằng ngày', mode_rush: 'Tăng tốc 60 giây', mode_practice: 'Luyện tập',
    stats: 'Đủ điều kiện (đã xuất bản)', sessions: 'Phiên', completed: 'Hoàn thành', suspicious: 'Đáng ngờ',
    reports: 'Báo lỗi câu hỏi', no_reports: 'Không có báo lỗi', reason: 'Lý do', note: 'Ghi chú',
    mark_reviewed: 'Đã xử lý', dismiss: 'Bỏ qua', disable_item: 'Loại khỏi game',
    disabled_items: 'Mục đã loại', invalidate: 'Vô hiệu phiên', enable: 'Bật', disable: 'Tắt',
  },
  ja: {
    title: '60秒チャレンジ', breadcrumb: 'JP 60sゲーム', back: '管理に戻る',
    game_enabled: 'ゲーム有効', modes: 'モード', levels: 'レベル',
    duration: '制限時間（秒）', daily_questions: 'デイリー問題数', save: '設定を保存', saved: '保存しました',
    mode_daily: 'デイリーチャレンジ', mode_rush: '60秒ラッシュ', mode_practice: '練習',
    stats: '対象（公開済み）', sessions: 'セッション', completed: '完了', suspicious: '不審',
    reports: '問題の報告', no_reports: '未対応の報告なし', reason: '理由', note: 'メモ',
    mark_reviewed: '対応済みにする', dismiss: '却下', disable_item: 'ゲームから除外',
    disabled_items: '除外項目', invalidate: 'セッション無効化', enable: '有効', disable: '無効',
  },
  ko: {
    title: '60초 챌린지', breadcrumb: 'JP 60s 게임', back: '관리로 돌아가기',
    game_enabled: '게임 활성화', modes: '모드', levels: '레벨',
    duration: '제한 시간(초)', daily_questions: '데일리 문제 수', save: '설정 저장', saved: '저장됨',
    mode_daily: '데일리 챌린지', mode_rush: '60초 러시', mode_practice: '연습',
    stats: '대상(공개됨)', sessions: '세션', completed: '완료', suspicious: '의심',
    reports: '문제 신고', no_reports: '대기 중인 신고 없음', reason: '사유', note: '메모',
    mark_reviewed: '검토 완료', dismiss: '무시', disable_item: '게임에서 제외',
    disabled_items: '제외 항목', invalidate: '세션 무효화', enable: '활성', disable: '비활성',
  },
  zh: {
    title: '60秒挑战', breadcrumb: 'JP 60s游戏', back: '返回管理',
    game_enabled: '启用游戏', modes: '模式', levels: '级别',
    duration: '时长（秒）', daily_questions: '每日题数', save: '保存设置', saved: '已保存',
    mode_daily: '每日挑战', mode_rush: '60秒冲刺', mode_practice: '练习',
    stats: '符合条件（已发布）', sessions: '场次', completed: '完成', suspicious: '可疑',
    reports: '问题报告', no_reports: '没有待处理报告', reason: '原因', note: '备注',
    mark_reviewed: '标记已处理', dismiss: '忽略', disable_item: '从游戏中禁用',
    disabled_items: '已禁用项', invalidate: '作废场次', enable: '启用', disable: '禁用',
  },
}

for (const locale of ['vi', 'en', 'ja', 'ko', 'zh']) {
  const file = join(root, `${locale}.json`)
  const json = JSON.parse(readFileSync(file, 'utf8'))
  json.admin_jp60 = T[locale]
  writeFileSync(file, JSON.stringify(json, null, 2) + '\n', 'utf8')
  console.log(`updated ${locale}.json (admin_jp60: ${Object.keys(T[locale]).length} keys)`)
}
