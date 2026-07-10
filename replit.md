# AeroX Music Bot

A Discord music bot with Lavalink-powered audio streaming, 41 slash commands, SQLite persistence, and Genius lyrics integration.

## Run & Operate

- `pnpm --filter @workspace/aerox-bot run dev` — start the bot (configured as the default workflow)
- `pnpm install` — install all workspace dependencies

## Required Secrets

| Secret | Description |
|--------|-------------|
| `BOT_TOKEN` | Discord bot token (Developer Portal → Bot → Token) |
| `CLIENT_ID` | Discord application ID (Developer Portal → General Information) |
| `OWNER_ID` | Your Discord user ID (bot owner) |
| `LAVALINK_HOSTS` | Lavalink server hostname(s), comma-separated if multiple |
| `LAVALINK_PORTS` | Lavalink port(s), matching order with HOSTS |
| `LAVALINK_PASSWORDS` | Lavalink password(s), matching order with HOSTS |
| `LAVALINK_SECURES` | `true`/`false` per node for WSS/HTTPS |
| `GENIUS_API_KEY` | Optional — Genius API key for lyrics commands |

## Stack

- Node.js 20, pnpm workspaces
- Discord.js v14
- Poru (Lavalink v4 client)
- SQLite via better-sqlite3 + Sequelize
- Genius Lyrics API

## Where things live

- `artifacts/aerox-bot/` — main bot source
- `artifacts/aerox-bot/config.js` — reads all env vars/secrets
- `artifacts/aerox-bot/commands/` — slash commands
- `artifacts/aerox-bot/music/` — music player logic
- `artifacts/aerox-bot/database/` — SQLite models

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Lavalink server must be running and reachable before starting the bot; the connection attempt happens at startup.
- `LAVALINK_HOSTS/PORTS/PASSWORDS/SECURES` are comma-separated strings — order must match across all four variables.
- 6 application emojis (ax_music, ax_error, etc.) fail to auto-register because the asset files are missing — cosmetic only, bot works fine without them.
