// ═══════════════════════════════════════════════════════════════════════
//  FIX AT-BATS — reassign plate appearances in a completed game
// ═══════════════════════════════════════════════════════════════════════
// When someone renames a lineup slot mid-game instead of substituting, every
// plate appearance for that slot collapses onto whoever the slot read as at
// save time — the starter's early at-bats get credited to the sub.
//
// The box score can't be un-mixed on its own: buildBatterRows() keys stats by
// lineup SLOT and saves only the outcome label per PA (the `type` and `rbi`
// that recordAtBatResult() saw are dropped). But every pitchLog entry records
// `batter` as it was at the moment the pitch was thrown, and a lineup rename
// never rewrites those — so the pitch log still knows who actually hit.
//
// This reads that back, splits each slot's PAs by the name on their pitches,
// and rebuilds the batter rows. Nothing is guessed: the suggested owner of
// each at-bat comes from the recorded data, and the user confirms before any
// write. Runs/RBI/SB/CS are only ever stored as per-game totals, never per-PA,
// so those stay editable by hand.

let _abfixGame = null; // working copy of the game being edited
let _abfixModel = null; // { away: [...PAs], home: [...PAs] }

// Mirrors recordAtBatResult()'s classification (js/tracker.js) so rebuilt
// aggregates match what live tracking would have produced. Note "E" counts as
// a hit here because that's what the tracker does.
function _abfixType(label) {
  const L = String(label || "").trim().toUpperCase();
  if (L === "BB") return "BB";
  if (L === "HBP") return "HBP";
  if (L === "CI") return "CI";
  if (L === "K" || L === "ꓘ") return "K";
  if (["1B", "2B", "3B", "HR", "E"].indexOf(L) !== -1) return "H";
  return "O";
}

// Split one side's pitch log into plate appearances, chronologically.
// pitchLog is stored newest-first (unshift), so it gets reversed here.
// A new PA starts whenever the lineup slot, inning or half changes.
// Returns PAs carrying the INDEX of each pitch within g.pitchLog. Indices are
// used rather than object references or re-derived groupings so a saved
// assignment still points at exactly the same pitches when reopened.
function _abfixPitchPAs(g, isAway) {
  const log = g.pitchLog || [];
  const chron = [];
  log.forEach((e, i) => {
    if (e.isTop === isAway) chron.push({ e: e, i: i });
  });
  chron.reverse(); // pitchLog is stored newest-first
  const pas = [];
  let cur = null;
  chron.forEach((rec) => {
    const e = rec.e;
    const slot = e.batterIdx;

    // balls/strikes are the count BEFORE the pitch, so every plate appearance
    // opens at 0-0. That's the only dependable boundary:
    //   - slot+inning+name alone merges a player who bats twice in one inning
    //     (batting around) into a single at-bat
    //   - splitting on a name change breaks one at-bat in two when the lineup
    //     was renamed mid-at-bat, which is how this mess started
    const hasCount = e.balls !== undefined && e.strikes !== undefined;
    const freshCount = hasCount && e.balls === 0 && e.strikes === 0;
    const contextChanged =
      !cur || cur.slot !== slot || cur.inning !== e.inning;
    // Without a recorded count, fall back to the old heuristic.
    const startNew = hasCount
      ? freshCount || contextChanged
      : contextChanged || cur.name !== e.batter;

    if (startNew) {
      cur = {
        slot: slot,
        name: e.batter,
        hand: e.batterHand,
        inning: e.inning,
        pitches: 0,
        idxs: [], // positions within g.pitchLog
      };
      pas.push(cur);
    }
    cur.pitches++;
    cur.idxs.push(rec.i);
    // If the lineup was renamed partway through an at-bat, the later pitches
    // carry the new name. The at-bat belongs to whoever started it.
  });
  return pas;
}

// Build the editable model: every PA with its outcome label, the name the box
// score currently credits, and the name the pitch log says actually batted.
// ── Reading ownership out of the game log ────────────────────────────
// The box score's `results` array is the authoritative sequence of OUTCOMES
// for a lineup slot; what it gets wrong is only the name attached to them.
// The game log records each outcome as it happened, with the name as it was at
// the time, so it supplies the missing names in order.
//
// Pairing the outcomes against pitch groups instead does not work on real
// games: a plate appearance can have no pitches (an intentional walk), and
// pitches can have no outcome (the half ended with the batter still up), so
// the two sequences drift apart.

// Plate-appearance events. Run-scoring plays log the outcome in `meta`
// ("1 run score" / "single by Nate Brewer") rather than in `main`.
const _ABFIX_PA_MAIN =
  /^(FO|GO|LO|PO|Single|Double|Triple|Walk \(BB\)|Strikeout|Called K|Error|Fielder.s Choice|HBP|Double Play|Sac Fly|Sacrifice)/i;
const _ABFIX_RUNSCORE = /run[s]? score/i;
const _ABFIX_HIT_WORDS =
  /\b(single|double|triple|homer|walk|error|sac|groundout|flyout)\b/i;

// name|inning|isTop -> lineup slot, taken from the pitch log. This is what
// separates two stints by the same player in different slots.
function _abfixSlotIndex(g) {
  const idx = {};
  (g.pitchLog || []).forEach((e) => {
    if (e.batter && e.batter !== "—")
      idx[e.batter + "|" + e.inning + "|" + e.isTop] = e.batterIdx;
  });
  return idx;
}

function _abfixKnownNames(g, isAway) {
  const s = new Set();
  (g.pitchLog || []).forEach((e) => {
    if (e.isTop === isAway && e.batter && e.batter !== "—") s.add(e.batter);
  });
  return [...s];
}

// Ordered plate appearances for one side, as the game log recorded them.
function _abfixGameLogPAs(g, isAway) {
  const names = _abfixKnownNames(g, isAway);
  const slotOf = _abfixSlotIndex(g);
  const out = [];
  (g.gameLog || [])
    .slice()
    .reverse() // stored newest-first
    .forEach((e) => {
      if (e.isTop !== isAway) return;
      const main = String(e.main || "");
      const meta = String(e.meta || "");
      const isPA =
        _ABFIX_PA_MAIN.test(main) ||
        (_ABFIX_RUNSCORE.test(main) && _ABFIX_HIT_WORDS.test(meta));
      if (!isPA) return;
      // Longest match first so one name can't be shadowed by another that
      // happens to be a substring of it.
      const hit = names
        .filter((n) => main.includes(n) || meta.includes(n))
        .sort((a, b) => b.length - a.length)[0];
      if (!hit) return;
      const slot = slotOf[hit + "|" + e.inning + "|" + e.isTop];
      if (slot === undefined) return;
      out.push({ name: hit, inning: e.inning, slot: slot });
    });
  return out;
}

function _abfixBuildSide(g, isAway) {
  // Once a game has been corrected, its at-bat ownership is stored on the
  // record. Re-deriving it would be wrong: the rebuilt rows are no longer in
  // lineup-slot order, so row index stops matching pitchLog.batterIdx and the
  // mapping drifts a little further every time the dialog is opened.
  const saved = (g.abfixPAs || []).filter((p) => p.isAway === isAway);
  if (saved.length) {
    return saved.map((p) => ({ ...p, entries: (p.idxs || []).map((i) => (g.pitchLog || [])[i]).filter(Boolean) }));
  }

  const rows = (isAway ? g.awayBatters : g.homeBatters) || [];
  const pitchPAs = _abfixPitchPAs(g, isAway);
  const glPAs = _abfixGameLogPAs(g, isAway);
  const out = [];

  // Pitches for a given player's stint in one inning, so a reassignment can
  // carry them along.
  const pitchIdxsFor = (slot, name, inning) => {
    const idxs = [];
    (g.pitchLog || []).forEach((e, i) => {
      if (
        e.isTop === isAway &&
        e.batterIdx === slot &&
        e.inning === inning &&
        e.batter === name
      )
        idxs.push(i);
    });
    return idxs;
  };

  // First pass over an untouched game: rows came straight from the lineup, so
  // here (and only here) the row index IS the lineup slot.
  rows.forEach((row, slot) => {
    const labels = row.results || [];
    if (!labels.length) return;

    const slotNames = [
      ...new Set(pitchPAs.filter((p) => p.slot === slot).map((p) => p.name)),
    ].filter((n) => n && n !== "—");
    const fromLog = glPAs.filter((p) => p.slot === slot);

    // One name ever batted in this slot — the box score is already right, so
    // there is nothing to re-derive and nothing that can go wrong.
    const singleOccupant = slotNames.length <= 1;
    // Otherwise trust the game log, but only when its count agrees exactly
    // with the outcomes. A mismatch means something wasn't logged, and a
    // shifted mapping would be worse than asking.
    const useLog = !singleOccupant && fromLog.length === labels.length;

    if (!singleOccupant && !useLog) {
      out._misaligned = (out._misaligned || []).concat([
        {
          slot: slot,
          name: row.name,
          labels: labels.length,
          groups: fromLog.length,
        },
      ]);
    }

    const mine = pitchPAs.filter((p) => p.slot === slot);
    labels.forEach((label, j) => {
      const lg = useLog ? fromLog[j] : null;
      const pa = !useLog ? mine[j] : null;
      const who = lg ? lg.name : pa ? pa.name : null;
      const inning = lg ? lg.inning : pa ? pa.inning : null;
      const idxs = lg
        ? pitchIdxsFor(slot, lg.name, lg.inning)
        : pa
        ? pa.idxs
        : [];
      out.push({
        key: (isAway ? "a" : "h") + ":" + slot + ":" + j,
        isAway: isAway,
        slot: slot,
        idx: j,
        label: label,
        inning: inning,
        pitches: idxs.length,
        idxs: idxs,
        entries: idxs.map((i) => (g.pitchLog || [])[i]).filter(Boolean),
        creditedTo: row.name, // what the box score said before any correction
        actual: who, // who the game log / pitch log says actually batted
        hand: pa ? pa.hand : row.hand,
        assignedTo: who && who !== "—" ? who : row.name,
        source: singleOccupant ? "unchanged" : useLog ? "gamelog" : "pitchlog",
      });
    });
  });
  return out;
}

function _abfixBuildModel(g) {
  return { away: _abfixBuildSide(g, true), home: _abfixBuildSide(g, false) };
}

// The at-bat list, stripped of live pitch references, for storing on the game.
function _abfixSerializePAs(model) {
  return model.away.concat(model.home).map((p) => ({
    key: p.key,
    isAway: p.isAway,
    slot: p.slot,
    idx: p.idx,
    label: p.label,
    inning: p.inning,
    pitches: p.pitches,
    idxs: p.idxs || [],
    creditedTo: p.creditedTo,
    actual: p.actual,
    hand: p.hand,
    assignedTo: p.assignedTo,
  }));
}

// Does this side have any PA whose recorded batter differs from the box score?
function _abfixSideHasMismatch(pas) {
  return pas.some((p) => p.actual && p.actual !== "—" && p.actual !== p.creditedTo);
}

// Every name we could offer for a given side: who appears in this game, plus
// the My Team roster, so a starter whose name was overwritten is still pickable.
function _abfixNameOptions(g, isAway) {
  const names = new Set();
  ((isAway ? g.awayBatters : g.homeBatters) || []).forEach(
    (r) => r.name && names.add(r.name)
  );
  (g.pitchLog || []).forEach((e) => {
    if (e.isTop === isAway && e.batter && e.batter !== "—") names.add(e.batter);
  });
  const teamName = isAway ? g.awayTeam : g.homeTeam;
  if (typeof _getMyTeamName === "function" && _getMyTeamName() === teamName) {
    (typeof myTeamRoster !== "undefined" ? myTeamRoster : []).forEach(
      (p) => p.name && names.add(p.name)
    );
  }
  (typeof _opponents !== "undefined" ? _opponents : []).forEach((o) => {
    if (o.name === teamName)
      (o.roster || []).forEach((p) => p.name && names.add(p.name));
  });
  return [...names].sort();
}

// Jersey number for a name, from the game rows first then the rosters.
function _abfixNumFor(g, isAway, name) {
  const row = ((isAway ? g.awayBatters : g.homeBatters) || []).find(
    (r) => r.name === name
  );
  if (row && row.num) return row.num;
  const teamName = isAway ? g.awayTeam : g.homeTeam;
  if (typeof _getMyTeamName === "function" && _getMyTeamName() === teamName) {
    const m = (typeof myTeamRoster !== "undefined" ? myTeamRoster : []).find(
      (p) => p.name === name
    );
    if (m && m.num) return m.num;
  }
  let found = "";
  (typeof _opponents !== "undefined" ? _opponents : []).forEach((o) => {
    if (o.name !== teamName) return;
    const m = (o.roster || []).find((p) => p.name === name);
    if (m && m.num) found = m.num;
  });
  return found;
}

// Rebuild one side's batter rows from the PA assignments.
// Counting stats are recomputed from the labels; per-game totals that were
// never recorded per-PA (r, rbi, sb, cs, po) stay with the row that held them
// unless the user edited them in the dialog.
function _abfixRebuildSide(g, isAway, pas, manual) {
  const oldRows = (isAway ? g.awayBatters : g.homeBatters) || [];
  const byName = {};

  pas.forEach((pa) => {
    const name = pa.assignedTo;
    if (!name) return;
    if (!byName[name]) {
      byName[name] = { labels: [], pitches: 0, slot: pa.slot, hand: pa.hand };
    }
    byName[name].labels.push(pa.label);
    byName[name].pitches += pa.pitches || 0;
    byName[name].slot = Math.min(byName[name].slot, pa.slot);
  });

  const build = (name) => {
    const acc = byName[name];
    const prev = oldRows.find((r) => r.name === name) || {};
    const labels = acc.labels;
    const typeOf = labels.map(_abfixType);
    const count = (arr, fn) => arr.filter(fn).length;
    const m = (manual && manual[name]) || {};
    const keep = (field) =>
      m[field] !== undefined && m[field] !== ""
        ? Number(m[field]) || 0
        : prev[field] || 0;

    return {
      name: name,
      num: prev.num || _abfixNumFor(g, isAway, name) || "",
      pos: prev.pos || "",
      hand: prev.hand || acc.hand || "",
      pa: labels.length,
      ab: count(typeOf, (t) => t !== "BB" && t !== "HBP" && t !== "CI"),
      hits: count(typeOf, (t) => t === "H"),
      bb: count(typeOf, (t) => t === "BB"),
      k: count(typeOf, (t) => t === "K"),
      hbp: count(typeOf, (t) => t === "HBP"),
      ci: count(typeOf, (t) => t === "CI"),
      pitchesSeen: acc.pitches,
      doubles: count(labels, (l) => l === "2B"),
      triples: count(labels, (l) => l === "3B"),
      hr: count(labels, (l) => l === "HR"),
      sb: keep("sb"),
      cs: keep("cs"),
      po: keep("po"),
      r: keep("r"),
      rbi: keep("rbi"),
      results: labels,
    };
  };

  // Emit in batting order, and never silently drop anyone: a lineup row with
  // no plate appearances at all (a sub who didn't bat, a pitcher who never
  // came up) is carried through untouched, and a player whose at-bats all
  // moved away is kept only if they still hold other stats worth preserving.
  const out = [];
  const used = new Set();
  oldRows.forEach((row) => {
    if (!row || !row.name) return;
    if (byName[row.name]) {
      out.push(build(row.name));
      used.add(row.name);
      return;
    }
    const hadPAs = (row.results || []).length > 0;
    if (!hadPAs) {
      out.push(row); // never batted — leave exactly as it was
    } else if (row.r || row.rbi || row.sb || row.cs || row.po) {
      // Every at-bat was reassigned elsewhere, but they still have other
      // recorded stats — keep the row with the batting line zeroed out.
      out.push({
        ...row,
        pa: 0, ab: 0, hits: 0, bb: 0, k: 0, hbp: 0, ci: 0,
        pitchesSeen: 0, doubles: 0, triples: 0, hr: 0,
        results: [],
      });
    }
  });
  // Players restored from the pitch log who had no row of their own, placed
  // by the lineup slot they batted in.
  Object.keys(byName)
    .filter((n) => !used.has(n))
    .sort((a, b) => byName[a].slot - byName[b].slot)
    .forEach((n) => out.push(build(n)));

  return out;
}

// ── UI ───────────────────────────────────────────────────────────────

// Open the fixer for a completed game out of game history.
async function abfixOpen(gameId) {
  let g = null;
  try {
    // Read the stored record rather than the in-memory copy, so we always
    // edit and write back the real thing.
    const raw = await window.storage.get(gameId, true);
    if (raw?.value) g = JSON.parse(raw.value);
  } catch (e) {
    console.error("abfixOpen load error:", e);
  }
  if (!g) {
    toast("Couldn't load that game.");
    return;
  }
  _abfixGame = g;
  _abfixModel = _abfixBuildModel(g);
  document.getElementById("abfix-modal").style.display = "flex";
  _abfixRender();
}

function closeAbfixModal() {
  document.getElementById("abfix-modal").style.display = "none";
  _abfixGame = null;
  _abfixModel = null;
}

function _abfixRender() {
  const g = _abfixGame;
  if (!g) return;
  document.getElementById("abfix-title").textContent =
    "Fix At-Bats — " + g.awayTeam + " vs " + g.homeTeam;

  const mismatches =
    _abfixModel.away.filter((p) => p.actual && p.actual !== p.creditedTo)
      .length +
    _abfixModel.home.filter((p) => p.actual && p.actual !== p.creditedTo)
      .length;
  const misaligned = (_abfixModel.away._misaligned || []).concat(
    _abfixModel.home._misaligned || []
  );
  const warn = misaligned.length
    ? `<div style="margin-top:7px;padding:7px 9px;border-radius:6px;background:rgba(204,26,26,.1);color:#cc1a1a;font-size:11px;line-height:1.45">
        <b>Heads up:</b> for ${misaligned
          .map(
            (m) =>
              escHtml(m.name || "slot " + m.slot) +
              " (" +
              m.labels +
              " outcomes vs " +
              m.groups +
              " at-bats in the pitch log)"
          )
          .join(", ")} the outcomes and the pitch log don't line up one-to-one.
        The innings shown for those may be off. Check them against the game log before applying.
      </div>`
    : "";

  document.getElementById("abfix-desc").innerHTML =
    (mismatches
      ? `<b>${mismatches} at-bat${
          mismatches !== 1 ? "s are" : " is"
        } credited to the wrong player.</b> The pitch log recorded who actually batted, and those are pre-selected below. Review and apply.`
      : "Every at-bat matches the player recorded on its pitches. You can still reassign any of them by hand.") +
    warn;

  const side = (label, teamName, pas, isAway) => {
    if (!pas.length)
      return `<div style="font-size:12px;color:var(--text3);padding:6px 0">No recorded at-bats for ${escHtml(
        teamName
      )}.</div>`;
    const opts = _abfixNameOptions(g, isAway);
    const rows = pas
      .map((pa) => {
        const changed = pa.actual && pa.actual !== pa.creditedTo;
        return `<div style="display:flex;align-items:center;gap:8px;padding:5px 8px;border-bottom:1px solid var(--border);${
          changed ? "background:rgba(204,26,26,.06)" : ""
        }">
        <span style="width:54px;flex-shrink:0;font-size:10px;color:var(--text3);font-family:'Barlow',sans-serif">${
          pa.inning ? "Inn " + pa.inning : "—"
        }</span>
        <span style="width:42px;flex-shrink:0;font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:13px;color:var(--accent)">${escHtml(
          pa.label
        )}</span>
        <span style="width:46px;flex-shrink:0;font-size:10px;color:var(--text3)">${
          pa.pitches
        }p</span>
        <select onchange="abfixAssign('${pa.key}', this.value)" style="flex:1;min-width:0;padding:4px 6px;border:1px solid var(--border2);border-radius:5px;background:var(--surface3);color:var(--text);font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:12px">
          ${opts
            .map(
              (n) =>
                `<option value="${escHtml(n)}"${
                  n === pa.assignedTo ? " selected" : ""
                }>${escHtml(n)}</option>`
            )
            .join("")}
        </select>
        ${
          changed
            ? `<span title="Box score credited ${escHtml(
                pa.creditedTo
              )}, pitch log recorded ${escHtml(
                pa.actual
              )}" style="flex-shrink:0;font-size:9px;font-family:'Barlow Condensed',sans-serif;font-weight:700;padding:2px 6px;border-radius:4px;background:rgba(204,26,26,.14);color:#cc1a1a">WAS ${escHtml(
                pa.creditedTo
              )}</span>`
            : ""
        }
      </div>`;
      })
      .join("");
    return `<div style="margin-bottom:14px">
      <div style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:12px;letter-spacing:1.4px;text-transform:uppercase;color:var(--text3);margin-bottom:5px">${escHtml(
        teamName
      )}</div>
      ${rows}
    </div>`;
  };

  document.getElementById("abfix-body").innerHTML =
    side("away", g.awayTeam, _abfixModel.away, true) +
    side("home", g.homeTeam, _abfixModel.home, false) +
    _abfixManualSection();
}

// Runs/RBI/SB/CS were never stored per at-bat, so they can't follow a
// reassignment — surface them as editable totals for anyone affected.
function _abfixManualSection() {
  const g = _abfixGame;
  const affected = [];
  [
    ["away", _abfixModel.away, true],
    ["home", _abfixModel.home, false],
  ].forEach(([, pas, isAway]) => {
    const names = new Set();
    pas.forEach((p) => {
      if (p.actual && p.actual !== p.creditedTo) {
        names.add(p.creditedTo);
        names.add(p.assignedTo);
      }
    });
    names.forEach((n) => {
      const prev =
        ((isAway ? g.awayBatters : g.homeBatters) || []).find(
          (r) => r.name === n
        ) || {};
      affected.push({ isAway, name: n, prev });
    });
  });
  if (!affected.length) return "";

  const box = (isAway, name, field, val) =>
    `<input type="number" min="0" value="${val || 0}" oninput="abfixManual('${
      isAway ? "a" : "h"
    }','${escAttr(name)}','${field}',this.value)" style="width:48px;padding:3px 5px;border:1px solid var(--border2);border-radius:5px;background:var(--surface3);color:var(--text);font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:12px;text-align:center">`;

  return `<div style="margin-top:6px;padding-top:12px;border-top:1px solid var(--border2)">
    <div style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:12px;letter-spacing:1.4px;text-transform:uppercase;color:var(--text3);margin-bottom:3px">Runs &amp; RBI — set by hand</div>
    <div style="font-size:11px;color:var(--text3);margin-bottom:8px;font-family:'Barlow',sans-serif;line-height:1.45">These were only ever saved as game totals, never per at-bat, so they can't be split automatically. Current values shown — adjust to match what actually happened.</div>
    ${affected
      .map(
        (a) => `<div style="display:flex;align-items:center;gap:10px;padding:4px 0">
      <span style="flex:1;min-width:0;font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:13px">${escHtml(
        a.name
      )}</span>
      <span style="font-size:10px;color:var(--text3)">R</span>${box(
        a.isAway,
        a.name,
        "r",
        a.prev.r
      )}
      <span style="font-size:10px;color:var(--text3)">RBI</span>${box(
        a.isAway,
        a.name,
        "rbi",
        a.prev.rbi
      )}
      <span style="font-size:10px;color:var(--text3)">SB</span>${box(
        a.isAway,
        a.name,
        "sb",
        a.prev.sb
      )}
      <span style="font-size:10px;color:var(--text3)">CS</span>${box(
        a.isAway,
        a.name,
        "cs",
        a.prev.cs
      )}
    </div>`
      )
      .join("")}
  </div>`;
}

let _abfixManualVals = { a: {}, h: {} };

function abfixManual(sideKey, name, field, value) {
  if (!_abfixManualVals[sideKey][name]) _abfixManualVals[sideKey][name] = {};
  _abfixManualVals[sideKey][name][field] = value;
}

function abfixAssign(key, name) {
  const all = _abfixModel.away.concat(_abfixModel.home);
  const pa = all.find((p) => p.key === key);
  if (pa) pa.assignedTo = name;
}

async function abfixApply() {
  const g = _abfixGame;
  if (!g) return;
  const btn = document.getElementById("abfix-apply-btn");
  btn.textContent = "Saving…";
  btn.disabled = true;

  try {
    // Keep the pitch log in step with the box score. Normally it's already
    // right — it's what we read the truth from — but if an at-bat was pointed
    // at someone other than the recorded batter, those pitches have to follow,
    // or pitch-by-pitch views, spray charts and pitches-seen disagree with the
    // corrected totals.
    // Written unconditionally rather than only when it differs from the
    // recorded batter: if an at-bat was overridden, applied, then set back,
    // a conditional write would leave the earlier override in the pitch log.
    _abfixModel.away.concat(_abfixModel.home).forEach((pa) => {
      if (!pa.assignedTo) return;
      (pa.idxs || []).forEach((i) => {
        const e = (g.pitchLog || [])[i];
        if (e) e.batter = pa.assignedTo;
      });
    });

    g.awayBatters = _abfixRebuildSide(
      g,
      true,
      _abfixModel.away,
      _abfixManualVals.a
    );
    g.homeBatters = _abfixRebuildSide(
      g,
      false,
      _abfixModel.home,
      _abfixManualVals.h
    );
    // Persist the at-bat ownership itself. This is what makes reopening and
    // re-applying stable: the next open reads these assignments instead of
    // re-deriving them from rows whose order this rebuild just changed.
    g.abfixPAs = _abfixSerializePAs(_abfixModel);

    // Flag the resumable snapshot: it's slot-keyed, so it still holds the
    // pre-correction attribution and resuming would quietly undo this fix.
    if (g.resumable) g.resumable._abfixedAt = new Date().toISOString();

    await window.storage.set(g.id, JSON.stringify(g), true);
  } catch (e) {
    console.error("abfixApply error:", e);
    toast("Couldn't save the corrected game: " + (e.message || e));
    btn.textContent = "Apply Corrections";
    btn.disabled = false;
    return;
  }

  _abfixManualVals = { a: {}, h: {} };
  const id = g.id;
  closeAbfixModal();

  // Every stats surface recomputes from allGames via getTeamGames(), so the
  // one thing that matters is reloading it — but re-render the panels that
  // keep their own view state so nothing is left showing pre-fix numbers.
  try {
    allGames = await loadAllGames();
  } catch (e) {
    console.error("abfix reload error:", e);
  }
  if (typeof hubRefreshAll === "function") {
    try {
      await hubRefreshAll(); // Stats Hub: team tables, player pages, leaderboards
    } catch (e) {}
  }
  if (typeof myTeamRender === "function") {
    try {
      myTeamRender(); // My Team roster panel
    } catch (e) {}
  }
  if (
    typeof scoutOverviewLoad === "function" &&
    document.getElementById("panel-scout-overview")?.classList.contains("on")
  ) {
    try {
      await scoutOverviewLoad(); // scouting cards / reports, if open
    } catch (e) {}
  }
  if (typeof renderLiveScoutingTab === "function") {
    try {
      renderLiveScoutingTab();
    } catch (e) {}
  }

  toast("At-bats reassigned — box score and all stats updated.");
  // Drop back into the game so the corrected box score is visible immediately.
  if (typeof showView === "function") {
    try {
      showView("game", id);
    } catch (e) {}
  }
}
