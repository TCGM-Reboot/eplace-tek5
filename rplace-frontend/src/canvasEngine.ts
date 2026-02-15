export type PixelUpdate = { x: number; y: number; colorId: number };

export const PALETTE: string[] = [
  "#000000",
  "#FFFFFF",
  "#FF0000",
  "#00FF00",
  "#0000FF",
  "#FFFF00",
  "#FF00FF",
  "#00FFFF",
];

export class CanvasEngine {
  private ctx: CanvasRenderingContext2D;
  private dpr: number;

  readonly boardW: number;
  readonly boardH: number;
  private pixels: Uint8Array;

  zoom = 10; 
  offsetX = 0;
  offsetY = 0;

  private isPanning = false;
  private lastPanX = 0;
  private lastPanY = 0;

  private pending: PixelUpdate[] = [];
  private rafId: number | null = null;

  hoverX: number | null = null;
  hoverY: number | null = null;

  constructor(ctx: CanvasRenderingContext2D, boardW: number, boardH: number) {
    this.ctx = ctx;
    this.boardW = boardW;
    this.boardH = boardH;
    this.pixels = new Uint8Array(boardW * boardH);
    this.dpr = window.devicePixelRatio || 1;
  }

  resizeCanvasToDisplaySize(canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    const w = Math.round(rect.width * this.dpr);
    const h = Math.round(rect.height * this.dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawFull();
  }

  screenToBoard(clientX: number, clientY: number, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;

    const bx = Math.floor((sx - this.offsetX) / this.zoom);
    const by = Math.floor((sy - this.offsetY) / this.zoom);

    return { bx, by };
  }
drawHover() {
  if (this.hoverX == null || this.hoverY == null) return;
  if (!this.inBounds(this.hoverX, this.hoverY)) return;

  const sx = this.offsetX + this.hoverX * this.zoom;
  const sy = this.offsetY + this.hoverY * this.zoom;

  this.ctx.save();
  this.ctx.strokeStyle = "#000000";
  this.ctx.lineWidth = Math.max(1, Math.floor(this.zoom / 10));
  this.ctx.strokeRect(sx + 0.5, sy + 0.5, this.zoom - 1, this.zoom - 1);
  this.ctx.restore();
}

  inBounds(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.boardW && y < this.boardH;
  }

  setPixel(x: number, y: number, colorId: number) {
    if (!this.inBounds(x, y)) return;
    this.pixels[y * this.boardW + x] = colorId;
  }

  applyBatch(updates: PixelUpdate[]) {
    this.pending.push(...updates);
    if (this.rafId == null) {
      this.rafId = requestAnimationFrame(() => {
        this.rafId = null;
        this.flushPending();
      });
    }
  }

  private flushPending() {
    if (this.pending.length === 0) return;
    const updates = this.pending;
    this.pending = [];

    for (const u of updates) {
      this.setPixel(u.x, u.y, u.colorId);
      this.drawPixel(u.x, u.y);
    }
    this.drawHover();
  }

  drawFull() {
  const canvas = this.ctx.canvas;
  this.ctx.clearRect(0, 0, canvas.width / this.dpr, canvas.height / this.dpr);

  this.ctx.fillStyle = "#000";
  this.ctx.fillRect(0, 0, canvas.width / this.dpr, canvas.height / this.dpr);

  this.drawHover();
}

drawVisible(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  const viewW = rect.width;
  const viewH = rect.height;

  this.ctx.clearRect(0, 0, viewW, viewH);
  this.ctx.fillStyle = "#000";
  this.ctx.fillRect(0, 0, viewW, viewH);

  const x0 = Math.floor((-this.offsetX) / this.zoom);
  const y0 = Math.floor((-this.offsetY) / this.zoom);
  const x1 = Math.ceil((viewW - this.offsetX) / this.zoom);
  const y1 = Math.ceil((viewH - this.offsetY) / this.zoom);

  const bx0 = Math.max(0, x0);
  const by0 = Math.max(0, y0);
  const bx1 = Math.min(this.boardW - 1, x1);
  const by1 = Math.min(this.boardH - 1, y1);

  for (let y = by0; y <= by1; y++) {
    for (let x = bx0; x <= bx1; x++) {
      const colorId = this.pixels[y * this.boardW + x];
      if (colorId === 0) continue;
      this.drawPixel(x, y);
    }
  }

  this.drawHover();
}
setPixelValue(x: number, y: number, colorId: number) {
  if (!this.inBounds(x, y)) return;
  this.pixels[y * this.boardW + x] = colorId;
}

  drawPixel(x: number, y: number) {
    const colorId = this.pixels[y * this.boardW + x] ?? 0;
    const color = PALETTE[colorId] ?? PALETTE[0];

    const sx = this.offsetX + x * this.zoom;
    const sy = this.offsetY + y * this.zoom;

    if (this.zoom <= 0) return;

    this.ctx.fillStyle = color;
    this.ctx.fillRect(sx, sy, this.zoom, this.zoom);
  }

  onWheel(e: WheelEvent, canvas: HTMLCanvasElement) {
    e.preventDefault();

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const before = {
      bx: (mx - this.offsetX) / this.zoom,
      by: (my - this.offsetY) / this.zoom,
    };

    const delta = Math.sign(e.deltaY);
    const newZoom = Math.min(60, Math.max(2, this.zoom - delta));
    this.zoom = newZoom;

    const after = {
      sx: mx - before.bx * this.zoom,
      sy: my - before.by * this.zoom,
    };

    this.offsetX = after.sx;
    this.offsetY = after.sy;

    this.drawFull();
  }

  onPointerDown(e: PointerEvent) {
    if (e.button === 2) {
      this.isPanning = true;
      this.lastPanX = e.clientX;
      this.lastPanY = e.clientY;
    }
  }

  onPointerMove(e: PointerEvent) {
    if (!this.isPanning) return;
    const dx = e.clientX - this.lastPanX;
    const dy = e.clientY - this.lastPanY;
    this.lastPanX = e.clientX;
    this.lastPanY = e.clientY;

    this.offsetX += dx;
    this.offsetY += dy;
    this.drawFull();
  }

  onPointerUp() {
    this.isPanning = false;
  }
}
