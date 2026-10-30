---
name: bug
description: Fix a bug the owner reports in the dashboard — reproduce, find the cause, a failing test, the fix, docs, and the owner's task list. Use for every reported bug or a batch of them.
---

# A bug

Answer in Russian. For a batch, keep them in the owner's dashboard task "Баги дашборда" and
take the most serious first (data loss, sync, crashes before cosmetics).

1. **Ask only what is ambiguous** (which device, which day, what was expected) — check the data and
   logs yourself first: the local instance's `system.log` (read-only on 5433/dashboard), the phone
   over adb (`phone` skill), the page at phone width (`verify-ui` skill).
2. **Reproduce** and find the **cause**, not the symptom. Say it to the owner in one line before
   fixing ("the tab bar resets because …").
3. **A test that fails first**: pure logic in `*.spec.ts`; services in `*.db.spec.ts` on a scratch DB.
   UI-only bugs: a check in the browser at the right width instead.
4. **Fix** on a `fix/…` branch, smallest change that removes the cause; the hooks format and lint
   each edit.
5. Look for the **same bug elsewhere** (the same pattern in other modules/tabs).
6. Docs if behaviour changed: README.md, docs/telemetry.md, the module's proposal; achievements if
   counting changed.
7. Lint/types/tests of the touched projects (`deploy` skill §2), then deploy on the owner's request.
8. Mark the item done in the owner's task (MCP `tasks_update`), and what was not verified live.
