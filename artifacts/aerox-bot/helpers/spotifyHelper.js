let cachedToken = null;
let tokenExpiry = 0;

async function getSpotifyToken() {
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        throw new Error('SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET environment variables are not set.');
    }

    if (cachedToken && Date.now() < tokenExpiry) {
        return cachedToken;
    }

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
            Authorization: `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
    });

    if (!response.ok) {
        throw new Error(`Spotify auth failed: ${response.status}`);
    }

    const data = await response.json();
    cachedToken = data.access_token;
    tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return cachedToken;
}

async function getSpotifyUser(spotifyUserId) {
    const token = await getSpotifyToken();
    const response = await fetch(`https://api.spotify.com/v1/users/${encodeURIComponent(spotifyUserId)}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`Failed to fetch Spotify user: ${response.status}`);
    return response.json();
}

async function getSpotifyPlaylists(spotifyUserId, limit = 10, offset = 0) {
    const token = await getSpotifyToken();
    const response = await fetch(
        `https://api.spotify.com/v1/users/${encodeURIComponent(spotifyUserId)}/playlists?limit=${limit}&offset=${offset}`,
        { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!response.ok) throw new Error(`Failed to fetch playlists: ${response.status}`);
    return response.json();
}

function extractSpotifyUserId(url) {
    try {
        const match = url.match(/open\.spotify\.com\/user\/([^?/]+)/);
        return match ? match[1] : null;
    } catch {
        return null;
    }
}

module.exports = { getSpotifyUser, getSpotifyPlaylists, extractSpotifyUserId };
