import { setAuthed } from "./mockBackend";

export function handleMockDiscordSSO(): boolean {
  const path = window.location.pathname;

  if (path === "/auth/discord/login") {
    window.location.replace("/auth/discord/callback?code=mock_code&state=mock_state");
    return true;
  }

  if (path === "/auth/discord/callback") {
    setAuthed(true);
    window.location.replace("/");
    return true;
  }

  return false;
}
