// ===== UTILS =====
function escHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function escAttr(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/'/g, "&#39;")
    .replace(/"/g, "&quot;");
}
function hubNavPlayer(el, type) {
  const team = el.getAttribute("data-team");
  const name = el.getAttribute("data-name");
  showView(type, { team, name });
}
function teamEmoji(name) {
  const e = ["⚾", "🏆", "🎯", "⚡", "🔥", "🌟", "💥", "🏅"];
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % e.length;
  return e[Math.abs(h)];
}

// ===== BOOT =====
async function hubBoot() {
  myTeamLoad();
  oppLoad();
  // hubRefreshAll handles all tab selection and content rendering
  await hubRefreshAll();
}
// ===================== PITCH CLOCK VIOLATION =====================
function openPitchClockModal() {
  qs("pcm-count").textContent = `${S.balls} - ${S.strikes}  ·  ${
    S.outs
  } out${S.outs !== 1 ? "s" : ""}`;
  qs("pitch-clock-modal").style.display = "flex";
}
function closePitchClockModal() {
  qs("pitch-clock-modal").style.display = "none";
}
function pitchClockViolation(type) {
  closePitchClockModal();
  if (type === "strike") {
    if (S.strikes >= 2) {
      S.outs++;
      const batter = currentBatter()?.name || "Batter";
      recordAtBatResult("K", "K");
      toast(`⏱ Auto Strike 3 — ${batter} out`);
      logEvent(
        "⏱",
        "Pitch Clock — Auto Strike 3",
        `${batter} out on clock violation · ${S.outs} out${
          S.outs !== 1 ? "s" : ""
        }`
      );
      if (S.outs >= 3) {
        handleThreeOuts();
        return;
      }
      nextBatter();
    } else {
      S.strikes++;
      const batter = currentBatter()?.name || "Batter";
      toast(`⏱ Auto Strike — Count: ${S.balls}-${S.strikes}`);
      logEvent(
        "⏱",
        "Pitch Clock — Auto Strike",
        `${batter} · Count: ${S.balls}-${S.strikes}`
      );
      updateScoreBug();
    }
  } else {
    if (S.balls >= 3) {
      const batter = currentBatter()?.name || "Batter";
      recordAtBatResult("BB", "BB");
      toast(`⏱ Auto Ball 4 — ${batter} walks`);
      logEvent(
        "⏱",
        "Pitch Clock — Auto Ball 4",
        `${batter} walks on clock violation`
      );
      advanceOnWalk();
    } else {
      S.balls++;
      const batter = currentBatter()?.name || "Batter";
      toast(`⏱ Auto Ball — Count: ${S.balls}-${S.strikes}`);
      logEvent(
        "⏱",
        "Pitch Clock — Auto Ball",
        `${batter} · Count: ${S.balls}-${S.strikes}`
      );
      updateScoreBug();
    }
  }
}

// ===================== PICKOFF & RUNNERS MODALS =====================
let _activePickoffOrRunnersAction = null;

function openPickoffModal() {
  const anyRunner = ["1st", "2nd", "3rd"].some((b) => S.bases[b]);
  if (!anyRunner) {
    toast("No runners on base");
    return;
  }
  qs("pickoff-modal").style.display = "flex";
}
function closePickoffModal() {
  qs("pickoff-modal").style.display = "none";
}

function commitIntentionalWalk() {
  const p = activePitcher();
  if (p) {
    p.bb = (p.bb || 0) + 1;
    p.ibb = (p.ibb || 0) + 1;
    p.bf = (p.bf || 0) + 1;
  }
  toast("Intentional Walk!");
  logEvent(
    "🚶",
    "Intentional Walk (IBB)",
    `${currentBatter()?.name || "Batter"} takes first · ${
      p ? p.name : ""
    }`
  );
  recordAtBatResult("BB", "BB");
  advanceOnWalk();
  _scheduleAutoSave();
}

function openRunnersModal() {
  const anyRunner = ["1st", "2nd", "3rd"].some((b) => S.bases[b]);
  if (!anyRunner) {
    toast("No runners on base");
    return;
  }
  qs("runners-modal").style.display = "flex";
}
function closeRunnersModal() {
  qs("runners-modal").style.display = "none";
}

function handlePickoffAction(action) {
  closePickoffModal();
  if (action === "balk") {
    activeRunnerBase =
      ["1st", "2nd", "3rd"].find((b) => S.bases[b]) || "1st";
    executeRunnerAction("balk");
    return;
  }
  _dispatchWithRunnerSelection(action);
}

function handleRunnersAction(action) {
  closeRunnersModal();
  if (action === "balk") {
    activeRunnerBase =
      ["1st", "2nd", "3rd"].find((b) => S.bases[b]) || "1st";
    executeRunnerAction("balk");
    return;
  }
  _dispatchWithRunnerSelection(action);
}

function _dispatchWithRunnerSelection(action) {
  const occupied = ["1st", "2nd", "3rd"].filter((b) => S.bases[b]);
  if (occupied.length === 0) {
    toast("No runners on base");
    return;
  }
  if (occupied.length === 1) {
    activeRunnerBase = occupied[0];
    if (action === "advances") {
      _openAdvancesDestinationPicker(occupied[0]);
    } else {
      executeRunnerAction(action);
    }
    return;
  }
  _activePickoffOrRunnersAction = action;
  _openRunnerPickerModal(action, occupied);
}

function _openRunnerPickerModal(action, occupied) {
  const titles = {
    "stolen-base": "Stolen Base",
    "caught-stealing": "Caught Stealing",
    "wild-pitch": "Wild Pitch",
    "passed-ball": "Passed Ball",
    "advance-error": "Error",
    scores: "Scores",
    "picked-off": "Picked Off",
    "pickoff-attempt": "Pickoff Attempt",
    advances: "Advances",
  };
  qs("rpm-title").textContent = titles[action] || "Select Runner";

  // Update each base square: highlight occupied, dim unoccupied
  ["1st", "2nd", "3rd"].forEach((base) => {
    const el = qs(`rpm-base-${base}`);
    if (!el) return;
    const span = el.querySelector("span");
    if (S.bases[base]) {
      el.style.borderColor = "var(--accent)";
      el.style.background = "var(--accent)";
      el.style.boxShadow = "0 0 10px rgba(232,200,74,0.6)";
      el.style.cursor = "pointer";
      if (span) span.style.color = "#1a1a1a";
      el.onclick = () => {
        closeRunnerPickerModal();
        activeRunnerBase = base;
        _activePickoffOrRunnersAction = null;
        if (action === "advances") {
          _openAdvancesDestinationPicker(base);
        } else {
          executeRunnerAction(action);
        }
      };
    } else {
      el.style.borderColor = "var(--text3)";
      el.style.background = "transparent";
      el.style.boxShadow = "none";
      el.style.cursor = "default";
      if (span) span.style.color = "var(--text3)";
      el.onclick = null;
    }
  });

  qs("runner-picker-modal").style.display = "flex";
}

function closeRunnerPickerModal() {
  qs("runner-picker-modal").style.display = "none";
  _activePickoffOrRunnersAction = null;
}

function _openAdvancesDestinationPicker(fromBase) {
  const destinations = {
    "1st": ["2nd", "3rd", "home"],
    "2nd": ["3rd", "home"],
    "3rd": ["home"],
  };
  const dests = destinations[fromBase] || [];
  const runnerName = S.runnerNames[fromBase] || fromBase + " base";
  qs("atm-title").textContent = "Advance To";
  qs(
    "atm-sub"
  ).textContent = `Moving runner from ${fromBase} (${runnerName})`;
  const container = qs("atm-buttons");
  container.innerHTML = "";
  dests.forEach((dest) => {
    const btn = document.createElement("button");
    btn.className =
      "ram-btn" + (dest === "home" ? " ram-btn-score" : "");
    btn.innerHTML = `<div class="ram-label">${
      dest === "home" ? "Home (Scores)" : dest
    }</div><div class="ram-sub">${fromBase} → ${dest}</div>`;
    btn.onclick = () => {
      closeAdvanceToModal();
      _executeAdvances(fromBase, dest);
    };
    container.appendChild(btn);
  });
  qs("advance-to-modal").style.display = "flex";
}

function closeAdvanceToModal() {
  qs("advance-to-modal").style.display = "none";
}

function _executeAdvances(fromBase, toBase) {
  const runnerName =
    S.runnerNames[fromBase] || currentBatter()?.name || "Runner";
  if (toBase === "home") {
    S.bases[fromBase] = false;
    addRun(fromBase);
    clearRunner(fromBase);
    toast(`🏃 Advances — ${runnerName} scores from ${fromBase}!`);
    logEvent(
      "🏠",
      "Advances (Scores)",
      `${runnerName}: ${fromBase} → home`
    );
  } else {
    S.bases[fromBase] = false;
    S.bases[toBase] = true;
    moveRunner(fromBase, toBase);
    toast(`🏃 Advances — ${runnerName}: ${fromBase} → ${toBase}`);
    logEvent(
      "🏃",
      "Advances",
      `${runnerName}: ${fromBase} → ${toBase}`
    );
  }
  updateScoreBug();
  renderLiveScoutingTab();
}

// ===================== EXPORT / IMPORT =====================
function _downloadJSON(payload, filename) {
  const a = document.createElement("a");
  a.href =
    "data:application/json;charset=utf-8," +
    encodeURIComponent(JSON.stringify(payload, null, 2));
  a.download = filename;
  a.click();
}

function _resolveTeamName(name, teams) {
  // Case-insensitive match — returns the existing casing if found, otherwise the new name
  const lower = name.toLowerCase();
  return teams.find((t) => t.toLowerCase() === lower) || name;
}

function _addTeamToIndex(name, teams) {
  const resolved = _resolveTeamName(name, teams);
  if (!teams.includes(resolved)) teams.push(resolved);
  return resolved; // return canonical name so game object can be updated
}

function _sanitizeFilename(s) {
  return s
    .replace(/[^a-zA-Z0-9_\-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 40);
}

async function exportAllData() {
  try {
    const keys = await window.storage.list("ptgame_", true);
    const games = [];
    for (const key of keys?.keys || []) {
      try {
        const raw = await window.storage.get(key, true);
        if (raw?.value) games.push(JSON.parse(raw.value));
      } catch (e) {}
    }
    if (!games.length) {
      toast("No saved games to export.");
      return;
    }
    games.sort((a, b) => b.date.localeCompare(a.date));
    const date = new Date().toISOString().split("T")[0];
    _downloadJSON(
      {
        exportedAt: new Date().toISOString(),
        gameCount: games.length,
        games,
      },
      `pitchtrack_all_${date}.json`
    );
    toast(
      `⬇ Exported ${games.length} game${games.length !== 1 ? "s" : ""}!`
    );
  } catch (e) {
    toast("Export failed — " + (e?.message || "error"));
  }
}

async function exportTeamData(teamName) {
  try {
    const keys = await window.storage.list("ptgame_", true);
    const games = [];
    for (const key of keys?.keys || []) {
      try {
        const raw = await window.storage.get(key, true);
        if (raw?.value) {
          const g = JSON.parse(raw.value);
          if (g.awayTeam === teamName || g.homeTeam === teamName)
            games.push(g);
        }
      } catch (e) {}
    }
    if (!games.length) {
      toast(`No games found for ${teamName}.`);
      return;
    }
    games.sort((a, b) => b.date.localeCompare(a.date));
    const date = new Date().toISOString().split("T")[0];
    const fname = `pitchtrack_${_sanitizeFilename(
      teamName
    )}_${date}.json`;
    _downloadJSON(
      {
        exportedAt: new Date().toISOString(),
        team: teamName,
        gameCount: games.length,
        games,
      },
      fname
    );
    toast(
      `⬇ Exported ${games.length} game${
        games.length !== 1 ? "s" : ""
      } for ${teamName}!`
    );
  } catch (e) {
    toast("Export failed — " + (e?.message || "error"));
  }
}

async function exportGameData(gameId) {
  try {
    const raw = await window.storage.get(gameId, true);
    if (!raw?.value) {
      toast("Game not found.");
      return;
    }
    const g = JSON.parse(raw.value);
    const date = g.date || new Date().toISOString().split("T")[0];
    const fname = `pitchtrack_${_sanitizeFilename(
      g.awayTeam
    )}_vs_${_sanitizeFilename(g.homeTeam)}_${date}.json`;
    _downloadJSON(
      {
        exportedAt: new Date().toISOString(),
        gameCount: 1,
        games: [g],
      },
      fname
    );
    toast(`⬇ Exported ${g.awayTeam} vs ${g.homeTeam}!`);
  } catch (e) {
    toast("Export failed — " + (e?.message || "error"));
  }
}

function triggerImport() {
  const input = document.getElementById("import-file-input");
  if (input) input.click();
}

async function handleImportFile(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }
  // Reset input so same file can be re-imported
  event.target.value = "";
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const games = data.games || (data.id ? [data] : []);
    if (!games.length) {
      toast("No games found in file.");
      return;
    }

    let imported = 0,
      skipped = 0;
    for (const g of games) {
      if (!g.id || !g.awayTeam || !g.homeTeam) {
        skipped++;
        continue;
      }
      // Don't overwrite if already exists — check first
      let exists = false;
      try {
        const chk = await window.storage.get(g.id, true);
        if (chk?.value) exists = true;
      } catch (e) {}
      if (exists) {
        skipped++;
        continue;
      }
      await window.storage.set(g.id, JSON.stringify(g), true);
      // Update team index
      const teamsRaw = await (async () => {
        try {
          return await window.storage.get("pitchtrack_teams", true);
        } catch (e) {
          return null;
        }
      })();
      const teams = teamsRaw ? JSON.parse(teamsRaw.value) : [];
      // Normalise team names to match existing casing
      g.awayTeam = _addTeamToIndex(g.awayTeam, teams);
      g.homeTeam = _addTeamToIndex(g.homeTeam, teams);
      await window.storage.set(
        "pitchtrack_teams",
        JSON.stringify(teams),
        true
      );
      imported++;
    }
    await hubRefreshAll();
    toast(
      `⬆ Imported ${imported} game${imported !== 1 ? "s" : ""}${
        skipped ? " · " + skipped + " skipped (already exist)" : ""
      }`
    );
  } catch (e) {
    toast("Import failed — " + (e?.message || "invalid file"));
    console.error("handleImportFile error:", e);
  }
}

// ===================== COUNT DOT CLICK =====================
function tweakCount(type, n) {
  if (type === "ball") {
    // If clicking an active dot (n <= current balls) → reduce to n-1; else set to n
    S.balls = S.balls >= n ? n - 1 : n;
    S.balls = Math.max(0, Math.min(4, S.balls));
  } else if (type === "strike") {
    S.strikes = S.strikes >= n ? n - 1 : n;
    S.strikes = Math.max(0, Math.min(2, S.strikes));
  } else if (type === "out") {
    S.outs = S.outs >= n ? n - 1 : n;
    S.outs = Math.max(0, Math.min(3, S.outs));
    if (S.outs >= 3) {
      handleThreeOuts();
      return;
    }
  }
  updateScoreBug();
}

// ===================== FIELDER MODAL =====================
let _fielderCallback = null;
let _fielderContext = null; // {outcome, logLabel, batter}
let _fielderPendingPO = null; // pos picked in step 1 (putout)
let _fielderAssists = []; // positions picked in step 2
let _fielderInAssistMode = false; // true after putout is selected
let _fielderSkipAssists = false; // true for flyout/lineout/sacfly (no assists)

// Error-mode multi-phase state
let _errorPhase = "fielder"; // "fielder" | "error-type" | "throw-direction" | "recipient"
let _errorFielder = null; // who fielded/threw the ball (always recorded)

function _errorChooseType(type) {
  const btnStyle = `padding:14px 10px;border-radius:10px;cursor:pointer;border:1.5px solid var(--border2);background:var(--surface3);color:var(--text);font-family:'Barlow Condensed',sans-serif;text-align:center;transition:all 0.15s;`;
  if (type === "fielding") {
    const result = {
      fielder: _errorFielder,
      errorPlayer: _errorFielder,
      errorType: "fielding",
    };
    _errorCloseAndCommit(result);
  } else {
    _errorPhase = "throw-direction";
    qs("fielder-title").textContent = "Who committed the error?";
    qs("fielder-sub").textContent = `${_errorFielder} threw the ball`;
    document.getElementById("fielder-skip-btn").textContent = "← Back";
    const div = document.getElementById("fielder-error-choice");
    div.innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:4px">
      <button onclick="_errorChooseThrow('bad-throw')" style="${btnStyle}">
        <div style="font-size:15px;font-weight:900;letter-spacing:0.5px">Bad Throw</div>
        <div style="font-size:10px;opacity:0.7;margin-top:3px">${_errorFielder} threw it poorly</div>
      </button>
      <button onclick="_errorChooseThrow('dropped')" style="${btnStyle}">
        <div style="font-size:15px;font-weight:900;letter-spacing:0.5px">Dropped Throw</div>
        <div style="font-size:10px;opacity:0.7;margin-top:3px">Recipient couldn't handle it</div>
      </button>
    </div>`;
  }
}

function _errorChooseThrow(direction) {
  if (direction === "bad-throw") {
    const result = {
      fielder: _errorFielder,
      errorPlayer: _errorFielder,
      errorType: "throwing",
      throwDir: "bad-throw",
    };
    _errorCloseAndCommit(result);
  } else {
    // Need to pick the recipient
    _errorPhase = "recipient";
    const choiceDiv = document.getElementById("fielder-error-choice");
    choiceDiv.style.display = "none";
    const fieldWrap = document.getElementById("fielder-field-wrap");
    fieldWrap.style.display = "block";
    qs("fielder-title").textContent = "Who dropped the throw?";
    qs(
      "fielder-sub"
    ).textContent = `${_errorFielder} threw — pick who couldn't handle it`;
    document.getElementById("fielder-skip-btn").textContent = "← Back";
    // Reset buttons, mark original fielder as thrower (gold, unselectable)
    document.querySelectorAll(".fpos-btn").forEach((b) => {
      b.classList.remove("selected", "fpos-po");
      if (b.getAttribute("data-pos") === _errorFielder)
        b.classList.add("fpos-po");
    });
  }
}

function _errorCloseAndCommit(result) {
  qs("fielder-modal").style.display = "none";
  document.getElementById("fielder-error-choice").style.display =
    "none";
  document.getElementById("fielder-field-wrap").style.display = "block";
  _errorPhase = "fielder";
  _errorFielder = null;
  if (_fielderCallback) _fielderCallback(result);
  _fielderCallback = null;
}

// errorMode: true = multi-phase error capture flow
function openFielderModal(
  outcome,
  logLabel,
  batter,
  callback,
  errorMode
) {
  _fielderCallback = callback;
  _fielderContext = {
    outcome,
    logLabel,
    batter,
    errorMode: !!errorMode,
  };
  _fielderPendingPO = null;
  _fielderAssists = [];
  _fielderInAssistMode = false;
  _errorPhase = "fielder";
  _errorFielder = null;
  document.getElementById("fielder-error-choice").style.display =
    "none";
  document.getElementById("fielder-field-wrap").style.display = "block";

  // Build a position → player name map from the current defensive lineup
  const isHomeDefending = S.isTop;
  const defLineup = isHomeDefending ? S.lineupHome : S.lineupAway;
  const posToPlayer = {};
  defLineup.forEach((p) => {
    if (p.pos) posToPlayer[p.pos.toUpperCase()] = p.name;
  });
  // Pitcher comes from the active pitcher list, not the batting lineup
  const pitcher = activePitcher();
  if (pitcher) posToPlayer["P"] = pitcher.name;

  // Annotate every position button with the player name
  document.querySelectorAll(".fpos-btn").forEach((btn) => {
    btn.classList.remove("selected", "fpos-po");
    const pos =
      btn.getAttribute("data-pos") ||
      btn.textContent.trim().toUpperCase();
    const name = posToPlayer[pos];
    if (name) {
      btn.innerHTML = `<span style="font-size:13px;font-weight:900;letter-spacing:1px">${pos}</span><br><span style="font-size:9px;font-weight:600;letter-spacing:0;opacity:0.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:56px;display:block">${name}</span>`;
    } else {
      btn.innerHTML = `<span style="font-size:13px;font-weight:900;letter-spacing:1px">${pos}</span>`;
    }
  });

  if (errorMode) {
    // Error flow phase 1: who fielded the ball (always captured)
    qs("fielder-title").textContent = "Who fielded the ball?";
    qs(
      "fielder-sub"
    ).textContent = `Error — ${batter} · always recorded`;
    const skipBtn = document.getElementById("fielder-skip-btn");
    if (skipBtn) skipBtn.textContent = "Skip";
  } else if (_fielderSkipAssists) {
    // Flyout/lineout/sacfly: no assists possible, go straight to putout
    _fielderInAssistMode = false;
    qs("fielder-title").textContent = "Who recorded the out?";
    qs("fielder-sub").textContent =
      "Select the fielder who made the putout";
    const skipBtn = document.getElementById("fielder-skip-btn");
    if (skipBtn) skipBtn.textContent = "Done";
  } else {
    // Normal play: Phase 1 = assist selection (who touched the ball)
    qs("fielder-title").textContent = "Who fielded the ball?";
    qs(
      "fielder-sub"
    ).textContent = `${logLabel} — ${batter} · tap all who touched it`;
    const skipBtn = document.getElementById("fielder-skip-btn");
    if (skipBtn) skipBtn.textContent = "Next →";
    _fielderInAssistMode = true;
  }
  qs("fielder-modal").style.display = "flex";
}

function _fielderSelect(pos) {
  // Error mode: single select, immediate callback with position string
  if (_fielderContext?.errorMode) {
    if (_errorPhase === "fielder") {
      // Highlight selection, then transition to error-type choice
      document
        .querySelectorAll(".fpos-btn")
        .forEach((b) => b.classList.remove("selected"));
      document
        .querySelector(`.fpos-btn[data-pos="${pos}"]`)
        ?.classList.add("selected");
      _errorFielder = pos;
      _errorPhase = "error-type";
      // Switch to choice panel
      document.getElementById("fielder-field-wrap").style.display =
        "none";
      qs("fielder-title").textContent = "Type of error?";
      qs("fielder-sub").textContent = `${pos} fielded the ball`;
      document.getElementById("fielder-skip-btn").textContent =
        "← Back";
      const btnStyle = `padding:14px 10px;border-radius:10px;cursor:pointer;border:1.5px solid var(--border2);background:var(--surface3);color:var(--text);font-family:'Barlow Condensed',sans-serif;text-align:center;transition:all 0.15s;width:100%;`;
      const choiceDiv = document.getElementById("fielder-error-choice");
      choiceDiv.style.display = "block";
      choiceDiv.innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:4px">
        <button onclick="_errorChooseType('fielding')" style="${btnStyle}">
          <div style="font-size:15px;font-weight:900;letter-spacing:0.5px">Fielding Error</div>
          <div style="font-size:10px;opacity:0.7;margin-top:3px">Bobbled or dropped</div>
        </button>
        <button onclick="_errorChooseType('throwing')" style="${btnStyle}">
          <div style="font-size:15px;font-weight:900;letter-spacing:0.5px">Throwing Error</div>
          <div style="font-size:10px;opacity:0.7;margin-top:3px">Ball was thrown</div>
        </button>
      </div>`;
    } else if (_errorPhase === "recipient") {
      // Can't pick the original thrower as recipient
      if (pos === _errorFielder) return;
      document.querySelectorAll(".fpos-btn").forEach((b) => {
        if (b.getAttribute("data-pos") !== _errorFielder)
          b.classList.remove("selected");
      });
      document
        .querySelector(`.fpos-btn[data-pos="${pos}"]`)
        ?.classList.add("selected");
      const result = {
        fielder: _errorFielder,
        errorPlayer: pos,
        errorType: "throwing",
        throwDir: "dropped",
      };
      setTimeout(() => _errorCloseAndCommit(result), 180);
    }
    return;
  }

  if (_fielderInAssistMode) {
    // Phase 1: toggle who touched the ball (multi-select assist candidates)
    const btn = document.querySelector(`.fpos-btn[data-pos="${pos}"]`);
    if (_fielderAssists.includes(pos)) {
      _fielderAssists = _fielderAssists.filter((p) => p !== pos);
      btn?.classList.remove("selected");
    } else {
      _fielderAssists.push(pos);
      btn?.classList.add("selected");
    }
  } else {
    // Phase 2: select the single putout fielder (can't be in assist list)
    if (_fielderAssists.includes(pos)) return;
    document.querySelectorAll(".fpos-btn").forEach((b) => {
      if (!_fielderAssists.includes(b.getAttribute("data-pos")))
        b.classList.remove("selected", "fpos-po");
    });
    _fielderPendingPO = pos;
    const btn = document.querySelector(`.fpos-btn[data-pos="${pos}"]`);
    btn?.classList.add("fpos-po");
  }
}

function _fielderSkip() {
  if (_fielderContext?.errorMode) {
    if (_errorPhase === "fielder") {
      // No fielder at all — skip entirely
      qs("fielder-modal").style.display = "none";
      document.getElementById("fielder-error-choice").style.display =
        "none";
      document.getElementById("fielder-field-wrap").style.display =
        "block";
      _errorPhase = "fielder";
      _errorFielder = null;
      if (_fielderCallback) _fielderCallback(null);
      _fielderCallback = null;
    } else if (_errorPhase === "error-type") {
      // Back to fielder selection
      _errorPhase = "fielder";
      _errorFielder = null;
      document.getElementById("fielder-error-choice").style.display =
        "none";
      document.getElementById("fielder-field-wrap").style.display =
        "block";
      qs("fielder-title").textContent = "Who fielded the ball?";
      qs(
        "fielder-sub"
      ).textContent = `Error — ${_fielderContext.batter} · always recorded`;
      document.getElementById("fielder-skip-btn").textContent = "Skip";
      document
        .querySelectorAll(".fpos-btn")
        .forEach((b) => b.classList.remove("selected", "fpos-po"));
    } else if (_errorPhase === "throw-direction") {
      // Back to error-type choice
      _errorPhase = "error-type";
      qs("fielder-title").textContent = "Type of error?";
      qs(
        "fielder-sub"
      ).textContent = `${_errorFielder} fielded the ball`;
      const btnStyle = `padding:14px 10px;border-radius:10px;cursor:pointer;border:1.5px solid var(--border2);background:var(--surface3);color:var(--text);font-family:'Barlow Condensed',sans-serif;text-align:center;transition:all 0.15s;width:100%;`;
      const choiceDiv = document.getElementById("fielder-error-choice");
      choiceDiv.innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:4px">
        <button onclick="_errorChooseType('fielding')" style="${btnStyle}">
          <div style="font-size:15px;font-weight:900;letter-spacing:0.5px">Fielding Error</div>
          <div style="font-size:10px;opacity:0.7;margin-top:3px">Bobbled or dropped</div>
        </button>
        <button onclick="_errorChooseType('throwing')" style="${btnStyle}">
          <div style="font-size:15px;font-weight:900;letter-spacing:0.5px">Throwing Error</div>
          <div style="font-size:10px;opacity:0.7;margin-top:3px">Ball was thrown</div>
        </button>
      </div>`;
      choiceDiv.style.display = "block";
    } else if (_errorPhase === "recipient") {
      // Back to throw-direction
      _errorPhase = "throw-direction";
      document.getElementById("fielder-field-wrap").style.display =
        "none";
      qs("fielder-title").textContent = "Who committed the error?";
      qs("fielder-sub").textContent = `${_errorFielder} threw the ball`;
      const btnStyle = `padding:14px 10px;border-radius:10px;cursor:pointer;border:1.5px solid var(--border2);background:var(--surface3);color:var(--text);font-family:'Barlow Condensed',sans-serif;text-align:center;transition:all 0.15s;width:100%;`;
      const div = document.getElementById("fielder-error-choice");
      div.style.display = "block";
      div.innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:4px">
        <button onclick="_errorChooseThrow('bad-throw')" style="${btnStyle}">
          <div style="font-size:15px;font-weight:900;letter-spacing:0.5px">Bad Throw</div>
          <div style="font-size:10px;opacity:0.7;margin-top:3px">${_errorFielder} threw it poorly</div>
        </button>
        <button onclick="_errorChooseThrow('dropped')" style="${btnStyle}">
          <div style="font-size:15px;font-weight:900;letter-spacing:0.5px">Dropped Throw</div>
          <div style="font-size:10px;opacity:0.7;margin-top:3px">Recipient couldn't handle it</div>
        </button>
      </div>`;
    }
    return;
  }
  if (_fielderInAssistMode) {
    // "Next →" — done selecting who fielded; move to putout step
    _fielderInAssistMode = false;
    _fielderPendingPO = null;
    // Mark assist buttons so putout step knows to exclude them
    // Transition UI to putout selection
    qs("fielder-title").textContent = "Who recorded the out?";
    qs("fielder-sub").textContent =
      "Select the fielder who made the putout";
    const skipBtn = document.getElementById("fielder-skip-btn");
    if (skipBtn) skipBtn.textContent = "Done";
    // Keep selected assists highlighted; dim them slightly to distinguish
    document.querySelectorAll(".fpos-btn").forEach((b) => {
      const p = b.getAttribute("data-pos");
      if (_fielderAssists.includes(p)) {
        b.classList.add("selected");
      }
    });
  } else {
    // "Done" — commit everything and return result
    if (_fielderPendingPO) _trackFielding(_fielderPendingPO, "po");
    _fielderAssists.forEach((p) => _trackFielding(p, "a"));
    const result = {
      putout: _fielderPendingPO,
      assists: [..._fielderAssists],
    };
    qs("fielder-modal").style.display = "none";
    _fielderInAssistMode = false;
    _fielderPendingPO = null;
    _fielderAssists = [];
    if (_fielderCallback) _fielderCallback(result);
    _fielderCallback = null;
  }
}

// ===================== FULLSCREEN =====================
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
}

document.addEventListener("fullscreenchange", () => {
  const isFs = !!document.fullscreenElement;
  const expand = document.getElementById("fs-icon-expand");
  const compress = document.getElementById("fs-icon-compress");
  if (expand) expand.style.display = isFs ? "none" : "block";
  if (compress) compress.style.display = isFs ? "block" : "none";
});

// ── Baserunning + Defense helpers ──────────────────────────────────
function getFieldingStats(team, playerName, pos) {
  const key = team + "::" + playerName;
  if (!S.fieldingStats[key])
    S.fieldingStats[key] = {
      name: playerName,
      team,
      pos: pos || "?",
      po: 0,
      a: 0,
      e: 0,
    };
  return S.fieldingStats[key];
}

// Set runner name when a batter reaches base
function setRunner(base, name) {
  S.runnerNames[base] = name || null;
}

// Move runner between bases
// Find batter key by player name (searches both lineups)
function _batterKeyByName(name) {
  if (!name) return null;
  const search = (lineup, isAway) => {
    const idx = lineup.findIndex((p) => p.name === name);
    return idx >= 0 ? getBatterKey(isAway, idx) : null;
  };
  return (
    search(S.lineupAway, true) || search(S.lineupHome, false) || null
  );
}

// Track fielding putout/assist/error for a fielder position on current defensive team
function _trackFielding(pos, type) {
  // type: 'po'|'a'|'e'
  if (!pos) return;
  // Defensive team: if top half (away bats), home team defends
  const isHomeDefending = S.isTop;
  const teamName = isHomeDefending
    ? qs("home-name-input")?.value || "HOME"
    : qs("away-name-input")?.value || "AWAY";

  let playerName, playerPos;

  if (pos.toUpperCase() === "P") {
    // Pitcher is tracked in pitchersHome/pitchersAway, not in the batting lineup
    const pitcher = activePitcher();
    if (!pitcher) return;
    playerName = pitcher.name;
    playerPos = "P";
  } else {
    // Find the player currently listed at this position in the defensive lineup
    const lineup = isHomeDefending ? S.lineupHome : S.lineupAway;
    const player = lineup.find(
      (p) => (p.pos || "").toUpperCase() === pos.toUpperCase()
    );
    if (!player) return;
    playerName = player.name;
    playerPos = player.pos || pos;
  }

  const key = teamName + "::" + playerName;
  if (!S.fieldingStats[key])
    S.fieldingStats[key] = {
      name: playerName,
      team: teamName,
      pos: playerPos,
      po: 0,
      a: 0,
      e: 0,
    };
  S.fieldingStats[key][type] = (S.fieldingStats[key][type] || 0) + 1;
}

function moveRunner(from, to) {
  S.runnerNames[to] = S.runnerNames[from] || null;
  S.runnerNames[from] = null;
}

function clearRunner(base) {
  S.runnerNames[base] = null;
}

// ===================== LINEUP PANEL PITCHER SECTION =====================
let _lpEditingIdx = null;

function renderLineupPitchers() {
  // Shows the PITCHING team's pitchers (opposite of batting team)
  const pitchingList = S.isTop ? S.pitchersHome : S.pitchersAway;
  const label = S.isTop ? "HOME PITCHER" : "AWAY PITCHER";
  const lpLabel = document.getElementById("lineup-pitcher-label");
  if (lpLabel) lpLabel.textContent = label;

  const el = document.getElementById("lineup-pitcher-list");
  if (!el) return;
  el.innerHTML = "";

  pitchingList.forEach((p, i) => {
    const div = document.createElement("div");
    const isEditing = _lpEditingIdx === i;
    const handColor =
      (p.hand || "R") === "L" ? "var(--blue)" : "var(--text3)";

    if (isEditing) {
      div.className = "pitcher-card";
      div.style.cssText = "flex-wrap:wrap;gap:6px";
      div.innerHTML = `
<div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:10px;color:var(--text3);width:100%;letter-spacing:1px;text-transform:uppercase">Edit Pitcher</div>
<input class="setup-input num-in" id="lp-edit-num-${i}"  value="${
        p.num || ""
      }"  placeholder="#" style="width:38px;flex-shrink:0;padding:5px 4px;text-align:center;font-size:13px">
<input class="setup-input"        id="lp-edit-name-${i}" value="${
        p.name || ""
      }" placeholder="Name..." style="flex:1;font-size:13px">
<select id="lp-edit-hand-${i}" style="background:var(--surface3);border:1px solid var(--border2);border-radius:4px;color:var(--text);font-family:'Barlow Condensed',sans-serif;font-size:13px;padding:4px 5px;outline:none;cursor:pointer;flex-shrink:0">
  <option value="R"${
    (p.hand || "R") === "R" ? " selected" : ""
  }>R</option>
  <option value="L"${p.hand === "L" ? " selected" : ""}>L</option>
</select>
<button onclick="lpSaveEdit(${i})" style="background:var(--accent);border:none;border-radius:5px;color:var(--bg);font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:13px;padding:5px 10px;cursor:pointer;flex-shrink:0">✓</button>
<button onclick="_lpEditingIdx=null;renderLineupPitchers()" style="background:none;border:1px solid var(--border);border-radius:5px;color:var(--text3);padding:6px 7px;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="1" y1="1" x2="11" y2="11"/><line x1="11" y1="1" x2="1" y2="11"/></svg></button>
      `;
      setTimeout(() => {
        const n = document.getElementById(`lp-edit-name-${i}`);
        if (n) {
          n.focus();
          n.select();
        }
      }, 30);
    } else {
      div.className = "pitcher-card" + (p.active ? " active-p" : "");
      div.innerHTML = `
<div class="pitcher-active-dot" style="background:${
  p.active ? "var(--accent)" : "transparent"
};border:${p.active ? "none" : "1px solid var(--text3)"}"></div>
<div class="pitcher-card-info">
  <div class="pitcher-card-name">
    <span style="color:var(--text3);font-size:12px;margin-right:4px">#${
      p.num || "?"
    }</span>${p.name}
    <span style="font-size:9px;font-weight:700;color:${handColor};letter-spacing:1px;margin-left:2px">${
        p.hand || "R"
      }HP</span>
    ${
      p.active
        ? '<span style="font-size:9px;color:var(--accent);letter-spacing:1px;margin-left:3px">NOW</span>'
        : ""
    }
  </div>
  <div class="pitcher-card-stats">${p.pitches}P · ${p.k}K · ${
        p.bb
      }BB · ${p.hits}H</div>
</div>
<button onclick="event.stopPropagation();_lpEditingIdx=${i};renderLineupPitchers()" title="Edit" style="background:none;border:1px solid var(--border);border-radius:3px;color:var(--text3);font-size:10px;padding:2px 5px;cursor:pointer;opacity:0;transition:all .12s" class="pitcher-edit-btn">✎</button>
<button onclick="event.stopPropagation();lpRemovePitcher(${i})" style="background:none;border:none;color:var(--text3);font-size:13px;padding:2px 6px;cursor:pointer;opacity:.5;transition:all .12s">✕</button>
      `;
      div.onclick = () => {
        const list = S.isTop ? S.pitchersHome : S.pitchersAway;
        list.forEach((x) => (x.active = false));
        list[i].active = true;
        renderLineupPitchers();
        renderPitcherList();
        updateScoreBug();
        logEvent(
          "🔄",
          "Pitching Change",
          `#${p.num || "?"} ${p.name} now pitching`
        );
      };
      div.addEventListener("mouseenter", () => {
        const b = div.querySelector(".pitcher-edit-btn");
        if (b) b.style.opacity = "1";
      });
      div.addEventListener("mouseleave", () => {
        const b = div.querySelector(".pitcher-edit-btn");
        if (b) b.style.opacity = "0";
      });
    }
    el.appendChild(div);
  });
}

function lpSaveEdit(i) {
  const list = S.isTop ? S.pitchersHome : S.pitchersAway;
  const n = document.getElementById(`lp-edit-name-${i}`)?.value.trim();
  const num = document.getElementById(`lp-edit-num-${i}`)?.value.trim();
  const hand =
    document.getElementById(`lp-edit-hand-${i}`)?.value || "R";
  if (n) list[i].name = n;
  list[i].num = num || list[i].num;
  list[i].hand = hand;
  _lpEditingIdx = null;
  renderLineupPitchers();
  renderPitcherList();
  updateScoreBug();
}

function lpRemovePitcher(i) {
  const list = S.isTop ? S.pitchersHome : S.pitchersAway;
  if (list.length <= 1) {
    toast("Cannot remove the only pitcher.");
    return;
  }
  list.splice(i, 1);
  if (!list.some((p) => p.active)) list[0].active = true;
  renderLineupPitchers();
  renderPitcherList();
  updateScoreBug();
}

function toggleLineupAddPitcherForm() {
  const f = document.getElementById("lineup-add-pitcher-form");
  if (f) {
    f.style.display = f.style.display === "none" ? "block" : "none";
  }
}

function lineupAddPitcher() {
  const name = document.getElementById("lp-new-name")?.value.trim();
  const num = document.getElementById("lp-new-num")?.value.trim();
  const hand = document.getElementById("lp-new-hand")?.value || "R";
  if (!name) {
    toast("Enter a pitcher name.");
    return;
  }
  const list = S.isTop ? S.pitchersHome : S.pitchersAway;
  list.forEach((p) => (p.active = false));
  list.push({
    name,
    num,
    hand,
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
  });
  document.getElementById("lp-new-name").value = "";
  document.getElementById("lp-new-num").value = "";
  toggleLineupAddPitcherForm();
  renderLineupPitchers();
  renderPitcherList();
  updateScoreBug();
  toast(`Pitching: #${num || "?"} ${name}`);
}

// ===================== LINEUP MODAL PITCHER SECTION =====================
let _lmPitcherEditIdx = null;

function renderLmPitchers() {
  const side =
    typeof lineupModalSide !== "undefined" ? lineupModalSide : "away";
  const list = side === "away" ? S.pitchersAway : S.pitchersHome;
  const label = document.getElementById("lm-pitcher-label");
  if (label)
    label.textContent =
      (side === "away" ? "AWAY" : "HOME") + " PITCHER";
  const el = document.getElementById("lm-pitcher-list");
  if (!el) return;
  el.innerHTML = "";

  list.forEach((p, i) => {
    const div = document.createElement("div");
    div.className = "lm-row" + (p.active ? "" : "");
    div.style.cssText = p.active
      ? "background:rgba(204,26,26,.04);border-radius:6px"
      : "";
    div.innerHTML = `
      <div class="lm-order" style="color:${
p.active ? "var(--accent)" : "var(--text3)"
      };font-size:10px">P</div>
      <input class="lm-input" id="lm-p-num-${i}"  value="${
      p.num || ""
    }"  placeholder="#" maxlength="3" style="text-align:center;padding:5px 4px" oninput="lmSyncPitcher(${i})">
      <input class="lm-input" id="lm-p-name-${i}" value="${
      p.name || ""
    }" placeholder="Pitcher name..." oninput="lmSyncPitcher(${i})">
      <div class="lm-input" style="text-align:center;background:var(--surface3);color:var(--text3);display:flex;align-items:center;justify-content:center;font-family:Barlow Condensed,sans-serif;font-weight:700;font-size:13px">P</div>
      <select class="lm-select" id="lm-p-hand-${i}" onchange="lmSyncPitcher(${i})">
<option value="R"${
  (p.hand || "R") === "R" ? " selected" : ""
}>R</option>
<option value="L"${p.hand === "L" ? " selected" : ""}>L</option>
      </select>
      <button onclick="event.stopPropagation();lmRemovePitcher(${i})" title="Remove pitcher" style="background:none;border:1px solid var(--border);border-radius:4px;color:var(--text3);font-size:12px;padding:4px 6px;cursor:pointer;transition:all .14s;width:100%" onmouseover="this.style.borderColor='var(--accent)';this.style.color='var(--accent)'" onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--text3)'">✕</button>
    `;
    // Click row to set active pitcher
    div.addEventListener("click", (e) => {
      if (
        e.target.tagName === "INPUT" ||
        e.target.tagName === "SELECT" ||
        e.target.tagName === "BUTTON"
      )
        return;
      list.forEach((x) => (x.active = false));
      list[i].active = true;
      renderLmPitchers();
      renderPitcherList();
      updateScoreBug();
    });
    el.appendChild(div);
  });

  // Make the pitcher list container a drop zone
  el.addEventListener("dragover", function (e) {
    e.preventDefault();
    el.style.outline = "2px dashed var(--accent)";
    el.style.borderRadius = "6px";
  });
  el.addEventListener("dragleave", function () {
    el.style.outline = "";
  });
  el.addEventListener("drop", function (e) {
    e.preventDefault();
    el.style.outline = "";
    const pid = e.dataTransfer.getData("text/plain") || _dragPlayerId;
    lmDropPitcherFromRoster(pid);
  });
}

function lmDropPitcherFromRoster(playerId) {
  const p = myTeamRoster.find(function (x) {
    return x.id === playerId;
  });
  if (!p) return;
  const side =
    typeof lineupModalSide !== "undefined" ? lineupModalSide : "away";
  const list = side === "away" ? S.pitchersAway : S.pitchersHome;
  // Don't duplicate by name
  if (
    list.find(function (x) {
      return x.name === p.name;
    })
  ) {
    toast(p.name + " already in pitcher list");
    return;
  }
  // If only one pitcher and it's the default placeholder, replace it
  const isDefault =
    list.length === 1 &&
    (!list[0].name ||
      list[0].name === "Pitcher" ||
      /^Pitcher/.test(list[0].name)) &&
    list[0].pitches === 0;
  if (isDefault) {
    list[0] = {
      name: p.name,
      num: p.num || "",
      hand: p.throw || "R",
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
    };
  } else {
    list.forEach(function (x) {
      x.active = false;
    });
    list.push({
      name: p.name,
      num: p.num || "",
      hand: p.throw || "R",
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
    });
  }
  renderLmPitchers();
  renderPitcherList();
  updateScoreBug();
}

function lmSyncPitcher(i) {
  const side =
    typeof lineupModalSide !== "undefined" ? lineupModalSide : "away";
  const list = side === "away" ? S.pitchersAway : S.pitchersHome;
  const n = document.getElementById(`lm-p-name-${i}`)?.value.trim();
  const num = document.getElementById(`lm-p-num-${i}`)?.value.trim();
  const hand = document.getElementById(`lm-p-hand-${i}`)?.value || "R";
  if (n) list[i].name = n;
  list[i].num = num || list[i].num;
  list[i].hand = hand;
  renderPitcherList();
  renderLineupPitchers();
  updateScoreBug();
}

function lmSavePitcherEdit(i) {
  const side =
    typeof lineupModalSide !== "undefined" ? lineupModalSide : "away";
  const list = side === "away" ? S.pitchersAway : S.pitchersHome;
  const n = document.getElementById(`lm-ep-name-${i}`)?.value.trim();
  const num = document.getElementById(`lm-ep-num-${i}`)?.value.trim();
  const hand = document.getElementById(`lm-ep-hand-${i}`)?.value || "R";
  if (n) list[i].name = n;
  list[i].num = num || list[i].num;
  list[i].hand = hand;
  _lmPitcherEditIdx = null;
  renderLmPitchers();
  renderPitcherList();
  renderLineupPitchers();
  updateScoreBug();
}

function lmRemovePitcher(i) {
  const side =
    typeof lineupModalSide !== "undefined" ? lineupModalSide : "away";
  const list = side === "away" ? S.pitchersAway : S.pitchersHome;
  if (list.length <= 1) {
    toast("Cannot remove the only pitcher.");
    return;
  }
  list.splice(i, 1);
  if (!list.some((p) => p.active)) list[0].active = true;
  renderLmPitchers();
  renderPitcherList();
  renderLineupPitchers();
  updateScoreBug();
}

function toggleLmAddPitcherForm() {
  const f = document.getElementById("lm-add-pitcher-form");
  if (f)
    f.style.display = f.style.display === "none" ? "block" : "none";
}

function lmAddPitcher() {
  const name = document.getElementById("lm-new-name")?.value.trim();
  const num = document.getElementById("lm-new-num")?.value.trim();
  const hand = document.getElementById("lm-new-hand")?.value || "R";
  if (!name) {
    toast("Enter a pitcher name.");
    return;
  }
  const side =
    typeof lineupModalSide !== "undefined" ? lineupModalSide : "away";
  const list = side === "away" ? S.pitchersAway : S.pitchersHome;
  list.forEach((p) => (p.active = false));
  list.push({
    name,
    num,
    hand,
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
  });
  document.getElementById("lm-new-name").value = "";
  document.getElementById("lm-new-num").value = "";
  toggleLmAddPitcherForm();
  renderLmPitchers();
  renderPitcherList();
  renderLineupPitchers();
  updateScoreBug();
}

// ===================== GAME STATE UNDO STACK =====================
// We snapshot the full game state before every committed pitch.
// Undo pops the stack and restores — handles any outcome including AB/inning endings.
const _undoStack = [];
const _UNDO_MAX = 20; // keep last 20 pitches worth of history

function _takeSnapshot() {
  try {
    const snap = {
      balls: S.balls,
      strikes: S.strikes,
      outs: S.outs,
      bases: JSON.parse(JSON.stringify(S.bases)),
      runnerNames: JSON.parse(JSON.stringify(S.runnerNames || {})),
      awayScore: S.awayScore,
      homeScore: S.homeScore,
      inning: S.inning,
      isTop: S.isTop,
      awayBatterIdx: S.awayBatterIdx,
      homeBatterIdx: S.homeBatterIdx,
      pitchersAway: JSON.parse(JSON.stringify(S.pitchersAway)),
      pitchersHome: JSON.parse(JSON.stringify(S.pitchersHome)),
      batterStats: JSON.parse(JSON.stringify(S.batterStats)),
      lineupResults: JSON.parse(JSON.stringify(S.lineupResults)),
      pitchLog: JSON.parse(JSON.stringify(S.pitchLog)),
      currentAtBatPitches: JSON.parse(
        JSON.stringify(S.currentAtBatPitches)
      ),
      pitchCount: S.pitchCount,
      inningRuns: JSON.parse(JSON.stringify(S.inningRuns)),
      gameLog: JSON.parse(JSON.stringify(S.gameLog)),
      fieldingStats: JSON.parse(JSON.stringify(S.fieldingStats || {})),
    };
    _undoStack.push(snap);
    if (_undoStack.length > _UNDO_MAX) _undoStack.shift();
  } catch (e) {
    console.warn("Snapshot failed:", e);
  }
}

function _restoreSnapshot(snap) {
  S.balls = snap.balls;
  S.strikes = snap.strikes;
  S.outs = snap.outs;
  S.bases = JSON.parse(JSON.stringify(snap.bases));
  S.runnerNames = JSON.parse(JSON.stringify(snap.runnerNames || {}));
  S.awayScore = snap.awayScore;
  S.homeScore = snap.homeScore;
  S.inning = snap.inning;
  S.isTop = snap.isTop;
  S.awayBatterIdx = snap.awayBatterIdx;
  S.homeBatterIdx = snap.homeBatterIdx;
  S.pitchersAway = JSON.parse(JSON.stringify(snap.pitchersAway));
  S.pitchersHome = JSON.parse(JSON.stringify(snap.pitchersHome));
  S.batterStats = JSON.parse(JSON.stringify(snap.batterStats));
  S.lineupResults = JSON.parse(JSON.stringify(snap.lineupResults));
  S.pitchLog = JSON.parse(JSON.stringify(snap.pitchLog));
  S.currentAtBatPitches = JSON.parse(
    JSON.stringify(snap.currentAtBatPitches)
  );
  S.pitchCount = snap.pitchCount;
  S.inningRuns = JSON.parse(JSON.stringify(snap.inningRuns));
  S.gameLog = JSON.parse(JSON.stringify(snap.gameLog));
  S.fieldingStats = JSON.parse(
    JSON.stringify(snap.fieldingStats || {})
  );
}

// ===================== SCOUTING REPORTS =====================

function buildTeamScoutingTab(teamName, players, pitchers, games) {
  const hitterBtns = players
    .filter((p) => p.pa > 0)
    .sort((a, b) => b.ab - a.ab)
    .map(
      (p) => `<button onclick="showScoutingReport('hitter','${escAttr(
        teamName
      )}','${escAttr(p.name)}')" 
      class="scout-player-btn" id="scout-btn-h-${escAttr(p.name)}"
      style="padding:5px 12px;border:1px solid var(--border2);border-radius:20px;background:var(--surface3);color:var(--text2);font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:12px;cursor:pointer;transition:all .14s;white-space:nowrap"
      onmouseover="this.style.borderColor='var(--accent)';this.style.color='var(--accent)'"
      onmouseout="if(!this.classList.contains('active')){this.style.borderColor='var(--border2)';this.style.color='var(--text2)'}">
      #${p.num || "?"} ${escHtml(p.name)}
    </button>`
    )
    .join("");

  const pitcherBtns = pitchers
    .filter((p) => p.pitches > 0)
    .sort((a, b) => b.pitches - a.pitches)
    .map(
      (p) => `<button onclick="showScoutingReport('pitcher','${escAttr(
        teamName
      )}','${escAttr(p.name)}')"
      class="scout-player-btn" id="scout-btn-p-${escAttr(p.name)}"
      style="padding:5px 12px;border:1px solid var(--border2);border-radius:20px;background:var(--surface3);color:var(--text2);font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:12px;cursor:pointer;transition:all .14s;white-space:nowrap"
      onmouseover="this.style.borderColor='var(--blue)';this.style.color='var(--blue)'"
      onmouseout="if(!this.classList.contains('active')){this.style.borderColor='var(--border2)';this.style.color='var(--text2)'}">
      #${p.num || "?"} ${escHtml(p.name)} (${p.hand || "R"}HP)
    </button>`
    )
    .join("");

  const firstHitter = players
    .filter((p) => p.pa > 0)
    .sort((a, b) => b.ab - a.ab)[0];
  const firstPitcher = pitchers
    .filter((p) => p.pitches > 0)
    .sort((a, b) => b.pitches - a.pitches)[0];
  const initReport = firstHitter
    ? buildHitterScoutingReport(teamName, firstHitter.name, games)
    : '<div class="empty-state">No hitter data</div>';

  return `
  <div id="scout-picker" class="scout-print-hide">
    <div style="margin-bottom:16px">
      <div style="font-size:8px;letter-spacing:2px;color:var(--text3);text-transform:uppercase;font-weight:700;margin-bottom:6px">Hitters</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">${
hitterBtns ||
'<span style="color:var(--text3);font-size:12px">No hitter data</span>'
      }</div>
    </div>
    <div style="margin-bottom:16px">
      <div style="font-size:8px;letter-spacing:2px;color:var(--text3);text-transform:uppercase;font-weight:700;margin-bottom:6px">Pitchers</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">${
pitcherBtns ||
'<span style="color:var(--text3);font-size:12px">No pitcher data</span>'
      }</div>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:20px">
      <button onclick="printCurrentScoutReport()" style="padding:8px 20px;background:var(--accent);border:none;border-radius:7px;color:#fff;font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:14px;letter-spacing:1px;cursor:pointer;display:flex;align-items:center;gap:7px">🖨 Print This Report</button>
      <button onclick="printAllScoutReports()" id="print-all-btn" style="padding:8px 20px;background:var(--surface2);border:1.5px solid var(--border2);border-radius:7px;color:var(--text2);font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:14px;letter-spacing:1px;cursor:pointer;display:flex;align-items:center;gap:7px;transition:all .14s" onmouseover="this.style.borderColor='var(--accent)';this.style.color='var(--accent)'" onmouseout="this.style.borderColor='var(--border2)';this.style.color='var(--text2)'">🖨 Print All Reports</button>
    </div>
    <div style="border-top:1px solid var(--border);padding-top:16px"></div>
  </div>
  <div id="scout-report-content">${initReport}</div>`;
}

function showScoutingReport(type, teamName, playerName) {
  _scoutRecentFilter = false;
  const games = getTeamGames(teamName);
  const el = document.getElementById("scout-report-content");
  if (!el) return;
  el.innerHTML =
    type === "hitter"
      ? buildHitterScoutingReport(teamName, playerName, games)
      : buildPitcherScoutingReport(teamName, playerName, games);
  // Highlight active button
  document.querySelectorAll(".scout-player-btn").forEach((b) => {
    const isMe =
      b.id ===
      `scout-btn-${type === "hitter" ? "h" : "p"}-${playerName}`;
    b.classList.toggle("active", isMe);
    b.style.background = isMe
      ? "rgba(204,26,26,.08)"
      : "var(--surface3)";
    b.style.borderColor = isMe ? "var(--accent)" : "var(--border2)";
    b.style.color = isMe ? "var(--accent)" : "var(--text2)";
  });
}

// ── HITTER SCOUTING REPORT ────────────────────────────────────────
function buildHitterScoutingReport(teamName, playerName, games) {
  const stats = getPlayerCareerStats(teamName, playerName, games);
  const allPitches = getPlayerPitches(teamName, playerName, games);
  const sortedGames = [...games].sort((a, b) =>
    a.date.localeCompare(b.date)
  );
  const allABs = sortedGames.flatMap((g) =>
    _extractABs(g.pitchLog || [], playerName, teamName, g)
  );

  // Core rate stats
  const pa = stats.pa || 0,
    ab = stats.ab || 0,
    h = stats.hits || 0;
  const tb =
    h -
    stats.doubles -
    stats.triples -
    stats.hr +
    stats.doubles * 2 +
    stats.triples * 3 +
    stats.hr * 4;
  const avg = ab > 0 ? h / ab : 0,
    obp = pa > 0 ? (h + (stats.bb || 0) + (stats.hbp || 0)) / pa : 0;
  const slg = ab > 0 ? tb / ab : 0,
    ops = obp + slg;
  const kpct = pa > 0 ? (stats.k || 0) / pa : 0,
    bbpct = pa > 0 ? (stats.bb || 0) / pa : 0;
  const f = (n) => _fmtRate(n);
  const fp = (n) => Math.round(n * 100) + "%";

  // Plate discipline from pitches
  const total = allPitches.length;
  const swingOuts = [
    "strike-swinging",
    "foul",
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
  ];
  const contactOuts = [
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
  ];
  const inZone = allPitches.filter(
    (p) =>
      p.pitchX != null &&
      p.pitchX >= 31 &&
      p.pitchX <= 69 &&
      p.pitchY != null &&
      p.pitchY >= 30.9 &&
      p.pitchY <= 69.1
  );
  const outZone = allPitches.filter(
    (p) =>
      p.pitchX != null &&
      !(
        p.pitchX >= 31 &&
        p.pitchX <= 69 &&
        p.pitchY != null &&
        p.pitchY >= 30.9 &&
        p.pitchY <= 69.1
      )
  );
  const swings = allPitches.filter((p) =>
    swingOuts.includes(p.outcome)
  ).length;
  const contact = allPitches.filter((p) =>
    contactOuts.includes(p.outcome)
  ).length;
  const whiffs = allPitches.filter(
    (p) => p.outcome === "strike-swinging"
  ).length;
  const chaseSwings = outZone.filter((p) =>
    swingOuts.includes(p.outcome)
  ).length;
  // Batted ball profile — balls in play only (hits, outs, errors, sacs)
  const bipOutcomes = [
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
  ];
  const bip = allPitches.filter(
    (p) => p.spray?.btype && bipOutcomes.includes(p.outcome)
  );
  const hardHits = allPitches.filter(
    (p) => p.spray?.hardHit && bipOutcomes.includes(p.outcome)
  ).length;
  const pct = (n) =>
    total > 0 ? Math.round((n / total) * 100) + "%" : "—";
  const bipTotal = bip.length || 1;
  const btCounts = {
    flyball: 0,
    linedrive: 0,
    groundball: 0,
    weakgrounder: 0,
    popup: 0,
  };
  bip.forEach((p) => {
    if (btCounts[p.spray.btype] !== undefined)
      btCounts[p.spray.btype]++;
  });
  const bipBar = (label, key, color) => `<div class="scout-bar-row">
    <div class="scout-bar-label" style="width:80px">${label}</div>
    <div class="scout-bar-track" style="flex:1;min-width:0"><div class="scout-bar-fill" style="width:${Math.round(
      (btCounts[key] / bipTotal) * 100
    )}%;background:${color}"></div></div>
    <div class="scout-bar-val" style="width:32px;flex-shrink:0">${Math.round(
      (btCounts[key] / bipTotal) * 100
    )}%</div>
  </div>`;

  // Spray direction (pull/center/oppo) — use fieldX
  // Pull/Straight/Oppo — angle-based from home plate (SVG coords: HX=280, HY=468)
  // Angle 0° = straight up (center field), negative = left, positive = right
  // Pull for RHH: angle < -15° (toward left field)
  // Pull for LHH: angle > +15° (toward right field)
  // Straight: within ±15° of center
  const isLeftHand = stats.hand === "L";
  const PULL_DEG = 15; // degrees from center to demarcate pull/straight/oppo
  const sprayAngle = (p) => {
    const sx = p.spray?.x,
      sy = p.spray?.y;
    if (sx == null || sy == null) return 0;
    const dx = sx - 280,
      dy = -(sy - 468); // dy flipped so up=positive
    return (Math.atan2(dx, Math.max(dy, 1)) * 180) / Math.PI;
  };
  const isPull = (p) =>
    isLeftHand ? sprayAngle(p) > PULL_DEG : sprayAngle(p) < -PULL_DEG;
  const isStraight = (p) => Math.abs(sprayAngle(p)) <= PULL_DEG;
  const isOppo = (p) =>
    isLeftHand ? sprayAngle(p) < -PULL_DEG : sprayAngle(p) > PULL_DEG;
  const pullPct =
    bip.length > 0
      ? Math.round((bip.filter(isPull).length / bipTotal) * 100)
      : 0;
  const centrPct =
    bip.length > 0
      ? Math.round((bip.filter(isStraight).length / bipTotal) * 100)
      : 0;
  const oppoPct =
    bip.length > 0
      ? Math.round((bip.filter(isOppo).length / bipTotal) * 100)
      : 0;

  // Count splits
  const countGroups = [
    { lbl: "0-0 (First Pitch)", fn: (a) => a.pitches.length === 1 },
    {
      lbl: "Ahead in Count",
      fn: (a) => {
        const fp = a.pitches[0];
        return fp && fp.balls > fp.strikes;
      },
    },
    {
      lbl: "Behind in Count",
      fn: (a) => {
        const fp = a.pitches[0];
        return fp && fp.strikes > fp.balls;
      },
    },
    {
      lbl: "2-Strike",
      fn: (a) => a.pitches.some((p) => p.strikes === 2),
    },
    {
      lbl: "Full Count (3-2)",
      fn: (a) =>
        a.pitches.some((p) => p.balls === 3 && p.strikes === 2),
    },
    {
      lbl: "RISP",
      fn: (a) => a.runnersOn?.["2nd"] || a.runnersOn?.["3rd"],
    },
  ];
  const countRows = countGroups
    .map((g) => {
      const abs = allABs.filter(g.fn);
      const s = _sumStats(abs.map(_abToStats));
      const a = s.ab > 0 ? s.h / s.ab : null;
      const obpS = s.pa > 0 ? (s.h + s.bb + s.hbp) / s.pa : null;
      const slgS = s.ab > 0 ? s.tb / s.ab : null;
      const opsS = obpS !== null && slgS !== null ? obpS + slgS : null;
      return `<tr>
      <td>${g.lbl}</td>
      <td>${s.pa}</td><td>${s.ab}</td><td>${s.h}</td>
      <td class="${
a !== null && a >= 0.3
  ? "scout-highlight"
  : a !== null && a < 0.2
  ? "scout-dim"
  : ""
      }">${a !== null ? f(a) : ".---"}</td>
      <td>${obpS !== null ? f(obpS) : ".---"}</td>
      <td>${slgS !== null ? f(slgS) : ".---"}</td>
      <td class="${
opsS !== null && opsS >= 0.8
  ? "scout-good"
  : opsS !== null && opsS < 0.6
  ? "scout-dim"
  : ""
      }">${opsS !== null ? f(opsS) : ".---"}</td>
      <td>${s.pa > 0 ? ((s.k / s.pa) * 100).toFixed(0) + "%" : "—"}</td>
      <td>${s.pa > 0 ? ((s.bb / s.pa) * 100).toFixed(0) + "%" : "—"}</td>
    </tr>`;
    })
    .join("");

  // Pitch type faced
  const ptMap = {};
  allPitches.forEach((p) => {
    const t = p.pitchType && p.pitchType !== "—" ? p.pitchType : "UNKN";
    if (!ptMap[t])
      ptMap[t] = {
        total: 0,
        swings: 0,
        whiffs: 0,
        hits: 0,
        h2b: 0,
        h3b: 0,
        hr: 0,
        ab: 0,
        k: 0,
      };
    ptMap[t].total++;
    if (swingOuts.includes(p.outcome)) ptMap[t].swings++;
    if (p.outcome === "strike-swinging") ptMap[t].whiffs++;
    if (["single", "double", "triple", "homerun"].includes(p.outcome)) {
      ptMap[t].hits++;
      ptMap[t].ab++;
      if (p.outcome === "double") ptMap[t].h2b++;
      if (p.outcome === "triple") ptMap[t].h3b++;
      if (p.outcome === "homerun") ptMap[t].hr++;
    }
    if (
      [
        "groundout",
        "flyout",
        "lineout",
        "sacfly",
        "sacbunt",
        "error",
      ].includes(p.outcome)
    )
      ptMap[t].ab++;
    if (["strike-swinging", "strike-looking"].includes(p.outcome))
      ptMap[t].k++;
  });
  const typeColors = {
    "4SFB": "#2878d4",
    "2SFB": "#5baef5",
    FB: "#1a5acc",
    CUT: "#4a9ec8",
    CT: "#4a9ec8",
    SNK: "#0e3d8a",
    SI: "#0e3d8a",
    CRV: "#d42828",
    CB: "#d42828",
    SLD: "#e05c10",
    SL: "#e05c10",
    SLV: "#b03090",
    SPL: "#9b5de5",
    SP: "#9b5de5",
    CH: "#28a83a",
    KN: "#8a8a00",
    UNKN: "#8a909e",
  };
  const ptRows = Object.entries(ptMap)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([t, d]) => {
      const usg = Math.round((d.total / total) * 100);
      const bavg = d.ab > 0 ? f(d.hits / d.ab) : ".---";
      const ptb =
        d.hits -
        d.h2b -
        d.h3b -
        d.hr +
        d.h2b * 2 +
        d.h3b * 3 +
        d.hr * 4;
      const bslg = d.ab > 0 ? f(ptb / d.ab) : ".---";
      const bobp = d.ab > 0 ? d.hits / d.ab : null; // simplified OBP (no BB tracked per pitch type)
      const bops = d.ab > 0 ? f(d.hits / d.ab + ptb / d.ab) : ".---";
      const whiffPct =
        d.swings > 0
          ? Math.round((d.whiffs / d.swings) * 100) + "%"
          : "—";
      const kpct2 =
        d.total > 0 ? Math.round((d.k / d.total) * 100) + "%" : "—";
      const avgHi = d.ab > 0 && d.hits / d.ab >= 0.3,
        avgLo = d.ab > 0 && d.hits / d.ab < 0.2;
      return `<tr>
      <td><span style="font-weight:800;color:${
typeColors[t] || "#8a909e"
      }">${t}</span></td>
      <td>${d.total} <span class="scout-dim">(${usg}%)</span></td>
      <td class="${
avgHi ? "scout-highlight" : avgLo ? "scout-good" : ""
      }">${bavg}</td>
      <td>${bslg}</td><td>${bops}</td>
      <td>${whiffPct}</td><td>${kpct2}</td>
    </tr>`;
    })
    .join("");

  // vs LHP/RHP
  const vsL = _sumStats(
    allABs.filter((a) => a.pitcherHand === "L").map(_abToStats)
  );
  const vsR = _sumStats(
    allABs.filter((a) => a.pitcherHand !== "L").map(_abToStats)
  );

  // Splits table rows
  const splitRow = (lbl, s) => {
    const a = s.ab > 0 ? f(s.h / s.ab) : ".---";
    const o = s.pa > 0 ? f((s.h + s.bb + s.hbp) / s.pa) : ".---";
    const sg =
      s.ab > 0
        ? f(
            (s.h -
              s.h2b -
              s.h3b -
              s.hr +
              s.h2b * 2 +
              s.h3b * 3 +
              s.hr * 4) /
              s.ab
          )
        : ".---";
    return `<tr><td>${lbl}</td><td>${
      s.pa
    }</td><td>${a}</td><td>${o}</td><td>${sg}</td>
      <td>${s.pa > 0 ? Math.round((s.k / s.pa) * 100) + "%" : "—"}</td>
      <td>${s.pa > 0 ? Math.round((s.bb / s.pa) * 100) + "%" : "—"}</td></tr>`;
  };

  const recentABs5 = sortedGames
    .slice(-5)
    .flatMap((g) =>
      _extractABs(g.pitchLog || [], playerName, teamName, g)
    );
  const recentABs10 = sortedGames
    .slice(-10)
    .flatMap((g) =>
      _extractABs(g.pitchLog || [], playerName, teamName, g)
    );
  const homeSplit = _sumStats(
    allABs.filter((a) => a.isHome).map(_abToStats)
  );
  const awaySplit = _sumStats(
    allABs.filter((a) => !a.isHome).map(_abToStats)
  );
  const rispSplit = _sumStats(
    allABs
      .filter((a) => a.runnersOn?.["2nd"] || a.runnersOn?.["3rd"])
      .map(_abToStats)
  );
  const emptyS = _sumStats(
    allABs
      .filter(
        (a) =>
          !a.runnersOn?.["1st"] &&
          !a.runnersOn?.["2nd"] &&
          !a.runnersOn?.["3rd"]
      )
      .map(_abToStats)
  );

  // Lineup slot
  const slotMap = {};
  allABs.forEach((ab) => {
    const slot = ab.pitches[0]?.batterIdx ?? null;
    if (slot === null) return;
    const k = slot + 1;
    if (!slotMap[k]) slotMap[k] = [];
    slotMap[k].push(_abToStats(ab));
  });
  const slotRows = Object.entries(slotMap)
    .sort((a, b) => +a[0] - +b[0])
    .map(([k, rows]) => {
      const s = _sumStats(rows);
      const ord = +k,
        sfx =
          ord === 1 ? "st" : ord === 2 ? "nd" : ord === 3 ? "rd" : "th";
      return splitRow(`${ord}${sfx}`, s);
    })
    .join("");

  // Hot/Cold zone SVG using pitch log
  const hcz = buildScoutHotColdZone(allPitches, "batter");

  // Spray chart
  const sprayChart = buildSprayChartSVG(allPitches);

  // Recent 5 and 10
  const r5 = _sumStats(recentABs5.map(_abToStats));
  const r10 = _sumStats(recentABs10.map(_abToStats));
  const today = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  // ── Build batted ball pie chart ──
  // ── Larger batted ball pie ──
  const bipSlices = [
    { key: "linedrive", label: "Line Drive", col: "#28a83a" },
    { key: "flyball", label: "Fly Ball", col: "#1a8a3a" },
    { key: "groundball", label: "Ground Ball", col: "#b8860b" },
    { key: "weakgrounder", label: "Weak/Bunt", col: "#8a6000" },
    { key: "popup", label: "Popup", col: "#6a3a8a" },
  ].filter((s) => btCounts[s.key] > 0);
  let bipAngle = 0;
  const BIP_R = 68,
    BIP_CX = 75,
    BIP_CY = 75;
  const bipPaths = bipSlices
    .map((s) => {
      const pct = btCounts[s.key] / bipTotal,
        sweep = pct * Math.PI * 2;
      const x1 = BIP_CX + BIP_R * Math.sin(bipAngle),
        y1 = BIP_CY - BIP_R * Math.cos(bipAngle);
      bipAngle += sweep;
      const x2 = BIP_CX + BIP_R * Math.sin(bipAngle),
        y2 = BIP_CY - BIP_R * Math.cos(bipAngle);
      const large = sweep > Math.PI ? 1 : 0;
      const midA = bipAngle - sweep / 2;
      const lx = BIP_CX + BIP_R * 0.65 * Math.sin(midA),
        ly = BIP_CY - BIP_R * 0.65 * Math.cos(midA);
      const p2 = Math.round(pct * 100);
      return `<path d="M${BIP_CX},${BIP_CY} L${x1.toFixed(
        1
      )},${y1.toFixed(1)} A${BIP_R},${BIP_R} 0 ${large},1 ${x2.toFixed(
        1
      )},${y2.toFixed(1)} Z" fill="${
        s.col
      }" stroke="white" stroke-width="1.5"/>
      ${
p2 >= 7
  ? `<text x="${lx.toFixed(1)}" y="${ly.toFixed(
      1
    )}" text-anchor="middle" dominant-baseline="middle" font-size="9" font-weight="700" fill="white">${p2}%</text>`
  : ""
      }`;
    })
    .join("");
  const bipPieLegend = bipSlices
    .map(
      (s) =>
        `<div style="display:flex;align-items:center;gap:5px;margin-bottom:4px"><div style="width:9px;height:9px;border-radius:2px;background:${
          s.col
        };flex-shrink:0"></div><span style="font-family:'Barlow',sans-serif;font-size:11px;font-weight:500;color:#4a5060">${
          s.label
        }</span><span style="margin-left:auto;font-family:'Barlow Condensed',sans-serif;font-size:13px;font-weight:700;color:#111318;padding-left:8px">${Math.round(
          (btCounts[s.key] / bipTotal) * 100
        )}%</span></div>`
    )
    .join("");
  const bipPie = bipSlices.length
    ? `<div style="display:flex;gap:12px;align-items:center"><svg viewBox="0 0 150 150" style="width:130px;flex-shrink:0">${bipPaths}</svg><div style="flex:1">${bipPieLegend}</div></div>`
    : '<div style="color:#8a909e;font-size:11px">No batted ball data</div>';

  // ── Baseball Savant-style batted ball breakdown ──
  const gbCount = btCounts.groundball + btCounts.weakgrounder;
  const airCount =
    btCounts.flyball + btCounts.linedrive + btCounts.popup;
  const gbPct =
    bipTotal > 0 ? Math.round((gbCount / bipTotal) * 100) : 0;
  const airPct =
    bipTotal > 0 ? Math.round((airCount / bipTotal) * 100) : 0;
  const ldPct =
    bipTotal > 0
      ? Math.round((btCounts.linedrive / bipTotal) * 100)
      : 0;
  const fbPct =
    bipTotal > 0 ? Math.round((btCounts.flyball / bipTotal) * 100) : 0;
  const puPct =
    bipTotal > 0 ? Math.round((btCounts.popup / bipTotal) * 100) : 0;
  const isLeft = stats.hand === "L";
  const pullBip = bip.filter(isPull);
  const strBip = bip.filter(isStraight);
  const oppoBip = bip.filter(isOppo);
  const pullGbPct =
    bipTotal > 0
      ? Math.round(
          (pullBip.filter(
            (p) =>
              p.spray?.btype === "groundball" ||
              p.spray?.btype === "weakgrounder"
          ).length /
            bipTotal) *
            100
        )
      : 0;
  const strGbPct =
    bipTotal > 0
      ? Math.round(
          (strBip.filter(
            (p) =>
              p.spray?.btype === "groundball" ||
              p.spray?.btype === "weakgrounder"
          ).length /
            bipTotal) *
            100
        )
      : 0;
  const oppoGbPct =
    bipTotal > 0
      ? Math.round(
          (oppoBip.filter(
            (p) =>
              p.spray?.btype === "groundball" ||
              p.spray?.btype === "weakgrounder"
          ).length /
            bipTotal) *
            100
        )
      : 0;
  const pullAirPct =
    bipTotal > 0
      ? Math.round(
          (pullBip.filter((p) =>
            ["flyball", "linedrive", "popup"].includes(p.spray?.btype)
          ).length /
            bipTotal) *
            100
        )
      : 0;
  const strAirPct =
    bipTotal > 0
      ? Math.round(
          (strBip.filter((p) =>
            ["flyball", "linedrive", "popup"].includes(p.spray?.btype)
          ).length /
            bipTotal) *
            100
        )
      : 0;
  const oppoAirPct =
    bipTotal > 0
      ? Math.round(
          (oppoBip.filter((p) =>
            ["flyball", "linedrive", "popup"].includes(p.spray?.btype)
          ).length /
            bipTotal) *
            100
        )
      : 0;

  // ── Quality of contact ──
  // Quality of contact — use bip (already filtered to BIP outcomes with spray data)
  const contactPitches = bip; // bip already restricted to BIP outcomes
  const hardPct =
    contactPitches.length > 0
      ? Math.round(
          (contactPitches.filter((p) => p.spray?.hardHit).length /
            contactPitches.length) *
            100
        )
      : 0;
  const ldContactPct =
    contactPitches.length > 0
      ? Math.round(
          (contactPitches.filter((p) => p.spray?.btype === "linedrive")
            .length /
            contactPitches.length) *
            100
        )
      : 0;
  const weakPct =
    contactPitches.length > 0
      ? Math.round(
          (contactPitches.filter(
            (p) =>
              p.spray?.btype === "weakgrounder" ||
              p.spray?.btype === "popup"
          ).length /
            contactPitches.length) *
            100
        )
      : 0;
  const solidPct =
    contactPitches.length > 0
      ? Math.round(
          (contactPitches.filter(
            (p) =>
              ["flyball", "linedrive"].includes(p.spray?.btype) &&
              p.spray?.hardHit
          ).length /
            contactPitches.length) *
            100
        )
      : 0;

  const _hitterScoutFilterBar = `<div class="scout-print-hide" style="display:flex;justify-content:flex-end;align-items:center;gap:10px;margin-bottom:10px">
  ${
    _scoutRecentFilter
      ? `<span style="font-family:'Barlow Condensed',sans-serif;font-size:11px;letter-spacing:1px;color:var(--text3);text-transform:uppercase">Showing last 5 games</span>`
      : ""
  }
  <button class="recent-filter-btn${
    _scoutRecentFilter ? " rfb-active" : ""
  }" onclick="reRenderScoutingReport('hitter','${escAttr(teamName)}','${escAttr(
    playerName
  )}')">${
    _scoutRecentFilter ? "⏱ Last 5 Games" : "⏱ Filter Recent"
  }</button>
</div>`;
  return `<div class="scout-report-page" id="scout-hitter-report" style="padding:16px;background:#fff;font-family:'Barlow Condensed',sans-serif;overflow:hidden;max-width:100%">
  ${_hitterScoutFilterBar}
  <!-- Header -->
  <div class="scout-header" style="display:flex;align-items:flex-start;justify-content:space-between;border-bottom:3px solid #cc1a1a;padding-bottom:6px;margin-bottom:8px">
    <div>
      <div style="font-family:'Barlow',sans-serif;font-weight:700;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#cc1a1a;margin-bottom:2px">Hitter Scouting Report</div>
      <div style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:24px;color:var(--text);line-height:1">#${
stats.num || "—"
      } ${escHtml(playerName)}</div>
      <div style="font-family:'Barlow',sans-serif;font-size:11px;font-weight:400;color:#8a909e;margin-top:3px">${
stats.pos || "—"
      } · ${stats.hand || "R"}HH · ${escHtml(teamName)} · ${
    stats.games
  }G · ${pa} PA · ${today}</div>
    </div>
    <div style="display:flex;gap:20px;align-items:flex-end;flex-shrink:0">
      ${[
["AVG", f(avg), "#cc1a1a"],
["OBP", f(obp), "var(--text)"],
["SLG", f(slg), "var(--text)"],
[
  "OPS",
  f(ops),
  ops >= 0.8 ? "#1a8a3a" : ops >= 0.7 ? "#b8860b" : "#cc1a1a",
],
      ]
.map(
  ([l, v, c]) =>
    `<div style="text-align:center"><div style="font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:24px;line-height:1;color:${c}">${v}</div><div style="font-family:'Barlow',sans-serif;font-size:9px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;color:#8a909e;margin-top:3px">${l}</div></div>`
)
.join("")}
    </div>
  </div>

  <!-- Row 1: Production stats + Plate Discipline bars (50/50) -->
  <div class="scout-r1" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:8px">
    <div class="scout-section" style="margin-bottom:0">
      <div class="scout-section-title">Production</div>
      <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:5px">
${[
  ["H", h],
  ["2B", stats.doubles],
  ["3B", stats.triples],
  ["HR", stats.hr],
  ["R", stats.r || 0],
  ["RBI", stats.rbi || 0],
  ["BB", stats.bb || 0],
  ["K", stats.k || 0],
  ["HBP", stats.hbp || 0],
  ["K%", fp(kpct)],
  ["BB%", fp(bbpct)],
  ["P/PA", pa > 0 ? (total / pa).toFixed(1) : "—"],
]
  .map(
    ([l, v]) => `
  <div style="background:#f8f9fb;border:1px solid #e0e4ea;border-radius:5px;padding:5px 3px;text-align:center"><div style="font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:17px;line-height:1;color:${
    l === "HR" && +v > 0 ? "#cc1a1a" : "#111318"
  }">${v}</div><div style="font-family:'Barlow',sans-serif;font-size:8px;font-weight:600;color:#8a909e;margin-top:2px;letter-spacing:0">${l}</div></div>`
  )
  .join("")}
      </div>
    </div>
    <div class="scout-section" style="margin-bottom:0">
      <div class="scout-section-title">Plate Discipline</div>
      ${[
["Swing%", swings, total, "#5baef5"],
["Contact%", contact, swings, "#1a8a3a"],
["Zone%", inZone.length, total, "#cc1a1a"],
[
  "Zone Swing%",
  inZone.filter((p) => swingOuts.includes(p.outcome)).length,
  inZone.length,
  "#e05c10",
],
["Chase%", chaseSwings, outZone.length, "#8a0000"],
["Whiff%", whiffs, swings, "#c01a1a"],
["Hard Hit%", hardHits, contact, "#d42828"],
      ]
.map(
  ([lbl, n, d, col]) => `
<div style="display:flex;align-items:center;gap:5px;margin-bottom:2px">
  <div style="font-family:'Barlow',sans-serif;font-size:11px;font-weight:500;color:#4a5060;width:82px;flex-shrink:0">${lbl}</div>
  <div style="flex:1;background:#e8eaee;border-radius:3px;height:8px;overflow:hidden"><div style="width:${
    d > 0 ? Math.round((n / d) * 100) : 0
  }%;height:100%;background:${col};border-radius:3px"></div></div>
  <div style="font-size:10px;color:#8a909e;width:30px;text-align:right;flex-shrink:0">${
    d > 0 ? Math.round((n / d) * 100) + "%" : "—"
  }</div>
</div>`
)
.join("")}
    </div>
  </div>

  <!-- Row 2: Spray | Batted Ball Profile | Field Heat Map | Hot/Cold -->
  <div class="scout-r2" style="display:grid;grid-template-columns:1.4fr 1fr 1fr 0.85fr;gap:8px;margin-bottom:8px;align-items:start">

    <!-- Spray chart -->
    <div class="scout-section" style="margin-bottom:0">
      <div class="scout-section-title">Spray Chart</div>
      ${sprayChart}
    </div>

    <!-- Batted ball: pie + Savant breakdown + quality -->
    <div style="display:flex;flex-direction:column;gap:8px">
      <div class="scout-section" style="margin-bottom:0">
<div class="scout-section-title">Batted Ball Profile</div>
${bipPie}
      </div>
      <div class="scout-section" style="margin-bottom:0">
<div class="scout-section-title">Breakdown</div>
<table class="scout-table" style="font-size:10px">
  <thead><tr><th></th><th>GB%</th><th>AIR%</th><th>LD%</th><th>FB%</th><th>PU%</th></tr></thead>
  <tbody><tr><td>All</td><td>${gbPct}%</td><td>${airPct}%</td><td>${ldPct}%</td><td>${fbPct}%</td><td>${puPct}%</td></tr></tbody>
</table>
<table class="scout-table" style="font-size:10px;margin-top:4px">
  <thead><tr><th></th><th>Pull</th><th>Str</th><th>Oppo</th></tr></thead>
  <tbody>
    <tr><td>All%</td><td>${pullPct}%</td><td>${centrPct}%</td><td>${oppoPct}%</td></tr>
    <tr><td>GB%</td><td>${pullGbPct}%</td><td>${strGbPct}%</td><td>${oppoGbPct}%</td></tr>
    <tr><td>AIR%</td><td>${pullAirPct}%</td><td>${strAirPct}%</td><td>${oppoAirPct}%</td></tr>
  </tbody>
</table>
<div style="margin-top:6px">
  <div class="scout-section-title">Quality of Contact</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px">
    ${[
      ["Hard Hit%", hardPct, "#cc1a1a"],
      ["LD%", ldContactPct, "#28a83a"],
      ["Weak%", weakPct, "#8a6000"],
      ["Solid Air%", solidPct, "#1a5acc"],
    ]
      .map(
        ([l, v, c]) => `
      <div style="background:#f8f9fb;border:1px solid #e0e4ea;border-radius:4px;padding:4px 3px;text-align:center">
        <div style="font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:15px;color:${
          v >= 30 ? c : "#111318"
        };line-height:1">${v}%</div>
        <div style="font-family:'Barlow',sans-serif;font-size:8px;font-weight:500;color:#8a909e;margin-top:2px;letter-spacing:0">${l}</div>
      </div>`
      )
      .join("")}
  </div>
</div>
      </div>
    </div>

    <!-- Field zone frequency heat map -->
    <div class="scout-section" style="margin-bottom:0">
      <div class="scout-section-title">Zone Frequency</div>
      ${buildSprayHeatMap(bip, isLeftHand)}
    </div>

    <!-- Hot/Cold zone -->
    <div class="scout-section" style="margin-bottom:0">
      <div class="scout-section-title">Pitch Contact Zone</div>
      ${hcz}
    </div>
  </div>


  <!-- Row 3: Count/Situation + vs Pitch Type (50/50) -->
  <div class="scout-r3" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:8px">
    <div class="scout-section" style="margin-bottom:0">
      <div class="scout-section-title">Performance by Count / Situation</div>
      <table class="scout-table">
<thead><tr><th style="text-align:left">Situation</th><th>PA</th><th>AB</th><th>H</th><th>AVG</th><th>OBP</th><th>SLG</th><th>OPS</th><th>K%</th><th>BB%</th></tr></thead>
<tbody>${countRows}</tbody>
      </table>
    </div>
    <div class="scout-section" style="margin-bottom:0">
      <div class="scout-section-title">vs Pitch Type</div>
      <table class="scout-table">
<thead><tr><th style="text-align:left">Pitch</th><th>Seen</th><th>AVG</th><th>SLG</th><th>OPS</th><th>Whiff%</th><th>K%</th></tr></thead>
<tbody>${
  ptRows ||
  '<tr><td colspan="7" style="color:#8a909e;font-size:11px">No pitch type data</td></tr>'
}</tbody>
      </table>
    </div>
  </div>

  <!-- Row 4: Key Splits + By Lineup Slot (50/50) -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
    <div class="scout-section" style="margin-bottom:0">
      <div class="scout-section-title">Key Splits</div>
      <table class="scout-table">
<thead><tr><th style="text-align:left">Split</th><th>PA</th><th>AVG</th><th>OBP</th><th>SLG</th><th>K%</th><th>BB%</th></tr></thead>
<tbody>
  ${splitRow("vs LHP", vsL)}${splitRow("vs RHP", vsR)}
  ${splitRow("Home", homeSplit)}${splitRow("Away", awaySplit)}
  ${splitRow("RISP", rispSplit)}${splitRow("Bases Empty", emptyS)}
  ${splitRow("Last 5 G", r5)}${splitRow("Last 10 G", r10)}
</tbody>
      </table>
    </div>
    <div class="scout-section" style="margin-bottom:0">
      <div class="scout-section-title">By Lineup Slot</div>
      <table class="scout-table">
<thead><tr><th style="text-align:left">Slot</th><th>PA</th><th>AVG</th><th>OBP</th><th>SLG</th><th>K%</th><th>BB%</th></tr></thead>
<tbody>${
  slotRows ||
  '<tr><td colspan="7" style="color:#8a909e;font-size:11px">No data</td></tr>'
}</tbody>
      </table>
    </div>
  </div>
  </div>`;
}

// ── PITCHER SCOUTING REPORT ────────────────────────────────────────
function buildPitcherScoutingReport(teamName, pitcherName, games) {
  const allPitches = getPitcherPitches(teamName, pitcherName, games);
  const sortedGames = [...games].sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  let career = {
    num: "—",
    hand: "R",
    games: 0,
    pitches: 0,
    k: 0,
    bb: 0,
    hits: 0,
    swings: 0,
    looks: 0,
    outs: 0,
    r: 0,
    hbp: 0,
    bf: 0,
    poAtt: 0,
    poOuts: 0,
  };
  const pitcherNames =
    _nameAliases[pitcherName] || new Set([pitcherName]);
  sortedGames.forEach((g) => {
    const pitchers =
      g.awayTeam === teamName ? g.awayPitchers : g.homePitchers;
    const p = (pitchers || []).find((x) => pitcherNames.has(x.name));
    if (!p || !p.pitches) return;
    career.num = p.num || career.num;
    career.hand = p.hand || career.hand;
    career.games++;
    career.pitches += p.pitches || 0;
    career.k += p.k || 0;
    career.bb += p.bb || 0;
    career.hits += p.hits || 0;
    career.swings += p.swings || 0;
    career.looks += p.looks || 0;
    career.outs += p.outs || 0;
    career.r += p.r || 0;
    career.hbp += p.hbp || 0;
    career.bf += p.bf || 0;
    career.poAtt += p.poAtt || 0;
    career.poOuts += p.poOuts || 0;
  });

  const total = allPitches.length || 1;
  const logStrikes = allPitches.filter((p) =>
    _isStrike(p.outcome)
  ).length;
  const sp = Math.round((logStrikes / total) * 100);
  const fp = allPitches.filter((p) => _isFirstPitch(p));
  const fpsPct =
    fp.length > 0
      ? Math.round(
          (fp.filter((p) => _isStrike(p.outcome)).length / fp.length) *
            100
        )
      : 0;
  const oo11 = allPitches.filter(
    (p) =>
      (p.balls === 1 &&
        p.strikes === 2 &&
        ["strike-swinging", "strike-looking", "foul"].includes(
          p.outcome
        )) ||
      (p.balls === 2 && p.strikes === 1 && p.outcome === "ball")
  );
  const oo11Pct =
    oo11.length > 0
      ? Math.round(
          (oo11.filter((p) =>
            ["strike-swinging", "strike-looking", "foul"].includes(
              p.outcome
            )
          ).length /
            oo11.length) *
            100
        )
      : 0;
  const swings = allPitches.filter((p) =>
    [
      "strike-swinging",
      "foul",
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
    ].includes(p.outcome)
  ).length;
  const swPct = Math.round((swings / total) * 100);
  const inZone = allPitches.filter(
    (p) =>
      p.pitchX != null &&
      p.pitchX >= 31 &&
      p.pitchX <= 69 &&
      p.pitchY != null &&
      p.pitchY >= 30.9 &&
      p.pitchY <= 69.1
  );
  const zonePct = Math.round((inZone.length / total) * 100);
  const whiffs = allPitches.filter(
    (p) => p.outcome === "strike-swinging"
  ).length;
  const vels = allPitches
    .map((p) => parseFloat(p.velocity))
    .filter((v) => !isNaN(v) && v > 0);
  const avgVel = vels.length
    ? (vels.reduce((a, b) => a + b, 0) / vels.length).toFixed(1)
    : "—";
  const maxVel = vels.length ? Math.max(...vels) : "—";
  const kbb =
    career.bb > 0
      ? (career.k / career.bb).toFixed(2)
      : career.k > 0
      ? "∞"
      : "—";
  const typeColors = {
    "4SFB": "#2878d4",
    "2SFB": "#5baef5",
    FB: "#1a5acc",
    CUT: "#4a9ec8",
    CT: "#4a9ec8",
    SNK: "#0e3d8a",
    SI: "#0e3d8a",
    CRV: "#d42828",
    CB: "#d42828",
    SLD: "#e05c10",
    SL: "#e05c10",
    SLV: "#b03090",
    SPL: "#9b5de5",
    SP: "#9b5de5",
    CH: "#28a83a",
    KN: "#8a8a00",
    UNKN: "#8a909e",
  };

  // Pitch arsenal per type
  const byType = {};
  allPitches.forEach((p) => {
    const t = p.pitchType && p.pitchType !== "—" ? p.pitchType : "UNKN";
    if (!byType[t])
      byType[t] = {
        total: 0,
        strikes: 0,
        whiffs: 0,
        swings: 0,
        vels: [],
        hits: 0,
        ab: 0,
        fp: 0,
        fpStr: 0,
      };
    byType[t].total++;
    if (_isStrike(p.outcome)) byType[t].strikes++;
    if (p.outcome === "strike-swinging") byType[t].whiffs++;
    if (
      [
        "strike-swinging",
        "foul",
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
      ].includes(p.outcome)
    )
      byType[t].swings++;
    const v = parseFloat(p.velocity);
    if (!isNaN(v) && v > 0) byType[t].vels.push(v);
    if (["single", "double", "triple", "homerun"].includes(p.outcome)) {
      byType[t].hits++;
      byType[t].ab++;
    }
    if (
      [
        "groundout",
        "flyout",
        "lineout",
        "sacfly",
        "sacbunt",
        "error",
      ].includes(p.outcome)
    )
      byType[t].ab++;
    if (_isFirstPitch(p)) {
      byType[t].fp++;
      if (_isStrike(p.outcome)) byType[t].fpStr++;
    }
  });

  const arsenalRows = Object.entries(byType)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([t, d]) => {
      const usg = Math.round((d.total / total) * 100);
      const avgV = d.vels.length
        ? (d.vels.reduce((a, b) => a + b, 0) / d.vels.length).toFixed(1)
        : "—";
      const strPct =
        d.total > 0
          ? Math.round((d.strikes / d.total) * 100) + "%"
          : "—";
      const whiffPct =
        d.swings > 0
          ? Math.round((d.whiffs / d.swings) * 100) + "%"
          : "—";
      const ba = d.ab > 0 ? _fmtRate(d.hits / d.ab) : ".---";
      const fpPct =
        d.fp > 0 ? Math.round((d.fpStr / d.fp) * 100) + "%" : "—";
      return `<tr>
      <td><span style="font-weight:900;color:${
typeColors[t] || "#8a909e"
      }">${t}</span></td>
      <td>${d.total} <span class="scout-dim">(${usg}%)</span></td>
      <td>${avgV}</td><td>${strPct}</td><td>${whiffPct}</td>
      <td class="${
d.ab > 0 && d.hits / d.ab >= 0.3
  ? "scout-highlight"
  : d.ab > 0 && d.hits / d.ab < 0.2
  ? "scout-good"
  : ""
      }">${ba}</td>
      <td>${fpPct}</td>
    </tr>`;
    })
    .join("");

  // Outcome breakdown
  const outMap = {
    ball: 0,
    "strike-swinging": 0,
    "strike-looking": 0,
    foul: 0,
    "ip-hit": 0,
    "ip-out": 0,
    hbp: 0,
  };
  allPitches.forEach((p) => {
    const o = p.outcome;
    if (o === "ball") outMap.ball++;
    else if (o === "strike-swinging") outMap["strike-swinging"]++;
    else if (o === "strike-looking") outMap["strike-looking"]++;
    else if (o === "foul") outMap.foul++;
    else if (
      ["single", "double", "triple", "homerun", "error"].includes(o)
    )
      outMap["ip-hit"]++;
    else if (
      ["groundout", "flyout", "lineout", "sacfly", "sacbunt"].includes(
        o
      )
    )
      outMap["ip-out"]++;
    else if (o === "hbp") outMap.hbp++;
  });
  const outLabels = {
    ball: "Ball",
    "strike-swinging": "Swing K",
    "strike-looking": "Called K",
    foul: "Foul",
    "ip-hit": "Hit/Reach",
    "ip-out": "Field Out",
    hbp: "HBP",
  };
  const outColors2 = {
    ball: "#1a6abf",
    "strike-swinging": "#8a0000",
    "strike-looking": "#c01a1a",
    foul: "#8a4a00",
    "ip-hit": "#9a7a00",
    "ip-out": "#6a1ab0",
    hbp: "#8822cc",
  };
  // Build outcome pie chart inline SVG
  const outSlices = Object.entries(outMap)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  const outTotal = outSlices.reduce((s, [, n]) => s + n, 0) || 1;
  let outAngle = 0;
  const PIE_R = 70,
    PIE_CX = 90,
    PIE_CY = 80;
  const outPaths = outSlices
    .map(([o, n]) => {
      const pct = n / outTotal,
        sweep = pct * Math.PI * 2;
      const x1 = PIE_CX + PIE_R * Math.sin(outAngle),
        y1 = PIE_CY - PIE_R * Math.cos(outAngle);
      outAngle += sweep;
      const x2 = PIE_CX + PIE_R * Math.sin(outAngle),
        y2 = PIE_CY - PIE_R * Math.cos(outAngle);
      const large = sweep > Math.PI ? 1 : 0;
      const col = outColors2[o] || "#8a909e";
      const midA = outAngle - sweep / 2;
      const lx = PIE_CX + PIE_R * 0.65 * Math.sin(midA),
        ly = PIE_CY - PIE_R * 0.65 * Math.cos(midA);
      const pctLbl = Math.round(pct * 100);
      return `<path d="M${PIE_CX},${PIE_CY} L${x1.toFixed(
        1
      )},${y1.toFixed(1)} A${PIE_R},${PIE_R} 0 ${large},1 ${x2.toFixed(
        1
      )},${y2.toFixed(1)} Z" fill="${col}"/>
      ${
pctLbl >= 7
  ? `<text x="${lx.toFixed(1)}" y="${ly.toFixed(
      1
    )}" text-anchor="middle" dominant-baseline="middle" font-size="9" font-weight="700" fill="white">${pctLbl}%</text>`
  : ""
      }`;
    })
    .join("");
  // Legend
  const outLegend = outSlices
    .map(
      ([o, n]) => `
    <div style="display:flex;align-items:center;gap:4px;margin-bottom:3px">
      <div style="width:10px;height:10px;border-radius:2px;background:${
outColors2[o] || "#8a909e"
      };flex-shrink:0"></div>
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:11px;color:#4a5060;white-space:nowrap">${
outLabels[o] || o
      }</div>
      <div style="font-family:'Share Tech Mono',monospace;font-size:10px;color:#8a909e;margin-left:auto;padding-left:6px">${n} · ${Math.round(
        (n / outTotal) * 100
      )}%</div>
    </div>`
    )
    .join("");
  const outcomePie = `<div style="display:flex;gap:12px;align-items:flex-start">
    <svg viewBox="0 0 180 160" style="width:160px;flex-shrink:0"><g>${outPaths}</g></svg>
    <div style="flex:1;padding-top:4px">${outLegend}</div>
  </div>`;

  // ── Pitch mix pie chart ──
  const mixTypes = Object.entries(byType)
    .filter(([, d]) => d.total > 0)
    .sort((a, b) => b[1].total - a[1].total);
  let mixAngle = 0;
  const MIX_R = 70,
    MIX_CX = 90,
    MIX_CY = 80;
  const mixPaths = mixTypes
    .map(([t, d]) => {
      const pct = d.total / total,
        sweep = pct * Math.PI * 2;
      const x1 = MIX_CX + MIX_R * Math.sin(mixAngle),
        y1 = MIX_CY - MIX_R * Math.cos(mixAngle);
      mixAngle += sweep;
      const x2 = MIX_CX + MIX_R * Math.sin(mixAngle),
        y2 = MIX_CY - MIX_R * Math.cos(mixAngle);
      const large = sweep > Math.PI ? 1 : 0;
      const col = typeColors[t] || "#8a909e";
      const midA = mixAngle - sweep / 2;
      const lx = MIX_CX + MIX_R * 0.65 * Math.sin(midA),
        ly = MIX_CY - MIX_R * 0.65 * Math.cos(midA);
      const pctLbl = Math.round(pct * 100);
      return `<path d="M${MIX_CX},${MIX_CY} L${x1.toFixed(
        1
      )},${y1.toFixed(1)} A${MIX_R},${MIX_R} 0 ${large},1 ${x2.toFixed(
        1
      )},${y2.toFixed(
        1
      )} Z" fill="${col}" stroke="white" stroke-width="1.5"/>
      ${
pctLbl >= 7
  ? `<text x="${lx.toFixed(1)}" y="${ly.toFixed(
      1
    )}" text-anchor="middle" dominant-baseline="middle" font-size="9" font-weight="700" fill="white">${pctLbl}%</text>`
  : ""
      }`;
    })
    .join("");
  const mixLegend = mixTypes
    .map(
      ([t, d]) => `
    <div style="display:flex;align-items:center;gap:4px;margin-bottom:3px">
      <div style="width:10px;height:10px;border-radius:2px;background:${
typeColors[t] || "#8a909e"
      };flex-shrink:0"></div>
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:11px;color:#4a5060;white-space:nowrap;font-weight:700;color:${
typeColors[t] || "#4a5060"
      }">${t}</div>
      <div style="font-family:'Share Tech Mono',monospace;font-size:10px;color:#8a909e;margin-left:auto;padding-left:6px">${
d.total
      } · ${Math.round((d.total / total) * 100)}%</div>
    </div>`
    )
    .join("");
  const mixPie = `<div style="display:flex;gap:12px;align-items:flex-start">
    <svg viewBox="0 0 180 160" style="width:160px;flex-shrink:0"><g>${mixPaths}</g></svg>
    <div style="flex:1;padding-top:4px">${mixLegend}</div>
  </div>`;

  // Count discipline rows
  const countSit = [
    {
      lbl: "0-0 (FPS)",
      fn: (p) => {
        const c = _ppc(p);
        return c.balls === 0 && c.strikes === 0;
      },
    },
    {
      lbl: "1-1 Count",
      fn: (p) => {
        const c = _ppc(p);
        return c.balls === 1 && c.strikes === 1;
      },
    },
    {
      lbl: "Ahead (0-1,0-2)",
      fn: (p) => {
        const c = _ppc(p);
        return c.strikes > c.balls;
      },
    },
    {
      lbl: "Behind (1-0+)",
      fn: (p) => {
        const c = _ppc(p);
        return c.balls > c.strikes;
      },
    },
    { lbl: "2-Strike", fn: (p) => _ppc(p).strikes === 2 },
    {
      lbl: "Full Count",
      fn: (p) => {
        const c = _ppc(p);
        return c.balls === 3 && c.strikes === 2;
      },
    },
  ];
  const cRows = countSit
    .map((c) => {
      const subset = allPitches.filter(c.fn);
      const s2 = subset.filter((p) => _isStrike(p.outcome)).length;
      const sw = subset.filter((p) =>
        [
          "strike-swinging",
          "foul",
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
        ].includes(p.outcome)
      ).length;
      const wh = subset.filter(
        (p) => p.outcome === "strike-swinging"
      ).length;
      return `<tr>
      <td>${c.lbl}</td><td>${subset.length}</td>
      <td class="${
subset.length > 0 && s2 / subset.length >= 0.6
  ? "scout-good"
  : subset.length > 0 && s2 / subset.length < 0.5
  ? "scout-highlight"
  : ""
      }">${
        subset.length > 0
          ? Math.round((s2 / subset.length) * 100) + "%"
          : "—"
      }</td>
      <td>${
subset.length > 0 ? Math.round((sw / subset.length) * 100) + "%" : "—"
      }</td>
      <td>${sw > 0 ? Math.round((wh / sw) * 100) + "%" : "—"}</td>
    </tr>`;
    })
    .join("");

  // Last 5 games
  const _scoutPNames =
    _nameAliases[pitcherName] || new Set([pitcherName]);
  const last5 = sortedGames
    .slice(-5)
    .map((g) => {
      const pitchers =
        g.awayTeam === teamName ? g.awayPitchers : g.homePitchers;
      const p = (pitchers || []).find((x) => _scoutPNames.has(x.name));
      if (!p || !p.pitches) return null;
      const gPitches = allPitches.filter((q) => q.inning);
      const sp2 =
        p.pitches > 0 ? Math.round((p.strikes / p.pitches) * 100) : 0;
      return `<tr>
      <td>${g.date}</td>
      <td>${g.awayTeam === teamName ? g.homeTeam : g.awayTeam}</td>
      <td>${p.pitches}</td><td>${p.k}</td><td>${p.bb}</td><td>${p.hits}</td>
      <td class="${
sp2 >= 60 ? "scout-good" : sp2 < 50 ? "scout-highlight" : ""
      }">${sp2}%</td>
    </tr>`;
    })
    .filter(Boolean)
    .join("");

  // Top 3 pitch type zone SVGs
  const top3Types = Object.entries(byType)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 3)
    .map(([t]) => t);
  // top3Zones inlined in layout below

  // Recent 50 pitches per type — only when NOT in recent-filter mode (filter already limits data)
  const _recent50HTML = (() => {
    if (top3Types.length === 0 || _recentFilter) return "";
    const sorted = [...allPitches].sort((a, b) =>
      (b.gameDate || "").localeCompare(a.gameDate || "")
    );
    const cols = top3Types
      .map((t) => {
        const r50 = sorted
          .filter((p) => p.pitchType === t)
          .slice(0, 50);
        return `<div class="scout-section" style="margin-bottom:0">
        <div class="scout-section-title" style="color:${
          typeColors[t] || "#8a909e"
        }">${t} Last 50 · ${r50.length}P</div>
        ${buildPitchZoneSVG(r50, 200, 185)}
      </div>`;
      })
      .join("");
    return `<div class="scout-section" style="margin:6px 0 4px;padding-top:6px;border-top:1px solid var(--border)">
        <div class="scout-section-title" style="color:var(--text2)">Recent Pitch Locations · Last 50 Per Type</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:10px">
        ${cols}
      </div>`;
  })();

  // Strike% by type bars
  const strBars = Object.entries(byType)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([t, d]) => {
      const pct =
        d.total > 0 ? Math.round((d.strikes / d.total) * 100) : 0;
      return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:11px;font-weight:800;color:${
typeColors[t] || "#8a909e"
      };width:24px;flex-shrink:0">${t}</div>
      <div style="flex:0 0 45%;background:#e8eaee;border-radius:3px;height:10px;overflow:hidden">
<div style="width:${pct}%;height:100%;background:${
        typeColors[t] || "#8a909e"
      };border-radius:3px"></div>
      </div>
      <div style="font-family:'Share Tech Mono',monospace;font-size:10px;color:#8a909e;white-space:nowrap">${
d.strikes
      }/${d.total} · ${pct}%</div>
    </div>`;
    })
    .join("");

  const today = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  // ── New analytics sections ──────────────────────────────────────────

  // vs Batter Handedness
  const _scoutSwingOuts = [
    "strike-swinging",
    "foul",
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
  ];
  function _scoutSplitRow(lbl, subset) {
    if (!subset.length)
      return `<tr><td>${lbl}</td><td colspan="5" style="color:#8a909e">—</td></tr>`;
    const n = subset.length;
    const str = subset.filter((p) => _isStrike(p.outcome)).length;
    const sw = subset.filter((p) =>
      _scoutSwingOuts.includes(p.outcome)
    ).length;
    const wh = subset.filter(
      (p) => p.outcome === "strike-swinging"
    ).length;
    const fps = subset.filter((p) => _isFirstPitch(p));
    const fpStr = fps.filter((p) => _isStrike(p.outcome)).length;
    const sp2 = Math.round((str / n) * 100);
    return `<tr>
      <td style="font-weight:600">${lbl}</td><td>${n}</td>
      <td class="${
        sp2 >= 60 ? "scout-good" : sp2 < 50 ? "scout-highlight" : ""
      }">${sp2}%</td>
      <td>${Math.round((sw / n) * 100)}%</td>
      <td>${sw > 0 ? Math.round((wh / sw) * 100) + "%" : "—"}</td>
      <td style="color:#8a909e">${
        fps.length > 0
          ? Math.round((fpStr / fps.length) * 100) + "%"
          : "—"
      }</td>
    </tr>`;
  }

  const _handPitchesScout = allPitches.filter(
    (p) => p.batterHand === "R" || p.batterHand === "L"
  );
  const handSplitHTML = `
    <div class="scout-section" style="margin-bottom:0">
      <div class="scout-section-title">vs Batter Handedness</div>
      ${
        _handPitchesScout.length >= 2
          ? `<table class="scout-table">
        <thead><tr><th style="text-align:left">Split</th><th>P</th><th>Str%</th><th>Sw%</th><th>Whiff%</th><th>FPS%</th></tr></thead>
        <tbody>
          ${_scoutSplitRow(
            "vs RHB",
            allPitches.filter((p) => p.batterHand === "R")
          )}
          ${_scoutSplitRow(
            "vs LHB",
            allPitches.filter((p) => p.batterHand === "L")
          )}
        </tbody>
      </table>`
          : `<div style="font-size:9px;color:#8a909e;font-style:italic;padding:4px 0">Tracked in newly recorded games</div>`
      }
    </div>`;

  // Times Through Order (TTO) — compute per-game from allPitches
  const _ttoByIdx = {};
  const _pitchesByGameScout = {};
  allPitches.forEach((p, i) => {
    const gid = p.gameId || p._gameId;
    if (!_pitchesByGameScout[gid]) _pitchesByGameScout[gid] = [];
    _pitchesByGameScout[gid].push({ p, i });
  });
  Object.values(_pitchesByGameScout).forEach((entries) => {
    const ordered = [...entries].reverse();
    const appearances = {};
    let prevBI = null;
    ordered.forEach(({ p, i }) => {
      const bi = p.batterIdx;
      if (bi !== prevBI) {
        appearances[bi] = (appearances[bi] || 0) + 1;
        prevBI = bi;
      }
      _ttoByIdx[i] = appearances[bi] || 1;
    });
  });
  const _allPitchesWithTTO = allPitches.map((p, i) => ({
    ...p,
    _tto: _ttoByIdx[i] || 1,
  }));
  const ttoSplitHTML = `
    <div class="scout-section" style="margin-bottom:0">
      <div class="scout-section-title">Times Through the Order</div>
      <table class="scout-table">
        <thead><tr><th style="text-align:left">Split</th><th>P</th><th>Str%</th><th>Sw%</th><th>Whiff%</th><th>FPS%</th></tr></thead>
        <tbody>
          ${_scoutSplitRow(
            "1st TTO",
            _allPitchesWithTTO.filter((p) => p._tto === 1)
          )}
          ${_scoutSplitRow(
            "2nd TTO",
            _allPitchesWithTTO.filter((p) => p._tto === 2)
          )}
          ${_scoutSplitRow(
            "3rd TTO+",
            _allPitchesWithTTO.filter((p) => p._tto >= 3)
          )}
        </tbody>
      </table>
    </div>`;

  // Individual count splits (12 counts)
  const _scoutAllCounts = [
    [0, 0],
    [0, 1],
    [0, 2],
    [1, 0],
    [1, 1],
    [1, 2],
    [2, 0],
    [2, 1],
    [2, 2],
    [3, 0],
    [3, 1],
    [3, 2],
  ];
  const indivCountRows = _scoutAllCounts
    .map(([b, s]) => {
      const sub = allPitches.filter(
        (p) => p.balls === b && p.strikes === s
      );
      return sub.length >= 1 ? _scoutSplitRow(`${b}-${s}`, sub) : null;
    })
    .filter(Boolean)
    .join("");
  const indivCountHTML = indivCountRows
    ? `
    <div class="scout-section" style="margin-top:12px">
      <div class="scout-section-title">Individual Count Splits</div>
      <table class="scout-table">
        <thead><tr><th style="text-align:left">Count</th><th>P</th><th>Strike%</th><th>Swing%</th><th>Whiff%</th><th>FPS%</th></tr></thead>
        <tbody>${indivCountRows}</tbody>
      </table>
    </div>`
    : "";

  // Velocity by pitch type
  const _scoutVeloByType = {};
  allPitches.forEach((p) => {
    const v = parseFloat(p.velocity);
    if (isNaN(v) || v <= 0) return;
    const t = p.pitchType && p.pitchType !== "—" ? p.pitchType : null;
    if (!t) return;
    if (!_scoutVeloByType[t]) _scoutVeloByType[t] = [];
    _scoutVeloByType[t].push(v);
  });
  const veloByTypeRows = Object.entries(_scoutVeloByType)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([t, vs]) => {
      const avg = (vs.reduce((a, b) => a + b, 0) / vs.length).toFixed(
        1
      );
      const max = Math.max(...vs).toFixed(1);
      const min = Math.min(...vs).toFixed(1);
      return `<tr><td style="font-weight:600">${t}</td><td>${vs.length}</td><td style="font-weight:700">${avg}</td><td style="color:#1a7a3a">${max}</td><td style="color:#8a909e">${min}</td></tr>`;
    })
    .join("");
  const veloByTypeHTML = veloByTypeRows
    ? `
    <div class="scout-section" style="margin-bottom:0">
      <div class="scout-section-title">Velocity by Pitch Type</div>
      <table class="scout-table">
        <thead><tr><th style="text-align:left">Pitch</th><th>N</th><th>Avg</th><th>Max</th><th>Min</th></tr></thead>
        <tbody>${veloByTypeRows}</tbody>
      </table>
    </div>`
    : "";

  const _pitcherScoutFilterBar = `<div class="scout-print-hide" style="display:flex;justify-content:flex-end;align-items:center;gap:10px;margin-bottom:10px">
  ${
    _scoutRecentFilter
      ? `<span style="font-family:'Barlow Condensed',sans-serif;font-size:11px;letter-spacing:1px;color:var(--text3);text-transform:uppercase">Showing last 3 appearances</span>`
      : ""
  }
  <button class="recent-filter-btn${
    _scoutRecentFilter ? " rfb-active" : ""
  }" onclick="reRenderScoutingReport('pitcher','${escAttr(
    teamName
  )}','${escAttr(pitcherName)}')">${
    _scoutRecentFilter ? "⏱ Last 3 Games" : "⏱ Filter Recent"
  }</button>
</div>`;
  return `<div class="scout-report-page" id="scout-pitcher-report" style="padding:14px;background:#fff;font-family:'Barlow Condensed',sans-serif;overflow:hidden;max-width:100%">
  ${_pitcherScoutFilterBar}
  <!-- Header -->
  <div class="scout-header" style="display:flex;align-items:flex-start;justify-content:space-between;border-bottom:3px solid #1a5acc;padding-bottom:8px;margin-bottom:12px">
    <div>
      <div style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#1a5acc;margin-bottom:2px">Pitcher Scouting Report</div>
      <div style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:32px;color:var(--text);line-height:1">#${
career.num || "—"
      } ${escHtml(pitcherName)}</div>
      <div style="font-size:12px;color:#8a909e;margin-top:3px">${
career.hand === "L" ? "LHP" : "RHP"
      } · ${escHtml(teamName)} · ${career.games} G · ${career.pitches} P · ${
    allPitches.length
  } logged · Generated ${today}</div>
    </div>
    <div style="display:flex;gap:18px;align-items:flex-end;flex-shrink:0">
      <div style="text-align:center"><div class="scout-big-stat" style="color:#cc1a1a">${sp}%</div><div class="scout-big-lbl">Strike%</div></div>
      <div style="text-align:center"><div class="scout-big-stat">${fpsPct}%</div><div class="scout-big-lbl">FPS%</div></div>
      <div style="text-align:center"><div class="scout-big-stat">${kbb}</div><div class="scout-big-lbl">K/BB</div></div>
      <div style="text-align:center"><div class="scout-big-stat" style="color:#1a5acc">${avgVel}</div><div class="scout-big-lbl">Avg MPH</div></div>
    </div>
  </div>

  <!-- Row 1: Core stats | Outcome Breakdown | Pitch Mix -->
  <div class="scout-r1" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:10px">
    <div class="scout-section" style="margin-bottom:0">
      <div class="scout-section-title">Core Stats</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:5px">
${[
  ["Pitches", career.pitches],
  ["K", career.k],
  ["BB", career.bb],
  ["H Allow", career.hits],
  ["Strike%", sp + "%"],
  ["FPS%", fpsPct + "%"],
  ["1-1 Conv%", oo11Pct + "%"],
  ["Swing%", swPct + "%"],
  ["Zone%", zonePct + "%"],
  [
    "Whiff%",
    swings > 0 ? Math.round((whiffs / swings) * 100) + "%" : "—",
  ],
  ["Avg MPH", avgVel],
  ["Max MPH", maxVel],
  ["K/BB", kbb],
  ["PO Att", career.poAtt],
  ["PO Outs", career.poOuts],
  [
    "PO Out%",
    career.poAtt > 0
      ? Math.round((career.poOuts / career.poAtt) * 100) + "%"
      : "—",
  ],
]
  .map(
    ([l, v]) =>
      `<div style="background:#f8f9fb;border:1px solid #e0e4ea;border-radius:6px;padding:6px 4px;text-align:center"><div style="font-weight:700;font-size:14px;color:#111318">${v}</div><div style="font-size:6px;letter-spacing:1.5px;text-transform:uppercase;color:#8a909e;margin-top:1px">${l}</div></div>`
  )
  .join("")}
      </div>
    </div>
    <div class="scout-section" style="margin-bottom:0">
      <div class="scout-section-title">Outcome Breakdown</div>
      ${outcomePie}
    </div>
    <div class="scout-section" style="margin-bottom:0">
      <div class="scout-section-title">Pitch Mix</div>
      ${mixPie}
    </div>
  </div>

  <!-- Row 2: Arsenal table full width, then 4-column visual row below -->
  <div style="margin-bottom:10px">
    <div class="scout-section" style="margin-bottom:10px">
      <div class="scout-section-title">Pitch Arsenal</div>
      <table class="scout-table">
<thead><tr><th style="text-align:left">Pitch</th><th>Used</th><th>Avg MPH</th><th>Strike%</th><th>Whiff%</th><th>BA Against</th><th>FPS%</th></tr></thead>
<tbody>${
  arsenalRows ||
  '<tr><td colspan="7" style="color:#8a909e">No pitch type data</td></tr>'
}</tbody>
      </table>
    </div>
    <!-- Visual row: Strike% bars | Hot/Cold | FB zone | CB zone | CT zone -->
    <div class="scout-r2" style="display:grid;grid-template-columns:minmax(150px,200px) minmax(140px,180px) 1fr 1fr 1fr;gap:10px;align-items:start">
      <!-- Strike% bars -->
      <div class="scout-section" style="margin-bottom:0">
<div class="scout-section-title">Strike% by Pitch</div>
${strBars}
      </div>
      <!-- Hot/Cold -->
      <div class="scout-section" style="margin-bottom:0">
<div class="scout-section-title">Hot / Cold Zone</div>
${buildScoutHotColdZone(allPitches, "pitcher")}
      </div>
      <!-- Top 3 pitch zones, each equal width -->
      ${top3Types
.map((t) => {
  const tP = allPitches.filter((p) => p.pitchType === t);
  return `<div class="scout-section" style="margin-bottom:0">
  <div class="scout-section-title" style="color:${
    typeColors[t] || "#8a909e"
  }">${t} Locations · ${tP.length}P</div>
  ${buildPitchZoneSVG(tP, 200, 185)}
</div>`;
})
.join("")}
    </div>
  </div>
  <div class="scout-print-hide">${_recent50HTML}</div>

  <!-- Row 3: Count performance | vs Handedness | TTO + Game Log + Velocity — 3-column, all fits on one page -->
  <div class="scout-r3" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px">
    <!-- Col 1: Count performance -->
    <div class="scout-section" style="margin-bottom:0">
      <div class="scout-section-title">Performance by Count</div>
      <table class="scout-table">
<thead><tr><th style="text-align:left">Situation</th><th>P</th><th>Str%</th><th>Sw%</th><th>Whiff%</th></tr></thead>
<tbody>${cRows}</tbody>
      </table>
    </div>
    <!-- Col 2: vs Handedness -->
    <div class="scout-section" style="margin-bottom:0">
      ${
handSplitHTML ||
`<div class="scout-section-title">vs Batter Handedness</div><div style="font-size:9px;color:#8a909e;font-style:italic">Tracked in newly recorded games</div>`
      }
    </div>
    <!-- Col 3: TTO + Game Log + Velocity -->
    <div style="display:flex;flex-direction:column;gap:10px">
      ${ttoSplitHTML || ""}
      ${veloByTypeHTML || ""}
      <div class="scout-section" style="margin-bottom:0">
<div class="scout-section-title">Recent Game Log (Last 5)</div>
<table class="scout-table">
  <thead><tr><th style="text-align:left">Date</th><th>Opp</th><th>P</th><th>K</th><th>BB</th><th>H</th><th>Str%</th></tr></thead>
  <tbody>${
    last5 ||
    '<tr><td colspan="7" style="color:#8a909e">No games</td></tr>'
  }</tbody>
</table>
      </div>
    </div>
  </div>

  </div>`;
}

// ── Hot/Cold Zone for Scouting (compact) ──────────────────────────

// ── Spray Field Heat Map — 5 infield + 3 outfield zones ─────────────
function buildSprayHeatMap(bip, isLeft) {
  // Coordinate system: sprayZoneLabel uses spray.x, spray.y in SVG space (560×510)
  // Home plate at (280,468). Angle: 0°=CF, neg=LF, pos=RF.
  // We assign each ball to a zone using the same angle+distance logic.

  const HX_orig = 280,
    HY_orig = 468;
  // Infield edge ≈ 210px from home in 560x510 space
  // Outfield warning track ≈ 430px from home in 560x510 space
  const INFIELD_R_ORIG = 270; // beyond bases + SS/2B, into shallow OF territory

  const sprayAngleDeg = (p) => {
    const sx = p.spray?.x,
      sy = p.spray?.y;
    if (sx == null || sy == null) return null;
    const dx = sx - HX_orig,
      dy = -(sy - HY_orig);
    return (Math.atan2(dx, Math.max(dy, 1)) * 180) / Math.PI;
  };
  const sprayDist = (p) => {
    const sx = p.spray?.x,
      sy = p.spray?.y;
    if (sx == null || sy == null) return null;
    return Math.sqrt((sx - HX_orig) ** 2 + (sy - HY_orig) ** 2);
  };

  // Zone definitions — 5 infield + 3 outfield, foul lines at ±47°
  const zones = [
    { id: "3B", label: "3B", a1: -47, a2: -22, infield: true },
    { id: "SS", label: "SS", a1: -22, a2: -7, infield: true },
    { id: "MID", label: "Mid", a1: -7, a2: 7, infield: true },
    { id: "2B", label: "2B", a1: 7, a2: 22, infield: true },
    { id: "1B", label: "1B", a1: 22, a2: 47, infield: true },
    { id: "LF", label: "LF", a1: -47, a2: -15, infield: false },
    { id: "CF", label: "CF", a1: -15, a2: 15, infield: false },
    { id: "RF", label: "RF", a1: 15, a2: 47, infield: false },
  ];

  const counts = {};
  zones.forEach((z) => {
    counts[z.id] = 0;
  });
  bip.forEach((p) => {
    const ang = sprayAngleDeg(p),
      d = sprayDist(p);
    if (ang == null || d == null) return;
    const inf = d < INFIELD_R_ORIG;
    for (const z of zones) {
      if (z.infield !== inf) continue;
      if (ang >= z.a1 && ang < z.a2) {
        counts[z.id]++;
        break;
      }
    }
  });

  // Separate totals: infield % of infield balls, outfield % of outfield balls
  const infieldTotal =
    zones
      .filter((z) => z.infield)
      .reduce((s, z) => s + (counts[z.id] || 0), 0) || 1;
  const outfieldTotal =
    zones
      .filter((z) => !z.infield)
      .reduce((s, z) => s + (counts[z.id] || 0), 0) || 1;
  const maxCount = Math.max(...Object.values(counts), 1);

  // Deep blue (least) → light blue → light red → maroon (most)
  const zoneColor = (n) => {
    if (n === 0) return "rgba(20,40,20,0.65)";
    const t = n / maxCount; // 0→1
    if (t < 0.25)
      return `rgba(15,55,160,${(0.7 + t * 0.3).toFixed(2)})`; // deep blue
    if (t < 0.5)
      return `rgba(70,130,210,${(0.72 + t * 0.2).toFixed(2)})`; // mid blue
    if (t < 0.75)
      return `rgba(215,80,80,${(0.74 + t * 0.2).toFixed(2)})`; // light red
    return `rgba(140,20,40,${(0.82 + t * 0.18).toFixed(2)})`; // maroon
  };

  // SVG viewbox: HX centred, OFR capped so fan stays inside W
  // At ±47°: max OFR = (W/2) / sin(47°) ≈ 150/0.731 = 205 → use 198 for a small margin
  const HX = 150,
    HY = 240,
    W = 300,
    H = 248;
  const INR = 120,
    OFR = 198;

  const pt = (a, r) => {
    const rad = (a * Math.PI) / 180;
    return [HX + r * Math.sin(rad), HY - r * Math.cos(rad)];
  };

  const fanPath = (a1, a2, r1, r2) => {
    const [ix1, iy1] = pt(a1, r1),
      [ix2, iy2] = pt(a2, r1);
    const [ox2, oy2] = pt(a2, r2),
      [ox1, oy1] = pt(a1, r2);
    if (r1 === 0) {
      return `M${HX},${HY} L${ox1.toFixed(1)},${oy1.toFixed(
        1
      )} A${r2},${r2} 0 0,1 ${ox2.toFixed(1)},${oy2.toFixed(1)} Z`;
    }
    return `M${ix1.toFixed(1)},${iy1.toFixed(
      1
    )} A${r1},${r1} 0 0,1 ${ix2.toFixed(1)},${iy2.toFixed(
      1
    )} L${ox2.toFixed(1)},${oy2.toFixed(
      1
    )} A${r2},${r2} 0 0,0 ${ox1.toFixed(1)},${oy1.toFixed(1)} Z`;
  };

  const svgPaths = zones
    .map((z) => {
      const r1 = z.infield ? 0 : INR,
        r2 = z.infield ? INR : OFR;
      const n = counts[z.id];
      const col = zoneColor(n);
      const path = fanPath(z.a1, z.a2, r1, r2);
      const midA = (z.a1 + z.a2) / 2;
      const midR = z.infield ? INR * 0.55 : INR + (OFR - INR) * 0.5;
      const [lx, ly] = pt(midA, midR);
      // Percentage label
      const pct =
        bip.length > 0 ? Math.round((n / bip.length) * 100) : 0;
      const groupTotal = z.infield ? infieldTotal : outfieldTotal;
      const pctStr = Math.round((n / groupTotal) * 100) + "%";
      const label = n > 0 ? pctStr : "";
      const dimLabel = n === 0 ? z.label : "";
      return `<path d="${path}" fill="${col}" stroke="rgba(255,255,255,0.2)" stroke-width="0.7"/>
      ${
n > 0
  ? `<text x="${lx.toFixed(1)}" y="${(ly + 3.5).toFixed(
      1
    )}" text-anchor="middle" font-size="${
      z.infield ? 9 : 11
    }" font-weight="700" fill="white" font-family="'Barlow Condensed',sans-serif">${pctStr}</text>`
  : ""
      }
      ${
n === 0
  ? `<text x="${lx.toFixed(1)}" y="${(ly + 3.5).toFixed(
      1
    )}" text-anchor="middle" font-size="7" fill="rgba(255,255,255,0.25)" font-family="'Barlow Condensed',sans-serif">${
      z.label
    }</text>`
  : ""
      }`;
    })
    .join("");

  // Field lines stop exactly at OFR (no +8 overshoot)
  const [lfx, lfy] = pt(-47, OFR),
    [rfx, rfy] = pt(47, OFR);
  const fieldLines = `
    <line x1="${HX}" y1="${HY}" x2="${lfx.toFixed(1)}" y2="${lfy.toFixed(
    1
  )}" stroke="rgba(255,255,255,0.25)" stroke-width="1"/>
    <line x1="${HX}" y1="${HY}" x2="${rfx.toFixed(1)}" y2="${rfy.toFixed(
    1
  )}" stroke="rgba(255,255,255,0.25)" stroke-width="1"/>
    <polygon points="${HX},${HY - 2} ${HX - 5},${HY + 7} ${HX},${HY + 12} ${
    HX + 5
  },${HY + 7}" fill="white" opacity="0.85"/>`;

  // Zone name labels (small, at outer edge of infield)
  const ifLabels = ["3B", "SS", "Mid", "2B", "1B"];
  const ifZones = zones.filter((z) => z.infield);
  const ifLabelsSVG = ifZones
    .map((z, i) => {
      const midA = (z.a1 + z.a2) / 2;
      const [lx, ly] = pt(midA, INR + 8);
      return `<text x="${lx.toFixed(1)}" y="${(ly + 3).toFixed(
        1
      )}" text-anchor="middle" font-size="6" fill="rgba(255,255,255,0.5)" font-family="'Barlow Condensed',sans-serif">${
        ifLabels[i]
      }</text>`;
    })
    .join("");

  // OF zone labels
  const ofLabels = ["LF", "CF", "RF"];
  const ofZones = zones.filter((z) => !z.infield);
  const ofLabelsSVG = ofZones
    .map((z, i) => {
      const midA = (z.a1 + z.a2) / 2;
      const [lx, ly] = pt(midA, OFR - 18); // inside the arc, never outside the viewBox
      if (ly < 0 || lx < 0 || lx > W) return "";
      return `<text x="${lx.toFixed(1)}" y="${ly.toFixed(
        1
      )}" text-anchor="middle" font-size="7" fill="rgba(255,255,255,0.4)" font-family="'Barlow Condensed',sans-serif">${
        ofLabels[i]
      }</text>`;
    })
    .join("");

  const legend = `<div style="display:flex;align-items:center;gap:4px;margin-top:3px;font-size:8px;color:#8a909e;font-family:'Barlow Condensed',sans-serif">
    <div style="width:30px;height:8px;border-radius:2px;background:linear-gradient(to right,rgba(15,55,160,0.9),rgba(70,130,210,0.85),rgba(215,80,80,0.85),rgba(140,20,40,0.95))"></div>
    <span>Least → Most frequent</span>
  </div>`;

  return `<div style="overflow:hidden;border-radius:6px">${legend}
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;display:block;border-radius:6px" overflow="hidden">
      <defs>
<clipPath id="field-clip">
  <rect x="0" y="0" width="${W}" height="${H}"/>
</clipPath>
      </defs>
      <rect width="${W}" height="${H}" fill="#1a2e14"/>
      <g clip-path="url(#field-clip)">
${svgPaths}
${fieldLines}
${ifLabelsSVG}
      </g>
    </svg>
  </div>`;
}

function buildScoutHotColdZone(pitches, perspective) {
  const W = 160,
    H = 148;
  const ZX1 = W * 0.2,
    ZX2 = W * 0.8,
    ZY1 = H * 0.15,
    ZY2 = H * 0.82;
  const ZW = ZX2 - ZX1,
    ZH = ZY2 - ZY1;
  const cols = 3,
    rows = 3;
  const cw = ZW / cols,
    ch = ZH / rows;
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push({ r, c, hits: 0, ab: 0 });
    }
  }
  // Balls in play only — shows hit avg by zone location on contact pitches
  // For pitcher view: all contact pitches (where batter put ball in play)
  // For batter view: same — pitch location of balls put in play
  const contact = [
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
  ];
  pitches
    .filter(
      (p) =>
        p.pitchX != null &&
        p.pitchY != null &&
        contact.includes(p.outcome)
    )
    .forEach((p) => {
      const nx = (p.pitchX - 31) / 38,
        ny = (p.pitchY - 30.9) / 38.2;
      if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return;
      const c = Math.min(cols - 1, Math.floor(nx * cols)),
        r = Math.min(rows - 1, Math.floor(ny * rows));
      const cell = cells.find((x) => x.r === r && x.c === c);
      if (!cell) return;
      cell.ab++;
      if (["single", "double", "triple", "homerun"].includes(p.outcome))
        cell.hits++;
    });
  const avgs = cells
    .map((x) => (x.ab > 0 ? x.hits / x.ab : null))
    .filter((x) => x !== null);
  const minA = avgs.length ? Math.min(...avgs) : 0,
    maxA = avgs.length ? Math.max(...avgs) : 1;
  const cellSVG = cells
    .map(({ r, c, hits, ab }) => {
      const x = ZX1 + c * cw,
        y = ZY1 + r * ch;
      const avg = ab > 0 ? hits / ab : null;
      const norm =
        avg !== null && maxA > minA
          ? (avg - minA) / (maxA - minA)
          : 0.5;
      const hot = `rgba(220,50,50,${(0.15 + norm * 0.7).toFixed(2)})`;
      const cold = `rgba(50,80,220,${(0.15 + (1 - norm) * 0.7).toFixed(
        2
      )})`;
      const fill =
        avg === null
          ? "rgba(200,200,200,0.15)"
          : norm >= 0.5
          ? hot
          : cold;
      const label = avg !== null ? _fmtRate(avg) : "-";
      return `<rect x="${x}" y="${y}" width="${cw}" height="${ch}" fill="${fill}" stroke="white" stroke-width="0.5"/>
      <text x="${x + cw / 2}" y="${
        y + ch / 2 + 4
      }" text-anchor="middle" font-family="monospace" font-size="8" font-weight="700" fill="${
        avg !== null ? (norm >= 0.5 ? "white" : "white") : "#aaa"
      }">${label}</text>`;
    })
    .join("");
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;border-radius:6px;background:#f0f2f5">
    <rect x="${ZX1}" y="${ZY1}" width="${ZW}" height="${ZH}" fill="none" stroke="#999" stroke-width="1"/>
    ${cellSVG}
    <text x="${W / 2}" y="${
    H - 4
  }" text-anchor="middle" font-size="7" fill="#999">LOW</text>
    <text x="${
      W / 2
    }" y="10" text-anchor="middle" font-size="7" fill="#999">HIGH</text>
    <!-- Home plate (catcher's view — tip points down toward catcher) -->
    ${_homePlateSVG(W / 2, H - 4, 0.62)}
  </svg>`;
}

// ═══════════════════════════════════════════════════════
// MY TEAM — Roster management, import, drag-to-lineup
// ═══════════════════════════════════════════════════════

let myTeamRoster = []; // [{id, name, num, pos, bat, throw, ht, wt}]
let myTeamEditingId = null; // id of player being edited, null = new

// Position groups for display
const POS_GROUPS = [
  {
    label: "Catchers",
    match: (p) =>
      p.pos === "C" || p.pos === "C/RHP" || p.pos === "C/2B",
  },
  {
    label: "Infielders",
    match: (p) =>
      [
        "1B",
        "2B",
        "3B",
        "SS",
        "INF",
        "INF/OF",
        "1B/OF",
        "SS/2B",
        "3B/RHP",
      ].includes(p.pos),
  },
  {
    label: "Outfielders",
    match: (p) => ["OF", "LF", "CF", "RF"].includes(p.pos),
  },
  { label: "Designated Hitter", match: (p) => p.pos === "DH" },
  {
    label: "Pitchers",
    match: (p) => ["RHP", "LHP", "P", "UTL/RHP"].includes(p.pos),
  },
  { label: "Utility", match: (p) => ["UTL"].includes(p.pos) },
  { label: "Other", match: () => true },
];

async function myTeamLoad() {
  try {
    const raw = await window.storage.get("pitchtrack_myteam", true);
    if (raw?.value) {
      const d = JSON.parse(raw.value);
      myTeamRoster = d.roster || [];
      window._myTeamNameCache = d.teamName || "My Team";
      const ni = document.getElementById("myteam-name-input");
      if (ni) ni.value = d.teamName || "";
    }
  } catch (e) {}
  myTeamRender();
}

async function myTeamSave() {
  try {
    const teamName =
      document.getElementById("myteam-name-input").value.trim() ||
      "My Team";
    await window.storage.set(
      "pitchtrack_myteam",
      JSON.stringify({ teamName, roster: myTeamRoster }),
      true
    );
  } catch (e) {}
}

// ══════════════════════════════════════════════════════════════════════
//  OPPONENTS
//  Storage layout:
//    "pitchtrack_opponents"       → JSON array of {id, name}  (index)
//    "pitchtrack_opp_<id>"        → JSON {id, name, roster[]} (full data)
// ══════════════════════════════════════════════════════════════════════
