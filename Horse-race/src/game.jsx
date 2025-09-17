// src/game.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import RaceTrack from "./RaceTrack";
import { getOpenRace, createRace, startRace, finishRace, getLeaderboard } from "./api";

const TICK_MS = 60;
function rand(min, max) {
  return Math.random() * (max - min) + min;
}
function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}
function formatCoins(n) {
  return Math.floor(n).toLocaleString();
}

export default function HorseRacingGame() {
  const [race, setRace] = useState(null); // { id, track_len, status }
  const [horses, setHorses] = useState([]); // [{slot, emoji}] (length 8)
  const [leaderboard, setLeaderboard] = useState([]); // [{name, balance}]
  const [phase, setPhase] = useState("bet"); // "bet" | "racing" | "payout"
  const [positions, setPositions] = useState([]); // numbers 0..track_len
  const [events, setEvents] = useState({}); // per index
  const [winner, setWinner] = useState(null);
  const raceRef = useRef(null);

  // Load open race + leaderboard
  useEffect(() => {
    refreshOpenRace();
    refreshLeaderboard();
    const li = setInterval(refreshLeaderboard, 2000);
    return () => clearInterval(li);
  }, []);

  async function refreshOpenRace() {
    const data = await getOpenRace();
    if (data?.race) {
      setRace(data.race);
      setHorses(data.horses);
      setPhase(data.race.status || "bet");
      setPositions(Array.from({ length: data.horses.length }, () => 0));
      setEvents({});
      setWinner(null);
    } else {
      setRace(null);
      setHorses([]);
      setPhase("bet");
      setPositions([]);
      setEvents({});
      setWinner(null);
    }
  }

  async function refreshLeaderboard() {
    const data = await getLeaderboard();
    if (data?.ok) setLeaderboard(data.players || []);
  }

  const canStart = useMemo(() => phase === "bet" && horses.length === 8, [phase, horses]);

  async function onNewRace() {
    await createRace(); // server picks 8 emojis + random track
    await refreshOpenRace();
  }

  async function onStartRace() {
    if (!canStart) return;
    await startRace(); // locks betting server-side
    setPhase("racing");
    runAnimation();
  }

  function runAnimation() {
    const trackLen = race?.track_len || 120;
    const N = horses.length || 8;
    const state = {
      pos: Array.from({ length: N }, () => 0),
      vel: Array.from({ length: N }, () => rand(0.8, 1.8)),
      alive: Array.from({ length: N }, () => true),
      shield: Array.from({ length: N }, () => 0),
    };

    function tick() {
      const newEvents = {};
      for (let i = 0; i < N; i++) {
        if (!state.alive[i]) continue;
        state.vel[i] = clamp(state.vel[i] + rand(-0.12, 0.18), 0.2, 3.2);

        // random events
        if (Math.random() < 0.06) {
          const r = Math.random();
          if (r < 0.25) {
            state.vel[i] += 1.6;
            newEvents[i] = "🚀";
          } else if (r < 0.45) {
            if (state.shield[i] <= 0) {
              state.vel[i] = Math.max(0.15, state.vel[i] - 1.2);
              newEvents[i] = "🍌";
            }
          } else if (r < 0.6) {
            state.vel[i] += 0.9;
            newEvents[i] = "💨";
          } else if (r < 0.72) {
            if (state.shield[i] <= 0) {
              state.vel[i] = 0.1;
              newEvents[i] = "🤕";
            }
          } else if (r < 0.78) {
            state.shield[i] = 5;
            newEvents[i] = "🛡️";
          } else if (r < 0.81) {
            if (state.shield[i] <= 0) {
              state.alive[i] = false;
              newEvents[i] = "💀";
            }
          } else if (r < 0.86) {
            state.pos[i] += rand(2.0, 4.0);
            newEvents[i] = "⏩";
          } else if (r < 0.9) {
            state.pos[i] += rand(5.0, 8.0);
            newEvents[i] = "🌀";
          }
        }

        if (state.shield[i] > 0) state.shield[i]--;

        state.pos[i] += state.vel[i];
        state.pos[i] = Math.min(state.pos[i], trackLen);
      }

      setPositions([...state.pos]);
      setEvents(newEvents);

      const winnerIdx = state.pos.findIndex((p) => p >= trackLen);
      if (winnerIdx !== -1) {
        clearInterval(raceRef.current);
        setWinner(winnerIdx);
        setPhase("payout");

        // tell backend to pay out and then auto-create next race
        finishRace(winnerIdx).then(async () => {
          setTimeout(async () => {
            await createRace();
            await refreshOpenRace();
            await refreshLeaderboard();
          }, 2800);
        });
      }
    }

    raceRef.current = setInterval(tick, TICK_MS);
  }

  return (
    <div className="w-full min-h-screen bg-gray-950 text-gray-100 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-4">
        {/* Header / Host controls */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl md:text-3xl font-bold">🐎 Horse Racing — Host Panel</h1>
          <div className="flex gap-2">
            <button
              className="px-3 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-black font-semibold"
              onClick={onNewRace}
            >
              New Race
            </button>
            <button
              className={`px-4 py-2 rounded-xl font-semibold ${
                canStart ? "bg-green-500 hover:bg-green-400 text-black" : "bg-gray-700 text-gray-300 cursor-not-allowed"
              }`}
              onClick={onStartRace}
              disabled={!canStart}
            >
              Start Race
            </button>
          </div>
        </div>

        {/* Track */}
        <div className="bg-gray-900 rounded-2xl p-4 shadow">
          {race ? (
            <div className="text-sm text-gray-300 mb-2">
              Race #{race.id} • Track: {race.track_len} • Status: <b className="text-white">{phase.toUpperCase()}</b>
            </div>
          ) : (
            <div className="text-sm text-gray-400 mb-2">
              No open race. Click <b>New Race</b> to create one.
            </div>
          )}
          <RaceTrack
            horses={horses}
            positions={positions}
            trackLen={race?.track_len || 120}
            phase={phase}
            events={events}
            winner={winner}
            pools={new Map()} // (optional: wire a /pools endpoint if you want live per-horse totals)
          />
        </div>

        {/* Right column: Leaderboard + Help */}
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-gray-900 rounded-2xl p-4 shadow">
            <div className="text-lg font-semibold mb-2">Leaderboard</div>
            <div className="space-y-1 max-h-80 overflow-auto pr-1">
              {leaderboard.length === 0 ? (
                <div className="text-sm text-gray-400">
                  No players yet. Users bet in chat with <code>!bet 3 100</code>.
                </div>
              ) : (
                leaderboard.map((p, i) => (
                  <div
                    key={p.name}
                    className="flex items-center justify-between text-sm bg-gray-800/60 rounded px-2 py-1"
                  >
                    <div>
                      <span className="text-gray-400 mr-2">{i + 1}.</span>
                      <span className="font-semibold">{p.name}</span>
                    </div>
                    <div className="text-gray-300">{formatCoins(p.balance)} 🪙</div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-gray-900 rounded-2xl p-4 shadow">
            <div className="text-lg font-semibold mb-2">How to Bet (Chat)</div>
            <div className="text-sm text-gray-300 space-y-1">
              <div>
                <code>!bet 4 200</code> — bet 200 on horse #4
              </div>
              <div className="text-gray-400">
                Your chat username = your player name. No <code>!join</code> needed.
              </div>
              <div className="text-gray-400">Host controls emojis, track length, and race flow.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
