export interface SpotifyConnectionCheck {
  profileOk: boolean;
  playlistsOk: boolean;
  displayName: string | null;
  profileError: string | null;
  playlistsError: string | null;
}

export async function checkSpotifyConnection(accessToken: string): Promise<SpotifyConnectionCheck> {
  const result: SpotifyConnectionCheck = {
    profileOk: false,
    playlistsOk: false,
    displayName: null,
    profileError: null,
    playlistsError: null,
  };

  try {
    const meRes = await fetch("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!meRes.ok) {
      const body = (await meRes.json().catch(() => ({}))) as { error?: { message?: string } };
      result.profileError = body.error?.message || `HTTP ${meRes.status}`;
    } else {
      const me = (await meRes.json()) as { display_name?: string };
      result.profileOk = true;
      result.displayName = me.display_name || null;
    }
  } catch (err) {
    result.profileError = (err as Error).message;
  }

  try {
    const listRes = await fetch("https://api.spotify.com/v1/me/playlists?limit=1", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!listRes.ok) {
      const body = (await listRes.json().catch(() => ({}))) as { error?: { message?: string } };
      result.playlistsError = body.error?.message || `HTTP ${listRes.status}`;
    } else {
      result.playlistsOk = true;
    }
  } catch (err) {
    result.playlistsError = (err as Error).message;
  }

  return result;
}

export const SPOTIFY_DEV_MODE_TROUBLESHOOTING = [
  "The Spotify Developer app owner must have an active Spotify Premium subscription (required since Feb 2026).",
  "In the Developer Dashboard → Settings → Users and Access, add the exact email from your Spotify account settings (not necessarily your Google/Facebook login).",
  "Connect with that same Spotify account here, then Disconnect and Connect again after changing the allowlist.",
  "Development Mode allows up to 5 users total. Everyone else will get 403 errors.",
  "Paste a playlist URL you own or collaborate on — public playlists you don't own cannot be imported in Dev Mode.",
];
