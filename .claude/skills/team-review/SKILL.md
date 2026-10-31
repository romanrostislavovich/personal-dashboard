---
name: team-review
description: Review a feature branch of the dashboard by the whole team before merging — the frontend, backend and architecture reviewers and QA in parallel subagents, then one report. Use when the owner says "ревью", "team review", "проверь командой", or before merging a big branch.
---

# Team review

Answer in Russian. The range is `main...HEAD` unless the owner names one.

1. `git diff main...HEAD --stat`: which sides the change touches.
2. In **one message**, start the agents that apply (`Agent` with `subagent_type`), each given the
   range and one line of what the change should do:
   - `frontend-reviewer` — when web files, `*.html`, `*.scss` or i18n changed;
   - `backend-reviewer` — when `libs/**/api`, contracts or migrations changed;
   - `architecture-reviewer` — always;
   - `qa` — always (tests; the UI on a scratch DB when the UI changed);
   - `web-designer` — only when a page's look changed noticeably and the owner asked for it.
3. When all have answered, **merge their reports into one**, without repeats:
   - **Блокеры** — what must be fixed before the merge (data, another user's data, a crashed
     start, a failing test, a broken page), each with `file:line` and who found it;
   - **Стоит поправить** — the rest, the most visible first;
   - **Проверено** — what passed, one line per agent;
   - **Не проверено** — what needs the owner's device or real data.
4. Ask the owner whether to fix the blockers now; never fix, merge or deploy on your own.

The `analyst` agent is not part of it: it works **before** the code of a feature (the questions
to the owner and a proposal).
