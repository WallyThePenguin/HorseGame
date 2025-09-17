// server.js
const express = require("express");
const cors = require("cors");
const Database = require("better-sqlite3");

const HOUSE_CUT = 0.1;
const db = new Database("./race.db");
const app = express();
app.use(cors());
app.use(express.json());

// bootstrap schema
db.exec(require("fs").readFileSync("./schema.sql", "utf8"));

// helpers
const getOrCreatePlayer = db.prepare(`
  INSERT INTO players(name) VALUES (?)
  ON CONFLICT(name) DO NOTHING;
`);
const findPlayer = db.prepare(`SELECT * FROM players WHERE name=?`);
const createRace = db.prepare(`INSERT INTO races(track_len,status,started_at) VALUES(?, 'bet', CURRENT_TIMESTAMP)`);
const addHorse = db.prepare(`INSERT INTO race_horses(race_id,slot,emoji) VALUES(?,?,?)`);
const latestOpenRace = db.prepare(`SELECT * FROM races WHERE status='bet' ORDER BY id DESC LIMIT 1`);
const betStmt = db.prepare(`INSERT INTO bets(race_id,player_id,horse_slot,amount) VALUES(?,?,?,?)`);
const decBalance = db.prepare(`UPDATE players SET balance=balance-? WHERE id=? AND balance>=?`);
const listBets = db.prepare(`SELECT * FROM bets WHERE race_id=?`);
const setRaceStatus = db.prepare(`UPDATE races SET status=? WHERE id=?`);
const startRaceTs = db.prepare(`UPDATE races SET status='racing', started_at=CURRENT_TIMESTAMP WHERE id=?`);
const finishRaceTs = db.prepare(`UPDATE races SET status='payout', finished_at=CURRENT_TIMESTAMP WHERE id=?`);
const creditStmt = db.prepare(`UPDATE players SET balance=balance+? WHERE id=?`);
const insertPayout = db.prepare(`INSERT INTO payouts(race_id,player_id,amount) VALUES(?,?,?)`);

function randInt(a, b) {
  return Math.floor(Math.random() * (b - a + 1)) + a;
}
const EMOJI_POOL = [
  // Animals & nature
  "🐶",
  "🐱",
  "🐭",
  "🐹",
  "🐰",
  "🦊",
  "🐻",
  "🐼",
  "🐨",
  "🐯",
  "🦁",
  "🐮",
  "🐷",
  "🐸",
  "🐵",
  "🐔",
  "🐧",
  "🐦",
  "🦅",
  "🦉",
  "🦆",
  "🦢",
  "🐴",
  "🦄",
  "🦓",
  "🦒",
  "🦌",
  "🐂",
  "🐃",
  "🐄",
  "🐖",
  "🐏",
  "🐑",
  "🐐",
  "🦙",
  "🐘",
  "🦏",
  "🦛",
  "🐇",
  "🐿️",
  "🦔",
  "🐢",
  "🐍",
  "🦎",
  "🦂",
  "🦀",
  "🦞",
  "🦐",
  "🦑",
  "🐙",
  "🦈",
  "🐬",
  "🐋",
  "🐳",
  "🐠",
  "🐟",
  "🐡",
  "🐊",
  "🦖",
  "🦕",
  "🌵",
  "🎄",
  "🌲",
  "🌳",
  "🌴",
  "🌱",
  "🌿",
  "☘️",
  "🍀",
  "🍁",
  "🍂",
  "🍃",
  "🌷",
  "🌹",
  "🥀",
  "🌺",
  "🌸",
  "🌼",
  "🌻",
  "🌞",
  "🌝",
  "🌚",
  "🌙",
  "⭐",
  "🌟",
  "⚡",

  // Food & drink
  "🍏",
  "🍎",
  "🍐",
  "🍊",
  "🍋",
  "🍌",
  "🍉",
  "🍇",
  "🍓",
  "🍈",
  "🍒",
  "🍑",
  "🥭",
  "🍍",
  "🥥",
  "🥝",
  "🍅",
  "🍆",
  "🥑",
  "🥦",
  "🥬",
  "🥒",
  "🌶️",
  "🌽",
  "🥕",
  "🥔",
  "🍠",
  "🌭",
  "🍔",
  "🍟",
  "🍕",
  "🥪",
  "🌮",
  "🌯",
  "🥙",
  "🍜",
  "🍲",
  "🍝",
  "🍣",
  "🍤",
  "🍱",
  "🍛",
  "🥗",
  "🍩",
  "🍪",
  "🎂",
  "🍰",
  "🧁",
  "🍫",
  "🍬",
  "🍭",
  "🍮",
  "🍯",
  "🥛",
  "🍼",
  "☕",
  "🍵",
  "🍶",
  "🍺",
  "🍻",
  "🥂",
  "🍷",
  "🥃",
  "🍸",
  "🍹",

  // Sports & games
  "⚽",
  "🏀",
  "🏈",
  "⚾",
  "🎾",
  "🏐",
  "🏉",
  "🥏",
  "🎱",
  "🏓",
  "🏸",
  "🥅",
  "🏒",
  "🏑",
  "🥍",
  "🏏",
  "🥊",
  "🥋",
  "🎽",
  "🛹",
  "🛼",
  "⛸️",
  "🥌",
  "🎿",
  "⛷️",
  "🏂",
  "🪂",
  "🏋️",
  "🤼",
  "🤸",
  "⛹️",
  "🤺",
  "🤾",
  "🏌️",
  "🏇",
  "🧘",
  "🏄",
  "🏊",
  "🤽",
  "🚣",
  "🚵",
  "🚴",
  "🎮",
  "🎲",
  "♟️",
  "🧩",
  "🎯",
  "🎳",
  "🎤",
  "🎧",
  "🎼",
  "🎹",
  "🥁",
  "🎷",
  "🎺",
  "🎸",
  "🎻",
  "🪕",

  // Travel & places
  "🚗",
  "🚕",
  "🚙",
  "🚌",
  "🚎",
  "🏎️",
  "🚓",
  "🚑",
  "🚒",
  "🚐",
  "🚚",
  "🚛",
  "🚜",
  "🚲",
  "🛵",
  "🏍️",
  "🛺",
  "🚨",
  "🚔",
  "🚍",
  "🚘",
  "🚖",
  "✈️",
  "🛩️",
  "🛫",
  "🛬",
  "🚀",
  "🛸",
  "🚁",
  "🚂",
  "🚆",
  "🚇",
  "🚊",
  "🚉",
  "🚄",
  "🚅",
  "🚈",
  "🚝",
  "🚞",
  "🚋",
  "🚢",
  "⛴️",
  "🚤",
  "🛥️",
  "🛳️",
  "⛵",
  "🚟",
  "🚠",
  "🚡",
  "🛰️",
  "🛎️",
  "🗽",
  "🗼",
  "🏰",
  "🏯",
  "🏟️",
  "🎡",
  "🎢",
  "🎠",

  // Objects & symbols
  "⌚",
  "📱",
  "💻",
  "⌨️",
  "🖥️",
  "🖨️",
  "🖱️",
  "💽",
  "💾",
  "💿",
  "📀",
  "📷",
  "📸",
  "🎥",
  "📹",
  "📺",
  "📻",
  "🎙️",
  "🎚️",
  "🎛️",
  "☎️",
  "📞",
  "📟",
  "📠",
  "🔋",
  "🔌",
  "💡",
  "🔦",
  "🕯️",
  "🧯",
  "🛠️",
  "🔧",
  "🔨",
  "⚒️",
  "🛠️",
  "⛏️",
  "🪓",
  "🔩",
  "⚙️",
  "🧰",
  "🧲",
  "🔫",
  "💣",
  "🔪",
  "🗡️",
  "⚔️",
  "🛡️",
  "🚪",
  "🪑",
  "🛏️",
  "🛋️",
  "🚽",
  "🚿",
  "🛁",
  "🪠",
  "🧴",
  "🧷",
  "🧹",
  "🧺",
  "🧻",
  "🧼",
  "🧽",
  "🧯",
  "💎",
  "💍",
  "📿",
  "💄",
  "💅",
  "👑",
  "🧢",
  "👒",
  "🎩",
  "🎓",
  "🪖",
  "👠",
  "👟",
  "🥾",
  "🥿",
  "🧦",
  "🧤",
  "🧣",
  "👕",
  "👔",
  "👗",
  "👚",
  "👖",
  "🧥",
  "🥼",
  "🦺",

  // Money & misc
  "💰",
  "🪙",
  "💴",
  "💵",
  "💶",
  "💷",
  "💸",
  "💳",
  "🧾",
  "🏧",
  "🏦",
  "🏛️",
  "⚖️",
  "🔑",
  "🗝️",
  "🛎️",
  "🧭",
  "🗺️",
  "🧱",
  "🪨",
  "🪵",
  "🛖",
  "🏠",
  "🏡",
  "🏢",
  "🏣",
  "🏤",
  "🏥",
  "🏦",
  "🏨",
  "🏩",
  "🏪",
  "🏫",
  "🏬",
  "🏭",
  "🏯",
  "🏰",

  // Flags (subset, too many exist)
  "🏁",
  "🚩",
];

function pick8() {
  const pool = [...EMOJI_POOL],
    out = [];
  for (let i = 0; i < 8; i++) out.push(pool.splice(randInt(0, pool.length - 1), 1)[0]);
  return out;
}

// POST /race/new  -> host creates a new race (random track + 8 emojis)
app.post("/race/new", (req, res) => {
  const trackLen = randInt(90, 150);
  const info = db.transaction(() => {
    const raceId = createRace.run(trackLen).lastInsertRowid;
    pick8().forEach((emoji, slot) => addHorse.run(raceId, slot, emoji));
    return raceId;
  })();
  res.json({ ok: true, race_id: info });
});

// GET /race/open -> returns current open race with horses
app.get("/race/open", (req, res) => {
  const race = latestOpenRace.get();
  if (!race) return res.json({ ok: true, race: null, horses: [] });
  const horses = db.prepare(`SELECT slot,emoji FROM race_horses WHERE race_id=? ORDER BY slot`).all(race.id);
  res.json({ ok: true, race, horses });
});

// POST /bet { user, horse, amount }
app.post("/bet", (req, res) => {
  const { user, horse, amount } = req.body || {};
  if (!user || !Number.isInteger(horse) || !Number.isInteger(amount) || amount <= 0) {
    return res.status(400).json({ ok: false, error: "bad_input" });
  }
  const race = latestOpenRace.get();
  if (!race) return res.status(400).json({ ok: false, error: "no_open_race" });

  const out = db.transaction(() => {
    getOrCreatePlayer.run(user);
    const player = findPlayer.get(user);
    const ok = decBalance.run(amount, player.id, amount);
    if (ok.changes === 0) throw new Error("insufficient_balance");
    betStmt.run(race.id, player.id, horse, amount);
    return { balance: findPlayer.get(user).balance };
  });
  try {
    const result = out();
    res.json({ ok: true, balance: result.balance });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// POST /race/start  -> lock betting
app.post("/race/start", (req, res) => {
  const race = latestOpenRace.get();
  if (!race) return res.status(400).json({ ok: false, error: "no_open_race" });
  startRaceTs.run(race.id);
  res.json({ ok: true, race_id: race.id });
});

// POST /race/finish { winner } -> compute payouts
app.post("/race/finish", (req, res) => {
  const { winner } = req.body || {};
  if (!Number.isInteger(winner) || winner < 0 || winner > 7) {
    return res.status(400).json({ ok: false, error: "bad_winner" });
  }
  const race = db.prepare(`SELECT * FROM races WHERE status='racing' ORDER BY id DESC LIMIT 1`).get();
  if (!race) return res.status(400).json({ ok: false, error: "no_racing_race" });

  const result = db.transaction(() => {
    finishRaceTs.run(race.id);
    const bets = listBets.all(race.id);
    const totalPool = bets.reduce((a, b) => a + b.amount, 0);
    const afterHouse = Math.floor(totalPool * (1 - HOUSE_CUT));
    const onWinner = bets.filter((b) => b.horse_slot === winner).reduce((a, b) => a + b.amount, 0);

    const earnings = new Map();
    if (onWinner > 0) {
      bets
        .filter((b) => b.horse_slot === winner)
        .forEach((b) => {
          const share = Math.floor((b.amount / onWinner) * afterHouse);
          earnings.set(b.player_id, (earnings.get(b.player_id) || 0) + share);
        });
    }

    for (const [player_id, amount] of earnings) {
      creditStmt.run(amount, player_id);
      insertPayout.run(race.id, player_id, amount);
    }

    // mark done
    setRaceStatus.run("done", race.id);

    const winners = Array.from(earnings, ([pid, amt]) => {
      const name = db.prepare(`SELECT name FROM players WHERE id=?`).get(pid).name;
      return { name, amount: amt };
    }).sort((a, b) => b.amount - a.amount);

    return { totalPool, afterHouse, onWinner, winners };
  })();

  res.json({ ok: true, race_id: race.id, ...result });
});

// GET /leaderboard
app.get("/leaderboard", (req, res) => {
  const rows = db.prepare(`SELECT name, balance FROM players ORDER BY balance DESC LIMIT 100`).all();
  res.json({ ok: true, players: rows });
});

app.listen(4000, () => console.log("SQLite race server http://localhost:4000"));
