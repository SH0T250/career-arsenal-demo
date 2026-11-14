// demo.js — answers the dashboard's /api/* calls from data.json / presets.json so
// the dashboard runs on a static host. Sample targeting edits stay in this tab;
// external actions, file access and every other write route remain disabled.
(() => {
  const base = new URL('.', location.href);
  const load = (f) => fetch(new URL(f, base), { cache: 'no-store' }).then((r) => r.json());
  let data, presets, rules;
  const presetKey = 'career-arsenal-demo-profiles-v1';
  const textFits = (s, max) => typeof s === 'string' && s.trim().length > 0 && s.length <= max;
  const validParams = (p) => p && Array.isArray(p.target_roles) && p.target_roles.length > 0 && p.target_roles.length <= 12
    && p.target_roles.every((r) => textFits(r, 80)) && textFits(p.location, 160) && textFits(p.comp, 160);
  async function samplePresets() {
    if (presets) return presets;
    const seed = await load('presets.json');
    const examples = {
      'sample-career': { target_roles: ['Project Coordinator', 'Implementation Specialist'], location: 'Example: remote or local hybrid', comp: 'Example: annual salary aligned with role scope' },
      'sample-flexible': { target_roles: ['Document Controller', 'Technical Writer'], location: 'Example: remote with a flexible schedule', comp: 'Example: hourly or project-based contract' },
      'sample-gigs': { target_roles: ['Freelance Documentation Specialist', 'Project Support Consultant'], location: 'Example: remote, short projects', comp: 'Example: fixed fee per project' },
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
        presets = null;
        try { sessionStorage.removeItem(presetKey); } catch { /* memory-only sessions reset here too */ }
        return json({ ok: true });
      }
      persistPresets();
      return json({ ok: true });
    }
    if (u.startsWith('/api/data')) return json(data ??= await load('data.json'));
    if (u === '/api/presets') return json(await samplePresets());
    if (u.startsWith('/api/presets/file')) return json({ ok: true, name: 'demo', content: '# Demo\n\nIn the real dashboard this shows your targeting file (modes/_profile.md, modes/_brief.md or portals.yml) and lets you edit it.' });
    if (u.startsWith('/api/chat/state')) return json({ busy: false, session: null, activity: null });
    if (u === '/api/answers') return json(ANSWERS);
    if (u === '/api/targeting-rules') {
      const p = await samplePresets();
      rules ??= await load('rules.json');
      const result = structuredClone(rules);
      result.brief[0] = { title: 'Current sample parameters', lines: [`Roles: ${p.params.target_roles.join(', ')}.`, `Location: ${p.params.location}.`, `Compensation: ${p.params.comp}.`] };
      result.brief.find((s) => s.title === 'Human review').lines[2] = 'Sample profile edits stay in this tab. Job records and scores remain fixed; no live scan or send runs.';
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


