import { Server, type Client } from "mock-socket";

let server: Server | null = null;
const clients = new Set<Client>();

export function ensureMockWs(url: string) {
  if (server) return server;

  server = new Server(url);

  server.on("connection", (socket: Client) => {
    clients.add(socket);
    socket.on("close", () => clients.delete(socket));
  });

  return server;
}

export function broadcast(obj: unknown) {
  const msg = JSON.stringify(obj);
  for (const c of clients) c.send(msg);
}
