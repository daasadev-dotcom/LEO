const { randomUUID } = require('crypto');

// ── Client Credentials token (app-level, no user login required) ──────────
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

// ── Extract Spotify user ID from URL or raw username ──────────────────────
function extractSpotifyUserId(input) {
    input = (input ?? '').trim();
    const match = input.match(/open\.spotify\.com\/user\/([^?/\s]+)/);
    if (match) return match[1];
    // If no URL, treat whole input as the user ID (username)
    return input || null;
}

// ── Fetch a user's public profile ─────────────────────────────────────────
async function fetchPublicUserProfile(spotifyUserId) {
    const token = await getClientToken();
    const res = await fetch(`https://api.spotify.com/v1/users/${encodeURIComponent(spotifyUserId)}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`SPOTIFY_API_ERROR:${res.status}`);
    return res.json();
}

// ── Fetch a user's public playlists ───────────────────────────────────────
async function getPublicPlaylists(spotifyUserId, limit = 10, offset = 0) {
    const token = await getClientToken();
    const res = await fetch(
        `https://api.spotify.com/v1/users/${encodeURIComponent(spotifyUserId)}/playlists?limit=${limit}&offset=${offset}`,
        { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) throw new Error(`SPOTIFY_API_ERROR:${res.status}`);
    return res.json();
}

// ── Get public playlists for a Discord user (looks up their spotifyUserId) ─
async function getSpotifyPlaylists(discordUserId, limit = 10, offset = 0) {
    const SpotifyProfile = require('../database/models/SpotifyProfile');
    const profile = await SpotifyProfile.findOne({ where: { userId: discordUserId } });
    if (!profile?.spotifyUserId) throw new Error('SPOTIFY_NOT_LINKED');
    return getPublicPlaylists(profile.spotifyUserId, limit, offset);
}

// ── Legacy OAuth helpers (kept for compatibility, not used in main flow) ───
function getRedirectUri() {
    const domain = (process.env.REPLIT_DOMAINS?.split(',')[0] ?? process.env.REPLIT_DEV_DOMAIN ?? '').trim();
    return `https://${domain}/api/spotify/callback`;
}

function buildAuthUrl(state) {
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const redirectUri = getRedirectUri();
    const scopes = 'user-read-private playlist-read-private playlist-read-collaborative';
    const params = new URLSearchParams({ client_id: clientId, response_type: 'code', redirect_uri: redirectUri, scope: scopes, state });
    return { url: `https://accounts.spotify.com/authorize?${params}`, redirectUri };
}

function generateState() { return randomUUID(); }

module.exports = {
    getClientToken,
    extractSpotifyUserId,
    fetchPublicUserProfile,
    getPublicPlaylists,
    getSpotifyPlaylists,
    buildAuthUrl,
    generateState,
    getRedirectUri,
};
