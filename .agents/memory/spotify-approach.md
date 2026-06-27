---
name: Spotify integration approach
description: How the Spotify login system works in AeroX bot — Client Credentials, not OAuth
---

The Spotify integration uses **Client Credentials** (app-level token), NOT user OAuth.

**Flow:**
1. `/spotify login` → shows "Connect Spotify" card with "Enter Spotify URL" button
2. User clicks button → Discord modal pops up (ModalBuilder/TextInputBuilder)
3. User submits their `https://open.spotify.com/user/ID` URL
4. Bot calls `GET /v1/users/{id}` with Client Credentials token → stores public profile
5. Profile card shown immediately

**Why:** Spotify blocked Client Credentials for `/v1/me` (user profile) in 2024, but public user profiles via `/v1/users/{id}` still work. OAuth was tried but caused redirect URI/callback complexity and 403 errors in development mode.

**How to apply:** Do NOT revert to OAuth. Do not add redirect URI flows. The API server's `/api/spotify/callback` route still exists but is no longer used by the main login flow.

**Key files:**
- `artifacts/aerox-bot/commands/spotify.js` — modal login, profile session
- `artifacts/aerox-bot/helpers/spotifyHelper.js` — getClientToken(), fetchPublicUserProfile(), getPublicPlaylists()
- `artifacts/aerox-bot/database/models/SpotifyProfile.js` — stores spotifyUserId, displayName, imageUrl, profileUrl

**"UNKNOWN" display name** is a valid Spotify display name, not a bug.

**Internal bot HTTP server** (port 3939) still exists in index.js for OAuth fallback but is not used in the main flow.
