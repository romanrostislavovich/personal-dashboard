# Roadmap

## ✅ Foundation

- Nx monorepo: Angular + NestJS + Electron, zod contracts, module boundaries enforced by ESLint
- PostgreSQL + Drizzle with automatic migrations, pg-boss for background jobs
- JWT auth, optional registration, profile and password change
- Telegram notifications and bot commands
- Desktop app (tray, autostart, server selection), a single Docker image, CI
- English and Russian for the UI, notifications, achievements and AI answers

## ✅ Modules

- **Birthdays** with reminders
- **Finance:** wallets (personal / per project), recurring payments, automatic cost import from
  Hetzner Cloud and DeepSeek
- **Open Source:** GitHub stars history, issues, PRs, releases, npm downloads, alerts
- **Monitoring:** uptime every 5 minutes, response time, SSL expiry, down / up alerts
- **Diary:** markdown, mood, hashtags, streaks, `/d` from Telegram, evening reminder
- **Music:** Last.fm history and tops, Spotify “now playing”
- **Games:** Dota 2 (OpenDota) and World of Warcraft (Battle.net)
- **Achievements:** 42 achievements across all modules
- **AI:** chat over your data (DeepSeek / OpenAI / Ollama / any OpenAI-compatible API),
  `/ask` in Telegram, morning digest, weekly diary summary

## Next

- Production projects: errors (Sentry), traffic (Plausible / Umami / Google Analytics),
  Stripe payouts as project income, a monthly report per project
- More cost providers: DigitalOcean, AWS Cost Explorer, Vercel, OpenAI and Anthropic usage
- GitHub repository traffic (views / clones), npm downloads history
- Notification settings: which module sends what and where
- Channels: Discord, e-mail, web push, native desktop notifications
- AI: native Anthropic API, streaming answers, saved conversations
- Roles and sharing for multi-user setups
- A module generator and more language translations
