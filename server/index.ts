// index.ts
import type { ServerWebSocket } from "bun";
import type {
  ActiveBill,
  ConstitutionalEvent,
  Government,
  Party,
} from "../src/types/game";

// Define what "data" lives inside the socket
interface SocketData {
  lobbyId: string;
  playerName: string;
}

type ConstitutionalCrisis = {
  event: ConstitutionalEvent;
  triggeredBy: string;
  description: string;
};

type LobbyState = {
  parties: Party[];
  playerCount?: 3 | 4 | 5;
  partyOwnership: Record<string, string>; // partyId -> playerName
  playerParties: Record<string, string>; // playerId -> partyId
  alliances: Record<string, string[]>; // partyId -> ally partyIds
  currentGovernment: Government | null;
  activeBill: ActiveBill | null;
  constitutionalCrisis: ConstitutionalCrisis | null;
};

const lobbyStates = new Map<string, LobbyState>();

function getLobbyState(lobbyId: string): LobbyState {
  const existing = lobbyStates.get(lobbyId);
  if (existing) return existing;
  const created: LobbyState = {
    parties: [],
    partyOwnership: {},
    playerParties: {},
    alliances: {},
    currentGovernment: null,
    activeBill: null,
    constitutionalCrisis: null,
  };
  lobbyStates.set(lobbyId, created);
  return created;
}

function switchAlliance(
  prev: Record<string, string[]>,
  leavingId: string,
  joiningId: string,
): Record<string, string[]> {
  const next: Record<string, string[]> = {};
  for (const [pid, allies] of Object.entries(prev)) {
    if (pid === leavingId) continue;
    next[pid] = allies.filter((a) => a !== leavingId);
  }
  next[leavingId] = [joiningId];
  next[joiningId] = [
    ...(next[joiningId] || []).filter((a) => a !== leavingId),
    leavingId,
  ];
  return next;
}

function snapshotState(state: LobbyState) {
  return {
    parties: state.parties,
    playerCount: state.playerCount,
    partyOwnership: state.partyOwnership,
    playerParties: state.playerParties,
    alliances: state.alliances,
    currentGovernment: state.currentGovernment,
    activeBill: state.activeBill,
    constitutionalCrisis: state.constitutionalCrisis,
  };
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
      // On (re)connect, push a snapshot so the client doesn't rely on missed events.
      const state = lobbyStates.get(lobbyId);
      if (state && state.parties.length > 0) {
        const wsAny = ws as unknown as { send?: (data: string) => void };
        wsAny.send?.(
          JSON.stringify({
            type: "SYNC_STATE",
            payload: snapshotState(state),
          }),
        );
      }
      console.log(`Leader joined lobby ${lobbyId}: ${ws.data.playerName}`);
    },
    message(ws: ServerWebSocket<SocketData>, message: string | Buffer) {
      const { lobbyId } = ws.data;
      const raw = typeof message === "string" ? message : message.toString();

      // Update server-side state so reconnecting clients can resync.
      // If it's not JSON, just broadcast it as-is.
      try {
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed === "object" && parsed !== null) {
          const record = parsed as Record<string, unknown>;
          const type = record.type;
          const payloadUnknown = record.payload;

          if (
            typeof type === "string" &&
            typeof payloadUnknown === "object" &&
            payloadUnknown !== null
          ) {
            const payload = payloadUnknown as Record<string, unknown>;
            const state = getLobbyState(lobbyId);

            switch (type) {
              case "GAME_SETUP": {
                // Creator sends the initial party list.
                state.parties =
                  (payload.parties as Party[] | undefined) ?? state.parties;
                state.playerCount =
                  (payload.playerCount as LobbyState["playerCount"]) ??
                  state.playerCount;
                break;
              }
              case "PARTY_SELECTED": {
                const { partyId, playerName, playerId } = payload as {
                  partyId?: unknown;
                  playerName?: unknown;
                  playerId?: unknown;
                };
                if (
                  typeof partyId === "string" &&
                  typeof playerName === "string"
                ) {
                  state.partyOwnership[partyId] = playerName;
                }
                if (typeof partyId === "string" && typeof playerId === "string") {
                  state.playerParties[playerId] = partyId;
                }
                break;
              }
              case "COALITION_JOINED": {
                const { partyAId, partyBId } = payload as {
                  partyAId?: unknown;
                  partyBId?: unknown;
                };
                if (
                  typeof partyAId === "string" &&
                  typeof partyBId === "string"
                ) {
                  // Client uses: switchAlliance(prev, partyBId, partyAId)
                  state.alliances = switchAlliance(
                    state.alliances,
                    partyBId,
                    partyAId,
                  );
                }
                break;
              }
              case "GOVERNMENT_FORMED": {
                const { leaderName, partyId, totalSeats } = payload as {
                  leaderName?: unknown;
                  partyId?: unknown;
                  totalSeats?: unknown;
                };
                if (
                  typeof leaderName === "string" &&
                  typeof partyId === "string" &&
                  typeof totalSeats === "number"
                ) {
                  state.currentGovernment = {
                    leader: leaderName,
                    partyId,
                    totalSeats,
                  } satisfies Government;
                }
                break;
              }
              case "BILL_PROPOSED": {
                const {
                  id,
                  title,
                  proposer,
                  isBudget,
                  isNoConfidence,
                  isDissolution,
                } = payload as {
                  id?: unknown;
                  title?: unknown;
                  proposer?: unknown;
                  isBudget?: unknown;
                  isNoConfidence?: unknown;
                  isDissolution?: unknown;
                };
                if (
                  typeof id === "string" &&
                  typeof title === "string" &&
                  typeof proposer === "string"
                ) {
                  state.activeBill = {
                    id,
                    title,
                    proposer,
                    isBudget: (isBudget as boolean | undefined) ?? false,
                    isNoConfidence:
                      (isNoConfidence as boolean | undefined) ?? false,
                    isDissolution:
                      (isDissolution as boolean | undefined) ?? false,
                    votes: {},
                  } satisfies ActiveBill;
                }
                break;
              }
              case "BILL_VOTED": {
                const { billId, partyId, stance, seats } = payload as {
                  billId?: unknown;
                  partyId?: unknown;
                  stance?: unknown;
                  seats?: unknown;
                };
                if (
                  typeof billId === "string" &&
                  typeof partyId === "string" &&
                  (stance === "YEA" || stance === "NAY") &&
                  typeof seats === "number" &&
                  state.activeBill?.id === billId
                ) {
                  state.activeBill = {
                    ...state.activeBill,
                    votes: {
                      ...state.activeBill.votes,
                      [partyId]: { stance: stance, seats },
                    },
                  };
                }
                break;
              }
              case "CRISIS_RESOLVED": {
                const { choice } = payload as { choice?: unknown };
                // Match client-side expectations: clear government/alliances on resolution.
                if (choice === "RESIGN") {
                  state.currentGovernment = null;
                  state.constitutionalCrisis = null;
                } else if (choice === "CALL_ELECTION") {
                  state.currentGovernment = null;
                  state.alliances = {};
                  state.constitutionalCrisis = null;
                }
                break;
              }
            }
          }
        }
      } catch {
        // Ignore parse failures; we'll broadcast raw below.
      }

      server.publish(lobbyId, raw);
    },
    close(ws: ServerWebSocket<SocketData>) {
      console.log(`Leader left: ${ws.data.playerName}`);
    },
  },
});

console.log(`Server running on port: ${server.port}`);