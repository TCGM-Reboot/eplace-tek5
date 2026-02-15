export type PixelUpdate = { x: number; y: number; colorId: number };

export const CHUNK_SIZE = 64;
export const BOARD_W = 1024;
export const BOARD_H = 1024;

export const mockUser = {
  id: "u_123",
  username: "MockUser",
  avatarUrl: "",
};

export function isAuthed() {
  return localStorage.getItem("mock_authed") === "1";
}
export function setAuthed(v: boolean) {
  if (v) localStorage.setItem("mock_authed", "1");
  else localStorage.removeItem("mock_authed");
}

type ChunkKey = string;
type ChunkMap = Map<string, number>;

const chunks = new Map<ChunkKey, ChunkMap>();

function chunkKey(cx: number, cy: number) {
  return `${cx},${cy}`;
}
function pixelKey(x: number, y: number) {
  return `${x},${y}`;
}

export function setPixel(u: PixelUpdate) {
  const cx = Math.floor(u.x / CHUNK_SIZE);
  const cy = Math.floor(u.y / CHUNK_SIZE);
  const key = chunkKey(cx, cy);

  let c = chunks.get(key);
  if (!c) {
    c = new Map<string, number>();
    chunks.set(key, c);
  }
  c.set(pixelKey(u.x, u.y), u.colorId);
}

export function getChunkUpdates(cx: number, cy: number): PixelUpdate[] {
  const key = chunkKey(cx, cy);
  const c = chunks.get(key);
  if (!c) return [];

  const out: PixelUpdate[] = [];
  for (const [k, colorId] of c.entries()) {
    const [xs, ys] = k.split(",");
    out.push({ x: Number(xs), y: Number(ys), colorId });
  }
  return out;
}

export function getAllUpdates(): PixelUpdate[] {
  const out: PixelUpdate[] = [];
  for (const c of chunks.values()) {
    for (const [k, colorId] of c.entries()) {
      const [xs, ys] = k.split(",");
      out.push({ x: Number(xs), y: Number(ys), colorId });
    }
  }
  return out;
}
const DEBUG_FILL_CHUNKS = false;

if (DEBUG_FILL_CHUNKS) {
  const maxCx = BOARD_W / CHUNK_SIZE;
  const maxCy = BOARD_H / CHUNK_SIZE;

  for (let cy = 0; cy < maxCy; cy++) {
    for (let cx = 0; cx < maxCx; cx++) {
      const baseX = cx * CHUNK_SIZE;
      const baseY = cy * CHUNK_SIZE;

      const colorId = ((cx + cy) % 7) + 1;

      setPixel({ x: baseX + 2, y: baseY + 2, colorId });
      setPixel({ x: baseX + 6, y: baseY + 6, colorId });
      setPixel({ x: baseX + 10, y: baseY + 10, colorId });
    }
  }
}
