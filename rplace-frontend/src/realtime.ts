import type { PixelUpdate } from "./canvasEngine";

export type ServerMsg =
  | { type: "pixel"; x: number; y: number; colorId: number }
  | { type: "batch"; updates: PixelUpdate[] };

export function connectWS(
  wsUrl: string,
  onUpdates: (updates: PixelUpdate[]) => void,
  onStatus?: (status: "connected" | "disconnected" | "error") => void
) {
  let ws: WebSocket | null = null;
  let closedByUser = false;
  let retry = 0;

  const open = () => {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      retry = 0;
      onStatus?.("connected");
    };

    ws.onclose = () => {
      onStatus?.("disconnected");
      if (!closedByUser) scheduleReconnect();
    };

    ws.onerror = () => {
      onStatus?.("error");
      // close triggers reconnect
      ws?.close();
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as ServerMsg;
        if (msg.type === "pixel") {
          onUpdates([{ x: msg.x, y: msg.y, colorId: msg.colorId }]);
        } else if (msg.type === "batch") {
          onUpdates(msg.updates);
        }
      } catch {
        // ignore malformed messages
      }
    };
  };

  const scheduleReconnect = () => {
    retry += 1;
    const ms = Math.min(5000, 300 * retry);
    window.setTimeout(() => open(), ms);
  };

  open();

  return {
    close: () => {
      closedByUser = true;
      ws?.close();
    },
    send: (obj: unknown) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(obj));
      }
    },
  };
}
