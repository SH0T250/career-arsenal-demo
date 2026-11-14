// Mission control: a graphite layout over the sample career data.
// Reads /api/data and /api/presets. Writes only through the server's guarded
// routes: tracker status (set-status.mjs), interview log, targeting presets,
// and "open folder" for the packet mirror on this PC.

import { build, scoreOf, isoLocal, today, urgentAlerts, followUps, mailActions, mailConfirmRows, systemStatus, calendarDays, profileView, profilesOf, PROFILES, platformRating, platformFilter, PLATFORM_FILTERS } from './mission-model.mjs?v=sample-2';
import { renderWarRoom, initWarRoom, warRoomOn } from './warroom.js?v=interactive-1';
import { renderSampleDocument } from './sample-documents.mjs?v=workflow-1';
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Number(n || 0).toLocaleString('en-US');
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY = 86400000;
// Calendar days, not 24-hour steps: a DST change makes one day 23 or 25 hours long.
const addDays = (d, k) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + k);
const dayDiff = (a, b) => Math.round((a - b) / DAY);
const parseIso = (s) => { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
const shortDate = (s) => { const d = parseIso(s); return d ? `${MON[d.getMonth()]} ${d.getDate()}` : '—'; };
const daysSince = (s) => { const d = parseIso(s); return d ? Math.max(0, Math.round((parseIso(today()) - d) / DAY)) : 0; };
const relDay = (s) => {
  const d = parseIso(s);
  if (!d) return '—';
  const diff = Math.round((d - parseIso(today())) / DAY);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff > 1 && diff < 7) return WD[d.getDay()];
  return shortDate(s);
};
const time12 = (t) => { const m = String(t || '').match(/^(\d{1,2}):(\d{2})/); if (!m) return ''; const h = +m[1]; return `${((h + 11) % 12) + 1}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`; };
const initials = (s) => String(s || '?').replace(/[^A-Za-z0-9 ]/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return '—'; } };
const safeUrl = (u) => { try { const x = new URL(u); return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : ''; } catch { return ''; } };
const ago = (iso) => { const t = Date.parse(iso); if (!t) return '—'; const m = Math.round((Date.now() - t) / 60000); if (m < 60) return `${m} min ago`; const h = Math.round(m / 60); return h < 36 ? `${h} hr ago` : `${Math.round(h / 24)} days ago`; };
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const EXT = { target: '_blank', rel: 'noopener noreferrer' };
const ext = `target="${EXT.target}" rel="${EXT.rel}"`;

const LANES = [
  { id: 'inbox', name: 'Inbox' },
  { id: 'review', name: 'Review', status: 'Evaluated' },
  { id: 'applied', name: 'Applied', status: 'Applied' },
  { id: 'interview', name: 'Interview', status: 'Interview,Responded' },
  { id: 'offer', name: 'Offer', status: 'Offer,Hired' },
];
const LANE_CARDS = 3;
const TABLE_ROWS = 12;
const PAGE = 50;
const JEV_LANE = { career_track: 'Career track', stack_lane: 'Flexible work', off_target: 'Off-target' };
const VIEWS = ['overview', 'applications', 'interviews', 'mail', 'inbox', 'stacking', 'documents', 'answers', 'learn', 'platforms', 'websites', 'targeting', 'scans', 'settings'];

let DATA = null;
let M = null;
let MALL = null; // build(DATA) ignoring the profile switch, for the global Interviews page
let selKey = null;
let showAll = false;
let view = 'overview';
const filt = { q: '', stage: '', days: '' };
let prof = 'all'; // search profile switch: all | career | stack
const inbox = { lanes: new Set(['career_track', 'stack_lane']), remote: false, loc: false, sort: 'jev', limit: PAGE };
const docs = { show: 'all', sort: 'recent', limit: 30 };
const boards = { show: 'on', limit: 40 };
const onsite = { show: 'all', limit: 40 };
const li = { show: 'all', limit: 8, busy: false };
let inboxTab = 'postings'; // postings | messages | onsite
let alertsOpen = null; // null = the default for this page and screen; a click overrides it until the page changes
let sseLive = false;

// ---------------------------------------------------------------- shared

const findItem = (key) => {
  if (!key) return null;
  const [kind, id] = key.split(':');
  return kind === 'row' ? M.byNum.get(Number(id)) || null : M.lanes.inbox.find((x) => x.key === key) || null;
};

async function post(url, body) {
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-dashboard': '1' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    return r.ok && j.ok !== false ? { ok: true, ...j } : { ok: false, error: j.error || `HTTP ${r.status}` };
  } catch (e) { return { ok: false, error: e.message }; }
}

let toastTimer = null;
function toast(msg, ok = true, link = null) {
  const t = $('#toast');
  t.textContent = msg;
  if (link) {
    const a = Object.assign(document.createElement('a'), { href: link.href, target: '_blank', rel: 'noopener noreferrer', textContent: link.label });
    t.append(' ', a);
  }
  t.className = `toast ${ok ? 'ok' : 'bad'}`;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ok ? 3500 : 7000);
}

const sampleInterviewForRow = (num) => MALL.ivByRow.get(num) || MALL.ivs.findLast((iv) => iv.row != null && Number(iv.row) === num);

function sampleDocButtons(num, ivId = '') {
  return `<div class="sample-doc-actions">${[['resume', 'Preview résumé / CV'], ['cover', 'Preview cover letter'], ['prep', 'Preview prep packet']].map(([kind, label]) => `<button type="button" class="btn sm" data-sample-doc="${kind}" data-sample-row="${num ?? ''}" data-sample-iv="${esc(ivId)}">${label}</button>`).join('')}</div>`;
}

function openSampleDocument(num, kind, ivId) {
  const iv = (DATA.interviews || []).find((x) => x.id === ivId) || sampleInterviewForRow(num);
  const job = MALL.byNum.get(num) || (iv ? { company: iv.company, role: iv.role } : null);
  if (!job) return toast('Choose a sample job first.', false);
  const doc = renderSampleDocument(job, kind, iv);
  $('#sampleDocTitle').textContent = doc.title;
  const fromInvite = kind === 'prep' && DATA.sampleInvite?.prepReady && iv?.id === DATA.sampleInvite.interviewId;
  $('#sampleDocBody').innerHTML = (fromInvite ? '<p class="invite-generated"><strong>Generated automatically from the accepted sample invite.</strong> The linked interview is on the demo calendar. This packet uses local fictional templates; no live research or AI request ran.</p>' : '') + doc.html;
  $('#sampleDocDialog').showModal();
}

function sampleInviteOutcome(invite) {
  const ready = invite.accepted && invite.calendarPresent;
  return `<ol class="invite-steps" aria-label="Sample invite workflow">
    <li><strong>${invite.accepted ? 'Invite accepted' : 'Accept the invite'}</strong><span>${invite.accepted ? 'Recorded in this demo tab.' : 'One click starts the sample workflow.'}</span></li>
    <li><strong>${ready ? 'Calendar event added' : invite.accepted ? 'Calendar event removed' : 'Add the calendar event'}</strong><span>${ready ? 'Linked to the sample job.' : invite.accepted ? 'Use Reset demo to replay the invite.' : 'The job moves to Interview.'}</span></li>
    <li><strong>${invite.prepReady ? 'Prep packet ready' : 'Prepare the interview packet'}</strong><span>${invite.prepReady ? 'Generated automatically from fictional templates.' : 'Company brief, practice answers and an interview plan.'}</span></li>
  </ol>${ready ? `<div class="sample-doc-actions"><button type="button" class="btn" data-sample-calendar="${esc(invite.interviewId)}">View sample calendar event</button><button type="button" class="btn primary" data-sample-doc="prep" data-sample-row="${invite.row}" data-sample-iv="${esc(invite.interviewId)}">Open generated prep packet</button></div>` : ''}`;
}

function renderSampleInvite() {
  const invite = DATA.sampleInvite;
  const host = $('#sampleInvite');
  host.hidden = !invite;
  if (!invite) return;
  host.innerHTML = `<div class="sample-invite-heading"><h2 id="sampleInviteTitle">Sample Gmail interview invite</h2><span class="chip ${invite.accepted ? 'ok' : 'acc'}">${invite.accepted ? 'Accepted in demo' : 'Awaiting your response'}</span></div>
    <p class="hint">A fictional email for you to try. Accepting it changes only this demo; no email or calendar invitation is sent.</p>
    <div class="sample-invite-layout"><div><h3>${esc(invite.subject)}</h3><dl class="sample-invite-meta"><dt>From</dt><dd>${esc(invite.from)}</dd><dt>To</dt><dd>${esc(invite.to)}</dd><dt>When</dt><dd>${esc(invite.date)} · ${time12(invite.time)} Central</dd><dt>Where</dt><dd>${esc(invite.location)}</dd></dl><p class="sample-invite-body">${esc(invite.body)}</p>
    ${invite.accepted ? '<p class="hint">Accepted. You can review the event and packet, or use Reset demo to try again.</p>' : `<button type="button" class="btn primary" data-accept-invite="${esc(invite.id)}">Accept sample invite</button>`}</div>
    <div class="sample-invite-outcome"><h3>${invite.accepted ? 'Your sample workflow' : 'What happens when you accept'}</h3>${sampleInviteOutcome(invite)}</div></div>`;
}

let acceptingInvite = false;
async function acceptSampleInvite(id, button) {
  if (acceptingInvite) return;
  acceptingInvite = true;
  button.disabled = true;
  button.textContent = 'Accepting sample invite…';
  try {
    const out = await post('/api/demo/accept-invite', { id });
    if (!out.ok) return toast(out.error || 'Could not accept the sample invite. Try again.', false);
    if (!await refresh()) return;
    if (!out.invite.calendarPresent) return toast('This sample interview was removed. Use Reset demo to replay the invite.', false);
    filt.q = ''; $('#q').value = ''; setProfile('all');
    location.hash = 'interviews';
    renderInterviews();
    openSampleDocument(out.row, 'prep', out.invite.interviewId);
    toast('Sample invite accepted. Calendar event added and prep packet generated.');
  } catch (error) {
    toast(`Could not finish the sample workflow: ${error.message}. Try again or reset the demo.`, false);
  } finally {
    acceptingInvite = false;
    renderSampleInvite();
  }
}

function openSampleCalendar(id, date) {
  const iv = (DATA.interviews || []).find((x) => x.id === id);
  $('#sampleDocTitle').textContent = iv ? `${iv.company} · Sample calendar event` : `${date || 'Calendar'} · Sample day`;
  $('#sampleDocBody').innerHTML = iv ? `<p>This event exists only in this demo tab. No Gmail message was read and no Google Calendar event was created.</p><dl><dt>Role</dt><dd>${esc(iv.role || 'Not specified')}</dd><dt>When</dt><dd>${esc(iv.date)}${iv.time ? ` at ${time12(iv.time)} CT` : ''}</dd><dt>Round</dt><dd>${esc(iv.round || 'Interview')}</dd><dt>Location</dt><dd>${esc(iv.location || 'Not specified')}</dd></dl>${iv.notes ? `<p>${esc(iv.notes)}</p>` : ''}<p>In the connected full workflow, Gmail monitoring helps log interview updates. Calendar coordination and an on-demand prep packet keep the next step organized.</p>${sampleDocButtons(iv.row, iv.id)}` : '<p>The calendar is a local simulation. Add a sample interview to see it appear here, then open its event and prep packet. No external calendar is connected.</p>';
  $('#sampleDocDialog').showModal();
}

async function moveInboxToReview(key) {
  const out = await post('/api/demo/track-inbox', { key });
  if (!out.ok) return toast(out.error || 'Could not move this sample job.', false);
  await refresh();
  setProfile('all');
  select(`row:${out.row}`);
  showSelection();
  toast('Sample job moved to review. Choose a new status to continue.');
}

function startSampleWorkflow() {
  filt.q = ''; $('#q').value = ''; filt.stage = ''; filt.days = ''; $('#fTime').value = '';
  setProfile('all');
  const row = MALL.rows.find((x) => x.status === 'Evaluated') || MALL.rows[0];
  if (!row) return;
  select(`row:${row.num}`);
  showSelection();
  $('#selTitle').scrollIntoView({ block: 'center' });
  toast('Move the sample job to Applied, then add an interview and preview its packet.');
}

// Packet mirror (the desktop folder): files and kinds for one tracker row.
const packetOf = (num) => DATA.packets?.rows?.[num] || null;
const fileUrl = (pk, f) => `/packet?f=${encodeURIComponent(`${pk.rel}/${f}`)}`;
function fileKind(f) {
  if (/^interview-prep-/i.test(f)) return { label: 'Interview prep', ic: 'prep' };
  // packets.mjs also mirrors nested bundle files as {NNN}-cv.pdf, {NNN}-cover.pdf, {NNN}-payload.json.
  if (/(^|-)cover\.pdf$/i.test(f)) return { label: 'Cover letter', ic: 'cover' };
  if (/(^cover-payload.*|(^|-)payload)\.json$/i.test(f)) return { label: 'Cover letter data', ic: 'data' };
  if (/^cv-.*\.pdf$|(^|-)cv\.pdf$/i.test(f)) return { label: 'Tailored resume', ic: 'cv' };
  if (/^\d{2,4}-.*\d{4}-\d{2}-\d{2}\.md$/.test(f)) return { label: 'Evaluation report', ic: 'report' };
  if (/^\d{2,4}-/.test(f)) return { label: 'Job description', ic: 'jd' };
  return { label: 'File', ic: 'data' };
}
const KIND_ORDER = { cv: 0, cover: 1, prep: 2, jd: 3, report: 4, data: 5 };
const sortedFiles = (pk) => [...pk.files].sort((a, b) => KIND_ORDER[fileKind(a).ic] - KIND_ORDER[fileKind(b).ic]);
const fileLinks = (pk, { compact = false } = {}) => sortedFiles(pk)
  .filter((f) => !compact || fileKind(f).ic !== 'data')
  .map((f) => { const k = fileKind(f); return `<a class="file f-${k.ic}" href="${fileUrl(pk, f)}" ${ext} data-open-file="${esc(`${pk.rel}/${f}`)}" title="Open ${esc(f)} on this PC"><b>${esc(k.label)}</b><small>${esc(f)}</small></a>`; }).join('');
const prepRel = (num) => { const pk = packetOf(num); const f = pk?.files.find((x) => /^interview-prep-/i.test(x)); return f ? `${pk.rel}/${f}` : ''; };

// Interview prep pack (dashboard-web/prep-pack.mjs): job state per tracker row.
const packOf = (num) => DATA.prep?.rows?.[num] || null;
const clock = (iso) => { const d = new Date(iso); return Number.isNaN(+d) ? '' : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); };
function packBlock(num, isInterview) {
  const j = packOf(num);
  const open = `<a class="btn primary" href="/prep?row=${num}" ${ext}>Open prep pack</a>`;
  let body, acts;
  if (j?.state === 'running') {
    body = `<p class="pack-note live"><i aria-hidden="true"></i>Researching ${esc(j.company || 'the company')} since ${clock(j.startedAt)}. Usually 10 to 20 minutes; you can leave this page.</p>`;
    acts = j.ready ? `${open}<button type="button" class="btn" disabled>Rebuilding…</button>` : '<button type="button" class="btn" disabled>Building…</button>';
  } else if (j?.state === 'error') {
    body = `<p class="pack-note bad">${esc(j.error || 'The build failed.')}</p>`;
    acts = `${j.ready ? open : ''}<button type="button" class="btn${j.ready ? '' : ' primary'}" data-prep-build="${num}">Try again</button>`;
  } else if (j?.ready) {
    const at = j.builtAt || j.finishedAt;
    body = `<p class="pack-note">Built ${shortDate(at?.slice(0, 10))} at ${clock(at)}.</p>`;
    acts = `${open}<button type="button" class="btn" data-prep-build="${num}">Rebuild</button>`;
  } else {
    body = '<p class="pack-note">Cheat sheet, company breakdown, Glassdoor and Reddit, your interviewer, how the interview will go, likely questions with your answers, questions to ask, pay.</p>';
    acts = `<button type="button" class="btn${isInterview ? ' primary' : ''}" data-prep-build="${num}">Build prep pack</button>`;
  }
  return `<div class="sel-pack"><div class="sel-sub">Interview prep pack</div>${body}<div class="pack-acts">${acts}</div></div>`;
}
async function buildPack(num, btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Starting…'; }
  const r = await post('/api/prep-pack', { row: num });
  toast(r.ok ? `Building the prep pack for row #${num}. It will show here when it is ready.` : `Prep pack not started: ${r.error}`, r.ok);
  if (btn && !r.ok) { btn.disabled = false; btn.textContent = 'Build prep pack'; }
  refresh();
}

async function openFolder(rel) {
  const r = await post('/api/open-folder', { rel: rel || '' });
  toast(r.ok ? `Opened in File Explorer: ${r.path}` : `Could not open the folder: ${r.error}`, r.ok);
}

// Files open in their own app on this PC (PDFs in the PDF viewer, text in Notepad).
// If the desktop open fails, the toast offers the browser copy: a fresh click, because a
// popup opened after the request comes back would be blocked.
async function openFile(rel, href) {
  const r = await post('/api/open-file', { rel });
  if (r.ok) return toast(`Opened on your PC: ${r.path.split(/[\\/]/).pop()}`);
  toast(`Could not open it on your PC (${r.error}).`, false, { href, label: 'Open it in the browser' });
}

// ---------------------------------------------------------------- KPIs

function spark(dates, { forward = false, title = '' } = {}) {
  const base = parseIso(today());
  const out = [];
  for (let k = 0; k < 14; k++) {
    const day = isoLocal(addDays(base, forward ? k : k - 13));
    out.push(dates.filter((x) => x === day).length);
  }
  const max = Math.max(1, ...out);
  const hot = forward ? (i) => i < 3 : (i) => i > 10;
  return `<div class="spark" title="${esc(title)}">${out.map((n, i) => `<span class="${hot(i) ? 'hot' : ''}" style="height:${Math.max(6, (n / max) * 100)}%"></span>`).join('')}</div>`;
}

const ICON = {
  doc: '<svg viewBox="0 0 24 24"><path d="M6 3.5h8.5l3.5 3.5v13.5H6z"/><path d="M9 11h6M9 14.5h6M9 18h3.5"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>',
  cal: '<svg viewBox="0 0 24 24"><rect x="4" y="5.5" width="16" height="14.5" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/></svg>',
  inbox: '<svg viewBox="0 0 24 24"><path d="M4 13.5l2.5-8h11l2.5 8v6H4z"/><path d="M4 13.5h4.5l1.5 2.5h4l1.5-2.5H20"/></svg>',
};

function renderKpis() {
  const L = M.lanes;
  const t = today();
  const appliedDates = M.log.filter((e) => e.to === 'Applied').map((e) => e.date);
  const next = M.upcoming[0];
  const week = M.upcoming.filter((i) => dayDiff(parseIso(i.date), parseIso(t)) < 7).length;
  const sorted = L.inbox.filter((x) => x.jev).length;
  const career = L.inbox.filter((x) => x.jev?.lane === 'career_track').length;
  const kpi = (href, icon, n, label, sub, sp, tone) => `<a class="panel kpi" href="${href}" style="--tone:var(${tone})"><div class="kpi-top"><div class="ic" aria-hidden="true">${icon}</div>
    <div class="kpi-num"><div class="n">${fmt(n)}</div><div class="l">${label}</div></div>${sp}</div><div class="s" title="${esc(sub)}">${esc(sub)}</div></a>`;
  $('#kpis').innerHTML = [
    kpi('#applications', ICON.doc, L.applied.length, 'Applied', `${fmt(M.funnel.everApplied)} ever · ${fmt(appliedDates.filter((x) => x === t).length)} today`,
      spark(appliedDates, { title: 'Applications sent per day, last 14 days' }), '--c-applied'),
    kpi('#applications', ICON.search, L.review.length, 'To review', `${fmt(L.review.filter((r) => r.sc >= 4).length)} scored 4.0 or higher`,
      spark(M.rows.map((r) => r.date), { title: 'Roles evaluated per day, last 14 days' }), '--c-review'),
    kpi('#interviews', ICON.cal, L.interview.length, 'Interviews', next ? `${fmt(week)} this week · next ${next.company}, ${relDay(next.date)} ${time12(next.time)}` : 'Nothing new on the calendar',
      spark(M.upcoming.map((i) => i.date), { forward: true, title: 'Interviews on the calendar, next 14 days' }), '--c-interview'),
    kpi('#inbox', ICON.inbox, L.inbox.length, 'In inbox', `${fmt(sorted)} Jev-sorted · ${fmt(career)} career track`,
      spark(L.inbox.map((x) => x.posted).filter(Boolean), { title: 'Inbox postings by date posted, last 14 days' }), '--c-inbox'),
  ].join('');
}

// ---------------------------------------------------------------- board

function matches(x) {
  if (!filt.q) return true;
  const q = filt.q.toLowerCase();
  return [x.company, x.role, x.notes, x.loc].some((v) => String(v || '').toLowerCase().includes(q));
}

function cardLine(lane, x) {
  if (lane === 'inbox') {
    const j = x.jev;
    return j ? `${JEV_LANE[j.lane] || j.lane} · ${Number(j.conf).toFixed(2)}` : (x.loc || 'Not sorted yet');
  }
  if (lane === 'review') return `Score ${x.score || '—'}`;
  if (lane === 'applied') return `Sent ${shortDate(M.appliedAt(x))} · ${x.score || '—'}`;
  if (lane === 'interview') {
    if (x.status === 'Responded') return `Replied ${shortDate(M.activityDate(x))}`;
    const iv = M.ivByRow.get(x.num); return iv ? `${iv.round || 'Interview'} · ${relDay(iv.date)} ${time12(iv.time)}` : 'Interview';
  }
  return x.status;
}

function renderLanes() {
  const L = M.lanes;
  $('#lanes').innerHTML = LANES.map((ln, i) => {
    const items = L[ln.id];
    const cards = items.slice(0, LANE_CARDS).map((x) => {
      const cls = ['pcard'];
      if (x.kind === 'row' && x.num === M.caseNum) cls.push('case');
      if (x.key === selKey) cls.push('sel');
      if (!matches(x)) cls.push('dim');
      return `<button type="button" class="${cls.join(' ')}" data-key="${esc(x.key)}">
        <b>${esc(x.company)}</b><small>${esc((x.role || '').split(' - ')[0])}</small><em>${stackChip(x) ? 'Flexible · ' : ''}${esc(cardLine(ln.id, x))}</em></button>`;
    }).join('');
    const left = items.length - LANE_CARDS;
    const more = left > 0
      ? (ln.status ? `<button type="button" class="lane-more" data-status="${esc(ln.status)}">+ ${fmt(left)} more</button>`
        : `<a class="lane-more" href="#inbox/postings">+ ${fmt(left)} more in the inbox</a>`)
      : '';
    const empty = items.length ? '' : `<div class="lane-empty">${ln.id === 'offer'
      ? `No offers yet. ${fmt(L.interview.length)} interview${L.interview.length === 1 ? '' : 's'} in progress.`
      : 'Nothing here right now.'}</div>`;
    return `<section class="lane" data-stage="${ln.id}" data-n="${items.length}" style="--i:${i}">
      <div class="lane-h"><h3>${ln.name}</h3><span>${fmt(items.length)}</span></div>${cards}${empty}${more}</section>`;
  }).join('');
}

// Lines between stages: every card in a lane feeds a junction, and the junction
// fans out to the next lane's cards. Pulse count follows the next lane's size.
const links = {
  cv: null, ctx: null, rgb: [124, 196, 255], running: false, t0: performance.now(),
  init() {
    this.cv = $('#links');
    this.ctx = this.cv.getContext('2d');
    this.readAccent();
    new ResizeObserver(() => this.size()).observe($('#boardBody'));
    this.size();
  },
  readAccent() {
    const hex = getComputedStyle(document.documentElement).getPropertyValue('--acc').trim().replace('#', '');
    if (hex.length === 6) this.rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  },
  size() {
    const r = $('#boardBody').getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cv.width = Math.round(r.width * dpr);
    this.cv.height = Math.round(r.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = r.width; this.h = r.height;
  },
  anchors() {
    const br = $('#boardBody').getBoundingClientRect();
    return [...document.querySelectorAll('#lanes .lane')].map((l) => ({
      n: Number(l.dataset.n) || 0,
      rgb: hexRgb(getComputedStyle(l).getPropertyValue('--tone')) || this.rgb,
      items: [...l.querySelectorAll('.pcard, .lane-empty')].map((c) => {
        const r = c.getBoundingClientRect();
        return { l: r.left - br.left, r: r.right - br.left, y: r.top - br.top + r.height / 2, hot: c.classList.contains('case') || c.classList.contains('sel'), dim: c.classList.contains('dim') };
      }),
    }));
  },
  rgba(a) { return `rgba(${this.rgb[0]},${this.rgb[1]},${this.rgb[2]},${a})`; },
  draw(now) {
    const { ctx } = this;
    ctx.clearRect(0, 0, this.w, this.h);
    if (view !== 'overview' || getComputedStyle(this.cv).display === 'none') return;
    const A = this.anchors();
    const t = (now - this.t0) / 1000;
    for (let k = 0; k < A.length - 1; k++) {
      const a = A[k];
      const b = A[k + 1];
      if (!a.items.length || !b.items.length) continue;
      const x0 = Math.max(...a.items.map((c) => c.r));
      const x1 = Math.min(...b.items.map((c) => c.l));
      const ys = [...a.items, ...b.items].map((c) => c.y);
      const node = { x: (x0 + x1) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
      const ins = a.items.map((c) => [c.r, c.y, node.x, node.y, c]);
      const outs = b.items.map((c) => [node.x, node.y, c.l, c.y, c]);
      // Each line fades from the source stage's light into the next stage's.
      const mid = a.rgb.map((v, i) => Math.round((v + b.rgb[i]) / 2));
      for (const [sx, sy, ex, ey, c, from, to] of [...ins.map((s) => [...s, a.rgb, mid]), ...outs.map((s) => [...s, mid, b.rgb])]) {
        ctx.beginPath();
        const dx = (ex - sx) * 0.55;
        ctx.moveTo(sx, sy);
        ctx.bezierCurveTo(sx + dx, sy, ex - dx, ey, ex, ey);
        const al = c.dim ? 0.12 : c.hot ? 0.95 : 0.55;
        const g = ctx.createLinearGradient(sx, 0, ex, 0);
        g.addColorStop(0, rgba(from, al));
        g.addColorStop(1, rgba(to, al));
        ctx.lineWidth = c.hot ? 2 : 1.3;
        ctx.strokeStyle = g;
        ctx.shadowColor = rgba(c.hot ? to : mid, 0.9);
        ctx.shadowBlur = c.hot ? 14 : 8;
        ctx.stroke();
      }
      ctx.shadowBlur = 10;
      ctx.shadowColor = rgba(a.rgb, 0.9);
      ctx.fillStyle = rgba(a.rgb, 1);
      for (const c of a.items) this.dot(c.r, c.y, 2.6);
      ctx.shadowColor = rgba(b.rgb, 0.9);
      ctx.fillStyle = rgba(b.rgb, 1);
      for (const c of b.items) this.dot(c.l, c.y, 2.6);
      ctx.shadowColor = rgba(mid, 0.9);
      ctx.fillStyle = rgba(mid, 1);
      this.dot(node.x, node.y, 3.6);
      ctx.strokeStyle = rgba(mid, 0.4);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(node.x, node.y, 8, 0, Math.PI * 2); ctx.stroke();
      if (reducedMotion) continue;
      // Pulses: a light travels card -> junction -> card.
      const pulses = Math.max(1, Math.min(7, Math.round(1 + Math.log2(1 + b.n))));
      for (let j = 0; j < pulses; j++) {
        const u = (t * 0.22 + j / pulses) % 1;
        const seg = u < 0.5 ? ins[j % ins.length] : outs[j % outs.length];
        const s = u < 0.5 ? u * 2 : (u - 0.5) * 2;
        const [sx, sy, ex, ey] = seg;
        const dx = (ex - sx) * 0.55;
        const p = cubic(sx, sy, sx + dx, sy, ex - dx, ey, ex, ey, s);
        ctx.shadowBlur = 16;
        ctx.shadowColor = rgba(u < 0.5 ? a.rgb : b.rgb, 1);
        ctx.fillStyle = 'rgba(255,255,255,.95)';
        this.dot(p[0], p[1], 2.2);
      }
    }
    ctx.shadowBlur = 0;
  },
  dot(x, y, r) { this.ctx.beginPath(); this.ctx.arc(x, y, r, 0, Math.PI * 2); this.ctx.fill(); },
  loop(now) {
    if (!links.running) return;
    links.draw(now);
    links.raf = requestAnimationFrame(links.loop);
  },
  // The pending frame is cancelled on stop, so a quick hide/show never runs two loops.
  start() { if (this.running || document.hidden) return; this.running = true; this.raf = requestAnimationFrame(this.loop); },
  stop() { this.running = false; cancelAnimationFrame(this.raf); },
};

function hexRgb(s) {
  const h = String(s || '').trim().replace('#', '');
  return /^[0-9a-f]{6}$/i.test(h) ? [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) : null;
}
const rgba = (rgb, a) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;

function cubic(x0, y0, x1, y1, x2, y2, x3, y3, t) {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return [a * x0 + b * x1 + c * x2 + d * x3, a * y0 + b * y1 + c * y2 + d * y3];
}

// ---------------------------------------------------------------- side column

function renderNext() {
  const items = [];
  for (const iv of M.upcoming.slice(0, 2)) {
    const soon = ['Today', 'Tomorrow'].includes(relDay(iv.date));
    items.push({ interviewId: iv.id, tone: 'var(--acc)', title: `Interview: ${iv.company}`,
      sub: `${iv.round || 'Interview'} · ${(iv.role || '').split(' - ')[0]}`, chip: `${relDay(iv.date)} ${time12(iv.time)}`.trim(), cls: soon ? 'solid' : 'acc' });
  }
  const top = M.lanes.review.find((r) => r.sc >= 4);
  if (top) items.push({ key: top.key, tone: 'var(--silver)', title: `Decide on ${top.company}`, sub: `${top.role} · scored ${top.score}`, chip: `Score ${top.sc.toFixed(1)}`, cls: 'acc' });
  const held = Object.keys(M.forms).length;
  if (held) items.push({ key: `row:${Object.keys(M.forms)[0]}`, tone: 'var(--acc)', title: 'Submit held forms', sub: `${held} filled and waiting on you`, chip: fmt(held), cls: 'solid' });
  const inb = M.lanes.inbox;
  if (inb.length) items.push({ go: 'inbox', tone: 'var(--steel)', title: 'Work the inbox', sub: `${fmt(inb.length)} postings · ${fmt(inb.filter((x) => x.jev).length)} sorted by Jev`, chip: fmt(inb.length), cls: '' });
  const noFollow = M.followups.appliedWithoutFollowup;
  if (noFollow) items.push({ status: 'Applied', tone: 'var(--steel)', title: 'Plan follow-ups', sub: `${fmt(noFollow)} applied roles have no follow-up logged`, chip: fmt(noFollow), cls: 'ghost' });
  $('#next').innerHTML = items.map((x) => {
    const body = `<div><b>${esc(x.title)}</b><small title="${esc(x.sub)}">${esc(x.sub)}</small></div><span class="chip ${x.cls}">${esc(x.chip)}</span>`;
    if (x.interviewId) return `<li style="--tone:${x.tone}"><button type="button" class="li-link sample-cal-button" data-sample-calendar="${esc(x.interviewId)}" title="View sample event">${body}</button></li>`;
    return `<li style="--tone:${x.tone}" tabindex="0" ${x.key ? `data-key="${esc(x.key)}"` : ''} ${x.status ? `data-status="${x.status}"` : ''} ${x.go ? `data-go="${x.go}"` : ''}>${body}</li>`;
  }).join('')
    || '<li><div><b>Nothing waiting on you</b><small>New work shows up here as it lands.</small></div></li>';
}

// Urgent banner on every page. A dismissed alert stays hidden in this browser
// until its id changes (a new unread message, a moved interview, a new deadline).
const DISMISSED = 'mc-dismissed-alerts';
const dismissed = () => { try { const v = JSON.parse(store.get(DISMISSED) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
function renderAlerts() {
  const all = urgentAlerts(DATA, M.upcoming);
  const gone = new Set(dismissed());
  const list = all.filter((a) => !gone.has(a.id));
  $('#alerts').hidden = !list.length;
  $('#alCount').textContent = fmt(list.length);
  // Full list on the Overview; everywhere else one line, so the page itself stays in view.
  const open = alertsOpen ?? (view === 'overview' && innerWidth > 900);
  const urgent = list.find((a) => a.level === 'now') || list[0];
  $('#alerts').classList.toggle('closed', !open);
  $('#alRows').hidden = !open;
  $('#alDesc').hidden = !open;
  $('#alPeek').hidden = open;
  $('#alPeek').textContent = urgent ? `${urgent.title}${list.length > 1 ? ` · ${fmt(list.length - 1)} more` : ''}` : '';
  $('#alToggle').textContent = open ? 'Hide' : 'Show all';
  $('#alToggle').setAttribute('aria-expanded', String(open));
  $('#alRows').innerHTML = list.map((a) => {
    const tone = a.level === 'now' ? 'var(--warn)' : 'var(--acc)';
    const chip = a.kind === 'interview' ? `${relDay(a.date)} ${time12(a.iv.time)}`.trim() : a.kind === 'linkedin-error' ? 'Fix' : a.kind === 'linkedin' ? 'LinkedIn' : `Due ${relDay(a.date)}`;
    const body = `<div><b>${esc(a.title)}</b><small title="${esc(a.sub)}">${esc(a.sub)}</small></div><span class="chip ${a.level === 'now' ? 'warn' : 'acc'}">${esc(chip)}</span>`;
    const x = `<button type="button" class="al-x" data-al-dismiss="${esc(a.id)}" aria-label="Dismiss: ${esc(a.title)}">&times;</button>`;
    if (a.kind === 'interview') return `<li style="--tone:${tone}"><button type="button" class="li-link sample-cal-button" data-sample-calendar="${esc(a.iv.id)}">${body}</button>${x}</li>`;
    const href = a.kind.startsWith('linkedin') ? '#inbox/messages' : '';
    if (href) return `<li style="--tone:${tone}"><a class="li-link" href="${esc(href)}" ${href.startsWith('#') ? '' : ext}>${body}</a>${x}</li>`;
    return `<li style="--tone:${tone}" ${a.row != null ? `tabindex="0" data-key="row:${a.row}"` : ''}>${body}${x}</li>`;
  }).join('');
}
// The selected-application panel only exists on these two pages.
const showSelection = () => { if (view !== 'overview' && view !== 'applications') location.hash = 'applications'; };
function dismissAlert(id) {
  // Keep only ids still on screen, so the stored list never grows past the live alerts.
  const live = new Set(urgentAlerts(DATA, M.upcoming).map((a) => a.id));
  store.set(DISMISSED, JSON.stringify([...dismissed().filter((x) => live.has(x)), id]));
  renderAlerts();
  renderWarRoom(DATA, M, MALL);
}

// Stage chips share the lane colors; closed states stay a quiet outline.
const STAGE_TONE = { Evaluated: '--c-review', Applied: '--c-applied', Responded: '--c-applied', Interview: '--c-interview', Offer: '--c-offer', Hired: '--c-offer' };
const stageChip = (s) => (STAGE_TONE[s]
  ? `<span class="chip t" style="--tone:var(${STAGE_TONE[s]})">${esc(s)}</span>`
  : `<span class="chip ghost">${esc(s)}</span>`);

// Live refreshes re-render panels; a half-typed status change or preset name
// is carried over instead of being wiped.
// Only fields the user changed from what was rendered count as a draft, so an
// untouched field always shows the fresh value (e.g. a status changed elsewhere).
const isDirty = (el) => (el.tagName === 'SELECT'
  ? [...el.options].some((o) => o.selected !== o.defaultSelected)
  : 'defaultValue' in el && el.value !== el.defaultValue);

function keepDraft(sel, render) {
  const old = document.querySelector(sel);
  const draft = old && [...old.elements].filter((el) => el.name && isDirty(el)).map((el) => [el.name, el.value, el === document.activeElement]);
  const key = old?.dataset.row;
  render();
  const now = document.querySelector(sel);
  if (!draft || !now || now.dataset.row !== key) return;
  for (const [name, value, focused] of draft) {
    const el = name && now.elements.namedItem(name);
    if (!el) continue;
    el.value = value;
    if (focused) el.focus();
  }
}

function renderSel() { keepDraft('.sel-status', renderSelInner); lockStatusForm(); }

function renderSelInner() {
  const x = findItem(selKey);
  const box = $('#sel');
  if (!x) { box.innerHTML = '<p>Pick a card or a table row to see its details.</p>'; return; }
  const posting = x.url ? `<a class="btn primary" href="${esc(safeUrl(x.url))}" ${ext}>Open posting</a>` : '';
  if (x.kind === 'inbox') {
    const j = x.jev;
    box.innerHTML = `<div class="sel-id"><div class="mono">${esc(initials(x.company))}</div><div><b>${esc(x.company)}</b><small>${esc(x.role)}</small></div></div>
      <div class="chips"><span class="chip">Inbox</span>${j ? `<span class="chip acc">${esc(JEV_LANE[j.lane] || j.lane)}</span>` : ''}${j && j.remote_us >= 0.5 ? '<span class="chip ghost">Remote (US)</span>' : ''}</div>
      <dl><dt>Posted</dt><dd>${shortDate(x.posted)}</dd><dt>Location</dt><dd title="${esc(x.loc)}">${esc(x.loc || '—')}</dd>
      <dt>Jev lane (snapshot)</dt><dd>${j ? esc(JEV_LANE[j.lane] || j.lane) : 'Not sorted'}</dd><dt>Snapshot confidence</dt><dd>${j ? Number(j.conf).toFixed(2) : '—'}</dd>
      <dt>Remote, US-eligible</dt><dd>${j && j.remote_us != null ? `${Math.round(j.remote_us * 100)}%` : '—'}</dd><dt>Source</dt><dd>${esc(hostOf(x.url))}</dd></dl>
      ${stackBlock(x)}
      <p class="hint">Move this fictional posting into review, then change its pipeline stage, create sample documents and add an interview.</p>
      <div class="btns one"><button type="button" class="btn primary" data-track-inbox="${esc(x.key)}">Move to review</button></div>`;
    return;
  }
  const iv = M.ivByRow.get(x.num);
  const where = String(x.notes || '').split(';')[0].trim();
  const notes = String(x.notes || '').split(';').slice(1).join(';').trim();
  const pk = packetOf(x.num);
  const states = DATA.states || [];
  box.innerHTML = `<div class="sel-id"><div class="mono">${esc(initials(x.company))}</div><div><b>${esc(x.company)}</b><small>${esc(x.role)}</small></div></div>
    <div class="chips">${stageChip(x.status)}${x.sc != null ? `<span class="chip ghost">Score ${x.sc.toFixed(1)}</span>` : ''}${where && where.length < 28 ? `<span class="chip ghost">${esc(where.replace(/_/g, ' '))}</span>` : ''}</div>
    ${notes ? `<p>${esc(notes.length > 220 ? `${notes.slice(0, 217)}…` : notes)}</p>` : ''}
    <dl><dt>Row</dt><dd>#${x.num}</dd><dt>Evaluated</dt><dd>${shortDate(x.date)}</dd>
    ${x.status === 'Applied' || x.appliedOn ? `<dt>Applied</dt><dd>${shortDate(M.appliedAt(x))}</dd>` : ''}
    ${iv ? `<dt>Interview</dt><dd><button type="button" class="btn sm" data-sample-calendar="${esc(iv.id)}">${relDay(iv.date)} ${time12(iv.time)}</button></dd>` : ''}
    <dt>Tailored CV</dt><dd>${/✅/.test(x.pdf || '') ? 'Yes' : 'No'}</dd><dt>Source</dt><dd>${esc(hostOf(x.url))}</dd></dl>
    ${stackBlock(x)}
    <h3>Job-specific application packet</h3>
    <p class="hint">The full workflow tailors an ATS-formatted résumé/CV and cover letter to the job description. These previews use a fictional candidate and sample role brief.</p>
    ${sampleDocButtons(x.num, iv?.id)}
    <form class="sel-status" data-row="${x.num}">
      <h3>Move this sample job</h3>
      <div class="sel-status-row"><select name="state" aria-label="New status">${states.map((s) => `<option value="${esc(s)}"${s === x.status ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select>
      <button type="submit" class="btn">Save</button></div>
      <input name="note" maxlength="200" placeholder="Note (optional)" aria-label="Status note" autocomplete="off">
    </form>
    <p class="hint">Status changes update the pipeline and activity in this tab. No application is sent.</p>
    <div class="btns"><button type="button" class="btn primary" data-iv-add-row="${x.num}">Add sample interview</button>${iv ? `<button type="button" class="btn" data-sample-calendar="${esc(iv.id)}">View sample event</button>` : '<a class="btn" href="#documents">All sample documents</a>'}</div>`;
}

// Form fields are read through elements.namedItem: names like "id", "role" or
// "name" would otherwise return the <form>'s own properties.
const fieldOf = (form, n) => form.elements.namedItem(n);

const savingRows = new Set(); // tracker rows whose status save is in flight
function lockStatusForm() {
  const f = document.querySelector('.sel-status');
  if (f) for (const el of f.elements) el.disabled = savingRows.has(Number(f.dataset.row));
}

async function saveStatus(form) {
  const row = Number(form.dataset.row);
  const state = fieldOf(form, 'state').value;
  const note = fieldOf(form, 'note').value.trim();
  const r = M.byNum.get(row);
  if (r && r.status === state && !note) { toast('That is already the status.'); return; }
  // Lock the form while saving (renderSelInner re-applies the lock if a refresh
  // replaces it) so nothing typed mid-save gets lost or mixed in.
  if (savingRows.has(row)) return;
  savingRows.add(row); lockStatusForm();
  const out = await post('/api/status', { row, state, note: note || undefined });
  savingRows.delete(row); lockStatusForm();
  toast(out.ok ? `Sample job #${row} moved to ${state}. No application was sent.` : `Status not saved: ${out.error}`, out.ok);
  if (!out.ok) return;
  if (r) r.status = state; // the model matches the tracker until the refresh lands
  // A refresh may have replaced the form during the save; settle whichever one
  // is on screen now: the saved status becomes its baseline and the saved note clears.
  const cur = document.querySelector(`.sel-status[data-row="${row}"]`);
  if (cur) {
    for (const o of fieldOf(cur, 'state').options) { o.defaultSelected = o.value === state; o.selected = o.value === state; }
    if (fieldOf(cur, 'note').value.trim() === note) fieldOf(cur, 'note').value = '';
  }
  refresh();
}

// ---------------------------------------------------------------- table

function nextStep(r) {
  switch (r.status) {
    case 'Evaluated': return r.sc >= 4 ? 'Apply' : r.sc >= 3.5 ? 'Review fit' : 'Likely skip';
    case 'Applied': { const d = daysSince(M.appliedAt(r)); return d >= 7 ? `Follow up · ${d}d` : `Waiting · ${d}d`; }
    case 'Interview': { const iv = M.ivByRow.get(r.num); return iv ? `Interview ${relDay(iv.date)}` : 'Prep'; }
    case 'Responded': return 'Reply';
    case 'Offer': return 'Review offer';
    case 'Hired': return 'Done';
    default: return 'Closed';
  }
}

function renderTable() {
  const cutoff = filt.days ? isoLocal(new Date(Date.now() - Number(filt.days) * DAY)) : '';
  const list = M.rows.filter((r) => (!filt.stage || filt.stage.split(',').includes(r.status)) && (!cutoff || M.activityDate(r) >= cutoff) && matches(r));
  $('#appsCount').textContent = fmt(list.length);
  const all = showAll || view === 'applications';
  const shown = all ? list : list.slice(0, TABLE_ROWS);
  $('#rows').innerHTML = shown.map((r) => `<tr data-key="${esc(r.key)}" tabindex="0" aria-selected="${r.key === selKey}" class="${r.key === selKey ? 'sel' : ''}">
      <td class="co" title="${esc(r.company)}">${esc(r.company)}</td><td title="${esc(r.role)}">${esc(r.role)}${stackChip(r)}</td>
      <td>${stageChip(r.status)}</td>
      <td>${shortDate(M.activityDate(r))}</td><td class="score${r.sc >= 4 ? ' hi' : ''}">${r.sc != null ? r.sc.toFixed(1) : '—'}</td><td>${esc(nextStep(r))}</td></tr>`).join('')
    || '<tr><td class="empty" colspan="6">No roles match these filters. Clear the search or pick another stage.</td></tr>';
  const btn = $('#moreRows');
  btn.hidden = view === 'applications' || list.length <= TABLE_ROWS;
  btn.textContent = showAll ? 'Show fewer' : `Show all ${fmt(list.length)}`;
}

function renderStageOptions() {
  const states = DATA.states || [];
  const sel = $('#fStage');
  // A lane's "+ more" can select a status set (Interview,Responded); give it an option so the select shows it.
  const group = filt.stage.includes(',') ? `<option value="${esc(filt.stage)}">${esc(filt.stage.split(',').join(' + '))}</option>` : '';
  sel.innerHTML = `<option value="">All stages</option>${group}${states.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join('')}`;
  sel.value = filt.stage;
}

// ---------------------------------------------------------------- activity

function renderTimeline() {
  const tone = (to) => (STAGE_TONE[to] ? `var(${STAGE_TONE[to]})` : 'var(--steel)');
  const ev = M.log.slice(-6).reverse();
  $('#timeline').innerHTML = ev.map((e) => {
    const r = M.byNum.get(Number(e.num));
    const verb = e.to === 'Applied' ? 'Applied to' : `${e.from} to ${e.to}`;
    return `<li style="--tone:${tone(e.to)}"><time>${shortDate(e.date)}</time><b>${esc(verb)}</b><span title="${esc(r?.company)}">${esc(r?.company || `#${e.num}`)}</span></li>`;
  }).join('') || '<li><b>No moves logged yet.</b></li>';
}

// ---------------------------------------------------------------- interviews page

// Redraws a tab bar; a keyboard user's focus moves to the selected tab instead of being lost.
function setTabs(sel, html) {
  const host = $(sel);
  const hadFocus = host.contains(document.activeElement);
  host.innerHTML = html;
  if (hadFocus) host.querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true });
}

const miniKpi = (n, l, s = '', tone = '--acc') => `<div class="panel mk" style="--tone:var(${tone})"><div class="n">${esc(n)}</div><div class="l">${esc(l)}</div>${s ? `<div class="s">${esc(s)}</div>` : ''}</div>`;

function ivCard(iv, past) {
  const r = iv.row != null ? MALL.byNum.get(Number(iv.row)) : null;
  const d = parseIso(iv.date);
  const prep = iv.row != null ? prepRel(Number(iv.row)) : '';
  const meet = safeUrl(iv.meetUrl);
  const awaiting = past && r?.status === 'Interview';
  return `<article class="ivcard${past ? ' past' : ''}">
    <button type="button" class="iv-main sample-cal-button" data-sample-calendar="${esc(iv.id)}" aria-label="View sample event for ${esc(iv.company)}">
      <div class="iv-date"><span>${d ? WD[d.getDay()] : '—'}</span><b>${d ? d.getDate() : '?'}</b><span>${d ? MON[d.getMonth()] : ''}</span></div>
      <div class="iv-body"><b>${esc(iv.company)}</b><small>${esc((iv.role || r?.role || '').split(' - ')[0])}</small>
        <div class="chips"><span class="chip acc">${esc(iv.round || 'Interview')}</span>${iv.time ? `<span class="chip ghost">${time12(iv.time)} CT</span>` : ''}${iv.location ? `<span class="chip ghost" title="${esc(iv.location)}">${esc(iv.location.length > 48 ? `${iv.location.slice(0, 46)}…` : iv.location)}</span>` : ''}${awaiting ? '<span class="chip solid">Outcome?</span>' : past && r ? stageChip(r.status) : ''}</div>
      </div>
      <span class="iv-open">View sample event</span>
    </button>
    <div class="iv-acts">
      <button type="button" class="btn sm" data-sample-doc="prep" data-sample-row="${iv.row ?? ''}" data-sample-iv="${esc(iv.id)}">Preview prep packet</button>
      ${r ? `<button type="button" class="btn sm" data-key="row:${r.num}" data-go="applications">Role #${r.num}</button>` : ''}
      <button type="button" class="btn sm" data-iv-edit="${esc(iv.id)}">Edit</button>
      <button type="button" class="btn sm ghost-btn" data-iv-del="${esc(iv.id)}">Remove sample interview</button>
    </div>
    ${iv.notes ? `<details><summary>Notes</summary><p>${esc(iv.notes)}</p></details>` : ''}
  </article>`;
}

function renderInterviews() {
  const invite = DATA.sampleInvite;
  $('#ivInviteResult').hidden = !invite?.accepted;
  $('#ivInviteResult').innerHTML = invite?.accepted ? `<h2>From invite to interview prep</h2>${sampleInviteOutcome(invite)}<p class="hint">Sample Gmail and Calendar workflow · all changes stay in this tab.</p>` : '';
  const t = today();
  const up = M.upcoming.filter(matches);
  const upIds = new Set(M.upcoming.map((i) => i.id));
  const past = M.ivs.filter((i) => !upIds.has(i.id)).filter(matches).reverse();
  const week = M.upcoming.filter((i) => dayDiff(parseIso(i.date), parseIso(t)) < 7).length;
  const next = M.upcoming[0];
  const awaiting = past.filter((i) => i.row != null && MALL.byNum.get(Number(i.row))?.status === 'Interview').length;
  $('#ivKpis').innerHTML = [
    miniKpi(fmt(M.upcoming.length), 'Upcoming', 'on the calendar', '--c-interview'),
    miniKpi(fmt(week), 'Next 7 days'),
    miniKpi(next ? `${relDay(next.date)}` : '—', 'Next interview', next ? `${next.company} · ${time12(next.time)}` : 'Nothing scheduled'),
    miniKpi(fmt(awaiting), 'Awaiting outcome', 'past interviews still marked Interview', '--c-review'),
  ].join('');
  // Two-week calendar: interviews, follow-ups, deadlines and study blocks, each opening Google Calendar.
  const cal = calendarDays(DATA, t, 14);
  const counts = { interview: 0, followup: 0, deadline: 0, study: 0 };
  let studyMin = 0;
  const mins = (s) => { const m = String(s || '').match(/^(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };
  for (const x of cal.flatMap((c) => c.items)) {
    counts[x.kind]++;
    if (x.kind === 'study') { const a = mins(x.block.start); const b = mins(x.block.end); if (a != null && b > a) studyMin += b - a; }
  }
  const KIND_LABEL = { interview: 'Interview', followup: 'Follow-up', deadline: 'Deadline', study: 'Study' };
  const SHOW = 5;
  $('#ivCalLegend').innerHTML = [
    ['interview', `${fmt(counts.interview)} interview${counts.interview === 1 ? '' : 's'}`],
    ['followup', `${fmt(counts.followup)} follow-up${counts.followup === 1 ? '' : 's'}`],
    ['deadline', `${fmt(counts.deadline)} deadline${counts.deadline === 1 ? '' : 's'}`],
    ['study', `${fmt(Math.round(studyMin / 60))} hr study`],
  ].map(([k, l]) => `<span class="leg k-${k}"><i aria-hidden="true"></i>${l}</span>`).join('');
  $('#ivCal').innerHTML = cal.map((c, k) => {
    const d = parseIso(c.iso);
    const ev = (x, i) => `<button type="button" class="cev sample-cal-button k-${x.kind}${i >= SHOW ? ' extra' : ''}" data-sample-calendar="${esc(x.iv?.id || '')}" data-sample-date="${c.iso}" title="${esc(`${KIND_LABEL[x.kind]}: ${x.title}${x.sub ? ` · ${x.sub}` : ''}`)}">
      <span>${x.kind === 'interview' ? `Interview${x.time ? ` · ${time12(x.time)}` : ''}` : x.time ? time12(x.time) : KIND_LABEL[x.kind]}</span><b>${esc(x.title)}</b></button>`;
    const more = c.items.length - SHOW;
    return `<div class="cday${k === 0 ? ' today' : ''}${c.items.some((x) => x.kind === 'interview') ? ' has' : ''}${d.getDay() === 0 || d.getDay() === 6 ? ' wkend' : ''}">
      <button type="button" class="cday-h sample-cal-button" data-sample-calendar="" data-sample-date="${c.iso}" title="View this sample calendar day"><span>${k === 0 ? 'Today' : WD[d.getDay()]}</span><b>${d.getDate()}</b></button>
      ${c.items.map(ev).join('')}${more > 0 ? `<button type="button" class="cmore" data-cal-more aria-expanded="false">+ ${fmt(more)} more</button>` : ''}</div>`;
  }).join('');
  $('#ivUpCount').textContent = fmt(up.length);
  $('#ivPastCount').textContent = fmt(past.length);
  $('#ivUpcoming').innerHTML = up.map((i) => ivCard(i, false)).join('') || '<p class="empty-p">No interviews coming up. Add a sample interview to try the calendar and prep workflow.</p>';
  $('#ivPast').innerHTML = past.map((i) => ivCard(i, true)).join('') || '<p class="empty-p">No past interviews.</p>';
  const fu = followUps(DATA).filter((n) => matches({ company: n.who, role: n.what, notes: n.why }));
  $('#ivFuCount').textContent = fmt(fu.length);
  $('#ivFollowups').innerHTML = fu.map((n) => {
    const d = parseIso(n.due);
    const late = n.due < t;
    const when = late ? 'Past due' : ['Today', 'Tomorrow'].includes(relDay(n.due)) ? relDay(n.due) : '';
    return `<article class="fu${late || n.due === t ? ' hot' : ''}">
      <div class="fu-date"><b>${d.getDate()}</b><span>${MON[d.getMonth()]}</span></div>
      <div class="fu-body"><b>${esc(n.who)}</b><span>${esc(n.what)}</span>${n.why ? `<small>${esc(n.why)}</small>` : ''}</div>
      ${when ? `<span class="chip ${late || n.due === t ? 'warn' : 'acc'}">${when}</span>` : ''}</article>`;
  }).join('') || '<p class="empty-p">No follow-ups logged.</p>';
}

let ivBaseline = null; // the interview as it was when the edit dialog opened
let ivSaving = false;

function openIvDialog(iv, rowNum) {
  if (!DATA) return;
  if (ivSaving) { toast('Still saving the last interview. Try again in a moment.', false); return; }
  ivBaseline = iv ? { ...iv } : null;
  const dlg = $('#ivDialog');
  const f = $('#ivForm');
  const F = (n) => fieldOf(f, n);
  f.reset();
  $('#ivErr').textContent = '';
  $('#ivDlgTitle').textContent = iv ? 'Edit sample interview' : 'Add sample interview';
  F('round').innerHTML = [...new Set([...(DATA.interviewRounds || ['1st Interview']), ...(iv?.round ? [iv.round] : [])])].map((r) => `<option>${esc(r)}</option>`).join('');
  // Interviews are global, so the row picker ignores the Career/Stack switch.
  const allRows = MALL.rows;
  const rows = allRows;
  F('row').innerHTML = `<option value="">None</option>${rows.map((r) => `<option value="${r.num}">#${r.num} ${esc(r.company)}: ${esc(r.role)}</option>`).join('')}`;
  $('#ivCoList').innerHTML = [...new Set(allRows.map((r) => r.company))].map((c) => `<option value="${esc(c)}">`).join('');
  F('ivid').value = iv?.id || '';
  if (iv) {
    for (const k of ['company', 'role', 'date', 'time', 'location', 'calendarUrl', 'meetUrl', 'notes']) F(k).value = iv[k] || '';
    F('round').value = iv.round || F('round').value;
    F('row').value = iv.row != null ? String(iv.row) : '';
  } else {
    F('date').value = isoLocal(addDays(new Date(), 1));
    F('time').value = '10:00';
    F('location').value = 'Sample video interview';
    const row = MALL.byNum.get(rowNum);
    if (row) { F('row').value = String(row.num); F('company').value = row.company; F('role').value = row.role; }
  }
  F('calendarUrl').value = ''; F('meetUrl').value = '';
  dlg.showModal();
}

async function saveIvDialog(e) {
  e.preventDefault();
  if (ivSaving) return;
  const f = $('#ivForm');
  const F = (n) => fieldOf(f, n).value.trim();
  const id = F('ivid');
  const event = {
    company: F('company'), role: F('role'), round: F('round'),
    date: F('date') || null, time: F('time') || null, location: F('location'),
    calendarUrl: F('calendarUrl') || null, meetUrl: F('meetUrl') || null, notes: F('notes'),
    row: F('row') ? Number(F('row')) : null,
  };
  if (id) {
    // An edit sends only the fields that changed, so a stale form value never
    // overwrites a field another tab or the agent updated meanwhile.
    const orig = ivBaseline || {};
    const same = (a, b) => (a ?? '') === (b ?? '') || (a ?? null) === (b ?? null);
    for (const k of Object.keys(event)) if (same(event[k], k === 'row' ? (orig.row ?? null) : orig[k])) delete event[k];
    event.id = id;
  }
  const btn = f.querySelector('button[type=submit]');
  ivSaving = true; btn.disabled = true;
  const r = await post('/api/interviews', { action: id ? 'update' : 'add', event });
  ivSaving = false; btn.disabled = false;
  if (!r.ok) { $('#ivErr').textContent = r.error; return; }
  $('#ivDialog').close();
  toast(id ? 'Sample interview updated in this tab.' : 'Sample interview added to the local calendar. Its prep preview is ready.');
  await refresh();
  if (!id) location.hash = 'interviews';
}

async function deleteIv(id) {
  const iv = M.ivs.find((i) => i.id === id) || (DATA.interviews || []).find((i) => i.id === id);
  const r = await post('/api/interviews', { action: 'delete', event: { id } });
  toast(r.ok ? 'Sample interview removed. Pipeline status is unchanged; Reset demo restores the original examples.' : `Not removed: ${r.error}`, r.ok);
  if (r.ok) refresh();
}

// ---------------------------------------------------------------- sample fit

// The static demo adapter supplies 0–100 sample scores and their point breakdown.
const STACK_GRADE = { strong: 'Strong', ok: 'Workable', weak: 'Weak' };
let inboxOpen = null; // inbox row whose sample fit details are expanded
const stackRank = (x) => (x.stack ? x.stack.score + (x.stack.basis === 'jd' ? 0.5 : 0) : -1);
const stackTitle = (s) => `${STACK_GRADE[s.grade] || s.grade} · ${s.basis === 'demo' ? 'calculated sample fit' : 'illustrative sample criteria'}${s.reasons.length ? `\n${s.reasons.map((r) => `${r.pts > 0 ? '+' : ''}${r.pts} ${r.label}`).join('\n')}` : ''}`;
function stackCell(x) {
  const s = x.stack;
  if (!s) return '—';
  return `<span class="chip sc sc-${s.grade}${s.basis === 'jd' || s.basis === 'demo' ? '' : ' sc-title'}" title="${esc(stackTitle(s))}">${s.score}</span>`;
}
function stackBlock(x) {
  const s = x.stack;
  if (!s) return '';
  if (s.basis === 'demo') {
    const change = s.previousScore == null ? '' : `<span class="score-change">${s.previousScore} → ${s.score} (${s.delta > 0 ? '+' : ''}${s.delta} points)</span>`;
    return `<div class="stk">
      <div class="stk-head"><span class="chip sc sc-${s.grade}">${s.score}/100</span><b>${STACK_GRADE[s.grade]}</b>${change}</div>
      <p class="hint">Calculated sample fit · ${(s.score / 20).toFixed(1)}/5 rating · base ${s.base}</p>
      <p class="score-terms">Sample terms: ${esc(s.details?.location || 'Location not stated')} · ${esc(s.details?.comp || 'Pay not stated')}</p>
      <ul class="stk-why">${s.reasons.map((r) => `<li class="${r.pts > 0 ? 'plus' : r.pts < 0 ? 'minus' : 'neutral'}"><b>${r.pts > 0 ? '+' : ''}${r.pts}</b> ${esc(r.label)}</li>`).join('')}</ul>
    </div>`;
  }
  const why = s.reasons.slice(0, 5).map((r) => `<li class="${r.pts > 0 ? 'plus' : 'minus'}">${r.pts > 0 ? '+' : ''}${r.pts} ${esc(r.label)}</li>`).join('');
  const ov = s.overlap ? `<li>${s.overlap.hours > 0 ? `<b>${s.overlap.hours} h/day</b> overlaps the J1 window (${esc(s.overlap.window)}${s.overlap.assumedTz ? ', time zone assumed' : ''})` : 'No overlap with the J1 window'}</li>`
    : s.hours ? `<li>Hours stated: ${esc(s.hours.raw)}${DATA.stackContext?.jobs?.length ? '' : ' · add your J1 hours in data/stack-context.yml to see the overlap'}</li>` : '';
  const ex = (s.exposure || []).map((e) => `<li class="x-${e.level}">${esc(e.text)}</li>`).join('');
  return `<div class="stk"><div class="sel-sub">Sample fit</div>
    <div class="stk-head"><span class="chip sc sc-${s.grade}">${s.score}</span><b>${STACK_GRADE[s.grade] || s.grade}</b><small>${s.basis === 'jd' ? 'illustrative sample criteria' : 'illustrative sample criteria'}</small></div>
    ${why ? `<ul class="stk-why">${why}</ul>` : ''}${ov || ex ? `<ul class="stk-ctx">${ov}${ex}</ul>` : ''}</div>`;
}

// ---------------------------------------------------------------- inbox page

function renderInboxPage() {
  const all = M.lanes.inbox;
  const laneOf = (x) => x.jev?.lane || 'unsorted';
  const counts = {};
  for (const x of all) counts[laneOf(x)] = (counts[laneOf(x)] || 0) + 1;
  const chipDefs = [['career_track', 'Career track'], ['stack_lane', 'Flexible work'], ['off_target', 'Off-target'], ['unsorted', 'Not sorted']];
  $('#inLanes').innerHTML = chipDefs.map(([k, l]) => `<button type="button" class="fchip" data-lane="${k}" aria-pressed="${inbox.lanes.has(k)}">${l} <span>${fmt(counts[k] || 0)}</span></button>`).join('');
  let list = all.filter((x) => inbox.lanes.has(laneOf(x)) && matches(x)
    && (!inbox.remote || (x.jev?.remote_us ?? 0) >= 0.5) && (!inbox.loc || (x.jev?.location_ok ?? 0) >= 0.5));
  if (inbox.sort === 'posted') list = [...list].sort((a, b) => String(b.posted || '').localeCompare(String(a.posted || '')));
  if (inbox.sort === 'company') list = [...list].sort((a, b) => a.company.localeCompare(b.company));
  // JD-read scores outrank title-only ones at the same number: the title alone cannot see core hours or monitoring.
  if (inbox.sort === 'stack') list = [...list].sort((a, b) => stackRank(b) - stackRank(a));
  const unread = (DATA.linkedin?.threads || []).filter((t) => t.unread).length;
  const onsiteN = (profileView(DATA, prof).scanAgg?.onsite || []).length;
  setTabs('#inTabs', [['postings', 'Postings', fmt(list.length)], ['messages', 'LinkedIn messages', unread ? `${fmt(unread)} unread` : ''], ['onsite', 'On-site (Texas)', fmt(onsiteN)]]
    .map(([k, l, n]) => `<button type="button" class="fchip" data-intab="${k}" aria-pressed="${inboxTab === k}">${l}${n ? ` <span>${n}</span>` : ''}</button>`).join(''));
  $('#inSecPostings').hidden = inboxTab !== 'postings';
  $('#inSecMessages').hidden = inboxTab !== 'messages';
  $('#inSecOnsite').hidden = inboxTab !== 'onsite';
  const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`);
  $('#inRows').innerHTML = list.slice(0, inbox.limit).map((x) => `<tr data-inbox-key="${esc(x.key)}" class="${inboxOpen === x.key ? 'open' : ''}" title="Click for the sample fit details">
    <td class="co" title="${esc(x.company)}">${esc(x.company)}</td>
    <td title="${esc(x.role)}"><button type="button" class="btn sm" aria-expanded="${inboxOpen === x.key}">${esc(x.role)}</button>${stackChip(x)}</td>
    <td title="${esc(x.loc)}">${esc(x.loc || '—')}</td>
    <td>${x.jev ? `<span class="chip ${x.jev.lane === 'off_target' ? 'ghost' : 'acc'}">${esc(JEV_LANE[x.jev.lane] || x.jev.lane)}</span>` : '<span class="chip ghost">Not sorted</span>'}</td>
    <td>${x.jev ? Number(x.jev.conf).toFixed(2) : '—'}</td><td>${pct(x.jev?.remote_us)}</td><td>${stackCell(x)}</td><td>${shortDate(x.posted)}</td></tr>${inboxOpen === x.key ? `<tr class="stk-row"><td colspan="8">${stackBlock(x) || '<span class="empty-p">No sample fit data for this posting yet.</span>'}<div class="sample-doc-actions"><button type="button" class="btn primary" data-track-inbox="${esc(x.key)}">Move to review</button></div><p class="hint">Adds this sample posting to your pipeline in this tab.</p></td></tr>` : ''}`).join('')
    || '<tr><td class="empty" colspan="8">No postings match. Turn on more lanes or clear the search.</td></tr>';
  const more = $('#inMore');
  more.hidden = list.length <= inbox.limit;
  more.textContent = `Show ${fmt(Math.min(PAGE, list.length - inbox.limit))} more of ${fmt(list.length - inbox.limit)}`;
  renderOnsite();
  renderLinkedIn();
}

// LinkedIn messages + InMail (data/.linkedin-inbox.json via parsers/linkedin-inbox.mjs).
function renderLinkedIn() {
  const L = DATA.linkedin;
  const all = L?.threads || [];
  const n = { all: all.length, unread: all.filter((t) => t.unread).length, inmail: all.filter((t) => t.inmail).length };
  $('#liCount').textContent = n.unread ? `${fmt(n.unread)} unread` : '';
  $('#liSub').textContent = L?.error ? `${L.error}. Showing the last messages read.`
    : L ? `Messages and InMail, read-only. Last checked ${ago(L.checkedAt)}. Click one to open it on LinkedIn.`
      : 'Not read yet. Press Refresh (you must be signed in to LinkedIn in Chrome).';
  $('#liFilter').innerHTML = [['all', 'All'], ['unread', 'Unread'], ['inmail', 'InMail']]
    .map(([k, l]) => `<button type="button" class="fchip" data-li="${k}" aria-pressed="${li.show === k}">${l} <span>${fmt(n[k])}</span></button>`).join('');
  const q = filt.q.toLowerCase();
  const list = all.filter((t) => (li.show === 'all' || t[li.show]) && (!q || `${t.name} ${t.preview}`.toLowerCase().includes(q)));
  $('#liRows').innerHTML = list.slice(0, li.limit).map((t) => {
    const link = safeUrl(t.url);
    return `<li class="${t.unread ? 'unread' : ''}"><a href="${esc(link)}" ${ext}>
      <div class="li-h"><b>${esc(t.name)}</b>${t.unread ? '<span class="chip acc">Unread</span>' : ''}${t.inmail ? '<span class="chip ghost">InMail</span>' : ''}<small>${t.at ? shortDate(t.at) : ''}</small></div>
      <p>${esc(t.preview)}</p></a></li>`;
  }).join('') || `<li class="empty-p">${L ? 'No messages match.' : 'No LinkedIn messages loaded yet.'}</li>`;
  const more = $('#liMore');
  more.hidden = list.length <= li.limit;
  more.textContent = `Show ${fmt(Math.min(20, list.length - li.limit))} more of ${fmt(list.length - li.limit)}`;
  const btn = $('#liRefresh');
  btn.disabled = li.busy;
  btn.textContent = li.busy ? 'Reading LinkedIn…' : 'Refresh';
}

async function refreshLinkedIn() {
  if (li.busy) return;
  li.busy = true;
  renderLinkedIn();
  try {
    const r = await post('/api/linkedin-inbox/refresh', {});
    if (r.linkedin) DATA.linkedin = r.linkedin;
    toast(r.ok ? 'LinkedIn messages updated.' : `LinkedIn not updated: ${r.error}`, r.ok);
  } finally {
    li.busy = false;
    renderLinkedIn();
  }
}

// On-site (Texas): rows the scan dropped only for location (server onsite.mjs).
const onsiteSource = (x) => {
  let host = '';
  try { host = new URL(x.url).hostname; } catch {}
  const m = host.match(/(?:^|\.)(craigslist|indeed|glassdoor|linkedin)\.(?:org|com)$/);
  return m ? { craigslist: 'Craigslist', indeed: 'Indeed', glassdoor: 'Glassdoor', linkedin: 'LinkedIn' }[m[1]] : 'Company site';
};
const onsiteKind = (x) => ({ Craigslist: 'craigslist', 'Company site': 'company' })[onsiteSource(x)] || 'boards';

function renderOnsite() {
  const all = profileView(DATA, prof).scanAgg?.onsite || [];
  const q = filt.q.toLowerCase();
  const n = { all: all.length, company: 0, boards: 0, craigslist: 0 };
  for (const x of all) n[onsiteKind(x)]++;
  const defs = [['all', 'All'], ['company', 'Company sites'], ['boards', 'Indeed, Glassdoor, LinkedIn'], ['craigslist', 'Craigslist']];
  $('#osFilter').innerHTML = defs.map(([k, l]) => `<button type="button" class="fchip" data-onsite="${k}" aria-pressed="${onsite.show === k}">${l} <span>${fmt(n[k])}</span></button>`).join('');
  const list = all.filter((x) => (onsite.show === 'all' || onsiteKind(x) === onsite.show)
    && (!q || [x.company, x.title, x.location].some((v) => String(v || '').toLowerCase().includes(q))));
  $('#osCount').textContent = fmt(list.length);
  $('#osRows').innerHTML = list.slice(0, onsite.limit).map((x) => {
    const link = safeUrl(x.url);
    const a = (t) => (link ? `<a href="${esc(link)}" ${ext}>${esc(t)}</a>` : esc(t));
    return `<tr><td class="co" title="${esc(x.company)}">${a(x.company)}</td><td title="${esc(x.title)}">${a(x.title)}</td>
      <td title="${esc(x.location)}">${esc(x.location)}</td><td>${onsiteKind(x) === 'craigslist' ? '<span class="chip warn">Craigslist · verify</span>' : esc(onsiteSource(x))}</td><td>${shortDate(x.seen)}</td></tr>`;
  }).join('') || '<tr><td class="empty" colspan="5">No Texas on-site jobs in the last 30 days.</td></tr>';
  const more = $('#osMore');
  more.hidden = list.length <= onsite.limit;
  more.textContent = `Show ${fmt(Math.min(40, list.length - onsite.limit))} more of ${fmt(list.length - onsite.limit)}`;
}

// ---------------------------------------------------------------- documents page

function renderDocs() {
  $('#docPath').textContent = 'Preview a job-specific ATS résumé/CV, cover letter and interview prep packet for a fictional candidate. The full connected system uses the actual job description and approved candidate facts; this demo uses labeled templates and sample role briefs.';
  const entries = M.rows.map((r) => ({ num: r.num, r, iv: sampleInterviewForRow(r.num), applied: ['Applied', 'Responded', 'Assessment', 'Interview', 'Offer', 'Hired', 'Rejected'].includes(r.status) }));
  const n = { all: entries.length, applied: entries.filter((e) => e.applied).length, staged: entries.filter((e) => !e.applied).length, prep: entries.filter((e) => e.iv).length };
  const defs = [['all', 'All sample jobs'], ['applied', 'Applied'], ['staged', 'Not yet applied'], ['prep', 'Interview linked']];
  $('#docFilter').innerHTML = defs.map(([k, l]) => `<button type="button" class="fchip" data-docshow="${k}" aria-pressed="${docs.show === k}">${l} <span>${fmt(n[k])}</span></button>`).join('');
  let list = entries.filter((e) => (docs.show === 'all' || (docs.show === 'applied' && e.applied) || (docs.show === 'staged' && !e.applied)
    || (docs.show === 'prep' && e.iv)) && matches(e.r));
  list.sort(docs.sort === 'company' ? (a, b) => a.r.company.localeCompare(b.r.company) || a.num - b.num
    : (a, b) => M.activityDate(b.r).localeCompare(M.activityDate(a.r)) || b.num - a.num);
  $('#docCount').textContent = fmt(list.length);
  $('#docGrid').innerHTML = list.slice(0, docs.limit).map(({ num, r, iv }) => `<article class="doc-card">
      <div class="doc-h"><div><b>${esc(r.company)}</b><small>${esc(r.role)}</small></div>${stageChip(r.status)}</div>
      <div class="doc-meta">#${num} · Fictional candidate · ${iv ? 'Interview linked' : 'Application packet preview'}</div>
      ${sampleDocButtons(num, iv?.id)}
      <div class="doc-acts"><button type="button" class="btn sm" data-key="row:${num}" data-go="applications">Role details</button><button type="button" class="btn sm" data-iv-add-row="${num}">Add sample interview</button></div>
    </article>`).join('') || '<p class="empty-p">No documents match. Clear the search or pick another filter.</p>';
  const more = $('#docMore');
  more.hidden = list.length <= docs.limit;
  more.textContent = `Show ${fmt(Math.min(30, list.length - docs.limit))} more of ${fmt(list.length - docs.limit)}`;
}

// ---------------------------------------------------------------- targeting page

let PRESETS; // undefined = not loaded yet, null = first load failed
let presetSeq = 0;
async function loadPresets() {
  const seq = ++presetSeq; // only the newest request may update the page
  let next = null;
  try { const r = await fetch('/api/presets'); if (r.ok) next = await r.json(); } catch { /* handled below */ }
  if (seq !== presetSeq) return;
  // A failed reload keeps what is on screen (and any typed preset name).
  if (!next && PRESETS) { toast('Couldn\'t reload presets; showing the last copy.', false); return; }
  PRESETS = next;
  renderTargeting();
  // The grading rules change only with the preset, so they reload with it.
  fetch('/api/targeting-rules').then((r) => (r.ok ? r.json() : null)).catch(() => null).then((j) => { if (j) RULESDATA = j; if (view === 'targeting') renderRules(); });
}

const renderTargeting = () => keepDraft('#tgParams', () => keepDraft('#tgSave', renderTargetingInner));

function renderTargetingInner() {
  const box = $('#tgBody');
  if (PRESETS === undefined) { box.innerHTML = '<p class="loading">Loading presets…</p>'; return; }
  if (!PRESETS) { box.innerHTML = '<p class="loading">Couldn\'t load presets. Check that the server is running.</p>'; return; }
  const p = PRESETS.params || {};
  const active = PRESETS.presets.find((x) => x.slug === PRESETS.active);
  const roles = (Array.isArray(p.target_roles) ? p.target_roles : []).map((r) => (typeof r === 'string' ? r : r?.title || r?.name || JSON.stringify(r)));
  const queries = (DATA.portals?.queries || []).filter((q) => q.enabled);
  const comps = DATA.portals?.companies || [];
  box.innerHTML = `<div class="two-col">
    <section class="panel pad">
      <div class="sel-sub">Active preset</div>
      <h2 class="big">${esc(active?.name || PRESETS.active || 'None saved')}</h2>
      <dl class="kv"><dt>Comp target</dt><dd>${esc(typeof p.comp === 'string' ? p.comp : p.comp ? JSON.stringify(p.comp) : '—')}</dd>
      <dt>Location</dt><dd>${esc(typeof p.location === 'string' ? p.location : p.location ? JSON.stringify(p.location) : '—')}</dd>
      <dt>Search queries on</dt><dd>${fmt(p.queriesEnabled)}</dd><dt>Company boards on</dt><dd>${fmt(p.boardsEnabled)} of ${fmt(comps.length)}</dd></dl>
      ${roles.length ? `<div class="sel-sub">Target roles</div><div class="chips wrap">${roles.map((r) => `<span class="chip">${esc(r)}</span>`).join('')}</div>` : ''}
      <h3>Edit sample parameters</h3>
      <form class="form-grid" id="tgParams" data-row="${esc(PRESETS.active)}">
        <label class="wide">Target roles (comma-separated)<input name="roles" value="${esc(roles.join(', '))}" maxlength="972" required autocomplete="off"></label>
        <label>Location preference<input name="location" value="${esc(p.location || '')}" maxlength="160" required autocomplete="off" aria-describedby="tgLocationHelp"><small id="tgLocationHelp">Try Remote, Hybrid, On-site, a city/state, or Any.</small></label>
        <label>Minimum compensation<input name="comp" value="${esc(p.comp || '')}" maxlength="160" required autocomplete="off" aria-describedby="tgCompHelp"><small id="tgCompHelp">Try $90,000/year or $45/hour. Rates are not converted.</small></label>
        <div class="wide"><button type="submit" class="btn">Apply & recalculate scores</button></div>
      </form>
      <p class="hint">Apply changes to recalculate sample fit across the dashboard. The examples below show what changed and why. Unclear or missing terms earn zero points; no live AI evaluation runs.</p>
    </section>
    <section class="panel pad">
      <div class="sel-sub">Presets</div>
      <ul class="plain presets">${PRESETS.presets.map((x) => `<li><div><b>${esc(x.name)}</b><small>saved ${shortDate(x.saved)}</small></div>
        ${x.slug === PRESETS.active ? '<span class="chip acc">Active</span>' : `<button type="button" class="btn sm" data-preset-switch="${esc(x.slug)}">Switch to this</button>`}</li>`).join('')}</ul>
      <form class="inline-form" id="tgSave"><input name="pname" placeholder="Name for a new preset" maxlength="60" required aria-label="New preset name" autocomplete="off"><button type="submit" class="btn">Save current as preset</button></form>
      <button type="button" class="linkish" id="tgReset">Reset parameters to saved preset</button>
      <p class="hint">Apply your parameters, then save them as a named preset before switching. Sample changes stay in this browser tab. Resetting this demo also restores the original sample jobs and interviews.</p>
      <button type="button" class="linkish" id="tgSessionReset">Reset this demo session</button>
    </section>
  </div>
  <section class="panel pad" id="tgScoreExamples" aria-labelledby="tgScoresTitle">
    <h2 id="tgScoresTitle" tabindex="-1">See your parameters change the scores</h2>
    <p class="hint" role="status" aria-live="polite">${DATA.demoScoring?.hasPrevious ? `${fmt(DATA.demoScoring.changed)} of ${fmt(DATA.demoScoring.total)} sample scores changed on the last update.` : 'Scores below use your current parameters.'} Try Project Coordinator, Remote and $60,000/year; then raise the minimum to $110,000/year and apply again.</p>
    <div class="score-examples">${(DATA.demoScoring?.examples || []).map((x) => `<article class="score-example"><div><h3>${esc(x.role)}</h3><p>${esc(x.company)}</p><button type="button" class="linkish" data-key="${esc(x.key)}">Open sample record</button></div>${stackBlock(x)}</article>`).join('')}</div>
    <p class="hint">These same three fictional postings stay here for comparison, regardless of the header filter. Scores use simple browser rules: base 50 plus role, location and pay points. The /5 rating is the /100 score divided by 20.</p>
  </section>
  <section class="panel pad"><div class="sel-sub">Search queries on (${fmt(queries.length)})</div>
    <div class="chips wrap">${queries.map((q) => `<span class="chip ghost" title="${esc(q.query)}">${esc(q.name || q.query)}</span>`).join('') || '<span class="chip ghost">None</span>'}</div></section>`;
  renderRules();
}

// ---------------------------------------------------------------- how postings are graded

let RULESDATA = null; // /api/targeting-rules: stack points, the active brief's scoring sections, profiles, Jev lanes
function renderRules() {
  const box = $('#tgRules');
  if (!box) return;
  const R = RULESDATA;
  if (!R) { box.innerHTML = '<p class="loading">Loading the grading rules…</p>'; return; }
  const pts = (n) => `<span class="pts ${n > 0 ? 'plus' : n < 0 ? 'minus' : 'neutral'}">${n > 0 ? '+' : ''}${n}</span>`;
  const rules = [...R.stack.rules, ...(R.stack.extra || [])];
  const stackRows = rules.map((r) => `<li>${pts(r.pts)}<span>${esc(r.label)}</span><small>${esc(r.scope)}</small></li>`).join('');
  const briefCols = (R.brief || []).map((s) => `<div class="rule-sec"><h3>${esc(s.title)}</h3><ul>${s.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></div>`).join('');
  const profs = (R.profiles || []).map((pf) => `<div class="rule-sec"><h3>${esc(pf.label)}</h3>${pf.description ? `<p>${esc(pf.description)}</p>` : ''}
    ${pf.title_keywords.length ? `<div class="sel-sub">Titles</div><div class="chips wrap">${pf.title_keywords.slice(0, 40).map((k) => `<span class="chip ghost">${esc(k.replace(/^(word|stem):/, ''))}</span>`).join('')}${pf.title_keywords.length > 40 ? `<span class="chip ghost">+${pf.title_keywords.length - 40} more</span>` : ''}</div>` : ''}
    ${pf.title_exclude.length ? `<div class="sel-sub">Never</div><div class="chips wrap">${pf.title_exclude.map((k) => `<span class="chip no">${esc(k.replace(/^(word|stem):/, ''))}</span>`).join('')}</div>` : ''}
    ${pf.company_keywords.length ? `<div class="sel-sub">Always, by company</div><div class="chips wrap">${pf.company_keywords.map((k) => `<span class="chip ghost">${esc(k)}</span>`).join('')}</div>` : ''}</div>`).join('');
  box.innerHTML = `<h2 class="rules-h">How postings are graded</h2>
  <div class="two-col rules">
    <section class="panel pad"><div class="sel-sub">Sample fit points</div>
      <p class="hint">Every posting starts at ${R.stack.base}. Apply one role, one location and one pay result, then keep the total between 0 and 100. ${R.stack.grades.strong}+ is Strong, ${R.stack.grades.ok}+ is Workable, under that Weak. A salary range earns +10 if its lower end meets your minimum, −10 if its upper end is below it, otherwise 0. These are illustrative browser rules; no live AI scoring or scan runs.</p>
      <ul class="rule-list">${stackRows}</ul></section>
    <section class="panel pad"><div class="sel-sub">Recorded AI-sort snapshot</div>
      <ul class="plain lanes-list">${(R.jev || []).map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
      <p class="hint">The original system's AI sort uses public posting fields and the targeting brief to return a lane and confidence. Those recorded values stay unchanged here; the demo recalculates the separate fit score and /5 rating.</p>
      <div class="sel-sub" style="margin-top:14px">Dashboard profiles (the header switch)</div>
      <p class="hint">The switch filters what you see; the preset decides what the scan hunts. A job is tagged by its title, location and company against these lists.</p>
      ${profs}</section>
  </div>
  <section class="panel pad"><div class="sel-sub">Triage brief of the active preset (what the A-F evaluation and the triage pass follow)</div>
    <div class="rules-grid">${briefCols || '<p class="empty-p">No brief found. The preset has no modes/_brief.md.</p>'}</div></section>`;
}

// ---------------------------------------------------------------- stacking page

function renderStacking() {
  const box = $('#skBody');
  if (!box || !DATA) return;
  const rows=M.lanes.inbox.filter(x=>x.stack).sort((a,b)=>b.stack.score-a.stack.score).slice(0,8);
  box.innerHTML='<div class="two-col"><section class="panel pad"><h2>Example fit review</h2><p class="hint">Your applied role, location and minimum pay preferences set these illustrative scores. They do not describe real jobs or Austin’s personal criteria.</p><ul class="plain">'+rows.map(x=>'<li><b>'+esc(x.company)+'</b> — '+esc(x.role)+stackBlock(x)+'</li>').join('')+'</ul><a class="btn" href="#targeting">Change parameters and see the rules</a></section><section class="panel pad"><h2>Example weekly capacity</h2><p>A fictional 40-hour planning budget includes 12 hours of project work and 2 hours of portfolio practice. These values are illustrative.</p><p class="hint">The live dashboard can calculate capacity from configured work and study blocks. This copy contains no personal schedule or accounts.</p><a class="btn" href="#interviews">Explore the sample calendar</a></section></div>';
}

async function presetAction(url, body, okMsg) {
  const r = await post(url, body);
  toast(r.ok ? okMsg : `Not done: ${r.error}`, r.ok);
  if (!r.ok) return;
  $('#tgParams')?.reset();
  // Clear the name box only for a save, and only if it still holds the saved name.
  const box = $('#tgSave') && fieldOf($('#tgSave'), 'pname');
  if (url.endsWith('/save') && box && box.value.trim() === body.name) box.value = '';
  if (await refresh()) {
    await loadPresets();
    if (url.endsWith('/params')) {
      $('#tgScoresTitle')?.focus({ preventScroll: true });
      $('#tgScoreExamples')?.scrollIntoView({ block: 'start' });
    }
  }
}

// ---------------------------------------------------------------- scans page

// portal-health.tsv status -> what it means and what to do about it.
const BOARD_STATUS = {
  reachable: ['Answered', ''],
  empty: ['Answered, 0 postings', 'Two or more empty scans usually mean the company moved job sites. Find their new careers page and update portals.yml.'],
  slug_gone: ['Board not found', 'The board was removed or the account expired. Find their new careers page and update portals.yml.'],
  network: ['Network error', 'Usually a one-off timeout. Act only if it repeats on the next scans.'],
};

// Every portals.yml entry, tagged with the state the Scans page filters on:
// ok / bad (last scan result), search (web-search only, skipped by the daily scan),
// new (on but no scan logged yet), off (enabled: false).
function boardRows() {
  const P = DATA.portals || {};
  const H = DATA.health || {};
  const all = [...(P.companies || []).map((b) => ({ ...b, kind: 'Company' })), ...(P.boards || []).map((b) => ({ ...b, kind: 'Job board' }))];
  return all.map((b) => {
    const h = H[b.name] || null;
    const st = !b.enabled ? 'off' : b.method === 'websearch' ? 'search' : !h ? 'new' : h.status === 'reachable' ? 'ok' : 'bad';
    return { ...b, h, st };
  });
}

function renderBoards(rows) {
  const n = { on: 0, bad: 0, search: 0, off: 0, all: rows.length };
  for (const b of rows) { if (b.st !== 'off') n.on++; if (n[b.st] != null) n[b.st]++; }
  const defs = [['on', 'Turned on'], ['bad', 'Need attention'], ['search', 'Web search only'], ['off', 'Turned off'], ['all', 'All']];
  $('#sbFilter').innerHTML = defs.map(([k, l]) => `<button type="button" class="fchip" data-boards="${k}" aria-pressed="${boards.show === k}">${l} <span>${fmt(n[k])}</span></button>`).join('');
  const q = filt.q.toLowerCase();
  const rank = { bad: 0, new: 1, ok: 2, search: 3, off: 4 };
  const list = rows.filter((b) => (boards.show === 'all' || (boards.show === 'on' ? b.st !== 'off' : b.st === boards.show))
    && (!q || [b.name, b.notes, b.provider, b.url].some((v) => String(v || '').toLowerCase().includes(q))))
    .sort((a, b) => rank[a.st] - rank[b.st] || a.name.localeCompare(b.name));
  $('#sbCount').textContent = fmt(list.length);
  const label = (b) => {
    if (b.st === 'off') return ['<span class="chip ghost">Turned off</span>', ''];
    if (b.st === 'search') return ['<span class="chip ghost">Web search only</span>', 'No job feed. The daily scan skips it; it is covered by search queries.'];
    if (b.st === 'new') return ['<span class="chip ghost">Not scanned yet</span>', 'Picked up by the next daily scan.'];
    const [text, todo] = BOARD_STATUS[b.h.status] || [b.h.status, 'Unknown result. Check the scan log.'];
    return [`<span class="chip ${b.st === 'bad' ? 'warn' : 'ok'}">${esc(text)}</span>`, todo];
  };
  $('#sbRows').innerHTML = list.slice(0, boards.limit).map((b) => {
    const [chip, todo] = label(b);
    const link = safeUrl(b.url);
    const name = link ? `<a href="${esc(link)}" ${ext}>${esc(b.name)}</a>` : esc(b.name);
    return `<tr><td class="co" title="${esc(b.notes || b.url || '')}">${name}</td><td>${esc(b.kind)}${b.provider ? ` <small>${esc(b.provider)}</small>` : ''}</td>
      <td>${chip}</td><td class="todo">${esc(todo)}</td><td>${b.h ? shortDate(b.h.at) : '—'}</td></tr>`;
  }).join('') || '<tr><td class="empty" colspan="5">No boards match.</td></tr>';
  const more = $('#sbMore');
  more.hidden = list.length <= boards.limit;
  more.textContent = `Show ${fmt(Math.min(40, list.length - boards.limit))} more of ${fmt(list.length - boards.limit)}`;
}

function renderScans() {
  const runs = (DATA.scanRuns || []).slice(-14).reverse();
  const last = runs[0];
  const rows = boardRows();
  const scanned = rows.filter((b) => b.st === 'ok' || b.st === 'bad');
  const bad = rows.filter((b) => b.st === 'bad');
  const sched = DATA.handoff?.scanSchedule;
  $('#scSched').textContent = `${sched ? `Runs daily at ${sched}` : 'Runs daily'}: scan the job boards, have Jev sort the new postings, then back up your files.`;
  $('#scKpis').innerHTML = [
    miniKpi(last ? ago(last.timestamp) : '—', 'Last scan', last ? `${last.status} · ${new Date(last.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'No runs logged'),
    miniKpi(fmt(last?.new_added), 'New postings', 'added by the last scan', '--c-inbox'),
    miniKpi(fmt(last?.found), 'Postings checked', `${fmt(last?.boards)} boards · ${fmt(last?.companies)} companies`),
    miniKpi(`${fmt(scanned.length - bad.length)}/${fmt(scanned.length)}`, 'Boards answering', bad.length ? `${fmt(bad.length)} need attention` : 'all answered', bad.length ? '--c-review' : '--c-interview'),
  ].join('');
  $('#scRuns').innerHTML = runs.map((r) => `<tr><td>${new Date(r.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</td>
    <td>${fmt(r.boards)}</td><td>${fmt(r.found)}</td><td>${fmt(r.filtered_title)}</td><td>${fmt(r.filtered_location)}</td><td>${fmt(r.dupes)}</td>
    <td><b>${fmt(r.new_added)}</b></td><td>${Number(r.errors) ? `<span class="chip ghost">${fmt(r.errors)}</span>` : '0'}</td></tr>`).join('')
    || '<tr><td class="empty" colspan="8">No scan runs logged yet.</td></tr>';
  $('#scLog').textContent = (DATA.scanLog || []).join('\n') || 'No log lines yet.';
  const inb = M.lanes.inbox;
  const c = (k) => inb.filter((x) => (x.jev?.lane || 'unsorted') === k).length;
  $('#scJev').innerHTML = `<dl class="kv pad-x"><dt>Career track</dt><dd>${fmt(c('career_track'))}</dd><dt>Flexible work</dt><dd>${fmt(c('stack_lane'))}</dd>
    <dt>Off-target</dt><dd>${fmt(c('off_target'))}</dd><dt>Not sorted yet</dt><dd>${fmt(c('unsorted'))}</dd></dl>`;
  renderBoards(rows);
}

// ---------------------------------------------------------------- answers page
// The answer bank (dashboard-web/answer-bank.mjs): rules, profile answers, Austin's own
// answers, and what the agent learned from past forms. Global, so it ignores Career/Stack.

let ANSWERS = null;
let answersSeq = 0;
const abFilt = { learned: 'open' }; // open | all

async function loadAnswers() {
  const seq = ++answersSeq;
  let next = null;
  try { const r = await fetch('/api/answers'); if (r.ok) next = await r.json(); } catch { /* handled below */ }
  if (seq !== answersSeq) return;
  if (!next) { if (ANSWERS) toast('Couldn\'t reload answers; showing the last copy.', false); else if (view === 'answers') $('#abBody').innerHTML = '<p class="empty-p">Couldn\'t load the answer bank. Is the server running?</p>'; return; }
  ANSWERS = next;
  const open = ANSWERS.needed.length + ANSWERS.review.length;
  const nb = $('#nbAnswers');
  if (nb) nb.textContent = open ? String(open) : '';
  if (view === 'answers') renderAnswers();
}

// Live refreshes re-render the page; keep whatever Austin is typing in any answer box.
function renderAnswers() {
  const box = $('#abBody');
  const drafts = [...box.querySelectorAll('form[data-ab]')].map((f) => [f.dataset.ab, [...f.elements].filter((el) => el.name && isDirty(el)).map((el) => [el.name, el.value, el === document.activeElement])]).filter(([, d]) => d.length);
  box.innerHTML = answersHtml(ANSWERS);
  for (const [key, d] of drafts) {
    const f = box.querySelector(`form[data-ab="${CSS.escape(key)}"]`);
    for (const [name, value, focused] of d) { const el = f?.elements.namedItem(name); if (el) { el.value = value; if (focused) el.focus(); } }
  }
}

const seenText = (w = []) => w.filter(Boolean).slice(0, 3).map((x) => [x.company, x.row ? `#${x.row}` : ''].filter(Boolean).join(' ')).filter(Boolean).join(', ');

function answersHtml(a) {
  const open = [...a.needed, ...a.review];
  const learnedOpen = a.learned.filter((g) => !g.covered);
  const learned = abFilt.learned === 'open' ? learnedOpen : a.learned;
  const kpi = (n, l, s, tone) => `<div class="panel mk" style="--tone:${tone}"><div class="n">${n}</div><div class="l">${l}</div><div class="s">${s}</div></div>`;

  const needRow = (e) => `<li><form class="ab-row" data-ab="${esc(e.id)}">
      <div class="ab-q"><b>${esc(e.question)}</b>
        <small>${e.status === 'review' ? '<span class="chip warn">Agent\'s answer, needs your OK</span> ' : '<span class="chip acc">Agent couldn\'t answer</span> '}${esc(seenText(e.where) || 'Logged ' + fmtShort(e.at))}</small></div>
      <input name="answer" value="${esc(e.answer || '')}" placeholder="Your answer" aria-label="Answer for: ${esc(e.question)}" maxlength="2000" autocomplete="off">
      <div class="ab-btns"><button type="submit" class="btn sm primary">${e.status === 'review' ? 'Approve' : 'Save'}</button>
        <button type="button" class="btn sm ghost-btn" data-ab-del="${esc(e.id)}">Dismiss</button></div>
    </form></li>`;

  const savedRow = (e) => `<li><form class="ab-row" data-ab="${esc(e.id)}">
      <div class="ab-q"><b>${esc(e.question)}</b><small>${e.source === 'agent' ? 'Learned from a form, approved by you' : 'Added by you'} · ${esc(fmtShort(e.at))}</small></div>
      <input name="answer" value="${esc(e.answer)}" aria-label="Answer for: ${esc(e.question)}" maxlength="2000" autocomplete="off">
      <div class="ab-btns"><button type="submit" class="btn sm">Update</button>
        <button type="button" class="btn sm ghost-btn" data-ab-del="${esc(e.id)}">Delete</button></div>
    </form></li>`;

  const rules = (title, tone, items) => `<div class="ab-rule" style="--tone:${tone}"><h3>${title}</h3><ul>${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`;

  const learnedRow = (g) => {
    const status = g.covered ? '<span class="chip ok">Answered</span>' : g.blank ? '<span class="chip warn">Left blank</span>' : '<span class="chip ghost">No saved answer</span>';
    const mixed = g.mixed ? ' <span class="chip warn" title="You gave different answers on different forms">Mixed</span>' : '';
    const given = g.answers.slice(0, 3).map((x) => `<span class="chip">${esc(x.answer)}${x.count > 1 ? ` ×${x.count}` : ''}</span>`).join(' ') || '<span class="ab-none">Nothing recorded</span>';
    const top = g.answers[0]?.answer || '';
    return `<tr><td class="todo"><b>${esc(g.question)}</b>${g.wordings.length > 1 || g.wordings[0] !== g.question ? `<small class="ab-words">Asked as: ${esc(g.wordings.slice(0, 3).join(' · '))}</small>` : ''}</td>
      <td class="ab-given">${given}</td><td>${g.count}</td><td>${status}${mixed}</td>
      <td class="ab-act">${g.covered ? '' : `<button type="button" class="btn sm" data-ab-use="${esc(g.key)}" data-q="${esc(g.question)}" data-a="${esc(top)}">Save an answer</button>`}
        <button type="button" class="btn sm ghost-btn" data-ab-hide="${esc(g.key)}" title="Stop showing this question">Hide</button></td></tr>`;
  };

  return `<div class="mini-kpis">
      ${kpi(open.length, 'Need your answer', open.length ? 'Answer once, filled every time after' : 'Nothing waiting on you', 'var(--warn)')}
      ${kpi(a.saved.length, 'Your answers', 'Typed on this page', 'var(--acc)')}
      ${kpi(a.standing.length, 'From your profile', 'config/profile.yml', 'var(--c-applied)')}
      ${kpi(a.learned.length, 'Seen on forms', `${learnedOpen.length} without a saved answer`, 'var(--c-review)')}
    </div>

    <section class="panel" aria-labelledby="abNeedT">
      <div class="panel-h"><div><h2 id="abNeedT">Needs your answer <span class="count">${open.length}</span></h2>
        <p>Questions the agent hit on a form and couldn't answer, or answered from a form you filled and wants you to confirm. Save one and it fills automatically from then on.</p></div></div>
      ${open.length ? `<ul class="ab-list">${open.map(needRow).join('')}</ul>` : '<p class="empty-p">Nothing waiting. When the agent can\'t answer a question it shows up here.</p>'}
    </section>

    <div class="two-col">
      <section class="panel" aria-labelledby="abMineT">
        <div class="panel-h"><div><h2 id="abMineT">Your answers <span class="count">${a.saved.length}</span></h2>
          <p>Anything you want answered the same way every time. These win over your profile.</p></div></div>
        <form class="ab-add" data-ab="new" id="abAdd">
          <input name="question" placeholder="Question, e.g. Are you willing to work weekends?" aria-label="New question" maxlength="400" autocomplete="off" required>
          <input name="answer" placeholder="Your answer" aria-label="Answer" maxlength="2000" autocomplete="off" required>
          <button type="submit" class="btn primary">Add</button>
        </form>
        ${a.saved.length ? `<ul class="ab-list">${a.saved.map(savedRow).join('')}</ul>` : '<p class="empty-p">None yet. Add one above, or save one from the lists on this page.</p>'}
      </section>

      <section class="panel" aria-labelledby="abRulesT">
        <div class="panel-h"><div><h2 id="abRulesT">What the agent can and can't do</h2>
          <p>On every application form. You always review and click Submit yourself.</p></div></div>
        <div class="ab-rules">
          ${rules('Fills for you', 'var(--c-interview)', a.rules.can)}
          ${rules('Asks you first', 'var(--warn)', a.rules.ask)}
          ${rules('Never', '#ff8a7a', a.rules.never)}
        </div>
      </section>
    </div>

    ${EEO_GUIDE}

    <section class="panel" aria-labelledby="abStandT">
      <div class="panel-h"><div><h2 id="abStandT">From your profile <span class="count">${a.standing.length}</span></h2>
        <p>Already on file in <code>config/profile.yml</code>. To change one, add it under Your answers; that wins.</p></div></div>
      <div class="table-wrap"><table class="tbl-sb"><thead><tr><th>Question</th><th>Answer the agent gives</th></tr></thead><tbody>
        ${a.standing.map((s) => `<tr><td>${esc(s.question)}${s.eeo ? ' <span class="chip ghost">EEO</span>' : ''}</td><td class="todo">${esc(s.answer)}</td></tr>`).join('')}
      </tbody></table></div>
    </section>

    <section class="panel" aria-labelledby="abLearnT">
      <div class="panel-h"><div><h2 id="abLearnT">Learned from your applications <span class="count">${learned.length}</span></h2>
        <p>Every question recorded on a form you've filled, grouped however it was worded. This list grows on its own with each application.</p></div>
        <div class="seg-toggle" role="group" aria-label="Which questions">
          <button type="button" data-ab-filt="open" aria-pressed="${abFilt.learned === 'open'}">No answer yet</button>
          <button type="button" data-ab-filt="all" aria-pressed="${abFilt.learned === 'all'}">All</button></div></div>
      ${learned.length ? `<div class="table-wrap"><table class="tbl-sb"><thead><tr><th>Question</th><th>What you answered</th><th>Times</th><th>Status</th><th><span class="sr">Actions</span></th></tr></thead><tbody>${learned.map(learnedRow).join('')}</tbody></table></div>`
        : `<p class="empty-p">${abFilt.learned === 'open' ? 'Every question seen so far has an answer.' : 'No recorded form answers yet.'}</p>`}
    </section>`;
}

// Plain-English guide to the voluntary self-ID questions. Static text: general US rules, not legal advice.
const EEO_GUIDE = '<section class="panel pad"><h2>Sample answers only</h2><p>This demo illustrates an answer library. It does not store personal eligibility, demographic, salary or account information. Nothing entered here is submitted to an employer.</p></section>';

async function answerAction(body, okMsg) {
  const r = await post('/api/answers', body);
  if (!r.ok) { toast(r.error || 'Couldn\'t save that.', false); return false; }
  toast(okMsg);
  await loadAnswers();
  return true;
}

async function submitAnswerForm(f) {
  const key = f.dataset.ab;
  const answer = f.elements.namedItem('answer').value.trim();
  if (!answer) { toast('Type an answer first.', false); f.elements.namedItem('answer').focus(); return; }
  const btn = f.querySelector('button[type=submit]');
  btn.disabled = true;
  const ok = key === 'new'
    ? await answerAction({ action: 'save', question: f.elements.namedItem('question').value, answer }, 'Saved. The agent uses it from now on.')
    : await answerAction({ action: 'save', id: key, answer }, 'Saved. The agent uses it from now on.');
  btn.disabled = false;
  // The reload re-rendered the page and kept the typed text as a draft; clear the fresh add form.
  if (ok && key === 'new') $('#abAdd')?.reset();
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('#abBody')) return;
  const del = e.target.closest('[data-ab-del]');
  if (del) return answerAction({ action: 'delete', id: del.dataset.abDel }, 'Removed.');
  const hide = e.target.closest('[data-ab-hide]');
  if (hide) return answerAction({ action: 'hide', key: hide.dataset.abHide }, 'Hidden from this list.');
  const ft = e.target.closest('[data-ab-filt]');
  if (ft) { abFilt.learned = ft.dataset.abFilt; return renderAnswers(); }
  const use = e.target.closest('[data-ab-use]');
  if (use) {
    // Prefill the add form with this question and the answer given most often; Austin edits, then Adds.
    const f = $('#abAdd');
    f.elements.namedItem('question').value = use.dataset.q;
    f.elements.namedItem('answer').value = use.dataset.a;
    f.scrollIntoView({ block: 'center' });
    f.elements.namedItem('answer').focus();
    f.elements.namedItem('answer').select();
  }
});
document.addEventListener('submit', (e) => {
  const f = e.target.closest('#abBody form[data-ab]');
  if (f) { e.preventDefault(); submitAnswerForm(f); }
});

// ---------------------------------------------------------------- learn page
// dashboard-web/learn.mjs: skill gaps (upskill.mjs), learning paths, certifications, and a
// searchable copy of the sindresorhus/awesome index. Global, so it ignores Career/Stack.

let LEARN = null;
let learnSeq = 0;
let AWESOME = null; // loaded once, on first visit
const ln = { certs: 'all', q: '', open: null };
const KIND_LABEL = { course: 'Course', reading: 'Reading', project: 'Project', practice: 'Practice', exam: 'Exam', setup: 'Setup' };
const CERT_KIND = { free: ['ok', 'Free'], course: ['acc', 'Low-cost course'], proctored: ['warn', 'Proctored exam'] };
const CERT_STATUS = [['', 'Not started'], ['planned', 'Planned'], ['studying', 'Studying'], ['booked', 'Exam booked'], ['passed', 'Passed']];

async function loadLearn() {
  const seq = ++learnSeq;
  let next = null;
  try { const r = await fetch('/api/learn'); if (r.ok) next = await r.json(); } catch { /* handled below */ }
  if (seq !== learnSeq) return;
  if (!next) { if (LEARN) toast('Couldn\'t reload the Learn page; showing the last copy.', false); else if (view === 'learn') $('#lnBody').innerHTML = '<p class="empty-p">Couldn\'t load the Learn page. Is the server running?</p>'; return; }
  LEARN = next;
  if (ln.open == null) ln.open = LEARN.topics.find((t) => t.doneCount < t.steps.length)?.id || LEARN.topics[0]?.id || '';
  if (view === 'learn') renderLearn();
  if (!AWESOME) {
    AWESOME = { lists: [], loading: true };
    fetch('/api/learn/index').then((r) => r.json()).catch(() => ({ lists: [], error: 'Couldn\'t load the awesome index.' }))
      .then((j) => { AWESOME = j; if (view === 'learn') renderAwesome(); });
  }
}

function renderLearn() {
  const box = $('#lnBody');
  const add = box.querySelector('#lnAdd');
  const draft = add ? add.elements.namedItem('name').value : '';
  const focus = document.activeElement?.id;
  box.innerHTML = learnHtml(LEARN);
  if (draft) box.querySelector('#lnAdd').elements.namedItem('name').value = draft;
  if (focus) document.getElementById(focus)?.focus();
  renderAwesome();
}

const stepIcon = (k) => `<span class="ln-kind">${esc(KIND_LABEL[k] || 'Step')}</span>`;

function learnHtml(L) {
  const study = L.study ? `${to12(L.study.start)} to ${to12(L.study.end)}` : '';
  const nx = L.next;
  const upNext = nx ? `<section class="panel ln-next" aria-labelledby="lnNextT">
      <div><h2 id="lnNextT">Up next${study ? ` <span class="ln-when">Tonight ${esc(study)}</span>` : ''}</h2>
        <p><b>${esc(nx.title)}</b> <span class="ln-sub">${esc(nx.topicName)} · ${esc(KIND_LABEL[nx.kind] || 'Step')}</span></p></div>
      <div class="page-btns">${nx.url ? `<a class="btn" href="${esc(nx.url)}" ${ext}>Open</a>` : ''}
        <button type="button" class="btn primary" data-ln-step="${esc(nx.topic)}|${esc(nx.id)}" data-done="1">Mark done</button></div>
    </section>` : '';

  const topic = (t) => {
    const open = ln.open === t.id;
    const steps = t.steps.length ? `<ol class="ln-steps">${t.steps.map((s) => `<li class="${s.done ? 'done' : ''}">
        <label><input type="checkbox" data-ln-step="${esc(t.id)}|${esc(s.id)}" ${s.done ? 'checked' : ''}><span>${esc(s.title)}</span></label>
        ${stepIcon(s.kind)}${s.url ? `<a class="ln-open" href="${esc(s.url)}" ${ext}>Open</a>` : ''}${s.done ? `<small>Done ${esc(fmtShort(s.done))}</small>` : ''}</li>`).join('')}</ol>`
      : '<p class="ln-wait">No steps yet. Ask the agent "build my learning path for ' + esc(t.name) + '" and it fills this in.</p>';
    return `<li class="ln-topic ${open ? 'open' : ''}">
      <button type="button" class="ln-th" data-ln-open="${esc(t.id)}" aria-expanded="${open}">
        <span><b>${esc(t.name)}</b><small>${esc(t.why || '')}</small></span>
        <span class="ln-count">${t.steps.length ? `${t.doneCount} of ${t.steps.length}` : 'No path yet'}</span></button>
      ${open ? `<div class="ln-tb">${steps}<div class="ln-tf"><button type="button" class="btn sm ghost-btn" data-ln-remove="${esc(t.id)}">Remove topic</button></div></div>` : ''}
    </li>`;
  };

  const gap = (g) => `<li><span><b>${esc(g.skill)}</b><small>In ${g.postings} of your evaluated postings</small></span>
      ${g.onPath ? '<span class="chip ok">On your path</span>' : `<button type="button" class="btn sm" data-ln-gap="${esc(g.skill)}" data-n="${g.postings}">Start a path</button>`}</li>`;

  const certs = L.certs.filter((c) => ln.certs === 'all' || (ln.certs === 'free' ? c.kind !== 'proctored' : c.kind === 'proctored'));
  const cert = (c) => {
    const [tone, label] = CERT_KIND[c.kind] || ['ghost', c.kind];
    return `<tr class="${c.status === 'passed' ? 'ln-passed' : ''}">
      <td class="todo"><b>${c.url ? `<a href="${esc(c.url)}" ${ext}>${esc(c.name)}</a>` : esc(c.name)}</b><small class="ab-words">${esc(c.issuer)}</small></td>
      <td><span class="chip ${tone}">${esc(label)}</span><small class="ab-words">${esc(c.cost)}</small></td>
      <td class="todo">${esc(c.fit)}<small class="ab-words">${esc(c.format)} ${esc(c.plan)}</small></td>
      <td><select data-ln-cert="${esc(c.id)}" aria-label="Status for ${esc(c.name)}">${CERT_STATUS.map(([v, l]) => `<option value="${v}" ${v === c.status ? 'selected' : ''}>${l}</option>`).join('')}</select></td></tr>`;
  };

  return `${upNext}
    <div class="two-col">
      <section class="panel" aria-labelledby="lnPathT">
        <div class="panel-h"><div><h2 id="lnPathT">Learning paths <span class="count">${L.topics.length}</span></h2>
          <p>Free resources first, then a project, then the exam. Tick steps as you finish them.</p></div></div>
        ${L.topics.length ? `<ul class="ln-topics">${L.topics.map(topic).join('')}</ul>` : '<p class="empty-p">No topics yet. Start one from your skill gaps, or add your own below.</p>'}
        <form class="ab-add ln-add" id="lnAdd">
          <input id="lnAddName" name="name" placeholder="Add a topic, e.g. Primavera P6" aria-label="New topic" maxlength="80" autocomplete="off" required>
          <button type="submit" class="btn">Add topic</button>
        </form>
      </section>

      <section class="panel" aria-labelledby="lnGapT">
        <div class="panel-h"><div><h2 id="lnGapT">Skill gaps in your postings</h2>
          <p>Skills your evaluated jobs asked for that your CV and profile don't list. Counted from every report.</p></div></div>
        ${L.gaps.length ? `<ul class="ln-gaps">${L.gaps.map(gap).join('')}</ul>` : '<p class="empty-p">No gaps found yet. This fills in as jobs get evaluated.</p>'}
      </section>
    </div>

    <section class="panel" aria-labelledby="lnCertT">
      <div class="panel-h"><div><h2 id="lnCertT">Certifications <span class="count">${L.certs.length}</span></h2>
        <p>Picked for your target roles and the gaps above, best fit first. Prices checked ${esc(fmtShort(L.certsChecked) || 'recently')}; confirm on the official page before you pay.</p></div>
        <div class="seg-toggle" role="group" aria-label="Which certifications">
          ${[['all', 'All'], ['free', 'Free and low cost'], ['proctored', 'Proctored exams']].map(([v, l]) => `<button type="button" data-ln-cf="${v}" aria-pressed="${ln.certs === v}">${l}</button>`).join('')}</div></div>
      <div class="table-wrap"><table class="tbl-sb ln-certs"><thead><tr><th>Certification</th><th>Type and cost</th><th>Why it fits you</th><th>Status</th></tr></thead><tbody>${certs.map(cert).join('')}</tbody></table></div>
    </section>

    <section class="panel" aria-labelledby="lnAwT">
      <div class="panel-h"><div><h2 id="lnAwT">Awesome lists</h2>
        <p>The <a href="https://github.com/sindresorhus/awesome" ${ext}>sindresorhus/awesome</a> index: hand-picked lists of tools, courses and guides on hundreds of topics. Search it to find resources for any path.</p></div></div>
      <div class="toolbar"><input type="search" id="lnQ" class="ln-q" placeholder="Search lists, e.g. analytics, machine learning, courses" aria-label="Search awesome lists" autocomplete="off" value="${esc(ln.q)}"></div>
      <div id="lnAw"></div>
    </section>`;
}

const to12 = (hm) => { const [h, m] = String(hm || '').split(':').map(Number); if (!Number.isFinite(h)) return hm; return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`; };

function renderAwesome() {
  const box = $('#lnAw');
  if (!box) return;
  if (!AWESOME || AWESOME.loading) { box.innerHTML = '<p class="empty-p">Loading the index…</p>'; return; }
  if (!AWESOME.lists.length) { box.innerHTML = `<p class="empty-p">${esc(AWESOME.error || 'The index is empty.')}</p>`; return; }
  const q = ln.q.trim().toLowerCase();
  const words = q.split(/\s+/).filter(Boolean);
  const hits = words.length ? AWESOME.lists.filter((l) => { const t = `${l.name} ${l.desc} ${l.section}`.toLowerCase(); return words.every((w) => t.includes(w)); }) : AWESOME.lists.filter((l) => l.section === 'Learn' || l.section === 'Business' || l.section === 'Work');
  const shown = hits.slice(0, 40);
  box.innerHTML = `<p class="ln-awmeta">${words.length ? `${hits.length} match${hits.length === 1 ? '' : 'es'}` : 'Learn, Business and Work sections'} of ${AWESOME.lists.length} lists${AWESOME.stale ? ' · offline copy' : ''}${hits.length > shown.length ? ` · showing ${shown.length}` : ''}</p>
    ${shown.length ? `<ul class="ln-aw">${shown.map((l) => `<li><a href="${esc(l.url)}" ${ext}>${esc(l.name)}</a><span class="chip ghost">${esc(l.section)}</span>${l.desc ? `<small>${esc(l.desc)}</small>` : ''}</li>`).join('')}</ul>` : '<p class="empty-p">No lists match. Try a broader word.</p>'}`;
}

async function learnAction(body, okMsg) {
  const r = await post('/api/learn', body);
  if (!r.ok) { toast(r.error || 'Couldn\'t save that.', false); return false; }
  if (okMsg) toast(okMsg);
  await loadLearn();
  return true;
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('#lnBody')) return;
  const op = e.target.closest('[data-ln-open]');
  if (op) { ln.open = ln.open === op.dataset.lnOpen ? '' : op.dataset.lnOpen; return renderLearn(); }
  const nxt = e.target.closest('button[data-ln-step]');
  if (nxt) { const [topic, step] = nxt.dataset.lnStep.split('|'); return learnAction({ action: 'toggleStep', topic, step, done: true }, 'Nice. Step marked done.'); }
  const rm = e.target.closest('[data-ln-remove]');
  if (rm) return learnAction({ action: 'removeTopic', topic: rm.dataset.lnRemove }, 'Topic removed.');
  const g = e.target.closest('[data-ln-gap]');
  if (g) return learnAction({ action: 'addTopic', name: g.dataset.lnGap, why: `Asked for in ${g.dataset.n} of your evaluated postings` }, 'Added. Ask the agent to build its path.');
  const cf = e.target.closest('[data-ln-cf]');
  if (cf) { ln.certs = cf.dataset.lnCf; return renderLearn(); }
});
document.addEventListener('change', (e) => {
  const cb = e.target.closest('#lnBody input[type=checkbox][data-ln-step]');
  if (cb) { const [topic, step] = cb.dataset.lnStep.split('|'); return learnAction({ action: 'toggleStep', topic, step, done: cb.checked }); }
  const cs = e.target.closest('#lnBody select[data-ln-cert]');
  if (cs) return learnAction({ action: 'certStatus', id: cs.dataset.lnCert, status: cs.value }, 'Status saved.');
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'lnQ') { ln.q = e.target.value; renderAwesome(); }
});
document.addEventListener('submit', (e) => {
  if (e.target.id !== 'lnAdd') return;
  e.preventDefault();
  const name = e.target.elements.namedItem('name').value.trim();
  if (name) learnAction({ action: 'addTopic', name }, 'Added. Ask the agent to build its path.').then((ok) => { if (ok) { const f = $('#lnAdd'); if (f) f.reset(); } });
});

// ---------------------------------------------------------------- platforms page
// dashboard-web/platforms.mjs: AI-training gig platforms, local and freelance gig sites,
// Austin's status on each, and the newest Craigslist posts from the scan.

let PLAT = null;
let platSeq = 0;
const PF_STATUS = [['', 'Not joined'], ['watching', 'Watching'], ['applied', 'Applied'], ['assessment', 'Assessment'], ['active', 'Active'], ['dropped', 'Dropped']];
const PF_TONE = { active: 'ok', applied: 'acc', assessment: 'acc', watching: 'ghost', dropped: 'ghost' };

// ---------------------------------------------------------------- websites

let WEB = null;
const web = { cat: 'all', q: '', limit: 60 };
const WEB_TONE = (s) => (/reachable|updated/i.test(s) ? 'ok' : /sign-in/i.test(s) ? 'acc' : 'warn');
const webDate = (s) => { const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s || '') ? `${s}T12:00:00` : s); return s && !Number.isNaN(+d) ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : (s || ''); };

async function loadWebsites() {
  if (!WEB) {
    try { const r = await fetch('/api/websites'); if (r.ok) WEB = await r.json(); } catch { /* handled below */ }
    if (!WEB) { if (view === 'websites') $('#wbBody').innerHTML = '<p class="empty-p">The websites list isn\'t built yet.</p>'; return; }
  }
  if (view === 'websites') renderWebsites();
}

function renderWebsites() {
  const host = $('#wbBody');
  const hadSearch = document.activeElement?.id === 'wbQ';
  const q = web.q.toLowerCase();
  const inCat = WEB.rows.filter((r) => web.cat === 'all' || r.category === web.cat);
  const list = q ? inCat.filter((r) => `${r.name} ${r.does} ${r.notes} ${r.category} ${r.url}`.toLowerCase().includes(q)) : inCat;
  const counts = {};
  for (const r of WEB.rows) counts[r.category] = (counts[r.category] || 0) + 1;
  const chips = [['all', 'All', WEB.rows.length], ...WEB.categories.map((c) => [c, c, counts[c]])]
    .map(([k, l, n]) => `<button type="button" class="fchip" data-webcat="${esc(k)}" aria-pressed="${web.cat === k}">${esc(l)} <span>${fmt(n)}</span></button>`).join('');
  const row = (r) => {
    const extra = r.noteLinks.map((u, i) => `<a href="${esc(safeUrl(u))}" ${ext}>${r.noteLinks.length > 1 ? `Link ${i + 1}` : 'Extra Link'}</a>`).join(' · ');
    return `<tr><td><b>${r.url ? `<a href="${esc(safeUrl(r.url))}" ${ext}>${esc(r.name)}</a>` : esc(r.name)}</b><small class="wb-host">${esc(hostOf(r.url))}</small></td>
      <td class="todo">${esc(r.does)}${r.notes || extra ? `<small class="wb-note">${esc(r.notes)}${r.notes && extra ? ' · ' : ''}${extra}</small>` : ''}</td>
      <td class="wb-cat">${web.cat === 'all' ? esc(r.category) : ''}</td>
      <td>${r.demo ? `<a href="${esc(safeUrl(r.demo))}" ${ext}>Watch Demo</a>` : ''}</td>
      <td><span class="chip ${WEB_TONE(r.status)}">${esc(r.status || 'Not Checked')}</span></td></tr>`;
  };
  host.innerHTML = `<section class="panel" aria-labelledby="wbListT">
      <div class="panel-h"><div><h2 id="wbListT">${web.cat === 'all' ? 'All Websites' : esc(web.cat)} <span class="count">${fmt(list.length)}</span></h2>
        <p>Links checked ${esc(webDate(WEB.rows[0]?.checked))} · Copy built ${esc(webDate(WEB.generated))}</p></div>
        <input id="wbQ" class="wb-q" type="search" placeholder="Search Websites" aria-label="Search websites" value="${esc(web.q)}" autocomplete="off"></div>
      <div class="chips wb-chips">${chips}</div>
      ${list.length ? `<div class="table-wrap"><table class="tbl-sb wb-tbl"><thead><tr><th>Website</th><th>What It Does</th><th>${web.cat === 'all' ? 'Category' : ''}</th><th>Demo</th><th>Link Status</th></tr></thead>
        <tbody>${list.slice(0, web.limit).map(row).join('')}</tbody></table></div>
        ${list.length > web.limit ? `<button type="button" class="btn wb-more" data-webmore>Show ${fmt(Math.min(60, list.length - web.limit))} More of ${fmt(list.length - web.limit)}</button>` : ''}`
        : '<p class="empty-p">No websites match that search.</p>'}
    </section>`;
  if (hadSearch) { const i = $('#wbQ'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
}

let pfShow = 'all'; // Platforms filter chip: all | short | rated | unrated | joined
async function loadPlatforms() {
  const seq = ++platSeq;
  let next = null;
  try { const r = await fetch('/api/platforms'); if (r.ok) next = await r.json(); } catch { /* handled below */ }
  if (seq !== platSeq) return;
  if (!next) { if (PLAT) toast('Couldn\'t reload platforms; showing the last copy.', false); else if (view === 'platforms') $('#pfBody').innerHTML = '<p class="empty-p">Couldn\'t load platforms. Is the server running?</p>'; return; }
  PLAT = next;
  if (view === 'platforms') $('#pfBody').innerHTML = platformsHtml(PLAT);
}

const pfSelect = (c) => `<select data-pf-status="${esc(c.id)}" aria-label="Your status on ${esc(c.name)}">${PF_STATUS.map(([v, l]) => `<option value="${v}" ${v === c.status ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
const pfSources = (list) => (list.length ? `<p class="pf-src">Sources: ${list.map((u, i) => `<a href="${esc(u)}" ${ext}>${/reddit\.com/.test(u) ? `Reddit ${i + 1}` : esc(new URL(u).hostname.replace(/^www\./, ''))}</a>`).join(' · ')}</p>` : '');

function platformsHtml(P) {
  const active = P.ai.filter((c) => c.status === 'active').length;
  const shown = platformFilter(P.ai, pfShow);
  const n = Object.fromEntries(PLATFORM_FILTERS.map(([k]) => [k, platformFilter(P.ai, k).length]));
  const chips = `<div class="chips-f pf-filter" role="group" aria-label="Show platforms">${PLATFORM_FILTERS.map(([k, l]) => `<button type="button" class="fchip" data-pfshow="${k}" aria-pressed="${pfShow === k}">${l} <span>${fmt(n[k])}</span></button>`).join('')}</div>`;
  const rate = (c) => { const r = platformRating(c); return r ? `<span class="chip ${r.tone}" title="${esc(c.evidence || '')}">${esc(r.text)}</span>` : ''; };
  const none = '<tr><td colspan="5" class="empty">No platforms in this view.</td></tr>';
  const row = (c) => `<tr><td><b>${c.url ? `<a href="${esc(c.url)}" ${ext}>${esc(c.name)}</a>` : esc(c.name)}</b>${c.priority ? `<small class="pf-pri">Shortlist ${c.priority === 6 ? 'side pick' : `#${c.priority}`}</small>` : ''}</td>
      <td>${rate(c) || '<span class="ab-none">None</span>'}</td><td class="todo">${esc(c.kind || '')}</td><td class="todo">${esc(c.take || c.fit || '')}</td>
      <td>${c.status ? `<span class="chip ${PF_TONE[c.status] || 'ghost'}">${esc(PF_STATUS.find(([v]) => v === c.status)?.[1] || c.status)}</span>` : '<span class="ab-none">Not joined</span>'}</td></tr>`;

  const card = (c) => `<article class="pf-card${c.status === 'active' ? ' on' : ''}">
      <header><h3>${c.url ? `<a href="${esc(c.url)}" ${ext}>${esc(c.name)}</a>` : esc(c.name)}</h3>${pfSelect(c)}</header>
      ${rate(c) || c.kind ? `<p class="pf-meta">${rate(c)}${c.kind ? `<span>${esc(c.kind)}</span>` : ''}${c.evidence ? `<span>${esc(c.evidence)}</span>` : ''}</p>` : ''}
      <p class="pf-what">${esc(c.what)}</p>
      <dl class="pf-dl">
        ${c.why ? `<dt>Why shortlisted</dt><dd>${esc(c.why)}</dd>` : ''}
        ${c.howIn ? `<dt>How you get in</dt><dd>${esc(c.howIn)}</dd>` : ''}
        ${c.pay ? `<dt>Pay</dt><dd>${esc(c.pay)}</dd>` : ''}
        ${c.steady ? `<dt>How steady</dt><dd>${esc(c.steady)}</dd>` : ''}
        ${c.fit ? `<dt>Fit for you</dt><dd>${esc(c.fit)}</dd>` : ''}
        ${c.signal ? `<dt>Workers report</dt><dd>${esc(c.signal)}</dd>` : ''}
        ${c.take ? `<dt>Bottom line</dt><dd>${esc(c.take)}</dd>` : ''}
      </dl>
      ${c.redditGood || c.redditBad ? `<div class="pf-reddit"><h4>What Reddit says</h4><div class="pf-rg">
        <ul class="good">${(c.redditGood || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
        <ul class="bad">${(c.redditBad || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div></div>` : ''}
      ${c.warn ? `<p class="pf-warn"><b>Watch out:</b> ${esc(c.warn)}</p>` : ''}
      ${c.searches?.length ? `<div class="pf-searches">${c.searches.map((s) => `<a class="btn sm" href="${esc(s.url)}" ${ext}>${esc(s.label)}</a>`).join('')}</div>` : ''}
      ${pfSources(c.sources || [])}
    </article>`;

  const cl = P.craigslist.length ? `<ul class="pf-cl">${P.craigslist.map((x) => `<li><a href="${esc(x.url)}" ${ext}>${esc(x.title)}</a><small>${esc(x.location)} · ${esc(fmtShort(x.date))}</small></li>`).join('')}</ul>`
    : '<p class="empty-p">No Craigslist posts in the last 3 weeks of scans.</p>';

  return `<section class="panel" aria-labelledby="pfCmpT">
      <div class="panel-h"><div><h2 id="pfCmpT">AI-training platforms side by side <span class="count">${P.ai.length}</span></h2>
        <p>Your shortlist first, then best rated. You're active on ${active}. ${P.guide ? `Ratings from your AI Work Platforms guide, checked ${esc(fmtShort(P.guide.checked))}.` : `Researched ${esc(fmtShort(P.checked) || 'recently')}.`} Reddit is real people's experience, not a promise.</p></div></div>
      ${chips}
      ${P.guide?.status ? `<p class="pf-warn pf-note"><b>Check the status before you invest time.</b> ${esc(P.guide.status)}</p>` : ''}
      <div class="table-wrap pf-cmp-wrap"><table class="tbl-sb pf-cmp"><thead><tr><th>Platform</th><th>Rating</th><th>What It Is</th><th>Bottom Line</th><th>You</th></tr></thead><tbody>${shown.map(row).join('') || none}</tbody></table></div>
      ${P.guide?.method ? `<p class="pf-src pf-method">${esc(P.guide.method)}</p>` : ''}
    </section>

    <section class="panel" aria-labelledby="pfAiT">
      <div class="panel-h"><div><h2 id="pfAiT">Platform details</h2>
        <p>Set your status on each. Gigs from these platforms show under the Gigs switch at the top.</p></div></div>
      <div class="pf-grid">${shown.map(card).join('') || '<p class="empty-p">No platforms in this view.</p>'}</div>
    </section>

    <section class="panel" aria-labelledby="pfLocT">
      <div class="panel-h"><div><h2 id="pfLocT">Local and freelance gigs</h2>
        <p>Craigslist for local side work in your area. Upwork and Fiverr for remote freelance projects you price yourself.</p></div></div>
      <div class="pf-grid">${P.local.map(card).join('')}</div>
      <div class="pf-clwrap"><h3>Newest Craigslist posts from the daily scan <span class="count">${P.craigslist.length}</span></h3>
        <p class="pf-src">Many are unrelated or scams. Check the poster before you reply.</p>${cl}</div>
    </section>`;
}

document.addEventListener('change', async (e) => {
  const s = e.target.closest('#pfBody select[data-pf-status]');
  if (!s) return;
  const r = await post('/api/platforms', { id: s.dataset.pfStatus, status: s.value });
  if (!r.ok) { toast(r.error || 'Couldn\'t save that.', false); return; }
  toast('Status saved.');
  loadPlatforms();
});

// ---------------------------------------------------------------- settings page

function renderSettings() {
  const acc = document.documentElement.dataset.accent;
  const v = store.get('mc-view') || '3d';
  const wr = warRoomOn();
  $('#stBody').innerHTML = `<div class="set-row"><div><b>Look</b><small>War Room is the Career Arsenal black-glass look and opens by default. Mission Control is the graphite original. Same pages, same sample data.</small></div>
      <div class="seg" role="group" aria-label="Look"><button type="button" data-theme-set="graphite" aria-pressed="${!wr}">Mission Control</button><button type="button" data-theme-set="warroom" aria-pressed="${wr}">War Room</button></div></div>
    <div class="set-row"><div><b>Accent color</b><small>Color of buttons and highlights.</small></div>
      <div class="seg" role="group" aria-label="Accent color">${['ice', 'amber', 'silver', 'mint'].map((a) => `<button type="button" data-accent="${a}" aria-pressed="${a === acc}">${a[0].toUpperCase()}${a.slice(1)}</button>`).join('')}</div></div>
    <div class="set-row"><div><b>Pipeline board</b><small>3D tilt or flat.</small></div>
      <div class="seg" role="group" aria-label="Board view">${['2d', '3d'].map((x) => `<button type="button" data-view="${x}" aria-pressed="${x === v}">${x.toUpperCase()}</button>`).join('')}</div></div>
    <div class="set-row"><div><b>Demo snapshot</b><small>Read-only sample data. Snapshot loaded ${esc(new Date(DATA.generatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }))}.</small></div>
      <button type="button" class="btn" id="stRefresh">Refresh now</button></div>
    <div class="set-row"><div><b>Documents folder</b><small>${esc(DATA.packets?.dir || 'Not set')}</small></div>
      ${DATA.packets ? '<button type="button" class="btn" data-open-folder="">Open folder</button>' : ''}</div>
    <div class="set-row"><div><b>Classic dashboard</b><small>The old page, kept as a backup. Everything you need is on this page now.</small></div>
      <a class="btn" href="/classic">Open backup</a></div>`;
}

// ---------------------------------------------------------------- wiring

// Targeting re-reads /api/presets on each live refresh: another tab or the agent may have switched presets.
// Mail page: the Gmail sweep log (data/reply-log.json). Mail is global, so it ignores the Career/Stack switch.
let mailTab = 'action';
const MAIL_STATE = { 'awaiting-you': ['warn', 'Waiting on you'], replied: ['ok', 'You replied'], 'you-sent': ['acc', 'You wrote first'], none: ['ghost', 'No reply seen'] };
const MAIL_KIND = { interview: ['acc', 'Interview'], rejection: ['ghost', 'Rejected'], recruiter: ['ok', 'Recruiter'] };
const mailRowAttrs = (n) => {
  const key = n !== '' && n != null && MALL.byNum.has(Number(n)) ? `row:${Number(n)}` : '';
  return key ? ` data-key="${key}" tabindex="0" title="Open this application"` : '';
};
const mailRowTag = (n) => (mailRowAttrs(n) ? ` <small>#${Number(n)}</small>` : '');

function mailTable(head, rows, empty) {
  if (!rows.length) return `<p class="empty-p">${esc(empty)}</p>`;
  return `<div class="table-wrap"><table class="tbl-sb tbl-mail"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}

function renderMail() {
  renderSampleInvite();
  const m = DATA.mail;
  $('#mlSub').textContent = 'Accept the fictional Gmail invite below to create its sample calendar event and automatically open the prep packet. The remaining mail log is a recorded sample.';
  const t = today();
  const action = mailActions(m, t);
  const replies = [...(m?.replies || [])].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const outreach = [...(m?.outreach || [])].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const gig = m?.gig || [];
  const confirm = mailConfirmRows(m, MALL.rows, MALL.appliedAt);
  const ok = confirm.filter((x) => x.state === 'ok').length;
  const gaps = confirm.filter((x) => x.state === 'gap').length;
  const unscanned = confirm.filter((x) => x.state === 'new').length;
  const waiting = outreach.filter((o) => o.state === 'awaiting-you').length;
  $('#mlKpis').innerHTML = [
    miniKpi(fmt(action.length), 'Needs action', 'things waiting on you', '--c-review'),
    miniKpi(fmt(waiting), 'Recruiters waiting', `of ${fmt(outreach.length)} who reached out`),
    miniKpi(`${fmt(ok)}/${fmt(confirm.length)}`, 'Confirmed by email', 'applications with a confirmation', '--c-interview'),
    miniKpi(fmt(gaps), 'No confirmation found', unscanned ? `${fmt(unscanned)} more not scanned yet` : 'all applications checked'),
  ].join('');
  const tabs = [['action', 'Needs action', action.length], ['replies', 'Replies', replies.length], ['confirm', 'Confirmations', confirm.length], ['outreach', 'Recruiters', outreach.length], ['gig', 'Gig platforms', gig.length]];
  setTabs('#mlTabs', tabs.map(([k, l, n]) => `<button type="button" class="fchip" data-mailtab="${k}" aria-pressed="${mailTab === k}">${l} <span>${fmt(n)}</span></button>`).join(''));

  let body = '';
  if (mailTab === 'action') {
    const list = action.filter((a) => matches({ company: a.who, role: a.what, notes: a.why }));
    let group = '';
    const rows = [];
    for (const a of list) {
      const dated = /^\d{4}-\d{2}-\d{2}$/.test(a.due || '');
      const g = !dated ? 'No date' : a.due < t ? 'Past due' : 'Coming up';
      if (g !== group) { group = g; rows.push(`<tr class="grp"><td colspan="4">${g}</td></tr>`); }
      const due = !dated ? '<span class="chip ghost">Open</span>' : a.due < t ? `<span class="chip warn">${esc(shortDate(a.due))}</span>` : `<span class="chip ${a.due === t ? 'warn' : 'acc'}">${esc(relDay(a.due))}</span>`;
      const why = String(a.why || '');
      rows.push(`<tr${mailRowAttrs(a.row)}><td>${due}</td><td class="co">${esc(a.who)}${mailRowTag(a.row)}</td><td class="todo">${esc(a.what)}</td><td class="todo">${why.length > 200 ? `<div class="clamp">${esc(why)}</div><button type="button" class="linkish" data-clamp aria-expanded="false">Show more</button>` : esc(why)}</td></tr>`);
    }
    body = mailTable(['Due', 'Who', 'What to do', 'Details'], rows, 'Nothing is waiting on you in email.');
  } else if (mailTab === 'replies') {
    const list = replies.filter((x) => matches({ company: x.company, role: x.what, notes: x.next }));
    body = mailTable(['Date', 'Result', 'Company', 'What they said', 'Next'], list.map((x) => {
      const [tone, label] = MAIL_KIND[x.kind] || ['ghost', x.kind || 'Reply'];
      return `<tr${mailRowAttrs(x.row)}><td>${esc(shortDate(x.date))}</td><td><span class="chip ${tone}">${esc(label)}</span></td><td class="co">${esc(x.company)}${mailRowTag(x.row)}</td><td class="todo">${esc(x.what)}</td><td class="todo">${esc(x.next || '')}</td></tr>`;
    }), 'No replies logged.');
  } else if (mailTab === 'confirm') {
    const list = confirm.filter(({ r }) => matches(r));
    body = mailTable(['#', 'Company', 'Role', 'Status', 'Confirmation email'], list.map(({ r, state, detail }) => {
      const [tone, label] = state === 'ok' ? ['ok', 'Found'] : state === 'gap' ? ['warn', 'Not found'] : ['ghost', 'Not scanned'];
      return `<tr${mailRowAttrs(r.num)}><td>${r.num}</td><td class="co">${esc(r.company)}</td><td class="todo">${esc(r.role)}</td><td>${esc(r.status)}</td><td class="todo"><span class="chip ${tone}">${label}</span> ${esc(detail)}</td></tr>`;
    }), 'No applications match.')
      + '<p class="empty-p">Not found means no matching email turned up in Gmail. That is not proof the application failed: some systems send nothing or use another address.</p>';
  } else if (mailTab === 'outreach') {
    const list = outreach.filter((o) => matches({ company: o.name, role: o.role, notes: o.firm }));
    body = mailTable(['Last contact', 'Recruiter', 'Firm', 'Role', 'Via', 'Status'], list.map((o) => {
      const [tone, label] = MAIL_STATE[o.state] || MAIL_STATE.none;
      return `<tr><td>${esc(shortDate(o.date))}</td><td class="co">${esc(o.name)}</td><td class="todo">${esc(o.firm || '')}</td><td class="todo">${esc(o.role || '')}</td><td>${esc(o.channel || '')}</td><td><span class="chip ${tone}">${label}</span></td></tr>`;
    }), 'No recruiter outreach logged.')
      + '<p class="empty-p">No reply seen only means Gmail shows no back-and-forth. A reply sent inside LinkedIn would not appear here.</p>';
  } else {
    const list = gig.filter((g) => matches({ company: g.platform, notes: g.line }));
    body = mailTable(['Platform', 'Note'], list.map((g) => `<tr><td class="co">${esc(g.platform)}</td><td class="todo">${esc(g.line)}</td></tr>`), 'No gig-platform mail logged.');
  }
  $('#mlBody').innerHTML = body;
  // On a phone the table stacks and its header row is hidden, so each cell carries its column name.
  const heads = [...document.querySelectorAll('#mlBody thead th')].map((th) => th.textContent);
  document.querySelectorAll('#mlBody tbody tr:not(.grp)').forEach((tr) => [...tr.cells].forEach((td, i) => td.setAttribute('data-label', heads[i] || '')));
  const labels = Object.entries(m?.labels || {}).map(([k, n]) => `${k} ${n}`).join(' · ');
  $('#mlFoot').textContent = labels ? `Job-search Gmail labels, as of the last sweep: ${labels}.` : '';
}

// Sidebar: live counts on the nav and how fresh each data feed is.
function renderSide() {
  const set = (id, n) => { const el = $(id); el.textContent = n ? (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : fmt(n)) : ''; el.hidden = !n; };
  set('#nbInterviews', MALL.upcoming.length);
  set('#nbMail', DATA.mail?.needsAction?.length || 0);
  set('#nbInbox', M.lanes.inbox.length);
  if (!answersSeq) loadAnswers(); // nav badge on first load; the Answers page refreshes it after that
  const when = (s) => (s.key === 'mail' ? (s.at ? shortDate(s.at) : 'Never') : s.at ? ago(s.at) : 'Never');
  const host = $('#sysRows');
  const focused = host.contains(document.activeElement) ? document.activeElement.getAttribute('href') : '';
  host.innerHTML = systemStatus(DATA).map((s) => `<li><a href="#${s.go}" class="${s.ok ? 'ok' : 'stale'}" title="${esc(`${s.label}: ${s.ok ? 'up to date' : 'needs a look'}`)}"><i aria-hidden="true"></i><span>${esc(s.label)}</span><small>${esc(when(s))}${s.ok ? '' : ' · check'}</small></a></li>`).join('');
  if (focused) host.querySelector(`a[href="${focused}"]`)?.focus({ preventScroll: true });
}

function renderLiveTag() {
  const base = 'Demo snapshot';
  $('#dataTag').classList.toggle('down', !sseLive);
  $('#dataTagText').textContent = sseLive ? base : reconnecting ? 'Reconnecting…' : 'Connecting…';
}

const PAGE_RENDER = { interviews: renderInterviews, mail: renderMail, inbox: renderInboxPage, stacking: renderStacking, documents: renderDocs, answers: loadAnswers, learn: loadLearn, platforms: loadPlatforms, websites: loadWebsites, targeting: loadPresets, scans: renderScans, settings: renderSettings };

// In the All view a Stack job carries a small tag so the two can be told apart.
const stackChip = (x) => (prof === 'all' && profilesOf(x).includes('stack') ? '<span class="chip stack">Flexible</span>' : '');
function renderProfileSwitch() {
  const n = { all: (DATA.tracker || []).length + (DATA.pipeline?.pending || []).length };
  for (const id of PROFILES) n[id] = [...(DATA.tracker || []), ...(DATA.pipeline?.pending || [])].filter((x) => profilesOf(x).includes(id)).length;
  for (const b of document.querySelectorAll('#profSw [data-profile]')) {
    const id = b.dataset.profile;
    b.setAttribute('aria-pressed', String(id === prof));
    if (id !== 'all' && DATA.searchProfiles?.[id]) b.firstChild.textContent = DATA.searchProfiles[id];
    b.querySelector('span').textContent = fmt(n[id] || 0);
  }
}
function setProfile(p) {
  prof = PROFILES.includes(p) ? p : 'all';
  store.set('mc-profile', prof);
  if (DATA) renderAll();
}

function renderAll() {
  M = build(profileView(DATA, prof));
  MALL = prof === 'all' ? M : build(DATA);
  renderProfileSwitch();
  if (!selKey || !findItem(selKey)) selKey = M.caseNum != null ? `row:${M.caseNum}` : null;
  renderLiveTag();
  renderSide();
  renderKpis();
  renderLanes();
  renderNext();
  renderAlerts();
  renderSel();
  renderStageOptions();
  renderTable();
  renderTimeline();
  renderWarRoom(DATA, M, MALL);
  PAGE_RENDER[view]?.();
}

function setViewFromHash() {
  // A sub-route like #inbox/messages opens that part of the page, so a link can land on it directly.
  const [h, sub] = location.hash.replace('#', '').split('/');
  view = VIEWS.includes(h) ? h : 'overview';
  if (view === 'inbox') inboxTab = ['messages', 'onsite'].includes(sub) ? sub : 'postings';
  alertsOpen = null;
  $('#main').dataset.view = view;
  document.querySelectorAll('[data-views]').forEach((el) => { el.hidden = !el.dataset.views.split(' ').includes(view); });
  document.querySelectorAll('.side a[data-nav]').forEach((a) => {
    a.classList.toggle('on', a.dataset.nav === view);
    if (a.dataset.nav === view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    // On a phone the nav is one scrolling row; keep the current page in it.
    if (a.dataset.nav === view && innerWidth <= 900) a.scrollIntoView({ block: 'nearest', inline: 'center' });
  });
  if (!DATA) return;
  renderAlerts();
  renderTable();
  PAGE_RENDER[view]?.();
  if (view === 'overview') links.size();
}

function select(key) {
  if (!key) return;
  selKey = key;
  renderLanes();
  renderSel();
  renderTable();
}

function filterStage(status) {
  filt.stage = status;
  renderStageOptions();
  showAll = false;
  renderTable();
  $('#apps').scrollIntoView({ block: 'start' });
}

function setAccent(a) {
  document.documentElement.dataset.accent = a;
  document.querySelectorAll('[data-accent]').forEach((b) => { if (b.tagName === 'BUTTON') b.setAttribute('aria-pressed', String(b.dataset.accent === a)); });
  store.set(accentKey(), a);
  links.readAccent();
}

// Two looks share one page: graphite Mission Control and the War Room (Career Arsenal).
// Each remembers its own accent; the War Room starts on mint.
function accentKey() { return warRoomOn() ? 'mc-accent-wr' : 'mc-accent'; }
function defaultAccent() { return store.get(accentKey()) || (warRoomOn() ? 'mint' : 'ice'); }
function setTheme(t) {
  const wr = t === 'warroom';
  store.set('mc-theme', wr ? 'warroom' : 'graphite'); // War Room is the default, so graphite has to be remembered by name
  // "/warroom" and "?theme=" force a look, so switching away from a forced one reloads the plain address.
  const forced = location.pathname === '/warroom' ? 'warroom' : (location.search.match(/[?&]theme=(\w+)/) || [])[1];
  if (forced && forced !== (wr ? 'warroom' : 'graphite')) { location.href = `./${location.hash}`; return; }
  if (wr) document.documentElement.dataset.theme = 'warroom'; else delete document.documentElement.dataset.theme;
  document.title = wr ? 'Career Arsenal · War Room' : 'Career Arsenal · Mission Control';
  setAccent(defaultAccent());
  if (DATA) { renderAll(); if (view === 'overview') links.size(); }
}

function setBoardView(v) {
  $('#board').classList.toggle('is-3d', v === '3d');
  document.querySelectorAll('button[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
  store.set('mc-view', v);
}

document.addEventListener('click', (e) => {
  const acc = e.target.closest('button[data-accent]');
  if (acc) return setAccent(acc.dataset.accent);
  const th = e.target.closest('button[data-theme-set]');
  if (th) return setTheme(th.dataset.themeSet);
  const pb = e.target.closest('#profSw [data-profile]');
  if (pb) return setProfile(pb.dataset.profile);
  const bv = e.target.closest('button[data-view]');
  if (bv) return setBoardView(bv.dataset.view);
  const more = e.target.closest('button.lane-more');
  if (more) return filterStage(more.dataset.status);
  if (!DATA) return; // everything below needs the data loaded
  const acceptInvite = e.target.closest('[data-accept-invite]');
  if (acceptInvite) return acceptSampleInvite(acceptInvite.dataset.acceptInvite, acceptInvite);
  if (e.target.closest('[data-demo-start]')) return startSampleWorkflow();
  if (e.target.closest('[data-demo-reset]')) return presetAction('/api/presets/session-reset', {}, 'Demo reset: original sample jobs, interviews, parameters and presets restored.');
  const sampleDoc = e.target.closest('[data-sample-doc]');
  if (sampleDoc) return openSampleDocument(Number(sampleDoc.dataset.sampleRow), sampleDoc.dataset.sampleDoc, sampleDoc.dataset.sampleIv);
  if (e.target.closest('[data-sample-close]')) return $('#sampleDocDialog').close();
  const sampleCalendar = e.target.closest('[data-sample-calendar]');
  if (sampleCalendar) return openSampleCalendar(sampleCalendar.dataset.sampleCalendar, sampleCalendar.dataset.sampleDate);
  const trackInbox = e.target.closest('[data-track-inbox]');
  if (trackInbox) return moveInboxToReview(trackInbox.dataset.trackInbox);
  const addRowInterview = e.target.closest('[data-iv-add-row]');
  if (addRowInterview) return openIvDialog(null, Number(addRowInterview.dataset.ivAddRow));
  const adx = e.target.closest('[data-al-dismiss]');
  if (adx) return dismissAlert(adx.dataset.alDismiss);
  const ppb = e.target.closest('[data-prep-build]');
  if (ppb) return buildPack(Number(ppb.dataset.prepBuild), ppb);
  const of =e.target.closest('[data-open-folder]');
  if (of) return openFolder(of.dataset.openFolder);
  // An inbox row expands its sample fit details in place; links in the row still open the posting.
  const ir = e.target.closest('#inRows tr[data-inbox-key]');
  if (ir && !e.target.closest('a')) { inboxOpen = inboxOpen === ir.dataset.inboxKey ? null : ir.dataset.inboxKey; return renderInboxPage(); }
  // Plain click opens the file on the PC; Ctrl or Shift-click still opens the browser copy.
  const ofl = e.target.closest('a[data-open-file]');
  if (ofl && e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey) { e.preventDefault(); return openFile(ofl.dataset.openFile, ofl.href); }
  if (e.target.closest('[data-iv-add]')) return openIvDialog(null);
  const ive = e.target.closest('[data-iv-edit]');
  if (ive) return openIvDialog((DATA.interviews || []).find((i) => i.id === ive.dataset.ivEdit));
  const ivd = e.target.closest('[data-iv-del]');
  if (ivd) return deleteIv(ivd.dataset.ivDel);
  if (e.target.closest('[data-dlg-close]')) return $('#ivDialog').close();
  const lane = e.target.closest('[data-lane]');
  if (lane) { const k = lane.dataset.lane; inbox.lanes.has(k) ? inbox.lanes.delete(k) : inbox.lanes.add(k); inbox.limit = PAGE; return renderInboxPage(); }
  const pfs = e.target.closest('[data-pfshow]');
  if (pfs) { pfShow = pfs.dataset.pfshow; if (PLAT) $('#pfBody').innerHTML = platformsHtml(PLAT); return; }
  const ds = e.target.closest('[data-docshow]');
  if (ds) { docs.show = ds.dataset.docshow; docs.limit = 30; return renderDocs(); }
  const wc = e.target.closest('[data-webcat]');
  if (wc) { web.cat = wc.dataset.webcat; web.limit = 60; return renderWebsites(); }
  if (e.target.closest('[data-webmore]')) { web.limit += 60; return renderWebsites(); }
  const lf = e.target.closest('[data-li]');
  if (lf) { li.show = lf.dataset.li; li.limit = 8; return renderLinkedIn(); }
  const os = e.target.closest('[data-onsite]');
  if (os) { onsite.show = os.dataset.onsite; onsite.limit = 40; return renderOnsite(); }
  const mt = e.target.closest('[data-mailtab]');
  if (mt) { mailTab = mt.dataset.mailtab; return renderMail(); }
  const it = e.target.closest('[data-intab]');
  // Through the hash, so reload and links to #inbox/<tab> always agree with what is on screen.
  if (it) { inboxTab = it.dataset.intab; location.hash = `inbox/${inboxTab}`; return undefined; }
  if (e.target.closest('#alToggle')) { alertsOpen = $('#alToggle').getAttribute('aria-expanded') !== 'true'; return renderAlerts(); }
  // A busy day shows its first items; "+ N more" reveals the rest right in the calendar.
  const cm = e.target.closest('[data-cal-more]');
  if (cm) {
    const open = cm.closest('.cday').classList.toggle('open');
    const label = (cm.dataset.label ||= cm.textContent);
    cm.setAttribute('aria-expanded', String(open));
    cm.textContent = open ? 'Show less' : label;
    return undefined;
  }
  const cl = e.target.closest('[data-clamp]');
  if (cl) {
    const open = cl.previousElementSibling.classList.toggle('open');
    cl.textContent = open ? 'Show less' : 'Show more';
    cl.setAttribute('aria-expanded', String(open));
    return undefined;
  }
  const mr = e.target.closest('#mlBody tr[data-key]');
  if (mr) { select(mr.dataset.key); return showSelection(); }
  const bs = e.target.closest('[data-boards]');
  if (bs) { boards.show = bs.dataset.boards; boards.limit = 40; return renderBoards(boardRows()); }
  const ps = e.target.closest('[data-preset-switch]');
  if (ps) {
    const name = PRESETS?.presets.find((x) => x.slug === ps.dataset.presetSwitch)?.name || ps.dataset.presetSwitch;
    presetAction('/api/presets/switch', { slug: ps.dataset.presetSwitch }, `Switched sample preset to ${name}.`);
    return;
  }
  if (e.target.closest('#tgReset')) {
    presetAction('/api/presets/reset', {}, 'Sample parameters reset to the saved preset.');
    return;
  }
  if (e.target.closest('#tgSessionReset')) return presetAction('/api/presets/session-reset', {}, 'Demo reset: original sample jobs, interviews, parameters and presets restored.');
  if (e.target.closest('#stRefresh')) return refresh().then((ok) => ok && toast('Data refreshed.'));
  const item = e.target.closest('[data-key]');
  if (item && item.closest('#lanes, #rows, #next, #alRows, .ivlist, .doc-grid, #tgScoreExamples')) {
    if (item.closest('#tgScoreExamples') && !findItem(item.dataset.key)) setProfile('all');
    select(item.dataset.key);
    if (item.dataset.go) location.hash = item.dataset.go;
    else if (item.closest('#alRows, #tgScoreExamples')) showSelection();
    return;
  }
  const step = e.target.closest('#next [data-status]');
  if (step) return filterStage(step.dataset.status);
  const go = e.target.closest('#next [data-go]');
  if (go) { location.hash = go.dataset.go; return; }
});
document.addEventListener('submit', (e) => {
  if (e.target.matches('.sel-status')) { e.preventDefault(); saveStatus(e.target); }
  if (e.target.id === 'tgParams') {
    e.preventDefault();
    presetAction('/api/presets/params', { target_roles: fieldOf(e.target, 'roles').value.split(',').map((x) => x.trim()).filter(Boolean), location: fieldOf(e.target, 'location').value.trim(), comp: fieldOf(e.target, 'comp').value.trim() }, 'Parameters applied. Sample scores recalculated in this tab.');
  }
  if (e.target.id === 'tgSave') { e.preventDefault(); const name = fieldOf(e.target, 'pname').value.trim(); if (name) presetAction('/api/presets/save', { name }, `Saved preset "${name}".`); }
});
$('#ivForm').addEventListener('submit', saveIvDialog);
fieldOf($('#ivForm'), 'row').addEventListener('change', (e) => {
  const row = MALL.byNum.get(Number(e.target.value));
  if (row) { fieldOf($('#ivForm'), 'company').value = row.company; fieldOf($('#ivForm'), 'role').value = row.role; }
});
$('#rows').addEventListener('keydown', (e) => {
  const tr = e.target.closest('tr[data-key]');
  if (!tr || (e.key !== 'Enter' && e.key !== ' ')) return;
  e.preventDefault();
  select(tr.dataset.key);
  document.querySelector(`#rows tr[data-key="${CSS.escape(tr.dataset.key)}"]`)?.focus();
});
$('#alRows').addEventListener('keydown', (e) => {
  const li = e.target.closest('li[data-key]');
  if (!li || e.target !== li || (e.key !== 'Enter' && e.key !== ' ')) return;
  e.preventDefault();
  select(li.dataset.key);
  showSelection();
});
$('#mlBody').addEventListener('keydown', (e) => {
  const tr = e.target.closest('tr[data-key]');
  if (!tr || e.target !== tr || (e.key !== 'Enter' && e.key !== ' ')) return;
  e.preventDefault();
  select(tr.dataset.key);
  showSelection();
});
$('#next').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const li = e.target.closest('li[tabindex]');
  if (!li) return;
  e.preventDefault();
  if (li.dataset.key) select(li.dataset.key); else if (li.dataset.status) filterStage(li.dataset.status); else if (li.dataset.go) location.hash = li.dataset.go;
});
$('#q').addEventListener('input', (e) => { filt.q = e.target.value.trim(); showAll = false; inbox.limit = PAGE; docs.limit = 30; boards.limit = 40; onsite.limit = 40; li.limit = 8; renderLanes(); renderTable(); PAGE_RENDER[view]?.(); });
$('#fStage').addEventListener('change', (e) => { filt.stage = e.target.value; showAll = false; renderTable(); });
$('#fTime').addEventListener('change', (e) => { filt.days = e.target.value; showAll = false; renderTable(); });
$('#moreRows').addEventListener('click', () => { showAll = !showAll; renderTable(); });
$('#inRemote').addEventListener('change', (e) => { inbox.remote = e.target.checked; inbox.limit = PAGE; renderInboxPage(); });
$('#inLoc').addEventListener('change', (e) => { inbox.loc = e.target.checked; inbox.limit = PAGE; renderInboxPage(); });
$('#inSort').addEventListener('change', (e) => { inbox.sort = e.target.value; renderInboxPage(); });
$('#inMore').addEventListener('click', () => { inbox.limit += PAGE; renderInboxPage(); });
$('#docSort').addEventListener('change', (e) => { docs.sort = e.target.value; renderDocs(); });
$('#docMore').addEventListener('click', () => { docs.limit += 30; renderDocs(); });
$('#sbMore').addEventListener('click', () => { boards.limit += 40; renderBoards(boardRows()); });
$('#osMore').addEventListener('click', () => { onsite.limit += 40; renderOnsite(); });
$('#liMore').addEventListener('click', () => { li.limit += 20; renderLinkedIn(); });
$('#liRefresh').addEventListener('click', refreshLinkedIn);
document.addEventListener('input', (e) => { if (e.target.id === 'wbQ') { web.q = e.target.value.trim(); web.limit = 60; renderWebsites(); } });
window.addEventListener('hashchange', () => { setViewFromHash(); window.scrollTo(0, 0); });
document.addEventListener('visibilitychange', () => (document.hidden ? links.stop() : links.start()));

let dataSeq = 0;
async function refresh() {
  const seq = ++dataSeq; // a slower, older response must not overwrite newer data
  try {
    const r = await fetch('/api/data');
    if (!r.ok) throw new Error(`api/data ${r.status}`);
    const next = await r.json();
    if (seq !== dataSeq) return true;
    DATA = next;
    renderAll();
    return true;
  } catch (e) {
    if (seq !== dataSeq) return true;
    const msg = `Couldn't load dashboard data (${e.message}). Check that the server is running.`;
    if (!DATA) $('#lanes').innerHTML = `<p class="loading">${esc(msg)}</p>`;
    toast(msg, false);
    return false;
  }
}

let reconnecting = false;
function connectSSE() {
  const es = new EventSource('/api/events');
  es.onopen = () => {
    // Back after a drop: anything that changed while disconnected never sent an event.
    const wasDown = reconnecting;
    reconnecting = false;
    sseLive = true;
    renderLiveTag();
    if (wasDown) refresh();
  };
  es.onmessage = (ev) => { if (ev.data === 'refresh') refresh(); };
  es.onerror = () => { es.close(); reconnecting = true; sseLive = false; renderLiveTag(); setTimeout(connectSSE, 3000); };
}

setAccent(defaultAccent());
initWarRoom();
prof = PROFILES.includes(store.get('mc-profile')) ? store.get('mc-profile') : 'all';
setBoardView(store.get('mc-view') || '3d');
links.init();
setViewFromHash();
$('#lanes').innerHTML = '<p class="loading">Loading pipeline…</p>';
// The one authored moment: on first load the stages light up left to right.
if (!reducedMotion) { $('#board').classList.add('booting'); setTimeout(() => $('#board').classList.remove('booting'), 1600); }
await refresh();
setViewFromHash();
links.start();
connectSSE();
// Freshness goes stale with no file change to trigger a redraw, so the sidebar re-checks on its own.
setInterval(() => { if (DATA) renderSide(); }, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && DATA) renderSide(); });



