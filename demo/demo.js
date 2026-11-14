// demo.js — answers the dashboard's /api/* calls from data.json / presets.json so
// the dashboard runs on a static host. Sample workflow edits stay in this tab;
// external actions, file access and every other write route remain disabled.
(() => {
  const base = new URL('.', location.href);
  const load = (f) => fetch(new URL(f, base), { cache: 'no-store' }).then((r) => r.json());
  let data, dataSeed, presets, rules, presetSeed, workflow, previousParams = null;
  const presetKey = 'career-arsenal-demo-profiles-v1';
  const workflowKey = 'career-arsenal-demo-workflow-v1';
  const sourceData = async () => data ??= await (dataSeed ??= load('data.json').catch((error) => { dataSeed = null; throw error; }));
  const textFits = (s, max) => typeof s === 'string' && s.trim().length > 0 && s.length <= max;
  const validParams = (p) => p && Array.isArray(p.target_roles) && p.target_roles.length > 0 && p.target_roles.length <= 12
    && p.target_roles.every((r) => textFits(r, 80)) && textFits(p.location, 160) && textFits(p.comp, 160);
  async function samplePresets() {
    if (presets) return presets;
    const seed = await (presetSeed ??= load('presets.json').catch((error) => { presetSeed = null; throw error; }));
    if (presets) return presets; // Concurrent data and preset reads must not replace a newly applied profile.
    const examples = {
      'sample-career': { target_roles: ['Project Coordinator', 'Implementation Specialist'], location: 'Remote or Texas', comp: '$90,000/year' },
      'sample-flexible': { target_roles: ['Document Controller', 'Technical Writer'], location: 'Remote', comp: '$60,000/year' },
      'sample-gigs': { target_roles: ['Freelance Documentation Specialist', 'Project Support Consultant'], location: 'Remote', comp: '$45/hour' },
    };
    const saved = seed.presets.map((p) => ({ ...p, params: { ...seed.params, ...examples[p.slug] } }));
    presets = { version: 1, active: seed.active, presets: saved, params: structuredClone(saved.find((p) => p.slug === seed.active).params) };
    try {
      const stored = JSON.parse(sessionStorage.getItem(presetKey));
      if (stored?.version === 1 && Array.isArray(stored.presets) && stored.presets.length > 0 && stored.presets.length <= 30
        && stored.presets.every((p) => typeof p.slug === 'string' && /^[a-z0-9-]{1,80}$/.test(p.slug) && textFits(p.name, 60) && validParams(p.params))
        && stored.presets.some((p) => p.slug === stored.active) && validParams(stored.params)) presets = stored;
    } catch { /* unavailable or invalid storage starts a fresh sample session */ }
    return presets;
  }
  const persistPresets = () => { try { sessionStorage.setItem(presetKey, JSON.stringify(presets)); } catch { /* edits still work in this page when browser storage is unavailable */ } };
  const fieldsOnly = (value, fields) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every((key) => fields.includes(key));
  const optionalText = (s, max) => typeof s === 'string' && s.length <= max;
  const validDate = (s) => typeof s === 'string' && /^20\d{2}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`)) && new Date(`${s}T12:00:00Z`).toISOString().slice(0, 10) === s;
  const localDate = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const validId = (s) => typeof s === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(s);
  const interviewFields = ['id', 'company', 'role', 'row', 'round', 'date', 'time', 'notes', 'calendarUrl', 'meetUrl', 'location'];
  const rowsFor = (w) => [...data.tracker, ...w.tracked.map((entry) => {
    const p = data.pipeline.pending.find((item) => inboxJob(item).key === entry.key);
    const job = inboxJob(p);
    return { num: entry.num, date: entry.date, company: job.company, role: job.role, status: 'Evaluated', score: '', pdf: '❌', report: '—', notes: 'Added from the sample inbox in this tab.',
      url: job.url, raw: '', via: 'Sample inbox', appliedOn: null, profiles: p.profiles || ['career'], loc: job.loc, comp: job.comp };
  })];
  function cleanInterview(event, rows) {
    const rounds = [...data.interviewRounds, ...data.interviews.map((iv) => iv.round)];
    if (!fieldsOnly(event, interviewFields) || !validId(event.id) || !textFits(event.company, 80) || !optionalText(event.role, 120)
      || !rounds.includes(event.round) || !validDate(event.date) || !(event.time == null || event.time === '' || (typeof event.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(event.time)))
      || !optionalText(event.notes, 1000) || !optionalText(event.location, 200)
      || !(event.row == null || (Number.isInteger(event.row) && rows.some((r) => r.num === event.row)))
      || ![null, undefined, ''].includes(event.calendarUrl) || ![null, undefined, ''].includes(event.meetUrl)) return null;
    return { id: event.id, company: event.company.trim(), role: event.role.trim(), row: event.row ?? null, round: event.round, date: event.date, time: event.time || '',
      notes: event.notes.trim(), location: event.location.trim(), calendarUrl: '', meetUrl: '' };
  }
  async function sampleWorkflow() {
    await sourceData();
    if (workflow) return workflow;
    workflow = { version: 1, tracked: [], moves: [], interviews: structuredClone(data.interviews) };
    try {
      const raw = sessionStorage.getItem(workflowKey);
      if (!raw || raw.length > 1000000) return workflow;
      const saved = JSON.parse(raw);
      if (!fieldsOnly(saved, ['version', 'tracked', 'moves', 'interviews']) || saved.version !== 1 || !Array.isArray(saved.tracked) || saved.tracked.length > 100
        || !Array.isArray(saved.moves) || saved.moves.length > 1000 || !Array.isArray(saved.interviews) || saved.interviews.length > 100) return workflow;
      const inboxKeys = new Set(data.pipeline.pending.map((p) => inboxJob(p).key));
      const seedMax = Math.max(...data.tracker.map((r) => r.num));
      if (!saved.tracked.every((r) => fieldsOnly(r, ['key', 'num', 'date']) && inboxKeys.has(r.key) && Number.isInteger(r.num) && r.num > seedMax && r.num <= seedMax + 100 && validDate(r.date))
        || new Set(saved.tracked.map((r) => r.key)).size !== saved.tracked.length || new Set(saved.tracked.map((r) => r.num)).size !== saved.tracked.length) return workflow;
      const rows = rowsFor(saved);
      const current = new Map(rows.map((r) => [r.num, r.status]));
      for (const move of saved.moves) {
        if (!fieldsOnly(move, ['num', 'date', 'from', 'to', 'source', 'note']) || !current.has(move.num) || current.get(move.num) !== move.from || !data.states.includes(move.to)
          || !validDate(move.date) || move.source !== 'sample-demo' || !optionalText(move.note, 200)) return workflow;
        current.set(move.num, move.to);
      }
      const interviews = saved.interviews.map((iv) => cleanInterview(iv, rows));
      if (interviews.some((iv) => !iv) || new Set(interviews.map((iv) => iv.id)).size !== interviews.length) return workflow;
      workflow = { version: 1, tracked: saved.tracked.map(({ key, num, date }) => ({ key, num, date })), moves: saved.moves.map(({ num, date, from, to, source, note }) => ({ num, date, from, to, source, note })), interviews };
    } catch { /* invalid or unavailable storage starts an isolated sample session */ }
    return workflow;
  }
  const persistWorkflow = () => { try { sessionStorage.setItem(workflowKey, JSON.stringify(workflow)); } catch { /* edits still work in this page when browser storage is unavailable */ } };
  function applyWorkflow(result, w) {
    result.tracker = rowsFor(w).map((r) => ({ ...r }));
    for (const move of w.moves) {
      const r = result.tracker.find((row) => row.num === move.num);
      r.status = move.to;
      if (move.to === 'Applied' && !r.appliedOn) r.appliedOn = move.date;
      if (move.note) r.notes = `${r.notes ? `${r.notes}\n` : ''}Sample note: ${move.note}`;
    }
    result.statusLog.push(...structuredClone(w.moves));
    result.interviews = structuredClone(w.interviews);
    const tracked = new Set(w.tracked.map((r) => r.key));
    result.pipeline.pending = result.pipeline.pending.filter((p) => !tracked.has(inboxJob(p).key));
    const changed = w.moves.length > 0 || w.tracked.length > 0;
    if (changed && result.stats?.tracker) {
      const t = result.stats.tracker;
      t.total = result.tracker.length;
      t.byStatus = Object.fromEntries(data.states.map((s) => [s, result.tracker.filter((r) => r.status === s).length]));
      t.activeApps = t.activeAppsLive = result.tracker.filter((r) => ['Applied', 'Responded', 'Assessment', 'Interview', 'Offer'].includes(r.status)).length;
      const funnel = result.stats.funnel;
      const families = { everApplied: ['Applied', 'Responded', 'Assessment', 'Interview', 'Offer', 'Hired'], everResponded: ['Responded', 'Interview', 'Offer', 'Hired'], everInterview: ['Interview', 'Offer', 'Hired'], everOffer: ['Offer', 'Hired'] };
      for (const [key, family] of Object.entries(families)) {
        const known = new Set([...data.statusLog.filter((e) => family.includes(e.to)).map((e) => e.num), ...data.tracker.filter((r) => family.includes(r.status)).map((r) => r.num)]);
        funnel[key] += new Set(w.moves.filter((m) => family.includes(m.to) && !known.has(m.num)).map((m) => m.num)).size;
      }
      for (const [rate, count] of [['responseRate', 'everResponded'], ['interviewRate', 'everInterview'], ['offerRate', 'everOffer']]) funnel[rate] = funnel.everApplied ? Math.round(funnel[count] / funnel.everApplied * 1000) / 10 : 0;
    }
    result.demoWorkflow = { enabled: true, changedJobs: new Set(w.moves.map((m) => m.num)).size, trackedJobs: w.tracked.length, addedInterviews: w.interviews.filter((iv) => iv.id.startsWith('demo-iv-')).length, tabLocal: true };
  }
  function moveRow(w, row, state, note = '') {
    const seed = rowsFor(w).find((r) => r.num === row);
    const from = [...w.moves].reverse().find((m) => m.num === row)?.to || seed.status;
    if (from !== state || note) w.moves.push({ num: row, date: localDate(), from, to: state, source: 'sample-demo', note });
  }
  async function workflowAction(route, body) {
    const w = await sampleWorkflow();
    const rows = rowsFor(w);
    let result = { ok: true };
    if (w.moves.length >= 1000) return { ok: false, error: 'This sample session reached 1,000 changes. Reset the demo to start again.' };
    if (route === '/api/status') {
      if (!fieldsOnly(body, ['row', 'state', 'note']) || !Number.isInteger(body.row) || !rows.some((r) => r.num === body.row) || !data.states.includes(body.state)
        || !(body.note === undefined || optionalText(body.note, 200))) return { ok: false, error: 'Choose a sample job, a listed stage and a note up to 200 characters.' };
      moveRow(w, body.row, body.state, body.note?.trim() || '');
    } else if (route === '/api/demo/track-inbox') {
      if (!fieldsOnly(body, ['key']) || typeof body.key !== 'string' || body.key.length > 2000 || !data.pipeline.pending.some((p) => inboxJob(p).key === body.key)) return { ok: false, error: 'Choose a posting from the sample inbox.' };
      const existing = w.tracked.find((r) => r.key === body.key);
      if (existing) return { ok: true, row: existing.num };
      if (w.tracked.length >= 100) return { ok: false, error: 'This demo supports 100 added jobs. Reset the demo to start again.' };
      const num = Math.max(...rows.map((r) => r.num)) + 1;
      w.tracked.push({ key: body.key, num, date: localDate() });
      persistWorkflow();
      return { ok: true, row: num };
    } else {
      if (!fieldsOnly(body, ['action', 'event']) || !fieldsOnly(body.event, interviewFields) || !['add', 'update', 'delete'].includes(body.action)) return { ok: false, error: 'Choose a valid sample interview action.' };
      const old = w.interviews.find((iv) => iv.id === body.event.id);
      if (body.action !== 'add' && (!validId(body.event.id) || !old)) return { ok: false, error: 'Sample interview not found.' };
      if (body.action === 'delete') {
        if (Object.keys(body.event).some((k) => k !== 'id')) return { ok: false, error: 'Delete needs only the sample interview ID.' };
        w.interviews = w.interviews.filter((iv) => iv.id !== old.id);
      } else {
        if (body.action === 'add' && (Object.hasOwn(body.event, 'id') || w.interviews.length >= 100)) return { ok: false, error: 'This demo supports 100 interviews and assigns their IDs automatically.' };
        const stem = `demo-iv-${Date.now().toString(36)}`;
        let id = stem;
        for (let n = 2; w.interviews.some((iv) => iv.id === id); n++) id = `${stem}-${n}`;
        const event = cleanInterview({ company: '', role: '', row: null, round: '1st Interview', time: '', notes: '', location: '', calendarUrl: '', meetUrl: '', ...old, ...body.event, id: old?.id || id }, rows);
        if (!event) return { ok: false, error: 'Use a company (80 characters max), real date, valid 24-hour time, listed round and optional sample job. Keep calendar and meeting links blank; this demo never connects to accounts.' };
        w.interviews = body.action === 'add' ? [...w.interviews, event] : w.interviews.map((iv) => iv.id === event.id ? event : iv);
        if (event.row != null && (body.action === 'add' || event.row !== old.row)) moveRow(w, event.row, 'Interview');
        result = { ok: true, event: structuredClone(event), row: event.row };
      }
    }
    persistWorkflow();
    return result;
  }
  const words = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const roleWords = (s) => words(s).split(' ').filter((w) => w && !['a', 'an', 'the', 'of', 'and', 'or', 'in', 'at', 'to', 'for'].includes(w));
  const states = 'AL:Alabama;AK:Alaska;AZ:Arizona;AR:Arkansas;CA:California;CO:Colorado;CT:Connecticut;DE:Delaware;FL:Florida;GA:Georgia;HI:Hawaii;ID:Idaho;IL:Illinois;IN:Indiana;IA:Iowa;KS:Kansas;KY:Kentucky;LA:Louisiana;ME:Maine;MD:Maryland;MA:Massachusetts;MI:Michigan;MN:Minnesota;MS:Mississippi;MO:Missouri;MT:Montana;NE:Nebraska;NV:Nevada;NH:New Hampshire;NJ:New Jersey;NM:New Mexico;NY:New York;NC:North Carolina;ND:North Dakota;OH:Ohio;OK:Oklahoma;OR:Oregon;PA:Pennsylvania;RI:Rhode Island;SC:South Carolina;SD:South Dakota;TN:Tennessee;TX:Texas;UT:Utah;VT:Vermont;VA:Virginia;WA:Washington;WV:West Virginia;WI:Wisconsin;WY:Wyoming;DC:District of Columbia'.split(';').map((s) => s.split(':'));
  const hasPhrase = (text, phrase) => (` ${words(text)} `).includes(` ${words(phrase)} `);
  const namedStates = (s) => states.filter(([code, name]) => hasPhrase(s, name)
    || (code === 'OR' ? /(?:^OR$|[,·/]\s*OR(?=$|[\s,·/]))/i.test(s.trim())
      : new RegExp(`(?:^|[\\s,·/])${code}(?=$|[\\s,·/])`, 'i').test(s))).map(([code]) => code);
  function payRange(raw) {
    const s = String(raw || '').replace(/,/g, '').trim();
    const m = s.match(/^(?:min(?:imum)?\s*:?\s*|at least\s*)?\$?(\d+(?:\.\d+)?)\s*(k)?(?:\s*[-–]\s*\$?(\d+(?:\.\d+)?)\s*(k)?)?\s*\+?\s*(?:(?:\/|per\s+)?\s*(year|yr|annual|annually|hour|hr|hourly))?$/i);
    if (!m) return null;
    const min = Number(m[1]) * (m[2] || m[4] ? 1000 : 1);
    const max = m[3] ? Number(m[3]) * (m[4] || m[2] ? 1000 : 1) : min;
    const unit = /hour|hr/i.test(m[5] || '') ? 'hour' : m[5] || min >= 1000 ? 'year' : null;
    return unit && min > 0 && min <= max && max <= 10000000 ? { min, max, unit } : null;
  }
  const money = (n) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 });
  function locationReason(preference, actual) {
    const loc = words(actual);
    if (!loc) return { pts: 0, label: 'Location: posting has no location; not scored' };
    if (/^(any|anywhere|no preference)$/i.test(preference.trim())) return { pts: 0, label: 'Location: no preference; not scored' };
    if (/\b(not|except|exclude|excluding|without|no)\b/i.test(preference)) return { pts: 0, label: 'Location: exclusions need human review; use Remote, Hybrid, On-site or a state' };
    const remote = /\bremote\b|anywhere in the world|worldwide/.test(loc);
    const hybrid = /\bhybrid\b/.test(loc);
    const onsite = /\bon ?site\b/.test(loc);
    const wanted = words(preference);
    const alternatives = [];
    if (/\bremote\b/.test(wanted)) alternatives.push(remote);
    if (/\bhybrid\b/.test(wanted)) alternatives.push(hybrid);
    if (/\bon ?site\b/.test(wanted)) alternatives.push(onsite);
    const requestedStates = namedStates(preference);
    const postingStates = namedStates(actual);
    if (requestedStates.length) alternatives.push(requestedStates.some((s) => postingStates.includes(s)));
    // shortcut: place names use literal matching, not geocoding; expand only with a real location service.
    if (!alternatives.length && wanted.length >= 3 && hasPhrase(actual, preference)) alternatives.push(true);
    if (!alternatives.length) return { pts: 0, label: 'Location: preference not recognized; use Remote, Hybrid, On-site, a US state or an exact listed place' };
    if (alternatives.some(Boolean)) return { pts: 10, label: `Location: “${preference}” matches “${actual}”` };
    if (/\bon ?site\b/.test(wanted) && !remote && !hybrid && !onsite) return { pts: 0, label: 'Location: posting does not specify on-site work; not scored' };
    return { pts: -10, label: `Location: no listed match for “${preference}” in “${actual}”` };
  }
  function fitScore(job, params) {
    const title = new Set(roleWords(job.role));
    const requested = params.target_roles.map((role) => ({ role, tokens: roleWords(role) }));
    const full = requested.find((x) => x.tokens.length && x.tokens.every((w) => title.has(w)));
    const partial = requested.find((x) => x.tokens.some((w) => title.has(w)));
    const role = full ? { pts: 30, label: `Role: all words in “${full.role}” appear in “${job.role}”` }
      : partial ? { pts: 15, label: `Role: some words in “${partial.role}” appear in “${job.role}”` }
      : job.role ? { pts: -20, label: 'Role: no target-role words appear in the job title' } : { pts: 0, label: 'Role: title is missing; not scored' };
    const location = locationReason(params.location, job.loc);
    const want = payRange(params.comp), offer = payRange(job.comp);
    let comp = { pts: 0, label: !want ? 'Compensation: minimum not recognized; use $90,000/year or $45/hour'
      : !offer ? 'Compensation: no usable posted range; not scored'
      : want.unit !== offer.unit ? 'Compensation: annual and hourly rates are not converted; not scored'
      : `Compensation: posted range crosses the requested ${money(want.min)}/${want.unit} minimum; review needed` };
    if (want && offer && want.unit === offer.unit) {
      if (offer.min >= want.min) comp = { pts: 10, label: `Compensation: posted minimum ${money(offer.min)}/${offer.unit} meets ${money(want.min)}/${want.unit}` };
      else if (offer.max < want.min) comp = { pts: -10, label: `Compensation: posted maximum ${money(offer.max)}/${offer.unit} is below ${money(want.min)}/${want.unit}` };
    }
    const reasons = [{ id: 'role', scope: 'title', ...role }, { id: 'location', scope: 'location', ...location }, { id: 'comp', scope: 'pay', ...comp }];
    const score = Math.max(0, Math.min(100, 50 + reasons.reduce((sum, r) => sum + r.pts, 0)));
    return { base: 50, score, grade: score >= 70 ? 'strong' : score >= 45 ? 'ok' : 'weak', basis: 'demo', reasons,
      details: { role: job.role || 'Not listed', location: job.loc || 'Not listed', comp: offer ? `${money(offer.min)}${offer.max === offer.min ? '' : `–${money(offer.max)}`}/${offer.unit}` : job.comp || 'Not listed' },
      hours: null, overlap: null, exposure: [], at: null };
  }
  function inboxJob(p) {
    const parts = String(p.text || '').split(' | ').map((s) => s.trim());
    const url = /^https?:/.test(parts[0]) ? parts.shift() : '';
    return { key: `inbox:${url || p.text}`, url, company: parts[0] || 'Unknown company', role: parts[1] || '',
      loc: /^posted:/i.test(parts[2] || '') ? '' : parts[2] || '', comp: parts.slice(3).find((s) => !/^posted:/i.test(s)) || '' };
  }
  async function scoredData() {
    const w = await sampleWorkflow();
    const p = await samplePresets();
    const result = structuredClone(data);
    applyWorkflow(result, w);
    const inboxJobs = (data.pipeline?.pending || []).map(inboxJob);
    const byUrl = new Map(inboxJobs.filter((j) => j.url).map((j) => [j.url, j]));
    const grade = (job) => {
      const stack = fitScore(job, p.params);
      stack.previousScore = previousParams ? fitScore(job, previousParams).score : null;
      stack.delta = stack.previousScore == null ? null : stack.score - stack.previousScore;
      return stack;
    };
    for (const r of result.tracker || []) {
      const matching = byUrl.get(r.url);
      r.stack = grade({ role: r.role, loc: r.location || r.loc || matching?.loc || '', comp: r.comp || matching?.comp || '' });
      r.score = `${(r.stack.score / 20).toFixed(1)}/5`;
    }
    const samples = (result.pipeline?.pending || []).map((r) => {
      const job = inboxJob(r);
      r.stack = grade(job);
      return { ...job, stack: r.stack };
    });
    const exampleUrls = ['/summit-industries-1465/46321', '/westbrook-materials-1491/33216', '/valley-forge-construction/40765'];
    const all = [...result.tracker.map((r) => ({ ...r, key: `row:${r.num}` })), ...samples];
    result.demoScoring = { base: 50, total: all.length, changed: all.filter((r) => r.stack.delta != null && r.stack.delta !== 0).length,
      hasPrevious: previousParams !== null, examples: exampleUrls.map((suffix) => all.find((r) => r.url.endsWith(suffix))).filter(Boolean),
      notice: 'Illustrative rules run in this tab against fictional posting fields. Missing or unsupported details score zero; no AI model or live scan runs.' };
    return result;
  }
  // The answer bank: what the form-filling agent may answer on its own, and the standing answers it uses.
  const ANSWERS = {"rules":{"can":["Show saved fictional answers for review"],"ask":["Ask the candidate about any missing facts"],"never":["Submit an application","Send a message","Use a real account"]},"standing":[{"topic":"sample","question":"What do these answers represent?","answer":"A fictional candidate scenario for this demo.","eeo":false}],"saved":[{"id":"a1","status":"saved","question":"Which work does the sample candidate enjoy?","answer":"Turning project information into clear schedules and useful documentation.","company":"Northwind Builders","row":42}],"needed":[{"id":"n1","status":"needed","question":"Which example project best demonstrates coordination?","company":"Harborview Controls","row":118}],"review":[],"learned":[]};
  const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
  const realFetch = window.fetch.bind(window);
  window.fetch = async (url, init) => {
    const target = new URL(typeof url === 'string' ? url : url?.url || String(url), location.href);
    const method = (init?.method || url?.method || 'GET').toUpperCase();
    const reading = method === 'GET' || method === 'HEAD';
    const u = target.origin === base.origin && target.pathname.startsWith('/api/') ? target.pathname + target.search : null;
    if (!u) return reading ? realFetch(url, init) : json({ ok: false, error: 'external writes are disabled in this sample demo' });
    if (!reading) {
      if (method !== 'POST' || !['/api/status', '/api/interviews', '/api/demo/track-inbox', '/api/presets/params', '/api/presets/save', '/api/presets/switch', '/api/presets/reset', '/api/presets/session-reset'].includes(u)) return json({ ok: false, error: 'only sample workflow edits are available; no live action was taken' });
      let body;
      try { body = JSON.parse(init?.body ?? await url.clone().text()); } catch { return json({ ok: false, error: 'invalid sample parameters' }, 400); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ ok: false, error: 'invalid sample parameters' }, 400);
      if (['/api/status', '/api/interviews', '/api/demo/track-inbox'].includes(u)) {
        const result = await workflowAction(u, body);
        return json(result, result.ok ? 200 : 400);
      }
      const p = await samplePresets();
      const before = structuredClone(p.params);
      if (u === '/api/presets/params') {
        if (!validParams(body)) return json({ ok: false, error: 'enter 1–12 roles, a location and compensation preference within the field limits' }, 400);
        p.params = { ...p.params, target_roles: body.target_roles.map((r) => r.trim()), location: body.location.trim(), comp: body.comp.trim() };
      } else if (u === '/api/presets/switch') {
        const selected = p.presets.find((x) => x.slug === body.slug);
        if (!selected) return json({ ok: false, error: 'sample preset not found' }, 400);
        p.active = selected.slug;
        p.params = structuredClone(selected.params);
      } else if (u === '/api/presets/save') {
        if (!textFits(body.name, 60) || p.presets.length >= 30) return json({ ok: false, error: 'use a name up to 60 characters; this demo supports 30 presets' }, 400);
        const stem = `demo-${body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'preset'}`;
        let slug = stem;
        for (let n = 2; p.presets.some((x) => x.slug === slug); n++) slug = `${stem}-${n}`;
        p.presets.push({ slug, name: body.name.trim(), saved: new Date().toISOString().slice(0, 10), params: structuredClone(p.params) });
        p.active = slug;
      } else if (u === '/api/presets/reset') {
        p.params = structuredClone(p.presets.find((x) => x.slug === p.active).params);
      } else {
        previousParams = before;
        presets = null;
        workflow = null;
        try { sessionStorage.removeItem(presetKey); } catch { /* memory-only sessions reset here too */ }
        try { sessionStorage.removeItem(workflowKey); } catch { /* memory-only sessions reset here too */ }
        return json({ ok: true });
      }
      if (u !== '/api/presets/save') previousParams = before;
      persistPresets();
      return json({ ok: true });
    }
    if (u.startsWith('/api/data')) return json(await scoredData());
    if (u === '/api/presets') return json(await samplePresets());
    if (u.startsWith('/api/presets/file')) return json({ ok: true, name: 'demo', content: '# Demo\n\nIn the real dashboard this shows your targeting file (modes/_profile.md, modes/_brief.md or portals.yml) and lets you edit it.' });
    if (u.startsWith('/api/chat/state')) return json({ busy: false, session: null, activity: null });
    if (u === '/api/answers') return json(ANSWERS);
    if (u === '/api/targeting-rules') {
      const p = await samplePresets();
      rules ??= await load('rules.json');
      const result = structuredClone(rules);
      result.brief[0] = { title: 'Current sample parameters', lines: [`Roles: ${p.params.target_roles.join(', ')}.`, `Location: ${p.params.location}.`, `Compensation: ${p.params.comp}.`] };
      result.brief.find((s) => s.title === 'Human review').lines[2] = 'Profile edits recalculate illustrative scores. Pipeline moves and interviews stay in this tab; no real records, accounts, scans or sends are changed.';
      return json(result);
    }
    if (u === '/api/platforms' && reading) return json(await load('platforms.json'));
    // Learn and Websites hold the owner's own study plan and link collection, so the demo shows them empty.
    if (u === '/api/learn/index') return json({ lists: [] });
    if (u === '/api/learn' && reading) return json({ topics: [], next: null, gaps: [], certs: [], certsChecked: null, study: null });
    if (u === '/api/websites') return json({ generated: null, count: 0, categories: [], rows: [] });
    return json({ ok: false, error: 'that live action is unavailable in this sample demo' });
  };
  class DemoEventSource {
    constructor() { this.readyState = 1; setTimeout(() => this.onopen && this.onopen(new Event('open')), 400); }
    addEventListener() {} removeEventListener() {} close() {}
  }
  window.EventSource = DemoEventSource;
  const say = (msg) => { const el = document.getElementById('demoMsg'); if (!el) return; el.textContent = msg; clearTimeout(say.t); say.t = setTimeout(() => { el.textContent = say.base; }, 4000); };
  window.confirm = () => { say('Demo: this live action is disabled. No data was changed.'); return false; };
  document.addEventListener('DOMContentLoaded', () => { say.base = document.getElementById('demoMsg')?.textContent || ''; });
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a) return;
    let p = '';
    try { const u = new URL(a.href, location.href); if (u.origin !== location.origin) { e.preventDefault(); say('Demo: external accounts and sample posting links are not opened.'); return; } p = u.pathname; } catch { return; }
    if (!/^\/(packet|prep|classic|report|download)(\/|$)/.test(p)) return;
    e.preventDefault();
    say('Demo: on the real dashboard this opens the file on the owner\'s PC.');
  }, true);
})();


