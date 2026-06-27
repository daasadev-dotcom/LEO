const { randomUUID } = require('crypto');

function getRedirectUri() {
    const domain = (process.env.REPLIT_DOMAINS?.split(',')[0] ?? process.env.REPLIT_DEV_DOMAIN ?? '').trim();
    return `https://${domain}/api/spotify/callback`;
}

function buildAuthUrl(state) {
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const redirectUri = getRedirectUri();
    const scopes = 'user-read-private playlist-read-private playlist-read-collaborative';
    const params = new URLSearchParams({
        client_id: clientId,
        response_type: 'code',
        redirect_uri: redirectUri,
        scope: scopes,
        state,
    });
    return { url: `https://accounts.spotify.com/authorize?${params}`, redirectUri };
}

function generateState() {
    return randomUUID();
}

async function refreshAccessToken(profile) {
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

    const SpotifyProfile = require('../database/models/SpotifyProfile');
    await SpotifyProfile.update(
        { accessToken: data.access_token, tokenExpiry: newExpiry },
        { where: { userId: profile.userId } }
    );

    return data.access_token;
}

async function getOAuthToken(userId) {
    const SpotifyProfile = require('../database/models/SpotifyProfile');
    const profile = await SpotifyProfile.findOne({ where: { userId } });

    if (!profile?.accessToken) throw new Error('SPOTIFY_NOT_LINKED');

    if (Date.now() < Number(profile.tokenExpiry)) {
        return profile.accessToken;
    }

    return refreshAccessToken(profile);
}

async function getSpotifyUser(userId) {
    const token = await getOAuthToken(userId);
    const res = await fetch('https://api.spotify.com/v1/me', {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`SPOTIFY_API_ERROR:${res.status}`);
    return res.json();
}

async function getSpotifyPlaylists(userId, limit = 10, offset = 0) {
    const token = await getOAuthToken(userId);
    const res = await fetch(
        `https://api.spotify.com/v1/me/playlists?limit=${limit}&offset=${offset}`,
        { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) throw new Error(`SPOTIFY_API_ERROR:${res.status}`);
    return res.json();
}

function extractPlaylistId(url) {
    try {
        const match = url.match(/open\.spotify\.com\/playlist\/([a-zA-Z0-9]+)/);
        return match ? match[1] : null;
    } catch {
        return null;
    }
}

module.exports = { buildAuthUrl, generateState, getOAuthToken, getSpotifyUser, getSpotifyPlaylists, extractPlaylistId };
