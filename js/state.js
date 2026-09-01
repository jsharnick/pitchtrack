// ===================== STATE =====================
const S = {
  awayScore: 0,
  homeScore: 0,
  inning: 1,
  isTop: true,
  outs: 0,
  balls: 0,
  strikes: 0,
  bases: { "1st": false, "2nd": false, "3rd": false },
  runnerNames: { "1st": null, "2nd": null, "3rd": null }, // tracks who is on each base
  fieldingStats: {}, // {playerKey: {po:0, a:0, e:0, pos:'SS'}}
  pitchX: null,
  pitchY: null,
  selectedOutcome: null,
  selectedPitchType: null,
  pitchCount: 0,
  currentAtBatPitches: [],
  pitchLog: [],
  inningRuns: [], // [{key,inning,isTop,runs}]

  lineupAway: [
    { name: "Player 1", pos: "CF", num: "1", hand: "R" },
    { name: "Player 2", pos: "SS", num: "2", hand: "R" },
    { name: "Player 3", pos: "RF", num: "3", hand: "R" },
    { name: "Player 4", pos: "DH", num: "4", hand: "R" },
    { name: "Player 5", pos: "1B", num: "5", hand: "R" },
    { name: "Player 6", pos: "2B", num: "6", hand: "R" },
    { name: "Player 7", pos: "3B", num: "7", hand: "R" },
    { name: "Player 8", pos: "C", num: "8", hand: "R" },
    { name: "Player 9", pos: "LF", num: "9", hand: "R" },
  ],
  lineupHome: [
    { name: "Player 1", pos: "CF", num: "1", hand: "R" },
    { name: "Player 2", pos: "SS", num: "2", hand: "R" },
    { name: "Player 3", pos: "1B", num: "3", hand: "R" },
    { name: "Player 4", pos: "LF", num: "4", hand: "R" },
    { name: "Player 5", pos: "C", num: "5", hand: "R" },
    { name: "Player 6", pos: "2B", num: "6", hand: "R" },
    { name: "Player 7", pos: "3B", num: "7", hand: "R" },
    { name: "Player 8", pos: "RF", num: "8", hand: "R" },
    { name: "Player 9", pos: "DH", num: "9", hand: "R" },
  ],
  awayBatterIdx: 0,
  homeBatterIdx: 0,

  // Away pitchers throw to home batters and vice versa:
  // pitchersAway = pitchers for the away team (throw while home bats)
  // pitchersHome = pitchers for the home team (throw while away bats)
  pitchersAway: [
    {
      name: "Pitcher",
      num: "1",
      hand: "R",
      pitches: 0,
      strikes: 0,
      k: 0,
      bb: 0,
      swings: 0,
      looks: 0,
      hits: 0,
      outs: 0,
      r: 0,
      hbp: 0,
      bf: 0,
      active: true,
    },
  ],
  pitchersHome: [
    {
      name: "Pitcher",
      num: "1",
      hand: "R",
      pitches: 0,
      strikes: 0,
      k: 0,
      bb: 0,
      swings: 0,
      looks: 0,
      hits: 0,
      outs: 0,
      r: 0,
      hbp: 0,
      bf: 0,
      active: true,
    },
  ],

  batterStats: {},
  lineupResults: {},
  gameLog: [],
  gameId: null, // stable ID — set on first pitch, reused on every save of same game
  pendingErrorEntry: null,
  dpOutcome: null,
  dpPitchType: null,
  dpVelocity: null,
  dpLoc: null,
  dpSpray: null,
  runnerQueue: [],
  runnerMoves: {},
  currentQueueIdx: 0,
  modalHit: null,
};

// ===================== HELPERS =====================
const qs = (id) => document.getElementById(id);
const qsa = (sel) => document.querySelectorAll(sel);

function currentLineup() {
  return S.isTop ? S.lineupAway : S.lineupHome;
}
function currentBatterIdx() {
  return S.isTop ? S.awayBatterIdx : S.homeBatterIdx;
}
function setBatterIdx(i) {
  if (S.isTop) S.awayBatterIdx = i;
  else S.homeBatterIdx = i;
  renderLiveScoutingTab();
}
function currentBatter() {
  const l = currentLineup();
  return l[currentBatterIdx() % l.length];
}
function getBatterKey(isAway, i) {
  return `${isAway ? "a" : "h"}_${i}`;
}
function currentBatterKey() {
  return getBatterKey(
    S.isTop,
    currentBatterIdx() % currentLineup().length
  );
}
function getBatterStats(k) {
  if (!S.batterStats[k])
    S.batterStats[k] = {
      ab: 0,
      pa: 0,
      hits: 0,
      bb: 0,
      k: 0,
      hbp: 0,
      ci: 0,
      sb: 0,
      cs: 0,
      po: 0,
      r: 0,
      rbi: 0,
    };
  return S.batterStats[k];
}

// Active pitcher: during top half, home team pitches; during bottom half, away team pitches
function activePitcherList() {
  return S.isTop ? S.pitchersHome : S.pitchersAway;
}
function activePitcher() {
  const l = activePitcherList();
  return l.find((p) => p.active) || l[l.length - 1];
}
function awayName() {
  return qs("away-name-input").value || "AWAY";
}
function homeName() {
  return qs("home-name-input").value || "HOME";
}
function isContactOutcome(o) {
  return [
    "single",
    "double",
    "triple",
    "homerun",
    "groundout",
    "flyout",
    "lineout",
    "sacfly",
    "sacbunt",
    "error",
    "fc",
  ].includes(o);
}
function isHitOutcome(o) {
  return ["single", "double", "triple", "homerun"].includes(o);
}
function isFieldOut(o) {
  return ["groundout", "flyout", "lineout"].includes(o);
}
function pitchTypeFamily(t) {
  if (["4SFB", "2SFB", "CUT", "SNK"].includes(t)) return "fb";
  if (["CRV", "SLD", "SLV", "SPL"].includes(t)) return "br";
  if (["CH", "KN"].includes(t)) return "os";
  return "un";
}

function dotColor(cls) {
  if (cls.startsWith("fb")) return "#5baef5";
  if (cls.startsWith("br")) return "#f57a7a";
  if (cls.startsWith("os")) return "#6ae87a";
  if (cls.startsWith("un")) return "#7a8aaa";
  if (cls === "ip-out") return "#c084f5";
  if (cls === "ip-hit") return "#e8c84a";
  if (cls === "hbp") return "#c84af0";
  return "var(--text2)";
}

