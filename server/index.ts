// index.ts
import type { ServerWebSocket } from "bun";

// Define what "data" lives inside the socket
interface SocketData {
  lobbyId: string;
  playerName: string;
}

const server = Bun.serve<SocketData>({
  // FIX 1: Use the PORT environment variable provided by Railway
  port: process.env.PORT || 3000,
  
  // FIX 2: Bind to 0.0.0.0 so the outside world can reach the container
  hostname: "0.0.0.0", 

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
    
    // This is helpful for debugging; if you see this in your browser, the server is live!
    return new Response("Parliament Server is Online");
  },
  websocket: {
    open(ws: ServerWebSocket<SocketData>) {
      const { lobbyId } = ws.data;
      ws.subscribe(lobbyId);
      console.log(`Leader joined lobby ${lobbyId}: ${ws.data.playerName}`);
    },
    message(ws: ServerWebSocket<SocketData>, message: string | Buffer) {
      const { lobbyId } = ws.data;
      server.publish(lobbyId, message);
    },
    close(_ws: ServerWebSocket<SocketData>) {
      console.log("Leader left");
    },
  },
});

console.log(`Server running on port: ${server.port}`);