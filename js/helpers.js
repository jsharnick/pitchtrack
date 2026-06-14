// ===================== SCOREBUG =====================
function updateScoreBug() {
  qs("bug-away-score").textContent = S.awayScore;
  qs("bug-home-score").textContent = S.homeScore;
  qs("away-score-val").textContent = S.awayScore;
  qs("home-score-val").textContent = S.homeScore;
  qs("bug-inning-num").textContent = S.inning;
  qs("bug-inning-half").textContent = S.isTop ? "TOP" : "BOT";
  qs("inning-display-num").textContent = S.inning;
  qs("inning-display-half").textContent = S.isTop ? "TOP" : "BOT";
  qs("arrow-top").classList.toggle("active", S.isTop);
  qs("arrow-bot").classList.toggle("active", !S.isTop);
  qs("half-top").classList.toggle("active", S.isTop);
  qs("half-bot").classList.toggle("active", !S.isTop);
  for (let i = 1; i <= 4; i++)
    qs(`b${i}`).className =
      "count-dot" + (S.balls >= i ? " active-ball" : "");
  for (let i = 1; i <= 3; i++)
    qs(`s${i}`).className =
      "count-dot" + (S.strikes >= i ? " active-strike" : "");
  for (let i = 1; i <= 3; i++)
    qs(`o${i}`).className = "out-dot" + (S.outs >= i ? " active" : "");
  qs("base-1st").classList.toggle("occupied", !!S.bases["1st"]);
  qs("base-2nd").classList.toggle("occupied", !!S.bases["2nd"]);
  qs("base-3rd").classList.toggle("occupied", !!S.bases["3rd"]);
  const p = activePitcher();
  qs("bug-pitcher-name").textContent = p
    ? `#${p.num} ${p.name} (${p.hand || "R"}HP)`
    : "—";
  qs("bug-pitcher-stats").textContent = p
    ? `${p.pitches}P · ${p.k}K · ${p.bb}BB`
    : "";
  const b = currentBatter(),
    bs = getBatterStats(currentBatterKey());
  qs("bug-batter-name").textContent = b
    ? `#${b.num || ""} ${b.name}`
    : "—";
  qs("bug-batter-stats").textContent = `${bs.hits}-${bs.ab} · ${
    bs.bb
  }BB · ${bs.pa || 0}PA`;
  qs("ab-strip-batter").textContent =
    (b ? b.name.toUpperCase() : "AT BAT") +
    ` — ${S.balls}-${S.strikes}`;
  const an = awayName(),
    hn = homeName();
  qs("bug-away-name").textContent = an;
  qs("bug-home-name").textContent = hn;
  qs("away-label-ctrl").textContent = an;
  qs("home-label-ctrl").textContent = hn;
  // Pitcher team label
  qs("pitcher-team-label").textContent = S.isTop
    ? `(${hn})`
    : `(${an})`;
  // Update IN/OUT zone labels based on batter handedness
  try {
    updateZoneHandednessLabels();
  } catch (e) {}
  // Sync mobile score panel
  try {
    updateMobScore();
  } catch (e) {}
}

// ===================== ZONE =====================
let placeholderEl = null;
function handleZoneClick(e) {
  const r = qs("strike-zone").getBoundingClientRect();
  S.pitchX = ((e.clientX - r.left) / r.width) * 100;
  S.pitchY = ((e.clientY - r.top) / r.height) * 100;
  if (placeholderEl) placeholderEl.remove();
  placeholderEl = document.createElement("div");
  placeholderEl.className = "zone-placeholder";
  placeholderEl.style.cssText = `left:${S.pitchX}%;top:${S.pitchY}%;`;
  qs("strike-zone").appendChild(placeholderEl);
  const inZone = isInZone(S.pitchX, S.pitchY);
  const hint = qs("zone-hint");
  hint.textContent = inZone
    ? "📍 In zone — Strike likely"
    : "📍 Outside zone — Ball likely";
  hint.className = inZone ? "in-zone" : "out-zone";
  checkCommitReady();
}
function isInZone(px, py) {
  return px >= 31 && px <= 69 && py >= 30.9 && py <= 69.1;
}

// ===================== OUTCOMES =====================
let inPlayOpen = false;
let _inPlayCat = null; // 'hit' | 'out' | 'sac' | 'err'

function toggleInPlay() {
  inPlayOpen = !inPlayOpen;
  qs("inplay-grid").style.display = inPlayOpen ? "block" : "none";
  qs("inplay-toggle-btn").classList.toggle("open", inPlayOpen);
  if (!inPlayOpen) {
    _inPlayCat = null;
    ["hit", "out", "sac", "err"].forEach((c) => {
      const sub = qs("ipc-sub-" + c);
      if (sub) sub.style.display = "none";
      const btn = qs("ipc-" + c);
      if (btn) {
        btn.style.background = "var(--surface)";
        btn.style.borderColor = "var(--border2)";
        btn.style.color = "var(--text2)";
      }
    });
    if (S.selectedOutcome && isContactOutcome(S.selectedOutcome)) {
      S.selectedOutcome = null;
      qsa(".outcome-btn").forEach((b) =>
        b.classList.remove("selected")
      );
      checkCommitReady();
    }
  }
}

function selectInPlayCatError() {
  // Directly select error outcome and style the button like an active category
  ["hit", "out", "sac", "err"].forEach((c) => {
    const btn = qs("ipc-" + c);
    const sub = qs("ipc-sub-" + c);
    if (btn) {
      btn.style.background = "var(--surface)";
      btn.style.borderColor = "var(--border2)";
      btn.style.color = "var(--text2)";
      btn.style.borderWidth = "1.5px";
    }
    if (sub) sub.style.display = "none";
  });
  const errBtn = qs("ipc-err");
  if (errBtn) {
    errBtn.style.background = "rgba(204,26,26,.08)";
    errBtn.style.borderColor = "var(--accent)";
    errBtn.style.color = "var(--accent)";
    errBtn.style.borderWidth = "2px";
  }
  selectOutcome("error");
}

function selectInPlayCat(cat) {
  _inPlayCat = cat;
  // Highlight active category button, hide all sub-panels
  ["hit", "out", "sac", "err"].forEach((c) => {
    const btn = qs("ipc-" + c);
    const sub = qs("ipc-sub-" + c);
    const active = c === cat;
    if (btn) {
      btn.style.background = active
        ? "rgba(204,26,26,.08)"
        : "var(--surface)";
      btn.style.borderColor = active
        ? "var(--accent)"
        : "var(--border2)";
      btn.style.color = active ? "var(--accent)" : "var(--text2)";
      btn.style.borderWidth = active ? "2px" : "1.5px";
    }
    if (sub) sub.style.display = active ? "block" : "none";
  });
  // Clear any previously selected contact outcome
  if (S.selectedOutcome && isContactOutcome(S.selectedOutcome)) {
    S.selectedOutcome = null;
    qsa(".outcome-btn").forEach((b) => b.classList.remove("selected"));
    checkCommitReady();
  }
}
function selectOutcome(o) {
  // One-at-a-time: if previous was a non-inplay outcome, deselect it
  // In-play sub-outcomes can coexist with the inplay toggle being open
  S.selectedOutcome = o;
  qsa(".outcome-btn").forEach((b) => b.classList.remove("selected"));
  const btn = document.querySelector(
    `.outcome-btn[data-outcome="${o}"]`
  );
  if (btn) btn.classList.add("selected");
  // Also keep inplay-toggle visually open if selecting a contact outcome
  if (isContactOutcome(o)) {
    qs("inplay-toggle-btn").classList.add("open");
  } else {
    // Close inplay grid if non-contact selected
    if (inPlayOpen) {
      inPlayOpen = false;
      qs("inplay-grid").style.display = "none";
      qs("inplay-toggle-btn").classList.remove("open");
    }
  }
  checkCommitReady();
}
// ── Pitch type catalog ──────────────────────────────────────────────────
const ALL_PITCH_TYPES = [
  { key: "4SFB", label: "4SFB", name: "4-Seam Fastball" },
  { key: "2SFB", label: "2SFB", name: "2-Seam Fastball" },
  { key: "SNK", label: "SNK", name: "Sinker" },
  { key: "CUT", label: "CUT", name: "Cutter" },
  { key: "CRV", label: "CRV", name: "Curveball" },
  { key: "SLD", label: "SLD", name: "Slider" },
  { key: "SW", label: "SW", name: "Sweeper" },
  { key: "SLV", label: "SLV", name: "Slurve" },
  { key: "CH", label: "CH", name: "Changeup" },
  { key: "SPL", label: "SPL", name: "Splitter" },
  { key: "VC", label: "VC", name: "Vulcan Change" },
  { key: "KN", label: "KN", name: "Knuckleball" },
  { key: "SCR", label: "SCR", name: "Screwball" },
];
// Keys used for keyboard shortcuts 1-8 (updated whenever grid renders)
let _currentPitchKeys = [
  "4SFB",
  "CRV",
  "SLD",
  "CH",
  "CUT",
  "SPL",
  "SNK",
  "KN",
];

// Render the dynamic pitch type button grid based on a pitcher's repertoire.
// pitchTypes: array of {key, label} — empty/null = full default 8-button grid.
function renderPitchTypeGrid(pitchTypes) {
  const container = document.getElementById("pitch-type-grid");
  if (!container) return;

  const DEFAULT_EIGHT = [
    { key: "4SFB", label: "4SFB" },
    { key: "CRV", label: "CRV" },
    { key: "SLD", label: "SLD" },
    { key: "CH", label: "CH" },
    { key: "CUT", label: "CUT" },
    { key: "SPL", label: "SPL" },
    { key: "SNK", label: "SNK" },
    { key: "KN", label: "KN" },
  ];
  const types =
    pitchTypes && pitchTypes.length ? pitchTypes : DEFAULT_EIGHT;
  const n = types.length;

  const btnHTML = (t) =>
    `<button class="pitch-type-btn" data-type="${t.key}" onclick="selectPitchType('${t.key}')">${t.label}</button>`;

  if (n <= 3) {
    // Single row
    container.style.cssText =
      "flex:1;display:grid;grid-template-columns:repeat(" +
      n +
      ",1fr);gap:4px";
    container.innerHTML = types.map(btnHTML).join("");
  } else if (n % 2 === 0) {
    // Even: n/2 columns × 2 rows
    const cols = n / 2;
    container.style.cssText =
      "flex:1;display:grid;grid-template-columns:repeat(" +
      cols +
      ",1fr);gap:4px";
    container.innerHTML = types.map(btnHTML).join("");
  } else {
    // Odd ≥ 5: first (n-1) in a left grid, last button spans full height on right
    const main = types.slice(0, n - 1);
    const last = types[n - 1];
    const leftCols = (n - 1) / 2;
    container.style.cssText =
      "flex:1;display:flex;gap:4px;align-items:stretch";
    container.innerHTML =
      `<div style="flex:${leftCols};display:grid;grid-template-columns:repeat(${leftCols},1fr);gap:4px">` +
      main.map(btnHTML).join("") +
      `</div>` +
      `<button class="pitch-type-btn" data-type="${last.key}" onclick="selectPitchType('${last.key}')" style="flex:1;writing-mode:horizontal-tb">${last.label}</button>`;
  }

  // Restore selected state
  if (S.selectedPitchType) {
    const btn = container.querySelector(
      `.pitch-type-btn[data-type="${S.selectedPitchType}"]`
    );
    if (btn) btn.classList.add("selected");
  }
  // Update keyboard shortcut keys
  _currentPitchKeys = types.map((t) => t.key);
}

function selectPitchType(t) {
  S.selectedPitchType = t;
  qsa(".pitch-type-btn").forEach((b) => b.classList.remove("selected"));
  const btn = document.querySelector(
    `.pitch-type-btn[data-type="${t}"]`
  );
  if (btn) btn.classList.add("selected");
}

// ── Per-pitcher pitch type editor ────────────────────────────────────────
let _editingPitchTypes = []; // [] = use full default grid

function _isPitcherPos(pos) {
  return /RHP|LHP|^P$|\/P$|P\//i.test(pos || "");
}

// Show or hide pitch section when position dropdown changes
function _syncPitchSection(sectionId, pos) {
  const el = document.getElementById(sectionId);
  if (!el) return;
  if (_isPitcherPos(pos)) {
    el.style.display = "";
    _refreshPitchEditor(sectionId);
  } else {
    el.style.display = "none";
  }
}

// Open pitch editor for a given modal section with existing pitchTypes
function _renderPitchTypeEditor(sectionId, pitchTypes) {
  _editingPitchTypes =
    pitchTypes && pitchTypes.length
      ? pitchTypes.map((t) => ({ key: t.key, label: t.label || t.key }))
      : [];
  _refreshPitchEditor(sectionId);
}

function _refreshPitchEditor(sectionId) {
  const container = document.getElementById(sectionId);
  if (!container) return;
  const sel = new Set(_editingPitchTypes.map((t) => t.key));

  const chipStyle = (on) =>
    `display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border:1.5px solid ${
      on ? "var(--accent)" : "var(--border2)"
    };border-radius:20px;cursor:pointer;background:${
      on ? "rgba(204,26,26,.08)" : "var(--surface3)"
    };font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:13px;color:${
      on ? "var(--accent)" : "var(--text2)"
    };user-select:none;margin:3px`;

  let chips = ALL_PITCH_TYPES.map((pt) => {
    const on = sel.has(pt.key);
    return `<span style="${chipStyle(
      on
    )}" onclick="_togglePitch('${sectionId}','${pt.key}')">
      ${pt.key} <span style="font-weight:400;font-size:10px;color:${
      on ? "var(--accent)" : "var(--text3)"
    }">${pt.name}</span>
    </span>`;
  }).join("");

  let labels = "";
  if (_editingPitchTypes.length) {
    labels =
      `<div style="margin-top:10px">
      <div style="font-size:10px;color:var(--text3);font-family:'Barlow',sans-serif;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Button Labels — edit to customize display</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">` +
      _editingPitchTypes
        .map(
          (pt, i) =>
            `<div style="display:flex;align-items:center;gap:4px;padding:4px 8px;background:var(--surface3);border:1px solid var(--border2);border-radius:6px">
          <span style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:12px;color:var(--text3)">${pt.key}</span>
          <span style="color:var(--text3);font-size:11px">→</span>
          <input value="${pt.label}" onchange="_updatePitchLabel(${i},this.value)" onclick="event.stopPropagation()" style="width:42px;padding:2px 4px;border:1px solid var(--border2);border-radius:4px;font-family:'Barlow Condensed',sans-serif;font-size:13px;font-weight:700;text-align:center;background:white">
        </div>`
        )
        .join("") +
      `</div></div>`;
  }

  container.innerHTML = `
    <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border)">
      <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:8px">
        <div>
          <div style="font-size:10px;color:var(--text3);font-family:'Barlow',sans-serif;text-transform:uppercase;letter-spacing:1px;font-weight:600">Pitch Repertoire</div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px">Select which pitches show in the tracker. Leave all unchecked to show the full default grid.</div>
        </div>
        <button onclick="_resetPitchTypes('${sectionId}')" style="background:none;border:none;color:var(--text3);font-size:11px;cursor:pointer;text-decoration:underline;white-space:nowrap;margin-left:10px">Reset</button>
      </div>
      <div style="line-height:1">${chips}</div>
      ${labels}
    </div>`;
}

function _togglePitch(sectionId, key) {
  const idx = _editingPitchTypes.findIndex((t) => t.key === key);
  if (idx >= 0) {
    _editingPitchTypes.splice(idx, 1);
  } else {
    const def = ALL_PITCH_TYPES.find((t) => t.key === key);
    _editingPitchTypes.push({ key, label: def ? def.key : key });
  }
  _refreshPitchEditor(sectionId);
}

function _updatePitchLabel(idx, val) {
  if (_editingPitchTypes[idx])
    _editingPitchTypes[idx].label =
      val.trim() || _editingPitchTypes[idx].key;
}

function _resetPitchTypes(sectionId) {
  _editingPitchTypes = [];
  _refreshPitchEditor(sectionId);
}

// Resolve pitchTypes for a game pitcher: use in-game value if set,
// otherwise fall back to the matching roster player's pitchTypes.
function _resolveActivePitcherTypes(gamePitcher) {
  if (!gamePitcher) return [];
  if (gamePitcher.pitchTypes && gamePitcher.pitchTypes.length)
    return gamePitcher.pitchTypes;
  // Fall back: look in both rosters for a name+num match
  const allRosters = [
    ...(myTeamRoster || []),
    ...(_opponents || []).flatMap((o) => o.roster || []),
  ];
  const match = allRosters.find(
    (p) =>
      p.name === gamePitcher.name &&
      (!gamePitcher.num || p.num === gamePitcher.num)
  );
  return match && match.pitchTypes ? match.pitchTypes : [];
}

// After saving a roster player, push their pitchTypes to any matching
// in-game pitcher and re-render the grid if they're currently active.
function _syncRosterPitchTypesToGame(rosterPlayer) {
  const newTypes = rosterPlayer.pitchTypes || [];
  let found = false;
  [S.pitchersAway, S.pitchersHome].forEach(function (list) {
    (list || []).forEach(function (gp) {
      if (
        gp.name === rosterPlayer.name &&
        (!rosterPlayer.num || gp.num === rosterPlayer.num)
      ) {
        gp.pitchTypes = newTypes;
        found = true;
      }
    });
  });
  // Re-render grid immediately if we updated anyone — activePitcher() may
  // be the "last in list" fallback even without gp.active === true
  if (found) {
    renderPitchTypeGrid(_resolveActivePitcherTypes(activePitcher()));
    S.selectedPitchType = null;
  }
}
function checkCommitReady() {
  qs("commit-pitch").disabled = !(
    S.selectedOutcome && S.pitchX !== null
  );
}

