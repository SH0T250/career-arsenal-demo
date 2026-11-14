const steps = [
  { title: 'Start with what needs you.', body: 'The War Room brings the application tracker into a daily overview. Click through to explore pipeline activity, expand follow-ups and inspect the records behind the totals.', prompt: 'Open the interactive view, then expand “Follow-ups due.”', image: 'overview', route: 'overview', alt: 'Career Arsenal sample War Room showing application status, pipeline flow, weekly activity and follow-ups.' },
  { title: 'Switch profiles. Inspect a role.', body: 'Choose Career, Flexible work or Gigs to focus the pipeline. Click a sample opportunity to see its status, notes, rating and the criteria behind its fixed example fit score.', prompt: 'Open Applications, select a profile and click a company row.', image: 'applications', route: 'applications', alt: 'Sample application list with search profiles, fit scores and the selected role details.' },
  { title: 'Keep the next conversation visible.', body: 'The interview view brings rounds, follow-ups and study time together. Upcoming work has a place on the calendar, while past conversations retain their context.', prompt: 'Open Interviews and expand the notes on a past sample interview.', image: 'interviews', route: 'interviews', alt: 'Demo interview calendar with follow-up dates, study sessions and past interview rounds.' },
  { title: 'Bring the preparation with you.', body: 'Document packets put the prepared materials beside the opportunity. The full local version opens the matching files; the public demo shows the organization without exposing personal documents.', prompt: 'Open Documents and inspect how sample packets are grouped.', image: 'documents', route: 'documents', alt: 'Sample document workspace showing organized application packets and preparation materials.' },
  { title: 'Choose the criteria. See the logic.', body: 'Targeting presets define example roles, location and compensation preferences. Edit a field, apply it or save a preset for this tab. Read the scoring rules alongside them; sample jobs and fit scores stay fixed.', prompt: 'Edit “Target roles”, choose “Apply sample parameters”, then save a preset.', image: 'targeting', route: 'targeting', alt: 'Demo targeting view with search profiles, sample parameters and readable scoring criteria.' }
];
const tabs = [...document.querySelectorAll('[data-step]')];
let current = 0;
function showStep(index, focusTab = false) {
  current = Math.max(0, Math.min(steps.length - 1, index));
  const step = steps[current];
  tabs.forEach((tab, i) => { tab.setAttribute('aria-selected', String(i === current)); tab.tabIndex = i === current ? 0 : -1; });
  document.getElementById('tour-panel').setAttribute('aria-labelledby', `step-${current}`);
  document.getElementById('step-title').textContent = step.title;
  document.getElementById('step-body').textContent = step.body;
  document.getElementById('step-prompt').replaceChildren(Object.assign(document.createElement('strong'), { textContent: 'Try it: ' }), document.createTextNode(step.prompt));
  document.getElementById('step-count').textContent = `${current + 1} of ${steps.length}`;
  const image = document.getElementById('tour-image');
  image.src = `assets/${step.image}.jpg`;
  image.alt = step.alt;
  document.getElementById('step-link').href = `demo/?theme=warroom#${step.route}`;
  const preview = document.getElementById('tour-preview');
  preview.href = `demo/?theme=warroom#${step.route}`;
  preview.setAttribute('aria-label', `Try the interactive ${step.route === 'overview' ? 'War Room' : step.route} view`);
  document.getElementById('previous').disabled = current === 0;
  document.getElementById('next').disabled = current === steps.length - 1;
  if (focusTab) tabs[current].focus();
}
tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => showStep(index));
  tab.addEventListener('keydown', event => {
    const target = { ArrowRight: (index + 1) % steps.length, ArrowLeft: (index + steps.length - 1) % steps.length, Home: 0, End: steps.length - 1 }[event.key];
    if (target !== undefined) { event.preventDefault(); showStep(target, true); }
  });
});
document.getElementById('previous').addEventListener('click', () => showStep(current - 1));
document.getElementById('next').addEventListener('click', () => showStep(current + 1));


