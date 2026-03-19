// server.ts
import type { ServerWebSocket } from "bun";

// Define what "data" lives inside the socket
interface SocketData {
  lobbyId: string;
  playerName: string;
}

const server = Bun.serve<SocketData>({
  port: 3000,
  fetch(req: Request, server) {
    const url = new URL(req.url);
    const lobbyId = url.searchParams.get("lobbyId");
    const playerName = url.searchParams.get("playerName") || "Anonymous";

    if (url.pathname === "/ws" && lobbyId) {
      const success = server.upgrade(req, {
        data: { lobbyId, playerName },
      });
      return success
        ? undefined
        : new Response("Upgrade failed", { status: 400 });
    }
    return new Response("Parliament Server");
  },
  websocket: {
    open(ws: ServerWebSocket<SocketData>) {
      const { lobbyId } = ws.data;
      ws.subscribe(lobbyId);
      console.log(`Leader joined: ${ws.data.playerName}`);
    },
    message(ws: ServerWebSocket<SocketData>, message: string | Buffer) {
      const { lobbyId } = ws.data;

      // Note: If you don't need to validate the JSON structure yet,
      // we remove the parsing logic to satisfy the "unused variable" error.
      // Simply broadcast the raw message to the lobby.
      server.publish(lobbyId, message);
    },
    // Prefixing with _ tells TypeScript this is intentionally unused
    close(_ws: ServerWebSocket<SocketData>) {
      console.log("Leader left");
    },
  },
});

console.log(`Server running on ${server.port}`);