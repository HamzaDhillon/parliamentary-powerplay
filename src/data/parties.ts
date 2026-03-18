// src/data/parties.ts
// ─────────────────────────────────────────────────────────────────────────────
// PARTY POOL — names, colors and ideologies are fixed.
// Seats are NOT defined here; they are randomly distributed at game-start
// based on the player count chosen by the room creator.
// ─────────────────────────────────────────────────────────────────────────────

import type { PartyTemplate } from "../types/game";

export const PARTY_POOL: PartyTemplate[] = [
  { id: "liberal",       name: "Liberal Party",              color: "#e63946", ideology: "Centre-Right"  },
  { id: "conservative",  name: "Conservative Party",         color: "#457b9d", ideology: "Right"         },
  { id: "ndp",           name: "New Democratic Party",       color: "#f4a261", ideology: "Centre-Left"   },
  { id: "green",         name: "Green Party",                color: "#2a9d8f", ideology: "Left"           },
  { id: "bloc",          name: "Bloc Québécois",             color: "#6a4c93", ideology: "Centre-Left"   },
  { id: "peoples",       name: "People's Party",             color: "#e76f51", ideology: "Right-Populist" },
  { id: "reform",        name: "Reform Alliance",            color: "#264653", ideology: "Right"          },
  { id: "progressive",   name: "Progressive Coalition",      color: "#06d6a0", ideology: "Centre"         },
];

// Total seats in parliament — always fixed regardless of player count.
export const TOTAL_SEATS = 338;
export const MAJORITY    = Math.ceil(TOTAL_SEATS / 2) + 1; // 170

/**
 * Randomly pick `count` parties from the pool and distribute TOTAL_SEATS
 * among them so they always sum exactly to TOTAL_SEATS.
 *
 * Each party gets at least MIN_SEATS seats; the remainder is distributed
 * randomly so no single party starts with an obvious majority (capped at
 * MAJORITY - 1 = 169 seats for game balance).
 */
const MIN_SEATS = 30;
const MAX_SEATS = MAJORITY - 1; // 169 — no party starts with instant majority

export function generateParties(count: 3 | 4 | 5): import("../types/game").Party[] {
  // 1. Pick `count` parties at random from the pool (shuffle + slice)
  const shuffled = [...PARTY_POOL].sort(() => Math.random() - 0.5).slice(0, count);

  // 2. Distribute TOTAL_SEATS randomly while respecting MIN and MAX per party
  const seats = distributeSeats(TOTAL_SEATS, count, MIN_SEATS, MAX_SEATS);

  return shuffled.map((template, i) => ({
    ...template,
    seats: seats[i],
  }));
}

/** Distribute `total` into `n` integers each in [min, max] summing to total. */
function distributeSeats(total: number, n: number, min: number, max: number): number[] {
  // Start everyone at min
  const result = Array(n).fill(min);
  let remaining = total - min * n;

  // Randomly add to each slot without exceeding max
  while (remaining > 0) {
    const i = Math.floor(Math.random() * n);
    const room = max - result[i];
    if (room <= 0) continue;
    const add = Math.min(remaining, Math.ceil(Math.random() * room));
    result[i] += add;
    remaining -= add;
  }

  return result;
}