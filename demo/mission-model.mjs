// Mission Control data model: tracker + pipeline payload -> board lanes.
// Pure (no DOM), so the page imports it and the node tests import it too.

export const scoreOf = (s) => { const m = String(s || '').match(/(\d+(?:\.\d+)?)\s*\/\s*5/); return m ? Number(m[1]) : null; };
export const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const today = () => isoLocal(new Date());

// Search profile switch: narrow the jobs to one profile ('all' leaves the data as is).
// Untagged jobs count as Career. Interviews, mail and LinkedIn are not profile jobs,
// so they stay; the status log follows the kept rows so per-day counts match.
export const PROFILES = ['career', 'stack', 'gigs'];
export const profilesOf = (x) => (Array.isArray(x?.profiles) && x.profiles.length ? x.profiles : ['career']);
export function profileView(d, profile) {
  if (!PROFILES.includes(profile)) return d;
  const has = (x) => profilesOf(x).includes(profile);
  const tracker = (d.tracker || []).filter(has);
  const nums = new Set(tracker.map((r) => Number(r.num)));
  return {
    ...d,
    tracker,
    statusLog: (d.statusLog || []).filter((e) => nums.has(Number(e.num))),
    pipeline: d.pipeline && { ...d.pipeline, pending: (d.pipeline.pending || []).filter(has) },
    // The On-site list is on-site Career work by definition, so only Career keeps it.
    scanAgg: d.scanAgg && { ...d.scanAgg, onsite: profile === 'career' ? d.scanAgg.onsite : [] },
  };
}

export function parseInbox(p) {
  const parts = String(p.text || '').split(' | ').map((s) => s.trim());
  const url = /^https?:/.test(parts[0]) ? parts[0] : '';
  const rest = url ? parts.slice(1) : parts;
  const loc = rest[2] && !/^posted:/i.test(rest[2]) ? rest[2] : '';
  return {
    // Keyed by posting identity, not list position: a selection must survive
    // earlier items being processed out of the inbox between refreshes.
    key: `inbox:${url || p.text}`, kind: 'inbox', company: rest[0] || 'Unknown company', role: rest[1] || '', loc, url,
    posted: (p.text.match(/posted:\s*(\d{4}-\d{2}-\d{2})/) || [])[1] || null, jev: p.jev || null, profiles: profilesOf(p), stack: p.stack || null,
  };
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const plusDays = (iso, k) => { const [y, m, dd] = iso.split('-').map(Number); return isoLocal(new Date(y, m - 1, dd + k)); };

// Follow-up dates logged in mail.needsAction with kind 'followup', soonest first.
export const followUps = (d) => (d.mail?.needsAction || [])
  .filter((n) => n.kind === 'followup' && ISO_DAY.test(n.due || ''))
  .sort((a, b) => a.due.localeCompare(b.due));

// Interviews-page calendar: every dated thing per day for n days from startIso.
// Kinds: interview, followup, deadline (other dated needsAction items), study (recurring plan blocks).
export function calendarDays(d, startIso, n = 14) {
  const days = [];
  for (let k = 0; k < n; k++) days.push({ iso: plusDays(startIso, k), items: [] });
  const at = new Map(days.map((x) => [x.iso, x.items]));
  for (const iv of d.interviews || []) at.get(iv.date)?.push({ kind: 'interview', time: iv.time || '', title: iv.company, sub: iv.round || 'Interview', iv });
  for (const n2 of d.mail?.needsAction || []) {
    if (!ISO_DAY.test(n2.due || '')) continue;
    at.get(n2.due)?.push({ kind: n2.kind === 'followup' ? 'followup' : 'deadline', time: '', title: n2.who, sub: n2.what });
  }
  for (const b of d.studyPlan || []) {
    for (const day of days) {
      const wd = new Date(`${day.iso}T12:00:00`).getDay();
      if ((b.from && day.iso < b.from) || (Array.isArray(b.days) && !b.days.includes(wd))) continue;
      day.items.push({ kind: 'study', time: b.start || '', title: b.title, sub: b.start && b.end ? `${b.start}-${b.end}` : '', block: b });
    }
  }
  // Untimed items (follow-ups, deadlines) first, then by time.
  for (const day of days) day.items.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  return days;
}

// Sidebar status: is each feed fresh? 36 hours gives a daily job room to run late;
// the mail sweep is run by hand, so it gets 3 days before it reads as stale.
export function systemStatus(d, now = Date.now()) {
  const hrs = (iso) => (now - Date.parse(iso)) / 3600000;
  const fresh = (iso, maxHrs) => { const h = hrs(iso); return Number.isFinite(h) && h <= maxHrs; };
  const run = (d.scanRuns || []).at(-1);
  const li = d.linkedin;
  return [
    { key: 'scan', label: 'Daily scan', go: 'scans', at: run?.timestamp || '', ok: !!run && fresh(run.timestamp, 36) && run.status === 'completed' },
    { key: 'mail', label: 'Mail sweep', go: 'mail', at: d.mail?.scannedAt || '', ok: !!d.mail && fresh(`${d.mail.scannedAt}T23:59:59`, 72) },
    { key: 'linkedin', label: 'LinkedIn', go: 'inbox/messages', at: li?.checkedAt || '', ok: !!li && !li.error && fresh(li.checkedAt, 36) },
  ];
}

// Mail page order: dated items still ahead (soonest first), then undated, then past due (newest first).
export function mailActions(mail, t = today()) {
  const rank = (n) => (!ISO_DAY.test(n.due || '') ? 1 : n.due < t ? 2 : 0);
  return [...(mail?.needsAction || [])].sort((a, b) => rank(a) - rank(b)
    || (rank(a) === 0 ? a.due.localeCompare(b.due) : rank(a) === 2 ? b.due.localeCompare(a.due) : 0));
}

// Confirmations joined to the live tracker, so a row applied after the last sweep reads
// 'new' (not scanned) instead of looking like a missing confirmation. Gaps sort first.
const APPLIED_FAMILY = ['Applied', 'Responded', 'Interview', 'Offer', 'Hired', 'Rejected'];
export function mailConfirmRows(mail, rows, appliedAt = (r) => r.date || '') {
  const byRow = (list) => new Map((list || []).map((x) => [Number(x.row), x]));
  const got = byRow(mail?.confirmations);
  const gap = byRow(mail?.confirmationGaps);
  const rank = { gap: 0, new: 1, ok: 2 };
  return rows.filter((r) => APPLIED_FAMILY.includes(r.status)).map((r) => {
    const c = got.get(r.num);
    const g = gap.get(r.num);
    if (c) return { r, state: 'ok', detail: [c.date, c.from].filter(Boolean).join(' · ') };
    if (g) return { r, state: 'gap', detail: g.note || '' };
    return { r, state: 'new', detail: 'Applied after the last Gmail sweep, or not checked yet.' };
  }).sort((a, b) => rank[a.state] - rank[b.state] || appliedAt(b.r).localeCompare(appliedAt(a.r)) || b.r.num - a.r.num);
}

// Urgent banner: what needs Austin today or in the next few days. `upcoming` is
// build()'s list (sorted, finished interviews already dropped). "now" = today.
export function urgentAlerts(d, upcoming, t = today()) {
  const out = [];
  const tomorrow = plusDays(t, 1);
  const soonEnd = plusDays(t, 3);
  for (const iv of upcoming) {
    if (iv.date > tomorrow) break;
    out.push({ id: `iv:${iv.id || iv.company}:${iv.date}:${iv.time || ''}`, level: iv.date === t ? 'now' : 'soon', kind: 'interview', date: iv.date,
      title: `Interview ${iv.date === t ? 'today' : 'tomorrow'}: ${iv.company}`, sub: [iv.round, iv.location].filter(Boolean).join(' · '), iv });
  }
  const li = d.linkedin;
  if (li?.error) out.push({ id: `li-error:${li.error}`, level: 'now', kind: 'linkedin-error', date: t, title: 'LinkedIn messages are not updating', sub: li.error });
  const unread = (li?.threads || []).filter((x) => x.unread);
  if (unread.length) {
    // url + time, so a new message in an already-dismissed thread shows again.
    out.push({ id: `li:${unread.map((x) => `${x.url}@${x.at || ''}`).sort().join(',')}`, level: 'soon', kind: 'linkedin', date: tomorrow,
      title: `${unread.length} unread LinkedIn message${unread.length === 1 ? '' : 's'}`, sub: unread.map((x) => x.name).join(', ') });
  }
  // A mail reminder for a scheduled interview duplicates the interview itself, so it is
  // skipped; any other task on that row and day (an assessment, a resume) still shows.
  const hasRow = (r) => r != null && r !== '';
  // All interviews, not just upcoming: a finished one's reminder must not come back as a deadline.
  const ivDays = new Set((d.interviews || []).filter((i) => hasRow(i.row)).map((i) => `${i.row}|${i.date}`));
  // The mail sweep words these as "Interview Tue Nov 3..." / "In-person interview ...".
  const isIvReminder = (n) => hasRow(n.row) && /^(?:(?:in-person|on-?site|video|phone|virtual) )?interview\b/i.test(n.what || '') && ivDays.has(`${n.row}|${n.due}`);
  for (const n of d.mail?.needsAction || []) {
    // shortcut: past-due items are skipped because the mail sweep never marks an item done; add a done flag if one is ever stored.
    if (!ISO_DAY.test(n.due || '') || n.due < t || n.due > soonEnd || isIvReminder(n)) continue;
    out.push({ id: `due:${n.row}:${n.due}:${n.who}:${n.what}`, level: n.due === t ? 'now' : 'soon', kind: 'deadline', date: n.due,
      title: `${n.who ? `${n.who}: ` : ''}${n.what}`, sub: n.why || '', row: n.row === '' || n.row == null ? null : Number(n.row) });
  }
  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === 'now' ? -1 : 1) || a.date.localeCompare(b.date));
}

export function build(d) {
  const rows = (d.tracker || []).map((r) => ({ ...r, kind: 'row', key: `row:${r.num}`, num: Number(r.num), sc: scoreOf(r.score) }));
  const byNum = new Map(rows.map((r) => [r.num, r]));
  const log = d.statusLog || [];
  const lastMove = new Map();
  const logIdx = new Map();
  log.forEach((e, i) => { lastMove.set(Number(e.num), e); logIdx.set(Number(e.num), i); });
  const t = today();
  const ivs = (d.interviews || []).filter((i) => i.date).sort((a, b) => `${a.date} ${a.time || ''}`.localeCompare(`${b.date} ${b.time || ''}`));
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  // shortcut: assumes every interview runs 60 min, add a per-event duration if one is ever stored.
  const over = (i) => i.date === t && /^\d{1,2}:\d{2}$/.test(i.time || '') && Number(i.time.split(':')[0]) * 60 + Number(i.time.split(':')[1]) + 60 <= nowMin;
  const upcoming = ivs.filter((i) => i.date >= t && !over(i));
  const ivByRow = new Map();
  for (const i of upcoming) if (i.row != null && !ivByRow.has(Number(i.row))) ivByRow.set(Number(i.row), i);

  const activityDate = (r) => lastMove.get(r.num)?.date || r.appliedOn || r.date || '';
  const appliedAt = (r) => r.appliedOn || (lastMove.get(r.num)?.to === 'Applied' ? lastMove.get(r.num).date : '') || r.date || '';
  const recent = (a, b) => activityDate(b).localeCompare(activityDate(a)) || (logIdx.get(b.num) ?? -1) - (logIdx.get(a.num) ?? -1) || b.num - a.num;
  const st = (s) => rows.filter((r) => r.status === s);

  const jevRank = (x) => (x.jev?.lane === 'career_track' ? 20 : x.jev?.lane === 'stack_lane' ? 10 : 0) + (x.jev?.conf || 0);
  const inbox = (d.pipeline?.pending || []).map((p) => parseInbox(p)).sort((a, b) => jevRank(b) - jevRank(a));

  const last = log[log.length - 1];
  return {
    rows: rows.slice().sort(recent), byNum, log, ivs, upcoming, ivByRow, activityDate, appliedAt,
    lanes: {
      inbox,
      review: st('Evaluated').sort((a, b) => (b.sc ?? 0) - (a.sc ?? 0) || recent(a, b)),
      applied: st('Applied').sort(recent),
      // Responded (the company replied, the next move is usually an interview)
      // rides in this lane after the scheduled ones, so an active application
      // never drops off the board between Applied and Interview.
      interview: [
        ...st('Interview').sort((a, b) => (ivByRow.get(a.num)?.date || '9').localeCompare(ivByRow.get(b.num)?.date || '9')),
        ...st('Responded').sort(recent),
      ],
      offer: [...st('Offer'), ...st('Hired')],
    },
    caseNum: last ? Number(last.num) : null,
    funnel: d.stats?.funnel || {},
    followups: d.stats?.followups || {},
    // A held form only matters while its row is still unsubmitted; the forms
    // file keeps entries after a row moves to Applied (or closes) until cleared.
    forms: Object.fromEntries(Object.entries(d.forms || {}).filter(([num]) => byNum.get(Number(num))?.status === 'Evaluated')),
  };
}

// Platforms page: the rating chip and the filter chips. A rating comes from the AI Work Platforms
// guide in data/gig-platforms.json; a card without one (an older file) shows no chip.
export function platformRating(c) {
  if (typeof c?.rating === 'number') return { text: `${c.rating.toFixed(1)} / 5`, tone: c.rating >= 4 ? 'ok' : c.rating >= 3 ? 'acc' : 'warn' };
  if (c?.ratingNote) return { text: c.ratingNote, tone: c.ratingNote === 'Not rated' ? 'ghost' : 'warn' };
  return null;
}
export const PLATFORM_FILTERS = [['all', 'All'], ['short', 'Shortlist'], ['rated', 'Rated'], ['unrated', 'Not Rated'], ['joined', 'Joined']];
export function platformFilter(list = [], show = 'all') {
  const test = { short: (c) => c.priority != null, rated: (c) => typeof c.rating === 'number', unrated: (c) => typeof c.rating !== 'number', joined: (c) => !!c.status }[show];
  return test ? list.filter(test) : list;
}
