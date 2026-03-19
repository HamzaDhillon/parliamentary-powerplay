import { useCallback, useEffect, useRef, useState } from "react";
import type { SocketMessage } from "../types/game";

// useSocket.ts
export const useSocket = (
  lobbyId: string | null,
  playerName: string = "User",
) => {
  const [lastMessage, setLastMessage] = useState<SocketMessage | null>(null);
  const [isConnected, setIsConnected] = useState(false); // Track status

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);
  const shouldReconnectRef = useRef(true);

  const clearReconnectTimer = () => {
    if (reconnectTimerRef.current != null) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  };

  const sendMessage = useCallback(
    (type: string, payload: Record<string, unknown>) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type, payload }));
      }
    },
    [],
  );

  useEffect(() => {
    shouldReconnectRef.current = true;
    clearReconnectTimer();

    if (!lobbyId) return;

    const wsUrl = import.meta.env.VITE_WS_URL || `ws://localhost:3000/ws`;

    function connectNow() {
      if (!shouldReconnectRef.current) return;

      const ws = new WebSocket(
        `${wsUrl}?lobbyId=${lobbyId}&playerName=${encodeURIComponent(playerName)}`,
      );
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttemptRef.current = 0;
        setIsConnected(true);
      };

      ws.onmessage = (event) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(event.data);
        } catch {
          return;
        }

        if (typeof parsed !== "object" || parsed === null) return;
        const record = parsed as Record<string, unknown>;

        const type = record.type;
        const payloadUnknown = record.payload;

        if (type === "HEARTBEAT") return;
        if (typeof type !== "string") return;

        // If payload isn't an object, ignore (keeps parsing safe).
        if (typeof payloadUnknown !== "object" || payloadUnknown === null) {
          setLastMessage({ type, payload: {} } as SocketMessage);
          return;
        }

        setLastMessage({
          type,
          payload: payloadUnknown as Record<string, unknown>,
        } as SocketMessage);
      };

      ws.onclose = () => {
        setIsConnected(false);
        if (!shouldReconnectRef.current) return;

        const attempt = reconnectAttemptRef.current;
        reconnectAttemptRef.current = attempt + 1;

        const delay = Math.min(10000, 300 * 2 ** attempt);
        clearReconnectTimer();
        reconnectTimerRef.current = window.setTimeout(connectNow, delay);
      };

      ws.onerror = () => {
        try {
          ws.close();
        } catch {
          // ignore
        }
      };
    }

    connectNow();

    return () => {
      shouldReconnectRef.current = false;
      clearReconnectTimer();
      try {
        wsRef.current?.close();
      } catch {
        // ignore
      }
      wsRef.current = null;
      setIsConnected(false);
    };
  }, [lobbyId, playerName]);

  // Keep-alive to reduce idle websocket disconnects.
  useEffect(() => {
    if (!isConnected) return;

    const id = window.setInterval(() => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(
        JSON.stringify({ type: "HEARTBEAT", payload: { ts: Date.now() } }),
      );
    }, 25000);

    return () => window.clearInterval(id);
  }, [isConnected]);

  return { sendMessage, lastMessage, isConnected };
};