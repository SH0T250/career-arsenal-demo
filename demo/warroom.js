// War Room: the Career Arsenal look for the Overview page. Draws the welcome header, the top-strip pills
// and the flow / weekly bars / capacity / attention / insights panels from the same /api/data the rest
// of the dashboard uses. Does nothing unless <html data-theme="warroom"> is set (see theme.js).
import { today, urgentAlerts } from './mission-model.mjs?v=sample-2';
import { weeklyActivity, pipelineFlow, capacity, attention, insights, FLOW_LANES, FLOW_OUTCOMES } from './warroom-model.mjs?v=interactive-1';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Number(n || 0).toLocaleString('en-US');
const plural = (n, one, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY = 86400000;
const parseIso = (s) => { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
const shortDate = (s) => { const d = parseIso(s); return d ? `${MON[d.getMonth()]} ${d.getDate()}` : ''; };
const dayGap = (s) => { const d = parseIso(s); return d ? Math.round((d - parseIso(today())) / DAY) : 0; };
const relDay = (s) => { const k = dayGap(s); return k === 0 ? 'Today' : k === 1 ? 'Tomorrow' : k === -1 ? 'Yesterday' : shortDate(s); };
const time12 = (t) => { const m = String(t || '').match(/^(\d{1,2}):(\d{2})/); if (!m) return ''; const h = +m[1]; return `${((h + 11) % 12) + 1}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`; };
const clock = (iso) => { const d = new Date(iso); return Number.isNaN(+d) ? '' : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); };
const safeUrl = (u) => { try { const x = new URL(u); return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : ''; } catch { return ''; } };
const ext = 'target="_blank" rel="noopener noreferrer"';
const dismissed = () => { try { const v = JSON.parse(localStorage.getItem('mc-dismissed-alerts') || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };

export const warRoomOn = () => document.documentElement.dataset.theme === 'warroom';

const IC = {
  cal: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5.5" width="16" height="14.5" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/></svg>',
  scan: '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="6" rx="7" ry="2.5"/><path d="M5 6v12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5"/></svg>',
  layers: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4l8 4.5-8 4.5-8-4.5z"/><path d="M4 12.5l8 4.5 8-4.5"/></svg>',
  cap: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9l9-4.5L21 9l-9 4.5z"/><path d="M7 11v4.5c1.4 1.3 3 2 5 2s3.6-.7 5-2V11"/></svg>',
  chev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
};

let ctx = null;
let selWeek = null; // null = the busiest week

// ---------------------------------------------------------------- top strip + welcome line

function renderStrip() {
  const { d, mall } = ctx;
  const now = new Date();
  $('#wrDate').innerHTML = `<i class="ic">${IC.cal}</i>${DOW[now.getDay()]}, ${MON[now.getMonth()]} ${now.getDate()}`;
  const run = (d.scanRuns || []).at(-1);
  const scan = $('#wrScan');
  scan.hidden = !run;
  if (run) {
    const at = new Date(run.timestamp);
    const sameDay = at.toDateString() === now.toDateString();
    const when = Number.isNaN(+at) ? 'Last' : sameDay ? clock(run.timestamp) : `${MON[at.getMonth()]} ${at.getDate()}`;
    const ok = run.status === 'completed';
    scan.classList.toggle('warn', !ok);
    scan.textContent = ok ? `${when} scan · ${fmt(run.new_added)} new` : `${when} scan did not finish`;
  }
  const week = mall.upcoming.filter((i) => dayGap(i.date) < 7).length;
  const iv = $('#wrIv');
  iv.hidden = !week;
  iv.innerHTML = `<i class="ic">${IC.cal}</i>${plural(week, 'interview')} this week`;
}

function renderHero() {
  const { d, m, mall } = ctx;
  const f = d.stats?.funnel || {};
  const week = mall.upcoming.filter((i) => dayGap(i.date) < 7);
  const strong = m.lanes.inbox.filter((x) => x.stack?.grade === 'strong').length;
  const parts = [];
  if (f.everApplied) parts.push(`Reply rate <b>${Math.round(f.responseRate || 0)}%</b> across ${fmt(f.everApplied)} applications sent.`);
  else parts.push('No applications sent yet.');
  if (week.length) { const n = week[0]; const k = dayGap(n.date); parts.push(`<b>${plural(week.length, 'interview')}</b> in the next 7 days, first ${esc(n.company)} ${k === 0 ? 'today' : k === 1 ? 'tomorrow' : `on ${shortDate(n.date)}`}${n.time ? ` at ${time12(n.time)}` : ''}.`); }
  else parts.push('No interviews on the calendar this week.');
  if (strong) parts.push(`<b>${plural(strong, 'strong sample match', 'strong sample matches')}</b> waiting in the inbox.`);
  $('#wrLine').innerHTML = parts.join(' ');
}

// ---------------------------------------------------------------- pipeline flow (lane -> outcome)

const FLOW_TONE = { career: '--mint', stack: '--violet', gigs: '--silver' };
const FLOW_H = 290; const FLOW_GAP = 10; const FLOW_MIN = 30;

// Node heights follow the counts, except that a thin node keeps enough room for its label.
function fitHeights(list, counts) {
  const avail = FLOW_H - FLOW_GAP * (list.length - 1);
  const small = new Set();
  for (;;) {
    const big = list.filter(([id]) => !small.has(id));
    const sum = big.reduce((s, [id]) => s + counts[id], 0);
    const k = sum ? (avail - FLOW_MIN * small.size) / sum : 0;
    const add = big.filter(([id]) => counts[id] * k < FLOW_MIN);
    if (!add.length || add.length === big.length) return (id) => (small.has(id) ? FLOW_MIN : Math.max(FLOW_MIN, counts[id] * k));
    add.forEach(([id]) => small.add(id));
  }
}

function renderFlow() {
  const f = pipelineFlow(ctx.d.tracker || []);
  const host = $('#wrFlow');
  if (!f.total) { host.innerHTML = '<p class="wr-none">No applications sent yet. This fills in after the first one.</p>'; return; }
  const L = FLOW_LANES.filter(([id]) => f.lanes[id]);
  const R = FLOW_OUTCOMES.filter(([id]) => f.outcomes[id]);
  const place = (list, counts) => { const h = fitHeights(list, counts); let y = 0; const out = {}; for (const [id, name] of list) { out[id] = { y, h: h(id), n: counts[id], name, used: 0 }; y += h(id) + FLOW_GAP; } return out; };
  const src = place(L, f.lanes); const dst = place(R, f.outcomes);
  const paths = [];
  for (const [from] of L) for (const [to] of R) {
    const link = f.links.find((x) => x.from === from && x.to === to);
    if (!link) continue;
    const a = src[from]; const b = dst[to];
    const t0 = a.h * link.n / a.n; const t1 = b.h * link.n / b.n;
    const y0 = a.y + a.used; const y1 = b.y + b.used;
    a.used += t0; b.used += t1;
    paths.push(`<path d="M0 ${y0.toFixed(1)}C50 ${y0.toFixed(1)} 50 ${y1.toFixed(1)} 100 ${y1.toFixed(1)}L100 ${(y1 + t1).toFixed(1)}C50 ${(y1 + t1).toFixed(1)} 50 ${(y0 + t0).toFixed(1)} 0 ${(y0 + t0).toFixed(1)}Z" fill="url(#wrg-${from})"><title>${esc(a.name)} to ${esc(b.name)}: ${fmt(link.n)}</title></path>`);
  }
  const node = (side, id, o, big) => `<div class="wr-node ${side}${o.h < 44 ? ' sm' : ''}" style="top:${o.y.toFixed(1)}px;height:${o.h.toFixed(1)}px;--tone:var(${FLOW_TONE[id] || '--line-2'})"><b>${big}</b><span>${esc(o.name)}</span></div>`;
  const label = `${L.map(([id, n]) => `${n} ${f.lanes[id]}`).join(', ')}. Now: ${R.map(([id, n]) => `${n} ${f.outcomes[id]}`).join(', ')}.`;
  host.innerHTML = `<div class="wr-flow-in" style="height:${FLOW_H}px">
    ${L.map(([id]) => node('l', id, src[id], `${Math.round(100 * f.lanes[id] / f.total)}%`)).join('')}
    <svg viewBox="0 0 100 ${FLOW_H}" preserveAspectRatio="none" role="img" aria-label="${esc(label)}"><defs>${L.map(([id]) => `<linearGradient id="wrg-${id}" x1="0" x2="1"><stop offset="0" stop-color="var(${FLOW_TONE[id]})" stop-opacity=".62"/><stop offset="1" stop-color="var(${FLOW_TONE[id]})" stop-opacity=".16"/></linearGradient>`).join('')}</defs>${paths.join('')}</svg>
    ${R.map(([id]) => node('r', id, dst[id], fmt(f.outcomes[id]))).join('')}
  </div>`;
}

// ---------------------------------------------------------------- applications per week

function renderBars() {
  const { weeks, max, hot } = weeklyActivity(ctx.d.statusLog || [], today(), 8);
  const host = $('#wrBars');
  if (hot == null) { host.innerHTML = '<p class="wr-none">Nothing sent in the last eight weeks.</p>'; return; }
  const sel = selWeek != null && weeks[selWeek] ? selWeek : hot;
  const step = [1, 2, 5, 10, 20, 25, 50, 100, 250, 500].find((s) => s * 4 >= Math.max(max, ...weeks.map((w) => w.replies))) || Math.ceil(max / 4);
  const top = step * 4;
  const w = weeks[sel];
  const span = (x) => `${shortDate(x.from)} to ${parseIso(x.from).getMonth() === parseIso(x.to).getMonth() ? parseIso(x.to).getDate() : shortDate(x.to)}`;
  const cur = weeks.length - 1;
  host.innerHTML = `<div class="wr-read" aria-live="polite"><span class="wk">${span(w)}${sel === cur ? ' · this week' : ''}</span><b>${fmt(w.applied)}<small> sent</small></b><span>${plural(w.replies, 'reply', 'replies')} · ${plural(w.interviews, 'interview')}</span></div>
    <div class="wr-chart"><div class="y" aria-hidden="true">${[4, 3, 2, 1, 0].map((k) => `<span>${fmt(step * k)}</span>`).join('')}</div>
    <div class="area">${weeks.map((x, i) => `<div class="wr-colm">${x.replies ? `<i class="rp" style="bottom:${(100 * x.replies / top).toFixed(1)}%" aria-hidden="true"></i>` : ''}
      <button type="button" class="wr-bar${i === sel ? ' hot' : ''}${x.applied / top < 0.05 ? ' low' : ''}" data-wr-week="${i}" aria-pressed="${i === sel}" style="--h:${(100 * x.applied / top).toFixed(1)}%;--i:${i}" aria-label="Week of ${shortDate(x.from)}: ${fmt(x.applied)} sent, ${plural(x.replies, 'reply', 'replies')}, ${plural(x.interviews, 'interview')}"><i class="vis"><i class="sd"></i><i class="cap"></i><i class="f"></i></i></button>
      <span class="lbl" aria-hidden="true">${shortDate(x.from)}</span></div>`).join('')}</div></div>`;
}

// ---------------------------------------------------------------- capacity card stack

function renderCap() {
  const { d, m } = ctx;
  const c = capacity(d.stackContext, d.studyPlan, today());
  const strong = m.lanes.inbox.filter((x) => x.stack?.grade === 'strong').length;
  const cards = [
    ...c.jobs.map((j) => ({ k: j.name, sub: j.known ? 'job on file' : 'hours not set', v: j.known ? `${fmt(j.hours)} h` : '' })),
    ...c.study.map((s) => ({ k: 'Study', sub: s.name, v: `${fmt(s.hours)} h` })),
  ];
  if (!c.jobs.length) cards.push({ k: 'Role', sub: 'open slot', v: strong ? `${plural(strong, 'strong lead')}` : 'no job on file' });
  const shown = cards.slice(0, 2);
  $('#wrCapP').textContent = c.budget ? `Hours spoken for against your ${fmt(c.budget)}-hour week.` : 'Hours spoken for each week.';
  $('#wrCap').innerHTML = `<div class="wr-stack n${shown.length}">
    ${shown.map((x, i) => `<div class="wr-card c${i}"><span><b>${esc(x.k)}</b><small>${esc(x.sub)}</small></span><span>${esc(x.v)}</span></div>`).join('')}
    <div class="wr-bal"><div class="l">Committed this week${cards.length > 2 ? ` · ${fmt(cards.length - 2)} more not shown` : ''}</div>
      <div class="v">${fmt(c.committed)}<small>${c.budget ? ` of ${fmt(c.budget)} h` : ' h'}</small></div>
      <div class="acts"><a href="#stacking" title="Work fit and sample capacity" aria-label="Work fit and sample capacity">${IC.layers}</a><a href="#learn" title="Study plan" aria-label="Study plan">${IC.cap}</a><a href="#interviews" title="Two-week calendar" aria-label="Two-week calendar">${IC.cal}</a></div></div>
  </div>`;
}

// ---------------------------------------------------------------- attention accordion

function renderAcc() {
  const { d, m } = ctx;
  const host = $('#wrAcc');
  const was = Object.fromEntries([...host.querySelectorAll('details')].map((x) => [x.dataset.k, x.open]));
  const gone = new Set(dismissed());
  const alerts = urgentAlerts(d, m.upcoming).filter((a) => !gone.has(a.id));
  const at = attention(d, m);
  const item = (href, title, sub, chip, tone = '', extra = '') => `<li><a href="${esc(href)}" ${href.startsWith('#') ? '' : ext}><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</a><span class="chip ${tone}">${esc(chip)}</span>${extra}</li>`;
  const more = (n, go, word) => (n > 5 ? `<li class="wr-more"><a href="#${go}">${fmt(n - 5)} more on ${word}</a></li>` : '');
  const sec = (k, title, n, rows, openDefault) => `<details data-k="${k}" ${(was[k] ?? openDefault) ? 'open' : ''}><summary>${esc(title)} <span class="n${n ? '' : ' zero'}">${fmt(n)}</span><i class="chev">${IC.chev}</i></summary>${n ? `<ul>${rows}</ul>` : '<p class="wr-none">Nothing here right now.</p>'}</details>`;
  const alertRows = alerts.slice(0, 5).map((a) => {
    const href = a.kind === 'interview' ? (safeUrl(a.iv.meetUrl) || safeUrl(a.iv.calendarUrl) || '#interviews') : a.kind.startsWith('linkedin') ? '#inbox/messages' : '#mail';
    const chip = a.kind === 'interview' ? `${relDay(a.date)} ${time12(a.iv.time)}`.trim() : a.kind === 'linkedin-error' ? 'Fix' : a.kind === 'linkedin' ? 'LinkedIn' : `Due ${relDay(a.date)}`;
    return item(href, a.title, a.sub, chip, a.level === 'now' ? 'warn' : 'acc', `<button type="button" class="al-x" data-al-dismiss="${esc(a.id)}" aria-label="Dismiss: ${esc(a.title)}">&times;</button>`);
  }).join('') + more(alerts.length, 'mail', 'Mail');
  const late = (due) => { const k = dayGap(due); return k < 0 ? [`${-k}d late`, 'warn'] : [`Due ${relDay(due)}`, k === 0 ? 'warn' : 'acc']; };
  const followRows = at.follow.slice(0, 5).map((n) => item('#interviews', n.who || 'Follow up', n.what, ...late(n.due))).join('') + more(at.follow.length, 'interviews', 'Interviews');
  const dueRows = at.deadlines.slice(0, 5).map((n) => item('#mail', n.who || n.what, n.who ? n.what : n.why, ...late(n.due))).join('') + more(at.deadlines.length, 'mail', 'Mail');
  const reviewRows = at.review.slice(0, 5).map((r) => item('#applications', r.company, r.role, `${(r.sc ?? 0).toFixed(1)}`, 'ok')).join('') + more(at.review.length, 'applications', 'Applications');
  host.innerHTML = sec('now', 'Needs you now', alerts.length, alertRows, alerts.length > 0 && innerWidth > 900)
    + sec('follow', 'Follow-ups due', at.follow.length, followRows, false)
    + sec('due', 'Deadlines', at.deadlines.length, dueRows, false)
    + sec('review', 'Ready to send', at.review.length, reviewRows, false);
}

// ---------------------------------------------------------------- insights

function renderIns() {
  const { d, m } = ctx;
  // Three cards at most: the fourth and later repeat what the accordion already lists.
  const cards = insights(d, m, today()).slice(0, 3);
  $('#wrInsN').textContent = cards.length ? fmt(cards.length) : '';
  const at = clock(d.generatedAt);
  $('#wrIns').innerHTML = cards.length
    ? cards.map((c) => `<article class="wr-in ${c.tone}"><div class="ch"><span class="tg">${esc(c.tag)}</span><time>${esc(at)}</time></div><h3>${esc(c.title)}</h3><p>${esc(c.body)}</p><a class="cta" href="#${esc(c.go)}">${esc(c.cta)}</a></article>`).join('')
    : '<p class="wr-none">Nothing stands out right now. Cards appear here when the numbers move.</p>';
}

// ---------------------------------------------------------------- entry points

export function renderWarRoom(d, m, mall) {
  if (!warRoomOn() || !d || !m) return;
  const first = !ctx;
  ctx = { d, m, mall: mall || m };
  renderStrip(); renderHero(); renderFlow(); renderBars(); renderCap(); renderAcc(); renderIns();
  // The bars rise once, on the first draw only.
  if (first) { const g = $('#wrGrid'); g.classList.add('rise'); setTimeout(() => g.classList.remove('rise'), 1800); }
}

export function initWarRoom() {
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-wr-week]');
    if (!b || !ctx) return;
    selWeek = Number(b.dataset.wrWeek);
    renderBars();
    $(`[data-wr-week="${selWeek}"]`)?.focus({ preventScroll: true });
  });
}

