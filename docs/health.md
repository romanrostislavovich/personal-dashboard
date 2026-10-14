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
   need the same key. ✅ Done: `encryptedText()` / `encryptedBytes()` from `@pd/api-core/schema`
   (`crypto/encrypted-columns.ts`), a key of their own derived from `ENCRYPTION_KEY`; a table with
   them is named in `registerEncryptedTables()`, so the export writes them decrypted (an archive
   is readable anywhere) and the import seals them again with the key of the instance.
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

What the licences allow (checked in October 2026): ICD-10 is © WHO and may not be shipped with
an open-source program, so the user accepts WHO's terms and their own server downloads the
English ClaML from icdcdn.who.int (done). ICD-11 is CC BY-ND 3.0 IGO and may be bundled as code,
title and URI, in English and Russian — but its codes are not ICD-10's, and a crosswalk of our
own is not allowed. No Russian, Polish or Ukrainian list may be redistributed either (Ukraine
uses ICD-10-AM, licensed to governments only), so any of them is loaded from a table the user
downloads themselves — CSV or XLSX, whatever its columns are called (done: the column of codes
and the one of titles are found by their content, `icd-table.ts`). The Russian ICD-10 of the
Ministry of Health is OID 1.2.643.5.1.13.13.11.1005 on nsi.rosminzdrav.ru. Later: ICD-11 en / ru.

## Stages

0. **Core** — encrypted fields, a connection per section, `/api/medical`; `registerPeriods` and
   `runAction` come with stage 5.
1. ✅ **MVP, by hand** — clinics and doctors, visits, diagnoses, medications, documents uploaded;
   one timeline "the whole history" with filters by country, doctor and speciality.
   **The ICD dictionary** — codes and titles in four languages, searched when a diagnosis is
   entered.
2. ✅ **Lab results** — panels and values; charts over time with the band of the norm; out of range
   marked; one line for an analyte from different laboratories and countries in one unit. Studies
   (ultrasound, MRI…) as conclusions with their files.
   Done: ~60 analytes with their names in uk / ru / pl / en and their units
   (`health-labs.ts` in the contracts: `guessAnalyte`, `looseUnit`, `toCanonical`, `labFlag`,
   `labSeries`); a line keeps the laboratory's own unit and range, the value in the analyte's
   unit is worked out on reading. Results and ranges are typed as labs write them (`5,6`,
   `3,9–5,5`, `<5.2`, `отрицательно`).
3. ✅ **A document → a draft → confirmed** — a photo or a PDF in any of the four languages becomes a
   draft of a visit, a lab panel or a study; shown next to the original, corrected and saved.
   Vision for scans. Telegram: a photo captioned `/med` (kept apart from receipt photos).
   Done: `DocumentReaderService` — a photo through the vision connection, a PDF through its
   text (a scanned PDF without a text layer is asked for as photos: rendering PDF pages needs a
   native canvas the image has not), the answer kept in the document's language
   (`keepLanguage`), the draft stored encrypted next to the document until it is saved in one
   transaction (`apply`) or dropped. The page shows the original beside the editable draft.
   Telegram: a photo with "🩺 A medical document" under it.
4. ✅ **For a new doctor** — active diagnoses, current medications, allergies, the latest results,
   the chronology; translated into the doctor's language, the codes kept; ticks for what goes in;
   a printable page (PDF through the browser) and DOCX; a public link for N days, revocable,
   throttled, off in the demo.
   Done: `buildHealthSummary` (contracts) picks the facts, `summaryBlocks` lays them out once
   for both the page (`summary-html.ts`, no script, every text escaped) and Word
   (`summary-docx.ts`); headings in en / pl / uk / ru / de, the texts translated by the AI only
   when asked (codes, numbers and medication names kept). A link stores the token's hash and
   the page frozen when it was made, encrypted; `/api/medical/shared/:token` is public, the same
   404 for unknown, expired and revoked, 30 opens per address in 10 minutes, `noindex`, a CSP
   that runs nothing.
5. ✅ **Links** — Psychology shows the psychiatrist's medications and diagnoses as periods on the
   mood and the questionnaires; a recommendation becomes a task or a reminder in one click; the
   next visit in the digest; search (Ctrl+K); demo data.
   Done: `LinksService.registerPeriods` / `periodsBetween` (Health tells the treatment of the
   mind: medications of a psychiatrist or psychotherapist, ICD-10 F / ICD-11 6 conditions;
   Psychology shows the mood during each, and its AI tool drops the periods of a section hidden
   from the shared AI); `AutomationsService.runAction` (a line of the recommendations becomes a
   task through `tasks.create`); the next visits in the digest (`optIn`); the command palette;
   demo data across two countries.
6. ✅ **Later — the profile and the reminders** — the profile (blood type, notes for an
   emergency, allergies with their severity, vaccinations with the next dose, operations), in
   the summary for a doctor first; reminders to take a medication at its times on the user's
   clock (`health.medication-reminders`, every minute, one row a medication, day and time, a
   missed time sent within 30 minutes, never later), "Taken" / "Skip" in Telegram and on the
   page, how the taking went over two weeks; due vaccinations in the digest. Import from the
   Polish IKP and the Ukrainian Helsi: neither gives an export of its own, so their PDFs go
   through a document read by the AI (stage 3); a dedicated import waits for a format.

Not done on purpose: achievements for illnesses; medical advice or interpreting results ("this
means you have…") — only facts: the value, the laboratory's norm, the dynamics.
