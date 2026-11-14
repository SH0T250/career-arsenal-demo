// demo.js — answers the dashboard's /api/* calls from data.json / presets.json so
// the dashboard runs on a static host. Sample targeting edits stay in this tab;
// external actions, file access and every other write route remain disabled.
(() => {
  const base = new URL('.', location.href);
  const load = (f) => fetch(new URL(f, base), { cache: 'no-store' }).then((r) => r.json());
  let data, presets, rules, presetSeed, previousParams = null;
  const presetKey = 'career-arsenal-demo-profiles-v1';
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
    data ??= await load('data.json');
    const p = await samplePresets();
    const result = structuredClone(data);
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
    const samples = (result.pipeline?.pending || []).map((r, i) => {
      const job = inboxJobs[i];
      r.stack = grade(job);
      return { ...job, stack: r.stack };
    });
    const exampleUrls = ['/summit-industries-1465/46321', '/westbrook-materials-1491/33216', '/valley-forge-construction/40765'];
    const all = [...result.tracker, ...samples];
    result.demoScoring = { base: 50, total: all.length, changed: all.filter((r) => r.stack.delta != null && r.stack.delta !== 0).length,
      hasPrevious: previousParams !== null, examples: exampleUrls.map((suffix) => samples.find((r) => r.url.endsWith(suffix))).filter(Boolean),
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
      if (method !== 'POST' || !['/api/presets/params', '/api/presets/save', '/api/presets/switch', '/api/presets/reset', '/api/presets/session-reset'].includes(u)) return json({ ok: false, error: 'only sample targeting edits are available; no live action was taken' });
      let body;
      try { body = JSON.parse(init?.body ?? await url.clone().text()); } catch { return json({ ok: false, error: 'invalid sample parameters' }, 400); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ ok: false, error: 'invalid sample parameters' }, 400);
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
        try { sessionStorage.removeItem(presetKey); } catch { /* memory-only sessions reset here too */ }
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
      result.brief.find((s) => s.title === 'Human review').lines[2] = 'Profile edits recalculate illustrative scores in this tab. Posting records stay unchanged; no live scan or send runs.';
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


