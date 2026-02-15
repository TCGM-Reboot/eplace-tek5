export type PixelUpdate = { x: number; y: number; colorId: number };

export const BOARD_W = 200;
export const BOARD_H = 200;

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

const painted = new Map<string, number>();

export function setPixel(u: PixelUpdate) {
  const key = `${u.x},${u.y}`;
  painted.set(key, u.colorId);
}

export function getSnapshotUpdates(): PixelUpdate[] {
  const out: PixelUpdate[] = [];
  for (const [key, colorId] of painted.entries()) {
    const [xs, ys] = key.split(",");
    out.push({ x: Number(xs), y: Number(ys), colorId });
  }
  return out;
}
