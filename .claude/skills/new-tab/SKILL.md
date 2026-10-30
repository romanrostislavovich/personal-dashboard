---
name: new-tab
description: Checklist for adding or changing a tab (subsection) of an existing module — route, nav, i18n, mobile layout, achievements, README. Use when a module gets a new tab or a tab changes noticeably.
---

# A new or changed tab

Answer the owner in Russian; ask the clarifying questions first (what it shows, empty state,
mobile).

1. **Route**: a child route of the module (each tab has its own address,
   `/<module>/<tab>?…` — a notification may link straight to it); query params for its state
   (`?day=`, `?view=`) so links and back work.
2. **Nav**: the module's `TABS` list and `health.tabs.*`-style label keys; a command in the
   palette if it is a place one jumps to.
3. **i18n**: en and ru with the same keys.
4. **Mobile (≈390px)**: tabs scroll; the first tap on a tab must switch to it (a known bug: a
   scrolled tab bar snapped back and needed a second tap); grids and charts fit; dialogs
   full-width. Check it in the `verify-ui` skill at phone width.
5. **Empty and loading states**: say what to do to get data, never a blank page.
6. **Achievements** for what the tab counts; **Links** metrics if it has daily numbers.
7. **README.md** and `docs/telemetry.md` if it shows new data.
8. Lint the module from its folder (templates!) — `!=`/`==` in templates fail CI.
