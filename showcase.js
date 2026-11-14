const steps = [
  { title: 'Start with what needs you.', body: 'The War Room connects priorities, pipeline activity and follow-ups. Try the sample workflow, then watch the overview respond as you review jobs, change their status and add interviews.', prompt: 'Open the interactive view and choose “Try sample workflow.”', image: 'overview', route: 'overview', alt: 'Career Arsenal sample War Room showing application status, pipeline flow, weekly activity and follow-ups.' },
  { title: 'Move a role toward the next step.', body: 'Choose Career, Flexible work or Gigs to focus the pipeline. Open a sample job, inspect its fit score and change its status. Review an inbox opportunity to bring another role into the workflow. The overview reflects your changes.', prompt: 'Select a company row, choose a “New status” and save. In the Inbox, try “Move to review.”', image: 'applications', route: 'applications', alt: 'Sample application list with search profiles, fit scores and the selected role details.' },
  { title: 'Turn an invite into interview prep.', body: 'Accept a fictional Gmail interview invite. The demo moves its job to Interview, adds the calendar event and automatically generates a prep packet from local sample templates. Review the result, edit the interview or reset to try it again.', prompt: 'In Mail, choose “Accept sample invite.” The calendar and generated prep packet are ready together; no real account is connected.', image: 'interviews', route: 'mail', alt: 'Demo interview calendar showing where an accepted sample Gmail invite appears.' },
  { title: 'Bring the preparation with you.', body: 'The full workflow tailors an ATS-formatted résumé/CV and cover letter to each job description. Interview prep adds company research, likely questions, answer outlines and a practical plan. Open fictional, role-specific previews here to see what those packets contain.', prompt: 'Open a sample packet, then choose “Preview résumé / CV,” “Preview cover letter” or “Preview prep packet.”', image: 'documents', route: 'documents', alt: 'Sample document workspace showing organized application packets and preparation materials.' },
  { title: 'Choose the criteria. See the logic.', body: 'Targeting presets define example roles, location and minimum compensation. Apply your changes to recalculate sample fit scores and inspect the points that changed. Compare how the same opportunity fits different priorities, then save a preset for this tab.', prompt: 'Edit a preference, choose “Apply & recalculate scores” and compare the score breakdown. Save a preset to try again later in this tab.', image: 'targeting', route: 'targeting', alt: 'Demo targeting view with search profiles, sample parameters and readable scoring criteria.' }
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


