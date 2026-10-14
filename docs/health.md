# Health: one medical history across countries

A life spread over several countries (Ukraine, Belarus, Poland) and clinics leaves the medical
history in pieces that no single doctor sees. The Health module keeps one history of your own:
visits, diagnoses, medications, lab results and studies, with the original documents, in
dynamics, and a summary for a new doctor in their language.

It starts as a module of the dashboard. It may become an app of its own later, so the pure logic
(the dictionary of analytes, units, codes) lives in a plain TypeScript library without Nest or
Angular.

## What is reused

| Need                  | Already there                                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------------- |
| Scans and PDFs        | `bytea` in Postgres like `diary_photos` / `finance_receipts`; sync, export and trash take them |
| Reading a photo       | `AiService.completeWithImage()`, the receipt flow (`receipt-parse.ts`)                         |
| Text of a PDF         | `attachmentText()` (unpdf); a scan without a text layer needs vision                           |
| Word export           | the hand-written OOXML of `psychology/events-export.ts`                                        |
| Keeping the AI out    | `disabledModules`                                                                              |
| Psychology next to it | `LinksService` — a new source of periods is needed                                             |

## What the core gets

1. **Encrypted fields** — a helper that encrypts free text and files of a module with
   `ENCRYPTION_KEY` (AES-256-GCM, as `SecretsService` does). Dates, ICD codes and lab numbers stay
   plain, or charts and filters are impossible. It protects dumps and backups; both sides of sync
   need the same key.
2. **A connection of its own for a section** — by default Health uses the active AI connection
   like everything else; in the settings the whole section can be given another saved connection
   (e.g. a local Ollama), and then every AI call of Health goes there. ✅ Done for any section:
   Settings → AI → "What the AI sees" (`moduleConnections`). A section with a connection of its
   own is kept out of everything the shared connection gets — the assistant's tools, the digest,
   the stories of Life, `core_day` (`AiService.hiddenFromShared`); a link of Health that reaches
   the assistant through a tool across the sections (mood insights, a project) must check it too.
3. **Periods in `LinksService`** (`registerPeriods`) — "a medication from … to …", "a diagnosis
   since …"; Psychology lays them over the mood.
4. **`AutomationsService.runAction()`** — a recommendation becomes a task or a reminder through
   the registered `tasks.create` / `tasks.remind`, without depending on Tasks.
5. **The route** — `/api/health` is the server's health check, so the module's API is
   `/api/medical/*`; the web page is `/health`.

## Data

Every table has `userId`, a primary key and `updatedAt`.

- `health_clinics` — name, country, city, contacts
- `health_doctors` — name, speciality, clinic, contacts
- `health_visits` — date, clinic and doctor, speciality, complaints, findings, recommendations,
  the next visit, the language of the original
- `health_diagnoses` — ICD-10 / ICD-11 code and the wording of the document; status (suspected,
  confirmed, ruled out, in remission); the visit. One code is one condition with its history
- `health_medications` — brand name and **active substance (INN)** (brands differ between
  countries), dose, schedule, started, stopped and why, prescribed at which visit
- `health_lab_panels` — date, laboratory, country, visit, document
- `health_lab_values` — the analyte as written and its canonical key (LOINC later), the value
  (a number or text), the unit, the reference range **of that laboratory**, out of range, the
  value in the canonical unit
- `health_studies` — ultrasound, MRI, CT, X-ray, ECG: kind, area, conclusion, date, document
- `health_documents` — the file, kind, language, recognised text, the state of parsing, what it
  belongs to
- `health_profile` — blood type, allergies, vaccinations, operations
- `health_share_links` — the hash of the token, expiry, what is included, revoked

The pure logic, with tests: ~80 common analytes with synonyms in uk / ru / pl / en (blood count,
glucose, HbA1c, lipids, TSH, ALT / AST, creatinine, ferritin, vitamin D, B12…), the unit
conversion factors (glucose ×18, cholesterol ×38.67, creatinine ×88.4, vitamin D ×2.496), ICD
codes checked and formatted.

ICD codes come from a dictionary of codes and titles in uk / ru / pl / en: a diagnosis is picked
by searching it in any of the languages, and the AI proposes a code from it when it reads a
document. The sources and their licences decide whether the dictionary is in the repository or
loaded on the first start (WHO ICD-10, ICD-11, the national lists — see the stage below).

## Stages

0. **Core** — encrypted fields, a connection per section, `/api/medical`; `registerPeriods` and
   `runAction` come with stage 5.
1. **MVP, by hand** — clinics and doctors, visits, diagnoses, medications, documents uploaded;
   one timeline "the whole history" with filters by country, doctor and speciality.
   **The ICD dictionary** — codes and titles in four languages, searched when a diagnosis is
   entered.
2. **Lab results** — panels and values; charts over time with the band of the norm; out of range
   marked; one line for an analyte from different laboratories and countries in one unit. Studies
   (ultrasound, MRI…) as conclusions with their files.
3. **A document → a draft → confirmed** — a photo or a PDF in any of the four languages becomes a
   draft of a visit, a lab panel or a study; shown next to the original, corrected and saved.
   Vision for scans. Telegram: a photo captioned `/med` (kept apart from receipt photos).
4. **For a new doctor** — active diagnoses, current medications, allergies, the latest results,
   the chronology; translated into the doctor's language, the codes kept; ticks for what goes in;
   a printable page (PDF through the browser) and DOCX; a public link for N days, revocable,
   throttled, off in the demo.
5. **Links** — Psychology shows the psychiatrist's medications and diagnoses as periods on the
   mood and the questionnaires; a recommendation becomes a task or a reminder in one click; the
   next visit in the digest; search (Ctrl+K); demo data.
6. **Later** — reminders to take medications, the profile (vaccinations, operations), import from
   the Polish IKP and the Ukrainian Helsi when they export.

Not done on purpose: achievements for illnesses; medical advice or interpreting results ("this
means you have…") — only facts: the value, the laboratory's norm, the dynamics.
