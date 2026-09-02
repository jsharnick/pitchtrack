// ===================== INIT =====================
function trackerInit() {
  S.gameId = null; // fresh game — will get a new ID on first pitch
  renderLineup();
  renderPitcherList();
  updateScoreBug();
  renderPitchLog();
  renderBoxScore();
  renderPitchMix();
  renderGameLog();
  switchTab("boxscore"); // default to box score view
  setPlayBlurb(
    '<span style="color:var(--text3);font-size:13px">Game not yet started — first pitch pending</span>'
  );
  // Load My Team roster and opponents so Use buttons appear immediately
  myTeamLoad();
  oppLoad();
}
/* HUB */
// ===== STATE =====
let allGames = [];
let allTeams = [];
let currentView = null;
let sortCol = null,
  sortDir = 1;

// ===== STORAGE HELPERS =====
async function loadAllGames() {
  try {
    const keys = await window.storage.list("ptgame_", true);
    const games = [];
    for (const key of keys?.keys || []) {
      try {
        const raw = await window.storage.get(key, true);
        if (raw?.value) games.push(JSON.parse(raw.value));
      } catch (e) {
        console.warn("Failed to load game key:", key, e);
      }
    }
    games.sort((a, b) => b.date.localeCompare(a.date));
    return games;
  } catch (e) {
    console.warn("loadAllGames error:", e);
    return [];
  }
}

async function loadTeams() {
  try {
    const raw = await window.storage.get("pitchtrack_teams", true);
    return raw ? JSON.parse(raw.value) : [];
  } catch (e) {
    return [];
  }
}

// ── TEAM NAME RENAME / MERGE / ABSORB ────────────────────────────
let _assignOppFromName = null;

function showAssignOppModal(fromName) {
  _assignOppFromName = fromName;
  const available = (_opponents || []).filter((o) => o.name !== fromName);
  document.getElementById("assign-opp-desc").textContent =
    available.length === 0
      ? "No saved opponents found. Add opponents in the Opponents section first."
      : `Choose which saved opponent "${fromName}" should be merged into. All game records will be updated.`;
  const list = document.getElementById("assign-opp-list");
  list.innerHTML =
    available.length === 0
      ? `<div style="font-size:12px;color:var(--text3);padding:8px 0">No saved opponents available.</div>`
      : available
          .map(
            (o) => `
      <label style="display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--border);border-radius:6px;cursor:pointer;background:var(--surface2)">
        <input type="radio" name="assign-opp-pick" value="${escHtml(
          o.name
        )}" style="width:16px;height:16px;accent-color:var(--accent)">
        <span style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:14px;color:var(--text)">${escHtml(
          o.name
        )}</span>
      </label>`
          )
          .join("");
  const btn = document.getElementById("assign-opp-confirm-btn");
  btn.textContent = "Assign";
  btn.disabled = false;
  btn.style.display = available.length === 0 ? "none" : "";
  document.getElementById("assign-opp-modal").style.display = "flex";
}

function closeAssignOppModal() {
  document.getElementById("assign-opp-modal").style.display = "none";
}

async function confirmAssignOpp() {
  const picked = document.querySelector(
    "#assign-opp-list input[type=radio]:checked"
  );
  if (!picked) {
    closeAssignOppModal();
    return;
  }
  const toName = picked.value;
  const btn = document.getElementById("assign-opp-confirm-btn");
  btn.textContent = "Working…";
  btn.disabled = true;
  const count = await _mergeTeamNameInGames(_assignOppFromName, toName);
  closeAssignOppModal();
  toast(
    `Assigned to "${toName}" — ${count} game${count !== 1 ? "s" : ""} updated.`
  );
  await hubRefreshAll();
}

let _renameTeamOldName = null;

function showRenameTeam(oldName) {
  _renameTeamOldName = oldName;
  document.getElementById(
    "rename-team-from"
  ).textContent = `Current name: "${oldName}"`;
  const input = document.getElementById("rename-team-input");
  input.value = oldName;
  const btn = document.getElementById("rename-team-confirm-btn");
  btn.textContent = "Rename";
  btn.disabled = false;
  document.getElementById("rename-team-modal").style.display = "flex";
  setTimeout(() => {
    input.focus();
    input.select();
  }, 80);
}

function closeRenameTeamModal() {
  document.getElementById("rename-team-modal").style.display = "none";
}

async function confirmRenameTeam() {
  const newName = document.getElementById("rename-team-input").value.trim();
  if (!newName || newName === _renameTeamOldName) {
    closeRenameTeamModal();
    return;
  }
  const btn = document.getElementById("rename-team-confirm-btn");
  btn.textContent = "Saving…";
  btn.disabled = true;
  // Rename in game records
  const count = await _mergeTeamNameInGames(_renameTeamOldName, newName);
  // If old name matches a loaded opponent, rename it there too
  const opp = (_opponents || []).find((o) => o.name === _renameTeamOldName);
  if (opp) {
    opp.name = newName;
    try {
      await window.storage.set(
        "pitchtrack_opp_" + opp.id,
        JSON.stringify(opp),
        true
      );
      const raw = await window.storage.get("pitchtrack_opponents", true);
      const idx = raw ? JSON.parse(raw.value) : [];
      const entry = idx.find((e) => e.id === opp.id);
      if (entry) entry.name = newName;
      await window.storage.set(
        "pitchtrack_opponents",
        JSON.stringify(idx),
        true
      );
    } catch (e) {}
  }
  closeRenameTeamModal();
  toast(
    `Renamed to "${newName}" — ${count} game${count !== 1 ? "s" : ""} updated.`
  );
  await hubRefreshAll();
}

async function _mergeTeamNameInGames(fromName, toName) {
  const keys = (await window.storage.list("ptgame_", true))?.keys || [];
  let count = 0;
  for (const key of keys) {
    try {
      const raw = await window.storage.get(key, true);
      if (!raw?.value) continue;
      const g = JSON.parse(raw.value);
      let changed = false;
      if (g.awayTeam === fromName) {
        g.awayTeam = toName;
        changed = true;
      }
      if (g.homeTeam === fromName) {
        g.homeTeam = toName;
        changed = true;
      }
      if (changed) {
        await window.storage.set(key, JSON.stringify(g), true);
        count++;
      }
    } catch (e) {
      console.warn("merge error:", key, e);
    }
  }
  try {
    const raw = await window.storage.get("pitchtrack_teams", true);
    const teams = raw ? JSON.parse(raw.value) : [];
    const idx = teams.indexOf(fromName);
    if (idx !== -1) teams.splice(idx, 1);
    if (!teams.includes(toName)) teams.push(toName);
    await window.storage.set("pitchtrack_teams", JSON.stringify(teams), true);
  } catch (e) {}
  return count;
}

// ── Player Name Merge ──────────────────────────────────────────────
let _mergePlayerCtx = null; // { teamName, fromName, fromNum, playerType }

async function _mergePlayerNameInGames(
  teamName,
  fromName,
  fromNum,
  toName,
  toNum
) {
  // Match by name+num so same-name players with different jersey numbers are treated separately
  const numEq = (a, b) =>
    a === undefined ||
    a === "" ||
    b === undefined ||
    b === "" ||
    String(a) === String(b);
  const srcMatch = (p) => p.name === fromName && numEq(fromNum, p.num);
  const tgtMatch = (p) => p.name === toName && numEq(toNum, p.num);

  const keys = (await window.storage.list("ptgame_", true))?.keys || [];
  let count = 0;
  for (const key of keys) {
    try {
      const raw = await window.storage.get(key, true);
      if (!raw?.value) continue;
      const g = JSON.parse(raw.value);
      if (g.awayTeam !== teamName && g.homeTeam !== teamName) continue;
      let changed = false;

      // Rename in pitchLog — no num field, skip if names are already identical
      if (fromName !== toName) {
        for (const p of g.pitchLog || []) {
          if (p.batter === fromName) {
            p.batter = toName;
            changed = true;
          }
          if (p.pitcher === fromName) {
            p.pitcher = toName;
            changed = true;
          }
        }
      }

      // Merge batter stat records (matched by name+num)
      for (const side of ["homeBatters", "awayBatters"]) {
        if (!g[side]) continue;
        const fi = g[side].findIndex(srcMatch);
        if (fi === -1) continue;
        const ti = g[side].findIndex(tgtMatch);
        if (ti !== -1) {
          // Both present — sum numeric fields into target, remove source
          const src = g[side][fi],
            tgt = g[side][ti];
          for (const k of Object.keys(src)) {
            if (typeof src[k] === "number" && typeof tgt[k] === "number")
              tgt[k] += src[k];
          }
          g[side].splice(fi, 1);
        } else {
          g[side][fi].name = toName;
          if (toNum !== undefined && toNum !== "") g[side][fi].num = toNum;
        }
        changed = true;
      }

      // Merge pitcher stat records (matched by name+num)
      for (const side of ["homePitchers", "awayPitchers"]) {
        if (!g[side]) continue;
        const fi = g[side].findIndex(srcMatch);
        if (fi === -1) continue;
        const ti = g[side].findIndex(tgtMatch);
        if (ti !== -1) {
          const src = g[side][fi],
            tgt = g[side][ti];
          for (const k of Object.keys(src)) {
            if (typeof src[k] === "number" && typeof tgt[k] === "number")
              tgt[k] += src[k];
          }
          g[side].splice(fi, 1);
        } else {
          g[side][fi].name = toName;
          if (toNum !== undefined && toNum !== "") g[side][fi].num = toNum;
        }
        changed = true;
      }

      // Rename in fieldingStats
      if (g.fieldingStats) {
        for (const k of Object.keys(g.fieldingStats)) {
          if (g.fieldingStats[k].name !== fromName) continue;
          const tk = Object.keys(g.fieldingStats).find(
            (k2) => g.fieldingStats[k2].name === toName
          );
          if (tk) {
            const src = g.fieldingStats[k],
              tgt = g.fieldingStats[tk];
            for (const fk of Object.keys(src)) {
              if (typeof src[fk] === "number")
                tgt[fk] = (tgt[fk] || 0) + src[fk];
            }
            delete g.fieldingStats[k];
          } else {
            g.fieldingStats[k].name = toName;
          }
          changed = true;
        }
      }

      if (changed) {
        await window.storage.set(key, JSON.stringify(g), true);
        count++;
      }
    } catch (e) {
      console.warn("merge player error:", key, e);
    }
  }
  return count;
}

function showMergePlayerModal(teamName, fromName, fromNum, playerType, event) {
  if (event) event.stopPropagation();
  _mergePlayerCtx = { teamName, fromName, fromNum, playerType };
  const desc = document.getElementById("merge-player-desc");
  const list = document.getElementById("merge-player-list");
  const fromLabel = fromNum ? `${fromName} (#${fromNum})` : fromName;
  desc.textContent = `Select the player to absorb "${fromLabel}" into. All stats across every game record will be combined. This cannot be undone.`;
  // Build list of other players of same type, excluding the exact from player by name+num
  const allGames = getTeamGames(teamName);
  let others = [];
  if (playerType === "pitcher") {
    others = getTeamPitchers(teamName, allGames)
      .filter(
        (p) =>
          !(
            p.name === fromName && String(p.num || "") === String(fromNum || "")
          )
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  } else {
    others = getTeamRoster(teamName, allGames)
      .filter(
        (p) =>
          !(
            p.name === fromName && String(p.num || "") === String(fromNum || "")
          )
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  list.innerHTML = others.length
    ? others
        .map((p) => {
          const val = JSON.stringify({
            name: p.name,
            num: p.num || "",
          });
          const lbl = p.num
            ? `${p.name} <span style="color:var(--text3);font-size:12px">#${p.num}</span>`
            : escHtml(p.name);
          return `<label style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:7px;border:1.5px solid var(--border2);cursor:pointer;font-family:'Barlow Condensed',sans-serif;font-size:14px;color:var(--text)">
        <input type="radio" name="merge-player-target" value="${escAttr(
          val
        )}" style="accent-color:var(--accent)">
        ${lbl}
      </label>`;
        })
        .join("")
    : `<div style="color:var(--text3);font-size:12px;font-family:'Barlow',sans-serif">No other players to merge into.</div>`;
  const modal = document.getElementById("merge-player-modal");
  modal.style.display = "flex";
}

function closeMergePlayerModal() {
  document.getElementById("merge-player-modal").style.display = "none";
  // Reset both steps and button state so the modal is clean next time
  document.getElementById("merge-step-1").style.display = "";
  document.getElementById("merge-step-2").style.display = "none";
  const btn = document.getElementById("merge-player-confirm-btn");
  btn.textContent = "Merge";
  btn.disabled = false;
  _mergePlayerCtx = null;
}

function _mergePlayerNext() {
  const sel = document.querySelector(
    'input[name="merge-player-target"]:checked'
  );
  if (!sel) {
    alert("Please select a player to merge into.");
    return;
  }
  const { fromName, fromNum } = _mergePlayerCtx;
  let toName, toNum;
  try {
    const parsed = JSON.parse(sel.value);
    toName = parsed.name;
    toNum = parsed.num;
  } catch (e) {
    toName = sel.value;
  }
  _mergePlayerCtx.toName = toName;
  _mergePlayerCtx.toNum = toNum;
  const fromLabel = fromNum ? `${fromName} (#${fromNum})` : fromName;
  const toLabel = toNum ? `${toName} (#${toNum})` : toName;
  document.getElementById(
    "merge-confirm-text"
  ).innerHTML = `Merge <strong>${escHtml(
    fromLabel
  )}</strong> into <strong>${escHtml(
    toLabel
  )}</strong>?<br><br>All stats tracked for <strong>${escHtml(
    fromLabel
  )}</strong> will be combined into <strong>${escHtml(
    toLabel
  )}</strong> across every game record.`;
  document.getElementById("merge-step-1").style.display = "none";
  document.getElementById("merge-step-2").style.display = "";
}

function _mergePlayerBack() {
  document.getElementById("merge-step-2").style.display = "none";
  document.getElementById("merge-step-1").style.display = "";
}

async function confirmMergePlayer() {
  if (!_mergePlayerCtx) return;
  const { teamName, fromName, fromNum, toName, toNum } = _mergePlayerCtx;
  const btn = document.getElementById("merge-player-confirm-btn");
  btn.textContent = "Merging…";
  btn.disabled = true;
  const count = await _mergePlayerNameInGames(
    teamName,
    fromName,
    fromNum,
    toName,
    toNum
  );
  closeMergePlayerModal();
  hubRefreshAll();
  toast(
    `Merged "${fromName}" into "${toName}" across ${count} game record${
      count !== 1 ? "s" : ""
    }.`
  );
}

let _absorbTargetName = null;

function showAbsorbModal(targetName) {
  if (!targetName) {
    toast("No team name set yet.");
    return;
  }
  _absorbTargetName = targetName;
  const myTeamName = _getMyTeamName();
  const oppNames = new Set((_opponents || []).map((o) => o.name));
  const reserved = new Set([
    ...(myTeamName ? [myTeamName] : []),
    ...oppNames,
    targetName,
  ]);
  const available = (allTeams || []).filter((n) => !reserved.has(n));

  document.getElementById(
    "absorb-modal-title"
  ).textContent = `Absorb Into "${targetName}"`;
  document.getElementById("absorb-modal-desc").textContent =
    available.length === 0
      ? "No unassigned historical team names found. All known names are already accounted for."
      : `Select historical team names whose game records should be reassigned to "${targetName}".`;

  const list = document.getElementById("absorb-modal-list");
  list.innerHTML =
    available.length === 0
      ? `<div style="font-size:12px;color:var(--text3);padding:8px 0">Nothing to absorb.</div>`
      : available
          .map(
            (name) => `
      <label style="display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--border);border-radius:6px;cursor:pointer;background:var(--surface2)">
        <input type="checkbox" value="${escHtml(
          name
        )}" style="width:16px;height:16px;accent-color:var(--accent)">
        <span style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:14px;color:var(--text)">${escHtml(
          name
        )}</span>
      </label>`
          )
          .join("");

  const confirmBtn = document.getElementById("absorb-confirm-btn");
  confirmBtn.textContent = "Absorb Selected";
  confirmBtn.disabled = false;
  confirmBtn.style.display = available.length === 0 ? "none" : "";
  document.getElementById("absorb-modal").style.display = "flex";
}

function closeAbsorbModal() {
  document.getElementById("absorb-modal").style.display = "none";
}

async function confirmAbsorb() {
  const checked = [
    ...document.querySelectorAll(
      "#absorb-modal-list input[type=checkbox]:checked"
    ),
  ];
  if (!checked.length) {
    closeAbsorbModal();
    return;
  }
  const btn = document.getElementById("absorb-confirm-btn");
  btn.textContent = "Working…";
  btn.disabled = true;
  let total = 0;
  for (const cb of checked) {
    total += await _mergeTeamNameInGames(cb.value, _absorbTargetName);
  }
  closeAbsorbModal();
  toast(`Done! ${total} game${total !== 1 ? "s" : ""} updated.`);
  await hubRefreshAll();
}
// ─────────────────────────────────────────────────────────────────

let _pendingDeleteId = null;

function promptDeleteGame(gameId, label) {
  _pendingDeleteId = gameId;
  const sub = document.getElementById("delete-confirm-sub");
  if (sub && label)
    sub.textContent = `"${label}" will be permanently removed. This cannot be undone.`;
  document.getElementById("delete-confirm-modal").style.display = "flex";
}

function cancelDelete() {
  _pendingDeleteId = null;
  // Reset modal title back to singular for next use
  const titleEl = document.querySelector(
    "#delete-confirm-modal [style*='font-size: 21px']"
  );
  if (titleEl) titleEl.textContent = "Delete this game?";
  const sub = document.getElementById("delete-confirm-sub");
  if (sub)
    sub.textContent = `This will permanently remove the game and all its stats from the Hub. This cannot be undone.`;
  document.getElementById("delete-confirm-modal").style.display = "none";
}

async function confirmDelete() {
  document.getElementById("delete-confirm-modal").style.display = "none";
  // Reset modal title/sub back to singular for future single-deletes
  const titleEl = document.querySelector(
    "#delete-confirm-modal [style*='font-size: 21px']"
  );
  if (titleEl) titleEl.textContent = "Delete this game?";
  const sub = document.getElementById("delete-confirm-sub");
  if (sub)
    sub.textContent = `This will permanently remove the game and all its stats from the Hub. This cannot be undone.`;
  const gameId = _pendingDeleteId;
  _pendingDeleteId = null;
  if (!gameId) return;
  try {
    if (gameId === "__multi__") {
      // Batch delete all selected games
      const ids = Array.from(_ghSelected);
      for (const id of ids) {
        await window.storage.delete(id, true);
      }
      _ghSelected.clear();
      _ghSelectMode = false;
      window._ghSelectMode = false;
    } else if (gameId === "__teams__") {
      // Remove selected teams from the pitchtrack_teams index only — games are kept
      // My Team is never removed (it lives in the roster, not the teams index)
      const myTN = window._myTeamNameCache || "";
      const toRemove = Array.from(_tsSelected).filter((t) => t !== myTN);
      let teamsRaw;
      try {
        teamsRaw = await window.storage.get("pitchtrack_teams", true);
      } catch (e) {}
      const current = teamsRaw ? JSON.parse(teamsRaw.value) : [];
      const updated = current.filter(
        (t) => !toRemove.includes(typeof t === "string" ? t : t.name)
      );
      await window.storage.set(
        "pitchtrack_teams",
        JSON.stringify(updated),
        true
      );
      _tsSelected.clear();
      _tsSelectMode = false;
      window._tsSelectMode = false;
    } else if (gameId === "__opp_delete__") {
      // Delete all games involving selected opponents AND remove from teams index
      const teamsToDelete = Array.from(_hubOppSelected);
      const gameIdsToDelete = allGames
        .filter(
          (g) =>
            teamsToDelete.includes(g.awayTeam) ||
            teamsToDelete.includes(g.homeTeam)
        )
        .map((g) => g.id);
      for (const id of gameIdsToDelete) {
        await window.storage.delete(id, true);
      }
      // Also remove from teams index
      let teamsRaw2;
      try {
        teamsRaw2 = await window.storage.get("pitchtrack_teams", true);
      } catch (e) {}
      const current2 = teamsRaw2 ? JSON.parse(teamsRaw2.value) : [];
      const updated2 = current2.filter(
        (t) => !teamsToDelete.includes(typeof t === "string" ? t : t.name)
      );
      await window.storage.set(
        "pitchtrack_teams",
        JSON.stringify(updated2),
        true
      );
      _hubOppSelected.clear();
      _hubOppSelectMode = false;
      window._hubOppSelectMode = false;
      await hubRefreshAll();
      renderOpponentsWelcome();
      return;
    } else {
      await window.storage.delete(gameId, true);
    }
    await hubRefreshAll();
    showView("games");
  } catch (e) {
    alert("Delete failed — " + (e?.message || "unknown error"));
  }
}

async function deleteGame(gameId) {
  // legacy — redirect to modal
  const g = allGames.find((x) => x.id === gameId);
  const label = g ? `${g.awayTeam} vs ${g.homeTeam} (${g.date})` : gameId;
  promptDeleteGame(gameId, label);
}

// ===== INIT =====
async function hubRefreshAll() {
  document.getElementById("hub-team-list").innerHTML =
    '<div class="sidebar-empty">Loading...</div>';
  // Show welcome/loading state so stale content doesn't bleed through
  const _hc = document.getElementById("hub-content");
  const _hw = document.getElementById("hub-welcome");
  if (_hc) _hc.style.display = "none";
  if (_hw) _hw.style.display = "block";
  // Always reload myTeam so _myTeamNameCache is guaranteed current
  try {
    await myTeamLoad();
  } catch (e) {}
  allGames = await loadAllGames();
  allTeams = await loadTeams();

  // Rebuild available seasons from game dates
  _availableSeasons = [...new Set(allGames.map((g) => g.date && g.date.slice(0, 4)).filter(Boolean))]
    .sort()
    .reverse();
  // Reset season filter when hub re-loads (fresh entry)
  _seasonFilter = null;

  // Capture team name NOW from freshly-loaded data — don't re-evaluate later
  const _loadedTeamName = _getMyTeamName();
  const _hasMyTeam = !!(_loadedTeamName && myTeamRoster && myTeamRoster.length);

  if (!_hubTab) {
    _hubTab = _hasMyTeam ? "myteam" : "history";
  }

  // Set tab highlights directly (no re-evaluation of team name inside hubSetTab)
  ["myteam", "opponents", "history", "compare", "seasons"].forEach(function (t) {
    const el = document.getElementById("htab-" + t);
    if (el) el.classList.toggle("active", t === _hubTab);
  });
  const _app = document.getElementById("hub-app");
  if (_app) _app.dataset.hubtab = _hubTab;

  // Apply initial deep route from direct URL navigation (e.g. /stats_hub/player/Team/Name)
  if (window._ptDeepRoute) {
    var _dr = window._ptDeepRoute;
    window._ptDeepRoute = null;
    showView(_dr.type, _dr.data);
    if (_dr.tab) {
      var _tabFn = _dr.type === "pitcher" ? pitcherTab : playerTab;
      setTimeout(function () {
        _tabFn(_dr.tab);
      }, 100);
    }
    return;
  }

  // Render content using the already-loaded team name
  if (_hubTab === "myteam") {
    if (_loadedTeamName) {
      showView("team", _loadedTeamName);
    } else {
      if (_hc) _hc.style.display = "none";
      if (_hw) _hw.style.display = "block";
      renderSidebar();
    }
  } else if (_hubTab === "history") {
    showView("games");
  } else if (_hubTab === "opponents") {
    renderOpponentsWelcome();
  } else if (_hubTab === "compare") {
    showView("compare");
  } else if (_hubTab === "seasons") {
    renderSeasonHistory();
  }
}

// ===== TEAM SELECT MODE =====
let _tsSelectMode = false;
let _tsSelected = new Set();

function tsToggleSelectMode() {
  _tsSelectMode = !_tsSelectMode;
  _tsSelected.clear();
  window._tsSelectMode = _tsSelectMode;
  const btn = document.getElementById("ts-select-btn");
  const bar = document.getElementById("ts-action-bar");
  if (btn) {
    btn.textContent = _tsSelectMode ? "Cancel" : "Select";
    btn.style.borderColor = _tsSelectMode ? "var(--accent)" : "var(--border2)";
    btn.style.color = _tsSelectMode ? "var(--accent)" : "var(--text3)";
  }
  if (bar) bar.classList.toggle("visible", _tsSelectMode);
  renderSidebar();
  _tsUpdateBar();
}

function tsToggleTeam(name) {
  if (_tsSelected.has(name)) _tsSelected.delete(name);
  else _tsSelected.add(name);
  // Update just this row without full re-render
  const row = document.querySelector(
    `.ts-team-row[data-team="${CSS.escape(name)}"]`
  );
  if (row) {
    const sel = _tsSelected.has(name);
    row.classList.toggle("ts-selected-row", sel);
    const chk = row.querySelector(".gh-checkbox");
    if (chk) {
      chk.classList.toggle("checked", sel);
      chk.innerHTML = sel ? "✓" : "";
    }
  }
  _tsUpdateBar();
}

function tsSelectAll() {
  // Select all teams including My Team (if it exists)
  const myTN = window._myTeamNameCache || "";
  if (myTN && myTeamRoster && myTeamRoster.length > 0) _tsSelected.add(myTN);
  allTeams.filter((t) => t !== myTN).forEach((t) => _tsSelected.add(t));
  renderSidebar();
  _tsUpdateBar();
}

function tsSelectNone() {
  _tsSelected.clear();
  renderSidebar();
  _tsUpdateBar();
}

function _tsUpdateBar() {
  const myTN = window._myTeamNameCache || "";
  const n = _tsSelected.size;
  // My Team can be sent but not deleted — count deletable separately
  const nDeletable = Array.from(_tsSelected).filter((t) => t !== myTN).length;
  const countEl = document.getElementById("ts-sel-count");
  const delBtn = document.getElementById("ts-del-btn");
  const sendBtn = document.getElementById("ts-send-btn");
  if (countEl)
    countEl.textContent =
      n === 0 ? "0 selected" : `${n} team${n !== 1 ? "s" : ""} selected`;
  // Send button — enabled whenever anything is selected
  if (sendBtn) {
    sendBtn.disabled = n === 0;
    sendBtn.style.opacity = n === 0 ? ".45" : "1";
    sendBtn.style.cursor = n === 0 ? "not-allowed" : "pointer";
    sendBtn.style.borderColor = n === 0 ? "var(--border2)" : "var(--accent)";
    sendBtn.style.color = n === 0 ? "var(--text3)" : "var(--accent)";
  }
  // Delete button — only enabled when deletable (non-My-Team) teams are selected
  if (delBtn) {
    delBtn.disabled = nDeletable === 0;
    delBtn.style.opacity = nDeletable === 0 ? ".45" : "1";
    delBtn.style.cursor = nDeletable === 0 ? "not-allowed" : "pointer";
    delBtn.style.borderColor =
      nDeletable === 0 ? "var(--border2)" : "var(--accent)";
    delBtn.style.color = nDeletable === 0 ? "var(--text3)" : "var(--accent)";
  }
}

function tsPromptDeleteSelected() {
  const myTN = window._myTeamNameCache || "";
  // Only delete non-My-Team selections
  const toDelete = Array.from(_tsSelected).filter((t) => t !== myTN);
  const n = toDelete.length;
  if (!n) return;
  const titleEl = document.querySelector(
    "#delete-confirm-modal [style*='font-size: 21px']"
  );
  if (titleEl) titleEl.textContent = `Remove ${n} team${n !== 1 ? "s" : ""}?`;
  const sub = document.getElementById("delete-confirm-sub");
  if (sub)
    sub.textContent = `${n} team${
      n !== 1 ? "s" : ""
    } will be removed from the sidebar. Their saved games are kept and can still be found in Game History.`;
  _pendingDeleteId = "__teams__";
  document.getElementById("delete-confirm-modal").style.display = "flex";
}

function renderSidebar() {
  const list = document.getElementById("hub-team-list");

  // Sync the select button / action bar state
  const tsBtn = document.getElementById("ts-select-btn");
  const tsBar = document.getElementById("ts-action-bar");
  if (tsBtn) {
    tsBtn.textContent = _tsSelectMode ? "Cancel" : "Select";
    tsBtn.style.borderColor = _tsSelectMode
      ? "var(--accent)"
      : "var(--border2)";
    tsBtn.style.color = _tsSelectMode ? "var(--accent)" : "var(--text3)";
  }
  if (tsBar) tsBar.classList.toggle("visible", _tsSelectMode);

  // Always render mobile bar regardless of team count
  const mobTeams = document.getElementById("hub-mob-teams");
  if (mobTeams) {
    const _mobMyTeamName = _getMyTeamName();
    const _mobPillOnclick = `_mobTsSelectMode ? ((_tsSelected.has(this.getAttribute('data-team')) ? _tsSelected.delete(this.getAttribute('data-team')) : _tsSelected.add(this.getAttribute('data-team'))), hubRefreshAll(), _mobTsUpdateBar()) : hubMobNav('team',this.getAttribute('data-team'))`;
    const mobMyTeamBtn =
      _mobMyTeamName && myTeamRoster && myTeamRoster.length > 0
        ? `<button class="hub-mob-team-btn${
            _mobTsSelectMode && _tsSelected.has(_mobMyTeamName)
              ? " mob-ts-selected"
              : currentView?.type === "team" &&
                currentView?.data === _mobMyTeamName
              ? " active"
              : ""
          }" data-team="${escAttr(
            _mobMyTeamName
          )}" onclick="${_mobPillOnclick}" style="${
            _mobTsSelectMode
              ? ""
              : "color:var(--accent);border-color:rgba(204,26,26,.4)"
          }">${escHtml(_mobMyTeamName)}</button>`
        : "";
    mobTeams.innerHTML =
      mobMyTeamBtn +
      allTeams
        .filter((t) => t !== _mobMyTeamName)
        .map((t) => {
          const isSelected = _mobTsSelectMode && _tsSelected.has(t);
          const isActive =
            !_mobTsSelectMode &&
            currentView?.type === "team" &&
            currentView?.data === t;
          return `<button class="hub-mob-team-btn${
            isSelected ? " mob-ts-selected" : isActive ? " active" : ""
          }" data-team="${escAttr(t)}" onclick="${_mobPillOnclick}">${escHtml(
            t
          )}</button>`;
        })
        .join("");
  }
  const allBtn = document.getElementById("hub-mob-all");
  if (allBtn)
    allBtn.classList.toggle(
      "active",
      currentView?.type === "games" || !currentView?.type
    );
  const cmpMobBtn = document.getElementById("hub-mob-compare");
  if (cmpMobBtn)
    cmpMobBtn.classList.toggle("active", currentView?.type === "compare");

  // Desktop sidebar
  const myTeamName = _getMyTeamName() || "My Team";
  const otherTeams = allTeams.filter((t) => t !== myTeamName);
  const hasMyTeam = myTeamRoster && myTeamRoster.length > 0;
  // In opponents tab only show opponent teams, not My Team
  const showingOpponents = _hubTab === "opponents";
  if (!otherTeams.length && (!hasMyTeam || showingOpponents)) {
    if (showingOpponents && !otherTeams.length) {
      list.innerHTML = '<div class="sidebar-empty">No opponents yet</div>';
      return;
    }
    if (!showingOpponents && !otherTeams.length && !hasMyTeam) {
      list.innerHTML = '<div class="sidebar-empty">No teams yet</div>';
      return;
    }
  }
  const _myTeamAllGames = hasMyTeam ? getTeamGames(myTeamName) : [];
  const myTeamGames = _seasonFilter
    ? _myTeamAllGames.filter((g) => g.date && g.date.slice(0, 4) === _seasonFilter)
    : _myTeamAllGames;
  const myTeamRecord =
    myTeamGames.length > 0 ? getTeamRecord(myTeamName, myTeamGames) : null;
  const myTeamIsActive =
    currentView?.type === "team" && currentView?.data === myTeamName;

  // My Team pinned entry — selectable for Send but never for deletion
  const myTeamIsSel = _tsSelected.has(myTeamName);
  const myTeamChkHTML = _tsSelectMode
    ? `<div class="gh-checkbox${
        myTeamIsSel ? " checked" : ""
      }" style="margin-left:10px;flex-shrink:0">${myTeamIsSel ? "✓" : ""}</div>`
    : "";
  const myTeamEntry = hasMyTeam
    ? `<div class="ts-team-row${
        myTeamIsSel ? " ts-selected-row" : ""
      }" data-team="${escAttr(
        myTeamName
      )}" style="display:flex;align-items:center;border-left:3px solid ${
        myTeamIsSel ? "var(--accent)" : "var(--accent)"
      };margin-bottom:4px;background:rgba(204,26,26,.04);border-radius:0 6px 6px 0;cursor:${
        _tsSelectMode ? "pointer" : "default"
      }" ${
        _tsSelectMode ? `onclick="tsToggleTeam('${escAttr(myTeamName)}')"` : ""
      }>
      ${myTeamChkHTML}
      <button class="team-btn${
        myTeamIsActive && !_tsSelectMode ? " active" : ""
      }" data-team="${escAttr(myTeamName)}" ${
        _tsSelectMode
          ? ""
          : `onclick="showView('team',this.getAttribute('data-team'))"`
      } style="flex:1;border-left:none;pointer-events:${
        _tsSelectMode ? "none" : "auto"
      }">
<div class="team-icon" style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:9px;letter-spacing:0.5px;color:var(--accent);border-color:rgba(204,26,26,.3)">MY</div>
<div>
  <div class="team-name" style="color:var(--accent)">${escHtml(
    myTeamName
  )}</div>
  <div class="team-meta">${myTeamGames.length} game${
        myTeamGames.length !== 1 ? "s" : ""
      }${
        myTeamRecord
          ? " · " +
            myTeamRecord.w +
            "-" +
            myTeamRecord.l +
            (myTeamRecord.t ? "-" + myTeamRecord.t : "")
          : " · My Roster"
      }</div>
</div>
      </button>
    </div>`
    : "";

  const teamRows = otherTeams
    .map((t) => {
      const _tGamesAll = getTeamGames(t);
      const games = _seasonFilter
        ? _tGamesAll.filter((g) => g.date && g.date.slice(0, 4) === _seasonFilter)
        : _tGamesAll;
      const record = getTeamRecord(t, games);
      const isSel = _tsSelected.has(t);
      const isActive = currentView?.type === "team" && currentView?.data === t;
      const chkHTML = _tsSelectMode
        ? `<div class="gh-checkbox${
            isSel ? " checked" : ""
          }" style="margin-left:10px;flex-shrink:0">${isSel ? "✓" : ""}</div>`
        : "";
      const exportBtn = !_tsSelectMode
        ? `<button onclick="event.stopPropagation();exportTeamData('${escAttr(
            t
          )}')" title="Export ${escHtml(
            t
          )} games" style="flex-shrink:0;padding:6px 10px;background:none;border:none;color:var(--text3);cursor:pointer;font-size:11px;transition:color .14s" onmouseover="this.style.color='var(--accent)'" onmouseout="this.style.color='var(--text3)'">⬇</button>`
        : "";
      return `<div class="ts-team-row${
        isSel ? " ts-selected-row" : ""
      }" data-team="${escAttr(
        t
      )}" style="display:flex;align-items:center;border-left:3px solid ${
        isSel ? "var(--accent)" : "transparent"
      };cursor:${_tsSelectMode ? "pointer" : "default"}" ${
        _tsSelectMode ? `onclick="tsToggleTeam('${escAttr(t)}')"` : ""
      }>
      ${chkHTML}
      <button class="team-btn${
        isActive && !_tsSelectMode ? " active" : ""
      }" data-team="${escAttr(t)}" ${
        _tsSelectMode
          ? ""
          : `onclick="showView('team',this.getAttribute('data-team'))"`
      } style="flex:1;border-left:none;pointer-events:${
        _tsSelectMode ? "none" : "auto"
      }">
<div class="team-icon" style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:11px;letter-spacing:0.5px;color:var(--text2)">${escHtml(
        t
      )
        .slice(0, 3)
        .toUpperCase()}</div>
<div>
  <div class="team-name">${escHtml(t)}</div>
  <div class="team-meta">${games.length} game${
        games.length !== 1 ? "s" : ""
      } · ${record.w}-${record.l}${record.t ? "-" + record.t : ""}</div>
</div>
      </button>
      ${exportBtn}
    </div>`;
    })
    .join("");

  list.innerHTML = (showingOpponents ? "" : myTeamEntry) + teamRows;
}

// ── Mobile team select mode ──────────────────────────────────────────
var _mobTsSelectMode = false;

function mobTsToggleSelectMode() {
  _mobTsSelectMode = !_mobTsSelectMode;
  _tsSelected.clear();
  var btn = document.getElementById("mob-ts-select-btn");
  var bar = document.getElementById("mob-ts-action-bar");
  if (btn) {
    btn.textContent = _mobTsSelectMode ? "Cancel" : "Select";
    btn.style.color = _mobTsSelectMode ? "var(--accent)" : "";
    btn.style.borderColor = _mobTsSelectMode ? "var(--accent)" : "";
  }
  if (bar) bar.style.display = _mobTsSelectMode ? "flex" : "none";
  hubRefreshAll();
  _mobTsUpdateBar();
}

function _mobTsUpdateBar() {
  var count = _tsSelected.size;
  var el = document.getElementById("mob-ts-sel-count");
  var sendBtn = document.getElementById("mob-ts-send-btn");
  if (el) el.textContent = count + " selected";
  if (sendBtn) {
    sendBtn.disabled = count === 0;
    sendBtn.style.opacity = count > 0 ? "1" : ".45";
    sendBtn.style.cursor = count > 0 ? "pointer" : "not-allowed";
    sendBtn.style.color = count > 0 ? "var(--text)" : "var(--text3)";
  }
}

function mobTsSelectAll() {
  var myTN = window._myTeamNameCache || "";
  if (myTN) _tsSelected.add(myTN);
  allTeams.forEach(function (t) {
    _tsSelected.add(t);
  });
  hubRefreshAll();
  _mobTsUpdateBar();
}

function mobTsSelectNone() {
  _tsSelected.clear();
  hubRefreshAll();
  _mobTsUpdateBar();
}

function hubMobNav(type, data) {
  showView(type, data);
  // Scroll mobile bar to show active button
  const bar = document.getElementById("hub-mobile-bar");
  if (bar) {
    const active = bar.querySelector(".active");
    if (active)
      active.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
  }
}

// ===== PLAYER COMPARISON =====

// ── League-wide percentile tables (built at render time) ──────────────
function _cmpBuildLeaguePctiles(minPA, minPitches) {
  minPA = minPA || 5;
  minPitches = minPitches || 10;
  const b = {
    avg: [],
    obp: [],
    slg: [],
    ops: [],
    kpct: [],
    bbpct: [],
    iso: [],
    babip: [],
  };
  const p = {
    strikePct: [],
    kBF: [],
    bbBF: [],
    whiffRate: [],
    chaseRate: [],
  };

  const myTN = (function () {
    try {
      const ni = document.getElementById("myteam-name-input");
      if (ni && ni.value.trim()) return ni.value.trim();
      return window._myTeamNameCache || null;
    } catch (e) {
      return null;
    }
  })();
  const teams = [...(allTeams || [])];
  if (myTN && myTeamRoster && myTeamRoster.length > 0 && !teams.includes(myTN))
    teams.push(myTN);

  teams.forEach((team) => {
    const games = getTeamGames(team);
    // batters
    getTeamRoster(team, games).forEach((r) => {
      const pa = r.pa != null ? r.pa : (r.ab || 0) + (r.bb || 0) + (r.hbp || 0);
      // Require at least 2 PA per team game played to be included in percentiles
      // e.g. USJ played 8 games → player needs 16 PA; Dean played 5 → needs 10 PA
      if (pa < games.length * 2) return;
      const tb =
        (r.hits || 0) -
        (r.doubles || 0) -
        (r.triples || 0) -
        (r.hr || 0) +
        (r.doubles || 0) * 2 +
        (r.triples || 0) * 3 +
        (r.hr || 0) * 4;
      if (r.ab > 0) {
        b.avg.push(r.hits / r.ab);
        b.slg.push(tb / r.ab);
        b.iso.push((tb - (r.hits || 0)) / r.ab);
      }
      if (pa > 0) {
        b.obp.push(((r.hits || 0) + (r.bb || 0) + (r.hbp || 0)) / pa);
        b.kpct.push((r.k || 0) / pa);
        b.bbpct.push((r.bb || 0) / pa);
      }
      const obp2 =
          pa > 0 ? ((r.hits || 0) + (r.bb || 0) + (r.hbp || 0)) / pa : null,
        slg2 = r.ab > 0 ? tb / r.ab : null;
      if (obp2 !== null && slg2 !== null) b.ops.push(obp2 + slg2);
      const bd = r.ab - (r.k || 0) - (r.hr || 0);
      if (bd > 0) b.babip.push(((r.hits || 0) - (r.hr || 0)) / bd);
    });
    // pitchers — aggregate pitch-log for whiff/chase
    getTeamPitchers(team, games).forEach((pt) => {
      if (pt.pitches < minPitches) return;
      p.strikePct.push(pt.strikes / pt.pitches);
      if (pt.bf > 0) {
        p.kBF.push(pt.k / pt.bf);
        p.bbBF.push(pt.bb / pt.bf);
      }
    });
  });

  const CONTACT_ALL = [
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
  const SWING_ALL = ["strike-swinging", "foul", ...CONTACT_ALL];
  const IN_ZONE = (q) =>
    q.pitchX != null &&
    q.pitchX >= 31 &&
    q.pitchX <= 69 &&
    q.pitchY != null &&
    q.pitchY >= 30.9 &&
    q.pitchY <= 69.1;
  // collect whiff/chase from pitch logs for all pitchers (heavy but done once)
  teams.forEach((team) => {
    const games = getTeamGames(team);
    getTeamPitchers(team, games).forEach((pt) => {
      if (pt.pitches < minPitches) return;
      const pp2 = getPitcherPitches(team, pt.name, games);
      const sw = pp2.filter((q) => SWING_ALL.includes(q.outcome)).length;
      const wh = pp2.filter((q) => q.outcome === "strike-swinging").length;
      const oo = pp2.filter((q) => !IN_ZONE(q));
      const oos = oo.filter((q) => SWING_ALL.includes(q.outcome)).length;
      if (sw > 0) p.whiffRate.push(wh / sw);
      if (oo.length > 0) p.chaseRate.push(oos / oo.length);
    });
  });

  // sort ascending
  [...Object.keys(b), ...Object.keys(p)].forEach((k) => {
    const a = b[k] || p[k];
    if (a) a.sort((x, y) => x - y);
  });
  return { b, p };
}

function _cmpPctile(sortedArr, val) {
  if (
    val === null ||
    val === undefined ||
    isNaN(val) ||
    !sortedArr ||
    sortedArr.length < 3
  )
    return null;
  const below = sortedArr.filter((v) => v < val).length;
  return Math.round((below / sortedArr.length) * 100);
}

function _pctileSuffix(n) {
  if (n === null) return "";
  if (n >= 90) return n + "th ▲";
  if (n <= 10) return n + "th ▼";
  return n + "th";
}

function _cmpBuildStats(team, name) {
  const games = getTeamGames(team);
  const s = getPlayerCareerStats(team, name, games);
  const pa = s.pa != null ? s.pa : s.ab + s.bb + (s.hbp || 0);
  const tb =
    s.hits -
    s.doubles -
    s.triples -
    s.hr +
    s.doubles * 2 +
    s.triples * 3 +
    s.hr * 4;
  const avg = s.ab > 0 ? s.hits / s.ab : null;
  const obp = pa > 0 ? (s.hits + s.bb + (s.hbp || 0) + (s.ci || 0)) / pa : null;
  const slg = s.ab > 0 ? tb / s.ab : null;
  const ops = obp !== null && slg !== null ? obp + slg : null;
  const kpct = pa > 0 ? s.k / pa : null;
  const bbpct = pa > 0 ? s.bb / pa : null;
  const babip_den = s.ab - s.k - s.hr;
  const babip = babip_den > 0 ? (s.hits - s.hr) / babip_den : null;
  const iso = s.ab > 0 ? (tb - s.hits) / s.ab : null;

  // Pitcher aggregate data
  const allPitchers = getTeamPitchers(team, games);
  const pd = allPitchers.find((p) => p.name === name) || null;
  const pStrikePct = pd && pd.pitches > 0 ? pd.strikes / pd.pitches : null;
  const pKperBF = pd && pd.bf > 0 ? pd.k / pd.bf : null;
  const pBBperBF = pd && pd.bf > 0 ? pd.bb / pd.bf : null;

  // Pitch-level processing helpers
  const CONTACT_OUT = [
    "groundout",
    "flyout",
    "lineout",
    "sacfly",
    "sacbunt",
    "error",
  ];
  const CONTACT_HIT = ["single", "double", "triple", "homerun"];
  const CONTACT_ALL = [...CONTACT_HIT, ...CONTACT_OUT];
  const SWING_ALL = ["strike-swinging", "foul", ...CONTACT_ALL];
  const IN_ZONE = (p) =>
    p.pitchX != null &&
    p.pitchX >= 31 &&
    p.pitchX <= 69 &&
    p.pitchY != null &&
    p.pitchY >= 30.9 &&
    p.pitchY <= 69.1;
  const IS_GB = (b) => b === "groundball" || b === "weakgrounder";

  // ── Batter plate discipline from pitch log ──
  const bp = getPlayerPitches(team, name, games);
  const bSwings = bp.filter((p) => SWING_ALL.includes(p.outcome)).length;
  const bContact = bp.filter((p) => CONTACT_ALL.includes(p.outcome)).length;
  const bWhiffs = bp.filter((p) => p.outcome === "strike-swinging").length;
  const bOOZ = bp.filter((p) => !IN_ZONE(p));
  const bIZ = bp.filter((p) => IN_ZONE(p));
  const bChaseSwings = bOOZ.filter((p) => SWING_ALL.includes(p.outcome)).length;
  const bZSwings = bIZ.filter((p) => SWING_ALL.includes(p.outcome)).length;
  const bBIP = bp.filter((p) => p.spray?.btype);
  const bGB = bBIP.filter((p) => IS_GB(p.spray.btype)).length;
  const bLD = bBIP.filter((p) => p.spray.btype === "linedrive").length;
  const bFB = bBIP.filter(
    (p) => p.spray.btype === "flyball" || p.spray.btype === "popup"
  ).length;
  const bVels = bp
    .map((p) => parseFloat(p.velocity))
    .filter((v) => !isNaN(v) && v > 0);

  const contactRate = bSwings > 0 ? bContact / bSwings : null;
  const whiffRate = bSwings > 0 ? bWhiffs / bSwings : null;
  const chaseRate = bOOZ.length > 0 ? bChaseSwings / bOOZ.length : null;
  const zoneSwingRate = bIZ.length > 0 ? bZSwings / bIZ.length : null;
  const swingRate = bp.length > 0 ? bSwings / bp.length : null;
  const bGBpct = bBIP.length > 0 ? bGB / bBIP.length : null;
  const bLDpct = bBIP.length > 0 ? bLD / bBIP.length : null;
  const bFBpct = bBIP.length > 0 ? bFB / bBIP.length : null;
  const avgVeloFaced =
    bVels.length > 0 ? bVels.reduce((a, b) => a + b, 0) / bVels.length : null;

  // ── Pitcher pitch-level metrics ──
  const pp = getPitcherPitches(team, name, games);
  const pSwings = pp.filter((p) => SWING_ALL.includes(p.outcome)).length;
  const pWhiffs = pp.filter((p) => p.outcome === "strike-swinging").length;
  const pOOZ = pp.filter((p) => !IN_ZONE(p));
  const pIZ = pp.filter((p) => IN_ZONE(p));
  const pChaseSwings = pOOZ.filter((p) => SWING_ALL.includes(p.outcome)).length;
  const pBIP2 = pp.filter((p) => p.spray?.btype);
  const pGB2 = pBIP2.filter((p) => IS_GB(p.spray.btype)).length;
  const pLD2 = pBIP2.filter((p) => p.spray.btype === "linedrive").length;
  const pFB2 = pBIP2.filter(
    (p) => p.spray.btype === "flyball" || p.spray.btype === "popup"
  ).length;
  const pFP = pp.filter((p) => _isFirstPitch(p));
  const pFPS = pFP.filter((p) => _isStrike(p.outcome)).length;
  const pVels = pp
    .map((p) => parseFloat(p.velocity))
    .filter((v) => !isNaN(v) && v > 0);

  const pWhiffRate = pSwings > 0 ? pWhiffs / pSwings : null;
  const pChaseRate = pOOZ.length > 0 ? pChaseSwings / pOOZ.length : null;
  const pZonePct = pp.length > 0 ? pIZ.length / pp.length : null;
  const pGBpct = pBIP2.length > 0 ? pGB2 / pBIP2.length : null;
  const pLDpct = pBIP2.length > 0 ? pLD2 / pBIP2.length : null;
  const pFBpct = pBIP2.length > 0 ? pFB2 / pBIP2.length : null;
  const pFPSpct = pFP.length > 0 ? pFPS / pFP.length : null;
  const pAvgVelo =
    pVels.length > 0 ? pVels.reduce((a, b) => a + b, 0) / pVels.length : null;
  const pMaxVelo = pVels.length > 0 ? Math.max(...pVels) : null;

  // ── Extended pitcher pitch-level metrics ──
  // vs RHB / vs LHB
  const ppRHB = pp.filter((p) => p.batterHand === "R");
  const ppLHB = pp.filter((p) => p.batterHand === "L");
  const _pWhiff = (arr) => {
    const sw = arr.filter((p) => SWING_ALL.includes(p.outcome)).length;
    const wh = arr.filter((p) => p.outcome === "strike-swinging").length;
    return sw > 0 ? wh / sw : null;
  };
  const _pStr = (arr) =>
    arr.length > 0
      ? arr.filter((p) => _isStrike(p.outcome)).length / arr.length
      : null;
  const pWhiffRateRHB = _pWhiff(ppRHB);
  const pWhiffRateLHB = _pWhiff(ppLHB);
  const pStrikePctRHB = _pStr(ppRHB);
  const pStrikePctLHB = _pStr(ppLHB);

  // TTO splits
  const _pitchesByGameCmp = {};
  pp.forEach((p, i) => {
    const gid = p.gameId;
    if (!_pitchesByGameCmp[gid]) _pitchesByGameCmp[gid] = [];
    _pitchesByGameCmp[gid].push({ p, i });
  });
  const _cmpTTO = new Array(pp.length).fill(1);
  Object.values(_pitchesByGameCmp).forEach((entries) => {
    const ordered = [...entries].reverse();
    const appearances = {};
    let prevBI = null;
    ordered.forEach(({ p, i }) => {
      const bi = p.batterIdx;
      if (bi !== prevBI) {
        appearances[bi] = (appearances[bi] || 0) + 1;
        prevBI = bi;
      }
      _cmpTTO[i] = appearances[bi] || 1;
    });
  });
  const ppTTO1 = pp.filter((_, i) => _cmpTTO[i] === 1);
  const ppTTO2 = pp.filter((_, i) => _cmpTTO[i] === 2);
  const ppTTO3 = pp.filter((_, i) => _cmpTTO[i] >= 3);

  // Reusable pitch-metrics bundle helper
  const _pM = (arr) => {
    if (!arr.length)
      return {
        str: null,
        whiff: null,
        zone: null,
        fps: null,
        chase: null,
      };
    const n = arr.length;
    const strk = arr.filter((p) => _isStrike(p.outcome)).length;
    const sw = arr.filter((p) => SWING_ALL.includes(p.outcome)).length;
    const wh = arr.filter((p) => p.outcome === "strike-swinging").length;
    const iz = arr.filter((p) => IN_ZONE(p)).length;
    const oz = arr.filter((p) => !IN_ZONE(p));
    const ozSw = oz.filter((p) => SWING_ALL.includes(p.outcome)).length;
    const fp = arr.filter((p) => _isFirstPitch(p));
    const fpStr = fp.filter((p) => _isStrike(p.outcome)).length;
    return {
      str: strk / n,
      whiff: sw > 0 ? wh / sw : null,
      zone: iz / n,
      fps: fp.length > 0 ? fpStr / fp.length : null,
      chase: oz.length > 0 ? ozSw / oz.length : null,
    };
  };

  // Home / Away split (by game)
  const _gameIsHome = {};
  games.forEach((g) => {
    _gameIsHome[g.id] = g.homeTeam === team;
  });
  const ppHome = pp.filter((p) => _gameIsHome[p.gameId]);
  const ppAway = pp.filter((p) => !_gameIsHome[p.gameId]);

  // Runners-on splits
  const ppBasesEmpty = pp.filter(
    (p) =>
      p.runnersOn &&
      !p.runnersOn["1st"] &&
      !p.runnersOn["2nd"] &&
      !p.runnersOn["3rd"]
  );
  const ppRunnersOn = pp.filter(
    (p) =>
      p.runnersOn &&
      (p.runnersOn["1st"] || p.runnersOn["2nd"] || p.runnersOn["3rd"])
  );
  const ppRISP = pp.filter(
    (p) => p.runnersOn && (p.runnersOn["2nd"] || p.runnersOn["3rd"])
  );

  // Outs splits
  const ppO0 = pp.filter((p) => p.outs === 0);
  const ppO1 = pp.filter((p) => p.outs === 1);
  const ppO2 = pp.filter((p) => p.outs === 2);

  // Count splits
  const ppFirstPitch = pp.filter((p) => _isFirstPitch(p));
  const ppAheadCount = pp.filter((p) => {
    const c = _ppc(p);
    return c.strikes > c.balls;
  });
  const ppBehindCount = pp.filter((p) => {
    const c = _ppc(p);
    return c.balls > c.strikes;
  });
  const pp2Strike = pp.filter((p) => _ppc(p).strikes === 2);
  const ppFullCount = pp.filter((p) => {
    const c = _ppc(p);
    return c.balls === 3 && c.strikes === 2;
  });

  // Pitcher splits object — all sections from the splits tab
  const pSplits = {
    home: _pM(ppHome),
    away: _pM(ppAway),
    vsRHB: _pM(ppRHB),
    vsLHB: _pM(ppLHB),
    tto1: _pM(ppTTO1),
    tto2: _pM(ppTTO2),
    tto3: _pM(ppTTO3),
    basesEmpty: _pM(ppBasesEmpty),
    runnersOn: _pM(ppRunnersOn),
    risp: _pM(ppRISP),
    out0: _pM(ppO0),
    out1: _pM(ppO1),
    out2: _pM(ppO2),
    firstPitch: _pM(ppFirstPitch),
    ahead: _pM(ppAheadCount),
    behind: _pM(ppBehindCount),
    twoStrike: _pM(pp2Strike),
    fullCount: _pM(ppFullCount),
  };

  // Pitcher-faced AB extraction for allowed batting lines
  // Reuses _extractABs infrastructure (alias-aware) from the opposing batter's perspective
  const pFacedABs = (() => {
    const pNames2 = _nameAliases[name] || new Set([name]);
    const abs = [];
    games.forEach((g) => {
      const pitchLog = g.pitchLog || [];
      const myPitches = pitchLog.filter(
        (p) => pNames2.has(p.pitcher) && p.pitcherTeam === team
      );
      if (!myPitches.length) return;
      const facedBatters = [
        ...new Set(myPitches.map((p) => p.batter).filter(Boolean)),
      ];
      const oppTeam = g.awayTeam === team ? g.homeTeam : g.awayTeam;
      facedBatters.forEach((bName) => {
        const bAbs = _extractABs(pitchLog, bName, oppTeam, g).filter((ab) =>
          pNames2.has(ab.pitcher)
        );
        bAbs.forEach((ab) => {
          ab._bHand = ab.pitches[0]?.batterHand || "—";
          abs.push(ab);
        });
      });
    });
    return abs;
  })();

  const _allowedLine = (absArr) =>
    absArr.length ? _sumStats(absArr.map(_abToStats)) : null;
  const _allowedRates = (st) => {
    if (!st || st.pa === 0) return null;
    const obpV = st.pa > 0 ? (st.h + st.bb + st.hbp) / st.pa : null;
    const slgV = st.ab > 0 ? st.tb / st.ab : null;
    return {
      pa: st.pa,
      avg: st.ab > 0 ? st.h / st.ab : null,
      obp: obpV,
      slg: slgV,
      ops: obpV !== null && slgV !== null ? obpV + slgV : null,
      iso: st.ab > 0 ? (st.tb - st.h) / st.ab : null,
      kpct: st.pa > 0 ? st.k / st.pa : null,
      bbpct: st.pa > 0 ? st.bb / st.pa : null,
      hr: st.hr,
      h: st.h,
      k: st.k,
      bb: st.bb,
    };
  };

  const pAllowed = {
    overall: _allowedRates(_allowedLine(pFacedABs)),
    vsRHB: _allowedRates(
      _allowedLine(pFacedABs.filter((a) => a._bHand === "R"))
    ),
    vsLHB: _allowedRates(
      _allowedLine(pFacedABs.filter((a) => a._bHand === "L"))
    ),
  };

  // Top velocity pitch types
  const _veloByTypeCmp = {};
  pp.forEach((p) => {
    const v = parseFloat(p.velocity);
    if (isNaN(v) || v <= 0) return;
    const t = p.pitchType && p.pitchType !== "—" ? p.pitchType : null;
    if (!t) return;
    if (!_veloByTypeCmp[t]) _veloByTypeCmp[t] = [];
    _veloByTypeCmp[t].push(v);
  });
  const pVeloByType = Object.fromEntries(
    Object.entries(_veloByTypeCmp)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 3)
      .map(([t, vs]) => [t, vs.reduce((a, b) => a + b, 0) / vs.length])
  );

  // ── Batter splits ──
  const sortedGames = [...games].sort((a, b) => a.date.localeCompare(b.date));
  const allABs = sortedGames.flatMap((g) =>
    _extractABs(g.pitchLog || [], name, team, g)
  );
  const _splitSt = (filterFn) => {
    const arr = allABs.filter(filterFn).map(_abToStats);
    return arr.length ? _sumStats(arr) : null;
  };
  const splits = {
    vsLHP: _splitSt((a) => a.pitcherHand === "L"),
    vsRHP: _splitSt((a) => a.pitcherHand !== "L"),
    home: _splitSt((a) => a.isHome),
    away: _splitSt((a) => !a.isHome),
    risp: _splitSt((a) => a.runnersOn?.["2nd"] || a.runnersOn?.["3rd"]),
    basesEmpty: _splitSt(
      (a) =>
        !a.runnersOn?.["1st"] && !a.runnersOn?.["2nd"] && !a.runnersOn?.["3rd"]
    ),
    aheadCount: _splitSt((a) => {
      const fp = a.pitches[0];
      return fp && fp.balls > fp.strikes;
    }),
    behindCount: _splitSt((a) => {
      const fp = a.pitches[0];
      return fp && fp.strikes > fp.balls;
    }),
    twoStrike: _splitSt((a) => a.pitches.some((p) => p.strikes === 2)),
  };

  // Legacy single-value fields kept for backward compat with existing rows
  const pStrikePctTTO1 = pSplits.tto1.str;
  const pStrikePctTTO3 = pSplits.tto3.str;
  const pWhiffRateTTO1 = pSplits.tto1.whiff;
  const pWhiffRateTTO3 = pSplits.tto3.whiff;
  const p2StrikeWhiffRate = pSplits.twoStrike.whiff;

  // Fielding aggregates
  let _fPO = 0,
    _fA = 0,
    _fE = 0;
  games.forEach((g) => {
    Object.values(g.fieldingStats || {}).forEach((f) => {
      const fNames = _nameAliases[name] || new Set([name]);
      if (!fNames.has(f.name)) return;
      if (g.awayTeam !== team && g.homeTeam !== team) return;
      _fPO += f.po || 0;
      _fA += f.a || 0;
      _fE += f.e || 0;
    });
  });
  const _fTC = _fPO + _fA + _fE;
  const fielding = {
    po: _fPO,
    a: _fA,
    e: _fE,
    tc: _fTC,
    fpct: _fTC > 0 ? (_fPO + _fA) / _fTC : null,
  };

  // Pitcher conventional stats
  const pitcherConv = (() => {
    if (!pd) return null;
    const ip = pd.outs || 0;
    const ipF = ip / 3;
    return {
      ip,
      ipDisp: ip > 0 ? Math.floor(ipF) + "." + (ip % 3) : "0.0",
      era: ip > 0 ? ((pd.r || 0) / ipF) * 9 : null,
      whip: ip > 0 ? ((pd.bb || 0) + (pd.hits || 0)) / ipF : null,
      k9: ip > 0 ? ((pd.k || 0) / ipF) * 9 : null,
      bb9: ip > 0 ? ((pd.bb || 0) / ipF) * 9 : null,
    };
  })();

  return {
    team,
    name,
    ...s,
    pa,
    tb,
    avg,
    obp,
    slg,
    ops,
    kpct,
    bbpct,
    babip,
    iso,
    pd,
    pStrikePct,
    pKperBF,
    pBBperBF,
    contactRate,
    whiffRate,
    chaseRate,
    zoneSwingRate,
    swingRate,
    bGBpct,
    bLDpct,
    bFBpct,
    avgVeloFaced,
    pWhiffRate,
    pChaseRate,
    pZonePct,
    pGBpct,
    pLDpct,
    pFBpct,
    pFPSpct,
    pAvgVelo,
    pMaxVelo,
    pWhiffRateRHB,
    pWhiffRateLHB,
    pStrikePctRHB,
    pStrikePctLHB,
    p2StrikeWhiffRate,
    pStrikePctTTO1,
    pStrikePctTTO3,
    pWhiffRateTTO1,
    pWhiffRateTTO3,
    pVeloByType,
    pSplits,
    pAllowed,
    splits,
    fielding,
    pitcherConv,
  };
}

function _cmpFmt(n, type) {
  if (n === null || n === undefined || (typeof n === "number" && isNaN(n)))
    return "—";
  if (type === "rate") return _fmtRate(n);
  if (type === "pct") return (n * 100).toFixed(1) + "%";
  if (type === "int")
    return isNaN(parseInt(n)) ? "—" : Math.round(n).toString();
  return n.toString();
}

// _cmpRow: vals = array of formatted strings, pcts = optional array of percentile ints|null
function _cmpRow(label, vals, dir, pcts) {
  const classes = vals.map(() => "cmp-val");
  if (dir !== "none") {
    const nums = vals.map((v) =>
      v !== "—"
        ? parseFloat(v.replace("%", "").replace("▲", "").replace("▼", ""))
        : null
    );
    const valids = nums.filter((n) => n !== null);
    if (valids.length >= 2) {
      const best = dir === "high" ? Math.max(...valids) : Math.min(...valids);
      nums.forEach((n, i) => {
        if (n === best) classes[i] += " win";
      });
    }
  }
  const tds = vals
    .map((v, i) => {
      const pb =
        pcts && pcts[i] !== null && pcts[i] !== undefined
          ? `<div class="cmp-pctile">${_pctileSuffix(pcts[i])}</div>`
          : "";
      return `<td class="${classes[i]}">${v}${pb}</td>`;
    })
    .join("");
  return `<tr><td>${label}</td>${tds}</tr>`;
}

function _cmpStatsHTML(slots, pctiles) {
  // slots = array of {s, isPitcher} (2 or 3 elements, s may be null)
  const r = _cmpRow;
  const f = _cmpFmt;
  const NA = "—";
  const N = slots.length;

  // Column widths: label gets 40%, value cols split remaining evenly
  const valW = Math.floor(60 / N);
  const labelW = 100 - valW * N;
  const thStyle = `style="width:${valW}%"`;
  const thLabelStyle = `style="width:${labelW}%"`;

  const n1 = slots[0]?.s ? escHtml(slots[0].s.name.split(" ").pop()) : "P1";
  const names = slots.map((sl, i) =>
    sl?.s ? escHtml(sl.s.name.split(" ").pop()) : "P" + (i + 1)
  );
  const thead = `<thead><tr><th ${thLabelStyle}></th>${names
    .map((n) => `<th ${thStyle}>${n}</th>`)
    .join("")}</tr></thead>`;

  // p() helper: get formatted value for slot i, or NA
  const gv = (i, getter) => {
    const sl = slots[i];
    return sl?.s ? getter(sl.s) : NA;
  };

  // Helper: skip batting section if all slots are pitchers with no PA
  const hasBatting = (s) => s && s.ab > 0;
  const showBatting = slots.some((sl) => hasBatting(sl?.s));

  // ── PITCHING SECTION ──────────────────────────────────────────
  const hasPitching = slots.some((sl) => sl?.s?.pd && sl.s.pd.pitches > 0);
  let pitchSection = "";
  if (hasPitching) {
    const vp = (key, getter) => slots.map((sl) => (sl?.s ? getter(sl.s) : NA));
    const rp = (label, getter, dir, pKey) =>
      r(
        label,
        vp(label, getter),
        dir,
        pKey
          ? slots.map((sl) => _cmpPctile(pctiles.p[pKey], sl?.s?.[pKey]))
          : null
      );

    // Helper: format a pSplits metric
    const ps = (sl, splitKey, metric) => {
      const v = sl?.s?.pSplits?.[splitKey]?.[metric];
      return v != null ? f(v, "pct") : NA;
    };
    // Helper: format pAllowed metric
    const pa = (sl, splitKey, metric) => {
      const v = sl?.s?.pAllowed?.[splitKey]?.[metric];
      if (v == null) return NA;
      return metric === "avg" ||
        metric === "obp" ||
        metric === "slg" ||
        metric === "ops" ||
        metric === "iso"
        ? f(v, "rate")
        : metric === "kpct" || metric === "bbpct"
        ? f(v, "pct")
        : f(v, "int");
    };

    pitchSection = `
<div data-cmp-section="pitch-traditional" style="${
      _cmpHiddenSections.has("pitch-traditional") ? "display:none" : ""
    }">
    <div class="cmp-stat-section-head">Pitching — Traditional</div>
    <table class="cmp-stat-table">${thead}<tbody>
      ${r(
        "IP",
        slots.map((sl) => sl?.s?.pitcherConv?.ipDisp ?? NA),
        "high"
      )}
      ${r(
        "ERA",
        slots.map((sl) =>
          sl?.s?.pitcherConv?.era != null ? sl.s.pitcherConv.era.toFixed(2) : NA
        ),
        "low"
      )}
      ${r(
        "WHIP",
        slots.map((sl) =>
          sl?.s?.pitcherConv?.whip != null
            ? sl.s.pitcherConv.whip.toFixed(2)
            : NA
        ),
        "low"
      )}
      ${r(
        "K/9",
        slots.map((sl) =>
          sl?.s?.pitcherConv?.k9 != null ? sl.s.pitcherConv.k9.toFixed(1) : NA
        ),
        "high"
      )}
      ${r(
        "BB/9",
        slots.map((sl) =>
          sl?.s?.pitcherConv?.bb9 != null ? sl.s.pitcherConv.bb9.toFixed(1) : NA
        ),
        "low"
      )}
    </tbody></table>
</div>
<div data-cmp-section="pitch-results" style="${
      _cmpHiddenSections.has("pitch-results") ? "display:none" : ""
    }">
    <div class="cmp-stat-section-head">Pitching — Results</div>
    <table class="cmp-stat-table">${thead}<tbody>
      ${r(
        "Games",
        slots.map((sl) => (sl?.s?.pd ? f(sl.s.pd.games, "int") : NA)),
        "high"
      )}
      ${r(
        "BF",
        slots.map((sl) => (sl?.s?.pd ? f(sl.s.pd.bf, "int") : NA)),
        "high"
      )}
      ${r(
        "Pitches",
        slots.map((sl) => (sl?.s?.pd ? f(sl.s.pd.pitches, "int") : NA)),
        "high"
      )}
      ${r(
        "K",
        slots.map((sl) => (sl?.s?.pd ? f(sl.s.pd.k, "int") : NA)),
        "high"
      )}
      ${r(
        "BB",
        slots.map((sl) => (sl?.s?.pd ? f(sl.s.pd.bb, "int") : NA)),
        "low"
      )}
      ${r(
        "H Allowed",
        slots.map((sl) => (sl?.s?.pd ? f(sl.s.pd.hits, "int") : NA)),
        "low"
      )}
      ${r(
        "Runs",
        slots.map((sl) => (sl?.s?.pd ? f(sl.s.pd.r, "int") : NA)),
        "low"
      )}
      ${r(
        "K/BB",
        slots.map((sl) => {
          const pd = sl?.s?.pd;
          if (!pd) return NA;
          return pd.bb > 0 ? (pd.k / pd.bb).toFixed(2) : pd.k > 0 ? "∞" : NA;
        }),
        "high"
      )}
      ${r(
        "K%",
        slots.map((sl) => f(sl?.s?.pKperBF, "pct")),
        "high",
        slots.map((sl) => _cmpPctile(pctiles.p.kBF, sl?.s?.pKperBF))
      )}
      ${r(
        "BB%",
        slots.map((sl) => f(sl?.s?.pBBperBF, "pct")),
        "low",
        slots.map((sl) => _cmpPctile(pctiles.p.bbBF, sl?.s?.pBBperBF))
      )}
    </tbody></table>

</div>
<div data-cmp-section="pitch-allowed" style="${
      _cmpHiddenSections.has("pitch-allowed") ? "display:none" : ""
    }">
    <div class="cmp-stat-section-head">Pitching — Allowed Batting Lines</div>
    <table class="cmp-stat-table">${thead}<tbody>
      ${r(
        "AVG Against",
        slots.map((sl) => pa(sl, "overall", "avg")),
        "low"
      )}
      ${r(
        "OBP Against",
        slots.map((sl) => pa(sl, "overall", "obp")),
        "low"
      )}
      ${r(
        "SLG Against",
        slots.map((sl) => pa(sl, "overall", "slg")),
        "low"
      )}
      ${r(
        "OPS Against",
        slots.map((sl) => pa(sl, "overall", "ops")),
        "low"
      )}
      ${r(
        "ISO Against",
        slots.map((sl) => pa(sl, "overall", "iso")),
        "low"
      )}
      ${r(
        "K% Against",
        slots.map((sl) => pa(sl, "overall", "kpct")),
        "high"
      )}
      ${r(
        "BB% Against",
        slots.map((sl) => pa(sl, "overall", "bbpct")),
        "low"
      )}
    </tbody></table>
</div>
<div data-cmp-section="pitch-process" style="${
      _cmpHiddenSections.has("pitch-process") ? "display:none" : ""
    }">
    <div class="cmp-stat-section-head">Pitching — Process</div>
    <table class="cmp-stat-table">${thead}<tbody>
      ${r(
        "Strike%",
        slots.map((sl) => f(sl?.s?.pStrikePct, "pct")),
        "high",
        slots.map((sl) => _cmpPctile(pctiles.p.strikePct, sl?.s?.pStrikePct))
      )}
      ${r(
        "Zone%",
        slots.map((sl) => f(sl?.s?.pZonePct, "pct")),
        "high"
      )}
      ${r(
        "Whiff%",
        slots.map((sl) => f(sl?.s?.pWhiffRate, "pct")),
        "high",
        slots.map((sl) => _cmpPctile(pctiles.p.whiffRate, sl?.s?.pWhiffRate))
      )}
      ${r(
        "Chase% (induced)",
        slots.map((sl) => f(sl?.s?.pChaseRate, "pct")),
        "high",
        slots.map((sl) => _cmpPctile(pctiles.p.chaseRate, sl?.s?.pChaseRate))
      )}
      ${r(
        "FPS%",
        slots.map((sl) => f(sl?.s?.pFPSpct, "pct")),
        "high"
      )}
      ${r(
        "2-Strike Whiff%",
        slots.map((sl) => f(sl?.s?.p2StrikeWhiffRate, "pct")),
        "high"
      )}
      ${r(
        "GB%",
        slots.map((sl) => f(sl?.s?.pGBpct, "pct")),
        "high"
      )}
      ${r(
        "LD%",
        slots.map((sl) => f(sl?.s?.pLDpct, "pct")),
        "low"
      )}
      ${r(
        "Avg Velo",
        slots.map((sl) =>
          sl?.s?.pAvgVelo != null ? sl.s.pAvgVelo.toFixed(1) : NA
        ),
        "high"
      )}
      ${r(
        "Max Velo",
        slots.map((sl) =>
          sl?.s?.pMaxVelo != null ? sl.s.pMaxVelo.toFixed(1) : NA
        ),
        "high"
      )}
      ${(() => {
        const typeSet = new Set(
          slots.flatMap((sl) => Object.keys(sl?.s?.pVeloByType || {}))
        );
        return [...typeSet]
          .sort()
          .map((t) =>
            r(
              `Avg Velo (${t})`,
              slots.map((sl) => {
                const v = sl?.s?.pVeloByType?.[t];
                return v != null ? v.toFixed(1) : NA;
              }),
              "high"
            )
          )
          .join("");
      })()}
    </tbody></table>
</div>
<div data-cmp-section="pitch-handedness" style="${
      _cmpHiddenSections.has("pitch-handedness") ? "display:none" : ""
    }">
    <div class="cmp-stat-section-head">Pitching — vs Batter Handedness</div>
    <table class="cmp-stat-table">${thead}<tbody>
      ${r(
        "vs RHB AVG Against",
        slots.map((sl) => pa(sl, "vsRHB", "avg")),
        "low"
      )}
      ${r(
        "vs RHB OBP Against",
        slots.map((sl) => pa(sl, "vsRHB", "obp")),
        "low"
      )}
      ${r(
        "vs RHB SLG Against",
        slots.map((sl) => pa(sl, "vsRHB", "slg")),
        "low"
      )}
      ${r(
        "vs RHB OPS Against",
        slots.map((sl) => pa(sl, "vsRHB", "ops")),
        "low"
      )}
      ${r(
        "vs RHB Strike%",
        slots.map((sl) => ps(sl, "vsRHB", "str")),
        "high"
      )}
      ${r(
        "vs RHB Zone%",
        slots.map((sl) => ps(sl, "vsRHB", "zone")),
        "high"
      )}
      ${r(
        "vs RHB Whiff%",
        slots.map((sl) => ps(sl, "vsRHB", "whiff")),
        "high"
      )}
      ${r(
        "vs RHB FPS%",
        slots.map((sl) => ps(sl, "vsRHB", "fps")),
        "high"
      )}
      ${r(
        "vs LHB AVG Against",
        slots.map((sl) => pa(sl, "vsLHB", "avg")),
        "low"
      )}
      ${r(
        "vs LHB OBP Against",
        slots.map((sl) => pa(sl, "vsLHB", "obp")),
        "low"
      )}
      ${r(
        "vs LHB SLG Against",
        slots.map((sl) => pa(sl, "vsLHB", "slg")),
        "low"
      )}
      ${r(
        "vs LHB OPS Against",
        slots.map((sl) => pa(sl, "vsLHB", "ops")),
        "low"
      )}
      ${r(
        "vs LHB Strike%",
        slots.map((sl) => ps(sl, "vsLHB", "str")),
        "high"
      )}
      ${r(
        "vs LHB Zone%",
        slots.map((sl) => ps(sl, "vsLHB", "zone")),
        "high"
      )}
      ${r(
        "vs LHB Whiff%",
        slots.map((sl) => ps(sl, "vsLHB", "whiff")),
        "high"
      )}
      ${r(
        "vs LHB FPS%",
        slots.map((sl) => ps(sl, "vsLHB", "fps")),
        "high"
      )}
    </tbody></table>

</div>
<div data-cmp-section="pitch-tto" style="${
      _cmpHiddenSections.has("pitch-tto") ? "display:none" : ""
    }">
    <div class="cmp-stat-section-head">Pitching — Times Through Order</div>
    <table class="cmp-stat-table">${thead}<tbody>
      ${r(
        "1st TTO Strike%",
        slots.map((sl) => ps(sl, "tto1", "str")),
        "high"
      )}
      ${r(
        "1st TTO Zone%",
        slots.map((sl) => ps(sl, "tto1", "zone")),
        "high"
      )}
      ${r(
        "1st TTO Whiff%",
        slots.map((sl) => ps(sl, "tto1", "whiff")),
        "high"
      )}
      ${r(
        "2nd TTO Strike%",
        slots.map((sl) => ps(sl, "tto2", "str")),
        "high"
      )}
      ${r(
        "2nd TTO Zone%",
        slots.map((sl) => ps(sl, "tto2", "zone")),
        "high"
      )}
      ${r(
        "2nd TTO Whiff%",
        slots.map((sl) => ps(sl, "tto2", "whiff")),
        "high"
      )}
      ${r(
        "3rd TTO+ Strike%",
        slots.map((sl) => ps(sl, "tto3", "str")),
        "high"
      )}
      ${r(
        "3rd TTO+ Zone%",
        slots.map((sl) => ps(sl, "tto3", "zone")),
        "high"
      )}
      ${r(
        "3rd TTO+ Whiff%",
        slots.map((sl) => ps(sl, "tto3", "whiff")),
        "high"
      )}
    </tbody></table>
</div>
<div data-cmp-section="pitch-situational" style="${
      _cmpHiddenSections.has("pitch-situational") ? "display:none" : ""
    }">
    <div class="cmp-stat-section-head">Pitching — Situational</div>
    <table class="cmp-stat-table">${thead}<tbody>
      ${r(
        "Home Strike%",
        slots.map((sl) => ps(sl, "home", "str")),
        "high"
      )}
      ${r(
        "Home Whiff%",
        slots.map((sl) => ps(sl, "home", "whiff")),
        "high"
      )}
      ${r(
        "Home Zone%",
        slots.map((sl) => ps(sl, "home", "zone")),
        "high"
      )}
      ${r(
        "Away Strike%",
        slots.map((sl) => ps(sl, "away", "str")),
        "high"
      )}
      ${r(
        "Away Whiff%",
        slots.map((sl) => ps(sl, "away", "whiff")),
        "high"
      )}
      ${r(
        "Away Zone%",
        slots.map((sl) => ps(sl, "away", "zone")),
        "high"
      )}
      ${r(
        "Bases Empty Strike%",
        slots.map((sl) => ps(sl, "basesEmpty", "str")),
        "high"
      )}
      ${r(
        "Bases Empty Whiff%",
        slots.map((sl) => ps(sl, "basesEmpty", "whiff")),
        "high"
      )}
      ${r(
        "Runners On Strike%",
        slots.map((sl) => ps(sl, "runnersOn", "str")),
        "high"
      )}
      ${r(
        "Runners On Whiff%",
        slots.map((sl) => ps(sl, "runnersOn", "whiff")),
        "high"
      )}
      ${r(
        "RISP Strike%",
        slots.map((sl) => ps(sl, "risp", "str")),
        "high"
      )}
      ${r(
        "RISP Whiff%",
        slots.map((sl) => ps(sl, "risp", "whiff")),
        "high"
      )}
      ${r(
        "0 Outs Strike%",
        slots.map((sl) => ps(sl, "out0", "str")),
        "high"
      )}
      ${r(
        "1 Out Strike%",
        slots.map((sl) => ps(sl, "out1", "str")),
        "high"
      )}
      ${r(
        "2 Outs Strike%",
        slots.map((sl) => ps(sl, "out2", "str")),
        "high"
      )}
      ${r(
        "2 Outs Whiff%",
        slots.map((sl) => ps(sl, "out2", "whiff")),
        "high"
      )}
    </tbody></table>
</div>
<div data-cmp-section="pitch-count" style="${
      _cmpHiddenSections.has("pitch-count") ? "display:none" : ""
    }">
    <div class="cmp-stat-section-head">Pitching — Count Splits</div>
    <table class="cmp-stat-table">${thead}<tbody>
      ${r(
        "First Pitch Strike%",
        slots.map((sl) => ps(sl, "firstPitch", "str")),
        "high"
      )}
      ${r(
        "Ahead Strike%",
        slots.map((sl) => ps(sl, "ahead", "str")),
        "high"
      )}
      ${r(
        "Ahead Zone%",
        slots.map((sl) => ps(sl, "ahead", "zone")),
        "high"
      )}
      ${r(
        "Ahead Whiff%",
        slots.map((sl) => ps(sl, "ahead", "whiff")),
        "high"
      )}
      ${r(
        "Behind Strike%",
        slots.map((sl) => ps(sl, "behind", "str")),
        "high"
      )}
      ${r(
        "Behind Zone%",
        slots.map((sl) => ps(sl, "behind", "zone")),
        "high"
      )}
      ${r(
        "Behind Whiff%",
        slots.map((sl) => ps(sl, "behind", "whiff")),
        "high"
      )}
      ${r(
        "2-Strike Whiff%",
        slots.map((sl) => ps(sl, "twoStrike", "whiff")),
        "high"
      )}
      ${r(
        "2-Strike Chase%",
        slots.map((sl) => ps(sl, "twoStrike", "chase")),
        "high"
      )}
      ${r(
        "Full Count Strike%",
        slots.map((sl) => ps(sl, "fullCount", "str")),
        "high"
      )}
      ${r(
        "Full Count Whiff%",
        slots.map((sl) => ps(sl, "fullCount", "whiff")),
        "high"
      )}
    </tbody></table>
</div>`;
  }

  // ── BATTING SECTION ───────────────────────────────────────────
  let battingSection = "";
  if (showBatting) {
    battingSection = `
<div data-cmp-section="bat-standard" style="${
      _cmpHiddenSections.has("bat-standard") ? "display:none" : ""
    }">
    <div class="cmp-stat-section-head">Batting — Standard</div>
    <table class="cmp-stat-table">${thead}<tbody>
      ${r(
        "Games",
        slots.map((sl) => f(sl?.s?.games, "int")),
        "high"
      )}
      ${r(
        "PA",
        slots.map((sl) => f(sl?.s?.pa, "int")),
        "high"
      )}
      ${r(
        "AB",
        slots.map((sl) => f(sl?.s?.ab, "int")),
        "high"
      )}
      ${r(
        "R",
        slots.map((sl) => f(sl?.s?.r, "int")),
        "high"
      )}
      ${r(
        "H",
        slots.map((sl) => f(sl?.s?.hits, "int")),
        "high"
      )}
      ${r(
        "2B",
        slots.map((sl) => f(sl?.s?.doubles, "int")),
        "high"
      )}
      ${r(
        "3B",
        slots.map((sl) => f(sl?.s?.triples, "int")),
        "high"
      )}
      ${r(
        "HR",
        slots.map((sl) => f(sl?.s?.hr, "int")),
        "high"
      )}
      ${r(
        "RBI",
        slots.map((sl) => f(sl?.s?.rbi, "int")),
        "high"
      )}
      ${r(
        "BB",
        slots.map((sl) => f(sl?.s?.bb, "int")),
        "high"
      )}
      ${r(
        "K",
        slots.map((sl) => f(sl?.s?.k, "int")),
        "low"
      )}
      ${r(
        "HBP",
        slots.map((sl) => f(sl?.s?.hbp, "int")),
        "none"
      )}
      ${r(
        "SB",
        slots.map((sl) => f(sl?.s?.sb, "int")),
        "high"
      )}
      ${r(
        "CS",
        slots.map((sl) => f(sl?.s?.cs, "int")),
        "low"
      )}
      ${r(
        "SB%",
        slots.map((sl) => {
          const sb = sl?.s?.sb || 0,
            cs = sl?.s?.cs || 0,
            att = sb + cs;
          return att > 0 ? f(sb / att, "pct") : NA;
        }),
        "high"
      )}
    </tbody></table>
</div>
<div data-cmp-section="bat-rate" style="${
      _cmpHiddenSections.has("bat-rate") ? "display:none" : ""
    }">
    <div class="cmp-stat-section-head">Batting — Rate Stats</div>
    <table class="cmp-stat-table">${thead}<tbody>
      ${r(
        "AVG",
        slots.map((sl) => f(sl?.s?.avg, "rate")),
        "high",
        slots.map((sl) => _cmpPctile(pctiles.b.avg, sl?.s?.avg))
      )}
      ${r(
        "OBP",
        slots.map((sl) => f(sl?.s?.obp, "rate")),
        "high",
        slots.map((sl) => _cmpPctile(pctiles.b.obp, sl?.s?.obp))
      )}
      ${r(
        "SLG",
        slots.map((sl) => f(sl?.s?.slg, "rate")),
        "high",
        slots.map((sl) => _cmpPctile(pctiles.b.slg, sl?.s?.slg))
      )}
      ${r(
        "OPS",
        slots.map((sl) => f(sl?.s?.ops, "rate")),
        "high",
        slots.map((sl) => _cmpPctile(pctiles.b.ops, sl?.s?.ops))
      )}
      ${r(
        "ISO",
        slots.map((sl) => f(sl?.s?.iso, "rate")),
        "high",
        slots.map((sl) => _cmpPctile(pctiles.b.iso, sl?.s?.iso))
      )}
      ${r(
        "BABIP",
        slots.map((sl) => f(sl?.s?.babip, "rate")),
        "high",
        slots.map((sl) => _cmpPctile(pctiles.b.babip, sl?.s?.babip))
      )}
      ${r(
        "K%",
        slots.map((sl) => f(sl?.s?.kpct, "pct")),
        "low",
        slots.map((sl) => _cmpPctile(pctiles.b.kpct, sl?.s?.kpct))
      )}
      ${r(
        "BB%",
        slots.map((sl) => f(sl?.s?.bbpct, "pct")),
        "high",
        slots.map((sl) => _cmpPctile(pctiles.b.bbpct, sl?.s?.bbpct))
      )}
    </tbody></table>
</div>
<div data-cmp-section="fielding" style="${
      _cmpHiddenSections.has("fielding") ? "display:none" : ""
    }">
    <div class="cmp-stat-section-head">Fielding</div>
    <table class="cmp-stat-table">${thead}<tbody>
      ${r(
        "PO",
        slots.map((sl) => f(sl?.s?.fielding?.po, "int")),
        "high"
      )}
      ${r(
        "A",
        slots.map((sl) => f(sl?.s?.fielding?.a, "int")),
        "high"
      )}
      ${r(
        "E",
        slots.map((sl) => f(sl?.s?.fielding?.e, "int")),
        "low"
      )}
      ${r(
        "TC",
        slots.map((sl) => f(sl?.s?.fielding?.tc, "int")),
        "high"
      )}
      ${r(
        "FPCT",
        slots.map((sl) =>
          sl?.s?.fielding?.fpct != null ? _fmtRate(sl.s.fielding.fpct) : NA
        ),
        "high"
      )}
    </tbody></table>
</div>
<div data-cmp-section="bat-process" style="${
      _cmpHiddenSections.has("bat-process") ? "display:none" : ""
    }">
    <div class="cmp-stat-section-head">Batting — Process</div>
    <table class="cmp-stat-table">${thead}<tbody>
      ${r(
        "Contact%",
        slots.map((sl) => f(sl?.s?.contactRate, "pct")),
        "high"
      )}
      ${r(
        "Whiff%",
        slots.map((sl) => f(sl?.s?.whiffRate, "pct")),
        "low"
      )}
      ${r(
        "Chase% (O-Swing)",
        slots.map((sl) => f(sl?.s?.chaseRate, "pct")),
        "low"
      )}
      ${r(
        "Zone Swing%",
        slots.map((sl) => f(sl?.s?.zoneSwingRate, "pct")),
        "high"
      )}
      ${r(
        "Overall Swing%",
        slots.map((sl) => f(sl?.s?.swingRate, "pct")),
        "none"
      )}
      ${r(
        "K%",
        slots.map((sl) => f(sl?.s?.kpct, "pct")),
        "low",
        slots.map((sl) => _cmpPctile(pctiles.b.kpct, sl?.s?.kpct))
      )}
      ${r(
        "BB%",
        slots.map((sl) => f(sl?.s?.bbpct, "pct")),
        "high",
        slots.map((sl) => _cmpPctile(pctiles.b.bbpct, sl?.s?.bbpct))
      )}
      ${r(
        "ISO",
        slots.map((sl) => f(sl?.s?.iso, "rate")),
        "high",
        slots.map((sl) => _cmpPctile(pctiles.b.iso, sl?.s?.iso))
      )}
      ${r(
        "BABIP",
        slots.map((sl) => f(sl?.s?.babip, "rate")),
        "high",
        slots.map((sl) => _cmpPctile(pctiles.b.babip, sl?.s?.babip))
      )}
      ${r(
        "Avg Velo Faced",
        slots.map((sl) =>
          sl?.s?.avgVeloFaced != null ? sl.s.avgVeloFaced.toFixed(1) : NA
        ),
        "none"
      )}
    </tbody></table>
</div>
<div data-cmp-section="bat-ball" style="${
      _cmpHiddenSections.has("bat-ball") ? "display:none" : ""
    }">
    <div class="cmp-stat-section-head">Batted Ball Profile</div>
    <table class="cmp-stat-table">${thead}<tbody>
      ${r(
        "GB%",
        slots.map((sl) => f(sl?.s?.bGBpct, "pct")),
        "none"
      )}
      ${r(
        "LD%",
        slots.map((sl) => f(sl?.s?.bLDpct, "pct")),
        "high"
      )}
      ${r(
        "FB%",
        slots.map((sl) => f(sl?.s?.bFBpct, "pct")),
        "none"
      )}
    </tbody></table>
</div>`;

    // ── SPLITS SECTION ──
    const hasSplitData = slots.some(
      (sl) => sl?.s?.splits && Object.values(sl.s.splits).some(Boolean)
    );
    if (hasSplitData) {
      // Helper to derive rate stats from a _sumStats object
      const fmtSplitStat = (st, metric) => {
        if (!st || st.pa === 0) return NA;
        if (metric === "pa") return Math.round(st.pa).toString();
        if (metric === "avg") return st.ab > 0 ? _fmtRate(st.h / st.ab) : NA;
        if (metric === "obp") {
          const o = st.pa > 0 ? (st.h + st.bb + st.hbp) / st.pa : null;
          return o !== null ? _fmtRate(o) : NA;
        }
        if (metric === "slg") return st.ab > 0 ? _fmtRate(st.tb / st.ab) : NA;
        if (metric === "ops") {
          const o = st.pa > 0 ? (st.h + st.bb + st.hbp) / st.pa : null;
          const sg = st.ab > 0 ? st.tb / st.ab : null;
          return o !== null && sg !== null ? _fmtRate(o + sg) : NA;
        }
        if (metric === "iso")
          return st.ab > 0 ? _fmtRate((st.tb - st.h) / st.ab) : NA;
        if (metric === "kpct") return st.pa > 0 ? f(st.k / st.pa, "pct") : NA;
        if (metric === "bbpct") return st.pa > 0 ? f(st.bb / st.pa, "pct") : NA;
        return NA;
      };

      const splitCats = [
        { key: "vsLHP", label: "vs LHP" },
        { key: "vsRHP", label: "vs RHP" },
        { key: "home", label: "Home" },
        { key: "away", label: "Away" },
        { key: "risp", label: "RISP" },
        { key: "basesEmpty", label: "Bases Empty" },
        { key: "aheadCount", label: "Ahead in Count" },
        { key: "behindCount", label: "Behind in Count" },
        { key: "twoStrike", label: "2-Strike" },
      ];

      // Sub-header style for each split context
      const splitSubHead = (lbl) =>
        `<tr><td colspan="${
          N + 1
        }" style="font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--text3);padding:10px 0 4px;border-bottom:none">${lbl}</td></tr>`;

      const splitMetrics = [
        { key: "pa", label: "PA", dir: "high" },
        { key: "avg", label: "AVG", dir: "high" },
        { key: "obp", label: "OBP", dir: "high" },
        { key: "slg", label: "SLG", dir: "high" },
        { key: "ops", label: "OPS", dir: "high" },
        { key: "iso", label: "ISO", dir: "high" },
        { key: "kpct", label: "K%", dir: "low" },
        { key: "bbpct", label: "BB%", dir: "high" },
      ];

      const splitRows = splitCats
        .map(({ key, label }) => {
          const anyHasData = slots.some((sl) => sl?.s?.splits?.[key] != null);
          if (!anyHasData) return "";
          const metricRows = splitMetrics
            .map(({ key: mk, label: ml, dir }) =>
              r(
                ml,
                slots.map((sl) => fmtSplitStat(sl?.s?.splits?.[key], mk)),
                dir
              )
            )
            .join("");
          return splitSubHead(label) + metricRows;
        })
        .join("");

      battingSection += `
<div data-cmp-section="splits" style="${
        _cmpHiddenSections.has("splits") ? "display:none" : ""
      }">
    <div class="cmp-stat-section-head">Splits</div>
    <table class="cmp-stat-table">${thead}<tbody>
      ${splitRows}
    </tbody></table>
</div>`;
    }
  }

  // If pitcher comparison: pitching first, batting after (if any)
  const isPitcherComp = !showBatting || slots.every((sl) => sl?.isPitcher);
  return isPitcherComp
    ? pitchSection + battingSection
    : battingSection + pitchSection;
}

function toggleRecentFilter() {
  _recentFilter = !_recentFilter;
  const v = currentView;
  if (v && v.type === "pitcher") {
    renderPitcher(v.data.team, v.data.name);
    if (_lastPitcherTab) setTimeout(() => pitcherTab(_lastPitcherTab), 0);
  } else if (v && v.type === "player") {
    renderPlayer(v.data.team, v.data.name);
    if (_lastPlayerTab) setTimeout(() => playerTab(_lastPlayerTab), 0);
  }
}

function setSeasonFilter(year) {
  _seasonFilter = year || null;
  const v = currentView;
  if (v) showView(v.type, v.data, true);
  else renderSidebar();
}

function buildSeasonFilterBar() {
  if (!_availableSeasons.length) return "";
  const pills = [
    `<button class="sfb-pill${!_seasonFilter ? " sfb-active" : ""}" onclick="setSeasonFilter(null)">All</button>`,
    ..._availableSeasons.map(
      (y) =>
        `<button class="sfb-pill${_seasonFilter === y ? " sfb-active" : ""}" onclick="setSeasonFilter('${y}')">${y}</button>`
    ),
  ].join("");
  return `<div class="season-filter-bar"><span class="sfb-label">Season</span>${pills}</div>`;
}

function reRenderScoutingReport(type, teamName, playerName) {
  _scoutRecentFilter = !_scoutRecentFilter;
  const allGames = getTeamGames(teamName);
  const names = _nameAliases[playerName] || new Set([playerName]);
  const n = type === "hitter" ? 5 : 3;
  const games = _scoutRecentFilter
    ? [...allGames]
        .sort((a, b) => b.date.localeCompare(a.date))
        .filter((g) =>
          type === "hitter"
            ? (g.pitchLog || []).some((p) => names.has(p.batter))
            : (g.pitchLog || []).some(
                (p) => p.pitcherTeam === teamName && names.has(p.pitcher)
              )
        )
        .slice(0, n)
    : allGames;
  const html =
    type === "hitter"
      ? buildHitterScoutingReport(teamName, playerName, games)
      : buildPitcherScoutingReport(teamName, playerName, games);
  const el =
    document.getElementById("ptab-scouting-content") ||
    document.getElementById("ptab-p-scouting-content") ||
    document.getElementById("scout-report-content");
  if (el) el.innerHTML = html;
}

function renderCompare() {
  const c = document.getElementById("hub-content");
  const allSlotDefs = [_cmpSlot1, _cmpSlot2, _cmpSlot3];
  const slotDefs =
    allSlotDefs.filter(Boolean).length >= 1 ? allSlotDefs : [null, null];
  // Build stats for filled slots
  const slotData = slotDefs.map((sd) =>
    sd
      ? {
          s: _cmpBuildStats(sd.team, sd.name),
          isPitcher: sd.isPitcher || false,
        }
      : null
  );

  // Build league percentiles once (only when at least one slot filled)
  const hasAny = slotData.some((sd) => sd !== null);
  const pctiles = hasAny ? _cmpBuildLeaguePctiles() : { b: {}, p: {} };
  const f = _cmpFmt;

  function miniStat(val, lbl) {
    return `<div class="cmp-mini-stat"><div class="cmp-mini-val">${val}</div><div class="cmp-mini-lbl">${lbl}</div></div>`;
  }

  function slotHTML(sd, slotNum) {
    if (!sd)
      return `<div class="cmp-slot" onclick="compareOpenPicker(${slotNum})" style="align-items:center;justify-content:center;gap:6px;min-height:120px">
      <div style="font-size:22px;opacity:.2">👤</div>
      <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:var(--text3)">+ Add Player ${slotNum}</div>
    </div>`;
    const { s, isPitcher } = sd;
    const hasBat = s.ab > 0;
    const hasPit = s.pd && s.pd.pitches > 0;
    // For pitchers, prefer pd.num (from pitcher data) over s.num (from batter data)
    const displayNum = isPitcher
      ? (s.pd && s.pd.num) || (s.num !== "—" ? s.num : null) || "—"
      : s.num || "—";
    const numColor = "var(--accent)";
    const badge = isPitcher
      ? s.pos && s.pos !== "—"
        ? escHtml(s.pos)
        : "P"
      : s.pos && s.pos !== "—"
      ? escHtml(s.pos)
      : "BAT";
    let statsGrid;
    if (isPitcher && hasPit) {
      statsGrid = [
        miniStat(f(s.pStrikePct, "pct"), "Strike%"),
        miniStat(f(s.pKperBF, "pct"), "K%"),
        miniStat(f(s.pBBperBF, "pct"), "BB%"),
        miniStat(f(s.pWhiffRate, "pct"), "Whiff%"),
        miniStat(f(s.pChaseRate, "pct"), "Chase%"),
        miniStat(f(s.pZonePct, "pct"), "Zone%"),
        miniStat(f(s.pFPSpct, "pct"), "FPS%"),
        miniStat(s.pAvgVelo != null ? s.pAvgVelo.toFixed(1) : "—", "Avg Velo"),
      ].join("");
    } else if (hasBat) {
      statsGrid = [
        miniStat(f(s.avg, "rate"), "AVG"),
        miniStat(f(s.obp, "rate"), "OBP"),
        miniStat(f(s.slg, "rate"), "SLG"),
        miniStat(f(s.ops, "rate"), "OPS"),
        miniStat(f(s.kpct, "pct"), "K%"),
        miniStat(f(s.bbpct, "pct"), "BB%"),
        miniStat(f(s.iso, "rate"), "ISO"),
        miniStat(f(s.contactRate, "pct"), "Contact%"),
      ].join("");
    } else {
      statsGrid = `<div style="grid-column:1/-1;font-size:10px;color:var(--text3);text-align:center;padding:8px 0">No data</div>`;
    }
    return `<div class="cmp-slot cmp-slot-filled">
      <div class="cmp-slot-toprow">
<div class="cmp-slot-num" style="color:${numColor}">#${escHtml(
      displayNum
    )}</div>
<div class="cmp-slot-badge">${badge}</div>
      </div>
      <div class="cmp-slot-name">${escHtml(s.name)}</div>
      <div class="cmp-slot-team">${escHtml(s.team)}</div>
      <div class="cmp-slot-stats-grid">${statsGrid}</div>
      <div class="cmp-slot-meta">${s.games}G · ${
      isPitcher && hasPit ? s.pd.pitches + " pitches" : s.pa + " PA"
    }</div>
      <div class="cmp-slot-change" onclick="event.stopPropagation();compareOpenPicker(${slotNum})">change</div>
    </div>`;
  }

  const filledSlots = slotData.filter(Boolean);
  const statsHTML =
    filledSlots.length >= 1
      ? _cmpStatsHTML(
          slotData.map((sd, i) => (sd ? { ...sd } : null)),
          pctiles
        )
      : `<div style="text-align:center;padding:40px 20px;color:var(--text3);font-family:'Barlow Condensed',sans-serif;font-size:15px">Pick players above to compare</div>`;

  const slotsHTML = slotData.map((sd, i) => slotHTML(sd, i + 1)).join("");

  const hasPitcher = filledSlots.some(
    (sl) => sl?.isPitcher || sl?.s?.pd?.pitches > 0
  );
  const hasBatter = filledSlots.some((sl) => (sl?.s?.ab || 0) > 0);
  const pitcherPills = hasPitcher
    ? [
        ["pitch-traditional", "Traditional"],
        ["pitch-results", "Results"],
        ["pitch-allowed", "Allowed Lines"],
        ["pitch-process", "Process"],
        ["pitch-handedness", "vs Hand"],
        ["pitch-tto", "TTO"],
        ["pitch-situational", "Situational"],
        ["pitch-count", "Count Splits"],
      ]
    : [];
  const batterPills = hasBatter
    ? [
        ["bat-standard", "Batting"],
        ["bat-rate", "Rate Stats"],
        ["fielding", "Fielding"],
        ["bat-process", "Bat Process"],
        ["bat-ball", "Batted Ball"],
        ["splits", "Splits"],
      ]
    : [];
  const allPills = [...pitcherPills, ...batterPills];
  const filterBar =
    filledSlots.length >= 1 && allPills.length > 0
      ? `<div class="cmp-filter-bar"><span class="cmp-filter-label">Sections:</span>${allPills
          .map(
            ([key, label]) =>
              `<button class="cmp-filter-pill${
                _cmpHiddenSections.has(key) ? " cmp-filter-pill--off" : ""
              }" data-cmp-filter="${key}" onclick="toggleCmpSection('${key}')">${label}</button>`
          )
          .join("")}</div>`
      : "";

  c.innerHTML = `
    <div class="page-header"><div><div class="page-title">Compare Players</div><div class="page-sub">Up to 3 players · rate stats + percentile rankings</div></div></div>
    <div class="cmp-slots">${slotsHTML}</div>
    ${filterBar}
    ${statsHTML}`;
}

function compareOpenPicker(slot) {
  _cmpPickerSlot = slot;
  _cmpPickerTeam = null;
  const overlay = document.getElementById("cmp-picker-overlay");
  const sheet = document.getElementById("cmp-picker-sheet");
  const title = document.getElementById("cmp-picker-title");
  if (!overlay || !sheet) return;
  if (title) title.textContent = "Pick Player " + slot;
  overlay.style.display = "block";
  requestAnimationFrame(() => sheet.classList.add("open"));
  _cmpRenderPickerTeams();
}

function _cmpRenderPickerTeams() {
  const teamsEl = document.getElementById("cmp-picker-teams");
  if (!teamsEl) return;
  const myTN = (function () {
    try {
      const ni = document.getElementById("myteam-name-input");
      if (ni && ni.value.trim()) return ni.value.trim();
      return window._myTeamNameCache || null;
    } catch (e) {
      return null;
    }
  })();
  const teams = [];
  if (myTN && myTeamRoster && myTeamRoster.length > 0) teams.push(myTN);
  allTeams.forEach((t) => {
    if (t !== myTN) teams.push(t);
  });
  teamsEl.innerHTML = teams
    .map(
      (t) =>
        `<button class="cmp-picker-team-btn${
          _cmpPickerTeam === t ? " active" : ""
        }" onclick="comparePickerSelectTeam('${escAttr(t)}')">${escHtml(
          t
        )}</button>`
    )
    .join("");
  if (!_cmpPickerTeam && teams.length > 0) comparePickerSelectTeam(teams[0]);
  else if (_cmpPickerTeam) _cmpRenderPickerPlayers(_cmpPickerTeam);
}

function comparePickerSelectTeam(team) {
  _cmpPickerTeam = team;
  const teamsEl = document.getElementById("cmp-picker-teams");
  if (teamsEl) {
    teamsEl.querySelectorAll(".cmp-picker-team-btn").forEach((b) => {
      b.classList.toggle("active", b.textContent === team);
    });
  }
  _cmpRenderPickerPlayers(team);
}

function _cmpRenderPickerPlayers(team) {
  const el = document.getElementById("cmp-picker-players");
  if (!el) return;
  const games = getTeamGames(team);
  const batters = getTeamRoster(team, games).sort((a, b) =>
    (a.name || "").localeCompare(b.name || "")
  );
  const pitchers = getTeamPitchers(team, games).sort((a, b) =>
    (a.name || "").localeCompare(b.name || "")
  );
  let html = "";
  if (batters.length > 0) {
    html += `<div class="cmp-picker-role-label">Batters</div>`;
    html += batters
      .map(
        (p) =>
          `<div class="cmp-picker-player-row" onclick="comparePick('${escAttr(
            team
          )}','${escAttr(p.name)}',false)">
        <div class="cmp-picker-player-num">#${escHtml(p.num || "—")}</div>
        <div class="cmp-picker-player-info">
          <div class="cmp-picker-player-name">${escHtml(p.name)}</div>
          <div class="cmp-picker-player-meta">${escHtml(p.pos || "—")} · ${
            p.games
          } G · ${p.ab > 0 ? _fmtRate(p.hits / p.ab) : ".---"} AVG</div>
        </div>
      </div>`
      )
      .join("");
  }
  if (pitchers.length > 0) {
    html += `<div class="cmp-picker-role-label">Pitchers</div>`;
    html += pitchers
      .map(
        (p) =>
          `<div class="cmp-picker-player-row" onclick="comparePick('${escAttr(
            team
          )}','${escAttr(p.name)}',true)">
        <div class="cmp-picker-player-num" style="color:var(--blue)">#${escHtml(
          p.num || "—"
        )}</div>
        <div class="cmp-picker-player-info">
          <div class="cmp-picker-player-name">${escHtml(p.name)}</div>
          <div class="cmp-picker-player-meta">${escHtml(p.hand || "R")}HP · ${
            p.games
          } G · ${p.pitches} pitches</div>
        </div>
      </div>`
      )
      .join("");
  }
  if (!html)
    html = `<div style="padding:20px;text-align:center;color:var(--text3);font-family:'Barlow Condensed',sans-serif">No players found for ${escHtml(
      team
    )}</div>`;
  el.innerHTML = html;
}

function comparePick(team, name, isPitcher) {
  if (_cmpPickerSlot === 1) _cmpSlot1 = { team, name, isPitcher };
  else if (_cmpPickerSlot === 2) _cmpSlot2 = { team, name, isPitcher };
  else _cmpSlot3 = { team, name, isPitcher };
  compareCancelPicker();
  renderCompare();
}

function compareCancelPicker() {
  const overlay = document.getElementById("cmp-picker-overlay");
  const sheet = document.getElementById("cmp-picker-sheet");
  if (!sheet) return;
  sheet.classList.remove("open");
  setTimeout(() => {
    if (overlay) overlay.style.display = "none";
  }, 260);
}

// ===== VIEWS =====
let _hubTab = null; // 'myteam' | 'opponents' | 'history' | 'compare'
let _lastPlayerTab = "spray";
let _lastPitcherTab = "zone";
let _recentFilter = false; // toggles last-3-games (pitcher) / last-5-games (hitter) filter
let _scoutRecentFilter = false; // toggles last-N-games filter on scouting reports specifically
let _seasonFilter = null;   // null = all time, "2025" = just that calendar year
let _availableSeasons = []; // populated from allGames dates in hubRefreshAll
let _expandedSeasonEdit = null; // id of season whose edit panel is open, or null
let _newSeasonPanel = null;    // id of season whose "start new season" panel is open, or null
let _cmpSlot1 = null; // {team, name, isPitcher} or null
let _cmpSlot2 = null;
let _cmpSlot3 = null;
let _cmpPickerSlot = 1;
let _cmpPickerTeam = null;
let _cmpHiddenSections = new Set(); // keys of sections currently hidden in compare view

function toggleCmpSection(key) {
  if (_cmpHiddenSections.has(key)) _cmpHiddenSections.delete(key);
  else _cmpHiddenSections.add(key);
  const el = document.querySelector(`[data-cmp-section="${key}"]`);
  if (el) el.style.display = _cmpHiddenSections.has(key) ? "none" : "";
  const btn = document.querySelector(`[data-cmp-filter="${key}"]`);
  if (btn)
    btn.classList.toggle("cmp-filter-pill--off", _cmpHiddenSections.has(key));
}

function showView(type, data, preserveTab) {
  // data may be a JSON string (from onclick attributes) or an object
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch (e) {}
  }
  currentView = { type, data };
  // Push deep route URL (suppressed during popstate handling)
  if (typeof _ptPushDeepRoute === "function")
    _ptPushDeepRoute(type, data, null);
  // Reset multi-select state when leaving the all-games view
  if (type !== "games" && _ghSelectMode) {
    _ghSelectMode = false;
    window._ghSelectMode = false;
    _ghSelected.clear();
  }
  // Reset team select mode when navigating anywhere
  if (_tsSelectMode) {
    _tsSelectMode = false;
    window._tsSelectMode = false;
    _tsSelected.clear();
  }
  document.getElementById("hub-welcome").style.display = "none";
  document.getElementById("hub-content").style.display = "block";
  renderSidebar();
  // Reset recent filter when navigating to a new player/pitcher
  if (type === "player" || type === "pitcher") {
    _recentFilter = false;
    _scoutRecentFilter = false;
  }
  if (type === "games") renderAllGames();
  else if (type === "team") renderTeam(data);
  else if (type === "player") {
    renderPlayer(data.team, data.name);
    if (preserveTab && _lastPlayerTab)
      setTimeout(() => playerTab(_lastPlayerTab), 0);
  } else if (type === "pitcher") {
    renderPitcher(data.team, data.name);
    if (preserveTab && _lastPitcherTab)
      setTimeout(() => pitcherTab(_lastPitcherTab), 0);
  } else if (type === "game") renderGame(data);
  else if (type === "compare") renderCompare();
}

// ===== HUB TAB NAVIGATION =====
function _getMyTeamName() {
  try {
    const ni = document.getElementById("myteam-name-input");
    if (ni && ni.value.trim()) return ni.value.trim();
    return window._myTeamNameCache || null;
  } catch (e) {
    return null;
  }
}

function hubSetTab(tab) {
  _hubTab = tab;
  const app = document.getElementById("hub-app");
  if (app) app.dataset.hubtab = tab;
  ["myteam", "opponents", "history", "compare", "seasons"].forEach(function (t) {
    const el = document.getElementById("htab-" + t);
    if (el) el.classList.toggle("active", t === tab);
  });
  if (tab === "myteam") {
    const name = _getMyTeamName();
    if (name) showView("team", name);
    else {
      currentView = null;
      document.getElementById("hub-welcome").style.display = "block";
      document.getElementById("hub-content").style.display = "none";
      renderSidebar();
    }
  } else if (tab === "opponents") {
    const myName = _getMyTeamName();
    if (
      currentView &&
      currentView.type === "team" &&
      currentView.data !== myName
    ) {
      showView("team", currentView.data);
    } else {
      renderOpponentsWelcome();
    }
  } else if (tab === "history") {
    showView("games");
  } else if (tab === "compare") {
    showView("compare");
  } else if (tab === "seasons") {
    renderSeasonHistory();
  }
}

function renderOpponentsWelcome() {
  currentView = null;
  document.getElementById("hub-welcome").style.display = "none";
  const c = document.getElementById("hub-content");
  c.style.display = "block";
  renderSidebar();
  const myName = _getMyTeamName();

  // When a season filter is active, restrict to teams played that year
  let seasonTeams = null;
  if (_seasonFilter) {
    seasonTeams = new Set(
      allGames
        .filter((g) => g.date && g.date.slice(0, 4) === _seasonFilter)
        .flatMap((g) => [g.awayTeam, g.homeTeam].filter(Boolean))
    );
  }

  const opponents = allTeams.filter(
    (t) => t !== myName && (!seasonTeams || seasonTeams.has(t))
  );
  if (!opponents.length) {
    const emptyMsg = _seasonFilter
      ? `No opponents found for ${_seasonFilter}.`
      : "No opponent data yet.<br>Games you track will appear here.";
    c.innerHTML = `<div class="page-header"><div><div class="page-title">Opponents</div>${_seasonFilter ? `<div class="page-sub">${_seasonFilter}</div>` : ""}</div></div>
      <div class="empty-state"><div class="empty-icon"></div>${emptyMsg}</div>`;
    return;
  }
  const f = (v, type) => {
    if (v == null || isNaN(v)) return "—";
    if (type === "rate")
      return v >= 1
        ? v.toFixed(3)
        : "." + String(Math.round(v * 1000)).padStart(3, "0");
    if (type === "era") return v.toFixed(2);
    return String(Math.round(v));
  };

  // Compute per-team stats first so we can derive league averages for color-coding
  const teamStats = opponents.map((t) => {
    const games = getTeamGames(t);
    const rec = getTeamRecord(t, games);
    const batters = getTeamRoster(t, games);
    const pitchers = getTeamPitchers(t, games);
    let tAB = 0,
      tH = 0,
      tBB = 0,
      tHBP = 0,
      t2B = 0,
      t3B = 0,
      tHR = 0;
    batters.forEach((b) => {
      tAB += b.ab || 0;
      tH += b.hits || 0;
      tBB += b.bb || 0;
      tHBP += b.hbp || 0;
      t2B += b.doubles || 0;
      t3B += b.triples || 0;
      tHR += b.hr || 0;
    });
    const avg = tAB > 0 ? tH / tAB : null;
    const obp =
      tAB + tBB + tHBP > 0 ? (tH + tBB + tHBP) / (tAB + tBB + tHBP) : null;
    const slg =
      tAB > 0
        ? (tH - t2B - t3B - tHR + t2B * 2 + t3B * 3 + tHR * 4) / tAB
        : null;
    const ops = obp != null && slg != null ? obp + slg : null;
    let pOuts = 0,
      pR = 0,
      pK = 0;
    pitchers.forEach((p) => {
      pOuts += p.outs || 0;
      pR += p.r || 0;
      pK += p.k || 0;
    });
    const era = pOuts > 0 ? (pR / (pOuts / 3)) * 9 : null;
    return { t, games, rec, avg, obp, ops, era, tHR, pK };
  });

  // League averages (only teams with data for each stat)
  const leagueAvg = (key) => {
    const vals = teamStats
      .map((s) => s[key])
      .filter((v) => v != null && !isNaN(v));
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  const lgAVG = leagueAvg("avg"),
    lgOBP = leagueAvg("obp"),
    lgOPS = leagueAvg("ops"),
    lgERA = leagueAvg("era"),
    lgHR = leagueAvg("tHR"),
    lgK = leagueAvg("pK");

  // Returns inline style string: red=good, blue=bad, relative to league avg
  const sc = (val, lgVal, higherIsBetter) => {
    if (val == null || lgVal == null || isNaN(val)) return "";
    if (val > lgVal)
      return higherIsBetter ? "color:var(--accent)" : "color:#4a9eff";
    if (val < lgVal)
      return higherIsBetter ? "color:#4a9eff" : "color:var(--accent)";
    return "";
  };

  _hubOppSelectMode = false;
  _hubOppSelected.clear();

  c.innerHTML = `<div class="page-header">
    <div><div class="page-title">Opponents</div>
    <div class="page-sub">${opponents.length} team${
    opponents.length !== 1 ? "s" : ""
  }</div></div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end">
      <button class="hub-mob-action-btn" onclick="exportAllData()" title="Export all games as JSON">⬇ Export All</button>
      <button class="hub-mob-action-btn" onclick="triggerImport()" title="Import games from JSON">⬆ Import</button>
      <button id="opp-select-btn" onclick="hubOppToggleSelectMode()" style="padding:6px 14px;border:1.5px solid var(--border2);border-radius:7px;background:none;color:var(--text2);font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:13px;cursor:pointer;transition:all .13s;-webkit-tap-highlight-color:transparent;touch-action:manipulation" onmouseover="this.style.borderColor='var(--accent)';this.style.color='var(--accent)'" onmouseout="if(!window._hubOppSelectMode){this.style.borderColor='var(--border2)';this.style.color='var(--text2)'}">Select</button>
    </div></div>
    <div id="opp-select-bar" style="display:none" class="gh-select-bar">
      <span id="opp-sel-count" style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:14px;color:var(--text);flex:1">0 selected</span>
      <button onclick="hubOppSelectAll()" style="padding:5px 12px;border:1.5px solid var(--border2);border-radius:6px;background:none;color:var(--text2);font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:12px;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation">Select All</button>
      <button onclick="hubOppSelectNone()" style="padding:5px 12px;border:1.5px solid var(--border2);border-radius:6px;background:none;color:var(--text2);font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:12px;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation">Deselect All</button>
      <button id="opp-del-sel-btn" onclick="hubOppPromptDeleteSelected()" disabled style="padding:5px 14px;border:1.5px solid var(--border2);border-radius:6px;background:none;color:var(--text3);font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:12px;cursor:not-allowed;opacity:.45;transition:all .13s;-webkit-tap-highlight-color:transparent;touch-action:manipulation">Delete Selected</button>
    </div>
    <div class="opp-grid" id="opp-cards-grid">${teamStats
      .map(({ t, games, rec, avg, obp, ops, era, tHR, pK }) => {
        const isSel = _hubOppSelected.has(t);
        return `<div class="opp-card${
          isSel ? " opp-selected" : ""
        }" data-team="${escAttr(
          t
        )}" onclick="_hubOppSelectMode ? hubOppToggleCard('${escAttr(
          t
        )}') : showView('team','${escAttr(t)}')">
          <div class="opp-card-check">${isSel ? "✓" : ""}</div>
          <div style="display:flex;align-items:center;gap:6px;justify-content:space-between">
            <div class="opp-card-name" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis">${escHtml(
              t
            )}</div>
            <button onclick="event.stopPropagation();showRenameTeam('${escAttr(
              t
            )}')" title="Rename this team" style="background:none;border:none;padding:2px 5px;cursor:pointer;color:var(--text3);font-size:13px;border-radius:4px;flex-shrink:0;line-height:1" onmouseover="this.style.color='var(--accent)'" onmouseout="this.style.color='var(--text3)'">✏</button>
            <button onclick="event.stopPropagation();showAssignOppModal('${escAttr(
              t
            )}')" title="Assign to saved opponent" style="background:none;border:none;padding:2px 4px;cursor:pointer;color:var(--text3);font-size:10px;border-radius:4px;flex-shrink:0;line-height:1;font-family:'Barlow Condensed',sans-serif;font-weight:700;letter-spacing:0.5px" onmouseover="this.style.color='var(--blue)'" onmouseout="this.style.color='var(--text3)'">→OPP</button>
          </div>
          <div class="opp-card-record">${rec.w}-${rec.l}${
          rec.t ? "-" + rec.t : ""
        } &nbsp;·&nbsp; ${games.length}G</div>
          <div class="opp-card-stats">
            <div class="opp-stat"><span class="opp-stat-val" style="${sc(
              avg,
              lgAVG,
              true
            )}">${f(
          avg,
          "rate"
        )}</span><span class="opp-stat-lbl">AVG</span></div>
            <div class="opp-stat"><span class="opp-stat-val" style="${sc(
              obp,
              lgOBP,
              true
            )}">${f(
          obp,
          "rate"
        )}</span><span class="opp-stat-lbl">OBP</span></div>
            <div class="opp-stat"><span class="opp-stat-val" style="${sc(
              ops,
              lgOPS,
              true
            )}">${f(
          ops,
          "rate"
        )}</span><span class="opp-stat-lbl">OPS</span></div>
            <div class="opp-stat"><span class="opp-stat-val" style="${sc(
              era,
              lgERA,
              false
            )}">${f(
          era,
          "era"
        )}</span><span class="opp-stat-lbl">ERA</span></div>
            <div class="opp-stat"><span class="opp-stat-val" style="${sc(
              tHR,
              lgHR,
              true
            )}">${tHR}</span><span class="opp-stat-lbl">HR</span></div>
            <div class="opp-stat"><span class="opp-stat-val" style="${sc(
              pK,
              lgK,
              true
            )}">${pK}</span><span class="opp-stat-lbl">K</span></div>
          </div>
        </div>`;
      })
      .join("")}</div>`;
}

// ===== ALL GAMES VIEW =====
let _ghSelectMode = false;
let _ghSelected = new Set();

// ===== SEASON HISTORY =====
// ===== SEASON STORAGE HELPERS =====
async function _loadSeasons() {
  try {
    const raw = await window.storage.get("pitchtrack_seasons", true);
    if (raw?.value) return JSON.parse(raw.value) || [];
  } catch (e) {}
  return [];
}
async function _saveSeasons(arr) {
  await window.storage.set("pitchtrack_seasons", JSON.stringify(arr), true);
}

// ===== SEASON HISTORY =====
async function renderSeasonHistory() {
  currentView = null;
  const hw = document.getElementById("hub-welcome");
  const c = document.getElementById("hub-content");
  if (hw) hw.style.display = "none";
  if (c) c.style.display = "block";
  renderSidebar();

  const seasons = await _loadSeasons();

  // Ensure every entry has an id (migrate legacy entries)
  let needsSave = false;
  seasons.forEach((s) => {
    if (!s.id) { s.id = "s_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7); needsSave = true; }
  });
  if (needsSave) await _saveSeasons(seasons);

  const currentOpponents = (typeof _opponents !== "undefined" ? _opponents : []) || [];

  const headerHtml = `<div class="page-header">
    <div><div class="page-title">Seasons</div><div class="page-sub">${seasons.length} season${seasons.length !== 1 ? "s" : ""}</div></div>
    <button class="sep-new-season-btn" onclick="createNewSeason()">+ New Season</button>
  </div>`;

  if (!seasons.length) {
    c.innerHTML = headerHtml + `<div class="empty-state"><div class="empty-icon"></div>No seasons yet.<br>Click "+ New Season" to create one, or use "Archive Season" in My Team.</div>`;
    return;
  }

  // Most recent first (by year, then createdAt)
  const sorted = [...seasons].sort((a, b) => {
    const yDiff = (b.year || "0").localeCompare(a.year || "0");
    if (yDiff !== 0) return yDiff;
    return (b.createdAt || "").localeCompare(a.createdAt || "");
  });

  const cards = sorted.map((s) => {
    const sid = escAttr(s.id);
    const rosterCount = (s.roster || []).length;
    const oppList = s.opponents || [];
    const oppCount = oppList.length;
    const archivedDate = s.archivedAt || s.updatedAt
      ? new Date(s.updatedAt || s.archivedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : "";
    const isEditing = _expandedSeasonEdit === s.id;

    // Summary rows for collapsed view
    const rosterRows = (s.roster || []).slice(0, 6)
      .map((p) => `<div class="sh-player-row">${escHtml(p.name || p.playerName || "Unknown")} <span class="sh-pos">${escHtml(p.position || p.pos || "")}</span></div>`)
      .join("");
    const rosterMore = rosterCount > 6 ? `<div class="sh-more">+${rosterCount - 6} more</div>` : "";
    // Collapsed view: opponents as clickable links → sets year filter + opens their stats/scouting
    const oppRows = oppList.slice(0, 5)
      .map((o) => {
        const rCount = (o.roster || []).length;
        const viewCmd = s.year
          ? `setSeasonFilter('${escAttr(s.year)}');showView('team','${escAttr(o.name || "")}');`
          : `showView('team','${escAttr(o.name || "")}');`;
        const scoutCmd = `openPanel('scout-overview');setTimeout(()=>{scoutOverviewLoad().then(()=>scoutSelectTeam('${escAttr(o.name || "")}'))},200);`;
        return `<div class="sh-opp-row">
          <button class="sep-opp-link" onclick="${viewCmd}" title="View stats">${escHtml(o.name || "Unknown")}</button>
          ${rCount ? `<span class="sh-pos">${rCount}p</span>` : ""}
          <button class="sep-action-btn" onclick="${scoutCmd}" title="Open scouting cards" style="font-size:10px;padding:2px 7px;margin-left:auto">Scout</button>
        </div>`;
      })
      .join("");
    const oppMore = oppCount > 5 ? `<div class="sh-more">+${oppCount - 5} more</div>` : "";

    // Edit panel (inline, always rendered server-side so no async needed after initial load)
    let editPanel = "";
    if (isEditing) {
      const inArchive = oppList.map((o) => {
        const rCount = (o.roster || []).length;
        const viewCmd = s.year
          ? `setSeasonFilter('${escAttr(s.year)}');showView('team','${escAttr(o.name || "")}');`
          : `showView('team','${escAttr(o.name || "")}');`;
        const scoutCmd = `openPanel('scout-overview');setTimeout(()=>{scoutOverviewLoad().then(()=>scoutSelectTeam('${escAttr(o.name || "")}'))},200);`;
        return `<div class="sep-opp-row">
          <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis">${escHtml(o.name || "Unknown")}</span>
          ${rCount ? `<span class="sh-pos">${rCount} players</span>` : ""}
          <button class="sep-action-btn" onclick="${viewCmd}" style="color:var(--text3);border-color:var(--border2)" onmouseover="this.style.color='var(--accent)';this.style.borderColor='var(--accent)'" onmouseout="this.style.color='var(--text3)';this.style.borderColor='var(--border2)'">Stats</button>
          <button class="sep-action-btn" onclick="${scoutCmd}" style="color:var(--text3);border-color:var(--border2)" onmouseover="this.style.color='var(--accent)';this.style.borderColor='var(--accent)'" onmouseout="this.style.color='var(--text3)';this.style.borderColor='var(--border2)'">Scout</button>
          <button class="sep-action-btn sep-remove-btn" onclick="seasonRemoveOpp('${sid}','${escAttr(o.id || o.name || "")}')">Remove</button>
        </div>`;
      }).join("") || '<div class="sh-note-row">No opponents in this archive yet.</div>';

      // Build "not in archive" list from ALL allTeams (game history), not just saved opponents
      const archiveNames = new Set(oppList.map((o) => o.name));
      const savedOppByName = {};
      currentOpponents.forEach((o) => { if (o.name) savedOppByName[o.name] = o; });

      const allAddable = (typeof allTeams !== "undefined" ? allTeams : []).filter((name) => !archiveNames.has(name));
      const notInArchive = allAddable.map((name) => {
        const saved = savedOppByName[name];
        const rCount = saved ? (saved.roster || []).length : 0;
        return `<div class="sep-opp-row">
          <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis">${escHtml(name)}</span>
          ${rCount ? `<span class="sh-pos">${rCount}p</span>` : '<span class="sh-pos" style="font-style:italic">game history</span>'}
          <button class="sep-action-btn sep-add-btn" onclick="seasonAddTeam('${sid}','${escAttr(name)}')">Add</button>
        </div>`;
      }).join("");

      const totalTracked = (typeof allTeams !== "undefined" ? allTeams : []).length;

      editPanel = `<div class="season-edit-panel">
        <div class="sep-field-row">
          <label class="sep-label">Season Name</label>
          <input class="sep-input" id="sep-name-${sid}" value="${escAttr(s.label || s.year || "")}" placeholder="e.g. 2026 Spring League">
          <label class="sep-label" style="margin-left:10px">Year</label>
          <input class="sep-input" id="sep-year-${sid}" value="${escAttr(s.year || "")}" placeholder="2026" style="max-width:70px">
          <button class="sep-sync-btn" onclick="seasonSaveMeta('${sid}')">Save</button>
        </div>
        <div class="sep-section">
          <div class="sep-section-title">My Team Roster${rosterCount ? ` — ${rosterCount} players` : " — none synced"}</div>
          <button class="sep-sync-btn" onclick="seasonSyncRoster('${sid}')">Sync Current Roster (${(typeof myTeamRoster !== "undefined" ? myTeamRoster : []).length} players)</button>
        </div>
        <div class="sep-section">
          <div class="sep-section-title">Tracked Teams — ${oppCount} in archive</div>
          ${inArchive}
          ${notInArchive ? `<div class="sep-divider">— Not in archive (${allAddable.length} teams) —</div>${notInArchive}` : '<div class="sh-note-row" style="margin-top:6px">All tracked teams are in this archive.</div>'}
          ${totalTracked ? `<button class="sep-sync-btn" style="margin-top:10px" onclick="seasonSyncAllTeams('${sid}')">Sync All Tracked Teams (${totalTracked})</button>` : ""}
        </div>
        <div class="sep-section" style="display:flex;gap:10px;flex-wrap:wrap;padding-top:4px">
          <button class="sep-sync-btn" onclick="seasonToggleEdit('${sid}')">Done</button>
          <button class="sep-delete-btn" onclick="seasonDelete('${sid}')">Delete Season</button>
        </div>
      </div>`;
    }

    const isNewPanel = _newSeasonPanel === s.id;
    const newPanel = isNewPanel ? _renderNewSeasonPanel(s) : "";

    return `<div class="season-card" id="sc-${sid}">
      <div class="season-card-header">
        <div class="season-card-year">${escHtml(s.year || "")}</div>
        <div class="season-card-meta">
          <div class="season-card-team">${escHtml(s.label || s.teamName || "")}</div>
          <div class="season-card-counts">${rosterCount} player${rosterCount !== 1 ? "s" : ""} · ${oppCount} opponent${oppCount !== 1 ? "s" : ""}${archivedDate ? ` · Updated ${archivedDate}` : ""}</div>
        </div>
        <div style="display:flex;gap:8px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end">
          ${s.year ? `<button class="season-view-btn" onclick="setSeasonFilter('${escAttr(s.year)}');hubSetTab('myteam')">View ${escHtml(s.year)} Stats</button>` : ""}
          <button class="season-new-btn" onclick="seasonToggleNewPanel('${sid}')">${isNewPanel ? "Cancel" : "Start New Season"}</button>
          <button class="season-edit-btn" onclick="seasonToggleEdit('${sid}')">${isEditing ? "Done" : "Edit"}</button>
        </div>
      </div>
      ${!isEditing && !isNewPanel ? `<div class="season-card-body">
        <div class="season-section">
          <div class="season-section-title">My Team Roster</div>
          ${rosterRows || '<div class="sh-note-row">No roster synced.</div>'}${rosterMore}
        </div>
        <div class="season-section">
          <div class="season-section-title">Opponents</div>
          ${oppRows || '<div class="sh-note-row">No opponents added yet.</div>'}${oppMore}
        </div>
      </div>` : ""}
      ${editPanel}
      ${newPanel}
    </div>`;
  }).join("");

  c.innerHTML = headerHtml + `<div class="season-history-list">${cards}</div>`;
}

// ===== SEASON MANAGEMENT ACTIONS =====

async function createNewSeason() {
  const seasons = await _loadSeasons();
  const year = new Date().getFullYear().toString();
  const id = "s_" + Date.now();
  seasons.push({
    id,
    label: year + " Season",
    year,
    teamName: (typeof _getMyTeamName === "function" ? _getMyTeamName() : "") || "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    roster: [],
    opponents: [],
  });
  await _saveSeasons(seasons);
  _expandedSeasonEdit = id;
  renderSeasonHistory();
}

async function seasonToggleEdit(id) {
  _expandedSeasonEdit = (_expandedSeasonEdit === id) ? null : id;
  renderSeasonHistory();
}

async function seasonSaveMeta(id) {
  const seasons = await _loadSeasons();
  const s = seasons.find((x) => x.id === id);
  if (!s) return;
  const nameEl = document.getElementById("sep-name-" + id);
  const yearEl = document.getElementById("sep-year-" + id);
  if (nameEl) s.label = nameEl.value.trim() || s.label;
  if (yearEl) s.year = yearEl.value.trim() || s.year;
  s.updatedAt = new Date().toISOString();
  await _saveSeasons(seasons);
  renderSeasonHistory();
}

async function seasonSyncRoster(id) {
  const seasons = await _loadSeasons();
  const s = seasons.find((x) => x.id === id);
  if (!s) return;
  const roster = typeof myTeamRoster !== "undefined" ? myTeamRoster : [];
  s.roster = JSON.parse(JSON.stringify(roster));
  s.teamName = (typeof _getMyTeamName === "function" ? _getMyTeamName() : "") || s.teamName;
  s.updatedAt = new Date().toISOString();
  await _saveSeasons(seasons);
  renderSeasonHistory();
}

// Add a team to a season archive by name — works for both saved opponents (with roster)
// and game-history-only teams (name only, no roster)
async function seasonAddTeam(seasonId, teamName) {
  const seasons = await _loadSeasons();
  const s = seasons.find((x) => x.id === seasonId);
  if (!s) return;
  if (!s.opponents) s.opponents = [];
  if (s.opponents.find((o) => o.name === teamName)) return; // already in archive
  const currentOpps = typeof _opponents !== "undefined" ? _opponents : [];
  const saved = currentOpps.find((o) => o.name === teamName);
  s.opponents.push(saved
    ? JSON.parse(JSON.stringify(saved))
    : { id: null, name: teamName, roster: [] }
  );
  s.updatedAt = new Date().toISOString();
  await _saveSeasons(seasons);
  renderSeasonHistory();
}

// Keep legacy name for backward compat (called from old inline handlers in existing archives)
async function seasonAddOpp(seasonId, oppId) {
  const currentOpps = typeof _opponents !== "undefined" ? _opponents : [];
  const opp = currentOpps.find((o) => o.id === oppId);
  if (opp) await seasonAddTeam(seasonId, opp.name);
}

async function seasonRemoveOpp(id, oppIdOrName) {
  const seasons = await _loadSeasons();
  const s = seasons.find((x) => x.id === id);
  if (!s) return;
  // Match by name first (covers game-history teams with id=null), then by id
  s.opponents = (s.opponents || []).filter((o) => o.name !== oppIdOrName && (o.id || o.name) !== oppIdOrName);
  s.updatedAt = new Date().toISOString();
  await _saveSeasons(seasons);
  renderSeasonHistory();
}

// Sync ALL tracked teams (allTeams from game history) into the season archive
async function seasonSyncAllTeams(seasonId) {
  const seasons = await _loadSeasons();
  const s = seasons.find((x) => x.id === seasonId);
  if (!s) return;
  const teams = typeof allTeams !== "undefined" ? allTeams : [];
  const currentOpps = typeof _opponents !== "undefined" ? _opponents : [];
  const savedByName = {};
  currentOpps.forEach((o) => { if (o.name) savedByName[o.name] = o; });
  // Build merged list: prefer saved opponent data (has roster), fall back to name-only
  const merged = teams.map((name) => {
    const saved = savedByName[name];
    return saved ? JSON.parse(JSON.stringify(saved)) : { id: null, name, roster: [] };
  });
  // Deduplicate by name
  const seen = new Set();
  s.opponents = merged.filter((o) => { if (seen.has(o.name)) return false; seen.add(o.name); return true; });
  s.updatedAt = new Date().toISOString();
  await _saveSeasons(seasons);
  renderSeasonHistory();
}

// ===== START NEW SEASON FLOW =====

function _renderNewSeasonPanel(s) {
  const sid = escAttr(s.id);
  const rosterCount = (s.roster || []).length;
  const oppCount = (s.opponents || []).length;
  const liveRosterCount = (typeof myTeamRoster !== "undefined" ? myTeamRoster : []).length;
  const liveOppCount = (typeof _opponents !== "undefined" ? _opponents : []).length;
  const gamesInYear = s.year
    ? (typeof allGames !== "undefined" ? allGames : []).filter((g) => g.date && g.date.slice(0, 4) === s.year).length
    : (typeof allGames !== "undefined" ? allGames : []).length;

  return `<div class="season-new-panel">
    <div class="sns-archive-confirm">
      <span style="font-size:18px">✓</span>
      <span>Archived: <strong>${rosterCount} player${rosterCount !== 1 ? "s" : ""}</strong> · <strong>${oppCount} opponent${oppCount !== 1 ? "s" : ""}</strong> — safely stored in this season</span>
    </div>
    <div class="sns-game-warning">
      <span style="font-size:16px;flex-shrink:0">⚠</span>
      <span><strong>Game records are not part of this archive.</strong> Your ${gamesInYear > 0 ? gamesInYear + " " : ""}game${gamesInYear !== 1 ? "s" : ""} must stay — they're how all stats and scouting data stay accessible. They will never be deleted here.</span>
    </div>
    <div style="display:flex;flex-direction:column;gap:8px">
      <div class="sns-section-title">Choose what to reset for the new season:</div>
      <label class="sns-check-row">
        <input type="checkbox" id="sns-clear-roster-${sid}" ${liveRosterCount > 0 ? "checked" : "disabled"}>
        <span>Clear My Team roster${liveRosterCount > 0 ? ` (${liveRosterCount} players)` : " — roster already empty"} <span class="sh-pos">safe — snapshot is archived</span></span>
      </label>
      <label class="sns-check-row">
        <input type="checkbox" id="sns-clear-opps-${sid}" ${liveOppCount === 0 ? "disabled" : ""}>
        <span>Clear saved opponents${liveOppCount > 0 ? ` (${liveOppCount} teams)` : " — none saved"} <span class="sh-pos">safe — snapshots are archived</span></span>
      </label>
    </div>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <button class="sns-start-btn" onclick="executeNewSeason('${sid}')">Start Fresh →</button>
      <button class="sep-sync-btn" onclick="seasonToggleNewPanel('${sid}')">Cancel</button>
    </div>
  </div>`;
}

function seasonToggleNewPanel(id) {
  _newSeasonPanel = (_newSeasonPanel === id) ? null : id;
  renderSeasonHistory();
}

async function executeNewSeason(seasonId) {
  const clearRoster = document.getElementById("sns-clear-roster-" + seasonId)?.checked;
  const clearOpps = document.getElementById("sns-clear-opps-" + seasonId)?.checked;
  if (clearRoster && typeof myTeamClearRoster === "function") {
    myTeamClearRoster(true); // silent = true, skip confirm dialog
  }
  if (clearOpps) {
    const opps = typeof _opponents !== "undefined" ? [..._opponents] : [];
    for (const opp of opps) {
      try { await window.storage.delete("pitchtrack_opp_" + opp.id, true); } catch (e) {}
    }
    await window.storage.set("pitchtrack_opponents", JSON.stringify([]), true);
    if (typeof oppLoad === "function") await oppLoad();
  }
  _newSeasonPanel = null;
  if (typeof toast === "function") toast("New season started. Game history is preserved.");
  renderSeasonHistory();
}

// ===== SEASON PICKER — add a team to a season from any panel =====
async function _showSeasonPicker(teamName) {
  document.getElementById("season-picker-modal")?.remove();
  const seasons = await _loadSeasons();
  if (!seasons.length) {
    if (typeof toast === "function") toast("No seasons yet — create one in Stats Hub → Seasons");
    return;
  }
  const rows = seasons
    .sort((a, b) => (b.year || "").localeCompare(a.year || ""))
    .map((s) => `<button class="season-picker-row" onclick="seasonPickerAdd('${escAttr(s.id)}','${escAttr(teamName)}')">
      <span class="season-picker-year">${escHtml(s.year || "")}</span>
      <span class="season-picker-label">${escHtml(s.label || s.year || "Season")}</span>
    </button>`).join("");
  const modal = document.createElement("div");
  modal.id = "season-picker-modal";
  modal.innerHTML = `<div class="season-picker-backdrop" onclick="document.getElementById('season-picker-modal').remove()"></div>
    <div class="season-picker-box">
      <div class="season-picker-title">Add "${escHtml(teamName)}" to a season:</div>
      ${rows}
      <button class="season-picker-close" onclick="document.getElementById('season-picker-modal').remove()">Cancel</button>
    </div>`;
  document.body.appendChild(modal);
}

async function seasonPickerAdd(seasonId, teamName) {
  document.getElementById("season-picker-modal")?.remove();
  await seasonAddTeam(seasonId, teamName);
  if (typeof toast === "function") toast(`Added ${teamName} to season`);
}

async function seasonDelete(id) {
  const seasons = await _loadSeasons();
  const s = seasons.find((x) => x.id === id);
  const label = s ? (s.label || s.year || "this season") : "this season";
  if (!confirm(`Delete "${label}"? This cannot be undone.`)) return;
  const updated = seasons.filter((x) => x.id !== id);
  if (_expandedSeasonEdit === id) _expandedSeasonEdit = null;
  await _saveSeasons(updated);
  renderSeasonHistory();
}

// ===== HUB OPPONENTS SELECT MODE =====
let _hubOppSelectMode = false;
let _hubOppSelected = new Set(); // team names

function hubOppToggleSelectMode() {
  _hubOppSelectMode = !_hubOppSelectMode;
  _hubOppSelected.clear();
  window._hubOppSelectMode = _hubOppSelectMode;
  const bar = document.getElementById("opp-select-bar");
  const btn = document.getElementById("opp-select-btn");
  const grid = document.getElementById("opp-cards-grid");
  if (bar) bar.style.display = _hubOppSelectMode ? "flex" : "none";
  if (btn) {
    btn.textContent = _hubOppSelectMode ? "Cancel" : "Select";
    btn.style.borderColor = _hubOppSelectMode
      ? "var(--accent)"
      : "var(--border2)";
    btn.style.color = _hubOppSelectMode ? "var(--accent)" : "var(--text2)";
  }
  if (grid) grid.classList.toggle("opp-select-active", _hubOppSelectMode);
  _renderOppCards();
  _oppUpdateSelBar();
}

function hubOppToggleCard(teamName) {
  if (_hubOppSelected.has(teamName)) _hubOppSelected.delete(teamName);
  else _hubOppSelected.add(teamName);
  const card = document.querySelector(
    `.opp-card[data-team="${CSS.escape(teamName)}"]`
  );
  if (card) {
    const sel = _hubOppSelected.has(teamName);
    card.classList.toggle("opp-selected", sel);
    const chk = card.querySelector(".opp-card-check");
    if (chk) chk.textContent = sel ? "✓" : "";
  }
  _oppUpdateSelBar();
}

function hubOppSelectAll() {
  document.querySelectorAll(".opp-card[data-team]").forEach((c) => {
    _hubOppSelected.add(c.dataset.team);
  });
  _renderOppCards();
  _oppUpdateSelBar();
}

function hubOppSelectNone() {
  _hubOppSelected.clear();
  _renderOppCards();
  _oppUpdateSelBar();
}

function _renderOppCards() {
  document.querySelectorAll(".opp-card[data-team]").forEach((card) => {
    const t = card.dataset.team;
    const sel = _hubOppSelected.has(t);
    card.classList.toggle("opp-selected", sel);
    const chk = card.querySelector(".opp-card-check");
    if (chk) chk.textContent = sel ? "✓" : "";
    card.style.cursor = _hubOppSelectMode ? "pointer" : "";
  });
}

function _oppUpdateSelBar() {
  const n = _hubOppSelected.size;
  const countEl = document.getElementById("opp-sel-count");
  const delBtn = document.getElementById("opp-del-sel-btn");
  if (countEl)
    countEl.textContent =
      n === 0 ? "0 selected" : `${n} team${n !== 1 ? "s" : ""} selected`;
  if (delBtn) {
    delBtn.disabled = n === 0;
    delBtn.style.opacity = n === 0 ? ".45" : "1";
    delBtn.style.cursor = n === 0 ? "not-allowed" : "pointer";
    delBtn.style.borderColor = n === 0 ? "var(--border2)" : "var(--accent)";
    delBtn.style.color = n === 0 ? "var(--text3)" : "var(--accent)";
  }
}

function hubOppPromptDeleteSelected() {
  const n = _hubOppSelected.size;
  if (!n) return;
  const sub = document.getElementById("delete-confirm-sub");
  if (sub)
    sub.textContent = `All games for ${n} opponent${
      n !== 1 ? "s" : ""
    } will be permanently removed. This cannot be undone.`;
  const titleEl = document.querySelector(
    "#delete-confirm-modal [style*='font-size: 21px']"
  );
  if (titleEl)
    titleEl.textContent = `Delete ${n} opponent${n !== 1 ? "s" : ""}?`;
  _pendingDeleteId = "__opp_delete__";
  document.getElementById("delete-confirm-modal").style.display = "flex";
}

function renderAllGames() {
  const c = document.getElementById("hub-content");
  if (!allGames.length) {
    c.innerHTML = `
    <div class="page-header">
      <div><div class="page-title">Game History</div></div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end">
<button class="hub-mob-action-btn" onclick="triggerImport()" title="Import games from JSON" style="-webkit-tap-highlight-color:transparent;touch-action:manipulation">⬆ Import</button>
      </div>
    </div>
    <div class="empty-state"><div class="empty-icon"></div>No games saved yet.<br>Use the Save Game button in PitchTrack after each game.</div>`;
    return;
  }
  c.innerHTML = `
    <div class="page-header">
      <div><div class="page-title">Game History</div><div class="page-sub">${
        allGames.length
      } game${allGames.length !== 1 ? "s" : ""} saved</div></div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end">
<button class="hub-mob-action-btn" onclick="exportAllData()" title="Export all games as JSON" style="-webkit-tap-highlight-color:transparent;touch-action:manipulation">⬇ Export All</button>
<button class="hub-mob-action-btn" onclick="triggerImport()" title="Import games from JSON" style="-webkit-tap-highlight-color:transparent;touch-action:manipulation">⬆ Import</button>
<button id="gh-select-btn" onclick="ghToggleSelectMode()" style="padding:6px 14px;border:1.5px solid var(--border2);border-radius:7px;background:none;color:var(--text2);font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:13px;cursor:pointer;transition:all .13s;-webkit-tap-highlight-color:transparent;touch-action:manipulation" onmouseover="this.style.borderColor='var(--accent)';this.style.color='var(--accent)'" onmouseout="if(!window._ghSelectMode){this.style.borderColor='var(--border2)';this.style.color='var(--text2)'}">Select</button>
      </div>
    </div>
    <div id="gh-select-bar" style="display:none" class="gh-select-bar">
      <span id="gh-sel-count" style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:14px;color:var(--text);flex:1">0 selected</span>
      <button onclick="ghSelectAll()" style="padding:5px 12px;border:1.5px solid var(--border2);border-radius:6px;background:none;color:var(--text2);font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:12px;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation">Select All</button>
      <button onclick="ghSelectNone()" style="padding:5px 12px;border:1.5px solid var(--border2);border-radius:6px;background:none;color:var(--text2);font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:12px;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation">Deselect All</button>
      <button id="gh-send-sel-btn" onclick="openSendModal('games')" disabled style="padding:5px 14px;border:1.5px solid var(--border2);border-radius:6px;background:none;color:var(--text3);font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:12px;cursor:not-allowed;opacity:.45;transition:all .13s;-webkit-tap-highlight-color:transparent;touch-action:manipulation">✉ Send</button>
      <button id="gh-del-sel-btn" onclick="ghPromptDeleteSelected()" disabled style="padding:5px 14px;border:1.5px solid var(--border2);border-radius:6px;background:none;color:var(--text3);font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:12px;cursor:not-allowed;opacity:.45;transition:all .13s;-webkit-tap-highlight-color:transparent;touch-action:manipulation">Delete Selected</button>
    </div>
    <div id="hub-games-list"></div>`;

  _renderGameRows();
}

function _renderGameRows() {
  const gl = document.getElementById("hub-games-list");
  if (!gl) return;
  gl.innerHTML = "";
  allGames.forEach((g) => {
    const div = document.createElement("div");
    div.className = "game-row" + (_ghSelected.has(g.id) ? " gh-selected" : "");
    div.dataset.gid = g.id;

    const chkDiv = document.createElement("div");
    chkDiv.className =
      "gh-checkbox" + (_ghSelected.has(g.id) ? " checked" : "");
    chkDiv.style.display = _ghSelectMode ? "flex" : "none";
    chkDiv.innerHTML = _ghSelected.has(g.id) ? "✓" : "";

    div.innerHTML = `
      <div class="game-date">${g.date}</div>
      <div class="game-teams">
<span class="game-team-name-wrap">
  ${escHtml(
    g.awayTeam
  )}<button onclick="event.stopPropagation();showRenameTeam('${escAttr(
      g.awayTeam
    )}')" title="Rename ${escHtml(
      g.awayTeam
    )}" class="game-team-rename-btn">✏</button>
</span>
<span style="color:var(--text3);font-weight:400"> vs </span>
<span class="game-team-name-wrap">
  ${escHtml(
    g.homeTeam
  )}<button onclick="event.stopPropagation();showRenameTeam('${escAttr(
      g.homeTeam
    )}')" title="Rename ${escHtml(
      g.homeTeam
    )}" class="game-team-rename-btn">✏</button>
</span>
      </div>
      <div class="game-meta" style="flex:1;font-size:11px;color:var(--text3)">${
        g.totalPitches || 0
      } pitches · ${g.innings} inn</div>
      <div class="game-score">${g.awayScore}–${g.homeScore}</div>
      <button onclick="event.stopPropagation();exportGameData('${
        g.id
      }')" title="Export this game" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:12px;padding:3px 5px;border-radius:4px;transition:all .13s" onmouseover="this.style.color='var(--accent)'" onmouseout="this.style.color='var(--text3)'">⬇</button>
      <button class="del-btn" id="gh-del-${
        g.id
      }" onclick="event.stopPropagation();promptDeleteGame('${g.id}','${escHtml(
      g.awayTeam
    )} vs ${escHtml(g.homeTeam)} (${
      g.date
    })')"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="14" viewBox="0 0 13 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="1,3 12,3"/><path d="M4,3V2a1,1,0,0,1,1-1h3a1,1,0,0,1,1,1V3"/><path d="M2,3l.7,8.5A1,1,0,0,0,3.7,12.5h5.6a1,1,0,0,0,1-.99L11,3"/><line x1="5" y1="6" x2="5" y2="10"/><line x1="8" y1="6" x2="8" y2="10"/></svg></button>
    `;
    div.insertBefore(chkDiv, div.firstChild);
    div.onclick = (e) => {
      if (_ghSelectMode) {
        ghToggleRow(g.id);
      } else {
        showView("game", g.id);
      }
    };
    gl.appendChild(div);
  });
}

function ghToggleSelectMode() {
  _ghSelectMode = !_ghSelectMode;
  _ghSelected.clear();
  window._ghSelectMode = _ghSelectMode; // keep in sync for mouseover guard
  const bar = document.getElementById("gh-select-bar");
  const btn = document.getElementById("gh-select-btn");
  if (bar) bar.style.display = _ghSelectMode ? "flex" : "none";
  if (btn) {
    btn.textContent = _ghSelectMode ? "Cancel" : "Select";
    btn.style.borderColor = _ghSelectMode ? "var(--accent)" : "var(--border2)";
    btn.style.color = _ghSelectMode ? "var(--accent)" : "var(--text2)";
  }
  _renderGameRows();
  _ghUpdateSelBar();
}

function ghToggleRow(id) {
  if (_ghSelected.has(id)) _ghSelected.delete(id);
  else _ghSelected.add(id);
  // Update just this row visually without full re-render
  const row = document.querySelector(`.game-row[data-gid="${id}"]`);
  if (row) {
    const chk = row.querySelector(".gh-checkbox");
    const sel = _ghSelected.has(id);
    row.classList.toggle("gh-selected", sel);
    if (chk) {
      chk.classList.toggle("checked", sel);
      chk.innerHTML = sel ? "✓" : "";
    }
  }
  _ghUpdateSelBar();
}

function ghSelectAll() {
  allGames.forEach((g) => _ghSelected.add(g.id));
  _renderGameRows();
  _ghUpdateSelBar();
}

function ghSelectNone() {
  _ghSelected.clear();
  _renderGameRows();
  _ghUpdateSelBar();
}

function _ghUpdateSelBar() {
  const n = _ghSelected.size;
  const countEl = document.getElementById("gh-sel-count");
  const delBtn = document.getElementById("gh-del-sel-btn");
  const sendBtn = document.getElementById("gh-send-sel-btn");
  if (countEl)
    countEl.textContent =
      n === 0 ? "0 selected" : `${n} game${n !== 1 ? "s" : ""} selected`;
  [delBtn, sendBtn].forEach((btn) => {
    if (!btn) return;
    btn.disabled = n === 0;
    btn.style.opacity = n === 0 ? ".45" : "1";
    btn.style.cursor = n === 0 ? "not-allowed" : "pointer";
    btn.style.borderColor = n === 0 ? "var(--border2)" : "var(--accent)";
    btn.style.color = n === 0 ? "var(--text3)" : "var(--accent)";
  });
}

function ghPromptDeleteSelected() {
  const n = _ghSelected.size;
  if (!n) return;
  const sub = document.getElementById("delete-confirm-sub");
  if (sub)
    sub.textContent = `${n} game${
      n !== 1 ? "s" : ""
    } will be permanently removed. This cannot be undone.`;
  const titleEl = document.querySelector(
    "#delete-confirm-modal [style*='font-size: 21px']"
  );
  if (titleEl) titleEl.textContent = `Delete ${n} game${n !== 1 ? "s" : ""}?`;
  _pendingDeleteId = "__multi__";
  document.getElementById("delete-confirm-modal").style.display = "flex";
}

// ===== SEND VIA EMAIL =====
let _sendModalGames = []; // games collected for the current open modal
let _sendModalMode = ""; // 'games' | 'teams'

function openSendModal(mode) {
  _sendModalMode = mode;
  _sendModalGames = [];

  const myTN = window._myTeamNameCache || "";

  if (mode === "games") {
    // --- collect selected games from game-history view ---
    _sendModalGames = allGames.filter((g) => _ghSelected.has(g.id));
  } else if (mode === "teams") {
    // --- collect every game that involves any selected team ---
    _sendModalGames = allGames.filter(
      (g) => _tsSelected.has(g.awayTeam) || _tsSelected.has(g.homeTeam)
    );
  }

  if (!_sendModalGames.length) {
    toast("No games to send.");
    return;
  }

  // ── build plain-text summary ──────────────────────────────────────
  const lines = [];
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  if (mode === "games") {
    lines.push("PITCHTRACK PRO — GAME SUMMARY");
    lines.push(`Generated: ${today}`);
    lines.push("═".repeat(48));
    _sendModalGames.forEach((g, i) => {
      lines.push("");
      lines.push(`Game ${i + 1} of ${_sendModalGames.length}`);
      lines.push(`Date:     ${g.date || "—"}`);
      lines.push(`Matchup:  ${g.awayTeam} @ ${g.homeTeam}`);
      lines.push(
        `Score:    ${g.awayTeam} ${g.awayScore}–${g.homeScore} ${g.homeTeam}`
      );
      lines.push(`Innings:  ${g.innings || "—"}`);
      lines.push(`Pitches:  ${g.totalPitches || 0}`);
      if (i < _sendModalGames.length - 1) lines.push("─".repeat(48));
    });
  } else {
    // teams mode — one block per selected team
    const teams = Array.from(_tsSelected);
    lines.push("PITCHTRACK PRO — TEAM SUMMARY");
    lines.push(`Generated: ${today}`);
    lines.push("═".repeat(48));
    teams.forEach((teamName, ti) => {
      const tGames = _sendModalGames.filter(
        (g) => g.awayTeam === teamName || g.homeTeam === teamName
      );
      // compute record
      let w = 0,
        l = 0,
        t = 0,
        runs = 0,
        ra = 0,
        pitches = 0;
      tGames.forEach((g) => {
        const isHome = g.homeTeam === teamName;
        const tf = isHome ? g.homeScore : g.awayScore;
        const ta = isHome ? g.awayScore : g.homeScore;
        if (tf > ta) w++;
        else if (tf < ta) l++;
        else t++;
        runs += tf;
        ra += ta;
        pitches += g.totalPitches || 0;
      });
      const rd = runs - ra;

      lines.push("");
      lines.push(`TEAM: ${teamName}`);
      lines.push(`Record:   ${w}–${l}${t ? "–" + t : ""}`);
      lines.push(
        `Runs:     ${runs} scored, ${ra} allowed (${rd >= 0 ? "+" : ""}${rd})`
      );
      lines.push(
        `Pitches:  ${pitches} total across ${tGames.length} game${
          tGames.length !== 1 ? "s" : ""
        }`
      );
      lines.push("");
      lines.push("  GAME LOG");
      lines.push("  " + "─".repeat(44));
      tGames
        .slice()
        .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
        .forEach((g) => {
          const isHome = g.homeTeam === teamName;
          const opp = isHome ? g.awayTeam : g.homeTeam;
          const tf = isHome ? g.homeScore : g.awayScore;
          const ta = isHome ? g.awayScore : g.homeScore;
          const res = tf > ta ? "W" : tf < ta ? "L" : "T";
          lines.push(
            `  ${g.date || "??/??"}  ${res}  ${tf}–${ta}  vs ${opp}  (${
              g.totalPitches || 0
            }P)`
          );
        });
      if (ti < teams.length - 1) lines.push("\n" + "═".repeat(48));
    });
  }

  const bodyText = lines.join("\n");

  // ── subject line ─────────────────────────────────────────────────
  let subject = "";
  if (mode === "games") {
    const n = _sendModalGames.length;
    subject =
      n === 1
        ? `PitchTrack: ${_sendModalGames[0].awayTeam} @ ${
            _sendModalGames[0].homeTeam
          } — ${_sendModalGames[0].date || ""}`
        : `PitchTrack: ${n} Game Summary`;
  } else {
    const teams = Array.from(_tsSelected);
    subject =
      teams.length === 1
        ? `PitchTrack: ${teams[0]} Team Summary`
        : `PitchTrack: Team Summary — ${teams.slice(0, 2).join(", ")}${
            teams.length > 2 ? " +" + (teams.length - 2) + " more" : ""
          }`;
  }

  // ── subtitle ─────────────────────────────────────────────────────
  let subtitle = "";
  if (mode === "games") {
    subtitle = `${_sendModalGames.length} game${
      _sendModalGames.length !== 1 ? "s" : ""
    } selected`;
  } else {
    const tc = Array.from(_tsSelected).length;
    subtitle = `${tc} team${tc !== 1 ? "s" : ""} · ${
      _sendModalGames.length
    } game${_sendModalGames.length !== 1 ? "s" : ""}`;
  }

  // ── populate modal fields ─────────────────────────────────────────
  const subEl = document.getElementById("send-modal-subtitle");
  const subjectEl = document.getElementById("send-email-subject");
  const bodyEl = document.getElementById("send-email-body");
  if (subEl) subEl.textContent = subtitle;
  if (subjectEl) subjectEl.value = subject;
  if (bodyEl) bodyEl.value = bodyText;

  // clear To field each time
  const toEl = document.getElementById("send-email-to");
  if (toEl) toEl.value = "";

  // reset Download button label
  const dlBtn = document.getElementById("send-download-btn");
  if (dlBtn) dlBtn.textContent = "⬇ Download JSON";

  document.getElementById("send-email-modal").style.display = "flex";
}

function closeSendModal() {
  const modal = document.getElementById("send-email-modal");
  if (modal) modal.style.display = "none";
  _sendModalGames = [];
  _sendModalMode = "";
}

function sendModalDownload() {
  if (!_sendModalGames.length) {
    toast("Nothing to download.");
    return;
  }
  const date = new Date().toISOString().split("T")[0];
  let filename = "";
  if (_sendModalMode === "games") {
    filename =
      _sendModalGames.length === 1
        ? `pitchtrack_${_sanitizeFilename(
            _sendModalGames[0].awayTeam
          )}_vs_${_sanitizeFilename(_sendModalGames[0].homeTeam)}_${
            _sendModalGames[0].date || date
          }.json`
        : `pitchtrack_${_sendModalGames.length}games_${date}.json`;
  } else {
    const teams = Array.from(_tsSelected);
    filename =
      teams.length === 1
        ? `pitchtrack_${_sanitizeFilename(teams[0])}_${date}.json`
        : `pitchtrack_${teams.length}teams_${date}.json`;
  }
  _downloadJSON(
    {
      exportedAt: new Date().toISOString(),
      gameCount: _sendModalGames.length,
      games: _sendModalGames,
    },
    filename
  );
  // visual feedback on button
  const dlBtn = document.getElementById("send-download-btn");
  if (dlBtn) {
    dlBtn.textContent = "✓ Downloaded";
    dlBtn.style.borderColor = "var(--accent)";
    dlBtn.style.color = "var(--accent)";
    setTimeout(() => {
      dlBtn.textContent = "⬇ Download JSON";
      dlBtn.style.borderColor = "var(--border2)";
      dlBtn.style.color = "var(--text2)";
    }, 2500);
  }
  toast(`⬇ Saved ${filename}`);
}

function sendModalOpenMail() {
  const to = (document.getElementById("send-email-to")?.value || "").trim();
  const subject = (
    document.getElementById("send-email-subject")?.value || ""
  ).trim();
  const body = (document.getElementById("send-email-body")?.value || "").trim();

  // mailto: URIs have a ~2 000-character practical limit in most clients.
  // We truncate the body gracefully if needed.
  const MAX_BODY = 1800;
  let safeBody = body;
  if (safeBody.length > MAX_BODY) {
    safeBody =
      safeBody.slice(0, MAX_BODY) +
      "\n\n[…body truncated — see attached JSON for full data]";
  }

  const parts = [];
  if (subject) parts.push("subject=" + encodeURIComponent(subject));
  if (safeBody) parts.push("body=" + encodeURIComponent(safeBody));

  const mailto = `mailto:${encodeURIComponent(to)}${
    parts.length ? "?" + parts.join("&") : ""
  }`;
  window.location.href = mailto;
}

// ===== TEAM VIEW =====
function renderTeam(teamName) {
  const _allTeamGames = getTeamGames(teamName);
  const games = _seasonFilter
    ? _allTeamGames.filter((g) => g.date && g.date.slice(0, 4) === _seasonFilter)
    : _allTeamGames;
  const record = getTeamRecord(teamName, games);
  const players = getTeamRoster(teamName, games);
  const pitchers = getTeamPitchers(teamName, games);

  const myName = _getMyTeamName();
  const isOpponent = _hubTab === "opponents" && teamName !== myName;
  const backBtn = isOpponent
    ? `<button class="hub-back-btn" onclick="renderOpponentsWelcome()">← Opponents</button>`
    : "";

  const c = document.getElementById("hub-content");
  c.innerHTML = `
    ${backBtn}
    ${buildSeasonFilterBar()}
    <div class="page-header">
      <div>
<div class="page-title">${escHtml(teamName)}</div>
<div class="page-sub">${games.length} game${
    games.length !== 1 ? "s" : ""
  } · Record: ${record.w}–${record.l}${
    record.t ? "–" + record.t : ""
  } · Run diff: ${record.rd > 0 ? "+" : ""}${record.rd}</div>
      </div>
    </div>
    <div class="stat-cards">
      <div class="stat-card accent"><div class="stat-card-val">${
        record.w
      }</div><div class="stat-card-lbl">Wins</div></div>
      <div class="stat-card"><div class="stat-card-val">${
        record.l
      }</div><div class="stat-card-lbl">Losses</div></div>
      <div class="stat-card"><div class="stat-card-val">${
        record.runs
      }</div><div class="stat-card-lbl">Runs Scored</div></div>
      <div class="stat-card"><div class="stat-card-val">${
        record.ra
      }</div><div class="stat-card-lbl">Runs Allowed</div></div>
      <div class="stat-card"><div class="stat-card-val">${
        record.h
      }</div><div class="stat-card-lbl">Hits</div></div>
      <div class="stat-card"><div class="stat-card-val">${
        record.hr
      }</div><div class="stat-card-lbl">Home Runs</div></div>
    </div>

    <div class="tab-row">
      <div class="tab active" id="hub-tab-batters"     onclick="hub_switchTab('batters')">Batters</div>
      <div class="tab" id="hub-tab-pitchers"           onclick="hub_switchTab('pitchers')">Pitchers</div>
      <div class="tab" id="hub-tab-splits"             onclick="hub_switchTab('splits')">Splits</div>
      <div class="tab" id="hub-tab-baserunning"        onclick="hub_switchTab('baserunning')">Baserunning</div>
      <div class="tab" id="hub-tab-defense"            onclick="hub_switchTab('defense')">Defense</div>
      <div class="tab" id="hub-tab-scouting"           onclick="hub_switchTab('scouting')">Scouting Reports</div>
      <div class="tab" id="tab-games"                  onclick="hub_switchTab('team-games')">Games</div>
    </div>

    <div id="hub-tab-content-batters">${buildBatterTable(
      players,
      teamName
    )}</div>
    <div id="hub-tab-content-pitchers"     style="display:none">${buildPitcherTable(
      pitchers,
      teamName
    )}</div>
    <div id="hub-tab-content-splits"       style="display:none">${buildTeamSplitsTab(
      players,
      teamName,
      games,
      pitchers
    )}</div>
    <div id="hub-tab-content-baserunning"  style="display:none">${buildTeamBaserunningTable(
      players,
      teamName,
      games
    )}</div>
    <div id="hub-tab-content-defense"      style="display:none">${buildTeamDefenseTable(
      teamName,
      games
    )}</div>
    <div id="hub-tab-content-scouting"     style="display:none">${buildTeamScoutingTab(
      teamName,
      players,
      pitchers,
      games
    )}</div>
    <div id="tab-content-team-games"       style="display:none">${buildTeamGamesList(
      games,
      teamName
    )}</div>
  `;
}

function hub_switchTab(tab) {
  // Scope to hub-content only — don't touch player/pitcher tab rows
  const content = document.getElementById("hub-content");
  // Map short tab name to full content div id
  const contentIdMap = {
    batters: "hub-tab-content-batters",
    pitchers: "hub-tab-content-pitchers",
    splits: "hub-tab-content-splits",
    baserunning: "hub-tab-content-baserunning",
    defense: "hub-tab-content-defense",
    scouting: "hub-tab-content-scouting",
    "team-games": "tab-content-team-games",
  };
  if (content)
    content
      .querySelectorAll(".tab-row .tab")
      .forEach((t) => t.classList.remove("active"));
  const tabEl =
    document.getElementById("hub-tab-" + tab) ||
    document.getElementById("tab-" + tab);
  if (tabEl) tabEl.classList.add("active");
  [
    "batters",
    "pitchers",
    "splits",
    "baserunning",
    "defense",
    "scouting",
    "team-games",
  ].forEach((t) => {
    const el =
      document.getElementById("hub-tab-content-" + t) ||
      document.getElementById("tab-content-" + t);
    if (el) el.style.display = t === tab ? "block" : "none";
  });
}

function teamTabSort(tableId, colIdx) {
  const table = document.getElementById(tableId);
  if (!table) return;
  const tbody = table.querySelector("tbody");
  if (!tbody) return;
  const curCol = parseInt(table.dataset.sortCol ?? "-1");
  const curDir = parseInt(table.dataset.sortDir ?? "-1");
  const newDir = curCol === colIdx ? -curDir : -1; // descending by default
  table.dataset.sortCol = colIdx;
  table.dataset.sortDir = newDir;
  // Update header indicators
  table.querySelectorAll("thead th").forEach((th, i) => {
    const arrow = th.querySelector(".sort-arrow");
    if (arrow) arrow.remove();
    th.classList.remove("sorted");
    if (i === colIdx) {
      th.classList.add("sorted");
      const a = document.createElement("span");
      a.className = "sort-arrow";
      a.textContent = newDir === -1 ? " ▼" : " ▲";
      a.style.cssText = "font-size:9px;opacity:0.7";
      th.appendChild(a);
    }
  });
  // Sort rows
  const rows = [...tbody.querySelectorAll("tr")];
  rows.sort((a, b) => {
    const aRaw = (a.cells[colIdx]?.textContent ?? "").trim();
    const bRaw = (b.cells[colIdx]?.textContent ?? "").trim();
    const aNum = parseFloat(aRaw.replace("%", "").replace("∞", "999"));
    const bNum = parseFloat(bRaw.replace("%", "").replace("∞", "999"));
    if (!isNaN(aNum) && !isNaN(bNum)) return (aNum - bNum) * newDir;
    if (aRaw === "—" && bRaw !== "—") return newDir; // push "—" to bottom
    if (aRaw !== "—" && bRaw === "—") return -newDir;
    return aRaw.localeCompare(bRaw) * newDir;
  });
  rows.forEach((r) => tbody.appendChild(r));
}

function buildBatterTable(players, teamName) {
  if (!players.length) return '<div class="empty-state">No batter data</div>';
  const sorted = [...players].sort((a, b) => b.ab - a.ab);
  return `
    <div class="section-title">Batting Stats</div>
    <table class="data-table" id="hub-batter-table">
      <thead><tr>
<th onclick="teamTabSort('hub-batter-table',0)" style="cursor:pointer">Player</th>
<th onclick="teamTabSort('hub-batter-table',1)" style="cursor:pointer">#</th>
<th onclick="teamTabSort('hub-batter-table',2)" style="cursor:pointer">Pos</th>
<th onclick="teamTabSort('hub-batter-table',3)" style="cursor:pointer">G</th>
<th onclick="teamTabSort('hub-batter-table',4)" style="cursor:pointer">PA</th>
<th onclick="teamTabSort('hub-batter-table',5)" style="cursor:pointer">AB</th>
<th onclick="teamTabSort('hub-batter-table',6)" style="cursor:pointer">H</th>
<th onclick="teamTabSort('hub-batter-table',7)" style="cursor:pointer">2B</th>
<th onclick="teamTabSort('hub-batter-table',8)" style="cursor:pointer">3B</th>
<th onclick="teamTabSort('hub-batter-table',9)" style="cursor:pointer">HR</th>
<th onclick="teamTabSort('hub-batter-table',10)" style="cursor:pointer">R</th>
<th onclick="teamTabSort('hub-batter-table',11)" style="cursor:pointer">RBI</th>
<th onclick="teamTabSort('hub-batter-table',12)" style="cursor:pointer">SB</th>
<th onclick="teamTabSort('hub-batter-table',13)" style="cursor:pointer">CS</th>
<th onclick="teamTabSort('hub-batter-table',14)" style="cursor:pointer">BB</th>
<th onclick="teamTabSort('hub-batter-table',15)" style="cursor:pointer">K</th>
<th onclick="teamTabSort('hub-batter-table',16)" style="cursor:pointer">HBP</th>
<th onclick="teamTabSort('hub-batter-table',17)" style="cursor:pointer">AVG</th>
<th onclick="teamTabSort('hub-batter-table',18)" style="cursor:pointer">OBP</th>
<th onclick="teamTabSort('hub-batter-table',19)" style="cursor:pointer">SLG</th>
<th onclick="teamTabSort('hub-batter-table',20)" style="cursor:pointer">OPS</th>
<th style="width:28px"></th>
      </tr></thead>
      <tbody>${sorted
        .map((p) => {
          const pa = p.pa != null ? p.pa : p.ab + p.bb + (p.hbp || 0);
          const avg = p.ab > 0 ? p.hits / p.ab : 0;
          const obp =
            pa > 0
              ? (p.hits + (p.bb || 0) + (p.hbp || 0) + (p.ci || 0)) / pa
              : 0;
          const slg =
            p.ab > 0
              ? (p.hits -
                  p.doubles -
                  p.triples -
                  p.hr +
                  p.doubles * 2 +
                  p.triples * 3 +
                  p.hr * 4) /
                p.ab
              : 0;
          const ops = obp + slg;
          const fmtAvg = (n) => _fmtRate(n);
          const avgClass = avg >= 0.3 ? "good" : avg < 0.2 ? "dim" : "";
          return `<tr class="player-row" data-team="${escAttr(
            teamName
          )}" data-name="${escAttr(
            p.name
          )}" onclick="hubNavPlayer(this,'player')">
  <td>${escHtml(p.name)}</td>
  <td class="dim">${p.num || "—"}</td>
  <td class="dim">${p.pos || "—"}</td>
  <td>${p.games}</td>
  <td>${pa}</td>
  <td>${p.ab}</td>
  <td>${p.hits}</td>
  <td>${p.doubles}</td>
  <td>${p.triples}</td>
  <td class="${p.hr > 0 ? "highlight" : ""}">${p.hr}</td>
  <td>${p.r || 0}</td>
  <td>${p.rbi || 0}</td>
  <td class="${(p.sb || 0) > 0 ? "accent" : ""}">${p.sb || 0}</td>
  <td>${p.cs || 0}</td>
  <td>${p.bb}</td>
  <td>${p.k}</td>
  <td>${p.hbp || 0}</td>
  <td class="${avgClass}">${fmtAvg(avg)}</td>
  <td>${fmtAvg(obp)}</td>
  <td>${fmtAvg(slg)}</td>
  <td class="${ops >= 0.8 ? "good" : ops < 0.6 ? "dim" : ""}">${fmtAvg(
            ops
          )}</td>
  <td onclick="event.stopPropagation()" style="padding:2px 4px"><button onclick="showMergePlayerModal('${escAttr(
    teamName
  )}','${escAttr(p.name)}','${escAttr(
            String(p.num || "")
          )}','batter',event)" title="Merge player" style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:12px;padding:2px 4px;border-radius:4px;line-height:1" onmouseover="this.style.color='var(--accent)'" onmouseout="this.style.color='var(--text3)'">⇢</button></td>
</tr>`;
        })
        .join("")}</tbody>
    </table>`;
}

function buildPitcherTable(pitchers, teamName) {
  if (!pitchers.length) return '<div class="empty-state">No pitcher data</div>';
  const sorted = [...pitchers].sort((a, b) => b.pitches - a.pitches);
  return `
    <div class="section-title">Pitching Stats</div>
    <table class="data-table" id="hub-pitcher-table">
      <thead><tr>
<th onclick="teamTabSort('hub-pitcher-table',0)" style="cursor:pointer">Pitcher</th>
<th onclick="teamTabSort('hub-pitcher-table',1)" style="cursor:pointer">#</th>
<th onclick="teamTabSort('hub-pitcher-table',2)" style="cursor:pointer">T</th>
<th onclick="teamTabSort('hub-pitcher-table',3)" style="cursor:pointer">G</th>
<th onclick="teamTabSort('hub-pitcher-table',4)" style="cursor:pointer">IP</th>
<th onclick="teamTabSort('hub-pitcher-table',5)" style="cursor:pointer">BF</th>
<th onclick="teamTabSort('hub-pitcher-table',6)" style="cursor:pointer">P</th>
<th onclick="teamTabSort('hub-pitcher-table',7)" style="cursor:pointer">K</th>
<th onclick="teamTabSort('hub-pitcher-table',8)" style="cursor:pointer">BB</th>
<th onclick="teamTabSort('hub-pitcher-table',9)" style="cursor:pointer">H</th>
<th onclick="teamTabSort('hub-pitcher-table',10)" style="cursor:pointer">R</th>
<th onclick="teamTabSort('hub-pitcher-table',11)" style="cursor:pointer">HBP</th>
<th onclick="teamTabSort('hub-pitcher-table',12)" style="cursor:pointer">K/9</th>
<th onclick="teamTabSort('hub-pitcher-table',13)" style="cursor:pointer">BB/9</th>
<th onclick="teamTabSort('hub-pitcher-table',14)" style="cursor:pointer">K/BB</th>
<th onclick="teamTabSort('hub-pitcher-table',15)" style="cursor:pointer">Str%</th>
<th onclick="teamTabSort('hub-pitcher-table',16)" style="cursor:pointer">Swng%</th>
<th onclick="teamTabSort('hub-pitcher-table',17)" style="cursor:pointer">Lk%</th>
<th style="width:28px"></th>
      </tr></thead>
      <tbody>${sorted
        .map((p) => {
          const sp =
            p.pitches > 0 ? Math.round((p.strikes / p.pitches) * 100) : 0;
          const swp =
            p.pitches > 0 ? Math.round((p.swings / p.pitches) * 100) : 0;
          const lkp =
            p.pitches > 0 ? Math.round((p.looks / p.pitches) * 100) : 0;
          const k9 = p.outs > 0 ? ((p.k / (p.outs / 3)) * 9).toFixed(1) : "—";
          const bb9 = p.outs > 0 ? ((p.bb / (p.outs / 3)) * 9).toFixed(1) : "—";
          const kbb = p.bb > 0 ? (p.k / p.bb).toFixed(2) : p.k > 0 ? "∞" : "—";
          const ipFull = Math.floor((p.outs || 0) / 3);
          const ipRem = (p.outs || 0) % 3;
          const ipStr =
            (p.outs || 0) > 0
              ? ipRem === 0
                ? `${ipFull}.0`
                : `${ipFull}.${ipRem}`
              : "0.0";
          const clickable = teamName
            ? `class="player-row" data-team="${escAttr(
                teamName
              )}" data-name="${escAttr(
                p.name
              )}" onclick="hubNavPlayer(this,'pitcher')"`
            : "";
          return `<tr ${clickable}>
  <td>${escHtml(p.name)}</td>
  <td class="dim">${p.num || "—"}</td>
  <td class="dim">${p.hand || "R"}HP</td>
  <td>${p.games}</td>
  <td class="accent">${ipStr}</td>
  <td class="dim">${p.bf || 0}</td>
  <td>${p.pitches}</td>
  <td class="${p.k >= 5 ? "good" : ""}">${p.k}</td>
  <td class="${p.bb >= 4 ? "dim" : ""}">${p.bb}</td>
  <td>${p.hits}</td>
  <td class="${(p.r || 0) > 0 ? "highlight" : ""}">${p.r || 0}</td>
  <td class="dim">${p.hbp || 0}</td>
  <td>${k9}</td>
  <td>${bb9}</td>
  <td class="${parseFloat(kbb) >= 2 ? "good" : ""}">${kbb}</td>
  <td class="${sp >= 65 ? "good" : sp < 55 ? "dim" : ""}">${sp}%</td>
  <td>${swp}%</td>
  <td>${lkp}%</td>
  <td onclick="event.stopPropagation()" style="padding:2px 4px">${
    teamName
      ? `<button onclick="showMergePlayerModal('${escAttr(
          teamName
        )}','${escAttr(p.name)}','${escAttr(
          String(p.num || "")
        )}','pitcher',event)" title="Merge player" style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:12px;padding:2px 4px;border-radius:4px;line-height:1" onmouseover="this.style.color='var(--accent)'" onmouseout="this.style.color='var(--text3)'">⇢</button>`
      : ""
  }</td>
</tr>`;
        })
        .join("")}</tbody>
    </table>`;
}

function buildTeamSplitsTab(players, teamName, games, pitchers) {
  const hasBatters = players && players.length > 0;
  const hasPitchers = pitchers && pitchers.length > 0;
  if (!hasBatters && !hasPitchers)
    return '<div class="empty-state" style="padding:30px">No player data</div>';

  const sorted = hasBatters ? [...players].sort((a, b) => b.ab - a.ab) : [];
  const sortedPitchers = hasPitchers
    ? [...pitchers].sort((a, b) => b.pitches - a.pitches)
    : [];

  const batterBtns = sorted
    .map(
      (p) =>
        `<button onclick="showTeamSplitsForPlayer('${escAttr(
          teamName
        )}','${escAttr(p.name)}','batter')"
      id="tsplit-btn-${escAttr(p.name)}"
      style="padding:5px 12px;border:1px solid var(--border2);border-radius:20px;background:var(--surface3);color:var(--text2);font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:12px;cursor:pointer;transition:all .14s;white-space:nowrap"
      onmouseover="this.style.borderColor='var(--accent)';this.style.color='var(--accent)'"
      onmouseout="if(!this.classList.contains('active')){this.style.borderColor='var(--border2)';this.style.color='var(--text2)'}">
      #${p.num || "?"} ${escHtml(p.name)}
    </button>`
    )
    .join("");

  const pitcherBtns = sortedPitchers
    .map(
      (p) =>
        `<button onclick="showTeamSplitsForPlayer('${escAttr(
          teamName
        )}','${escAttr(p.name)}','pitcher')"
      id="tsplit-btn-${escAttr(p.name)}"
      style="padding:5px 12px;border:1px solid var(--border2);border-radius:20px;background:var(--surface3);color:var(--text2);font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:12px;cursor:pointer;transition:all .14s;white-space:nowrap"
      onmouseover="this.style.borderColor='var(--accent)';this.style.color='var(--accent)'"
      onmouseout="if(!this.classList.contains('active')){this.style.borderColor='var(--border2)';this.style.color='var(--text2)'}">
      #${p.num || "?"} ${escHtml(p.name)}
    </button>`
    )
    .join("");

  const first = sorted[0];
  const firstContent = first
    ? buildPlayerSplitsTab(teamName, first.name, games)
    : sortedPitchers[0]
    ? buildPitcherSplitsTab(
        teamName,
        sortedPitchers[0].name,
        games,
        getPitcherPitches(teamName, sortedPitchers[0].name, games)
      )
    : "";

  const hasBoth = hasBatters && hasPitchers;
  const innerToggle = hasBoth
    ? `
    <div style="display:flex;gap:0;margin-bottom:14px;border-bottom:2px solid var(--border)">
      <button id="tsplit-mode-batters" onclick="switchTeamSplitsMode('batters','${escAttr(
        teamName
      )}')"
style="padding:6px 18px;border:none;background:none;font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:13px;letter-spacing:1px;cursor:pointer;color:var(--accent);border-bottom:2px solid var(--accent);margin-bottom:-2px">BATTERS</button>
      <button id="tsplit-mode-pitchers" onclick="switchTeamSplitsMode('pitchers','${escAttr(
        teamName
      )}')"
style="padding:6px 18px;border:none;background:none;font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:13px;letter-spacing:1px;cursor:pointer;color:var(--text3);border-bottom:2px solid transparent;margin-bottom:-2px">PITCHERS</button>
    </div>`
    : "";

  return `<div>
    ${innerToggle}
    <div id="tsplit-batter-bar" style="display:${
      hasBatters ? "flex" : "none"
    };flex-wrap:wrap;gap:6px;margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--border)">
      ${batterBtns}
    </div>
    <div id="tsplit-pitcher-bar" style="display:none;flex-wrap:wrap;gap:6px;margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--border)">
      ${pitcherBtns}
    </div>
    <div id="tsplit-content">${firstContent}</div>
  </div>`;
}

function switchTeamSplitsMode(mode, teamName) {
  const batterBar = document.getElementById("tsplit-batter-bar");
  const pitcherBar = document.getElementById("tsplit-pitcher-bar");
  const btnB = document.getElementById("tsplit-mode-batters");
  const btnP = document.getElementById("tsplit-mode-pitchers");
  if (batterBar) batterBar.style.display = mode === "batters" ? "flex" : "none";
  if (pitcherBar)
    pitcherBar.style.display = mode === "pitchers" ? "flex" : "none";
  if (btnB) {
    btnB.style.color = mode === "batters" ? "var(--accent)" : "var(--text3)";
    btnB.style.borderBottomColor =
      mode === "batters" ? "var(--accent)" : "transparent";
  }
  if (btnP) {
    btnP.style.color = mode === "pitchers" ? "var(--accent)" : "var(--text3)";
    btnP.style.borderBottomColor =
      mode === "pitchers" ? "var(--accent)" : "transparent";
  }
  // Clear active state on all player buttons
  document.querySelectorAll('[id^="tsplit-btn-"]').forEach((b) => {
    b.classList.remove("active");
    b.style.background = "var(--surface3)";
    b.style.borderColor = "var(--border2)";
    b.style.color = "var(--text2)";
  });
  document.getElementById("tsplit-content").innerHTML = "";
}

function showTeamSplitsForPlayer(teamName, playerName, type) {
  const games = getTeamGames(teamName);
  const content = document.getElementById("tsplit-content");
  if (content) {
    if (type === "pitcher") {
      const allPitches = getPitcherPitches(teamName, playerName, games);
      content.innerHTML = buildPitcherSplitsTab(
        teamName,
        playerName,
        games,
        allPitches
      );
    } else {
      content.innerHTML = buildPlayerSplitsTab(teamName, playerName, games);
    }
  }
  // Update active button
  document.querySelectorAll('[id^="tsplit-btn-"]').forEach((b) => {
    const isActive = b.id === "tsplit-btn-" + playerName;
    b.classList.toggle("active", isActive);
    b.style.background = isActive ? "rgba(204,26,26,.08)" : "var(--surface3)";
    b.style.borderColor = isActive ? "var(--accent)" : "var(--border2)";
    b.style.color = isActive ? "var(--accent)" : "var(--text2)";
  });
}

function buildTeamBaserunningTable(players, teamName, games) {
  if (!players.length) return '<div class="empty-state">No player data</div>';
  const rows = players.map((p) => {
    // Use alias-resolved aggregated values from getTeamRoster() for consistency
    const r = p.r || 0;
    const rbi = p.rbi || 0;
    const sb = p.sb || 0;
    const cs = p.cs || 0;
    const po = p.po || 0;
    // Only iterate games for game-log derived adv stats (no batter stat lookup)
    let wpAdv = 0,
      pbAdv = 0,
      errAdv = 0;
    const aliases = _nameAliases[p.name] || new Set([p.name]);
    games.forEach((g) => {
      (g.gameLog || []).forEach((e) => {
        const txt = (e.title || "") + (e.detail || "");
        if (![...aliases].some((n) => txt.includes(n))) return;
        if (txt.includes("Wild Pitch") && txt.includes("→")) wpAdv++;
        if (txt.includes("Passed Ball") && txt.includes("→")) pbAdv++;
        if (txt.includes("Advances on Error") && txt.includes("→")) errAdv++;
      });
    });
    const att = sb + cs;
    const sbPct = att > 0 ? Math.round((sb / att) * 100) + "%" : "—";
    return `<tr class="player-row" data-team="${escAttr(
      teamName
    )}" data-name="${escAttr(p.name)}" onclick="hubNavPlayer(this,'player')">
      <td>${escHtml(p.name)}</td>
      <td class="dim">${p.pos || "—"}</td>
      <td>${r}</td>
      <td>${rbi}</td>
      <td class="${sb > 0 ? "accent" : ""}">${sb}</td>
      <td>${cs}</td>
      <td>${att}</td>
      <td>${sbPct}</td>
      <td>${po}</td>
      <td class="dim">${wpAdv + pbAdv + errAdv}</td>
    </tr>`;
  });

  return `<div class="section-title" style="margin-bottom:10px">Baserunning</div>
    <table class="data-table" id="hub-baserunning-table">
    <thead><tr>
      <th onclick="teamTabSort('hub-baserunning-table',0)" style="cursor:pointer">Player</th>
      <th onclick="teamTabSort('hub-baserunning-table',1)" style="cursor:pointer">Pos</th>
      <th onclick="teamTabSort('hub-baserunning-table',2)" style="cursor:pointer">R</th>
      <th onclick="teamTabSort('hub-baserunning-table',3)" style="cursor:pointer">RBI</th>
      <th onclick="teamTabSort('hub-baserunning-table',4)" style="cursor:pointer">SB</th>
      <th onclick="teamTabSort('hub-baserunning-table',5)" style="cursor:pointer">CS</th>
      <th onclick="teamTabSort('hub-baserunning-table',6)" style="cursor:pointer">Att</th>
      <th onclick="teamTabSort('hub-baserunning-table',7)" style="cursor:pointer">SB%</th>
      <th onclick="teamTabSort('hub-baserunning-table',8)" style="cursor:pointer">PO</th>
      <th onclick="teamTabSort('hub-baserunning-table',9)" style="cursor:pointer">Adv</th>
    </tr></thead>
    <tbody>${rows.join("")}</tbody>
  </table>`;
}

function buildTeamDefenseTable(teamName, games) {
  const byPlayer = {};
  // Also count double plays from game log
  const dpByPlayer = {};
  games.forEach((g) => {
    Object.values(g.fieldingStats || {}).forEach((f) => {
      if (f.team !== teamName) return;
      const k = f.name;
      if (!byPlayer[k])
        byPlayer[k] = { name: f.name, pos: f.pos, po: 0, a: 0, e: 0 };
      byPlayer[k].pos = f.pos || byPlayer[k].pos;
      byPlayer[k].po += f.po || 0;
      byPlayer[k].a += f.a || 0;
      byPlayer[k].e += f.e || 0;
    });
    // Count errors per game for error-per-game stat
    // Count DP from game log
    (g.gameLog || []).forEach((e) => {
      if ((e.title || "").includes("Double Play")) {
        // Can't easily attribute to individual without assist tracking yet
      }
    });
  });

  // Team totals
  let tPO = 0,
    tA = 0,
    tE = 0;
  Object.values(byPlayer).forEach((p) => {
    tPO += p.po;
    tA += p.a;
    tE += p.e;
  });
  const tTC = tPO + tA + tE;
  const tFpct = tTC > 0 ? _fmtRate((tPO + tA) / tTC) : "—";

  const rows = Object.values(byPlayer)
    .filter((p) => p.po + p.a + p.e > 0)
    .sort((a, b) => b.po + b.a - (a.po + a.a))
    .map((p) => {
      const tc = p.po + p.a + p.e;
      const fpct = tc > 0 ? _fmtRate((p.po + p.a) / tc) : "—";
      return `<tr class="player-row" data-team="${escAttr(
        teamName
      )}" data-name="${escAttr(p.name)}" onclick="hubNavPlayer(this,'player')">
<td>${escHtml(p.name)}</td>
<td class="dim">${p.pos || "—"}</td>
<td class="accent">${p.po}</td>
<td>${p.a}</td>
<td class="${p.e > 0 ? "highlight" : ""}">${p.e}</td>
<td>${tc}</td>
<td>${fpct}</td>
      </tr>`;
    });

  if (!rows.length)
    return '<div class="empty-state" style="padding:30px">No defensive plays recorded yet.<br><span style="font-size:12px;color:var(--text3)">Putouts and errors are tracked when you select a fielder on outs and errors.</span></div>';

  return `<div class="section-title" style="margin-bottom:10px">Team Defense</div>
    <div class="stat-cards" style="margin-bottom:16px">
      <div class="stat-card accent"><div class="stat-card-val">${tPO}</div><div class="stat-card-lbl">Team PO</div></div>
      <div class="stat-card"><div class="stat-card-val">${tA}</div><div class="stat-card-lbl">Team A</div></div>
      <div class="stat-card"><div class="stat-card-val">${tE}</div><div class="stat-card-lbl">Team E</div></div>
      <div class="stat-card"><div class="stat-card-val">${tFpct}</div><div class="stat-card-lbl">Team FPCT</div></div>
    </div>
    <table class="data-table" id="hub-defense-table">
    <thead><tr>
      <th onclick="teamTabSort('hub-defense-table',0)" style="cursor:pointer">Player</th>
      <th onclick="teamTabSort('hub-defense-table',1)" style="cursor:pointer">Pos</th>
      <th onclick="teamTabSort('hub-defense-table',2)" style="cursor:pointer">PO</th>
      <th onclick="teamTabSort('hub-defense-table',3)" style="cursor:pointer">A</th>
      <th onclick="teamTabSort('hub-defense-table',4)" style="cursor:pointer">E</th>
      <th onclick="teamTabSort('hub-defense-table',5)" style="cursor:pointer">TC</th>
      <th onclick="teamTabSort('hub-defense-table',6)" style="cursor:pointer">FPCT</th>
    </tr></thead>
    <tbody>${rows.join("")}</tbody>
  </table>`;
}

function buildTeamGamesList(games, teamName) {
  if (!games.length) return '<div class="empty-state">No games</div>';
  return (
    `<div class="section-title">Game Results</div>` +
    games
      .map((g) => {
        const isHome = g.homeTeam === teamName;
        const opp = isHome ? g.awayTeam : g.homeTeam;
        const tf = isHome ? g.homeScore : g.awayScore;
        const ta = isHome ? g.awayScore : g.homeScore;
        const result = tf > ta ? "W" : tf < ta ? "L" : "T";
        const cls =
          result === "W"
            ? "badge-win"
            : result === "L"
            ? "badge-loss"
            : "badge-tie";
        return `<div class="game-row" onclick="showView('game','${g.id}')">
<div class="game-date">${g.date}</div>
<span class="badge ${cls}">${result}</span>
<div class="game-teams">${isHome ? "vs" : "@"} ${escHtml(opp)}</div>
<div class="game-score">${tf}–${ta}</div>
<div class="game-pitches">${g.totalPitches || 0}P</div>
<button onclick="event.stopPropagation();exportGameData('${
          g.id
        }')" title="Export this game" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:12px;padding:3px 5px;border-radius:4px;transition:all .13s" onmouseover="this.style.color='var(--accent)'" onmouseout="this.style.color='var(--text3)'">⬇</button>
<button class="del-btn" onclick="event.stopPropagation();promptDeleteGame('${
          g.id
        }','${escHtml(
          isHome ? opp + " @ " + teamName : teamName + " @ " + opp
        )} (${
          g.date
        })')"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="14" viewBox="0 0 13 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="1,3 12,3"/><path d="M4,3V2a1,1,0,0,1,1-1h3a1,1,0,0,1,1,1V3"/><path d="M2,3l.7,8.5A1,1,0,0,0,3.7,12.5h5.6a1,1,0,0,0,1-.99L11,3"/><line x1="5" y1="6" x2="5" y2="10"/><line x1="8" y1="6" x2="8" y2="10"/></svg></button>
      </div>`;
      })
      .join("")
  );
}

// ===== PLAYER VIEW =====
// ===== PLAYER PITCH DATA HELPERS =====
function getPlayerPitches(teamName, playerName, games) {
  // Collect all pitch log entries where this player was the batter.
  // Use the alias set so records stored under an older name variant are found.
  const names = _nameAliases[playerName] || new Set([playerName]);
  const pitches = [];
  games.forEach((g) => {
    (g.pitchLog || []).forEach((p) => {
      if (names.has(p.batter))
        pitches.push({ ...p, gameDate: g.date, gameId: g.id });
    });
  });
  return pitches;
}

function getPitcherPitches(teamName, pitcherName, games) {
  // Collect all pitch log entries thrown by this pitcher.
  // Use the alias set so records stored under an older name variant are found.
  const names = _nameAliases[pitcherName] || new Set([pitcherName]);
  const pitches = [];
  games.forEach((g) => {
    (g.pitchLog || []).forEach((p) => {
      // Use isTop to infer pitching team structurally — this is reliable
      // even after import normalizes g.awayTeam/g.homeTeam casing, since
      // p.pitcherTeam in pitchLog entries is not updated during import.
      const pTeam =
        p.isTop !== undefined
          ? p.isTop
            ? g.homeTeam
            : g.awayTeam
          : p.pitcherTeam;
      if (names.has(p.pitcher) && pTeam === teamName)
        pitches.push({ ...p, gameDate: g.date, gameId: g.id });
    });
  });
  return pitches;
}

// ===== SPRAY CHART SVG — matches tracker field exactly =====
// Tracker field: viewBox 560x510, home plate at (280,468)
// Spray coords stored as raw SVG x,y in that 560x510 space
function buildSprayChartSVG(pitches) {
  const inPlay = pitches.filter(
    (p) => p.spray && p.spray.x != null && p.spray.y != null
  );

  // Home plate position in the 560x510 field
  const HX = 280,
    HY = 468;

  // Color by outcome
  const hitColor = (p) => {
    const o = p.outcome;
    if (o === "homerun") return "#e8c84a";
    if (o === "triple") return "#c084f5";
    if (o === "double") return "#5baef5";
    if (o === "single") return "#4ae88a";
    if (o === "error") return "#f5a050";
    return "#e84a4a"; // out - red
  };

  // Build trajectory path — apex always toward CF (top center of field ≈ x=280,y=50)
  function trajectory(tx, ty, btype) {
    if (btype === "flyball" || btype === "popup") {
      // Midpoint between home plate and landing spot
      const mx = (HX + tx) / 2,
        my = (HY + ty) / 2;
      // Vector from midpoint toward CF (280,50) — perpendicular push toward center
      const cfX = 280,
        cfY = 50;
      const toCFx = cfX - mx,
        toCFy = cfY - my;
      const toCFlen = Math.sqrt(toCFx * toCFx + toCFy * toCFy) || 1;
      // Apex offset: fly balls big arc, popups tight arc
      const arcStrength = btype === "popup" ? 0.28 : 0.42;
      const dist = Math.sqrt((tx - HX) ** 2 + (ty - HY) ** 2);
      const push = dist * arcStrength;
      const cx = mx + (toCFx / toCFlen) * push;
      const cy = my + (toCFy / toCFlen) * push;
      return {
        d: `M ${HX} ${HY} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${tx} ${ty}`,
        style: "solid",
      };
    }
    if (btype === "linedrive") {
      return { d: `M ${HX} ${HY} L ${tx} ${ty}`, style: "dashed" };
    }
    // groundball / weakgrounder / default
    return { d: `M ${HX} ${HY} L ${tx} ${ty}`, style: "dotted" };
  }

  const paths = inPlay
    .map((p) => {
      const { d, style } = trajectory(p.spray.x, p.spray.y, p.spray.btype);
      const col = hitColor(p);
      const isOut = ![
        "single",
        "double",
        "triple",
        "homerun",
        "error",
      ].includes(p.outcome);
      const dashArray =
        style === "dashed" ? "10,6" : style === "dotted" ? "3,6" : "none";
      const lw = isOut ? 1.6 : 2.4;
      const op = isOut ? 0.45 : 0.9;
      const r = isOut ? 4.5 : 6;
      return `<path d="${d}" fill="none" stroke="${col}" stroke-width="${lw}"
      stroke-dasharray="${dashArray}" stroke-linecap="round" opacity="${op}"/>
    <circle cx="${p.spray.x}" cy="${p.spray.y}" r="${r}"
      fill="${col}" opacity="${op}" stroke="#fff" stroke-width="1.2"/>`;
    })
    .join("");

  const empty =
    inPlay.length === 0
      ? `<text x="280" y="260" text-anchor="middle" fill="rgba(255,255,255,.3)" font-size="14" font-family="Barlow Condensed" letter-spacing="1">NO SPRAY DATA YET</text>`
      : "";

  return `<svg viewBox="0 0 560 510" xmlns="http://www.w3.org/2000/svg"
    style="width:100%;max-width:560px;border-radius:10px;border:1px solid #2a5a2a;display:block">

    <!-- Background -->
    <rect width="560" height="510" fill="#111a0d"/>

    <!-- Full fair territory grass -->
    <path d="M280,480 L18,220 Q280,-60 542,220 Z" fill="#1a2e14"/>

    <!-- Warning track -->
    <path d="M280,480 L18,220 Q280,-60 542,220 Z" fill="none" stroke="#3a2510" stroke-width="26"/>

    <!-- Foul territory -->
    <path d="M280,480 L18,220 L0,510 Z"   fill="#0f1a0a" opacity=".6"/>
    <path d="M280,480 L542,220 L560,510 Z" fill="#0f1a0a" opacity=".6"/>

    <!-- Foul lines -->
    <line x1="280" y1="480" x2="20"  y2="200" stroke="rgba(255,255,255,.3)" stroke-width="2"/>
    <line x1="280" y1="480" x2="540" y2="200" stroke="rgba(255,255,255,.3)" stroke-width="2"/>

    <!-- Infield dirt -->
    <path d="M280,470 L145,335 L280,200 L415,335 Z" fill="#3e2810"/>
    <!-- Infield grass -->
    <path d="M280,440 L172,332 L280,224 L388,332 Z" fill="#1a2e14"/>

    <!-- Base paths -->
    <line x1="280" y1="440" x2="172" y2="332" stroke="rgba(255,255,255,.22)" stroke-width="1.5"/>
    <line x1="172" y1="332" x2="280" y2="224" stroke="rgba(255,255,255,.22)" stroke-width="1.5"/>
    <line x1="280" y1="224" x2="388" y2="332" stroke="rgba(255,255,255,.22)" stroke-width="1.5"/>
    <line x1="388" y1="332" x2="280" y2="440" stroke="rgba(255,255,255,.22)" stroke-width="1.5"/>

    <!-- Bases -->
    <polygon points="270,458 290,458 290,468 280,478 270,468" fill="#f0ebe0"/>
    <rect x="163" y="323" width="18" height="18" rx="2" fill="#f0ebe0" transform="rotate(45 172 332)"/>
    <rect x="271" y="215" width="18" height="18" rx="2" fill="#f0ebe0" transform="rotate(45 280 224)"/>
    <rect x="379" y="323" width="18" height="18" rx="2" fill="#f0ebe0" transform="rotate(45 388 332)"/>

    <!-- Mound -->
    <circle cx="280" cy="340" r="16" fill="#4a3010" stroke="rgba(255,255,255,.15)" stroke-width="1"/>
    <circle cx="280" cy="340" r="4"  fill="rgba(255,255,255,.35)"/>

    <!-- Trajectory lines and landing dots drawn on top -->
    ${paths}
    ${empty}
  </svg>`;
}

// ===== PITCH TYPE FILTER BAR =====
function buildPitchTypeFilterBar(pitches, svgContainerId) {
  // Get unique pitch types actually thrown
  const types = [
    ...new Set(pitches.map((p) => p.pitchType).filter((t) => t && t !== "—")),
  ].sort(
    (a, b) =>
      pitches.filter((p) => p.pitchType === b).length -
      pitches.filter((p) => p.pitchType === a).length
  );
  if (!types.length) return "";

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
  const counts = {};
  types.forEach((t) => {
    counts[t] = pitches.filter((p) => p.pitchType === t).length;
  });

  const btnId = svgContainerId + "-filter";
  const buttons = types
    .map(
      (t) => `
    <button data-pt-filter="${t}" data-container="${svgContainerId}"
      onclick="togglePitchTypeFilter(this)"
      style="display:inline-flex;align-items:center;gap:4px;padding:4px 8px;
border:1.5px solid ${typeColors[t] || "#8a909e"};border-radius:20px;
background:${typeColors[t] || "#8a909e"};color:white;
font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:11px;
letter-spacing:1px;cursor:pointer;transition:all .15s;white-space:nowrap">
      ${t} <span style="opacity:0.8;font-weight:400">${counts[t]}</span>
    </button>`
    )
    .join("");

  return `<div id="${btnId}" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;align-items:center">
    <button onclick="selectAllPitchTypes('${svgContainerId}')" data-all-active="true"
      style="padding:4px 10px;border:1.5px solid var(--border);border-radius:20px;
background:var(--surface2);color:var(--text2);
font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:11px;
letter-spacing:1px;cursor:pointer;transition:all .15s">
      ALL
    </button>
    ${buttons}
  </div>`;
}

// Outcome / batted ball filter bar for the pitch zone
function buildOutcomeFilterBar(pitches, svgContainerId) {
  // Outcome groups we care about
  const groups = [
    { key: "strike-swinging", label: "Swing K", color: "#8a0000" },
    { key: "strike-looking", label: "Called K", color: "#c01a1a" },
    { key: "ball", label: "Ball", color: "#1a6abf" },
    { key: "foul", label: "Foul", color: "#8a4a00" },
    { key: "hbp", label: "HBP", color: "#8822cc" },
    // Batted ball types
    { key: "btype:flyball", label: "Fly Ball", color: "#1a8a3a" },
    { key: "btype:linedrive", label: "Line Drive", color: "#28a83a" },
    {
      key: "btype:groundball",
      label: "Ground Ball",
      color: "#b8860b",
    },
    {
      key: "btype:weakgrounder",
      label: "Weak Grounder",
      color: "#8a6000",
    },
    { key: "btype:popup", label: "Popup", color: "#6a3a8a" },
  ];

  // Only show groups that have pitches
  const available = groups.filter((g) => {
    if (g.key.startsWith("btype:")) {
      const bt = g.key.slice(6);
      return pitches.some((p) => p.spray?.btype === bt);
    }
    return pitches.some((p) => p.outcome === g.key);
  });
  if (!available.length) return "";

  const filterId = svgContainerId + "-outcome-filter";
  const buttons = available
    .map(
      (g) => `
    <button data-oc-filter="${g.key}" data-container="${svgContainerId}"
      onclick="toggleOutcomeZoneFilter(this)"
      style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;
border:1.5px solid ${g.color};border-radius:20px;
background:${g.color};color:white;
font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:10px;
letter-spacing:1px;cursor:pointer;transition:all .15s;white-space:nowrap">
      ${g.label}
    </button>`
    )
    .join("");

  return `<div id="${filterId}" style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px;align-items:center">
    <span style="font-size:8px;letter-spacing:2px;color:var(--text3);text-transform:uppercase;font-weight:700;margin-right:2px">Outcome</span>
    <button onclick="selectAllOutcomeZone('${svgContainerId}')" data-oc-all="true"
      style="padding:3px 8px;border:1.5px solid var(--border);border-radius:20px;
background:var(--surface2);color:var(--text2);
font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:10px;
letter-spacing:1px;cursor:pointer;transition:all .15s">ALL</button>
    ${buttons}
  </div>`;
}

function toggleOutcomeZoneFilter(btn) {
  const containerId = btn.getAttribute("data-container");
  const isActive = btn.getAttribute("data-active") === "true";
  btn.setAttribute("data-active", isActive ? "false" : "true");
  btn.style.opacity = isActive ? "0.35" : "1";
  applyZoneFilters(containerId);
}

function selectAllOutcomeZone(containerId) {
  const filterId = containerId + "-outcome-filter";
  const bar = document.getElementById(filterId);
  if (!bar) return;
  const allBtn = bar.querySelector("[data-oc-all]");
  const allActive = allBtn?.getAttribute("data-oc-all") !== "false";
  const newState = !allActive;
  if (allBtn) allBtn.setAttribute("data-oc-all", newState ? "true" : "false");
  bar.querySelectorAll("[data-oc-filter]").forEach((b) => {
    b.setAttribute("data-active", newState ? "true" : "false");
    b.style.opacity = newState ? "1" : "0.35";
  });
  applyZoneFilters(containerId);
}

// Combined filter: pitch type AND outcome — both must pass
function applyZoneFilters(containerId) {
  const ptBar = document.getElementById(containerId + "-filter");
  const ocBar = document.getElementById(containerId + "-outcome-filter");
  const svg = document.querySelector("#" + containerId + " svg");
  if (!svg) return;

  // Active pitch types
  const activePT = new Set();
  if (ptBar)
    ptBar.querySelectorAll("[data-pt-filter]").forEach((b) => {
      if (b.getAttribute("data-active") === "true")
        activePT.add(b.getAttribute("data-pt-filter"));
    });
  const showAllPT = activePT.size === 0;

  // Active outcome filters
  const activeOC = new Set();
  if (ocBar)
    ocBar.querySelectorAll("[data-oc-filter]").forEach((b) => {
      if (b.getAttribute("data-active") === "true")
        activeOC.add(b.getAttribute("data-oc-filter"));
    });
  const showAllOC = activeOC.size === 0;

  let visible = 0,
    total = 0;
  svg.querySelectorAll("circle[data-pt]").forEach((c) => {
    total++;
    const pt = c.getAttribute("data-pt");
    const oc = c.getAttribute("data-outcome") || "—";
    const bt = c.getAttribute("data-btype") || "";

    const ptOk = showAllPT || activePT.has(pt);
    let ocOk = showAllOC;
    if (!showAllOC) {
      for (const k of activeOC) {
        if (k.startsWith("btype:")) {
          if (bt === k.slice(6)) {
            ocOk = true;
            break;
          }
        } else {
          if (oc === k) {
            ocOk = true;
            break;
          }
        }
      }
    }
    const show = ptOk && ocOk;
    c.style.display = show ? "" : "none";
    if (show) visible++;
  });

  const label = document.getElementById(containerId + "-count");
  if (label)
    label.textContent = visible + " pitch" + (visible !== 1 ? "es" : "");
}

function togglePitchTypeFilter(btn) {
  const type = btn.getAttribute("data-pt-filter");
  const containerId = btn.getAttribute("data-container");
  const isActive = btn.getAttribute("data-active") === "true";
  btn.setAttribute("data-active", isActive ? "false" : "true");
  btn.style.opacity = isActive ? "0.35" : "1";
  applyPitchTypeFilter(containerId);
}

function selectAllPitchTypes(containerId) {
  const filterBar = document.getElementById(containerId + "-filter");
  if (!filterBar) return;
  const allBtn = filterBar.querySelector("[data-all-active]");
  const allActive = allBtn?.getAttribute("data-all-active") !== "false";
  const newState = !allActive;
  if (allBtn)
    allBtn.setAttribute("data-all-active", newState ? "true" : "false");
  filterBar.querySelectorAll("[data-pt-filter]").forEach((b) => {
    b.setAttribute("data-active", newState ? "true" : "false");
    b.style.opacity = newState ? "1" : "0.35";
  });
  applyPitchTypeFilter(containerId);
}

function applyPitchTypeFilter(containerId) {
  // Delegate to combined filter so pitch type + outcome work together
  applyZoneFilters(containerId);
}

// ===== PITCH ZONE SVG =====
function buildPitchZoneSVG(pitches, width = 320, height = 300) {
  if (!pitches.length) return '<div class="empty-state">No pitch data</div>';

  // Zone: 300x340 canvas in tracker, strike box 114x130 at left:93,top:105
  // We'll use a normalized 0-100% coordinate system
  // Strike zone: 31-69% x, 30.9-69.1% y (from tracker isInZone)

  const W = width,
    H = height;
  const ZX1 = W * 0.28,
    ZX2 = W * 0.72,
    ZY1 = H * 0.25,
    ZY2 = H * 0.75;
  const ZW = ZX2 - ZX1,
    ZH = ZY2 - ZY1;

  const ptColor = (p) => {
    const d = p.dotClass || "";
    if (d.startsWith("fb")) return "#5baef5";
    if (d.startsWith("br")) return "#f57a7a";
    if (d.startsWith("os")) return "#6ae87a";
    if (d === "ip-hit") return "#e8c84a";
    if (d === "ip-out") return "#c084f5";
    if (d === "hbp") return "#c84af0";
    return "#8a909e";
  };

  const ptOpacity = (p) => {
    const d = p.dotClass || "";
    if (d.endsWith("-ball")) return 0.5;
    if (d.endsWith("-foul")) return 0.65;
    if (d.endsWith("-called")) return 0.75;
    if (d.endsWith("-swing")) return 0.9;
    return 0.8;
  };

  const ptStroke = (p) => {
    const d = p.dotClass || "";
    if (d.endsWith("-ball")) return "3,3"; // dashed = ball
    return "none";
  };

  const dots = pitches
    .filter((p) => p.pitchX != null && p.pitchY != null)
    .map((p) => {
      const cx = (p.pitchX / 100) * W;
      const cy = (p.pitchY / 100) * H;
      const col = ptColor(p);
      const op = ptOpacity(p);
      const da = ptStroke(p);
      const r = 7;
      const pt = p.pitchType || "—";
      const oc = p.outcome || "—";
      const bt = p.spray?.btype || "";
      return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r}"
      fill="${col}" opacity="${op}"
      stroke="${da !== "none" ? col : "#fff"}" stroke-width="${
        da !== "none" ? 1.5 : 0.8
      }"
      stroke-dasharray="${da}" data-pt="${pt}" data-outcome="${oc}" data-btype="${bt}"/>`;
    })
    .join("");

  // Count pitch totals per zone quadrant for heatmap overlay
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"
    style="width:100%;max-width:${W}px;background:#f8f9fb;border-radius:10px;border:1.5px solid #bfc4cf">
    <!-- Chase zone -->
    <rect x="${W * 0.12}" y="${H * 0.1}" width="${W * 0.76}" height="${
    H * 0.8
  }" rx="4"
      fill="rgba(0,0,0,.025)" stroke="rgba(0,0,0,.06)" stroke-width="1"/>
    <!-- Strike zone -->
    <rect x="${ZX1}" y="${ZY1}" width="${ZW}" height="${ZH}"
      fill="rgba(204,26,26,.04)" stroke="rgba(0,0,0,.25)" stroke-width="2"/>
    <!-- Zone grid lines (3x3) -->
    <line x1="${ZX1 + ZW / 3}" y1="${ZY1}" x2="${
    ZX1 + ZW / 3
  }" y2="${ZY2}" stroke="rgba(0,0,0,.1)" stroke-width="1"/>
    <line x1="${ZX1 + (ZW * 2) / 3}" y1="${ZY1}" x2="${
    ZX1 + (ZW * 2) / 3
  }" y2="${ZY2}" stroke="rgba(0,0,0,.1)" stroke-width="1"/>
    <line x1="${ZX1}" y1="${ZY1 + ZH / 3}" x2="${ZX2}" y2="${
    ZY1 + ZH / 3
  }" stroke="rgba(0,0,0,.1)" stroke-width="1"/>
    <line x1="${ZX1}" y1="${ZY1 + (ZH * 2) / 3}" x2="${ZX2}" y2="${
    ZY1 + (ZH * 2) / 3
  }" stroke="rgba(0,0,0,.1)" stroke-width="1"/>
    <!-- Labels -->
    <text x="${W / 2}" y="${
    H * 0.08
  }" text-anchor="middle" font-family="Share Tech Mono" font-size="9" fill="#8a909e" letter-spacing="1">HIGH</text>
    <text x="${W / 2}" y="${
    H * 0.97
  }" text-anchor="middle" font-family="Share Tech Mono" font-size="9" fill="#8a909e" letter-spacing="1">LOW</text>
    <text x="${W * 0.04}" y="${
    H / 2
  }" text-anchor="middle" font-family="Share Tech Mono" font-size="9" fill="#8a909e" letter-spacing="1" transform="rotate(-90,${
    W * 0.04
  },${H / 2})">IN</text>
    <text x="${W * 0.97}" y="${
    H / 2
  }" text-anchor="middle" font-family="Share Tech Mono" font-size="9" fill="#8a909e" letter-spacing="1" transform="rotate(90,${
    W * 0.97
  },${H / 2})">OUT</text>
    <!-- Pitch dots -->
    ${dots}
    <!-- Home plate (catcher's view — tip points down toward catcher) -->
    ${_homePlateSVG(W / 2, H * 0.925, W / 155)}
  </svg>`;
}

// ===== OUTCOME BREAKDOWN RENDERER (called on pitch type filter change) =====
function renderOutcomeBreakdown(containerId, pitches) {
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
  const outLabels = {
    ball: "Ball",
    "strike-swinging": "Swing K",
    "strike-looking": "Called K",
    foul: "Foul",
    "ip-hit": "In Play (Hit)",
    "ip-out": "In Play (Out)",
    hbp: "HBP",
    ci: "CI",
  };
  const outColors = {
    ball: "#1a6abf",
    "strike-swinging": "#8a0000",
    "strike-looking": "#c01a1a",
    foul: "#8a4a00",
    "ip-hit": "#9a7a00",
    "ip-out": "#6a1ab0",
    hbp: "#8822cc",
    ci: "#8822cc",
  };

  const total = pitches.length;
  const outcomeMap = {
    ball: 0,
    "strike-swinging": 0,
    "strike-looking": 0,
    foul: 0,
    "ip-hit": 0,
    "ip-out": 0,
    hbp: 0,
    ci: 0,
  };
  pitches.forEach((p) => {
    const o = p.outcome;
    if (o === "ball") outcomeMap.ball++;
    else if (o === "strike-swinging") outcomeMap["strike-swinging"]++;
    else if (o === "strike-looking") outcomeMap["strike-looking"]++;
    else if (o === "foul") outcomeMap.foul++;
    else if (["single", "double", "triple", "homerun", "error"].includes(o))
      outcomeMap["ip-hit"]++;
    else if (
      ["groundout", "flyout", "lineout", "sacfly", "sacbunt"].includes(o)
    )
      outcomeMap["ip-out"]++;
    else if (o === "hbp") outcomeMap.hbp++;
    else if (o === "ci") outcomeMap.ci++;
  });

  // Bar rows
  const barHTML =
    Object.entries(outcomeMap)
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([o, n]) => {
        const pct = total > 0 ? Math.round((n / total) * 100) : 0;
        const lbl = outLabels[o] || o;
        const clr = outColors[o] || "#8a909e";
        return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:11px;font-weight:600;color:#4a5060;width:110px;flex-shrink:0">${lbl}</div>
      <div style="flex:1;background:#e8eaee;border-radius:3px;height:14px;overflow:hidden">
<div style="width:${pct}%;height:100%;background:${clr};border-radius:3px"></div>
      </div>
      <div style="font-family:'Share Tech Mono',monospace;font-size:10px;color:#8a909e;width:42px;text-align:right;flex-shrink:0">${n} · ${pct}%</div>
    </div>`;
      })
      .join("") ||
    '<div style="color:#8a909e;font-size:12px">No outcomes</div>';

  // Pie slices
  const slices = Object.entries(outcomeMap)
    .filter(([, n]) => n > 0)
    .map(([o, n]) => ({
      label: outLabels[o] || o,
      value: n,
      color: outColors[o] || "#8a909e",
    }));
  const pieHTML = buildPieChart(slices, 130);

  // Rebuild pitch mix (type) pie from filtered pitches
  const typeColors2 = {
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
  const typeCount = {};
  pitches.forEach((p) => {
    const t = p.pitchType && p.pitchType !== "—" ? p.pitchType : "UNKN";
    typeCount[t] = (typeCount[t] || 0) + 1;
  });
  const typeSlices2 = Object.entries(typeCount)
    .filter(([, n]) => n > 0)
    .map(([t, n]) => ({
      label: t,
      value: n,
      color: typeColors2[t] || "#8a909e",
    }));

  // Update bar view
  const barEl = document.getElementById(containerId + "-outcome-bars");
  if (barEl) barEl.innerHTML = barHTML;

  // Update outcome pie
  const pieEl = document.getElementById(containerId + "-outcome-pie");
  if (pieEl) pieEl.innerHTML = pieHTML;

  // Update pitch mix pie
  const typePieEl = document.getElementById(containerId + "-type-pie");
  if (typePieEl) typePieEl.innerHTML = buildPieChart(typeSlices2, 130);

  // Update total label
  const lblEl = document.getElementById(containerId + "-outcome-total");
  if (lblEl) lblEl.textContent = `Outcome Breakdown · ${total} pitches`;
}

function toggleOutcomeFilter(btn, containerId) {
  const type = btn.getAttribute("data-of-type");
  const isActive = btn.getAttribute("data-active") !== "false";
  btn.setAttribute("data-active", isActive ? "false" : "true");
  btn.style.opacity = isActive ? "0.35" : "1";
  applyOutcomeFilter(containerId);
}

function selectAllOutcomeFilters(containerId) {
  const bar = document.getElementById(containerId + "-of-bar");
  if (!bar) return;
  const allBtn = bar.querySelector("[data-all-active]");
  const allActive = allBtn?.getAttribute("data-all-active") !== "false";
  const newState = !allActive;
  if (allBtn)
    allBtn.setAttribute("data-all-active", newState ? "true" : "false");
  bar.querySelectorAll("[data-of-type]").forEach((b) => {
    b.setAttribute("data-active", newState ? "true" : "false");
    b.style.opacity = newState ? "1" : "0.35";
  });
  applyOutcomeFilter(containerId);
}

function toggleBtypeFilter(btn, containerId) {
  const isActive = btn.getAttribute("data-active") === "true";
  btn.setAttribute("data-active", isActive ? "false" : "true");
  btn.style.opacity = isActive ? "0.35" : "1";
  applyOutcomeFilter(containerId);
}

function selectAllBtypes(containerId) {
  const bar = document.getElementById(containerId + "-btype-bar");
  if (!bar) return;
  const allBtn = bar.querySelector("[data-btype-all]");
  const allActive = allBtn?.getAttribute("data-btype-all") !== "false";
  const newState = !allActive;
  if (allBtn)
    allBtn.setAttribute("data-btype-all", newState ? "true" : "false");
  bar.querySelectorAll("[data-btype-filter]").forEach((b) => {
    b.setAttribute("data-active", newState ? "true" : "false");
    b.style.opacity = newState ? "1" : "0.35";
  });
  applyOutcomeFilter(containerId);
}

function applyOutcomeFilter(containerId) {
  const bar = document.getElementById(containerId + "-of-bar");
  const container = document.getElementById(containerId);
  if (!bar || !container) return;

  const activeTypes = new Set();
  bar.querySelectorAll("[data-of-type]").forEach((b) => {
    if (b.getAttribute("data-active") !== "false")
      activeTypes.add(b.getAttribute("data-of-type"));
  });

  // Get stored pitches from data attribute
  let pitches = [];
  try {
    pitches = JSON.parse(container.getAttribute("data-pitches") || "[]");
  } catch (e) {}

  const filtered =
    activeTypes.size === 0
      ? pitches
      : pitches.filter((p) => activeTypes.has(p.pitchType || "—"));

  // Also apply batted ball type filter if active
  const btypeBar = document.getElementById(containerId + "-btype-bar");
  const activeBtypes = new Set();
  if (btypeBar)
    btypeBar.querySelectorAll("[data-btype-filter]").forEach((b) => {
      if (b.getAttribute("data-active") === "true")
        activeBtypes.add(b.getAttribute("data-btype-filter"));
    });
  const finalFiltered =
    activeBtypes.size === 0
      ? filtered
      : filtered.filter((p) => activeBtypes.has(p.btype || ""));
  renderOutcomeBreakdown(containerId, finalFiltered);

  // Also update Pitch Arsenal stats and Results Against if they exist on the page
  const pmixContainer = document.getElementById("pmix-container");
  if (pmixContainer) {
    let allPitches = [];
    try {
      allPitches = JSON.parse(
        pmixContainer.getAttribute("data-all-pitches") || "[]"
      );
    } catch (e) {}
    const showAll = activeTypes.size === 0;
    const _ptFiltered = showAll
      ? allPitches
      : allPitches.filter((p) => activeTypes.has(p.pitchType || "—"));
    const pmixFiltered =
      activeBtypes.size === 0
        ? _ptFiltered
        : _ptFiltered.filter((p) => activeBtypes.has(p.btype || ""));
    const arsenalTitle = document.getElementById("pmix-arsenal-title");
    const arsenalStats = document.getElementById("pmix-arsenal-stats");
    const resultsEl = document.getElementById("pmix-results");
    const label = showAll
      ? `Pitch Arsenal · ${allPitches.length} pitches`
      : `Pitch Arsenal · ${[...activeTypes].join("+")} · ${
          pmixFiltered.length
        } pitches`;
    if (arsenalTitle) arsenalTitle.textContent = label;
    // Only update the stat cards — the breakdown chart/filter below stays untouched
    if (arsenalStats) arsenalStats.innerHTML = buildArsenalStats(pmixFiltered);
    if (resultsEl)
      resultsEl.innerHTML = pmixFiltered.length
        ? buildPitcherResultsBreakdown(pmixFiltered)
        : '<div class="empty-state" style="padding:20px 0">No pitches for selection</div>';
  }
}

// ===== PITCH BREAKDOWN CHARTS =====

// ===== PIE CHART BUILDER =====
function buildPieChart(slices, size = 130) {
  // slices: [{label, value, color}]
  const total = slices.reduce((a, s) => a + s.value, 0);
  if (!total)
    return '<div style="color:var(--text3);font-size:11px">No data</div>';
  let cumAngle = -Math.PI / 2; // start at top
  const cx = size / 2,
    cy = size / 2,
    r = size / 2 - 2;
  const rLabel = r * 0.65; // label radius — 65% out from center
  let paths = "",
    labels = "";

  slices
    .filter((s) => s.value > 0)
    .forEach((s) => {
      const angle = (s.value / total) * Math.PI * 2;
      const x1 = cx + r * Math.cos(cumAngle),
        y1 = cy + r * Math.sin(cumAngle);
      const midAngle = cumAngle + angle / 2; // midpoint angle for label placement
      cumAngle += angle;
      const x2 = cx + r * Math.cos(cumAngle),
        y2 = cy + r * Math.sin(cumAngle);
      const large = angle > Math.PI ? 1 : 0;
      const pct = Math.round((s.value / total) * 100);

      paths += `<path d="M${cx},${cy} L${x1.toFixed(1)},${y1.toFixed(
        1
      )} A${r},${r} 0 ${large},1 ${x2.toFixed(1)},${y2.toFixed(1)} Z"
      fill="${s.color}" stroke="white" stroke-width="1.5" opacity="0.9">
      <title>${s.label}: ${s.value} (${pct}%)</title></path>`;

      // Only show label if slice is big enough to fit text (>= 8%)
      if (pct >= 8) {
        const lx = (cx + rLabel * Math.cos(midAngle)).toFixed(1);
        const ly = (cy + rLabel * Math.sin(midAngle)).toFixed(1);
        const isLight =
          s.color === "#9a7a00" ||
          s.color === "#4a9ec8" ||
          s.color === "#8a8a00" ||
          s.color === "#28a83a";
        const textColor = isLight ? "#111" : "white";
        const outlineColor = isLight ? "white" : "#111";
        const fs = pct >= 15 ? 11 : 9;
        labels += `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle"
font-family="Barlow Condensed,sans-serif" font-weight="400" font-size="${fs}"
fill="${outlineColor}" stroke="${outlineColor}" stroke-width="3" stroke-linejoin="round"
paint-order="stroke" pointer-events="none">${pct}%</text>
      <text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle"
font-family="Barlow Condensed,sans-serif" font-weight="400" font-size="${fs}"
fill="${textColor}" pointer-events="none">${pct}%</text>`;
      }
    });

  // Legend
  const legend = slices
    .filter((s) => s.value > 0)
    .map(
      (s) => `
    <div style="display:flex;align-items:center;gap:5px;font-size:10px;color:var(--text2)">
      <div style="width:8px;height:8px;border-radius:2px;background:${
        s.color
      };flex-shrink:0"></div>
      <span>${s.label}</span>
      <span style="color:var(--text3);margin-left:auto;padding-left:8px">${Math.round(
        (s.value / total) * 100
      )}%</span>
    </div>`
    )
    .join("");

  return `<div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="flex-shrink:0">
      ${paths}${labels}
    </svg>
    <div style="display:flex;flex-direction:column;gap:4px;flex:1">${legend}</div>
  </div>`;
}

// ===== PER-PITCH-TYPE DETAILED BREAKDOWN =====
function buildPitchTypeDetail(pitches) {
  // For each pitch type: count, avg/max/min velo, outcomes, BA against
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
  const byType = {};
  pitches.forEach((p) => {
    const t = p.pitchType && p.pitchType !== "—" ? p.pitchType : "UNKN";
    if (!byType[t])
      byType[t] = {
        count: 0,
        vels: [],
        hits: 0,
        ab: 0,
        swings: 0,
        whiffs: 0,
        balls: 0,
        strikes: 0,
        fp: 0,
        fpStrikes: 0,
      };
    byType[t].count++;
    const v = parseFloat(p.velocity);
    if (!isNaN(v) && v > 0) byType[t].vels.push(v);
    const o = p.outcome;
    if (_isFirstPitch(p)) {
      byType[t].fp++;
      if (_isStrike(o)) byType[t].fpStrikes++;
    }
    if (_isStrike(o)) byType[t].strikes++;
    if (["single", "double", "triple", "homerun"].includes(o)) {
      byType[t].hits++;
      byType[t].ab++;
    } else if (
      ["groundout", "flyout", "lineout", "sacfly", "sacbunt", "error"].includes(
        o
      )
    ) {
      byType[t].ab++;
    } else if (o === "strike-swinging") {
      byType[t].swings++;
      byType[t].whiffs++;
    } else if (o === "foul") {
      byType[t].swings++;
    } else if (o === "ball") {
      byType[t].balls++;
    }
  });

  const total = pitches.length;
  const rows = Object.entries(byType)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([t, d]) => {
      const pct = Math.round((d.count / total) * 100);
      const avgV = d.vels.length
        ? (d.vels.reduce((a, b) => a + b, 0) / d.vels.length).toFixed(1)
        : "—";
      const maxV = d.vels.length ? Math.max(...d.vels).toFixed(1) : "—";
      const ba = d.ab > 0 ? _fmtRate(d.hits / d.ab) : ".---";
      const whiffPct =
        d.swings > 0 ? Math.round((d.whiffs / d.swings) * 100) + "%" : "—";
      const color = typeColors[t] || "#8a909e";
      return `
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:8px">
<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
  <div style="width:10px;height:10px;border-radius:50%;background:${color};flex-shrink:0"></div>
  <div style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:14px;letter-spacing:1px">${t}</div>
  <div style="margin-left:auto;font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--text3)">${
    d.count
  } pitches · ${pct}%</div>
</div>
<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">
  <div style="text-align:center;background:var(--surface2);border-radius:6px;padding:6px 4px">
    <div style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:16px;color:var(--accent)">${avgV}</div>
    <div style="font-size:8px;letter-spacing:1px;color:var(--text3);text-transform:uppercase">Avg MPH</div>
  </div>
  <div style="text-align:center;background:var(--surface2);border-radius:6px;padding:6px 4px">
    <div style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:16px">${maxV}</div>
    <div style="font-size:8px;letter-spacing:1px;color:var(--text3);text-transform:uppercase">Max MPH</div>
  </div>
  <div style="text-align:center;background:var(--surface2);border-radius:6px;padding:6px 4px">
    <div style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:16px;color:${
      parseFloat(ba) >= 0.3
        ? "#cc1a1a"
        : parseFloat(ba) < 0.2
        ? "#4a90d9"
        : "var(--text)"
    }">${ba}</div>
    <div style="font-size:8px;letter-spacing:1px;color:var(--text3);text-transform:uppercase">BA Against</div>
  </div>
  <div style="text-align:center;background:var(--surface2);border-radius:6px;padding:6px 4px">
    <div style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:16px">${whiffPct}</div>
    <div style="font-size:8px;letter-spacing:1px;color:var(--text3);text-transform:uppercase">Whiff%</div>
  </div>
  <div style="text-align:center;background:var(--surface2);border-radius:6px;padding:6px 4px">
    <div style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:16px;color:#cc1a1a">${
      d.count > 0 ? Math.round((d.strikes / d.count) * 100) + "%" : "—"
    }</div>
    <div style="font-size:8px;letter-spacing:1px;color:var(--text3);text-transform:uppercase">Strike%</div>
  </div>
  <div style="text-align:center;background:var(--surface2);border-radius:6px;padding:6px 4px">
    <div style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:16px;color:${
      d.fp > 0 && Math.round((d.fpStrikes / d.fp) * 100) >= 60
        ? "#1a8a3a"
        : d.fp > 0 && Math.round((d.fpStrikes / d.fp) * 100) < 50
        ? "#cc1a1a"
        : "var(--text)"
    }">${d.fp > 0 ? Math.round((d.fpStrikes / d.fp) * 100) + "%" : "—"}</div>
    <div style="font-size:8px;letter-spacing:1px;color:var(--text3);text-transform:uppercase">FPS%</div>
  </div>
</div>
<div style="margin-top:8px;background:var(--surface3);border-radius:4px;height:6px;overflow:hidden">
  <div style="width:${pct}%;height:100%;background:${color};border-radius:4px"></div>
</div>
      </div>`;
    })
    .join("");

  return rows || '<div class="empty-state">No pitch type data</div>';
}

// ===== ZONE TENDENCIES WITH PITCH TYPE FILTER =====
function buildZoneTendenciesFiltered(pitches, containerId) {
  const pitchTypes = [
    ...new Set(
      pitches.map((p) =>
        p.pitchType && p.pitchType !== "—" ? p.pitchType : "UNKN"
      )
    ),
  ].sort(
    (a, b) =>
      pitches.filter((p) => (p.pitchType || "UNKN") === b).length -
      pitches.filter((p) => (p.pitchType || "UNKN") === a).length
  );
  const typeColors2 = {
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
  const pitchesJson = JSON.stringify(
    pitches.map((p) => ({
      pitchType: p.pitchType,
      outcome: p.outcome,
      pitchX: p.pitchX,
      pitchY: p.pitchY,
    }))
  );

  const filterBar =
    pitchTypes.length > 1
      ? `
    <div style="margin-bottom:10px;padding:8px;background:var(--surface2);border-radius:8px">
      <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:8px;letter-spacing:2px;text-transform:uppercase;color:#8a909e;margin-bottom:6px">Filter by pitch type</div>
      <div id="${containerId}-zt-bar" style="display:flex;flex-wrap:wrap;gap:5px;align-items:center">
<button onclick="toggleAllZtFilter('${containerId}')" data-all-active="true"
  style="padding:3px 10px;border:1.5px solid var(--border);border-radius:20px;
    background:var(--surface3);color:var(--text2);
    font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:10px;
    letter-spacing:1px;cursor:pointer">ALL</button>
${pitchTypes
  .map(
    (t) => `
  <button data-zt-type="${t}" data-active="true"
    onclick="toggleZtFilter(this,'${containerId}')"
    style="padding:3px 8px;border:1.5px solid ${
      typeColors2[t] || "#8a909e"
    };border-radius:20px;
      background:${typeColors2[t] || "#8a909e"};color:white;
      font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:10px;
      letter-spacing:1px;cursor:pointer;transition:all .15s">${t}</button>`
  )
  .join("")}
      </div>
    </div>`
      : "";

  return `<div id="${containerId}" data-zt-pitches='${pitchesJson.replace(
    /'/g,
    "&#39;"
  )}'>
    ${filterBar}
    <div id="${containerId}-zt-chart">${buildZoneTendencies(pitches)}</div>
  </div>`;
}

function toggleZtFilter(btn, containerId) {
  const isActive = btn.getAttribute("data-active") !== "false";
  btn.setAttribute("data-active", isActive ? "false" : "true");
  btn.style.opacity = isActive ? "0.35" : "1";
  applyZtFilter(containerId);
}

function toggleAllZtFilter(containerId) {
  const bar = document.getElementById(containerId + "-zt-bar");
  if (!bar) return;
  const allBtn = bar.querySelector("[data-all-active]");
  const allActive = allBtn?.getAttribute("data-all-active") !== "false";
  // Toggle: if all currently active → deselect all; if any inactive → select all
  const newState = !allActive;
  if (allBtn)
    allBtn.setAttribute("data-all-active", newState ? "true" : "false");
  bar.querySelectorAll("[data-zt-type]").forEach((b) => {
    b.setAttribute("data-active", newState ? "true" : "false");
    b.style.opacity = newState ? "1" : "0.35";
  });
  applyZtFilter(containerId);
}

function applyZtFilter(containerId) {
  const container = document.getElementById(containerId);
  const chartEl = document.getElementById(containerId + "-zt-chart");
  if (!container || !chartEl) return;
  const bar = document.getElementById(containerId + "-zt-bar");
  const activeTypes = new Set();
  if (bar)
    bar.querySelectorAll("[data-zt-type]").forEach((b) => {
      if (b.getAttribute("data-active") !== "false")
        activeTypes.add(b.getAttribute("data-zt-type"));
    });
  let pitches = [];
  try {
    pitches = JSON.parse(container.getAttribute("data-zt-pitches") || "[]");
  } catch (e) {}
  const filtered =
    activeTypes.size === 0
      ? []
      : pitches.filter((p) => activeTypes.has(p.pitchType || "—"));
  chartEl.innerHTML = filtered.length
    ? buildZoneTendencies(filtered)
    : '<div class="empty-state" style="padding:20px 0">No pitches selected</div>';
}

// ===== HOT/COLD ZONE WITH PITCH TYPE FILTER =====
function buildHotColdZoneFiltered(pitches, perspective, containerId) {
  const pitchTypes = [
    ...new Set(
      pitches.map((p) =>
        p.pitchType && p.pitchType !== "—" ? p.pitchType : "UNKN"
      )
    ),
  ].sort(
    (a, b) =>
      pitches.filter((p) => (p.pitchType || "UNKN") === b).length -
      pitches.filter((p) => (p.pitchType || "UNKN") === a).length
  );
  const typeColors2 = {
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
  const pitchesJson = JSON.stringify(
    pitches.map((p) => ({
      pitchType: p.pitchType,
      outcome: p.outcome,
      pitchX: p.pitchX,
      pitchY: p.pitchY,
      loc: p.loc,
    }))
  );

  const filterBar =
    pitchTypes.length > 1
      ? `
    <div style="margin-bottom:10px;padding:8px;background:var(--surface2);border-radius:8px">
      <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:8px;letter-spacing:2px;text-transform:uppercase;color:#8a909e;margin-bottom:6px">Filter by pitch type</div>
      <div id="${containerId}-hcz-bar" style="display:flex;flex-wrap:wrap;gap:5px;align-items:center">
<button onclick="selectAllHczFilters('${containerId}')" data-all-active="true"
  style="padding:3px 10px;border:1.5px solid var(--border);border-radius:20px;
    background:var(--surface3);color:var(--text2);
    font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:10px;
    letter-spacing:1px;cursor:pointer">ALL</button>
${pitchTypes
  .map(
    (t) => `
  <button data-hcz-type="${t}" data-active="true"
    onclick="toggleHczFilter(this,'${containerId}')"
    style="padding:3px 8px;border:1.5px solid ${
      typeColors2[t] || "#8a909e"
    };border-radius:20px;
      background:${typeColors2[t] || "#8a909e"};color:white;
      font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:10px;
      letter-spacing:1px;cursor:pointer;transition:all .15s">${t}</button>`
  )
  .join("")}
      </div>
    </div>`
      : "";

  return `<div id="${containerId}" data-hcz-pitches='${pitchesJson.replace(
    /'/g,
    "&#39;"
  )}' data-perspective="${perspective}">
    ${filterBar}
    <div id="${containerId}-hcz-chart">${buildHotColdZone(
    pitches,
    perspective
  )}</div>
  </div>`;
}

function toggleHczFilter(btn, containerId) {
  const isActive = btn.getAttribute("data-active") !== "false";
  btn.setAttribute("data-active", isActive ? "false" : "true");
  btn.style.opacity = isActive ? "0.35" : "1";
  applyHczFilter(containerId);
}

function selectAllHczFilters(containerId) {
  const bar = document.getElementById(containerId + "-hcz-bar");
  if (!bar) return;
  const allBtn = bar.querySelector("[data-all-active]");
  const allActive = allBtn?.getAttribute("data-all-active") !== "false";
  const newState = !allActive;
  if (allBtn)
    allBtn.setAttribute("data-all-active", newState ? "true" : "false");
  bar.querySelectorAll("[data-hcz-type]").forEach((b) => {
    b.setAttribute("data-active", newState ? "true" : "false");
    b.style.opacity = newState ? "1" : "0.35";
  });
  applyHczFilter(containerId);
}

function applyHczFilter(containerId) {
  const container = document.getElementById(containerId);
  const chartEl = document.getElementById(containerId + "-hcz-chart");
  if (!container || !chartEl) return;

  const bar = document.getElementById(containerId + "-hcz-bar");
  const activeTypes = new Set();
  if (bar)
    bar.querySelectorAll("[data-hcz-type]").forEach((b) => {
      if (b.getAttribute("data-active") !== "false")
        activeTypes.add(b.getAttribute("data-hcz-type"));
    });

  let pitches = [];
  try {
    pitches = JSON.parse(container.getAttribute("data-hcz-pitches") || "[]");
  } catch (e) {}
  const perspective = container.getAttribute("data-perspective") || "pitcher";

  const filtered =
    activeTypes.size === 0
      ? pitches
      : pitches.filter((p) => activeTypes.has(p.pitchType || "—"));
  chartEl.innerHTML = buildHotColdZone(filtered, perspective);
}

// ===== HOT/COLD ZONE MAP =====
// SVG-based, matching buildPitchZoneSVG layout exactly
function buildHotColdZone(pitches, perspective = "pitcher") {
  const W = 280,
    H = 260;
  const ZX1 = W * 0.28,
    ZX2 = W * 0.72,
    ZY1 = H * 0.25,
    ZY2 = H * 0.75;
  const ZW = ZX2 - ZX1,
    ZH = ZY2 - ZY1;

  // 9 zone cells using same loc strings as zoneLabel()
  // Grid: row 0=High, row 1=Mid, row 2=Low  |  col 0=Inside, col 1=Middle, col 2=Outside
  const zoneNames = [
    ["High Inside", "High Middle", "High Outside"],
    ["Inside", "Heart", "Outside"],
    ["Low Inside", "Low Middle", "Low Outside"],
  ];
  // Also track chase zones (outside strike box) - simplified 8 zones
  const chaseNames = [
    "Chase High",
    "Chase High Inside",
    "Chase High Outside",
    "Chase Inside",
    "Chase Outside",
    "Chase Low",
    "Chase Low Inside",
    "Chase Low Outside",
    "Way High",
    "Way High Inside",
    "Way High Outside",
    "Way Inside",
    "Way Outside",
    "Way Low",
    "Way Low Inside",
    "Way Low Outside",
  ];

  const allZones = {};
  [...zoneNames.flat(), ...chaseNames].forEach((n) => {
    allZones[n] = { pitches: 0, ab: 0, hits: 0 };
  });

  pitches.forEach((p) => {
    const loc = p.loc;
    if (!loc || !allZones[loc]) return;
    allZones[loc].pitches++;
    const o = p.outcome;
    if (["single", "double", "triple", "homerun"].includes(o)) {
      allZones[loc].hits++;
      allZones[loc].ab++;
    } else if (
      [
        "groundout",
        "flyout",
        "lineout",
        "sacfly",
        "sacbunt",
        "error",
        "fc",
      ].includes(o)
    ) {
      allZones[loc].ab++;
    }
  });

  const cellColor = (ab, hits) => {
    if (ab === 0) return "rgba(0,0,0,0)";
    const ba = hits / ab;
    if (ba >= 0.4) return "rgba(204,26,26,0.82)";
    if (ba >= 0.3) return "rgba(204,26,26,0.58)";
    if (ba >= 0.25) return "rgba(220,90,40,0.50)";
    if (ba >= 0.2) return "rgba(200,160,40,0.40)";
    if (ba >= 0.15) return "rgba(74,144,217,0.38)";
    if (ba >= 0.1) return "rgba(74,144,217,0.58)";
    return "rgba(74,144,217,0.80)";
  };
  const textColor = (ab, hits) => {
    if (ab === 0) return "#aaa";
    const ba = hits / ab;
    return ba >= 0.2 || ba < 0.15 ? "white" : "#222";
  };
  const fmtBA = (ab, hits) => {
    if (ab === 0) return "";
    return _fmtRate(hits / ab);
  };

  // Draw 9 inner zone cells
  let cells = "";
  zoneNames.forEach((row, ri) => {
    row.forEach((name, ci) => {
      const d = allZones[name];
      const x = ZX1 + ci * (ZW / 3),
        y = ZY1 + ri * (ZH / 3);
      const cw = ZW / 3,
        ch = ZH / 3;
      const fill = cellColor(d.ab, d.hits);
      const tc = textColor(d.ab, d.hits);
      const ba = fmtBA(d.ab, d.hits);
      cells += `<rect x="${x}" y="${y}" width="${cw}" height="${ch}" fill="${fill}"/>`;
      if (ba) {
        cells += `<text x="${x + cw / 2}" y="${
          y + ch / 2 + 1
        }" text-anchor="middle" dominant-baseline="middle"
  font-family="Barlow Condensed,sans-serif" font-weight="900" font-size="11" fill="${tc}">${ba}</text>`;
      }
      if (d.pitches > 0 && !ba) {
        cells += `<text x="${x + cw / 2}" y="${
          y + ch / 2 + 1
        }" text-anchor="middle" dominant-baseline="middle"
  font-family="Share Tech Mono,monospace" font-size="7" fill="#aaa">${
    d.pitches
  }</text>`;
      }
    });
  });

  // Grid lines
  const gridLines = `
    <line x1="${ZX1 + ZW / 3}" y1="${ZY1}" x2="${
    ZX1 + ZW / 3
  }" y2="${ZY2}" stroke="rgba(0,0,0,.2)" stroke-width="1"/>
    <line x1="${ZX1 + (ZW * 2) / 3}" y1="${ZY1}" x2="${
    ZX1 + (ZW * 2) / 3
  }" y2="${ZY2}" stroke="rgba(0,0,0,.2)" stroke-width="1"/>
    <line x1="${ZX1}" y1="${ZY1 + ZH / 3}" x2="${ZX2}" y2="${
    ZY1 + ZH / 3
  }" stroke="rgba(0,0,0,.2)" stroke-width="1"/>
    <line x1="${ZX1}" y1="${ZY1 + (ZH * 2) / 3}" x2="${ZX2}" y2="${
    ZY1 + (ZH * 2) / 3
  }" stroke="rgba(0,0,0,.2)" stroke-width="1"/>`;

  const plotted = pitches.filter((p) => p.loc && allZones[p.loc]).length;
  const legend = [
    "rgba(74,144,217,0.80)",
    "rgba(74,144,217,0.58)",
    "rgba(74,144,217,0.38)",
    "rgba(200,160,40,0.40)",
    "rgba(220,90,40,0.50)",
    "rgba(204,26,26,0.58)",
    "rgba(204,26,26,0.82)",
  ]
    .map(
      (c, i) =>
        `<rect x="${
          10 + i * 18
        }" y="0" width="14" height="14" rx="2" fill="${c}"/>`
    )
    .join("");

  return `<svg viewBox="0 0 ${W} ${H + 40}" xmlns="http://www.w3.org/2000/svg"
    style="width:100%;max-width:${W}px;background:#f8f9fb;border-radius:10px;border:1.5px solid #bfc4cf">
    <!-- Background -->
    <rect width="${W}" height="${H}" fill="#f8f9fb"/>
    <!-- Chase zone -->
    <rect x="${W * 0.12}" y="${H * 0.1}" width="${W * 0.76}" height="${
    H * 0.8
  }" rx="4"
      fill="rgba(0,0,0,.02)" stroke="rgba(0,0,0,.06)" stroke-width="1"/>
    <!-- Zone cells (filled) -->
    ${cells}
    <!-- Strike zone border -->
    <rect x="${ZX1}" y="${ZY1}" width="${ZW}" height="${ZH}"
      fill="none" stroke="rgba(0,0,0,.3)" stroke-width="2"/>
    <!-- Grid lines -->
    ${gridLines}
    <!-- Labels -->
    <text x="${W / 2}" y="${
    H * 0.08
  }" text-anchor="middle" font-family="Share Tech Mono" font-size="9" fill="#8a909e" letter-spacing="1">HIGH</text>
    <text x="${W / 2}" y="${
    H * 0.97
  }" text-anchor="middle" font-family="Share Tech Mono" font-size="9" fill="#8a909e" letter-spacing="1">LOW</text>
    <text x="${W * 0.04}" y="${
    H / 2
  }" text-anchor="middle" font-family="Share Tech Mono" font-size="9" fill="#8a909e" letter-spacing="1" transform="rotate(-90,${
    W * 0.04
  },${H / 2})">IN</text>
    <text x="${W * 0.97}" y="${
    H / 2
  }" text-anchor="middle" font-family="Share Tech Mono" font-size="9" fill="#8a909e" letter-spacing="1" transform="rotate(90,${
    W * 0.97
  },${H / 2})">OUT</text>
    <!-- Home plate -->
    <circle cx="${W / 2}" cy="${H * 0.93}" r="4" fill="#111318" opacity="0.35"/>
    <!-- Legend -->
    <g transform="translate(0,${H + 8})">
      <text x="10" y="10" font-family="Share Tech Mono" font-size="8" fill="#8a909e">COLD</text>
      ${legend}
      <text x="${
        10 + 7 * 18 + 4
      }" y="10" font-family="Share Tech Mono" font-size="8" fill="#8a909e">HOT</text>
      <text x="${
        W / 2
      }" y="28" text-anchor="middle" font-family="Share Tech Mono" font-size="7" fill="#aaa">${plotted} pitches · BA per zone</text>
    </g>
  </svg>`;
}

function buildPitchBreakdown(pitches) {
  if (!pitches.length) return '<div class="empty-state">No pitch data</div>';

  // Pitch type counts — dynamic so all types (including UNKN) are captured
  const typeMap = {};
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
  const outcomeMap = {
    ball: 0,
    "strike-swinging": 0,
    "strike-looking": 0,
    foul: 0,
    "ip-hit": 0,
    "ip-out": 0,
    hbp: 0,
    ci: 0,
  };

  pitches.forEach((p) => {
    const t = p.pitchType && p.pitchType !== "—" ? p.pitchType : "UNKN";
    typeMap[t] = (typeMap[t] || 0) + 1;
    const o = p.outcome;
    if (o === "ball") outcomeMap.ball++;
    else if (o === "strike-swinging") outcomeMap["strike-swinging"]++;
    else if (o === "strike-looking") outcomeMap["strike-looking"]++;
    else if (o === "foul") outcomeMap.foul++;
    else if (["single", "double", "triple", "homerun", "error"].includes(o))
      outcomeMap["ip-hit"]++;
    else if (
      ["groundout", "flyout", "lineout", "sacfly", "sacbunt"].includes(o)
    )
      outcomeMap["ip-out"]++;
    else if (o === "hbp") outcomeMap.hbp++;
    else if (o === "ci") outcomeMap.ci++;
  });

  const total = pitches.length;

  // Build horizontal bar rows
  const typeRows = Object.entries(typeMap)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([t, n]) => {
      const pct = Math.round((n / total) * 100);
      return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">
<div style="font-family:'Share Tech Mono',monospace;font-size:10px;color:#4a5060;width:28px;flex-shrink:0">${t}</div>
<div style="flex:1;background:#e8eaee;border-radius:3px;height:14px;overflow:hidden">
  <div style="width:${pct}%;height:100%;background:${
        typeColors[t] || "#8a909e"
      };border-radius:3px;transition:width .4s"></div>
</div>
<div style="font-family:'Share Tech Mono',monospace;font-size:10px;color:#8a909e;width:42px;text-align:right;flex-shrink:0">${n} · ${pct}%</div>
      </div>`;
    })
    .join("");

  const outLabels = {
    ball: "Ball",
    "strike-swinging": "Swing K",
    "strike-looking": "Called K",
    foul: "Foul",
    "ip-hit": "In Play (Hit)",
    "ip-out": "In Play (Out)",
    hbp: "HBP",
    ci: "CI",
  };
  const outColors = {
    ball: "#1a6abf",
    "strike-swinging": "#8a0000",
    "strike-looking": "#c01a1a",
    foul: "#8a4a00",
    "ip-hit": "#9a7a00",
    "ip-out": "#6a1ab0",
    hbp: "#8822cc",
    ci: "#8822cc",
  };
  const outcomeRows = Object.entries(outcomeMap)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([o, n]) => {
      const pct = Math.round((n / total) * 100);
      return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">
<div style="font-family:'Barlow Condensed',sans-serif;font-size:11px;font-weight:600;color:#4a5060;width:110px;flex-shrink:0">${
        outLabels[o] || o
      }</div>
<div style="flex:1;background:#e8eaee;border-radius:3px;height:14px;overflow:hidden">
  <div style="width:${pct}%;height:100%;background:${
        outColors[o] || "#8a909e"
      };border-radius:3px"></div>
</div>
<div style="font-family:'Share Tech Mono',monospace;font-size:10px;color:#8a909e;width:42px;text-align:right;flex-shrink:0">${n} · ${pct}%</div>
      </div>`;
    })
    .join("");

  // Velocity stats
  const withVel = pitches.filter(
    (p) => p.velocity && !isNaN(parseFloat(p.velocity))
  );
  const vels = withVel.map((p) => parseFloat(p.velocity));
  const avgVel = vels.length
    ? (vels.reduce((a, b) => a + b, 0) / vels.length).toFixed(1)
    : "—";
  const maxVel = vels.length ? Math.max(...vels) : "—";
  const minVel = vels.length ? Math.min(...vels) : "—";

  // Strike zone %
  const inZone = pitches.filter(
    (p) =>
      p.pitchX != null &&
      p.pitchX >= 31 &&
      p.pitchX <= 69 &&
      p.pitchY != null &&
      p.pitchY >= 30.9 &&
      p.pitchY <= 69.1
  ).length;
  const zonePct = total > 0 ? Math.round((inZone / total) * 100) : 0;
  const swings = pitches.filter(
    (p) =>
      ["strike-swinging", "foul"].includes(p.outcome) ||
      [
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
  const swingPct = total > 0 ? Math.round((swings / total) * 100) : 0;

  // Pie chart slices
  const typeSlices = Object.entries(typeMap)
    .filter(([, n]) => n > 0)
    .map(([t, n]) => ({
      label: t,
      value: n,
      color: typeColors[t] || "#8a909e",
    }));
  const outcomeSlices = Object.entries(outcomeMap)
    .filter(([, n]) => n > 0)
    .map(([o, n]) => ({
      label: outLabels[o] || o,
      value: n,
      color: outColors[o] || "#8a909e",
    }));

  const pitchTypes = [
    ...new Set(
      pitches.map((p) =>
        p.pitchType && p.pitchType !== "—" ? p.pitchType : "UNKN"
      )
    ),
  ].sort(
    (a, b) =>
      pitches.filter((p) => (p.pitchType || "UNKN") === b).length -
      pitches.filter((p) => (p.pitchType || "UNKN") === a).length
  );
  const typeColors2 = {
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
  const bdId = "bd-" + Math.random().toString(36).slice(2, 8);
  const pitchesJson = JSON.stringify(
    pitches.map((p) => ({
      pitchType: p.pitchType,
      outcome: p.outcome,
      velocity: p.velocity,
      balls: p.balls || 0,
      strikes: p.strikes || 0,
      btype: p.spray?.btype || "",
    }))
  );
  const ofBtnsFixed =
    pitchTypes.length > 1
      ? pitchTypes
          .map(
            (t) => `
    <button data-of-type="${t}" data-active="true"
      onclick="toggleOutcomeFilter(this,'${bdId}')"
      style="display:inline-flex;align-items:center;gap:3px;padding:3px 8px;
border:1.5px solid ${typeColors2[t] || "#8a909e"};border-radius:20px;
background:${typeColors2[t] || "#8a909e"};color:white;
font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:10px;
letter-spacing:1px;cursor:pointer;transition:all .15s">${t}</button>`
          )
          .join("")
      : "";

  return `
    <div id="${bdId}" data-pitches='${pitchesJson.replace(/'/g, "&#39;")}'>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 14px;text-align:center">
<div style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:26px;color:#cc1a1a">${avgVel}</div>
<div style="font-size:8px;letter-spacing:2px;color:var(--text3);text-transform:uppercase">Avg Velo</div>
      </div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 14px;text-align:center">
<div style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:26px;color:var(--text)">${maxVel}</div>
<div style="font-size:8px;letter-spacing:2px;color:var(--text3);text-transform:uppercase">Max Velo</div>
      </div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 14px;text-align:center">
<div style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:26px;color:var(--text)">${zonePct}%</div>
<div style="font-size:8px;letter-spacing:2px;color:var(--text3);text-transform:uppercase">Zone%</div>
      </div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 14px;text-align:center">
<div style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:26px;color:var(--text)">${swingPct}%</div>
<div style="font-size:8px;letter-spacing:2px;color:var(--text3);text-transform:uppercase">Swing%</div>
      </div>
    </div>

    <!-- Shared pitch type filter for outcomes (works across BAR and PIE views) -->
    <div style="margin-bottom:10px;padding:8px;background:var(--surface2);border-radius:8px">
      ${
        ofBtnsFixed
          ? `<div style="margin-bottom:6px">
<div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:8px;letter-spacing:2px;text-transform:uppercase;color:#8a909e;margin-bottom:5px">Pitch Type</div>
<div id="${bdId}-of-bar" style="display:flex;flex-wrap:wrap;gap:5px;align-items:center">
  <button onclick="selectAllOutcomeFilters('${bdId}')" data-all-active="true"
    style="padding:3px 10px;border:1.5px solid var(--border);border-radius:20px;
      background:var(--surface2);color:var(--text2);
      font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:10px;
      letter-spacing:1px;cursor:pointer;border:1.5px solid var(--border)">ALL</button>
  ${ofBtnsFixed}
</div>
      </div>`
          : '<div id="${bdId}-of-bar" style="display:none"></div>'
      }
      <!-- Batted ball type filter -->
      ${(() => {
        const btypes = [
          { key: "flyball", label: "Fly Ball", color: "#1a8a3a" },
          { key: "linedrive", label: "Line Drive", color: "#28a83a" },
          { key: "groundball", label: "Ground Ball", color: "#b8860b" },
          { key: "weakgrounder", label: "Weak Grounder", color: "#8a6000" },
          { key: "popup", label: "Popup", color: "#6a3a8a" },
        ];
        const available = btypes.filter((bt) =>
          pitches.some((p) => p.spray?.btype === bt.key)
        );
        if (!available.length) return "";
        const btBtns = available
          .map(
            (
              bt
            ) => `<button data-btype-filter="${bt.key}" data-btype-container="${bdId}" onclick="toggleBtypeFilter(this,'${bdId}')"
  style="display:inline-flex;align-items:center;gap:3px;padding:3px 8px;border:1.5px solid ${bt.color};border-radius:20px;background:${bt.color};color:white;font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:10px;letter-spacing:1px;cursor:pointer;transition:all .15s">${bt.label}</button>`
          )
          .join("");
        return `<div>
  <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:8px;letter-spacing:2px;text-transform:uppercase;color:#8a909e;margin-bottom:5px;margin-top:${
    ofBtnsFixed ? "6px" : "0"
  }">Batted Ball Type</div>
  <div id="${bdId}-btype-bar" style="display:flex;flex-wrap:wrap;gap:5px;align-items:center">
    <button onclick="selectAllBtypes('${bdId}')" data-btype-all="true"
      style="padding:3px 10px;border:1.5px solid var(--border);border-radius:20px;background:var(--surface2);color:var(--text2);font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:10px;letter-spacing:1px;cursor:pointer">ALL</button>
    ${btBtns}
  </div>
</div>`;
      })()}
    </div>

    <!-- Chart type toggle -->
    <div style="display:flex;gap:6px;margin-bottom:12px">
      <button onclick="toggleChartView(this,'bars')" class="chart-toggle-btn active" data-view="bars" style="flex:1;padding:5px;background:var(--accent);color:white;border:none;border-radius:6px;font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:11px;letter-spacing:1px;cursor:pointer">BAR</button>
      <button onclick="toggleChartView(this,'pie')" class="chart-toggle-btn" data-view="pie" style="flex:1;padding:5px;background:var(--surface3);color:var(--text2);border:1px solid var(--border);border-radius:6px;font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:11px;letter-spacing:1px;cursor:pointer">PIE</button>
      <button onclick="toggleChartView(this,'detail')" class="chart-toggle-btn" data-view="detail" style="flex:1;padding:5px;background:var(--surface3);color:var(--text2);border:1px solid var(--border);border-radius:6px;font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:11px;letter-spacing:1px;cursor:pointer">DETAIL</button>
    </div>

    <!-- BAR VIEW -->
    <div data-chart-view="bars">
      <div style="margin-bottom:16px">
<div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:9px;letter-spacing:3px;text-transform:uppercase;color:#8a909e;margin-bottom:8px">Pitch Types · ${total} total</div>
${
  typeRows ||
  '<div style="color:#8a909e;font-size:12px">No pitch type data</div>'
}
      </div>
      <div>
<div id="${bdId}-outcome-total" style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:9px;letter-spacing:3px;text-transform:uppercase;color:#8a909e;margin-bottom:8px">Outcome Breakdown · ${total} pitches</div>
<div id="${bdId}-outcome-bars">${outcomeRows}</div>
      </div>
    </div>

    <!-- PIE VIEW (hidden by default) -->
    <div data-chart-view="pie" style="display:none">
      <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:9px;letter-spacing:3px;text-transform:uppercase;color:#8a909e;margin-bottom:10px">Pitch Mix</div>
      <div id="${bdId}-type-pie">${buildPieChart(typeSlices, 130)}</div>
      <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:9px;letter-spacing:3px;text-transform:uppercase;color:#8a909e;margin:14px 0 10px">Outcomes</div>
      <div id="${bdId}-outcome-pie">${buildPieChart(outcomeSlices, 130)}</div>
    </div>

    <!-- DETAIL VIEW (hidden by default) -->
    <div data-chart-view="detail" style="display:none">
      <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:9px;letter-spacing:3px;text-transform:uppercase;color:#8a909e;margin-bottom:10px">Per Pitch Type · Velo + BA Against</div>
      ${buildPitchTypeDetail(pitches)}
    </div>
  </div>`;
}

function toggleChartView(btn, view) {
  // Button row is inside the container; chart-view divs are siblings of the button row
  // Walk up to find the wrapper that contains both the buttons and the chart-view divs
  let container = btn.parentElement; // the flex button row
  // Go up one more level to the section wrapper that holds buttons + chart divs
  if (container && !container.querySelector("[data-chart-view]")) {
    container = container.parentElement;
  }
  if (!container) return;
  container.querySelectorAll(".chart-toggle-btn").forEach((b) => {
    const active = b.getAttribute("data-view") === view;
    b.style.background = active ? "var(--accent)" : "var(--surface3)";
    b.style.color = active ? "white" : "var(--text2)";
    b.style.border = active ? "none" : "1px solid var(--border)";
  });
  container.querySelectorAll("[data-chart-view]").forEach((el) => {
    el.style.display =
      el.getAttribute("data-chart-view") === view ? "block" : "none";
  });
}

// ===== SPRAY CHART LEGEND =====
function sprayLegend() {
  return `<div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:10px;font-family:'Barlow Condensed',sans-serif;font-size:12px;color:#4a5060">
    <div style="display:flex;align-items:center;gap:6px">
      <svg width="32" height="12"><path d="M 2 10 Q 16 2 30 10" fill="none" stroke="#4ae88a" stroke-width="2"/></svg>
      Single
    </div>
    <div style="display:flex;align-items:center;gap:6px">
      <svg width="32" height="12"><path d="M 2 10 Q 16 2 30 10" fill="none" stroke="#5baef5" stroke-width="2"/></svg>
      Double
    </div>
    <div style="display:flex;align-items:center;gap:6px">
      <svg width="32" height="12"><path d="M 2 10 Q 16 2 30 10" fill="none" stroke="#c084f5" stroke-width="2"/></svg>
      Triple
    </div>
    <div style="display:flex;align-items:center;gap:6px">
      <svg width="32" height="12"><path d="M 2 10 Q 16 2 30 10" fill="none" stroke="#e8c84a" stroke-width="2.5"/></svg>
      HR
    </div>
    <div style="display:flex;align-items:center;gap:6px">
      <svg width="32" height="12"><path d="M 2 10 Q 16 2 30 10" fill="none" stroke="#e84a4a" stroke-width="1.5" opacity=".8"/></svg>
      Out
    </div>
    <div style="display:flex;align-items:center;gap:10px;margin-top:4px;width:100%;font-size:11px;color:#8a909e">
      <span><svg width="28" height="10" style="vertical-align:middle"><path d="M2 7 Q14 2 26 7" fill="none" stroke="#888" stroke-width="1.8"/></svg> fly ball (arc)</span>
      <span><svg width="28" height="10" style="vertical-align:middle"><line x1="2" y1="7" x2="26" y2="7" stroke="#888" stroke-width="1.8" stroke-dasharray="6,4"/></svg> line drive (dash)</span>
      <span><svg width="28" height="10" style="vertical-align:middle"><line x1="2" y1="7" x2="26" y2="7" stroke="#888" stroke-width="1.8" stroke-dasharray="2,4"/></svg> ground ball (dot)</span>
    </div>
  </div>`;
}

// ===== PITCH ZONE LEGEND =====
// ── Home plate SVG snippet — catcher's view (tip points DOWN) ──────────
// cx/cy = center of the plate pentagon, sz = scale (default 1 = ~22px wide)
function _homePlateSVG(cx, cy, sz = 1, color = "rgba(80,80,100,0.55)") {
  // Standard home plate shape (5-sided): flat top, two angled sides, pointed tip at bottom
  // Unscaled relative coords (width=22, height=20):
  //   top-left(-11,-8), top-right(11,-8), right(11,3), tip(0,12), left(-11,3)
  const pts = [
    [-11, -8],
    [11, -8],
    [11, 3],
    [0, 12],
    [-11, 3],
  ]
    .map(([x, y]) => `${(cx + x * sz).toFixed(1)},${(cy + y * sz).toFixed(1)}`)
    .join(" ");
  return `<polygon points="${pts}" fill="${color}" stroke="${color.replace(
    /[\d.]+\)$/,
    "0.85)"
  )}"/>`;
}

function pitchZoneLegend() {
  const items = [
    { col: "#5baef5", label: "Fastball (4SFB/CUT/SNK)" },
    { col: "#f57a7a", label: "Breaking (CB/SL/SP)" },
    { col: "#6ae87a", label: "Off-speed (CH/KN)" },
    { col: "#e8c84a", label: "In Play Hit" },
    { col: "#c084f5", label: "In Play Out" },
  ];
  return `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">
    ${items
      .map(
        (
          i
        ) => `<div style="display:flex;align-items:center;gap:5px;font-family:'Barlow Condensed',sans-serif;font-size:11px;color:#4a5060">
      <div style="width:9px;height:9px;border-radius:50%;background:${i.col};flex-shrink:0"></div>${i.label}
    </div>`
      )
      .join("")}
    <div style="width:100%;font-size:10px;color:#8a909e;margin-top:2px">
      Solid = swing/contact · Dashed border = ball · Lighter = called/foul
    </div>
  </div>`;
}

// ===== UPDATED RENDER PLAYER =====

// ===================== SPLITS & SPANS ENGINE =====================

// Derive AB-level records from pitch log for a specific batter in a game
// Determine if a pitch entry was the FINAL pitch of an at-bat.
// Uses the post-pitch count (balls/strikes stored after increment) to decide.
function _isAbEnding(p) {
  if (!p) return false;
  const o = p.outcome;
  // Contact outcomes always end the AB
  if (
    [
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
      "hbp",
      "ci",
    ].includes(o)
  )
    return true;
  // Strikeout: only when strikes reached 3 (post-pitch strikes === 3)
  if (
    (o === "strike-swinging" || o === "strike-looking") &&
    (p.strikes || 0) >= 3
  )
    return true;
  // Walk: only when balls reached 4 (post-pitch balls === 4)
  if (o === "ball" && (p.balls || 0) >= 4) return true;
  // Foul and mid-AB balls/strikes never end the AB
  return false;
}

function _extractABs(pitchLog, batterName, teamName, game) {
  // pitchLog is newest-first; reverse so we process in chronological order
  const matchNames = _nameAliases[batterName] || new Set([batterName]);
  const pitches = [...pitchLog]
    .reverse()
    .filter((p) => matchNames.has(p.batter));
  const abs = [];
  let cur = null;
  let prevEnded = false; // did the previous pitch end an AB?

  pitches.forEach((p) => {
    // Start a new AB when there is no current AB, or the previous pitch ended one
    if (!cur || prevEnded) {
      cur = {
        pitches: [],
        result: null,
        inning: p.inning,
        isTop: p.isTop,
        pitcherHand: p.pitcherHand || "R",
        pitcher: p.pitcher,
        runnersOn: p.runnersOn || {
          "1st": false,
          "2nd": false,
          "3rd": false,
        },
        outs: p.outs || 0,
        abNum: abs.length + 1,
        isHome: game.homeTeam === teamName,
        date: game.date,
        gameId: game.id,
      };
      abs.push(cur);
    }

    p._abPitchIndex = cur.pitches.length; // 0 = first pitch of this AB
    cur.pitches.push(p);
    cur.result = p.outcome;
    prevEnded = _isAbEnding(p); // check AFTER adding — did THIS pitch end the AB?
  });

  return abs;
}

function _abToStats(ab) {
  const o = ab.result;
  const lastPitch = ab.pitches[ab.pitches.length - 1];
  // Walk: outcome stored as 'ball' when balls reached 4
  const isWalk = (o === "ball" && (lastPitch?.balls || 0) >= 4) || o === "bb";
  const hit = ["single", "double", "triple", "homerun"].includes(o);
  const isSac = o === "sacfly" || o === "sacbunt";
  const isHBP = o === "hbp";
  const isCI = o === "ci";
  // Not an official AB: walk, HBP, CI, sac fly, sac bunt
  const isAB = !isWalk && !isHBP && !isCI && !isSac;
  const h2b = o === "double" ? 1 : 0,
    h3b = o === "triple" ? 1 : 0,
    hr = o === "homerun" ? 1 : 0;
  const k = ["strike-swinging", "strike-looking"].includes(o) ? 1 : 0;
  const bb = isWalk ? 1 : 0,
    hbp = isHBP ? 1 : 0;
  const tb = (hit ? 1 : 0) + h2b + h3b * 2 + hr * 3;
  return {
    pa: 1,
    ab: isAB ? 1 : 0,
    h: hit ? 1 : 0,
    h2b,
    h3b,
    hr,
    k,
    bb,
    hbp,
    tb,
    pitches: ab.pitches.length,
  };
}

function _sumStats(rows) {
  const s = {
    pa: 0,
    ab: 0,
    h: 0,
    h2b: 0,
    h3b: 0,
    hr: 0,
    k: 0,
    bb: 0,
    hbp: 0,
    tb: 0,
    pitches: 0,
  };
  rows.forEach((r) => {
    for (const k in s) s[k] += r[k] || 0;
  });
  return s;
}

// Format a rate stat (AVG, OBP, SLG, OPS, FPCT) correctly:
// values < 1 → .XXX, values >= 1 → 1.XXX (e.g. 1.000, 1.234), values >= 2 → 2.XXX, etc.
function _fmtRate(n) {
  if (n === null || n === undefined || isNaN(n)) return ".---";
  const rounded = Math.round(n * 1000);
  const whole = Math.floor(rounded / 1000);
  const frac = (rounded % 1000).toString().padStart(3, "0");
  return whole > 0 ? whole + "." + frac : "." + frac;
}
function _fmtAvg(h, ab) {
  return ab > 0 ? _fmtRate(h / ab) : ".---";
}
function _fmtOBP(h, bb, hbp, pa) {
  return pa > 0 ? _fmtRate((h + bb + hbp) / pa) : ".---";
}
function _fmtSLG(tb, ab) {
  return ab > 0 ? _fmtRate(tb / ab) : ".---";
}
function _fmtOPS(h, bb, hbp, tb, pa, ab) {
  if (pa === 0 || ab === 0) return ".---";
  return _fmtRate((h + bb + hbp) / pa + tb / ab);
}

function _statsRow(label, s, accent) {
  const avg = _fmtAvg(s.h, s.ab),
    obp = _fmtOBP(s.h, s.bb, s.hbp, s.pa),
    slg = _fmtSLG(s.tb, s.ab),
    ops = _fmtOPS(s.h, s.bb, s.hbp, s.tb, s.pa, s.ab);
  const avgNum = s.ab > 0 ? s.h / s.ab : 0;
  const highlight =
    avgNum >= 0.3
      ? "color:var(--accent);font-weight:800"
      : avgNum < 0.2 && s.ab > 0
      ? "color:#8a909e"
      : "";
  return `<tr>
    <td style="font-weight:${accent ? "700" : "500"};color:${
    accent ? "var(--text)" : "var(--text2)"
  }">${label}</td>
    <td>${s.pa}</td><td>${s.ab}</td><td>${s.h}</td>
    <td>${s.h2b}</td><td>${s.h3b}</td><td class="${
    s.hr > 0 ? "highlight" : ""
  }">${s.hr}</td>
    <td>${s.bb}</td><td>${s.k}</td>
    <td style="${highlight}">${avg}</td>
    <td>${obp}</td><td>${slg}</td><td>${ops}</td>
    <td style="color:var(--text3)">${
      s.pa > 0 ? (s.pitches / s.pa).toFixed(1) : "—"
    }</td>
  </tr>`;
}

function _splitsTable(rows, title) {
  if (!rows.length) return "";
  return `<div style="margin-bottom:28px">
    <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:9px;letter-spacing:3px;text-transform:uppercase;color:var(--text3);margin-bottom:8px">${title}</div>
    <div style="overflow-x:auto">
    <table class="data-table" style="min-width:600px">
      <thead><tr>
<th style="text-align:left;min-width:140px">Split</th>
<th>PA</th><th>AB</th><th>H</th>
<th>2B</th><th>3B</th><th>HR</th>
<th>BB</th><th>K</th>
<th>AVG</th><th>OBP</th><th>SLG</th><th>OPS</th>
<th>P/PA</th>
      </tr></thead>
      <tbody>${rows.join("")}</tbody>
    </table></div>
  </div>`;
}

function buildPlayerSplitsTab(teamName, playerName, games) {
  // Collect all at-bats across all games for this player
  const allABs = [];
  const sortedGames = [...games].sort((a, b) => a.date.localeCompare(b.date));
  sortedGames.forEach((g) => {
    const pitchLog = g.pitchLog || [];
    const abs = _extractABs(pitchLog, playerName, teamName, g);
    allABs.push(...abs);
  });

  if (!allABs.length)
    return '<div class="empty-state" style="padding:30px">No at-bat data found.<br><span style="font-size:12px;color:var(--text3)">Splits populate from logged pitches.</span></div>';

  const byKey = (keyFn, labelFn, abs) => {
    const map = {};
    abs.forEach((ab) => {
      const k = keyFn(ab);
      if (!map[k]) map[k] = [];
      map[k].push(_abToStats(ab));
    });
    return Object.entries(map)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, rows]) =>
        _statsRow(labelFn ? labelFn(k) : k, _sumStats(rows), false)
      );
  };

  // ── Home / Away ──
  const homeSplit = _sumStats(allABs.filter((a) => a.isHome).map(_abToStats));
  const awaySplit = _sumStats(allABs.filter((a) => !a.isHome).map(_abToStats));
  const homeAwayRows = [
    _statsRow("Home", homeSplit, false),
    _statsRow("Away", awaySplit, false),
  ];

  // ── vs LHP / vs RHP ──
  const vsL = _sumStats(
    allABs.filter((a) => a.pitcherHand === "L").map(_abToStats)
  );
  const vsR = _sumStats(
    allABs.filter((a) => a.pitcherHand !== "L").map(_abToStats)
  );
  const handRows = [
    _statsRow("vs LHP", vsL, false),
    _statsRow("vs RHP", vsR, false),
  ];

  // ── By count (first pitch, 2-strike, full count, ahead, behind) ──
  const countGroups = {
    "First Pitch (0-0)": (a) => a.pitches.length === 1,
    "Ahead in Count": (a) => {
      const fp = a.pitches[0];
      return fp && fp.balls > fp.strikes;
    },
    "Behind in Count": (a) => {
      const fp = a.pitches[0];
      return fp && fp.strikes > fp.balls;
    },
    "2-Strike Count": (a) => a.pitches.some((p) => p.strikes === 2),
    "Full Count (3-2)": (a) =>
      a.pitches.some((p) => p.balls === 3 && p.strikes === 2),
    "3-Ball Count": (a) => a.pitches.some((p) => p.balls === 3),
  };
  const countRows = Object.entries(countGroups).map(([lbl, fn]) =>
    _statsRow(lbl, _sumStats(allABs.filter(fn).map(_abToStats)), false)
  );

  // ── By inning ──
  const inningRows = byKey(
    (a) => String(a.inning).padStart(2, "0"),
    (k) => `Inning ${parseInt(k)}`,
    allABs
  );

  // ── RISP ──
  const risp = _sumStats(
    allABs
      .filter((a) => a.runnersOn["2nd"] || a.runnersOn["3rd"])
      .map(_abToStats)
  );
  const rispEmpty = _sumStats(
    allABs
      .filter(
        (a) => !a.runnersOn["1st"] && !a.runnersOn["2nd"] && !a.runnersOn["3rd"]
      )
      .map(_abToStats)
  );
  const runnersRows = [
    _statsRow("RISP (2nd or 3rd)", risp, false),
    _statsRow("Bases Empty", rispEmpty, false),
    _statsRow(
      "Runners On",
      _sumStats(
        allABs
          .filter(
            (a) =>
              a.runnersOn["1st"] || a.runnersOn["2nd"] || a.runnersOn["3rd"]
          )
          .map(_abToStats)
      ),
      false
    ),
    _statsRow(
      "Bases Loaded",
      _sumStats(
        allABs
          .filter(
            (a) =>
              a.runnersOn["1st"] && a.runnersOn["2nd"] && a.runnersOn["3rd"]
          )
          .map(_abToStats)
      ),
      false
    ),
  ];

  // ── By outs when AB started ──
  const outsRows = [0, 1, 2].map((o) =>
    _statsRow(
      `${o} Out${o !== 1 ? "s" : ""}`,
      _sumStats(allABs.filter((a) => a.outs === o).map(_abToStats)),
      false
    )
  );

  // ── vs Starter / vs Reliever (starter = pitcher's first 5 innings or <80 pitches) ──
  const vsStarter = _sumStats(
    allABs.filter((a) => a.inning <= 5).map(_abToStats)
  );
  const vsReliever = _sumStats(
    allABs.filter((a) => a.inning > 5).map(_abToStats)
  );
  const pitcherRoleRows = [
    _statsRow("vs Starter (Inn 1–5)", vsStarter, false),
    _statsRow("vs Reliever (Inn 6+)", vsReliever, false),
  ];

  // ── By AB number in game (1st, 2nd, 3rd PA) ──
  const abNumMap = {};
  sortedGames.forEach((g) => {
    const pitchLog = g.pitchLog || [];
    const abs = _extractABs(pitchLog, playerName, teamName, g);
    abs.forEach((ab, i) => {
      const k = i + 1;
      if (!abNumMap[k]) abNumMap[k] = [];
      abNumMap[k].push(_abToStats(ab));
    });
  });
  const abNumRows = Object.entries(abNumMap)
    .sort((a, b) => +a[0] - +b[0])
    .filter(([, r]) => _sumStats(r).pa > 0)
    .map(([k, rows]) =>
      _statsRow(
        `${k}${
          k === "1" ? "st" : k === "2" ? "nd" : k === "3" ? "rd" : "th"
        } PA`,
        _sumStats(rows),
        false
      )
    );

  // ── By pitch type faced ──
  const ptRows = byKey(
    (a) => a.pitches[0]?.pitchType || "—",
    null,
    allABs.filter((a) => a.pitches[0]?.pitchType)
  );

  // ── Last 5 / 10 / 20 games ──
  const recentRows = [5, 10, 20].map((n) => {
    const recent = sortedGames.slice(-n);
    const rABs = recent.flatMap((g) =>
      _extractABs(g.pitchLog || [], playerName, teamName, g)
    );
    return _statsRow(`Last ${n} Games`, _sumStats(rABs.map(_abToStats)), false);
  });

  // ── By month ──
  const monthMap = {};
  allABs.forEach((ab) => {
    const d = ab.date || "";
    const m = d.slice(0, 7); // YYYY-MM
    if (!monthMap[m]) monthMap[m] = [];
    monthMap[m].push(_abToStats(ab));
  });
  const monthRows = Object.entries(monthMap)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([m, rows]) => {
      const [y, mo] = m.split("-");
      const name =
        [
          "",
          "Jan",
          "Feb",
          "Mar",
          "Apr",
          "May",
          "Jun",
          "Jul",
          "Aug",
          "Sep",
          "Oct",
          "Nov",
          "Dec",
        ][+mo] || m;
      return _statsRow(`${name} ${y}`, _sumStats(rows), false);
    });

  // ── Plate discipline ──
  const _batterAliases = _nameAliases[playerName] || new Set([playerName]);
  const allPitches = sortedGames.flatMap((g) =>
    (g.pitchLog || []).filter((p) => _batterAliases.has(p.batter))
  );
  const swingOutcomes = [
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
  const contactOutcomes = [
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
  const total = allPitches.length;
  const swings = allPitches.filter((p) =>
    swingOutcomes.includes(p.outcome)
  ).length;
  const contact = allPitches.filter((p) =>
    contactOutcomes.includes(p.outcome)
  ).length;
  const zoneSwings = inZone.filter((p) =>
    swingOutcomes.includes(p.outcome)
  ).length;
  const chaseSwings = outZone.filter((p) =>
    swingOutcomes.includes(p.outcome)
  ).length;
  const pctF = (n) => (total > 0 ? Math.round((n / total) * 100) + "%" : "—");
  const pctS = (n) => (swings > 0 ? Math.round((n / swings) * 100) + "%" : "—");
  const disciplineHTML = `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:28px">
    ${[
      ["Swing%", pctF(swings)],
      [
        "Contact%",
        swings > 0 ? Math.round((contact / swings) * 100) + "%" : "—",
      ],
      ["Zone%", pctF(inZone.length)],
      [
        "Zone Swing%",
        inZone.length > 0
          ? Math.round((zoneSwings / inZone.length) * 100) + "%"
          : "—",
      ],
      [
        "Chase%",
        outZone.length > 0
          ? Math.round((chaseSwings / outZone.length) * 100) + "%"
          : "—",
      ],
      [
        "Whiff%",
        swings > 0
          ? Math.round(
              (allPitches.filter((p) => p.outcome === "strike-swinging")
                .length /
                swings) *
                100
            ) + "%"
          : "—",
      ],
      [
        "P/PA",
        (() => {
          if (allABs.length > 0 && total > 0)
            return (total / allABs.length).toFixed(2);
          const cs = getPlayerCareerStats(teamName, playerName, sortedGames);
          const pa = cs.pa || 0,
            ps = cs.pitchesSeen || 0;
          return pa > 0 && ps > 0 ? (ps / pa).toFixed(2) : "—";
        })(),
      ],
      [
        "Hard Hit%",
        contact > 0
          ? Math.round(
              (allPitches.filter((p) => p.spray?.hardHit).length / contact) *
                100
            ) + "%"
          : "—",
      ],
    ]
      .map(
        ([
          l,
          v,
        ]) => `<div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px;text-align:center">
      <div style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:22px;color:var(--text)">${v}</div>
      <div style="font-size:8px;letter-spacing:2px;color:var(--text3);text-transform:uppercase">${l}</div>
    </div>`
      )
      .join("")}
  </div>`;

  // ── By lineup slot ──
  const slotMap = {};
  allABs.forEach((ab) => {
    const slot = ab.pitches[0]?.batterIdx;
    if (slot === undefined || slot === null) return;
    const k = slot + 1; // 1-indexed
    if (!slotMap[k]) slotMap[k] = [];
    slotMap[k].push(_abToStats(ab));
  });
  const slotRows = Object.entries(slotMap)
    .sort((a, b) => +a[0] - +b[0])
    .map(([k, rows]) => {
      const ord = +k,
        suffix = ord === 1 ? "st" : ord === 2 ? "nd" : ord === 3 ? "rd" : "th";
      return _statsRow(`${ord}${suffix} in Lineup`, _sumStats(rows), false);
    });

  // ── Pinch hitting ──
  const phABs = allABs.filter((a) => a.pitches[0]?.isPH);
  const nonPHABs = allABs.filter((a) => !a.pitches[0]?.isPH);
  const phRows = phABs.length
    ? [
        _statsRow("Pinch Hitting", _sumStats(phABs.map(_abToStats)), true),
        _statsRow("Starting", _sumStats(nonPHABs.map(_abToStats)), false),
      ]
    : [];

  return `
    <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:9px;letter-spacing:3px;text-transform:uppercase;color:var(--text3);margin-bottom:10px">Plate Discipline</div>
    ${disciplineHTML}
    ${_splitsTable(homeAwayRows, "Home / Away")}
    ${_splitsTable(handRows, "Pitcher Handedness")}
    ${_splitsTable(runnersRows, "Runners on Base / RISP")}
    ${_splitsTable(outsRows, "Outs when AB Began")}
    ${_splitsTable(countRows, "Count Splits")}
    ${_splitsTable(pitcherRoleRows, "Starter vs Reliever")}
    ${_splitsTable(abNumRows, "Plate Appearance Number in Game")}
    ${_splitsTable(inningRows, "By Inning")}
    ${_splitsTable(recentRows, "Recent Performance")}
    ${monthRows.length > 1 ? _splitsTable(monthRows, "By Month") : ""}
    ${ptRows.length ? _splitsTable(ptRows, "By Pitch Type Faced") : ""}
    ${slotRows.length ? _splitsTable(slotRows, "By Lineup Slot") : ""}
    ${phRows.length ? _splitsTable(phRows, "Pinch Hit vs Starting") : ""}
  `;
}

function renderPlayer(teamName, playerName) {
  try {
    const _allTeamGames = getTeamGames(teamName);
    const _seasonGames = _seasonFilter
      ? _allTeamGames.filter((g) => g.date && g.date.slice(0, 4) === _seasonFilter)
      : _allTeamGames;
    const games = _recentFilter
      ? (() => {
          const names = _nameAliases[playerName] || new Set([playerName]);
          return [..._seasonGames]
            .sort((a, b) => b.date.localeCompare(a.date))
            .filter((g) => (g.pitchLog || []).some((p) => names.has(p.batter)))
            .slice(0, 5);
        })()
      : _seasonGames;
    const stats = getPlayerCareerStats(teamName, playerName, games);
    const allPitches = getPlayerPitches(teamName, playerName, games);

    const c = document.getElementById("hub-content");
    const pa =
      stats.pa != null ? stats.pa : stats.ab + stats.bb + (stats.hbp || 0);
    const avg = stats.ab > 0 ? stats.hits / stats.ab : 0;
    const obp =
      pa > 0
        ? (stats.hits + (stats.bb || 0) + (stats.hbp || 0) + (stats.ci || 0)) /
          pa
        : 0;
    const tb =
      stats.hits -
      stats.doubles -
      stats.triples -
      stats.hr +
      stats.doubles * 2 +
      stats.triples * 3 +
      stats.hr * 4;
    const slg = stats.ab > 0 ? tb / stats.ab : 0;
    const fmt = (n) => _fmtRate(n);

    const _rosterSidebar = buildRosterSidebar(
      teamName,
      playerName,
      games,
      "batter"
    );
    c.innerHTML = `<div style="display:flex;gap:0;align-items:flex-start;min-height:100%"><div style="flex:1;min-width:0">
    ${buildSeasonFilterBar()}
    <div class="breadcrumb">
      <a onclick="showView('team',this.getAttribute('data-team'))" data-team="${escAttr(
        teamName
      )}"">← ${escHtml(teamName)}</a>
      <span class="breadcrumb-sep">/</span>
      <span>${escHtml(playerName)}</span>
    </div>

    <div class="player-detail-header">
      <div class="player-number">#${stats.num || "—"}</div>
      <div>
<div class="player-info-name">${escHtml(playerName)}</div>
<div class="player-info-meta">${stats.pos || "—"} · ${
      stats.hand || "R"
    }HH · ${escHtml(teamName)} · ${stats.games} game${
      stats.games !== 1 ? "s" : ""
    } · ${stats.pitchesSeen || allPitches.length} pitches seen</div>
      </div>
      <div style="margin-left:auto;display:flex;gap:16px;align-items:center">
<div style="text-align:center"><div style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:32px;color:var(--accent)">${fmt(
      avg
    )}</div><div style="font-size:9px;letter-spacing:2px;color:var(--text3);text-transform:uppercase">AVG</div></div>
<div style="text-align:center"><div style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:32px">${fmt(
      obp
    )}</div><div style="font-size:9px;letter-spacing:2px;color:var(--text3);text-transform:uppercase">OBP</div></div>
<div style="text-align:center"><div style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:32px">${fmt(
      slg
    )}</div><div style="font-size:9px;letter-spacing:2px;color:var(--text3);text-transform:uppercase">SLG</div></div>
<div style="text-align:center"><div style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:32px;color:var(--green)">${fmt(
      obp + slg
    )}</div><div style="font-size:9px;letter-spacing:2px;color:var(--text3);text-transform:uppercase">OPS</div></div>
      </div>
    </div>

    <div class="stat-cards">
      <div class="stat-card"><div class="stat-card-val">${pa}</div><div class="stat-card-lbl">Plate App.</div></div>
      <div class="stat-card"><div class="stat-card-val">${
        stats.ab
      }</div><div class="stat-card-lbl">At Bats</div></div>
      <div class="stat-card"><div class="stat-card-val">${
        stats.hits
      }</div><div class="stat-card-lbl">Hits</div></div>
      <div class="stat-card"><div class="stat-card-val">${
        stats.doubles
      }</div><div class="stat-card-lbl">Doubles</div></div>
      <div class="stat-card"><div class="stat-card-val">${
        stats.triples
      }</div><div class="stat-card-lbl">Triples</div></div>
      <div class="stat-card accent"><div class="stat-card-val">${
        stats.hr
      }</div><div class="stat-card-lbl">Home Runs</div></div>
      <div class="stat-card"><div class="stat-card-val">${
        stats.r || 0
      }</div><div class="stat-card-lbl">Runs</div></div>
      <div class="stat-card"><div class="stat-card-val">${
        stats.rbi || 0
      }</div><div class="stat-card-lbl">RBI</div></div>
      <div class="stat-card"><div class="stat-card-val">${tb}</div><div class="stat-card-lbl">Total Bases</div></div>
      <div class="stat-card"><div class="stat-card-val">${
        stats.bb
      }</div><div class="stat-card-lbl">Walks</div></div>
      <div class="stat-card"><div class="stat-card-val">${
        stats.hbp || 0
      }</div><div class="stat-card-lbl">HBP</div></div>
      <div class="stat-card"><div class="stat-card-val">${
        stats.k
      }</div><div class="stat-card-lbl">Strikeouts</div></div>
      <div class="stat-card"><div class="stat-card-val">${
        stats.pitchesSeen || allPitches.length
      }</div><div class="stat-card-lbl">Pitches Seen</div></div>
    </div>

    <!-- Analysis Tabs -->
    <div class="scout-print-hide" style="display:flex;justify-content:flex-end;align-items:center;gap:10px;margin-bottom:8px">
      ${
        _recentFilter
          ? `<span style="font-family:'Barlow Condensed',sans-serif;font-size:11px;letter-spacing:1px;color:var(--text3);text-transform:uppercase">Showing last 5 games</span>`
          : ""
      }
      <button class="recent-filter-btn${
        _recentFilter ? " rfb-active" : ""
      }" onclick="toggleRecentFilter()">
${_recentFilter ? "⏱ Last 5 Games" : "⏱ Filter Recent"}
      </button>
    </div>
    <div class="tab-row" id="player-tab-row">
      <div class="tab active" onclick="playerTab('spray')">Spray Chart</div>
      <div class="tab" onclick="playerTab('zone')">Pitch Zone</div>
      <div class="tab" onclick="playerTab('breakdown')">Pitch Breakdown</div>
      <div class="tab" onclick="playerTab('stats')">Stats</div>
      <div class="tab" onclick="playerTab('splits')">Splits</div>
      <div class="tab" onclick="playerTab('baserunning')">Baserunning</div>
      <div class="tab" onclick="playerTab('defense')">Defense</div>
      <div class="tab" onclick="playerTab('scouting')">Scouting Report</div>
      <div class="tab" onclick="playerTab('gamelog')">Game Log</div>
    </div>

    <div id="ptab-stats" style="display:none">
      ${buildBatterStatsTab(teamName, playerName, games, stats, allPitches)}
    </div>

    <div id="ptab-splits" style="display:none">
      ${buildPlayerSplitsTab(teamName, playerName, games)}
    </div>

    <div id="ptab-scouting" style="display:none">
      <div style="display:flex;gap:8px;margin-bottom:14px" class="scout-print-hide">
<button onclick="printPlayerScoutReport('${escAttr(teamName)}','${escAttr(
      playerName
    )}','hitter')" style="padding:7px 18px;background:var(--accent);border:none;border-radius:7px;color:#fff;font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:14px;letter-spacing:1px;cursor:pointer;display:flex;align-items:center;gap:7px">🖨 Print Report</button>
      </div>
      <div id="ptab-scouting-content">${buildHitterScoutingReport(
        teamName,
        playerName,
        games
      )}</div>
    </div>

    <div id="ptab-baserunning" style="display:none">
      ${buildBaserunningTab(stats, games, teamName, playerName)}
    </div>

    <div id="ptab-defense" style="display:none">
      ${buildDefenseTab(stats, games, teamName, playerName)}
    </div>

    <div id="ptab-spray">
      <div style="display:grid;grid-template-columns:1fr 280px;gap:20px;align-items:start">
<div>
  <div class="section-title" style="margin-bottom:8px">Batted Ball Locations · ${
    allPitches.filter((p) => p.spray).length
  } balls in play</div>
  ${buildSprayChartSVG(allPitches)}
  ${sprayLegend()}
</div>
<div>
  <div class="section-title" style="margin-bottom:8px">Batted Ball Breakdown</div>
  ${buildBattedBallBreakdown(allPitches)}
</div>
      </div>
    </div>

    <div id="ptab-zone" style="display:none">
      <div style="display:grid;grid-template-columns:340px 1fr;gap:20px;align-items:start">
<div>
  <div class="section-title" style="margin-bottom:8px">Pitch Locations · <span id="player-zone-count">${
    allPitches.length
  } pitches</span></div>
  ${buildPitchTypeFilterBar(allPitches, "player-zone-wrap")}
  ${buildOutcomeFilterBar(allPitches, "player-zone-wrap")}
  <div id="player-zone-wrap">
    ${buildPitchZoneSVG(allPitches, 320, 290)}
  </div>
  ${pitchZoneLegend()}
</div>
<div>
  <div class="section-title" style="margin-bottom:8px">Zone Tendencies</div>
  ${buildZoneTendenciesFiltered(allPitches, "player-zt")}
  <div style="margin-top:16px">
    <div class="section-title" style="margin-bottom:8px">Hot / Cold Zone</div>
    ${buildHotColdZoneFiltered(allPitches, "batter", "player-hcz")}
  </div>
</div>
      </div>
    </div>

    <div id="ptab-breakdown" style="display:none">
      <div style="max-width:560px">
<div class="section-title" style="margin-bottom:10px">Pitch Analysis · ${
      allPitches.length
    } total pitches</div>
${buildPitchBreakdown(allPitches)}
      </div>
    </div>

    <div id="ptab-gamelog" style="display:none">
      <div class="section-title" style="margin-bottom:10px">Game Log</div>
      ${buildPlayerGameLog(teamName, playerName, games)}
    </div>
  ${_rosterSidebar.mobilePills}</div>${_rosterSidebar.sidebar}</div>`;
  } catch (e) {
    console.error("renderPlayer crashed:", e);
    document.getElementById("hub-content").innerHTML =
      '<div class="empty-state">Error loading player: ' + e.message + "</div>";
  }
}

function playerTab(tab) {
  _lastPlayerTab = tab;
  document.querySelectorAll("#player-tab-row .tab").forEach((t, i) => {
    const tabs = [
      "spray",
      "zone",
      "breakdown",
      "stats",
      "splits",
      "baserunning",
      "defense",
      "scouting",
      "gamelog",
    ];
    t.classList.toggle("active", tabs[i] === tab);
  });
  [
    "spray",
    "zone",
    "breakdown",
    "stats",
    "splits",
    "baserunning",
    "defense",
    "scouting",
    "gamelog",
  ].forEach((t) => {
    const el = document.getElementById("ptab-" + t);
    if (el) el.style.display = t === tab ? "block" : "none";
  });
  if (tab === "zone")
    setTimeout(() => selectAllPitchTypes("player-zone-wrap"), 0);
  // Push URL with tab sub-path
  if (
    typeof _ptPushDeepRoute === "function" &&
    currentView &&
    currentView.type === "player"
  )
    _ptPushDeepRoute("player", currentView.data, tab);
}

function buildBattedBallBreakdown(pitches) {
  const inPlay = pitches.filter((p) => p.spray);
  if (!inPlay.length)
    return '<div class="empty-state" style="padding:20px 0">No spray data yet</div>';
  const types = {
    flyball: 0,
    linedrive: 0,
    groundball: 0,
    weakgrounder: 0,
    popup: 0,
  };
  const zones = {};
  inPlay.forEach((p) => {
    const t = p.spray.btype;
    if (t && types[t] !== undefined) types[t]++;
    const z = p.spray.zone;
    if (z) zones[z] = (zones[z] || 0) + 1;
  });
  const total = inPlay.length;
  const typeLabels = {
    flyball: "Fly Ball",
    linedrive: "Line Drive",
    groundball: "Ground Ball",
    weakgrounder: "Weak Grounder",
    popup: "Pop Up",
  };
  const typeColors = {
    flyball: "#5baef5",
    linedrive: "#e8c84a",
    groundball: "#f57a7a",
    weakgrounder: "#c07020",
    popup: "#c084f5",
  };
  const rows = Object.entries(types)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([t, n]) => {
      const pct = Math.round((n / total) * 100);
      return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:12px;font-weight:600;color:#4a5060;width:100px;flex-shrink:0">${typeLabels[t]}</div>
      <div style="flex:1;background:#e8eaee;border-radius:3px;height:14px;overflow:hidden">
<div style="width:${pct}%;height:100%;background:${typeColors[t]};border-radius:3px"></div>
      </div>
      <div style="font-family:'Share Tech Mono',monospace;font-size:10px;color:#8a909e;width:42px;text-align:right;flex-shrink:0">${n} · ${pct}%</div>
    </div>`;
    })
    .join("");

  const topZones = Object.entries(zones)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const zoneRows = topZones
    .map(([z, n]) => {
      const pct = Math.round((n / total) * 100);
      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:4px 0;border-bottom:1px solid #f0f2f5;font-size:11px">
      <span style="color:#4a5060">${z}</span>
      <span style="font-family:'Share Tech Mono',monospace;color:#8a909e">${n} · ${pct}%</span>
    </div>`;
    })
    .join("");

  const hardHitPct =
    total > 0
      ? Math.round((inPlay.filter((p) => p.spray.hardHit).length / total) * 100)
      : 0;

  return `
    <div style="background:#fff;border:1px solid #d4d8e0;border-radius:8px;padding:14px;margin-bottom:14px">
      <div style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:26px;color:#cc1a1a;text-align:center">${hardHitPct}%</div>
      <div style="font-size:8px;letter-spacing:2px;color:#8a909e;text-transform:uppercase;text-align:center">Hard Hit%</div>
    </div>
    <div style="margin-bottom:14px">
      <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:9px;letter-spacing:3px;text-transform:uppercase;color:#8a909e;margin-bottom:8px">Ball Type</div>
      ${rows}
    </div>
    <div>
      <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:9px;letter-spacing:3px;text-transform:uppercase;color:#8a909e;margin-bottom:6px">Top Field Zones</div>
      ${zoneRows || "—"}
    </div>`;
}

// Pre-pitch count helper: returns { balls, strikes } as they were BEFORE the pitch was thrown.
// New entries (post-fix, flagged with _prePitchCount:true) store correct pre-pitch values directly.
// Old entries stored post-pitch counts for ball/strike/foul, so we reverse-engineer them.
function _ppc(p) {
  if (p._prePitchCount) return { balls: p.balls || 0, strikes: p.strikes || 0 };
  const b = p.balls || 0,
    s = p.strikes || 0,
    o = p.outcome;
  if (o === "ball") return { balls: Math.max(0, b - 1), strikes: s };
  if (o === "strike-swinging" || o === "strike-looking")
    return { balls: b, strikes: Math.max(0, s - 1) };
  if (o === "foul")
    return { balls: b, strikes: s > 0 ? Math.max(0, s - 1) : 0 };
  // In-play (hits, outs, hbp, ci, error, sacbunt, sacfly): no increment happened — stored value is already pre-pitch
  return { balls: b, strikes: s };
}

// Strike outcomes: called K, swinging K, foul, any ball in play (batted ball = pitcher threw a strike)
function _isStrike(o) {
  return [
    "strike-swinging",
    "strike-looking",
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
  ].includes(o);
}

// First pitch of an at-bat: tagged by _extractABs with _abPitchIndex===0
// Falls back to _ppc() which correctly gives the pre-pitch count
function _isFirstPitch(p) {
  if (p._abPitchIndex !== undefined) return p._abPitchIndex === 0;
  const c = _ppc(p);
  return c.balls === 0 && c.strikes === 0;
}

function buildZoneTendencies(pitches) {
  if (!pitches.length)
    return '<div class="empty-state" style="padding:20px 0">No data</div>';
  const inZone = pitches.filter(
    (p) =>
      p.pitchX != null &&
      p.pitchX >= 31 &&
      p.pitchX <= 69 &&
      p.pitchY != null &&
      p.pitchY >= 30.9 &&
      p.pitchY <= 69.1
  );
  const total = pitches.length;
  const balls = pitches.filter((p) => p.outcome === "ball").length;
  const swStrikes = pitches.filter(
    (p) => p.outcome === "strike-swinging"
  ).length;
  const calledStrikes = pitches.filter(
    (p) => p.outcome === "strike-looking"
  ).length;
  const fouls = pitches.filter((p) => p.outcome === "foul").length;
  const contact = pitches.filter((p) =>
    [
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
  const totalStrikes = pitches.filter((p) => _isStrike(p.outcome)).length;
  const strPct = total > 0 ? Math.round((totalStrikes / total) * 100) : 0;

  // First-pitch strike%
  const fp = pitches.filter((p) => _isFirstPitch(p));
  const fpStrikes = fp.filter((p) => _isStrike(p.outcome)).length;
  const fpsPct =
    fp.length > 0 ? Math.round((fpStrikes / fp.length) * 100) : null;

  // Per pitch-type strike%
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
  const byType = {};
  pitches.forEach((p) => {
    const t = p.pitchType && p.pitchType !== "—" ? p.pitchType : "UNKN";
    if (!byType[t]) byType[t] = { total: 0, strikes: 0 };
    byType[t].total++;
    if (_isStrike(p.outcome)) byType[t].strikes++;
  });
  const typeStrRows = Object.entries(byType)
    .filter(([, d]) => d.total >= 1)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([t, d]) => {
      const pct = Math.round((d.strikes / d.total) * 100);
      const col = typeColors[t] || "#8a909e";
      return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">
<div style="font-family:'Share Tech Mono',monospace;font-size:10px;color:${col};width:28px;flex-shrink:0;font-weight:700">${t}</div>
<div style="flex:1;min-width:0;max-width:55%;background:var(--surface3);border-radius:3px;height:12px;overflow:hidden">
  <div style="width:${pct}%;height:100%;background:${col};border-radius:3px;opacity:.85"></div>
</div>
<div style="font-family:'Share Tech Mono',monospace;font-size:10px;color:#8a909e;white-space:nowrap;flex-shrink:0;text-align:right">${d.strikes}/${d.total} · ${pct}%</div>
      </div>`;
    })
    .join("");

  const row = (
    label,
    n,
    col,
    extra = ""
  ) => `<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;border-radius:6px;margin-bottom:4px;background:var(--surface2)">
    <span style="font-family:'Barlow Condensed',sans-serif;font-weight:600;font-size:13px;color:var(--text2)">${label}</span>
    <span style="font-family:'Share Tech Mono',monospace;font-size:11px;color:${
      col || "#8a909e"
    }">${n}${extra}</span>
  </div>`;

  return `
    <div style="margin-bottom:14px">
      ${row("Total Pitches", total, "#111318")}
      ${row(
        "Strikes (all)",
        totalStrikes,
        "#cc1a1a",
        ` <span style="opacity:.6">(${strPct}%)</span>`
      )}
      ${row(
        "Balls",
        balls,
        "#1a5acc",
        ` <span style="opacity:.6">(${
          total > 0 ? Math.round((balls / total) * 100) : 0
        }%)</span>`
      )}
      ${row(
        "Called Strikes",
        calledStrikes,
        "#f57a7a",
        ` <span style="opacity:.6">(${
          total > 0 ? Math.round((calledStrikes / total) * 100) : 0
        }%)</span>`
      )}
      ${row(
        "Swinging Strikes",
        swStrikes,
        "#cc1a1a",
        ` <span style="opacity:.6">(${
          total > 0 ? Math.round((swStrikes / total) * 100) : 0
        }%)</span>`
      )}
      ${row(
        "Foul Balls",
        fouls,
        "#c07020",
        ` <span style="opacity:.6">(${
          total > 0 ? Math.round((fouls / total) * 100) : 0
        }%)</span>`
      )}
      ${row(
        "Balls in Play",
        contact,
        "#1a8a3a",
        ` <span style="opacity:.6">(${
          total > 0 ? Math.round((contact / total) * 100) : 0
        }%)</span>`
      )}
      ${
        pitches.filter((p) => p.outcome === "hbp").length > 0
          ? row(
              "Hit By Pitch",
              pitches.filter((p) => p.outcome === "hbp").length,
              "#8822cc",
              ` <span style="opacity:.6">(${
                total > 0
                  ? Math.round(
                      (pitches.filter((p) => p.outcome === "hbp").length /
                        total) *
                        100
                    )
                  : 0
              }%)</span>`
            )
          : ""
      }
    </div>

    <!-- Key rate stats -->
    <div style="background:#fff;border:1px solid #d4d8e0;border-radius:8px;padding:12px;margin-bottom:14px">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;text-align:center">
<div>
  <div style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:26px;color:#cc1a1a">${strPct}%</div>
  <div style="font-size:8px;letter-spacing:2px;color:#8a909e;text-transform:uppercase">Strike%</div>
</div>
<div>
  <div style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:26px;color:${
    fpsPct !== null && fpsPct >= 60
      ? "#1a8a3a"
      : fpsPct !== null && fpsPct < 50
      ? "#cc1a1a"
      : "#111318"
  }">${fpsPct !== null ? fpsPct + "%" : "—"}</div>
  <div style="font-size:8px;letter-spacing:2px;color:#8a909e;text-transform:uppercase">FPS%</div>
  ${
    fp.length > 0
      ? `<div style="font-size:8px;color:#8a909e;margin-top:2px">${fpStrikes}/${fp.length} AB</div>`
      : ""
  }
</div>
<div>
  <div style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:26px">${
    total > 0 ? Math.round((inZone.length / total) * 100) : 0
  }%</div>
  <div style="font-size:8px;letter-spacing:2px;color:#8a909e;text-transform:uppercase">Zone%</div>
</div>
      </div>
    </div>

    <!-- Per pitch-type strike% -->
    ${
      typeStrRows
        ? `<div style="margin-bottom:6px">
      <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:9px;letter-spacing:3px;text-transform:uppercase;color:#8a909e;margin-bottom:8px">Strike% by Pitch Type</div>
      ${typeStrRows}
    </div>`
        : ""
    }`;
}

function buildBatterStatsTab(teamName, playerName, games, stats, allPitches) {
  // stats: aggregated career object from getPlayerCareerStats()
  const s = stats || {};
  const pa = s.pa != null ? s.pa : (s.ab || 0) + (s.bb || 0) + (s.hbp || 0);
  const tb =
    (s.hits || 0) -
    (s.doubles || 0) -
    (s.triples || 0) -
    (s.hr || 0) +
    (s.doubles || 0) * 2 +
    (s.triples || 0) * 3 +
    (s.hr || 0) * 4;
  const avg = (s.ab || 0) > 0 ? s.hits / s.ab : null;
  const obp =
    pa > 0
      ? ((s.hits || 0) + (s.bb || 0) + (s.hbp || 0) + (s.ci || 0)) / pa
      : null;
  const slg = (s.ab || 0) > 0 ? tb / s.ab : null;
  const ops = obp !== null && slg !== null ? obp + slg : null;
  const iso = (s.ab || 0) > 0 ? (tb - (s.hits || 0)) / s.ab : null;
  const babipD = (s.ab || 0) - (s.k || 0) - (s.hr || 0);
  const babip = babipD > 0 ? ((s.hits || 0) - (s.hr || 0)) / babipD : null;
  const kPct = pa > 0 ? (s.k || 0) / pa : null;
  const bbPct = pa > 0 ? (s.bb || 0) / pa : null;
  const sbAtt = (s.sb || 0) + (s.cs || 0);
  const sbPct = sbAtt > 0 ? (s.sb || 0) / sbAtt : null;
  const ppa =
    pa > 0 && (s.pitchesSeen || 0) > 0
      ? (s.pitchesSeen || allPitches.length) / pa
      : null;

  const fR = (v) => (v !== null && v !== undefined ? _fmtRate(v) : ".---");
  const fP = (v, dec = 1) =>
    v !== null && v !== undefined ? (v * 100).toFixed(dec) + "%" : "—";
  const fI = (v) =>
    v !== null && v !== undefined ? Math.round(v).toString() : "—";

  // Shared table helpers (same pattern as buildPitcherStatsTab)
  const tbl = (content) =>
    `<div style="overflow-x:auto;margin-bottom:28px"><table style="width:100%;border-collapse:collapse;background:var(--surface);border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.06)">${content}</table></div>`;
  const th = (label, left) =>
    `<th style="padding:8px 10px;font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:var(--text3);white-space:nowrap;background:var(--surface2);border-bottom:2px solid var(--border);text-align:${
      left ? "left" : "center"
    }">${label}</th>`;
  const td = (val, style) =>
    `<td style="padding:8px 10px;font-family:'Share Tech Mono',monospace;font-size:12px;color:var(--text2);text-align:center;border-bottom:1px solid var(--surface2);white-space:nowrap${
      style ? ";" + style : ""
    }">${val}</td>`;
  const tdL = (val, bold) =>
    `<td style="padding:8px 10px;font-family:'Barlow Condensed',sans-serif;font-weight:${
      bold ? 700 : 600
    };font-size:14px;color:${
      bold ? "var(--text)" : "var(--text2)"
    };text-align:left;border-bottom:1px solid var(--surface2);white-space:nowrap">${val}</td>`;

  const avgColor = (v) =>
    v === null
      ? ""
      : v >= 0.3
      ? "color:#cc1a1a;font-weight:800"
      : v < 0.2
      ? "color:#8a909e"
      : "";
  const opsColor = (v) =>
    v === null
      ? ""
      : v >= 0.8
      ? "color:#cc1a1a;font-weight:800"
      : v < 0.6
      ? "color:#1a8a3a;font-weight:700"
      : "";

  // ── Career batting line ──
  const careerSection = `
    <div style="margin-bottom:28px">
      <div class="section-title" style="margin-bottom:12px">Career Batting</div>
      ${tbl(`
<thead><tr>
  ${th("G", true)}${th("PA")}${th("AB")}${th("R")}${th("H")}${th("2B")}${th(
        "3B"
      )}${th("HR")}
  ${th("RBI")}${th("BB")}${th("HBP")}${th("K")}${th("SB")}${th("CS")}${th(
        "SB%"
      )}
  ${th("AVG")}${th("OBP")}${th("SLG")}${th("OPS")}${th("ISO")}${th("BABIP")}
  ${th("K%")}${th("BB%")}${th("P/PA")}
</tr></thead>
<tbody><tr>
  ${tdL(s.games || 0, true)}
  ${td(pa)}${td(s.ab || 0)}${td(s.r || 0)}${td(s.hits || 0)}
  ${td(s.doubles || 0)}${td(s.triples || 0)}
  ${td(s.hr || 0, (s.hr || 0) > 0 ? "color:#cc1a1a;font-weight:800" : "")}
  ${td(s.rbi || 0)}${td(s.bb || 0)}${td(s.hbp || 0)}${td(s.k || 0)}
  ${td(s.sb || 0)}${td(s.cs || 0)}${td(fP(sbPct))}
  ${td(fR(avg), avgColor(avg))}
  ${td(fR(obp))}${td(fR(slg))}
  ${td(fR(ops), opsColor(ops))}
  ${td(fR(iso))}${td(fR(babip))}
  ${td(fP(kPct))}${td(fP(bbPct))}
  ${td(ppa !== null ? ppa.toFixed(2) : "—")}
</tr></tbody>`)}
    </div>`;

  // ── Batting splits table ──
  const sortedGames = [...games].sort((a, b) => a.date.localeCompare(b.date));
  const allABs = sortedGames.flatMap((g) =>
    _extractABs(g.pitchLog || [], playerName, teamName, g)
  );
  const _splitSt = (filterFn) => {
    const rows = allABs.filter(filterFn).map(_abToStats);
    return rows.length ? _sumStats(rows) : null;
  };
  const splitDefs = [
    { label: "Overall", st: _splitSt(() => true) },
    { label: "vs LHP", st: _splitSt((a) => a.pitcherHand === "L") },
    { label: "vs RHP", st: _splitSt((a) => a.pitcherHand !== "L") },
    { label: "Home", st: _splitSt((a) => a.isHome) },
    { label: "Away", st: _splitSt((a) => !a.isHome) },
    {
      label: "RISP",
      st: _splitSt((a) => a.runnersOn?.["2nd"] || a.runnersOn?.["3rd"]),
    },
    {
      label: "Bases Empty",
      st: _splitSt(
        (a) =>
          !a.runnersOn?.["1st"] &&
          !a.runnersOn?.["2nd"] &&
          !a.runnersOn?.["3rd"]
      ),
    },
    {
      label: "Runners On",
      st: _splitSt(
        (a) =>
          a.runnersOn?.["1st"] || a.runnersOn?.["2nd"] || a.runnersOn?.["3rd"]
      ),
    },
    {
      label: "2-Strike",
      st: _splitSt((a) => a.pitches.some((p) => _ppc(p).strikes === 2)),
    },
  ];

  const splitRowFn = (lbl, st, bold) => {
    if (!st || st.pa === 0)
      return `<tr>${tdL(
        lbl,
        bold
      )}<td colspan="13" style="padding:8px 10px;color:var(--text3);font-style:italic;font-family:'Barlow Condensed',sans-serif;text-align:center">No data</td></tr>`;
    const stb =
      (st.hits || 0) -
      (st.h2b || 0) -
      (st.h3b || 0) -
      (st.hr || 0) +
      (st.h2b || 0) * 2 +
      (st.h3b || 0) * 3 +
      (st.hr || 0) * 4;
    const stObp = st.pa > 0 ? (st.h + st.bb + st.hbp) / st.pa : null;
    const stSlg = st.ab > 0 ? stb / st.ab : null;
    const stOps = stObp !== null && stSlg !== null ? stObp + stSlg : null;
    const stIso = st.ab > 0 ? (stb - st.h) / st.ab : null;
    return `<tr>
      ${tdL(lbl, bold)}
      ${td(st.pa)}${td(st.ab)}${td(st.h)}${td(st.h2b)}${td(st.h3b)}
      ${td(st.hr, st.hr > 0 ? "color:#cc1a1a;font-weight:800" : "")}
      ${td(st.bb)}${td(st.hbp)}${td(st.k)}
      ${td(
        fR(st.ab > 0 ? st.h / st.ab : null),
        avgColor(st.ab > 0 ? st.h / st.ab : null)
      )}
      ${td(fR(stObp))}${td(fR(stSlg))}
      ${td(fR(stOps), opsColor(stOps))}
      ${td(fR(stIso))}
      ${td(st.pa > 0 ? fP(st.k / st.pa) : "")}${td(
      st.pa > 0 ? fP(st.bb / st.pa) : ""
    )}
    </tr>`;
  };

  const splitsSection = `
    <div style="margin-bottom:28px">
      <div class="section-title" style="margin-bottom:12px">Batting Splits</div>
      ${tbl(`
<thead><tr>
  ${th("Split", true)}${th("PA")}${th("AB")}${th("H")}${th("2B")}${th(
        "3B"
      )}${th("HR")}
  ${th("BB")}${th("HBP")}${th("K")}
  ${th("AVG")}${th("OBP")}${th("SLG")}${th("OPS")}${th("ISO")}
  ${th("K%")}${th("BB%")}
</tr></thead>
<tbody>
  ${splitDefs
    .map(({ label, st }, i) => splitRowFn(label, st, i === 0))
    .join("")}
</tbody>`)}
    </div>`;

  // ── Fielding ──
  let fPO = 0,
    fA = 0,
    fE = 0;
  const fByPos = {};
  games.forEach((g) => {
    Object.values(g.fieldingStats || {}).forEach((f) => {
      const fNames = _nameAliases[playerName] || new Set([playerName]);
      if (!fNames.has(f.name)) return;
      if (g.awayTeam !== teamName && g.homeTeam !== teamName) return;
      fPO += f.po || 0;
      fA += f.a || 0;
      fE += f.e || 0;
      const pos = f.pos || "—";
      if (!fByPos[pos]) fByPos[pos] = { po: 0, a: 0, e: 0 };
      fByPos[pos].po += f.po || 0;
      fByPos[pos].a += f.a || 0;
      fByPos[pos].e += f.e || 0;
    });
  });
  const fTC = fPO + fA + fE;
  const fFPCT = fTC > 0 ? _fmtRate((fPO + fA) / fTC) : "—";

  const fieldingSection =
    fTC > 0
      ? `
    <div style="margin-bottom:28px">
      <div class="section-title" style="margin-bottom:12px">Fielding</div>
      ${tbl(`
<thead><tr>
  ${th("Pos", true)}${th("PO")}${th("A")}${th("E")}${th("TC")}${th("FPCT")}
</tr></thead>
<tbody>
  ${Object.entries(fByPos)
    .map(([pos, f]) => {
      const tc = f.po + f.a + f.e;
      return `<tr>${tdL(pos, false)}${td(f.po)}${td(f.a)}${td(
        f.e,
        f.e > 0 ? "color:#cc1a1a" : ""
      )}${td(tc)}${td(tc > 0 ? _fmtRate((f.po + f.a) / tc) : "—")}</tr>`;
    })
    .join("")}
  <tr>${tdL("Total", true)}${td(fPO)}${td(fA)}${td(
        fE,
        fE > 0 ? "color:#cc1a1a" : ""
      )}${td(fTC)}${td(fFPCT)}</tr>
</tbody>`)}
    </div>`
      : "";

  // ── Game-by-game log ──
  const gameRows = [];
  games.forEach((g) => {
    const isHome = g.homeTeam === teamName;
    const batters = isHome ? g.homeBatters : g.awayBatters;
    const names = _nameAliases[playerName] || new Set([playerName]);
    const p = batters?.find((b) => names.has(b.name));
    if (!p || (p.ab || 0) + (p.bb || 0) + (p.hbp || 0) === 0) return;
    const gpa = p.pa != null ? p.pa : (p.ab || 0) + (p.bb || 0) + (p.hbp || 0);
    const gtb =
      (p.hits || 0) -
      (p.doubles || 0) -
      (p.triples || 0) -
      (p.hr || 0) +
      (p.doubles || 0) * 2 +
      (p.triples || 0) * 3 +
      (p.hr || 0) * 4;
    const gavg = (p.ab || 0) > 0 ? _fmtRate(p.hits / p.ab) : ".---";
    const gobp =
      gpa > 0
        ? _fmtRate(((p.hits || 0) + (p.bb || 0) + (p.hbp || 0)) / gpa)
        : ".---";
    const gslg = (p.ab || 0) > 0 ? _fmtRate(gtb / p.ab) : ".---";
    const opp = isHome ? g.awayTeam : g.homeTeam;
    gameRows.push(`<tr>
      ${tdL(g.date, false)}${tdL(escHtml(opp), false)}
      ${td(gpa)}${td(p.ab || 0)}${td(p.hits || 0)}
      ${td(p.doubles || 0)}${td(p.triples || 0)}
      ${td(p.hr || 0, (p.hr || 0) > 0 ? "color:#cc1a1a;font-weight:800" : "")}
      ${td(p.rbi || 0)}${td(p.bb || 0)}${td(p.hbp || 0)}${td(p.k || 0)}
      ${td(p.sb || 0)}${td(p.pitchesSeen || "—")}
      ${td(gavg, avgColor((p.ab || 0) > 0 ? p.hits / p.ab : null))}
      ${td(gobp)}${td(gslg)}
    </tr>`);
  });

  const gameLogSection = gameRows.length
    ? `
    <div>
      <div class="section-title" style="margin-bottom:12px">Game-by-Game Log</div>
      ${tbl(`
<thead><tr>
  ${th("Date", true)}${th("Opp", true)}
  ${th("PA")}${th("AB")}${th("H")}${th("2B")}${th("3B")}${th("HR")}
  ${th("RBI")}${th("BB")}${th("HBP")}${th("K")}${th("SB")}${th("P/PA")}
  ${th("AVG")}${th("OBP")}${th("SLG")}
</tr></thead>
<tbody>${gameRows.join("")}</tbody>`)}
    </div>`
    : "";

  return careerSection + splitsSection + fieldingSection + gameLogSection;
}

function buildPlayerGameLog(teamName, playerName, games) {
  const rows = [];
  games.forEach((g) => {
    const isHome = g.homeTeam === teamName;
    const batters = isHome ? g.homeBatters : g.awayBatters;
    const p = batters?.find((b) => b.name === playerName);
    if (!p || (p.ab || 0) + (p.bb || 0) + (p.hbp || 0) === 0) return;
    const avg = p.ab > 0 ? _fmtRate(p.hits / p.ab) : ".---";
    const opp = isHome ? g.awayTeam : g.homeTeam;
    const gpa = p.pa != null ? p.pa : p.ab + (p.bb || 0) + (p.hbp || 0);
    rows.push(`<tr>
      <td>${g.date}</td>
      <td>${escHtml(opp)}</td>
      <td>${gpa}</td><td>${p.ab}</td><td>${p.hits}</td><td>${
      p.doubles
    }</td><td>${p.triples}</td>
      <td class="${p.hr > 0 ? "highlight" : ""}">${p.hr}</td>
      <td>${p.bb || 0}</td><td>${p.hbp || 0}</td><td>${p.k}</td>
      <td>${p.pitchesSeen || "—"}</td>
      <td>${avg}</td>
      <td style="font-size:10px;color:var(--text3)">${(p.results || []).join(
        " "
      )}</td>
    </tr>`);
  });
  if (!rows.length)
    return '<div class="empty-state">No at-bat data found</div>';
  return `<table class="data-table">
    <thead><tr><th>Date</th><th>Opp</th><th>PA</th><th>AB</th><th>H</th><th>2B</th><th>3B</th><th>HR</th><th>BB</th><th>HBP</th><th>K</th><th>P/PA</th><th>AVG</th><th>Results</th></tr></thead>
    <tbody>${rows.join("")}</tbody>
  </table>`;
}

// ===== GAME VIEW =====
function renderGame(gameId) {
  const g = allGames.find((x) => x.id === gameId);
  if (!g) {
    document.getElementById("hub-content").innerHTML =
      '<div class="empty-state">Game not found</div>';
    return;
  }

  const c = document.getElementById("hub-content");
  const winner =
    g.awayScore > g.homeScore
      ? g.awayTeam
      : g.homeScore > g.awayScore
      ? g.homeTeam
      : "Tie";
  c.innerHTML = `
    <div class="breadcrumb">
      <a onclick="showView('games')">← All Games</a>
    </div>
    <div class="page-header">
      <div>
<div class="page-title">${escHtml(
    g.awayTeam
  )} <span style="color:var(--text3);font-weight:400">vs</span> ${escHtml(
    g.homeTeam
  )}</div>
<div class="page-sub">${g.date} · ${g.innings} innings · ${
    g.totalPitches || 0
  } pitches</div>
      </div>
      <div style="display:flex;align-items:center;gap:12px">
<div style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:40px;color:var(--accent)">${
    g.awayScore
  }–${g.homeScore}</div>
<button onclick="promptDeleteGame('${g.id}','${escHtml(
    g.awayTeam
  )} vs ${escHtml(g.homeTeam)} (${g.date})')"
  style="padding:7px 14px;background:transparent;border:1.5px solid #d4d8e0;border-radius:8px;color:#8a909e;font-family:Barlow Condensed,sans-serif;font-weight:700;font-size:13px;cursor:pointer;transition:all .14s;white-space:nowrap"
  onmouseover="this.style.borderColor='#cc1a1a';this.style.color='#cc1a1a';this.style.background='rgba(204,26,26,.05)'"
  onmouseout="this.style.borderColor='#d4d8e0';this.style.color='#8a909e';this.style.background='transparent'"style="display:inline-flex;align-items:center;gap:6px"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="14" viewBox="0 0 13 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="1,3 12,3"/><path d="M4,3V2a1,1,0,0,1,1-1h3a1,1,0,0,1,1,1V3"/><path d="M2,3l.7,8.5A1,1,0,0,0,3.7,12.5h5.6a1,1,0,0,0,1-.99L11,3"/><line x1="5" y1="6" x2="5" y2="10"/><line x1="8" y1="6" x2="8" y2="10"/></svg> Delete Game</button>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px">
      <div>
<div class="section-title">${escHtml(g.awayTeam)} Batters</div>
${buildBatterTable(aggregateBattersFromGame(g.awayBatters), g.awayTeam)}
      </div>
      <div>
<div class="section-title">${escHtml(g.homeTeam)} Batters</div>
${buildBatterTable(aggregateBattersFromGame(g.homeBatters), g.homeTeam)}
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px">
      <div>
<div class="section-title">${escHtml(g.awayTeam)} Pitchers</div>
${buildPitcherTable(aggregatePitchersFromGame(g.awayPitchers))}
      </div>
      <div>
<div class="section-title">${escHtml(g.homeTeam)} Pitchers</div>
${buildPitcherTable(aggregatePitchersFromGame(g.homePitchers))}
      </div>
    </div>

    ${
      g.gameLog?.length
        ? `
    <div class="section-title">Play-by-Play Log</div>
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow:hidden;max-height:400px;overflow-y:auto">
      ${g.gameLog
        .map(
          (e) => `
<div style="display:flex;align-items:flex-start;gap:10px;padding:8px 14px;border-bottom:1px solid var(--surface2)">
  <div style="font-size:14px;flex-shrink:0">${e.icon}</div>
  <div style="flex:1"><div style="font-family:Barlow Condensed,sans-serif;font-weight:700;font-size:13px">${escHtml(
    e.main
  )}</div>${
            e.meta
              ? `<div style="font-size:10px;color:var(--text3)">${escHtml(
                  e.meta
                )}</div>`
              : ""
          }</div>
  <div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--text3);white-space:nowrap">${
    e.isTop ? "TOP" : "BOT"
  } ${e.inning}</div>
</div>`
        )
        .join("")}
    </div>`
        : ""
    }
  `;
}
