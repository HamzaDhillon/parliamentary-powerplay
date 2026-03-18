// src/types/game.ts

// ─── Party ────────────────────────────────────────────────────────────────────

/** Static party definition in the pool — no seats yet */
export interface PartyTemplate {
  id: string;
  name: string;
  color: string;
  ideology: string;
}

/** A party that has been allocated seats for this session */
export interface Party extends PartyTemplate {
  seats: number;
}

// ─── Game phases ──────────────────────────────────────────────────────────────
//
//  LOBBY      → creator picks player count, enters name
//  SETUP      → room is open, players join and claim parties
//  WAR_ROOM   → main gameplay: coalitions, bills, government
//  ELECTION   → triggered by dissolution / no-confidence / failed budget
//  DISSOLVED  → parliament dissolved, session over (results shown)
//
export type GamePhase = "LOBBY" | "SETUP" | "WAR_ROOM" | "ELECTION" | "DISSOLVED";

// ─── Constitutional events ────────────────────────────────────────────────────
//
// These describe *why* an election / dissolution was triggered.
// Shown to all players in the feed and on the election screen.
//
export type ConstitutionalEvent =
  | "NO_CONFIDENCE_PASSED"   // Parliament voted no confidence → gov must resign or call election
  | "BUDGET_DEFEATED"        // Government budget lost → treated as no confidence
  | "PM_DISSOLUTION"         // PM voluntarily requested dissolution of parliament
  | "GOVERNMENT_RESIGNED"    // Government chose to resign after losing confidence
  | "ELECTION_CALLED";       // Election formally called (follows any of the above)

// ─── Election / dissolution state ────────────────────────────────────────────
export interface ElectionResult {
  trigger: ConstitutionalEvent;
  triggeredBy: string;        // player name who triggered it
  newSeats?: Record<string, number>; // partyId → new seat count after election
  winner?: string;            // partyId of largest party post-election
}

// ─── Government ───────────────────────────────────────────────────────────────
export interface Government {
  leader: string;
  partyId: string;
  totalSeats: number;
}

// ─── Active bill / motion ─────────────────────────────────────────────────────
export interface ActiveBill {
  id: string;
  title: string;
  proposer: string;
  isBudget?: boolean;         // budget bills: defeat = constitutional crisis
  isNoConfidence?: boolean;
  isDissolution?: boolean;    // PM requesting dissolution
  votes: Record<string, { stance: "YEA" | "NAY"; seats: number }>;
}

// ─── Socket message shape ─────────────────────────────────────────────────────
export interface SocketMessage {
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: Record<string, any>;
}