const { randomUUID } = require('crypto');

// ── Client Credentials token (app-level) ──────────────────────────────────
let _clientToken = null;
let _clientTokenExpiry = 0;

async function getClientToken() {
    if (_clientToken && Date.now() < _clientTokenExpiry) return _clientToken;

    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const res = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
            Authorization: `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
    });

    if (!res.ok) throw new Error(`Client token failed: ${res.status}`);
    const data = await res.json();
    _clientToken = data.access_token;
    _clientTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return _clientToken;
}

// ── OAuth token for a specific Discord user (refreshes if needed) ─────────
async function getOAuthToken(discordUserId) {
    const SpotifyProfile = require('../database/models/SpotifyProfile');
    const profile = await SpotifyProfile.findOne({ where: { userId: discordUserId } });
    if (!profile?.accessToken) throw new Error('SPOTIFY_NOT_LINKED');

    // Still valid
    if (Date.now() < Number(profile.tokenExpiry)) return profile.accessToken;

    // Refresh
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const res = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
            Authorization: `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: profile.refreshToken }).toString(),
    });

    if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);
    const data = await res.json();
    const newExpiry = Date.now() + (data.expires_in - 60) * 1000;

    await SpotifyProfile.update(
        { accessToken: data.access_token, tokenExpiry: newExpiry },
        { where: { userId: discordUserId } }
    );
    return data.access_token;
}

// ── Extract Spotify user ID from URL or raw username ──────────────────────
function extractSpotifyUserId(input) {
    input = (input ?? '').trim();
    const match = input.match(/open\.spotify\.com\/user\/([^?/\s]+)/);
    if (match) return match[1];
    return input || null;
}

// ── Build OAuth authorization URL ─────────────────────────────────────────
function getRedirectUri() {
    const domain = (process.env.REPLIT_DOMAINS?.split(',')[0] ?? process.env.REPLIT_DEV_DOMAIN ?? '').trim();
    return `https://${domain}/api/spotify/callback`;
}

function buildAuthUrl(state) {
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const redirectUri = getRedirectUri();
    const scopes = 'user-read-private user-read-email playlist-read-private playlist-read-collaborative';
    const params = new URLSearchParams({
        client_id: clientId,
        response_type: 'code',
        redirect_uri: redirectUri,
        scope: scopes,
        state,
    });
    return { url: `https://accounts.spotify.com/authorize?${params}`, redirectUri };
}

function generateState() { return randomUUID(); }

// ── Get playlists: uses OAuth if available, falls back to public ───────────
async function getSpotifyPlaylists(discordUserId, limit = 10, offset = 0) {
    const SpotifyProfile = require('../database/models/SpotifyProfile');
    const profile = await SpotifyProfile.findOne({ where: { userId: discordUserId } });
    if (!profile) throw new Error('SPOTIFY_NOT_LINKED');

    if (profile.accessToken) {
        // Full OAuth access → /v1/me/playlists (includes private)
        try {
            const token = await getOAuthToken(discordUserId);
            const res = await fetch(
                `https://api.spotify.com/v1/me/playlists?limit=${limit}&offset=${offset}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            if (res.ok) return res.json();
        } catch {}
    }

    // Fallback: client credentials → public playlists only
    if (profile.spotifyUserId) {
        const token = await getClientToken();
        const res = await fetch(
            `https://api.spotify.com/v1/users/${encodeURIComponent(profile.spotifyUserId)}/playlists?limit=${limit}&offset=${offset}`,
            { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.ok) return res.json();
        throw new Error(`SPOTIFY_API_ERROR:${res.status}`);
    }

    throw new Error('SPOTIFY_NOT_LINKED');
}

// ── Fetch a public user profile (best-effort, may 403) ───────────────────
async function fetchPublicUserProfile(spotifyUserId) {
    const token = await getClientToken();
    const res = await fetch(`https://api.spotify.com/v1/users/${encodeURIComponent(spotifyUserId)}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`SPOTIFY_API_ERROR:${res.status}`);
    return res.json();
}

module.exports = {
    getClientToken,
    getOAuthToken,
    extractSpotifyUserId,
    getRedirectUri,
    buildAuthUrl,
    generateState,
    getSpotifyPlaylists,
    fetchPublicUserProfile,
};
