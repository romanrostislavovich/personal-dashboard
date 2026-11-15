# Battle.net account: characters by themselves, WoW Forever

Asked 2026-11-15: "everything comes through the integration, I enter nothing" — the characters
of the owner's Battle.net account, the new WoW Forever (released 2026-11-04) included, plus
achievements.

## What we know

- WoW Forever characters have a **surname and no realm**. With the app's keys (client
  credentials) `static-forever-eu` answers, `profile-forever-eu` exists (404, a made-up namespace
  gives 403), but `dynamic-forever-eu` has no realm index and `/profile/wow/character/...`
  finds nothing — a Forever character cannot be looked up by name.
- `/profile/user/wow?namespace=profile-forever-{region}` with a **user token** (authorization
  code, scope `wow.profile`) lists the account's Forever characters (Blizzard API forum,
  "World of Warcraft: Forever API Namespace?"). The token lasts about a day; there is no refresh
  token.

## The owner's answers

1. Sign in only to **find** characters; their data keeps coming with the app's keys.
2. Import characters from level 10; the lower ones are listed as hidden with "add".
3. Every version: retail, Anniversary, Era, Progression, Forever.
4. A found character matching a hand-added one (region, realm, name) merges with it — history
   and achievements stay; adding by hand stays for other people's characters.
5. A character gone from the account stays, marked "not on the account", and is no longer
   refreshed; Blizzard's character id keeps a renamed one from doubling.
6. A character the owner deleted in the dashboard is never brought back.
7. New characters are looked for at the sign-in and by "Find characters".
8. Forever is shown in the WoW tab like Classic: "Око Масонское · Forever"; the surname instead
   of the realm. The WoW Token of Forever is followed too, if Blizzard has one.
9. "Achievements": the game achievements of Forever characters (feed, notifications) and new
   dashboard achievements.
10. New dashboard achievements: "Army of alts" (5 / 10 / 20 characters), "Capped" (1 / 5 / 10 at
    the top level of their version), "Through the ages" (characters in 2 / 3 versions),
    "Forever" (a Forever character at the top level).
11. The same app keys; the owner adds the Redirect URL the card shows at develop.battle.net.
12. **Every region at once** (EU, US, KR, TW).

## Steps

1. **Sign-in and discovery** (done): `wow/battlenet-account.service.ts` — the sign-in, the token
   and the list of the account's characters kept as the user's secrets, a temporary probe in
   the log telling what a Forever character looks like and whether the app's keys can read it.
2. After the owner's first sign-in, by what the probe showed: `forever` in `WOW_VERSIONS`,
   import into `games_accounts` (merge, hidden, missing, Blizzard id), reading Forever
   characters, achievements, AI tools, README.
