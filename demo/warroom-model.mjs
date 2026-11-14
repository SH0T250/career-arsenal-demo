// War Room view logic: pure functions over /api/data, shared by the browser and the tests.
// Every number here is counted from the tracker, the status ledger or the inbox. Nothing is estimated.
import { profilesOf, isoLocal, today, followUps, scoreOf } from './mission-model.mjs';

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86400000;
const day = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const plus = (iso, k) => { const d = day(iso); d.setDate(d.getDate() + k); return isoLocal(d); };
const daysBetween = (a, b) => Math.round((day(a) - day(b)) / DAY_MS);

// Weeks run Monday to Sunday.
export const weekStart = (iso) => plus(iso, -((day(iso).getDay() + 6) % 7));

// A move into one of these states means the company answered.
const REPLY = new Set(['Responded', 'Assessment', 'Interview', 'Offer', 'Hired', 'Rejected']);

// Applications sent, first replies and interview moves per week, oldest first, ending with the week of `t`.
// Each tracker row counts once per column, in the week it first happened.
export function weeklyActivity(log = [], t = today(), n = 8) {
  const last = weekStart(t);
  const weeks = Array.from({ length: n }, (_, i) => { const from = plus(last, -7 * (n - 1 - i)); return { from, to: plus(from, 6), applied: 0, replies: 0, interviews: 0 }; });
  const at = new Map(weeks.map((w, i) => [w.from, i]));
  const seen = { applied: new Set(), replies: new Set(), interviews: new Set() };
  const hit = (col, e) => {
    if (seen[col].has(e.num)) return;
    seen[col].add(e.num);
    const w = weeks[at.get(weekStart(e.date))];
    if (w) w[col] += 1;
  };
  for (const e of log) {
    if (!ISO_DAY.test(e.date || '')) continue;
    if (e.to === 'Applied') hit('applied', e);
    if (REPLY.has(e.to)) hit('replies', e);
    if (e.to === 'Interview') hit('interviews', e);
  }
  const max = Math.max(0, ...weeks.map((w) => w.applied));
  // The busiest week is the one lit up by default; the latest wins a tie.
  const hot = max ? weeks.reduce((best, w, i) => (w.applied >= weeks[best].applied ? i : best), 0) : null;
  return { weeks, max, hot };
}

// A row can carry more than one profile tag; the narrowest one names its lane.
export const laneOf = (x) => { const p = profilesOf(x); return p.includes('gigs') ? 'gigs' : p.includes('stack') ? 'stack' : 'career'; };
const OUTCOME = { Applied: 'waiting', Responded: 'talking', Assessment: 'talking', Interview: 'talking', Offer: 'offer', Hired: 'offer', Rejected: 'closed' };
export const FLOW_LANES = [['career', 'Career'], ['stack', 'Flexible'], ['gigs', 'Gigs']];
export const FLOW_OUTCOMES = [['waiting', 'Waiting'], ['talking', 'Talking'], ['offer', 'Offer'], ['closed', 'Closed']];

// Every application that was sent, by lane, and where it stands today.
// Rows never sent (Evaluated, SKIP) and rows Austin dropped (Discarded) are left out.
export function pipelineFlow(rows = []) {
  const lanes = Object.fromEntries(FLOW_LANES.map(([id]) => [id, 0]));
  const outcomes = Object.fromEntries(FLOW_OUTCOMES.map(([id]) => [id, 0]));
  const links = new Map();
  let total = 0;
  for (const r of rows) {
    const to = OUTCOME[r.status];
    if (!to) continue;
    const from = laneOf(r);
    lanes[from] += 1; outcomes[to] += 1; total += 1;
    links.set(`${from}>${to}`, (links.get(`${from}>${to}`) || 0) + 1);
  }
  return { total, lanes, outcomes, links: [...links].map(([k, n]) => { const [from, to] = k.split('>'); return { from, to, n }; }) };
}

const hoursOf = (b) => {
  const m = (s) => { const x = String(s || '').match(/^(\d{1,2}):(\d{2})$/); return x ? Number(x[1]) + Number(x[2]) / 60 : null; };
  const a = m(b.start); const z = m(b.end);
  return a == null || z == null || z <= a ? 0 : (z - a) * (Array.isArray(b.days) ? b.days.length : 0);
};

// Hours already spoken for each week against the stack budget: jobs on file plus recurring study blocks.
export function capacity(ctx, studyPlan = [], t = today()) {
  const budget = Number(ctx?.budget) || null;
  const jobs = (ctx?.jobs || []).map((j) => ({ name: j.codename || 'J1', hours: Number(j.realHours) || 0, known: j.realHours != null }));
  const study = (studyPlan || []).filter((b) => !b.from || b.from <= t).map((b) => ({ name: b.title || 'Study', hours: hoursOf(b) })).filter((b) => b.hours > 0);
  const committed = jobs.reduce((s, j) => s + j.hours, 0) + study.reduce((s, b) => s + b.hours, 0);
  return { budget, jobs, study, committed, free: budget == null ? null : Math.max(0, budget - committed) };
}

// Small lists behind the accordion on the right of the War Room.
export function attention(d, m, t = today()) {
  const soon = plus(t, 3);
  const follow = followUps(d).filter((n) => n.due <= soon);
  const deadlines = (d.mail?.needsAction || [])
    .filter((n) => n.kind !== 'followup' && ISO_DAY.test(n.due || '') && n.due >= t && n.due <= plus(t, 14))
    .sort((a, b) => a.due.localeCompare(b.due));
  const review = (m.lanes?.review || []).filter((r) => (r.sc ?? scoreOf(r.score) ?? 0) >= 4);
  return { follow, deadlines, review };
}

// Plain-language cards computed from the same data. Tones: gold = look at this, violet = pace, mint = opening.
export function insights(d, m, t = today()) {
  const out = [];
  const waiting = (m.lanes?.applied || []).filter((r) => { const a = m.appliedAt?.(r) || r.date; return ISO_DAY.test(a || '') && daysBetween(t, a) >= 14; });
  if (waiting.length) {
    const sent = Number(d.stats?.followups?.totalFollowups) || 0;
    out.push({ tone: 'gold', tag: 'Attention', title: `${waiting.length} application${waiting.length === 1 ? '' : 's'} waiting 14 days or more`,
      body: `No reply logged on ${waiting.length === 1 ? 'it' : 'them'} yet. ${sent} follow-up${sent === 1 ? '' : 's'} sent so far.`, cta: 'Open follow-ups', go: 'interviews' });
  }
  const { weeks } = weeklyActivity(d.statusLog || [], t, 5);
  const prior = weeks.slice(0, 4);
  const avg = prior.reduce((s, w) => s + w.applied, 0) / 4;
  const now = weeks[4].applied;
  if (avg > 0 || now > 0) {
    out.push({ tone: 'violet', tag: 'Pace', title: `${now} sent this week, ${now >= avg ? 'at or above' : 'below'} your average`,
      body: `Your last four weeks averaged ${Number.isInteger(avg) ? avg : avg.toFixed(1)} a week.`, cta: 'See applications', go: 'applications' });
  }
  const inbox = m.lanes?.inbox || [];
  const strong = inbox.filter((x) => x.stack?.grade === 'strong');
  if (strong.length) {
    const jd = strong.filter((x) => x.stack.basis === 'jd').length;
    out.push({ tone: 'mint', tag: 'Opportunity', title: `${strong.length} strong sample match${strong.length === 1 ? '' : 'es'} in the inbox`,
      body: `${jd} graded from the full job description, ${strong.length - jd} from the title alone.`, cta: 'See the slots', go: 'stacking' });
  }
  const hi = (m.lanes?.review || []).filter((r) => (r.sc ?? 0) >= 4).length;
  if (hi) {
    out.push({ tone: 'mint', tag: 'Opportunity', title: `${hi} role${hi === 1 ? '' : 's'} scored 4.0 or higher, not sent yet`,
      body: 'Evaluated and waiting on your call to apply or skip.', cta: 'Review them', go: 'applications' });
  }
  return out;
}
