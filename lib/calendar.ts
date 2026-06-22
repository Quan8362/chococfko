// Pure export helpers: .ics calendar, Google Calendar link, text summary.
// Calendar events are only ever generated for explicit user actions (download /
// open link) — never added silently. Times are Asia/Tokyo.

export interface CalStop {
  title: string;
  date?: string | null;        // 'YYYY-MM-DD'
  arrivalTime?: string | null; // 'HH:MM'
  departureTime?: string | null;
  durationMinutes?: number | null;
  location?: string | null;
  note?: string | null;
  estCost?: number | null;
}

function pad(n: number): string { return String(n).padStart(2, '0'); }

/** Local floating datetime "YYYYMMDDTHHMMSS" from date + time (+ minutes offset). */
function dt(date: string, time: string, addMin = 0): string | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const tm = /^(\d{2}):(\d{2})/.exec(time);
  if (!dm || !tm) return null;
  let total = Number(tm[1]) * 60 + Number(tm[2]) + addMin;
  let dayShift = 0;
  while (total >= 1440) { total -= 1440; dayShift += 1; }
  const base = new Date(Date.UTC(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]) + dayShift));
  const hh = Math.floor(total / 60); const mi = total % 60;
  return `${base.getUTCFullYear()}${pad(base.getUTCMonth() + 1)}${pad(base.getUTCDate())}T${pad(hh)}${pad(mi)}00`;
}

function endStamp(s: CalStop): string | null {
  if (!s.date || !s.arrivalTime) return null;
  if (s.departureTime) return dt(s.date, s.departureTime);
  const dur = s.durationMinutes && s.durationMinutes > 0 ? s.durationMinutes : 60;
  return dt(s.date, s.arrivalTime, dur);
}

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

/** Build a VCALENDAR with one VEVENT per stop that has a date + arrival time. */
export function buildICS(planTitle: string, stops: CalStop[]): string {
  const lines: string[] = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Chococfko//Explore//VI', 'CALSCALE:GREGORIAN'];
  let n = 0;
  stops.forEach((s, i) => {
    if (!s.date || !s.arrivalTime) return;
    const start = dt(s.date, s.arrivalTime);
    const end = endStamp(s);
    if (!start || !end) return;
    n += 1;
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:chococfko-${esc(planTitle)}-${i}@chococfko.com`);
    lines.push(`SUMMARY:${esc(s.title)}`);
    lines.push(`DTSTART;TZID=Asia/Tokyo:${start}`);
    lines.push(`DTEND;TZID=Asia/Tokyo:${end}`);
    if (s.location) lines.push(`LOCATION:${esc(s.location)}`);
    const details = [s.note, s.estCost != null ? `~¥${s.estCost}` : ''].filter(Boolean).join(' · ');
    if (details) lines.push(`DESCRIPTION:${esc(details)}`);
    lines.push('END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return n > 0 ? lines.join('\r\n') : '';
}

/** Google Calendar "add event" link for a single stop (opened on user action). */
export function gcalUrl(s: CalStop): string | null {
  if (!s.date || !s.arrivalTime) return null;
  const start = dt(s.date, s.arrivalTime);
  const end = endStamp(s);
  if (!start || !end) return null;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: s.title,
    dates: `${start}/${end}`,
    ctz: 'Asia/Tokyo',
  });
  const details = [s.note, s.estCost != null ? `~¥${s.estCost}` : ''].filter(Boolean).join(' · ');
  if (details) params.set('details', details);
  if (s.location) params.set('location', s.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Plain-text, copyable plan summary. */
export function planSummaryText(planTitle: string, planDate: string | null | undefined, stops: CalStop[]): string {
  const head = planDate ? `${planTitle} — ${planDate}` : planTitle;
  const body = stops.map((s, i) => {
    const time = s.arrivalTime ? ` ${s.arrivalTime}${s.departureTime ? `–${s.departureTime}` : ''}` : '';
    const cost = s.estCost != null ? ` (~¥${s.estCost})` : '';
    const note = s.note ? `\n   ${s.note}` : '';
    return `${i + 1}. ${s.title}${time}${cost}${note}`;
  }).join('\n');
  return `${head}\n${body}`.trim();
}
