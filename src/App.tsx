import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import type {
  Party,
  ActiveBill,
  Government,
  ElectionResult,
  ConstitutionalEvent,
} from "./types/game";
import { generateParties, TOTAL_SEATS, MAJORITY } from "./data/parties";
import { useSocket } from "./hooks/useSocket";

const MY_PLAYER_ID = Math.random().toString(36).substring(7);

// ─── Coalition helpers ────────────────────────────────────────────────────────
function buildCoalitionSet(
  partyId: string,
  alliances: Record<string, string[]>,
): Set<string> {
  const visited = new Set<string>();
  const queue = [partyId];
  while (queue.length > 0) {
    const cur = queue.pop()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    for (const a of alliances[cur] || []) if (!visited.has(a)) queue.push(a);
  }
  return visited;
}

function coalitionSeats(
  partyId: string,
  parties: Party[],
  alliances: Record<string, string[]>,
): number {
  return Array.from(buildCoalitionSet(partyId, alliances)).reduce(
    (acc, id) => acc + (parties.find((p) => p.id === id)?.seats || 0),
    0,
  );
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

function simulateElection(parties: Party[]): Record<string, number> {
  const n = parties.length;
  const MIN = 25;
  const MAX = MAJORITY - 1;
  const allocs = Array(n).fill(MIN);
  let remaining = TOTAL_SEATS - MIN * n;
  while (remaining > 0) {
    const i = Math.floor(Math.random() * n);
    const room = MAX - allocs[i];
    if (room <= 0) continue;
    const add = Math.min(remaining, Math.ceil(Math.random() * room));
    allocs[i] += add;
    remaining -= add;
  }
  const result: Record<string, number> = {};
  parties.forEach((p, i) => {
    result[p.id] = allocs[i];
  });
  return result;
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  // ── Lobby state ───────────────────────────────────────────────────────────
  const [inGame, setInGame] = useState(false); // false = lobby screen
  const [lobbyCode, setLobbyCode] = useState<string | null>(null);
  const [inputCode, setInputCode] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [playerCount, setPlayerCount] = useState<3 | 4 | 5>(4);
  const [isCreator, setIsCreator] = useState(false);
  const [waitingForSetup, setWaitingForSetup] = useState(false); // joiner waiting

  // ── Parties & ownership ───────────────────────────────────────────────────
  const [parties, setParties] = useState<Party[]>([]);
  const [myParty, setMyParty] = useState<Party | null>(null);
  const [alliances, setAlliances] = useState<Record<string, string[]>>({});
  const [partyOwnership, setPartyOwnership] = useState<Record<string, string>>(
    {},
  ); // partyId → playerName
  const [playerParties, setPlayerParties] = useState<Record<string, string>>(
    {},
  ); // playerId → partyId

  // ── Feed ──────────────────────────────────────────────────────────────────
  const [feed, setFeed] = useState<string[]>([]);
  const seenMessages = useRef<Set<string>>(new Set());

  // ── Bills ─────────────────────────────────────────────────────────────────
  const [billTitle, setBillTitle] = useState("");
  const [billIsBudget, setBillIsBudget] = useState(false);
  const [activeBill, setActiveBill] = useState<ActiveBill | null>(null);

  // ── Government & constitutional ───────────────────────────────────────────
  const [currentGovernment, setCurrentGovernment] = useState<Government | null>(
    null,
  );
  const [constitutionalCrisis, setConstitutionalCrisis] = useState<{
    event: ConstitutionalEvent;
    triggeredBy: string;
    description: string;
  } | null>(null);
  const [electionResult, setElectionResult] = useState<ElectionResult | null>(
    null,
  );

  // ── Modals ────────────────────────────────────────────────────────────────
  const [invitation, setInvitation] = useState<{
    from: string;
    party: string;
    fromPartyId: string;
  } | null>(null);
  const [showElection, setShowElection] = useState(false);

  const { sendMessage, lastMessage, isConnected } = useSocket(lobbyCode);

  // ─── Derived ──────────────────────────────────────────────────────────────
  const myCoalitionStrength = useMemo(() => {
    if (!myParty || !parties.length) return 0;
    return coalitionSeats(myParty.id, parties, alliances);
  }, [myParty, parties, alliances]);

  const hasMajority = useCallback(
    (id: string) => coalitionSeats(id, parties, alliances) >= MAJORITY,
    [parties, alliances],
  );

  const isInGovernment = useCallback(
    (id: string) => {
      if (!currentGovernment) return false;
      return buildCoalitionSet(currentGovernment.partyId, alliances).has(id);
    },
    [currentGovernment, alliances],
  );

  const myStatus = myParty
    ? isInGovernment(myParty.id)
      ? "GOVERNMENT"
      : "OPPOSITION"
    : null;

  const progressPct = Math.min((myCoalitionStrength / TOTAL_SEATS) * 100, 100);

  const { yeaSeats, naySeats } = useMemo(() => {
    if (!activeBill) return { yeaSeats: 0, naySeats: 0 };
    let y = 0,
      n = 0;
    for (const v of Object.values(activeBill.votes)) {
      if (v.stance === "YEA") y += v.seats;
      else n += v.seats;
    }
    return { yeaSeats: y, naySeats: n };
  }, [activeBill]);

  const hasVoted = activeBill
    ? Object.keys(activeBill.votes).some(
        (pid) => playerParties[MY_PLAYER_ID] === pid,
      )
    : false;

  const billPassed = yeaSeats >= MAJORITY;
  const billFailed = naySeats >= MAJORITY;
  const canResolveCrisis =
    isCreator || (myParty && currentGovernment?.partyId === myParty.id);

  // ─── Helpers ──────────────────────────────────────────────────────────────
  const addFeed = useCallback((msgId: string, text: string) => {
    if (seenMessages.current.has(msgId)) return;
    seenMessages.current.add(msgId);
    setFeed((prev) => [text, ...prev]);
  }, []);

  const triggerCrisis = useCallback(
    (
      event: ConstitutionalEvent,
      triggeredBy: string,
      description: string,
      msgId: string,
    ) => {
      addFeed(msgId, `⚠️ CONSTITUTIONAL CRISIS: ${description}`);
      setConstitutionalCrisis({ event, triggeredBy, description });
    },
    [addFeed],
  );

  useEffect(() => {
    // Trigger request ONLY when connected AND we are a joiner missing data
    if (isConnected && inGame && !isCreator && parties.length === 0) {
      sendMessage("REQUEST_SETUP", { requesterId: MY_PLAYER_ID });
    }
  }, [isConnected, inGame, isCreator, parties.length, sendMessage]);
  // ─── Bill resolution ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeBill) return;
    if (billPassed) {
      const id = `pass-${activeBill.id}`;
      if (activeBill.isNoConfidence) {
        addFeed(
          id,
          `🔥 NO CONFIDENCE PASSED (${yeaSeats} seats): ${currentGovernment?.leader}'s government falls!`,
        );
        setCurrentGovernment(null);
        triggerCrisis(
          "NO_CONFIDENCE_PASSED",
          activeBill.proposer,
          `No confidence in ${currentGovernment?.leader}'s government. The government must resign or call an election.`,
          `crisis-nc-${activeBill.id}`,
        );
      } else if (activeBill.isDissolution) {
        addFeed(id, `🏴 DISSOLUTION APPROVED: Parliament has been dissolved!`);
        triggerCrisis(
          "PM_DISSOLUTION",
          activeBill.proposer,
          `${activeBill.proposer} has dissolved Parliament. A snap election will be held.`,
          `crisis-diss-${activeBill.id}`,
        );
      } else {
        addFeed(
          id,
          `✅ BILL PASSED: "${activeBill.title}" (${yeaSeats} seats in favour)`,
        );
      }
      setActiveBill(null);
    } else if (billFailed) {
      const id = `fail-${activeBill.id}`;
      if (activeBill.isBudget) {
        addFeed(
          id,
          `💰 BUDGET DEFEATED (${naySeats} seats against): Constitutional crisis!`,
        );
        setCurrentGovernment(null);
        triggerCrisis(
          "BUDGET_DEFEATED",
          activeBill.proposer,
          `The government's budget was defeated — by constitutional convention this is a vote of no confidence.`,
          `crisis-budget-${activeBill.id}`,
        );
      } else if (activeBill.isNoConfidence) {
        addFeed(
          id,
          `🛡️ NO CONFIDENCE DEFEATED (${naySeats} seats against): Government survives!`,
        );
      } else if (activeBill.isDissolution) {
        addFeed(
          id,
          `🚫 DISSOLUTION BLOCKED (${naySeats} seats against): Parliament continues.`,
        );
      } else {
        addFeed(
          id,
          `❌ BILL DEFEATED: "${activeBill.title}" (${naySeats} seats against)`,
        );
      }
      setActiveBill(null);
    }
  }, [
    activeBill,
    billPassed,
    billFailed,
    currentGovernment,
    yeaSeats,
    naySeats,
    addFeed,
    triggerCrisis,
  ]);

  // ─── Socket messages ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!lastMessage) return;
    const { type, payload } = lastMessage;

    // ── GAME_SETUP: creator broadcasts party list; joiners receive it ──────
    if (type === "GAME_SETUP") {
      setParties(payload.parties);
      setWaitingForSetup(false);
      setInGame(true); // advance joiner into the game
      // If we're joining an existing lobby, we should also receive the current state
      if (payload.playerCount) {
        setPlayerCount(payload.playerCount);
      }
    }

    // ── A joiner just connected and needs the party list ───────────────────
    // Creator re-broadcasts when they hear REQUEST_SETUP
    if (type === "REQUEST_SETUP" && isCreator && parties.length > 0) {
      sendMessage("GAME_SETUP", { parties, playerCount });
    }

    if (type === "PARTY_SELECTED") {
      setPartyOwnership((prev) => ({
        ...prev,
        [payload.partyId]: payload.playerName,
      }));
      setPlayerParties((prev) => ({
        ...prev,
        [payload.playerId]: payload.partyId,
      }));
    }

    if (type === "COALITION_PROPOSAL") {
      if (
        payload.targetPartyId === myParty?.id &&
        payload.senderId !== MY_PLAYER_ID
      ) {
        setInvitation({
          from: payload.fromLeader,
          party: payload.fromParty,
          fromPartyId: payload.fromPartyId,
        });
      }
    }

    if (type === "COALITION_JOINED") {
      const { partyA, partyB, partyAId, partyBId } = payload;
      addFeed(
        `coal-${[partyAId, partyBId].sort().join("-")}-${Date.now()}`,
        `🤝 REALIGNMENT: ${partyA} and ${partyB} have formed a new Coalition!`,
      );
      setAlliances((prev) => switchAlliance(prev, partyBId, partyAId));
    }

    if (type === "BILL_PROPOSED") {
      setActiveBill({
        id: payload.id,
        title: payload.title,
        proposer: payload.proposer,
        isBudget: payload.isBudget ?? false,
        isNoConfidence: payload.isNoConfidence ?? false,
        isDissolution: payload.isDissolution ?? false,
        votes: {},
      });
    }

    if (type === "BILL_VOTED") {
      setActiveBill((prev) => {
        if (
          !prev ||
          prev.id !== payload.billId ||
          payload.partyId in prev.votes
        )
          return prev;
        return {
          ...prev,
          votes: {
            ...prev.votes,
            [payload.partyId]: { stance: payload.stance, seats: payload.seats },
          },
        };
      });
    }

    if (type === "GOVERNMENT_FORMED") {
      const { leaderName, partyId, totalSeats } = payload;
      setCurrentGovernment((prev) => {
        const canForm = totalSeats >= MAJORITY || !prev;
        const better = !prev || totalSeats >= prev.totalSeats;
        if (canForm && better) {
          addFeed(
            `gov-${partyId}-${totalSeats}`,
            `🏛️ NEW GOVERNMENT: ${leaderName} and Coalition (${totalSeats} seats) take office!`,
          );
          return { leader: leaderName, partyId, totalSeats };
        }
        addFeed(
          `gov-fail-${partyId}-${Date.now()}`,
          `🚫 FAILED: ${leaderName} lacks enough seats.`,
        );
        return prev;
      });
    }

    if (type === "CRISIS_RESOLVED") {
      const { choice, trigger, triggeredBy } = payload;
      if (choice === "RESIGN") {
        addFeed(
          `resign-${Date.now()}`,
          `🏳️ GOVERNMENT RESIGNED: A new government must be formed.`,
        );
        setCurrentGovernment(null);
        setConstitutionalCrisis(null);
      } else if (choice === "CALL_ELECTION") {
        setParties((prev) => {
          const newSeats = simulateElection(prev);
          const winner = Object.entries(newSeats).sort(
            (a, b) => b[1] - a[1],
          )[0][0];
          setElectionResult({ trigger, triggeredBy, newSeats, winner });
          setShowElection(true);
          return prev.map((p) => ({ ...p, seats: newSeats[p.id] ?? p.seats }));
        });
        setCurrentGovernment(null);
        setAlliances({});
        setConstitutionalCrisis(null);
        addFeed(
          `election-${Date.now()}`,
          `🗳️ SNAP ELECTION: Seats redistributed. See election results.`,
        );
      }
    }
  }, [
    lastMessage,
    myParty,
    parties,
    playerCount,
    isCreator,
    addFeed,
    sendMessage,
  ]);

  // ─── Lobby: Create ────────────────────────────────────────────────────────
  const handleCreateGame = () => {
    if (!playerName.trim()) return alert("Enter your name first!");
    const code = Math.random().toString(36).substring(2, 6).toUpperCase();
    const generated = generateParties(playerCount);
    setLobbyCode(code);
    setIsCreator(true);
    setParties(generated);
    setInGame(true);
    // Broadcast after a tick so the socket has time to connect
    setTimeout(
      () => sendMessage("GAME_SETUP", { parties: generated, playerCount }),
      300,
    );
  };

  const handleJoinGame = (code: string) => {
    if (!playerName.trim()) return alert("Enter your name first!");
    if (code.trim().length !== 4) return alert("Code must be 4 characters.");
    setLobbyCode(code.toUpperCase());
    setInGame(true);
    setWaitingForSetup(true);
  };

  // ─── Game actions ─────────────────────────────────────────────────────────
  const handleSelectParty = (party: Party) => {
    if (partyOwnership[party.id])
      return alert("This party already has a leader!");
    setMyParty(party);
    setPartyOwnership((prev) => ({ ...prev, [party.id]: playerName }));
    setPlayerParties((prev) => ({ ...prev, [MY_PLAYER_ID]: party.id }));
    sendMessage("PARTY_SELECTED", {
      partyId: party.id,
      partyName: party.name,
      playerName,
      playerId: MY_PLAYER_ID,
    });
  };

  const handleProposeCoalition = (target: Party) => {
    if (!myParty) return;
    if (!partyOwnership[target.id])
      return alert("That party has no leader yet!");
    sendMessage("COALITION_PROPOSAL", {
      fromParty: myParty.name,
      fromPartyId: myParty.id,
      fromLeader: playerName,
      targetPartyId: target.id,
      senderId: MY_PLAYER_ID,
    });
    alert(`Proposal sent to ${target.name}!`);
  };

  const handleFormGovernment = () => {
    if (!myParty) return;
    if (isInGovernment(myParty.id))
      return alert("You are already in government!");
    if (currentGovernment && !hasMajority(myParty.id))
      return alert(
        `Need ${MAJORITY}+ seats to challenge the current government.`,
      );
    sendMessage("GOVERNMENT_FORMED", {
      leaderName: playerName,
      partyName: myParty.name,
      partyId: myParty.id,
      totalSeats: coalitionSeats(myParty.id, parties, alliances),
    });
  };

  const handleNoConfidence = () => {
    if (!myParty || !currentGovernment) return;
    sendMessage("BILL_PROPOSED", {
      id: `nc-${Date.now()}`,
      title: `Motion of No Confidence against ${currentGovernment.leader}`,
      proposer: playerName,
      isNoConfidence: true,
    });
  };

  const handleProposeBill = () => {
    if (!billTitle.trim()) return alert("Bill needs a title!");
    sendMessage("BILL_PROPOSED", {
      id: `bill-${Date.now()}`,
      title: billTitle,
      proposer: playerName,
      isBudget: billIsBudget,
    });
    setBillTitle("");
    setBillIsBudget(false);
  };

  const handleRequestDissolution = () => {
    if (!myParty || !currentGovernment) return;
    if (currentGovernment.partyId !== myParty.id)
      return alert("Only the PM can request dissolution!");
    sendMessage("BILL_PROPOSED", {
      id: `diss-${Date.now()}`,
      title: `${playerName} requests Dissolution of Parliament`,
      proposer: playerName,
      isDissolution: true,
    });
  };

  const handleVote = (stance: "YEA" | "NAY") => {
    if (!activeBill || hasVoted || !myParty) return;
    sendMessage("BILL_VOTED", {
      billId: activeBill.id,
      stance,
      partyId: myParty.id,
      seats: myParty.seats,
    });
  };

  const handleCrisisChoice = (choice: "RESIGN" | "CALL_ELECTION") => {
    if (!constitutionalCrisis) return;
    sendMessage("CRISIS_RESOLVED", {
      choice,
      trigger: constitutionalCrisis.event,
      triggeredBy: constitutionalCrisis.triggeredBy,
    });
  };

  // ─── Bill badge ───────────────────────────────────────────────────────────
  const billTypeLabel = activeBill?.isDissolution
    ? "Dissolution Request"
    : activeBill?.isNoConfidence
      ? "Motion of No Confidence"
      : activeBill?.isBudget
        ? "Budget Bill"
        : "Bill";

  const billBadgeColor = activeBill?.isDissolution
    ? "bg-purple-100 text-purple-700"
    : activeBill?.isNoConfidence
      ? "bg-red-100 text-red-600"
      : activeBill?.isBudget
        ? "bg-amber-100 text-amber-700"
        : "bg-blue-100 text-blue-700";

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-100 via-green-50 to-white flex flex-col items-center p-4 lg:p-8">
      <h1 className="text-4xl font-bold mb-8 text-green-700 tracking-tight">
        Parliamentary Powerplay
      </h1>

      {/* ══════════════════════════════════════════════════════════════════════
          LOBBY — only shown before entering the game
      ══════════════════════════════════════════════════════════════════════ */}

      {!inGame && (
        <div className="bg-white p-8 rounded-2xl shadow-xl border border-green-100 w-full max-w-xl space-y-5">
          {/* ── Row 1: Name + Room Code side by side ── */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-green-600 uppercase mb-2">
                Leader Name
              </label>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateGame()}
                className="w-full bg-green-50 border border-green-200 p-3 rounded-xl text-center outline-none focus:ring-2 focus:ring-green-400 font-semibold"
                placeholder="Your Name"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-green-600 uppercase mb-2">
                Join Code
              </label>
              <input
                type="text"
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                className="w-full bg-green-50 border border-green-200 p-3 rounded-xl text-center tracking-widest outline-none focus:ring-2 focus:ring-green-400 font-semibold uppercase"
                placeholder="XXXX"
                maxLength={4}
              />
            </div>
          </div>

          {/* ── Room Size — only shown when NOT joining ── */}
          {!inputCode.trim() && (
            <div>
              <label className="block text-xs font-bold text-green-600 uppercase mb-2">
                Room Size
              </label>
              <div className="grid grid-cols-3 gap-2">
                {([3, 4, 5] as const).map((n) => (
                  <button
                    key={n}
                    onClick={() => setPlayerCount(n)}
                    className={`py-2 rounded-xl font-black text-sm border-2 transition-all ${
                      playerCount === n
                        ? "border-green-600 bg-green-600 text-white"
                        : "border-green-200 text-green-700 hover:border-green-400"
                    }`}
                  >
                    {n} Players
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-400 mt-1 text-center">
                {TOTAL_SEATS} seats randomly distributed across that many
                parties.
              </p>
            </div>
          )}

          {/* ── Actions ── */}
          {inputCode.trim() ? (
            /* Joining flow — just the join button */
            <button
              onClick={() => handleJoinGame(inputCode)}
              className="w-full bg-green-600 text-white py-3 rounded-xl font-semibold shadow-md hover:bg-green-700 transition-all"
            >
              Join Session
            </button>
          ) : (
            /* Creating flow */
            <button
              onClick={handleCreateGame}
              className="w-full bg-green-600 text-white py-3 rounded-xl font-semibold shadow-md hover:bg-green-700 transition-all"
            >
              Create Session
            </button>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          GAME — single page, always shown once inGame = true
      ══════════════════════════════════════════════════════════════════════ */}
      {inGame && (
        <div className="w-full max-w-7xl flex flex-col gap-6 animate-in fade-in duration-500">
          {/* Header bar */}
          <div className="w-full bg-white border border-green-200 p-4 rounded-2xl shadow-sm flex justify-between items-center flex-wrap gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
              <span className="text-sm font-bold text-green-800 uppercase tracking-widest">
                Active Session
              </span>
              {myStatus && (
                <span
                  className={`text-[10px] font-black px-3 py-1 rounded-full uppercase ${
                    myStatus === "GOVERNMENT"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {myStatus === "GOVERNMENT" ? "🏛 In Power" : "⚔️ Opposition"}
                </span>
              )}
              {currentGovernment && (
                <span className="text-[10px] font-bold text-slate-400">
                  PM:{" "}
                  <span className="text-green-700 font-black">
                    {currentGovernment.leader}
                  </span>
                </span>
              )}
            </div>
            {lobbyCode && (
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-gray-400 uppercase">
                  Code:
                </span>
                <div className="bg-green-50 px-4 py-2 rounded-xl border border-green-200 flex items-center gap-3">
                  <span className="text-xl font-black text-green-700 font-mono tracking-widest">
                    {lobbyCode}
                  </span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(lobbyCode);
                      alert("Copied!");
                    }}
                    className="text-[10px] bg-green-600 text-white px-2 py-1 rounded-md"
                  >
                    COPY
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* ── Sidebar ──────────────────────────────────────────────────── */}
            <div className="lg:col-span-1 space-y-5">
              <div className="bg-white p-6 rounded-3xl shadow-lg border border-green-100">
                <h2 className="text-xs font-bold text-green-600 uppercase mb-4 tracking-widest">
                  Your Command
                </h2>

                {myParty ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: myParty.color }}
                      />
                      <p className="font-black text-green-900 text-sm">
                        {myParty.name}
                      </p>
                    </div>

                    <div className="bg-green-600 p-4 rounded-xl text-white shadow-inner">
                      <p className="text-[10px] font-bold uppercase opacity-80">
                        Coalition Strength
                      </p>
                      <p className="text-4xl font-black">
                        {myCoalitionStrength}
                      </p>
                      <p className="text-[10px] font-bold">
                        / {TOTAL_SEATS} SEATS
                      </p>
                      <div className="mt-2 h-2 bg-green-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-white rounded-full transition-all duration-500"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                      <p className="text-[9px] mt-1 opacity-60">
                        {MAJORITY} seats for majority
                      </p>
                    </div>

                    <div className="space-y-2">
                      {isInGovernment(myParty.id) ? (
                        <>
                          <div className="w-full bg-green-700 text-white py-2 rounded-xl font-black text-xs text-center">
                            🏛️ IN POWER
                          </div>
                          {currentGovernment?.partyId === myParty.id && (
                            <button
                              onClick={handleRequestDissolution}
                              className="w-full bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-xl font-black text-xs transition-all"
                            >
                              🏴 Request Dissolution
                            </button>
                          )}
                        </>
                      ) : (
                        <div className="space-y-2">
                          <button
                            onClick={handleFormGovernment}
                            disabled={
                              !!currentGovernment && !hasMajority(myParty.id)
                            }
                            className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white py-2 rounded-xl font-black text-xs transition-all"
                          >
                            DECLARE GOVERNMENT
                          </button>
                          {currentGovernment && (
                            <button
                              onClick={handleNoConfidence}
                              className="w-full bg-red-600 hover:bg-red-700 text-white py-2 rounded-xl font-black text-xs transition-all"
                            >
                              MOTION OF NO CONFIDENCE
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="border-t pt-4 space-y-2">
                      <p className="text-[10px] font-bold text-gray-400 uppercase">
                        Introduce Bill
                      </p>
                      <input
                        type="text"
                        value={billTitle}
                        onChange={(e) => setBillTitle(e.target.value)}
                        onKeyDown={(e) =>
                          e.key === "Enter" && handleProposeBill()
                        }
                        placeholder="Bill title..."
                        className="w-full text-sm p-2 border border-green-200 rounded-lg bg-green-50 outline-none focus:ring-2 focus:ring-green-400"
                      />
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={billIsBudget}
                          onChange={(e) => setBillIsBudget(e.target.checked)}
                          className="accent-amber-500"
                        />
                        <span className="text-[11px] font-bold text-amber-700">
                          Mark as Budget Bill
                        </span>
                      </label>
                      <p className="text-[9px] text-slate-400">
                        Budget defeat = constitutional crisis
                      </p>
                      <button
                        onClick={handleProposeBill}
                        className={`w-full text-white py-2 rounded-lg font-bold text-sm transition-all ${
                          billIsBudget
                            ? "bg-amber-500 hover:bg-amber-600"
                            : "bg-purple-600 hover:bg-purple-700"
                        }`}
                      >
                        {billIsBudget ? "Introduce Budget" : "Propose Bill"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 italic text-center py-4">
                    {waitingForSetup
                      ? "⏳ Connecting to session…"
                      : "Select a party to begin…"}
                  </p>
                )}
              </div>

              {/* Feed */}
              <div className="bg-white p-5 rounded-3xl shadow-lg border border-green-100 h-72 flex flex-col">
                <h3 className="text-xs font-bold text-gray-400 uppercase mb-3 tracking-widest">
                  Hansard Live Feed
                </h3>
                <div className="flex-grow overflow-y-auto space-y-2 pr-1 text-[11px] font-bold">
                  {feed.length === 0 ? (
                    <p className="text-slate-400 italic text-center py-10">
                      Waiting for proceedings…
                    </p>
                  ) : (
                    feed.map((entry, i) => (
                      <div
                        key={i}
                        className={`p-2.5 rounded-xl leading-tight ${
                          entry.includes("🤝")
                            ? "bg-green-50 text-green-700 border border-green-100"
                            : entry.includes("🏛️")
                              ? "bg-amber-50 text-amber-700"
                              : entry.includes("🔥") ||
                                  entry.includes("❌") ||
                                  entry.includes("💰")
                                ? "bg-red-50 text-red-700"
                                : entry.includes("✅") || entry.includes("🛡️")
                                  ? "bg-blue-50 text-blue-700"
                                  : entry.includes("⚠️") ||
                                      entry.includes("🏴") ||
                                      entry.includes("🗳️") ||
                                      entry.includes("🏳️")
                                    ? "bg-purple-50 text-purple-700"
                                    : "bg-slate-50 text-slate-600"
                        }`}
                      >
                        {entry}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* ── Party grid ──────────────────────────────────────────────── */}
            <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-4">
              {waitingForSetup && parties.length === 0 ? (
                // Waiting state for joiner before GAME_SETUP arrives
                <div className="col-span-2 flex flex-col items-center justify-center py-20 text-slate-400">
                  <div className="w-8 h-8 border-4 border-green-400 border-t-transparent rounded-full animate-spin mb-4" />
                  <p className="font-bold">Connecting to session…</p>
                  <p className="text-sm mt-1">
                    Waiting for the host to share the party list.
                  </p>
                </div>
              ) : (
                parties.map((party) => {
                  const ownerName = partyOwnership[party.id];
                  const isTaken = !!ownerName;
                  const isMine = myParty?.id === party.id;
                  const isGov = isInGovernment(party.id);
                  const isAlly =
                    myParty && !isMine
                      ? buildCoalitionSet(myParty.id, alliances).has(party.id)
                      : false;
                  const canInvite = myParty && !isMine && isTaken && !isAlly;

                  return (
                    <div
                      key={party.id}
                      className={`relative bg-white p-6 rounded-3xl shadow-md border-2 transition-all ${
                        isMine
                          ? "border-green-500 ring-4 ring-green-100"
                          : isAlly
                            ? "border-blue-300 ring-2 ring-blue-50"
                            : "border-white"
                      }`}
                    >
                      {isGov && (
                        <div className="absolute -top-2 -right-2 bg-amber-500 text-white text-[10px] font-black px-2 py-1 rounded-full shadow-lg z-10">
                          GOVERNMENT
                        </div>
                      )}
                      <div
                        className="absolute top-6 left-0 w-1.5 h-10 rounded-r-full"
                        style={{ backgroundColor: party.color }}
                      />

                      <div className="flex justify-between items-start mb-2 pl-3">
                        <div>
                          <span className="text-[10px] font-bold py-1 px-2 rounded bg-slate-100 text-slate-500 uppercase">
                            {party.seats} Seats
                          </span>
                          <h3 className="text-xl font-black text-green-900 mt-1">
                            {party.name}
                          </h3>
                          <span className="text-[10px] font-bold text-slate-400 uppercase">
                            {party.ideology}
                          </span>
                        </div>
                        <div
                          className="w-4 h-4 rounded-full mt-1 flex-shrink-0"
                          style={{ backgroundColor: party.color }}
                        />
                      </div>

                      <div className="pl-3 mb-3">
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{
                              width: `${(party.seats / TOTAL_SEATS) * 100}%`,
                              backgroundColor: party.color,
                            }}
                          />
                        </div>
                        <p className="text-[9px] text-slate-400 mt-0.5">
                          {((party.seats / TOTAL_SEATS) * 100).toFixed(1)}% of
                          parliament
                        </p>
                      </div>

                      <div className="mb-4 p-3 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                        <p className="text-[10px] font-bold text-slate-400 uppercase">
                          Party Leader
                        </p>
                        <p className="font-bold text-green-700">
                          {ownerName ? `Leader ${ownerName}` : "Vacant Seat"}
                        </p>
                      </div>

                      {!myParty && !isTaken && (
                        <button
                          onClick={() => handleSelectParty(party)}
                          className="w-full bg-green-600 text-white py-2 rounded-xl font-bold text-sm hover:bg-green-700 transition-all"
                        >
                          Claim Leadership
                        </button>
                      )}
                      {!myParty && isTaken && (
                        <div className="w-full bg-slate-100 text-slate-400 py-2 rounded-xl font-bold text-sm text-center">
                          Seat Taken
                        </div>
                      )}
                      {canInvite && (
                        <button
                          onClick={() => handleProposeCoalition(party)}
                          className="w-full bg-blue-600 text-white py-2 rounded-xl font-bold text-sm hover:bg-blue-700 transition-all"
                        >
                          Invite to Coalition
                        </button>
                      )}
                      {isAlly && (
                        <div className="w-full bg-blue-50 text-blue-700 py-2 rounded-xl font-bold text-sm text-center">
                          ✓ Coalition Partner
                        </div>
                      )}
                      {isMine && (
                        <div className="w-full bg-green-50 text-green-700 py-2 rounded-xl font-bold text-sm text-center">
                          Your Party
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          ELECTION RESULTS MODAL — shown as overlay on the same page
      ══════════════════════════════════════════════════════════════════════ */}
      {showElection && electionResult && (
        <div className="fixed inset-0 bg-purple-900/30 backdrop-blur-md flex items-center justify-center z-[80] p-4">
          <div className="bg-white rounded-3xl shadow-2xl border-t-8 border-purple-600 p-10 max-w-2xl w-full animate-in slide-in-from-bottom-10">
            <div className="text-center mb-6">
              <span className="text-5xl">🗳️</span>
              <h2 className="text-3xl font-black text-purple-900 mt-3">
                Snap Election Results
              </h2>
              <p className="text-slate-500 mt-1 text-sm">
                Triggered by{" "}
                <span className="font-bold">{electionResult.triggeredBy}</span>
                {" · "}
                <span className="font-bold text-purple-600">
                  {electionResult.trigger.replace(/_/g, " ")}
                </span>
              </p>
            </div>

            <div className="space-y-3 mb-6">
              {parties
                .slice()
                .sort(
                  (a, b) =>
                    (electionResult.newSeats?.[b.id] ?? b.seats) -
                    (electionResult.newSeats?.[a.id] ?? a.seats),
                )
                .map((party) => {
                  const newS =
                    electionResult.newSeats?.[party.id] ?? party.seats;
                  const isWinner = electionResult.winner === party.id;
                  return (
                    <div
                      key={party.id}
                      className={`flex items-center gap-4 p-4 rounded-2xl border-2 ${
                        isWinner
                          ? "border-amber-400 bg-amber-50"
                          : "border-slate-100 bg-slate-50"
                      }`}
                    >
                      {isWinner && <span className="text-lg">👑</span>}
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: party.color }}
                      />
                      <div className="flex-1">
                        <p className="font-black text-green-900 text-sm">
                          {party.name}
                        </p>
                        <div className="h-2 bg-slate-200 rounded-full mt-1 overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${(newS / TOTAL_SEATS) * 100}%`,
                              backgroundColor: party.color,
                            }}
                          />
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-black text-green-800">
                          {newS}
                        </p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase">
                          seats
                        </p>
                      </div>
                    </div>
                  );
                })}
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-5 text-sm text-amber-800">
              <p className="font-black mb-1">
                🏛 No party has an outright majority ({MAJORITY} seats)
              </p>
              <p>
                Parties must now negotiate coalitions or a minority government.
              </p>
            </div>

            <button
              onClick={() => setShowElection(false)}
              className="w-full bg-green-600 text-white py-4 rounded-2xl font-black text-lg hover:bg-green-700 transition-all"
            >
              Return to War Room →
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          CONSTITUTIONAL CRISIS MODAL
      ══════════════════════════════════════════════════════════════════════ */}
      {constitutionalCrisis && (
        <div className="fixed inset-0 bg-red-900/30 backdrop-blur-md flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-3xl p-10 max-w-lg w-full shadow-2xl border-t-8 border-red-600 animate-in slide-in-from-bottom-10">
            <div className="text-center mb-4">
              <span className="text-5xl">⚠️</span>
              <h3 className="text-2xl font-black text-red-900 mt-2">
                Constitutional Crisis
              </h3>
              <p className="text-slate-500 font-bold text-xs uppercase mt-1">
                {constitutionalCrisis.event.replace(/_/g, " ")}
              </p>
            </div>
            <p className="text-slate-600 text-center text-sm mb-6 bg-red-50 p-4 rounded-2xl">
              {constitutionalCrisis.description}
            </p>
            {canResolveCrisis ? (
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => handleCrisisChoice("RESIGN")}
                  className="bg-slate-700 text-white py-5 rounded-2xl font-black text-sm hover:bg-slate-800 transition-all text-center"
                >
                  🏳️ Government Resigns
                  <p className="text-[10px] font-medium opacity-70 mt-1">
                    New government forms without election
                  </p>
                </button>
                <button
                  onClick={() => handleCrisisChoice("CALL_ELECTION")}
                  className="bg-purple-600 text-white py-5 rounded-2xl font-black text-sm hover:bg-purple-700 transition-all text-center"
                >
                  🗳️ Call Snap Election
                  <p className="text-[10px] font-medium opacity-70 mt-1">
                    Seats redistributed, coalitions reset
                  </p>
                </button>
              </div>
            ) : (
              <div className="text-center text-slate-500 font-bold py-4 bg-slate-50 rounded-2xl text-sm">
                Awaiting the Prime Minister's decision…
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          VOTING MODAL
      ══════════════════════════════════════════════════════════════════════ */}
      {activeBill && (
        <div className="fixed inset-0 bg-green-900/20 backdrop-blur-md flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-3xl p-10 max-w-lg w-full shadow-2xl border-t-8 border-green-600 animate-in slide-in-from-bottom-10">
            <div className="mb-2">
              <span
                className={`text-[10px] font-black px-2 py-1 rounded-full uppercase ${billBadgeColor}`}
              >
                {billTypeLabel}
              </span>
            </div>
            <h3 className="text-2xl font-black text-green-900 mb-1">
              {activeBill.title}
            </h3>
            <p className="text-gray-500 mb-1 text-sm">
              Motion by{" "}
              <span className="font-bold text-green-700">
                Leader {activeBill.proposer}
              </span>
            </p>
            {activeBill.isBudget && (
              <p className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-1 rounded-lg inline-block mb-2">
                ⚠️ Defeat of this budget triggers a constitutional crisis
              </p>
            )}
            <p className="text-[10px] font-bold text-slate-400 uppercase mb-2 mt-3">
              Seat-Weighted Vote — {MAJORITY} seats needed
            </p>
            <div className="flex gap-4 mb-6 text-center">
              <div className="flex-1 bg-green-50 rounded-2xl p-3">
                <p className="text-2xl font-black text-green-700">{yeaSeats}</p>
                <p className="text-[10px] font-bold text-green-500 uppercase">
                  Yea Seats
                </p>
              </div>
              <div className="flex-1 bg-red-50 rounded-2xl p-3">
                <p className="text-2xl font-black text-red-600">{naySeats}</p>
                <p className="text-[10px] font-bold text-red-400 uppercase">
                  Nay Seats
                </p>
              </div>
              <div className="flex-1 bg-slate-50 rounded-2xl p-3">
                <p className="text-2xl font-black text-slate-600">{MAJORITY}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase">
                  Threshold
                </p>
              </div>
            </div>
            {hasVoted ? (
              <div className="w-full bg-slate-100 text-slate-500 py-4 rounded-2xl font-bold text-lg text-center">
                Vote recorded — awaiting others…
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => handleVote("YEA")}
                  className="bg-green-600 text-white py-4 rounded-2xl font-bold text-lg hover:bg-green-700 transition-all"
                >
                  Yea {myParty ? `(${myParty.seats})` : ""}
                </button>
                <button
                  onClick={() => handleVote("NAY")}
                  className="bg-red-50 text-red-600 border-2 border-red-100 py-4 rounded-2xl font-bold text-lg hover:bg-red-100 transition-all"
                >
                  Nay {myParty ? `(${myParty.seats})` : ""}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          COALITION INVITATION MODAL
      ══════════════════════════════════════════════════════════════════════ */}
      {invitation && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl border-4 border-green-500">
            <h3 className="text-2xl font-black text-green-800 mb-2">
              Coalition Offer!
            </h3>
            <p className="text-gray-600 mb-2">
              Leader{" "}
              <span className="font-bold text-green-700">
                {invitation.from}
              </span>{" "}
              of the{" "}
              <span className="font-bold text-green-700">
                {invitation.party}
              </span>{" "}
              offers an alliance.
            </p>
            {myParty && (alliances[myParty.id]?.length ?? 0) > 0 && (
              <p className="text-[11px] text-amber-600 font-bold bg-amber-50 p-2 rounded-lg mt-2">
                ⚠️ Accepting will leave your current coalition.
              </p>
            )}
            <div className="flex flex-col gap-3 mt-4">
              <button
                onClick={() => {
                  sendMessage("COALITION_JOINED", {
                    partyA: invitation.party,
                    partyB: myParty?.name,
                    partyAId: invitation.fromPartyId,
                    partyBId: myParty?.id,
                    leaderA: invitation.from,
                    leaderB: playerName,
                  });
                  setInvitation(null);
                }}
                className="bg-green-600 text-white py-3 rounded-xl font-bold hover:bg-green-700 transition-all"
              >
                Accept Alliance
              </button>
              <button
                onClick={() => setInvitation(null)}
                className="bg-gray-100 text-gray-500 py-3 rounded-xl font-bold hover:bg-gray-200 transition-all"
              >
                Decline
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
