# Integrations

Everything is connected in one place: **Settings → Integrations**; every card there also has a
step-by-step "How to connect" guide. All tokens entered there are stored encrypted (AES-256-GCM
with `ENCRYPTION_KEY`) and are never sent back to the browser.

The keys of the server itself — the Telegram bot, the Spotify app, the LanguageTool server —
are set once for every user by the owner (the first user) in the same cards, under
“Server key”; the server checks each one with the service before it keeps it, and a sync
client receives them with the sync. They are not read from `.env` any more.

| Integration           | How to connect                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Telegram              | Create a bot with [@BotFather](https://t.me/BotFather), paste its token into “Server key”, then “Connect Telegram”                                                                                                                                                                                                                                                                      |
| AI                    | Add a connection: provider (DeepSeek by default), model, API key. Add several and switch in one click. For full privacy use Ollama                                                                                                                                                                                                                                                      |
| GitHub                | A classic token with `read:user`, `repo` and `read:org`: your repositories (private ones too), organizations and account statistics                                                                                                                                                                                                                                                     |
| GitLab, Bitbucket     | GitLab: an access token with `read_api` and `read_user`; Bitbucket: your Atlassian e-mail and an API token — repositories and the activity calendar                                                                                                                                                                                                                                     |
| WakaTime              | The secret API key from wakatime.com → Settings → Account; days are copied to the dashboard, so history outlives the free plan                                                                                                                                                                                                                                                          |
| Hetzner Cloud         | Cost import → a project API token with Read access                                                                                                                                                                                                                                                                                                                                      |
| DeepSeek costs        | Cost import → an API key; spending is derived from balance changes                                                                                                                                                                                                                                                                                                                      |
| Last.fm               | Username + API key from [last.fm/api/account/create](https://www.last.fm/api/account/create)                                                                                                                                                                                                                                                                                            |
| Spotify               | Create an app at developer.spotify.com with the Redirect URI the card shows, paste its Client ID and Secret into “Server key”                                                                                                                                                                                                                                                           |
| LanguageTool          | The address of the LanguageTool server: `http://languagetool:8010` for the one in docker compose (`http://localhost:8010` with `npm run dev`)                                                                                                                                                                                                                                           |
| PKO BP statement      | Nothing to set up: iPKO → History → Download (CSV or XML), then “Import a PKO statement” in Finance; importing it again adds nothing                                                                                                                                                                                                                                                    |
| Bank (Enable Banking) | An application of your own at enablebanking.com (Production, own accounts), the redirect URL the card shows; its Application ID and .pem key into “Server key”                                                                                                                                                                                                                          |
| SoundCloud            | The address of your profile (`https://soundcloud.com/your-name`) is enough for public tracks; plays, likes, reposts and comments are saved day by day                                                                                                                                                                                                                                   |
| Steam                 | A Web API key from steamcommunity.com/dev/apikey (one for all accounts), then add your profiles on the Games page                                                                                                                                                                                                                                                                       |
| Dota 2                | Games → Steam ID or profile link; enable “Expose Public Match Data” in Dota. Matches come from Steam (with the key above); an OpenDota API key per account is optional                                                                                                                                                                                                                  |
| Xbox                  | An API key from xbl.io (OpenXBL; sign in there with the Xbox account — the key reads that account; the free plan is enough), then Games → Xbox → Add. Gamerscore, games and achievements; no hours played                                                                                                                                                                               |
| World of Warcraft     | Battle.net client ID and secret from develop.battle.net, then Games → region / realm / character                                                                                                                                                                                                                                                                                        |
| Google Health         | A Fitbit band (the Fitbit Air): a Google Cloud project with the Google Health API on, an OAuth client (Web application) with the redirect URI the card shows, its Client ID and secret in “Server key”, then “Connect” and sign in with the band’s Google account. Publish the consent screen (In production) — in Testing Google drops the consent every 7 days. Read-only, every hour |
| TMDB                  | Movies: sign up at themoviedb.org, Settings → API → Create → Developer, copy the “API Key” or the “API Read Access Token” into Settings → Integrations → TMDB. Without it the titles are kept as the sites name them (no posters, no search). The browser extension notes what plays by itself                                                                                          |
| Weather               | Nothing to connect: Open-Meteo needs no key                                                                                                                                                                                                                                                                                                                                             |

## Telegram bot

Just write to it — the AI assistant answers and can do almost anything the dashboard can on
request: add, edit and delete birthdays, diary entries, transactions, recurring payments, tasks,
projects, monitored sites, repositories and game accounts. It asks before deleting anything; keys
and tokens are set up only in the dashboard. The conversation is shared with the AI chat of the
dashboard and kept across restarts.

| Command                          | What it does                                 |
| -------------------------------- | -------------------------------------------- |
| `/d text`                        | Add to today's diary entry                   |
| `/mood 1–5`                      | Rate the day                                 |
| `/today`                         | Show today's entry                           |
| `/todo buy milk #home`           | Add a task                                   |
| `/remind tomorrow 9:00 call mum` | Set a reminder                               |
| `/tasks`                         | Tasks for today and overdue ones             |
| `/ask question`                  | A one-off question                           |
| `/new`                           | Start a new conversation                     |
| `/model`, `/model 2`             | List the saved AI connections, switch to one |

- **Voice messages** are turned into text (with an OpenAI connection) and handled like typed ones.
- **A photo** asks where it goes: today's diary entry, or a receipt — read by the AI (an OpenAI
  connection with vision) and saved as an expense with the photo.
- **A file** (PDF, Excel, CSV, text) goes to the assistant — send a bank statement and its
  transactions land in finance. Files can be attached in the AI chat of the dashboard too.

## Configuration

See [`.env.example`](../.env.example). The most important variables:

| Variable             | Description                                           |
| -------------------- | ----------------------------------------------------- |
| `DATABASE_URL`       | PostgreSQL connection string                          |
| `JWT_SECRET`         | Secret for sign-in tokens, at least 32 characters     |
| `ENCRYPTION_KEY`     | Key for integration tokens in the DB — do not lose it |
| `APP_TIMEZONE`       | Time zone of daily jobs, e.g. `Europe/Berlin`         |
| `ALLOW_REGISTRATION` | `true` to let other people sign up (off by default)   |
| `DEFAULT_LOCALE`     | Language of the first user: `en` or `ru`              |
| `PUBLIC_URL`         | Public address of the dashboard (OAuth callbacks)     |
