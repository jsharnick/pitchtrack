let _opponents = [];
let _oppEditingId = null;
let _oppEditingPid = null;
let _oppOpenId = null; // which opponent is open in detail view
let _oppSelectMode = false; // bulk-select mode active?
let _oppSelected = new Set(); // IDs checked in select mode

// ── Persistence ──────────────────────────────────────────────────────
async function oppLoad() {
  try {
    const idxRaw = await window.storage.get(
      "pitchtrack_opponents",
      true
    );
    const index = idxRaw ? JSON.parse(idxRaw.value) : [];
    _opponents = [];
    for (const entry of index) {
      try {
        const raw = await window.storage.get(
          "pitchtrack_opp_" + entry.id,
          true
        );
        if (raw?.value) {
          _opponents.push(JSON.parse(raw.value));
        } else {
          _opponents.push({
            id: entry.id,
            name: entry.name,
            roster: [],
          });
        }
      } catch (e) {
        _opponents.push({ id: entry.id, name: entry.name, roster: [] });
      }
    }
  } catch (e) {
    _opponents = [];
  }
  oppRenderAll();
}

async function oppSaveIndex() {
  await window.storage.set(
    "pitchtrack_opponents",
    JSON.stringify(_opponents.map((o) => ({ id: o.id, name: o.name }))),
    true
  );
}

async function oppSaveOne(opp) {
  await window.storage.set(
    "pitchtrack_opp_" + opp.id,
    JSON.stringify(opp),
    true
  );
  await oppSaveIndex();
}

async function oppDeleteOne(id) {
  _opponents = _opponents.filter((o) => o.id !== id);
  try {
    await window.storage.delete("pitchtrack_opp_" + id, true);
  } catch (e) {}
  await oppSaveIndex();
  oppRenderAll();
}

// ── Create new opponent ───────────────────────────────────────────────
function oppLoadNew() {
  const id =
    "opp_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
  const opp = { id, name: "New Opponent", roster: [] };
  _opponents.push(opp);
  oppSaveOne(opp);
  oppRenderAll();
  // Open detail immediately so user can rename
  oppOpenDetail(id);
  setTimeout(() => {
    const inp = document.getElementById("opp-detail-name");
    if (inp) {
      inp.focus();
      inp.select();
    }
  }, 50);
}

// ── Open / close detail view ──────────────────────────────────────────
function oppOpenDetail(id) {
  const opp = _opponents.find((o) => o.id === id);
  if (!opp) return;
  // Exit select mode when drilling into a team
  _oppSelectMode = false;
  _oppSelected.clear();
  _oppOpenId = id;
  document.getElementById("opp-list-view").style.display = "none";
  const detail = document.getElementById("opp-detail");
  detail.classList.add("open");
  document.getElementById("opp-detail-name").value = opp.name;
  oppRefreshDetail();
}

function oppCloseDetail() {
  _oppOpenId = null;
  document.getElementById("opp-list-view").style.display = "flex";
  document.getElementById("opp-detail").classList.remove("open");
  oppRenderAll();
}

// ── Refresh the open detail panel ─────────────────────────────────────
function oppRefreshDetail() {
  const opp = _opponents.find((o) => o.id === _oppOpenId);
  if (!opp) return;
  const sub = document.getElementById("opp-detail-sub");
  if (sub)
    sub.textContent =
      opp.roster.length +
      " player" +
      (opp.roster.length !== 1 ? "s" : "");
  const body = document.getElementById("opp-detail-roster");
  if (body) _oppRenderRoster(opp, body);
}

// ── Render tile grid (list view) ──────────────────────────────────────
function oppRenderAll() {
  oppRefreshUseButtons();
  const list = document.getElementById("opponents-list");
  const sub = document.getElementById("opponents-subtitle");
  if (!list) return;
  const n = _opponents.length;
  if (sub)
    sub.textContent =
      n === 0 ? "No opponents yet" : n + " team" + (n !== 1 ? "s" : "");

  // Sync the Select button label
  const selBtn = document.getElementById("opp-select-toggle-btn");
  if (selBtn) selBtn.textContent = _oppSelectMode ? "Done" : "Select";

  // Show/hide the bulk-delete bar
  const bar = document.getElementById("opp-bulk-bar");
  if (bar) {
    const count = _oppSelected.size;
    bar.style.display = _oppSelectMode && count > 0 ? "flex" : "none";
    const barLabel = document.getElementById("opp-bulk-label");
    if (barLabel) barLabel.textContent = count + " selected";
  }

  if (!n) {
    list.innerHTML = `<div style="text-align:center;padding:64px 20px;color:var(--text3)">
      <div style="font-size:40px;margin-bottom:12px">🎯</div>
      <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:18px;margin-bottom:6px">No opponents loaded</div>
      <div style="font-size:13px">Click <strong>+ Load New Opponent</strong> to start building your scouting library.</div>
    </div>`;
    return;
  }
  list.innerHTML = `<div class="opp-tiles-grid">${_opponents
    .map((opp) => {
      const checked = _oppSelected.has(opp.id);
      const checkStyle = _oppSelectMode
        ? `position:absolute;top:10px;left:10px;width:18px;height:18px;border-radius:50%;border:2px solid ${
            checked ? "var(--accent)" : "var(--border2)"
          };background:${
            checked ? "var(--accent)" : "var(--surface)"
          };display:flex;align-items:center;justify-content:center;transition:all .12s;flex-shrink:0;`
        : "display:none;";
      const checkMark = checked
        ? `<span style="color:#fff;font-size:10px;line-height:1;margin-top:1px">✓</span>`
        : "";
      const tileClick = _oppSelectMode
        ? `oppToggleSelect('${opp.id}')`
        : `oppOpenDetail('${opp.id}')`;
      const tileDim = _oppSelectMode && !checked ? "opacity:0.55;" : "";
      return `
      <div class="opp-tile" onclick="${tileClick}" style="${tileDim}position:relative;">
        <div style="${checkStyle}">${checkMark}</div>
        <div style="font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:2px;color:var(--text3);text-transform:uppercase;margin-bottom:2px">Opponent</div>
        <div class="opp-tile-name">${escHtml(opp.name)}</div>
        <div class="opp-tile-meta">${opp.roster.length} player${
        opp.roster.length !== 1 ? "s" : ""
      }</div>
        ${_oppSelectMode ? "" : `<div class="opp-tile-arrow">›</div>
        <button class="opp-tile-season-btn" onclick="event.stopPropagation();_showSeasonPicker('${escAttr(opp.name)}')" title="Add to season archive">+ Season</button>`}
      </div>`;
    })
    .join("")}
  </div>`;
}

// ── Bulk select helpers ───────────────────────────────────────────────
function oppToggleSelectMode() {
  _oppSelectMode = !_oppSelectMode;
  if (!_oppSelectMode) _oppSelected.clear();
  oppRenderAll();
}

function oppToggleSelect(id) {
  if (_oppSelected.has(id)) _oppSelected.delete(id);
  else _oppSelected.add(id);
  oppRenderAll();
}

function oppSelectAll() {
  _opponents.forEach((o) => _oppSelected.add(o.id));
  oppRenderAll();
}

async function oppDeleteSelected() {
  const ids = [..._oppSelected];
  if (!ids.length) return;
  const n = ids.length;
  if (
    !confirm(
      `Remove ${n} opponent${
        n !== 1 ? "s" : ""
      }? This cannot be undone.`
    )
  )
    return;
  for (const id of ids) {
    _opponents = _opponents.filter((o) => o.id !== id);
    try {
      await window.storage.delete("pitchtrack_opp_" + id, true);
    } catch (e) {}
  }
  await oppSaveIndex();
  _oppSelected.clear();
  _oppSelectMode = false;
  oppRenderAll();
}

function _oppRenderRoster(opp, container) {
  if (!opp.roster.length) {
    container.innerHTML = `<div style="padding:20px 0;text-align:center;color:var(--text3);font-size:12px">No players yet — add manually or import a file.</div>`;
    return;
  }
  let html = "";
  let remaining = [...opp.roster];
  for (const grp of POS_GROUPS) {
    const players = remaining.filter(grp.match);
    if (!players.length) continue;
    remaining = remaining.filter((p) => !grp.match(p));
    html += `<div style="margin-bottom:20px">
      <div style="font-family:'Barlow',sans-serif;font-weight:700;font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--text3);margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid var(--border)">${grp.label} <span style="color:var(--text3);font-weight:400">(${players.length})</span></div>
      <div style="display:flex;flex-wrap:wrap;gap:8px">`;
    for (const p of players.sort(
      (a, b) => parseInt(a.num || 999) - parseInt(b.num || 999)
    )) {
      const isPitcher = [
        "RHP",
        "LHP",
        "P",
        "UTL/RHP",
        "C/RHP",
        "3B/RHP",
      ].some((x) => p.pos === x);
      const cardBorder = isPitcher
        ? "border-color:rgba(26,90,204,.35);"
        : "";
      const numColor = isPitcher
        ? "color:#1a5acc"
        : "color:var(--accent)";
      const hoverBorder = isPitcher ? "#1a5acc" : "var(--accent)";
      const resetBorder = isPitcher
        ? "rgba(26,90,204,.35)"
        : "var(--border2)";
      html += `<div
        onclick="oppEditPlayer('${opp.id}','${p.id}')"
        onmouseover="this.style.borderColor='${hoverBorder}';this.style.transform='translateY(-1px)'"
        onmouseout="this.style.borderColor='${resetBorder}';this.style.transform=''"
        style="background:var(--surface);border:1.5px solid var(--border2);${cardBorder}border-radius:10px;padding:10px 12px;cursor:pointer;transition:all .14s;min-width:120px;position:relative;user-select:none">
        <div style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:22px;${numColor};line-height:1">#${
        p.num || "—"
      }</div>
        <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:14px;color:var(--text);margin-top:2px;white-space:nowrap">${
          p.name
        }</div>
        <div style="font-family:'Barlow',sans-serif;font-size:10px;color:var(--text3);margin-top:2px">${
          p.pos || "—"
        } · ${p.bat || "R"}/${p.throw || "R"}</div>
        ${
          p.ht || p.wt
            ? `<div style="font-size:9px;color:var(--text3);margin-top:1px">${[
                p.ht,
                p.wt,
              ]
                .filter(Boolean)
                .join(" · ")}</div>`
            : ""
        }
      </div>`;
    }
    html += "</div></div>";
  }
  container.innerHTML = html;
}

// ── Rename ────────────────────────────────────────────────────────────
function oppRenameLive(id, val) {
  const opp = _opponents.find((o) => o.id === id);
  if (opp) opp.name = val.trim() || "New Opponent";
}
function oppRename(id, val) {
  const opp = _opponents.find((o) => o.id === id);
  if (!opp) return;
  opp.name = val.trim() || "New Opponent";
  oppSaveOne(opp);
}

// ── Delete card ───────────────────────────────────────────────────────
function oppConfirmDelete(id) {
  const opp = _opponents.find((o) => o.id === id);
  if (!opp) return;
  const n = opp.roster.length;
  const msg =
    n > 0
      ? `Remove "${opp.name}" and their ${n} player${
          n !== 1 ? "s" : ""
        }?`
      : `Remove "${opp.name}"?`;
  if (!confirm(msg)) return;
  if (_oppOpenId === id) {
    // Close detail first, then delete
    _oppOpenId = null;
    document.getElementById("opp-list-view").style.display = "flex";
    document.getElementById("opp-detail").classList.remove("open");
  }
  oppDeleteOne(id);
}

// ── Add / Edit player modal ───────────────────────────────────────────
function oppAddPlayer(oppId) {
  _oppEditingId = oppId;
  _oppEditingPid = null;
  document.getElementById("opp-player-modal-title").textContent =
    "Add Player";
  document.getElementById("opp-player-modal-delete").style.display =
    "none";
  ["name", "num", "ht", "wt"].forEach(
    (f) => (document.getElementById("opp-mtp-" + f).value = "")
  );
  document.getElementById("opp-mtp-pos").value = "C";
  document.getElementById("opp-mtp-bat").value = "R";
  document.getElementById("opp-mtp-throw").value = "R";
  // Hide pitch section (default pos = C)
  document.getElementById("opp-mtp-pitch-section").style.display =
    "none";
  _editingPitchTypes = [];
  document.getElementById("opp-player-modal").style.display = "flex";
  document.getElementById("opp-mtp-name").focus();
}

function oppEditPlayer(oppId, playerId) {
  const opp = _opponents.find((o) => o.id === oppId);
  if (!opp) return;
  const p = opp.roster.find((x) => x.id === playerId);
  if (!p) return;
  _oppEditingId = oppId;
  _oppEditingPid = playerId;
  document.getElementById("opp-player-modal-title").textContent =
    "Edit Player";
  document.getElementById("opp-player-modal-delete").style.display =
    "inline-flex";
  document.getElementById("opp-mtp-name").value = p.name || "";
  document.getElementById("opp-mtp-num").value = p.num || "";
  document.getElementById("opp-mtp-pos").value = p.pos || "C";
  document.getElementById("opp-mtp-bat").value = p.bat || "R";
  document.getElementById("opp-mtp-throw").value = p.throw || "R";
  document.getElementById("opp-mtp-ht").value = p.ht || "";
  document.getElementById("opp-mtp-wt").value = p.wt || "";
  // Show pitch repertoire editor for pitchers
  const pitchSec = document.getElementById("opp-mtp-pitch-section");
  if (_isPitcherPos(p.pos)) {
    pitchSec.style.display = "";
    _renderPitchTypeEditor("opp-mtp-pitch-section", p.pitchTypes || []);
  } else {
    pitchSec.style.display = "none";
    _editingPitchTypes = [];
  }
  document.getElementById("opp-player-modal").style.display = "flex";
}

function oppSavePlayer() {
  const name = document.getElementById("opp-mtp-name").value.trim();
  if (!name) {
    document.getElementById("opp-mtp-name").focus();
    return;
  }
  const opp = _opponents.find((o) => o.id === _oppEditingId);
  if (!opp) return;
  const pos = document.getElementById("opp-mtp-pos").value;
  const existingPlayer = opp.roster.find(
    (x) => x.id === _oppEditingPid
  );
  const player = {
    id:
      _oppEditingPid ||
      "p_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
    name,
    num: document.getElementById("opp-mtp-num").value.trim(),
    pos,
    bat: document.getElementById("opp-mtp-bat").value,
    throw: document.getElementById("opp-mtp-throw").value,
    ht: document.getElementById("opp-mtp-ht").value.trim(),
    wt: document.getElementById("opp-mtp-wt").value.trim(),
    pitchTypes: _isPitcherPos(pos)
      ? [..._editingPitchTypes]
      : existingPlayer
      ? existingPlayer.pitchTypes || []
      : [],
  };
  if (_oppEditingPid) {
    const idx = opp.roster.findIndex((x) => x.id === _oppEditingPid);
    if (idx >= 0) opp.roster[idx] = player;
  } else {
    opp.roster.push(player);
  }
  document.getElementById("opp-player-modal").style.display = "none";
  oppSaveOne(opp);
  oppRefreshDetail();
  // Sync pitchTypes to the in-game pitcher if this player is currently pitching
  _syncRosterPitchTypesToGame(player);
}

function oppDeletePlayer() {
  if (!_oppEditingId || !_oppEditingPid) return;
  const opp = _opponents.find((o) => o.id === _oppEditingId);
  if (!opp) return;
  opp.roster = opp.roster.filter((p) => p.id !== _oppEditingPid);
  document.getElementById("opp-player-modal").style.display = "none";
  oppSaveOne(opp);
  oppRefreshDetail();
}

// ── Import (reuse myTeam parsers) ─────────────────────────────────────
function oppImport(oppId, input) {
  const file = input.files[0];
  if (!file) return;
  const ext = file.name.split(".").pop().toLowerCase();
  const reader = new FileReader();
  reader.onload = function (e) {
    if (ext === "pdf") {
      myTeamParsePDF(e.target.result).then((players) =>
        _oppFinishImport(oppId, players, input)
      );
      return;
    }
    let players = [];
    try {
      if (ext === "trx") players = myTeamParseTRX(e.target.result);
      else if (ext === "csv") players = myTeamParseCSV(e.target.result);
      else if (ext === "xlsx")
        players = myTeamParseXLSX(e.target.result);
    } catch (err) {
      alert("Import failed: " + err.message);
      return;
    }
    _oppFinishImport(oppId, players, input);
  };
  if (ext === "xlsx" || ext === "pdf") reader.readAsArrayBuffer(file);
  else reader.readAsText(file);
}

function _oppFinishImport(oppId, players, input) {
  if (!players || !players.length) {
    alert("No players found in file.");
    return;
  }
  const opp = _opponents.find((o) => o.id === oppId);
  if (!opp) return;
  let added = 0,
    updated = 0;
  for (const p of players) {
    const existing = opp.roster.find((x) => x.num === p.num && p.num);
    if (existing) {
      Object.assign(existing, p, { id: existing.id });
      updated++;
    } else {
      p.id =
        "p_" +
        Date.now() +
        "_" +
        Math.random().toString(36).slice(2, 6);
      opp.roster.push(p);
      added++;
    }
  }
  oppSaveOne(opp);
  oppRefreshDetail();
  toast("Imported: " + added + " added, " + updated + " updated");
  if (input) input.value = "";
}

