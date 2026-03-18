// server.ts
import type { ServerWebSocket } from "bun";

// Define what "data" lives inside the socket
interface SocketData {
  lobbyId: string;
  playerName: string;
}

const server = Bun.serve<SocketData>({
  port: 3000,
  fetch(req: Request, server) { // Added ': Request'
    const url = new URL(req.url);
    const lobbyId = url.searchParams.get("lobbyId");
    const playerName = url.searchParams.get("playerName") || "Anonymous";

    if (url.pathname === "/ws" && lobbyId) {
      const success = server.upgrade(req, {
        data: { lobbyId, playerName },
      });
      return success ? undefined : new Response("Upgrade failed", { status: 400 });
    }
    return new Response("Parliament Server");
  },
  websocket: {
    open(ws: ServerWebSocket<SocketData>) { // Added type
      const { lobbyId } = ws.data;
      ws.subscribe(lobbyId);
      console.log(`Leader joined: ${ws.data.playerName}`);
    },
    message(ws: ServerWebSocket<SocketData>, message: string | Buffer) { // Added types
      const { lobbyId } = ws.data;
      
      // Parse the message to check if it's a GAME_SETUP message
      let parsedMessage;
      try {
        parsedMessage = typeof message === 'string' ? JSON.parse(message) : JSON.parse(message.toString());
      } catch (err) {
        console.error("Failed to parse message:", err);
        return;
      }
      
      // Broadcast the message to all players in the lobby
      server.publish(lobbyId, message);
    },
    close(ws: ServerWebSocket<SocketData>) { // Added type
      console.log("Leader left");
    },
  },
});

console.log(`Server running on ${server.port}`);