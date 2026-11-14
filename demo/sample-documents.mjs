// Sample documents stay entirely in the browser and never read private candidate files.
// shortcut: previews select templates by title; use a full sample JD only when a sanitized fixture is supplied.
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const text = (value, fallback = '') => typeof value === 'string' && value.trim() ? value.trim().slice(0, 500) : fallback;
const list = (items) => `<ul>${items.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>`;

const PROFILES = {
  construction: {
    match: /construction|project (?:manager|engineer|coordinator)|field|superintendent|estimat|preconstruction/i,
    focus: 'project coordination, document control and reliable field-to-office handoffs',
    skills: ['Schedule and action tracking', 'RFIs and submittal registers', 'Issue escalation', 'Drawing revision control', 'Closeout coordination'],
    priorities: ['Clarify scope, milestones and decision owners before work starts.', 'Keep the current drawing and submittal status visible to each team.', 'Surface constraints early and document how they affect the next milestone.'],
    proof: 'Built a shared action register for a fictional eight-workstream rollout, assigned an owner and due date to each open item, and reviewed blockers with the team every week.',
    question: 'How would you manage a late submittal that threatens a field milestone?',
    approach: 'Confirm the controlling requirement and latest revision, map the affected work, ask the responsible reviewer for a decision date, and present sequencing options with their assumptions. Escalate the decision without claiming design authority.',
    firstMonth: 'Learn the project controls, review current scope and schedules, and map the RFI, submittal and field handoff process.',
  },
  documentation: {
    match: /document|technical writ|content|knowledge|editor/i,
    focus: 'clear technical documentation, revision control and usable knowledge handoffs',
    skills: ['Technical writing', 'Information architecture', 'Revision control', 'Subject-matter expert interviews', 'Release checklists'],
    priorities: ['Identify the audience, task and source of truth for each document.', 'Turn expert input into testable steps and examples.', 'Use review owners, revision history and a repeatable release checklist.'],
    proof: 'Reorganized a fictional onboarding guide into task-based steps, tested it with two sample new starters, and recorded their questions before the next revision.',
    question: 'How do you verify that a procedure is accurate and useful?',
    approach: 'Trace each important step to a reliable source, ask a subject-matter expert to review it, then have a new reader perform the task. Record gaps and resolve them before approving the revision.',
    firstMonth: 'Audit the document set, identify its audiences and owners, and observe how people use the existing procedures.',
  },
  implementation: {
    match: /implement|software|customer|onboard|success|integration|technical account/i,
    focus: 'implementation planning, customer onboarding and dependable launch handoffs',
    skills: ['Requirements discovery', 'Implementation plans', 'Acceptance testing', 'Customer communication', 'User training'],
    priorities: ['Translate the customer goal into a clear scope and acceptance criteria.', 'Track configuration, dependencies and decisions in one implementation plan.', 'Prove readiness with user testing and an owned support handoff.'],
    proof: 'Coordinated a fictional six-week onboarding pilot, maintained the decisions and test checklist, and held a documented handoff with the support team.',
    question: 'What would you do if a customer asks for a major change just before launch?',
    approach: 'Clarify the business need, compare it with the agreed acceptance criteria, and assess dependency and test impacts. Offer an explicit launch-versus-follow-up choice with owners and decision dates.',
    firstMonth: 'Learn the product and customer journey, shadow implementations, and map the acceptance and support handoffs.',
  },
  general: {
    focus: 'structured research, clear documentation and accountable delivery',
    skills: ['Requirements clarification', 'Research and source checking', 'Action tracking', 'Stakeholder communication', 'Process documentation'],
    priorities: ['Confirm the role’s outcomes and how success is measured.', 'Identify key stakeholders, inputs and decision owners.', 'Make the next action, evidence and handoff easy to follow.'],
    proof: 'Built a shared action register for a fictional eight-workstream rollout, assigned owners and due dates, and used weekly reviews to keep decisions visible.',
    question: 'How do you handle an unclear request with a tight deadline?',
    approach: 'Restate the desired outcome, separate known facts from assumptions, identify the smallest useful deliverable, and confirm a checkpoint with the decision owner.',
    firstMonth: 'Learn the team’s goals, tools, stakeholders and current handoffs before proposing changes.',
  },
};

/** Fictional preview only. The caller owns the dialog title and focus management. */
export function renderSampleDocument(job = {}, kind = 'resume', interview = null) {
  if (!['resume', 'cover', 'prep'].includes(kind)) throw new TypeError('Unknown sample document kind');
  const role = text(job?.role || job?.title, 'Sample role');
  const company = text(job?.company, 'Example employer');
  const profile = Object.values(PROFILES).find((p) => p.match?.test(role)) || PROFILES.general;
  const intro = '<p><strong>Fictional demonstration.</strong> Jordan Taylor, the experience, examples and outcomes below are invented sample content, not Austin’s background. This preview uses local templates and the selected sample role; it does not read a full job description, run AI, research live sources or open private files.</p>';
  const fullSystem = '<p>The full workflow tailors a résumé/CV and cover letter to the job description and the candidate’s verified source material. Interview preparation combines that context with company and interviewer research. These previews illustrate the output structure; they are not application-ready documents.</p>';
  const target = `<p><strong>Target:</strong> ${esc(role)} at ${esc(company)}</p>`;

  if (kind === 'resume') return {
    title: `Sample résumé / CV — ${role}`,
    html: `${intro}${fullSystem}<h2>Jordan Taylor</h2><p>Example City, USA · jordan.taylor@example.com</p>${target}
      <h3>Professional summary</h3><p>Operations coordinator focused on ${esc(profile.focus)}. Brings a consistent approach to clarifying requirements, tracking decisions and preparing usable documentation. Seeking to apply that experience to the ${esc(role)} role at ${esc(company)}.</p>
      <h3>Core skills</h3>${list(profile.skills)}
      <h3>Professional experience</h3><p><strong>Operations Coordinator · Example Operations Co.</strong><br>2023–Present · Fictional employer</p>${list([profile.proof, 'Maintained a weekly owner-and-due-date register, separated blocked items from ready work, and documented escalation decisions.', 'Prepared concise stakeholder updates and handoff notes linked to the relevant source material.'])}
      <p><strong>Project Support Associate · Example Services Co.</strong><br>2021–2023 · Fictional employer</p>${list(['Maintained revision history and organized project records so the team could locate the current approved information.', 'Converted recurring questions into an onboarding guide and a reusable review checklist.'])}
      <h3>Selected project</h3><p><strong>Shared delivery register</strong> — A fictional practice project connecting requirements, owners, due dates and review evidence in one documented workflow.</p>
      <h3>Education</h3><p>Bachelor of Business Administration · Example State University · 2021<br>Fictional education record</p>
      <h3>How this sample is tailored</h3><p>The target title, summary, skills and first experience example change with the selected role’s focus. Standard headings and a single-column text structure demonstrate ATS-oriented formatting. Actual qualifications, keywords and accomplishments must be verified against the full job description and candidate record.</p>`,
  };

  if (kind === 'cover') return {
    title: `Sample cover letter — ${company}`,
    html: `${intro}${fullSystem}<h2>Jordan Taylor</h2><p>jordan.taylor@example.com</p>${target}
      <p>Dear Hiring Team,</p><p>I am interested in the ${esc(role)} opportunity at ${esc(company)}. My background in operations coordination has centered on ${esc(profile.focus)}, with particular attention to making requirements, decisions and next steps understandable to the people doing the work.</p>
      <p>In one sample project, I ${esc(profile.proof.charAt(0).toLowerCase() + profile.proof.slice(1))} That experience reflects how I approach delivery: establish the source of truth, give actions clear owners, and check the handoff before considering the work complete.</p>
      <p>For this opportunity, I would bring a practical emphasis on ${esc(profile.skills.slice(0, 3).map((s) => s.toLowerCase()).join(', '))}. I would welcome the chance to discuss the team’s priorities, current workflow and the outcomes you want this role to own.</p>
      <p>Thank you for your consideration.</p><p>Jordan Taylor</p>
      <h3>Before a real application</h3>${list(['Replace this fictional background with verified candidate experience.', 'Use the actual job description to select relevant evidence and accurate terminology.', 'Add a company-specific reason for interest only after checking reliable sources.', 'Review the final résumé/CV and letter together for consistency.'])}`,
  };

  const event = interview && typeof interview === 'object' ? interview : {};
  const meeting = [
    ['Company', company], ['Role', role], ['Round', text(event.round, 'Not scheduled')],
    ['Date', text(event.date, 'Not scheduled')], ['Time', text(event.time, 'Not scheduled')],
    ['Location', text(event.location, 'Not provided')],
  ];
  return {
    title: `Sample interview prep — ${company}`,
    html: `${intro}${fullSystem}<h2>Interview preparation packet</h2><dl>${meeting.map(([label, value]) => `<dt>${esc(label)}</dt><dd>${esc(value)}</dd>`).join('')}</dl>
      <p><strong>Calendar simulation:</strong> these details come from the sample interview in this browser tab. No Gmail account or Google Calendar event is accessed or changed.</p>
      <h3>Your opening summary</h3><p>“I’m Jordan Taylor, an operations coordinator focused on ${esc(profile.focus)}. I organize the evidence, make ownership clear and follow through on handoffs. I’m interested in learning what success in the ${esc(role)} role at ${esc(company)} looks like and where that approach can help.”</p>
      <h3>Role priorities to validate</h3><p>These are suggested discussion points based on the sample title, not extracted requirements from a live job description.</p>${list(profile.priorities)}
      <h3>Company and interviewer research</h3><p>No company or interviewer facts have been looked up for this sample. A researched packet should separate sourced facts, candidate evidence and open questions.</p>${list([`Check ${company}’s official site for its products, services, customers and current priorities; record source URLs and dates.`, 'Read the exact job posting and compare each essential requirement with verified résumé evidence; flag any gaps.', 'Check recent official announcements and reliable reporting for developments relevant to the role.', 'Review the interviewer’s public professional biography and role, when supplied; do not infer personal traits.', 'Compare public employee reviews and interview reports for recurring themes; label anecdotes and uncertainty.', 'Confirm the interview time zone, format, participants, meeting link and any assessment or presentation requirements.'])}
      <h3>Questions you may be asked</h3><p><strong>${esc(profile.question)}</strong></p><p>${esc(profile.approach)}</p><p><strong>Tell me about a time you brought structure to an unclear workflow.</strong></p>
      <dl><dt>Situation</dt><dd>A fictional eight-workstream rollout used scattered messages to manage open decisions.</dd><dt>Task</dt><dd>Jordan needed to give the team a reliable view of ownership, deadlines and blockers.</dd><dt>Action</dt><dd>Jordan created a shared register, confirmed each owner, linked supporting evidence and reviewed unresolved items weekly.</dd><dt>Result</dt><dd>The sample team had one documented handoff and escalation process. This is an invented scenario, not a measured real-world result.</dd></dl>
      <p><strong>Describe a time you improved documentation.</strong></p><dl><dt>Situation</dt><dd>Sample new starters repeatedly asked where to find current instructions.</dd><dt>Task</dt><dd>Make the first-week workflow easier to follow without relying on informal explanations.</dd><dt>Action</dt><dd>Jordan organized the guide by task, included review owners and tested the steps with two fictional new starters.</dd><dt>Result</dt><dd>The exercise produced a revised guide and an explicit list of unanswered questions for the subject-matter expert.</dd></dl>
      <p><strong>Where would you need to learn?</strong></p><p>“I would first verify the specific tools, domain requirements and expectations in this role. I would distinguish experience I can demonstrate from areas where I need training, then agree on an initial learning plan.”</p>
      <h3>Questions for the interviewer</h3>${list(['What outcomes should this person own in the first 90 days?', 'Where does work most often stall between teams?', 'How are priorities, quality and successful handoffs measured?', 'What distinguishes someone who performs well in this role?', 'What are the next steps and the expected decision timeline?'])}
      <h3>A possible 30 / 60 / 90-day plan</h3><dl><dt>Days 1–30: understand</dt><dd>${esc(profile.firstMonth)}</dd><dt>Days 31–60: contribute</dt><dd>Own a bounded piece of work, validate its requirements, document decisions and ask for feedback on the handoff.</dd><dt>Days 61–90: improve</dt><dd>Propose one evidence-backed improvement, agree on a baseline and success measure, and document a repeatable approach with the team.</dd></dl>
      <h3>Day-of checklist</h3>${list(['Confirm the date, time zone and meeting details against the invitation.', 'Review the job description, résumé/CV, cover letter and the source-backed company brief.', 'Prepare two truthful examples, questions for the interviewer and a concise explanation of any gaps.', 'Test the meeting setup and keep a place to record commitments and next steps.'])}
      <h3>Follow-up draft</h3><p>Thank you for discussing the ${esc(role)} opportunity at ${esc(company)}. I appreciated learning more about [specific priority discussed]. Our conversation reinforced my interest in contributing through ${esc(profile.focus)}. As agreed, I will [next action] by [date]. Please let me know if any additional information would be helpful.</p>
      <p>Replace the bracketed details with actual conversation notes and review before sending. This demo never sends the draft.</p>`,
  };
}
