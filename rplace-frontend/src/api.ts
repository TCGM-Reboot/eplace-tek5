export const API_BASE = import.meta.env.VITE_API_BASE as string;

export type Me = {
  id: string;
  username: string;
  avatarUrl?: string;
};

export async function apiGetMe(): Promise<Me> {
  const res = await fetch(`${API_BASE}/api/me`, {
    method: "GET",
    credentials: "include",
  });
  if (res.status === 401) throw new Error("UNAUTH");
  if (!res.ok) throw new Error(`GET /api/me failed: ${res.status}`);
  return res.json();
}

export function redirectToDiscordLogin() {
  const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID as string;
  const redirectUri = encodeURIComponent("http://localhost:5174/auth/discord/callback");
  const scope = encodeURIComponent("identify");
  const state = crypto.randomUUID();

  window.location.href =
    `https://discord.com/oauth2/authorize` +
    `?response_type=code` +
    `&client_id=${clientId}` +
    `&redirect_uri=${redirectUri}` +
    `&scope=${scope}` +
    `&state=${state}`;
}



export async function apiLogout(): Promise<void> {
  const res = await fetch(`${API_BASE}/api/logout`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new Error(`POST /api/logout failed: ${res.status}`);
}
