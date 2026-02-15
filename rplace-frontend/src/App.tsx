import { useEffect, useMemo, useRef, useState } from "react";
import { apiGetMe, apiLogout, redirectToDiscordLogin } from "./api";
import { CanvasEngine, PALETTE, type PixelUpdate } from "./canvasEngine";
import { connectWS } from "./realtime";

const WS_URL = import.meta.env.VITE_WS_URL as string;
const API_BASE = import.meta.env.VITE_API_BASE as string;

type Me = { id: string; username: string; avatarUrl?: string };

async function postPixel(update: PixelUpdate) {
  const res = await fetch(`${API_BASE}/api/pixel`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(update),
  });

  if (res.status === 401) throw new Error("UNAUTH");
  if (res.status === 429) throw new Error("RATE_LIMIT");
  if (!res.ok) throw new Error(`POST /api/pixel failed: ${res.status}`);
}
async function getSnapshot() {
  const res = await fetch(`/api/canvas/snapshot`, { credentials: "include" });
  if (!res.ok) throw new Error("SNAPSHOT_FAIL");
  return res.json() as Promise<{ w: number; h: number; updates: PixelUpdate[] }>;
}
async function getMeta() {
  const res = await fetch(`/api/canvas/meta`, { credentials: "include" });
  if (!res.ok) throw new Error("META_FAIL");
  return res.json() as Promise<{ w: number; h: number; chunkSize: number }>;
}

async function getChunk(cx: number, cy: number) {
  const res = await fetch(`/api/canvas/chunk?cx=${cx}&cy=${cy}`, { credentials: "include" });
  if (!res.ok) throw new Error("CHUNK_FAIL");
  return res.json() as Promise<{ cx: number; cy: number; size: number; updates: PixelUpdate[] }>;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<CanvasEngine | null>(null);
  const wsRef = useRef<ReturnType<typeof connectWS> | null>(null);
  const loadedChunksRef = useRef<Set<string>>(new Set());
  const chunkSizeRef = useRef<number>(64);
  const boardSizeRef = useRef<{ w: number; h: number }>({ w: 200, h: 200 });
  const MAX_CHUNKS_IN_MEMORY = 120;
  const lruRef = useRef<Map<string, true>>(new Map());
  const chunkPixelsRef = useRef<Map<string, PixelUpdate[]>>(new Map());

  const [me, setMe] = useState<Me | null>(null);
  const [authState, setAuthState] = useState<"loading" | "anon" | "authed">("loading");
  const [wsState, setWsState] = useState<"connected" | "disconnected" | "error">("disconnected");

  const [selectedColorId, setSelectedColorId] = useState(2);
  const [lastClick, setLastClick] = useState<{ x: number; y: number } | null>(null);
  const [msg, setMsg] = useState<string>("");
function lruTouch(key: string) {
  const lru = lruRef.current;
  if (lru.has(key)) lru.delete(key);
  lru.set(key, true);
}

function evictIfNeeded(engine: CanvasEngine, canvas: HTMLCanvasElement) {
  const lru = lruRef.current;

  while (lru.size > MAX_CHUNKS_IN_MEMORY) {
    const oldestKey = lru.keys().next().value as string;
    lru.delete(oldestKey);

    loadedChunksRef.current.delete(oldestKey);

    const pixels = chunkPixelsRef.current.get(oldestKey);
    if (pixels) {
      for (const p of pixels) {
        engine.setPixelValue(p.x, p.y, 0);
      }
      chunkPixelsRef.current.delete(oldestKey);

      engine.drawVisible(canvas);
    }
  }
}
  useEffect(() => {
    (async () => {
      try {
        const u = await apiGetMe();
        setMe(u);
        setAuthState("authed");
      } catch {
        setAuthState("anon");
      }
    })();
  }, []);

  useEffect(() => {
  const canvas = canvasRef.current;
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  let destroyed = false;

  const setup = async () => {
    const meta = await getMeta();
    if (destroyed) return;

    boardSizeRef.current = { w: meta.w, h: meta.h };
    chunkSizeRef.current = meta.chunkSize;

    loadedChunksRef.current = new Set();

    const engine = new CanvasEngine(ctx, meta.w, meta.h);
    engineRef.current = engine;

    const resize = () => engine.resizeCanvasToDisplaySize(canvas);

    let debounceTimer: number | null = null;

    const scheduleEnsureVisibleChunks = () => {
      if (debounceTimer) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        ensureVisibleChunks().catch(() => {});
      }, 60);
    };

    const ensureVisibleChunks = async () => {
      const eng = engineRef.current;
      if (!eng) return;

      const rect = canvas.getBoundingClientRect();
      const viewW = rect.width;
      const viewH = rect.height;

      const cs = chunkSizeRef.current;

      const x0 = Math.floor((-eng.offsetX) / eng.zoom);
      const y0 = Math.floor((-eng.offsetY) / eng.zoom);
      const x1 = Math.ceil((viewW - eng.offsetX) / eng.zoom);
      const y1 = Math.ceil((viewH - eng.offsetY) / eng.zoom);

      const bx0 = Math.max(0, x0);
      const by0 = Math.max(0, y0);
      const bx1 = Math.min(eng.boardW - 1, x1);
      const by1 = Math.min(eng.boardH - 1, y1);

      const cx0 = Math.floor(bx0 / cs);
      const cy0 = Math.floor(by0 / cs);
      const cx1 = Math.floor(bx1 / cs);
      const cy1 = Math.floor(by1 / cs);

      const promises: Promise<void>[] = [];

      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          const key = `${cx},${cy}`;
          if (loadedChunksRef.current.has(key)) continue;
          if (loadedChunksRef.current.has(key)) {
            lruTouch(key);
            continue;
          }
          loadedChunksRef.current.add(key);
          lruTouch(key);

          promises.push(
            getChunk(cx, cy)
              .then((chunk) => {
                chunkPixelsRef.current.set(key, chunk.updates || []);
                if (chunk.updates?.length) engine.applyBatch(chunk.updates);

                evictIfNeeded(engine, canvas);
              })
              .catch(() => {
                loadedChunksRef.current.delete(key);
                lruRef.current.delete(key);
              })
          );
        }
      }

      
      if (promises.length) await Promise.all(promises);
    };

    resize();
    engine.drawVisible(canvas);
    await ensureVisibleChunks();

    window.addEventListener("resize", async () => {
      resize();
      engine.drawVisible(canvas);
      scheduleEnsureVisibleChunks();
    });

    const preventCtx = (e: Event) => e.preventDefault();
    canvas.addEventListener("contextmenu", preventCtx);

    const wheel = async (e: WheelEvent) => {
      engine.onWheel(e, canvas);
      engine.drawVisible(canvas);
      scheduleEnsureVisibleChunks();
    };
    canvas.addEventListener("wheel", wheel as any, { passive: false });

    const down = (e: PointerEvent) => engine.onPointerDown(e);
    const move = async (e: PointerEvent) => {
      engine.onPointerMove(e);
      engine.drawVisible(canvas);
      scheduleEnsureVisibleChunks();
    };
    const up = () => engine.onPointerUp();

    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move as any);
    window.addEventListener("pointerup", up);

    return () => {
      window.removeEventListener("resize", resize as any);
      canvas.removeEventListener("contextmenu", preventCtx);
      canvas.removeEventListener("wheel", wheel as any);
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move as any);
      window.removeEventListener("pointerup", up);
      if (debounceTimer) window.clearTimeout(debounceTimer)
    };
  };

  let cleanup: null | (() => void) = null;

  setup()
    .then((c) => {
      cleanup = (c as any) ?? null;
    })
    .catch((err) => {
      console.error("Canvas setup failed:", err);
    });

  return () => {
    destroyed = true;
    cleanup?.();
  };
}, []);

  useEffect(() => {
    if (authState !== "authed") return;

    wsRef.current?.close();
    wsRef.current = connectWS(
      WS_URL,
      (updates) => engineRef.current?.applyBatch(updates),
      (st) => setWsState(st)
    );

    return () => wsRef.current?.close();
  }, [authState]);

  const onCanvasClick = async (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const engine = engineRef.current;
    if (!canvas || !engine) return;

    const { bx, by } = engine.screenToBoard(e.clientX, e.clientY, canvas);
    if (!engine.inBounds(bx, by)) return;

    setLastClick({ x: bx, y: by });
    setMsg("");

    try {
      await postPixel({ x: bx, y: by, colorId: selectedColorId });
    } catch (err: any) {
      if (err?.message === "UNAUTH") {
        setMsg("Session expirée, reconnecte-toi.");
        setAuthState("anon");
        setMe(null);
      } else if (err?.message === "RATE_LIMIT") {
        setMsg("Cooldown (rate limit). Réessaie dans quelques secondes.");
      } else {
        setMsg("Erreur en envoyant le pixel.");
      }
    }
  };

  const logout = async () => {
    try {
      await apiLogout();
    } finally {
      setMe(null);
      setAuthState("anon");
    }
  };

  return (
    <div style={{ fontFamily: "system-ui", padding: 16, display: "grid", gap: 12 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>RPlace Front</div>
          <div style={{ opacity: 0.7, fontSize: 12 }}>
            API: {API_BASE} • WS: {WS_URL} • WS status: {wsState}
          </div>
        </div>

        {authState === "loading" ? (
          <div>Chargement…</div>
        ) : authState === "anon" ? (
          <button onClick={redirectToDiscordLogin} style={{ padding: "8px 12px" }}>
            Login Discord
          </button>
        ) : (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ opacity: 0.85 }}>Connecté: {me?.username}</span>
            <button onClick={logout} style={{ padding: "8px 12px" }}>
              Logout
            </button>
          </div>
        )}
      </header>

      <section style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ fontWeight: 700 }}>Palette</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 32px)", gap: 8 }}>
            {PALETTE.map((c, idx) => (
              <button
                key={idx}
                onClick={() => setSelectedColorId(idx)}
                title={`colorId=${idx}`}
                style={{
                  width: 32,
                  height: 32,
                  background: c,
                  border: idx === selectedColorId ? "3px solid #333" : "1px solid #999",
                  cursor: "pointer",
                }}
              />
            ))}
          </div>

          <div style={{ fontSize: 12, opacity: 0.8 }}>
            Click gauche: placer un pixel • Click droit: pan • Molette: zoom
          </div>

          {lastClick && (
            <div style={{ fontSize: 12 }}>
              Dernier click: x={lastClick.x}, y={lastClick.y}, colorId={selectedColorId}
            </div>
          )}

          {msg && <div style={{ fontSize: 12, color: "crimson" }}>{msg}</div>}
        </div>

        <div style={{ flex: 1 }}>
          <canvas
            ref={canvasRef}
            onClick={onCanvasClick}
            onMouseMove={(e) => {
              const canvas = canvasRef.current;
              const engine = engineRef.current;
              if (!canvas || !engine) return;

              const { bx, by } = engine.screenToBoard(e.clientX, e.clientY, canvas);
              engine.hoverX = bx;
              engine.hoverY = by;
              //engine.drawFull();
            }}
            style={{
              width: "100%",
              height: "70vh",
              border: "1px solid #ccc",
              borderRadius: 8,
              display: "block",
            }}
          />
        </div>
      </section>
    </div>
  );
}
