// Client Credentials token cache (shared app token, no per-user OAuth needed)
let _clientToken = null;
let _clientTokenExpiry = 0;

async function getClientToken() {
    if (_clientToken && Date.now() < _clientTokenExpiry) return _clientToken;

    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new Error('SPOTIFY_CREDENTIALS_MISSING');

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const res = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
            Authorization: `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
    });
    if (!res.ok) throw new Error(`Spotify token fetch failed: ${res.status}`);
    const data = await res.json();
    _clientToken = data.access_token;
    _clientTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return _clientToken;
}

function extractSpotifyUserId(input) {
    input = (input ?? '').trim();
    // Handle full URL: https://open.spotify.com/user/USERNAME
    const match = input.match(/open\.spotify\.com\/user\/([^?/\s]+)/);
    if (match) return match[1];
    // Handle plain username/id (no slashes or dots that would indicate a URL)
    if (input && !input.includes('/') && !input.startsWith('http')) return input;
    return null;
}

async function getSpotifyUserById(spotifyUserId) {
    const token = await getClientToken();
    const res = await fetch(`https://api.spotify.com/v1/users/${encodeURIComponent(spotifyUserId)}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 404) throw new Error('SPOTIFY_USER_NOT_FOUND');
    if (!res.ok) throw new Error(`SPOTIFY_API_ERROR:${res.status}`);
    return res.json();
}

async function getSpotifyPlaylistsByUserId(spotifyUserId, limit = 10, offset = 0) {
    const token = await getClientToken();
    const res = await fetch(
        `https://api.spotify.com/v1/users/${encodeURIComponent(spotifyUserId)}/playlists?limit=${limit}&offset=${offset}`,
        { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) throw new Error(`SPOTIFY_API_ERROR:${res.status}`);
    return res.json();
}

module.exports = { extractSpotifyUserId, getSpotifyUserById, getSpotifyPlaylistsByUserId };
