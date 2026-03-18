// src/components/PartyGrid.tsx
import type { Party } from "../types/game";
import { TOTAL_SEATS } from "../data/parties";

interface Props {
  parties: Party[];                   // dynamically generated for this session
  onSelect: (party: Party) => void;
  takenIds: string[];
  ownerNames?: Record<string, string>; // partyId → leader name
}

export default function PartyGrid({ parties, onSelect, takenIds, ownerNames = {} }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-8 w-full max-w-6xl">
      {parties.map((party) => {
        const isTaken = takenIds.includes(party.id);
        const owner = ownerNames[party.id];

        return (
          <button
            key={party.id}
            disabled={isTaken}
            onClick={() => onSelect(party)}
            className={`group relative bg-white border-2 p-6 rounded-2xl transition-all text-left shadow-sm ${
              isTaken
                ? "opacity-50 cursor-not-allowed grayscale border-slate-100"
                : "border-green-100 hover:border-green-400 hover:shadow-md"
            }`}
          >
            {/* Claimed badge */}
            {isTaken && (
              <span className="absolute top-2 right-2 text-[10px] font-bold text-red-500 uppercase">
                Claimed
              </span>
            )}

            {/* Vertical colour accent */}
            <div
              className="absolute top-4 left-0 w-1.5 h-12 rounded-r-full"
              style={{ backgroundColor: party.color }}
            />

            <h3 className="text-xl font-black text-green-900 ml-3">{party.name}</h3>

            {/* Seat count + bar */}
            <div className="ml-3 mt-2 flex items-baseline gap-1">
              <span className="text-2xl font-black text-green-700">{party.seats}</span>
              <span className="text-xs text-slate-400">/ {TOTAL_SEATS} seats</span>
            </div>
            <div className="ml-3 mt-1.5 h-1.5 bg-slate-100 rounded-full overflow-hidden w-3/4">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${(party.seats / TOTAL_SEATS) * 100}%`,
                  backgroundColor: party.color,
                }}
              />
            </div>

            <div className="mt-4 flex items-center justify-between ml-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-green-500">
                {party.ideology}
              </span>
              {!isTaken && (
                <span className="text-sm font-semibold text-green-600 opacity-0 group-hover:opacity-100 transition-opacity">
                  Select Party →
                </span>
              )}
            </div>

            {owner && (
              <p className="ml-3 mt-2 text-[11px] font-bold text-slate-400">Leader: {owner}</p>
            )}
          </button>
        );
      })}
    </div>
  );
}