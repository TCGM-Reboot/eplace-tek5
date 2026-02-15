import { BOARD_H, BOARD_W, CHUNK_SIZE, getAllUpdates, getChunkUpdates, isAuthed, mockUser, setAuthed, setPixel} from "./mockBackend";
import { broadcast } from "./ws";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function enableFetchMock() {
  const realFetch = window.fetch.bind(window);
    let nextAllowedAt = 0;
    const COOLDOWN_MS = 3000;

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    const method = (init?.method || "GET").toUpperCase();

    const path = url.startsWith("http") ? new URL(url).pathname : url;

    if (path === "/api/me" && method === "GET") {
      if (!isAuthed()) return new Response(null, { status: 401 });
      return json(mockUser, 200);
    }

    if (path === "/api/logout" && method === "POST") {
      setAuthed(false);
      return new Response(null, { status: 204 });
    }

    if (path === "/api/canvas/meta" && method === "GET") {
        return json({ w: BOARD_W, h: BOARD_H, chunkSize: CHUNK_SIZE }, 200);
    }

    if (path === "/api/canvas/meta" && method === "GET") {
        return json({ w: BOARD_W, h: BOARD_H, chunkSize: CHUNK_SIZE }, 200);
    }

    if (path.startsWith("/api/canvas/chunk") && method === "GET") {
        const u = url.startsWith("http") ? new URL(url) : new URL(url, window.location.origin);
        const cx = Number(u.searchParams.get("cx"));
        const cy = Number(u.searchParams.get("cy"));
        if (!Number.isFinite(cx) || !Number.isFinite(cy) || cx < 0 || cy < 0) {
            return new Response(null, { status: 400 });
        }
        return json({ cx, cy, size: CHUNK_SIZE, updates: getChunkUpdates(cx, cy) }, 200);
    }

    if (path === "/api/pixel" && method === "POST") {
      if (!isAuthed()) return new Response(null, { status: 401 });

      const bodyText = init?.body ? String(init.body) : "{}";
      let body: any = {};
      try {
        body = JSON.parse(bodyText);
      } catch {
        return new Response(null, { status: 400 });
      }

      const { x, y, colorId } = body ?? {};
      const ok =
        Number.isFinite(x) &&
        Number.isFinite(y) &&
        Number.isFinite(colorId) &&
        x >= 0 &&
        y >= 0 &&
        x < BOARD_W &&
        y < BOARD_H;

      if (!ok) return new Response(null, { status: 400 });

      const now = Date.now();
      if (now < nextAllowedAt) return new Response(null, { status: 429 });
      nextAllowedAt = now + COOLDOWN_MS;

      setPixel({ x, y, colorId });

      broadcast({ type: "pixel", x, y, colorId });

      return new Response(null, { status: 204 });
    }

    return realFetch(input, init);
  };

  console.log("[MOCK] fetch mock enabled");
}
