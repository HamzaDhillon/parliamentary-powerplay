import { useState, useEffect, useCallback } from "react";
// useSocket.ts
export const useSocket = (lobbyId: string | null, playerName: string = "User") => {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [lastMessage, setLastMessage] = useState<any>(null);
  const [isConnected, setIsConnected] = useState(false); // NEW: Track status

  useEffect(() => {
    if (!lobbyId) return;
    const ws = new WebSocket(`ws://localhost:3000/ws?lobbyId=${lobbyId}&playerName=${encodeURIComponent(playerName)}`);

    ws.onopen = () => setIsConnected(true); // Signal readiness
    ws.onmessage = (event) => setLastMessage(JSON.parse(event.data));
    ws.onclose = () => setIsConnected(false);

    setSocket(ws);
    return () => ws.close();
  }, [lobbyId, playerName]);

  const sendMessage = useCallback((type: string, payload: any) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type, payload }));
    }
  }, [socket]);

  return { sendMessage, lastMessage, isConnected }; // Export isConnected
};