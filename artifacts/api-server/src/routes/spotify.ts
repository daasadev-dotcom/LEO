import { Router, type Request, type Response } from "express";

const router = Router();

const BOT_INTERNAL = "http://127.0.0.1:3939";

function successHtml(name: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Spotify Connected</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #1DB954; display: flex; align-items: center; justify-content: center;
           height: 100vh; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .card { background: rgba(0,0,0,.25); border-radius: 16px; padding: 48px 40px;
            text-align: center; color: #fff; max-width: 420px; }
    .icon { font-size: 64px; margin-bottom: 16px; }
    h1 { font-size: 28px; margin-bottom: 12px; }
    p { font-size: 15px; line-height: 1.6; opacity: .9; }
    .tag { display: inline-block; margin-top: 20px; background: rgba(255,255,255,.15);
           border-radius: 8px; padding: 10px 18px; font-size: 14px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">🎵</div>
    <h1>Connected!</h1>
    <p>Welcome, <strong>${name}</strong>!<br>You can close this tab.</p>
    <div class="tag">Go back to Discord and click <strong>✅ I've Authorized</strong></div>
  </div>
</body>
</html>`;
}

function errorHtml(msg: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Error</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #e74c3c; display: flex; align-items: center; justify-content: center;
           height: 100vh; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .card { background: rgba(0,0,0,.25); border-radius: 16px; padding: 48px 40px;
            text-align: center; color: #fff; max-width: 420px; }
    .icon { font-size: 64px; margin-bottom: 16px; }
    h1 { font-size: 24px; margin-bottom: 12px; }
    p { font-size: 15px; line-height: 1.6; opacity: .9; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">❌</div>
    <h1>Something went wrong</h1>
    <p>${msg}</p>
  </div>
</body>
</html>`;
}

router.get("/spotify/callback", async (req: Request, res: Response) => {
  const code = req.query.code as string | undefined;
  const state = req.query.state as string | undefined;
  const error = req.query.error as string | undefined;

  if (error) {
    return res.send(errorHtml("You cancelled the Spotify authorization. Close this tab and try /spotify login again."));
  }

  if (!code || !state) {
    return res.status(400).send(errorHtml("Missing authorization code or state. Please try /spotify login again."));
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(500).send(errorHtml("Bot is not configured with Spotify credentials."));
  }

  try {
    // 1. Validate the state via the bot's internal server
    const stateRes = await fetch(`${BOT_INTERNAL}/spotify/validate-state?state=${encodeURIComponent(state)}`);
    if (!stateRes.ok) {
      return res.send(errorHtml("Auth session expired or not found. Please run /spotify login again in Discord."));
    }
    const stateData = await stateRes.json() as { ok: boolean; userId?: string; error?: string };
    if (!stateData.ok || !stateData.userId) {
      return res.send(errorHtml("Auth session expired or not found. Please run /spotify login again in Discord."));
    }
    const userId = stateData.userId;

    // 2. Exchange code for tokens with Spotify
    const domain = (process.env.REPLIT_DOMAINS?.split(",")[0] ?? process.env.REPLIT_DEV_DOMAIN ?? "").trim();
    const redirectUri = `https://${domain}/api/spotify/callback`;
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }).toString(),
    });

    if (!tokenRes.ok) {
      const body = await tokenRes.text().catch(() => "");
      console.error("[Spotify OAuth] Token exchange failed:", tokenRes.status, body);
      return res.send(errorHtml("Failed to get Spotify access token. Please try again."));
    }

    const tokenData = await tokenRes.json() as { access_token: string; refresh_token: string; expires_in: number };
    const { access_token, refresh_token, expires_in } = tokenData;
    const tokenExpiry = Date.now() + (expires_in - 60) * 1000;

    // 3. Fetch the user's Spotify profile
    let displayName = "Spotify User";
    let imageUrl: string | null = null;
    let spotifyUserId = userId;
    let profileUrl = "https://open.spotify.com";
    let followersCount = 0;

    const profileRes = await fetch("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (profileRes.ok) {
      const p = await profileRes.json() as {
        id: string; display_name?: string; images?: { url: string }[];
        external_urls?: { spotify: string }; followers?: { total: number };
      };
      displayName = p.display_name || p.id || "Spotify User";
      imageUrl = p.images?.[0]?.url ?? null;
      spotifyUserId = p.id ?? userId;
      profileUrl = p.external_urls?.spotify ?? profileUrl;
      followersCount = p.followers?.total ?? 0;
    }

    // 4. Send everything to the bot's internal server to store
    const storeRes = await fetch(`${BOT_INTERNAL}/spotify/store-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, spotifyUserId, displayName, imageUrl, profileUrl, followersCount, accessToken: access_token, refreshToken: refresh_token, tokenExpiry }),
    });

    if (!storeRes.ok) {
      const errData = await storeRes.json().catch(() => ({ error: "unknown" })) as { error?: string };
      console.error("[Spotify OAuth] Bot store failed:", errData.error);
      return res.send(errorHtml("Failed to save your Spotify account. Please try again."));
    }

    res.set("Cache-Control", "no-store");
    return res.send(successHtml(displayName));
  } catch (err) {
    console.error("[Spotify OAuth] Callback error:", err);
    return res.status(500).send(errorHtml("An internal error occurred. Please try again."));
  }
});

export default router;
