# Career Arsenal

Austin Jones's custom interface for a job-search workflow, with an opening tour and an interactive sample dashboard. Profiles, parameters and scoring were already part of the underlying system.

- [Showcase and guided tour](https://sh0t250.github.io/career-arsenal-demo/)
- [Interactive sample demo](https://sh0t250.github.io/career-arsenal-demo/demo/?theme=warroom)
- [Interactive system map](https://sh0t250.github.io/career-arsenal-demo/architecture.html)

The interactive demo uses fictional identities, preferences, documents and scores, with sample historical activity. Apply role, location and compensation preferences to recalculate fit scores with transparent browser rules and inspect the point breakdown. Move sample jobs through the pipeline, review inbox opportunities, add interviews to the local calendar and preview role-specific résumé/CV, cover letter and interview prep examples. Status changes update the sample overview. Edits and presets stay in the current browser tab; reset the demo session to restore the starting sample.

The full configured workflow supports job-description-specific, ATS-formatted résumé/CV and cover letter generation from verified candidate experience. Connected Gmail and Google Calendar workflows can check replies, log confirmed interviews and create calendar reminders. Interview preparation starts on request and can combine employer and interviewer research, public reviews, interview questions, answer outlines and a day-of plan. Employer feeds include Greenhouse, Lever and Workday; research tools include Firecrawl and Agent Reach. Availability depends on the configured integrations and accessible sources.

The public demo performs no live AI evaluation, external research, sending, scanning or agent connection. It does not connect to Gmail, Google Calendar, private documents or the owner's application records. Its document and prep previews are fictional examples generated locally in the browser.

This site uses static files and needs no backend service. To run locally, serve this directory with `python -m http.server 8844 --bind 127.0.0.1` and open `http://127.0.0.1:8844/`.

The open-source license is included in LICENSE.txt. Font licenses are included with the font files. The interactive map was created with Floorplan.
