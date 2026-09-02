function myTeamRender() {
  const wrap = document.getElementById("myteam-roster");
  if (!wrap) return;
  if (!myTeamRoster.length) {
    wrap.innerHTML = `<div style="text-align:center;padding:48px 20px;color:var(--text3)">
      <div style="font-size:40px;margin-bottom:12px">⚾</div>
      <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:18px;margin-bottom:6px">No players yet</div>
      <div style="font-size:13px">Add players manually or import a roster file (XLSX, CSV, TRX)</div>
    </div>`;
    return;
  }

  // Group by position
  let html = "";
  let remaining = [...myTeamRoster];
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
      const cardColor = isPitcher
        ? "border-color:rgba(26,90,204,.35);"
        : "";
      const numColor = isPitcher
        ? "color:#1a5acc"
        : "color:var(--accent)";
      const isEligible = p.lineupEligible !== false;
      const eligBadgeBg = isEligible
        ? "rgba(34,197,94,.15)"
        : "rgba(120,120,120,.13)";
      const eligBadgeColor = isEligible
        ? "var(--green,#22c55e)"
        : "var(--text3)";
      const eligLabel = isEligible ? "✓ In Lineup" : "– Out";
      html += `<div class="myteam-card"
draggable="true"
data-player-id="${p.id}"
ondragstart="myTeamDragStart(event, '${p.id}')"
onclick="myTeamOpenPlayerView('${p.id}')"
style="background:var(--surface);border:1.5px solid var(--border2);${cardColor}border-radius:10px;padding:10px 12px;cursor:pointer;transition:all .14s;min-width:120px;position:relative;user-select:none;${
        isEligible ? "" : "opacity:.6"
      }"
onmouseover="this.style.borderColor='var(--accent)';this.style.transform='translateY(-1px)'"
onmouseout="this.style.borderColor='var(--border2)';this.style.transform=''"
      >
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
<div onclick="_mtToggleEligible('${
  p.id
}',event)" title="Toggle lineup eligibility" style="margin-top:6px;display:inline-flex;align-items:center;gap:3px;padding:2px 6px;border-radius:4px;font-size:9px;font-family:'Barlow Condensed',sans-serif;font-weight:700;letter-spacing:.5px;cursor:pointer;background:${eligBadgeBg};color:${eligBadgeColor}">${eligLabel}</div>
<div style="position:absolute;top:6px;right:7px;font-size:9px;color:var(--text3);opacity:.5">⠿</div>
      </div>`;
    }
    html += "</div></div>";
  }

  const total = myTeamRoster.length;
  const teamName = (
    document.getElementById("myteam-name-input")?.value || "My Team"
  ).trim();
  document.getElementById("myteam-subtitle").textContent = total
    ? `${total} player${
        total !== 1 ? "s" : ""
      } · drag cards into the tracker lineup`
    : "No players yet";
  // Show "Use My Team" buttons in the tracker whenever there are players
  ["away", "home"].forEach((side) => {
    [
      "use-myteam-" + side + "-btn",
      "mob-use-myteam-" + side + "-btn",
    ].forEach(function (id) {
      const btn = document.getElementById(id);
      if (btn) btn.style.display = total > 0 ? "block" : "none";
      if (btn && total > 0)
        btn.textContent = "USE " + teamName.toUpperCase() + " ▸";
    });
  });
  wrap.innerHTML = html;
  _renderArchivedSeasons();
}

function myTeamAddPlayer() {
  myTeamEditingId = null;
  document.getElementById("myteam-modal-title").textContent =
    "Add Player";
  document.getElementById("myteam-modal-delete").style.display = "none";
  ["name", "num", "ht", "wt"].forEach(
    (f) => (document.getElementById("mtp-" + f).value = "")
  );
  document.getElementById("mtp-pos").value = "C";
  document.getElementById("mtp-bat").value = "R";
  document.getElementById("mtp-throw").value = "R";
  // Hide pitch section (default pos = C, not a pitcher)
  document.getElementById("mtp-pitch-section").style.display = "none";
  _editingPitchTypes = [];
  document.getElementById("myteam-modal").style.display = "flex";
  document.getElementById("mtp-name").focus();
}

function myTeamEditPlayer(id) {
  const p = myTeamRoster.find((x) => x.id === id);
  if (!p) return;
  myTeamEditingId = id;
  document.getElementById("myteam-modal-title").textContent =
    "Edit Player";
  document.getElementById("myteam-modal-delete").style.display =
    "inline-flex";
  document.getElementById("mtp-name").value = p.name || "";
  document.getElementById("mtp-num").value = p.num || "";
  document.getElementById("mtp-pos").value = p.pos || "C";
  document.getElementById("mtp-bat").value = p.bat || "R";
  document.getElementById("mtp-throw").value = p.throw || "R";
  document.getElementById("mtp-ht").value = p.ht || "";
  document.getElementById("mtp-wt").value = p.wt || "";
  // Show pitch repertoire editor for pitchers
  const pitchSec = document.getElementById("mtp-pitch-section");
  if (_isPitcherPos(p.pos)) {
    pitchSec.style.display = "";
    _renderPitchTypeEditor("mtp-pitch-section", p.pitchTypes || []);
  } else {
    pitchSec.style.display = "none";
    _editingPitchTypes = [];
  }
  document.getElementById("myteam-modal").style.display = "flex";
}

function myTeamSavePlayer() {
  const name = document.getElementById("mtp-name").value.trim();
  if (!name) {
    document.getElementById("mtp-name").focus();
    return;
  }
  const pos = document.getElementById("mtp-pos").value;
  // Preserve existing pitchTypes if not editing a pitcher (editor wasn't shown)
  const existingPlayer = myTeamRoster.find(
    (x) => x.id === myTeamEditingId
  );
  const player = {
    id:
      myTeamEditingId ||
      "p_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
    name,
    num: document.getElementById("mtp-num").value.trim(),
    pos,
    bat: document.getElementById("mtp-bat").value,
    throw: document.getElementById("mtp-throw").value,
    ht: document.getElementById("mtp-ht").value.trim(),
    wt: document.getElementById("mtp-wt").value.trim(),
    pitchTypes: _isPitcherPos(pos)
      ? [..._editingPitchTypes]
      : existingPlayer
      ? existingPlayer.pitchTypes || []
      : [],
  };
  if (myTeamEditingId) {
    const idx = myTeamRoster.findIndex((x) => x.id === myTeamEditingId);
    if (idx >= 0) myTeamRoster[idx] = player;
  } else {
    myTeamRoster.push(player);
  }
  document.getElementById("myteam-modal").style.display = "none";
  myTeamSave();
  myTeamRender();
  // Sync pitchTypes to the in-game pitcher if this player is currently pitching
  _syncRosterPitchTypesToGame(player);
}

function myTeamDeletePlayer() {
  if (!myTeamEditingId) return;
  myTeamRoster = myTeamRoster.filter((p) => p.id !== myTeamEditingId);
  document.getElementById("myteam-modal").style.display = "none";
  myTeamSave();
  myTeamRender();
}

function myTeamClearRoster(silent = false) {
  if (!myTeamRoster.length) return;
  if (!silent && !confirm("Clear all " + myTeamRoster.length + " players from the roster?")) return;
  myTeamRoster = [];
  myTeamSave();
  myTeamRender();
}

// ══════════════════════════════════════════════════════════════════════
//  SEASON ARCHIVE
// ══════════════════════════════════════════════════════════════════════

async function archiveSeason() {
  if (!myTeamRoster.length) {
    toast("No players to archive — add players to your roster first.");
    return;
  }
  const teamName = (
    document.getElementById("myteam-name-input")?.value || "My Team"
  ).trim();
  const year = new Date().getFullYear().toString();

  // Ensure opponents are loaded before snapshotting
  try { await oppLoad(); } catch (e) {}

  // Load existing season archives
  let seasons = [];
  try {
    const raw = await window.storage.get("pitchtrack_seasons", true);
    if (raw?.value) seasons = JSON.parse(raw.value) || [];
  } catch (e) {}

  const oppCount = (_opponents || []).length;

  const now = new Date().toISOString();
  // Save snapshot — includes full opponent data with their rosters
  seasons.push({
    id: "s_" + Date.now(),
    year,
    label: year + " Season",
    teamName,
    archivedAt: now,
    updatedAt: now,
    roster: JSON.parse(JSON.stringify(myTeamRoster)),
    opponents: JSON.parse(JSON.stringify(_opponents || [])),
  });
  await window.storage.set(
    "pitchtrack_seasons",
    JSON.stringify(seasons),
    true
  );

  // Show confirmation inline in the past-seasons container
  const wrap = document.getElementById("myteam-past-seasons");
  if (wrap) {
    wrap.innerHTML = `<div style="padding:14px 0;font-family:'Barlow Condensed',sans-serif">
      <div style="font-weight:700;font-size:15px;color:var(--green,#22c55e);margin-bottom:4px">&#x2713; ${year} season archived — ${myTeamRoster.length} players &amp; ${oppCount} opponents saved</div>
      <div style="font-size:12px;color:var(--text3);margin-bottom:10px">Your game history and opponent scouting cards are preserved. View any past season from the Stats Hub "Seasons" tab.</div>
      <button onclick="myTeamClearRoster()" style="padding:6px 14px;background:var(--surface2);border:1.5px solid var(--accent);border-radius:6px;font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:12px;color:var(--accent);cursor:pointer;margin-right:8px">Clear Roster for New Season</button>
      <button onclick="_renderArchivedSeasons()" style="padding:6px 14px;background:none;border:1px solid var(--border2);border-radius:6px;font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:12px;color:var(--text3);cursor:pointer">Keep Roster &amp; Continue</button>
    </div>`;
  }
}

async function _renderArchivedSeasons() {
  const wrap = document.getElementById("myteam-past-seasons");
  if (!wrap) return;
  let seasons = [];
  try {
    const raw = await window.storage.get("pitchtrack_seasons", true);
    if (raw?.value) seasons = JSON.parse(raw.value) || [];
  } catch (e) {}
  if (!seasons.length) {
    wrap.innerHTML = "";
    return;
  }
  const rows = [...seasons]
    .reverse()
    .map(
      (s) => `<div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--border)">
      <div style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:18px;color:var(--accent);width:44px;flex-shrink:0">${escHtml(s.year)}</div>
      <div style="flex:1;min-width:0">
        <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:13px">${escHtml(s.teamName)}</div>
        <div style="font-size:11px;color:var(--text3)">${s.roster ? s.roster.length : "?"} players · archived ${new Date(s.archivedAt).toLocaleDateString()}</div>
      </div>
    </div>`
    )
    .join("");
  wrap.innerHTML = `<div style="padding:12px 0">
    <div style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:13px;letter-spacing:1.5px;text-transform:uppercase;color:var(--text3);margin-bottom:8px">Past Seasons</div>
    ${rows}
  </div>`;
}

// ══════════════════════════════════════════════════════════════════════
//  MY TEAM — PLAYER VIEW
// ══════════════════════════════════════════════════════════════════════
let _mtViewId = null;

async function myTeamOpenPlayerView(id) {
  _mtViewId = id;
  try {
    document.getElementById("mt-player-view").style.display = "flex";
    // Mirror hubRefreshAll() sequence — myTeamLoad() sets _myTeamNameCache correctly
    try {
      await myTeamLoad();
    } catch (e) {}
    try {
      allGames = await loadAllGames();
    } catch (e) {}
    _mtRenderPlayerView(id);
  } catch (e) {
    console.error("mt player view error", e);
  }
}

function _mtRenderPlayerView(id) {
  _mtViewId = id;
  const p = myTeamRoster.find((x) => x.id === id);
  if (!p) return;
  const isPitcher = _isPitcherPos(p.pos);
  const teamName = _getMyTeamName();
  const games = getTeamGames(teamName);

  // ── Header ────────────────────────────────────────────────────────
  const hdr = document.getElementById("mt-pv-header");
  hdr.style.display = "flex";
  hdr.style.alignItems = "flex-start";
  hdr.style.gap = "14px";
  var metaStr =
    escHtml(p.pos || "—") +
    " · " +
    (p.bat || "R") +
    "HH · Throws " +
    (p.throw || "R") +
    (p.ht ? " · " + p.ht : "") +
    (p.wt ? " · " + p.wt : "");
  hdr.innerHTML =
    '<div style="display:flex;align-items:flex-start;gap:14px;flex:1">' +
    "<div style=\"font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:34px;line-height:1;color:var(--accent)\">#" +
    escHtml(p.num || "—") +
    "</div>" +
    '<div style="flex:1"><div style="font-family:\'Barlow Condensed\',sans-serif;font-weight:900;font-size:22px;color:var(--text);line-height:1.1">' +
    escHtml(p.name) +
    "</div>" +
    '<div style="font-size:11px;color:var(--text3);margin-top:3px">' +
    metaStr +
    "</div></div></div>" +
    '<div style="display:flex;gap:8px;flex-shrink:0;align-items:center">' +
    "<button onclick=\"document.getElementById('mt-player-view').style.display='none';myTeamEditPlayer('" +
    escAttr(p.id) +
    "')\" style=\"padding:6px 14px;background:var(--surface3);border:1px solid var(--border2);border-radius:7px;font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:13px;color:var(--text2);cursor:pointer\">Edit Player</button>" +
    "<button onclick=\"document.getElementById('mt-player-view').style.display='none'\" style=\"background:none;border:none;font-size:22px;color:var(--text3);cursor:pointer;line-height:1;padding:2px 4px\">&times;</button>" +
    "</div>";

  // ── Roster picker ──────────────────────────────────────────────────
  const pickerEl = document.getElementById("mt-pv-picker");
  let pickerHtml = `<div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--text3);padding:8px 12px 4px">Roster</div>`;
  const sorted = [...myTeamRoster].sort((a, b) => {
    const aP = _isPitcherPos(a.pos),
      bP = _isPitcherPos(b.pos);
    if (aP !== bP) return aP ? 1 : -1;
    return (a.name || "").localeCompare(b.name || "");
  });
  pickerHtml += sorted
    .map(function (r) {
      var rIsP = _isPitcherPos(r.pos);
      var active = r.id === id;
      var activeBg = active ? "background:rgba(99,102,241,.12);" : "";
      var numColor = rIsP ? "color:#1a5acc" : "color:var(--accent)";
      return (
        "<div onclick=\"_mtRenderPlayerView('" +
        escAttr(r.id) +
        '\')" style="display:flex;align-items:center;gap:8px;padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--border);' +
        activeBg +
        '">' +
        "<div style=\"font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:13px;" +
        numColor +
        ';min-width:26px;text-align:center">#' +
        escHtml(r.num || "—") +
        "</div>" +
        '<div style="min-width:0"><div style="font-family:\'Barlow Condensed\',sans-serif;font-weight:700;font-size:13px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' +
        escHtml(r.name) +
        "</div>" +
        '<div style="font-size:9px;color:var(--text3)">' +
        escHtml(r.pos || "—") +
        "</div></div></div>"
      );
    })
    .join("");
  pickerEl.innerHTML = pickerHtml;

  // ── Stats panel ────────────────────────────────────────────────────
  const statsEl = document.getElementById("mt-pv-stats");
  const fmt = (n) => _fmtRate(n);

  // Populate _nameAliases — side effect of _mergeStatMapByPlayer inside these calls.
  // Without this, getPlayerCareerStats only matches exact name strings from game records.
  getTeamRoster(teamName, games);
  getTeamPitchers(teamName, games);

  if (isPitcher) {
    const allPitches = getPitcherPitches(teamName, p.name, games);
    let career = {
      games: 0,
      pitches: 0,
      strikes: 0,
      k: 0,
      bb: 0,
      hits: 0,
      swings: 0,
      outs: 0,
      r: 0,
      bf: 0,
    };
    games.forEach((g) => {
      const pitchers =
        g.awayTeam === teamName ? g.awayPitchers : g.homePitchers;
      const _names = _nameAliases[p.name] || new Set([p.name]);
      const gp = (pitchers || []).find((x) => _names.has(x.name));
      if (!gp || !gp.pitches) return;
      career.games++;
      career.pitches += gp.pitches || 0;
      career.strikes += gp.strikes || 0;
      career.k += gp.k || 0;
      career.bb += gp.bb || 0;
      career.hits += gp.hits || 0;
      career.swings += gp.swings || 0;
      career.outs += gp.outs || 0;
      career.r += gp.r || 0;
      career.bf += gp.bf || 0;
    });
    if (career.pitches === 0) {
      statsEl.innerHTML = `<div style="padding:40px 0;text-align:center;color:var(--text3);font-family:'Barlow Condensed',sans-serif;font-size:15px">No pitching data tracked yet for ${escHtml(
        p.name
      )}<br><span style="font-size:11px">Use this player in a tracked game to see stats here.</span></div>`;
    } else {
      const strPct =
        career.pitches > 0
          ? Math.round((career.strikes / career.pitches) * 100)
          : 0;
      const vels = allPitches
        .map((x) => parseFloat(x.velocity))
        .filter((v) => !isNaN(v) && v > 0);
      const avgVel = vels.length
        ? (vels.reduce((a, b) => a + b, 0) / vels.length).toFixed(1)
        : "—";
      var sh = "";
      sh +=
        '<div style="display:flex;gap:20px;margin-bottom:18px;flex-wrap:wrap">';
      sh +=
        '<div style="text-align:center"><div style="font-family:\'Barlow Condensed\',sans-serif;font-weight:900;font-size:30px;color:var(--accent)">' +
        career.k +
        '</div><div style="font-size:9px;color:var(--text3);letter-spacing:2px;text-transform:uppercase">K</div></div>';
      sh +=
        '<div style="text-align:center"><div style="font-family:\'Barlow Condensed\',sans-serif;font-weight:900;font-size:30px">' +
        career.bb +
        '</div><div style="font-size:9px;color:var(--text3);letter-spacing:2px;text-transform:uppercase">BB</div></div>';
      sh +=
        '<div style="text-align:center"><div style="font-family:\'Barlow Condensed\',sans-serif;font-weight:900;font-size:30px">' +
        strPct +
        '%</div><div style="font-size:9px;color:var(--text3);letter-spacing:2px;text-transform:uppercase">Strike%</div></div>';
      sh +=
        '<div style="text-align:center"><div style="font-family:\'Barlow Condensed\',sans-serif;font-weight:900;font-size:30px">' +
        avgVel +
        '</div><div style="font-size:9px;color:var(--text3);letter-spacing:2px;text-transform:uppercase">Avg Velo</div></div>';
      sh += '</div><div class="stat-cards" style="margin-bottom:16px">';
      sh +=
        '<div class="stat-card"><div class="stat-card-val">' +
        career.games +
        '</div><div class="stat-card-lbl">Games</div></div>';
      sh +=
        '<div class="stat-card"><div class="stat-card-val">' +
        career.pitches +
        '</div><div class="stat-card-lbl">Pitches</div></div>';
      sh +=
        '<div class="stat-card"><div class="stat-card-val">' +
        career.bf +
        '</div><div class="stat-card-lbl">BF</div></div>';
      sh +=
        '<div class="stat-card"><div class="stat-card-val">' +
        career.hits +
        '</div><div class="stat-card-lbl">Hits Allowed</div></div>';
      sh +=
        '<div class="stat-card accent"><div class="stat-card-val">' +
        career.r +
        '</div><div class="stat-card-lbl">Runs</div></div>';
      sh +=
        '<div class="stat-card"><div class="stat-card-val">' +
        career.outs +
        '</div><div class="stat-card-lbl">Outs</div></div></div>';
      // Charts
      var sectionTitle =
        "style=\"font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--text3);margin-bottom:6px\"";
      if (allPitches.length > 0) {
        sh +=
          '<div style="margin-top:18px"><div ' +
          sectionTitle +
          ">Pitch Arsenal</div>" +
          buildPitchBreakdown(allPitches) +
          "</div>";
        sh +=
          '<div style="margin-top:14px"><div ' +
          sectionTitle +
          ">Results</div>" +
          buildPitcherResultsBreakdown(allPitches) +
          "</div>";
      }
      sh +=
        "<div style=\"margin-top:14px\"><a onclick=\"document.getElementById('mt-player-view').style.display='none';openPanel('hub');setTimeout(function(){showView('pitcher',{team:" +
        JSON.stringify(teamName) +
        ",name:" +
        JSON.stringify(p.name) +
        '})},120)" style="font-family:\'Barlow Condensed\',sans-serif;font-weight:700;font-size:12px;color:var(--accent);cursor:pointer;letter-spacing:.5px">View full scouting report &#8594;</a></div>';
      statsEl.innerHTML = sh;
    }
  } else {
    const stats = getPlayerCareerStats(teamName, p.name, games);
    const pa =
      stats.pa != null
        ? stats.pa
        : (stats.ab || 0) + (stats.bb || 0) + (stats.hbp || 0);
    if (pa === 0) {
      statsEl.innerHTML =
        "<div style=\"padding:40px 0;text-align:center;color:var(--text3);font-family:'Barlow Condensed',sans-serif;font-size:15px\">No batting data tracked yet for " +
        escHtml(p.name) +
        '<br><span style="font-size:11px">Use this player in a tracked game to see stats here.</span></div>';
    } else {
      const avg = stats.ab > 0 ? stats.hits / stats.ab : 0;
      const obp =
        pa > 0
          ? ((stats.hits || 0) +
              (stats.bb || 0) +
              (stats.hbp || 0) +
              (stats.ci || 0)) /
            pa
          : 0;
      const tb =
        (stats.hits || 0) -
        (stats.doubles || 0) -
        (stats.triples || 0) -
        (stats.hr || 0) +
        (stats.doubles || 0) * 2 +
        (stats.triples || 0) * 3 +
        (stats.hr || 0) * 4;
      const slg = stats.ab > 0 ? tb / stats.ab : 0;
      var bh = "";
      bh +=
        '<div style="display:flex;gap:20px;margin-bottom:18px;flex-wrap:wrap">';
      bh +=
        '<div style="text-align:center"><div style="font-family:\'Barlow Condensed\',sans-serif;font-weight:900;font-size:30px;color:var(--accent)">' +
        fmt(avg) +
        '</div><div style="font-size:9px;color:var(--text3);letter-spacing:2px;text-transform:uppercase">AVG</div></div>';
      bh +=
        '<div style="text-align:center"><div style="font-family:\'Barlow Condensed\',sans-serif;font-weight:900;font-size:30px">' +
        fmt(obp) +
        '</div><div style="font-size:9px;color:var(--text3);letter-spacing:2px;text-transform:uppercase">OBP</div></div>';
      bh +=
        '<div style="text-align:center"><div style="font-family:\'Barlow Condensed\',sans-serif;font-weight:900;font-size:30px">' +
        fmt(slg) +
        '</div><div style="font-size:9px;color:var(--text3);letter-spacing:2px;text-transform:uppercase">SLG</div></div>';
      bh +=
        '<div style="text-align:center"><div style="font-family:\'Barlow Condensed\',sans-serif;font-weight:900;font-size:30px;color:var(--green,#22c55e)">' +
        fmt(obp + slg) +
        '</div><div style="font-size:9px;color:var(--text3);letter-spacing:2px;text-transform:uppercase">OPS</div></div>';
      bh += '</div><div class="stat-cards" style="margin-bottom:16px">';
      bh +=
        '<div class="stat-card"><div class="stat-card-val">' +
        stats.games +
        '</div><div class="stat-card-lbl">Games</div></div>';
      bh +=
        '<div class="stat-card"><div class="stat-card-val">' +
        pa +
        '</div><div class="stat-card-lbl">PA</div></div>';
      bh +=
        '<div class="stat-card"><div class="stat-card-val">' +
        stats.hits +
        '</div><div class="stat-card-lbl">Hits</div></div>';
      bh +=
        '<div class="stat-card"><div class="stat-card-val">' +
        stats.doubles +
        '</div><div class="stat-card-lbl">2B</div></div>';
      bh +=
        '<div class="stat-card"><div class="stat-card-val">' +
        stats.triples +
        '</div><div class="stat-card-lbl">3B</div></div>';
      bh +=
        '<div class="stat-card accent"><div class="stat-card-val">' +
        stats.hr +
        '</div><div class="stat-card-lbl">HR</div></div>';
      bh +=
        '<div class="stat-card"><div class="stat-card-val">' +
        (stats.r || 0) +
        '</div><div class="stat-card-lbl">R</div></div>';
      bh +=
        '<div class="stat-card"><div class="stat-card-val">' +
        (stats.rbi || 0) +
        '</div><div class="stat-card-lbl">RBI</div></div>';
      bh +=
        '<div class="stat-card"><div class="stat-card-val">' +
        stats.bb +
        '</div><div class="stat-card-lbl">BB</div></div>';
      bh +=
        '<div class="stat-card"><div class="stat-card-val">' +
        stats.k +
        '</div><div class="stat-card-lbl">K</div></div></div>';
      // Charts
      var stLbl =
        "style=\"font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--text3);margin-bottom:6px\"";
      var allPitches = getPlayerPitches(teamName, p.name, games);
      var bipPitches = allPitches.filter(function (x) {
        return x.spray && x.spray.x != null;
      });
      if (bipPitches.length > 0) {
        bh +=
          '<div style="margin-top:18px"><div ' +
          stLbl +
          '>Spray Chart</div><div style="max-width:300px">' +
          buildSprayChartSVG(allPitches) +
          "</div></div>";
      }
      if (allPitches.length > 0) {
        bh +=
          '<div style="margin-top:14px"><div ' +
          stLbl +
          ">Pitches Faced</div>" +
          buildPitchBreakdown(allPitches) +
          "</div>";
      }
      bh +=
        "<div style=\"margin-top:14px\"><a onclick=\"document.getElementById('mt-player-view').style.display='none';openPanel('hub');setTimeout(function(){showView('player',{team:" +
        JSON.stringify(teamName) +
        ",name:" +
        JSON.stringify(p.name) +
        '})},120)" style="font-family:\'Barlow Condensed\',sans-serif;font-weight:700;font-size:12px;color:var(--accent);cursor:pointer;letter-spacing:.5px">View full scouting report &#8594;</a></div>';
      statsEl.innerHTML = bh;
    }
  }
}

// ══════════════════════════════════════════════════════════════════════
//  MY TEAM — LINEUP ELIGIBILITY TOGGLE
// ══════════════════════════════════════════════════════════════════════
function _mtToggleEligible(id, e) {
  e.stopPropagation();
  var p = myTeamRoster.find(function (x) {
    return x.id === id;
  });
  if (!p) return;
  p.lineupEligible = p.lineupEligible === false ? true : false;
  myTeamSave();
  myTeamRender();
}

// ══════════════════════════════════════════════════════════════════════
//  MY TEAM — BEST LINEUP GENERATOR
//  Sources: "The Book" (Tango/Lichtman/Dolphin 2007) +
//  sportsbettingdime.com/guides/strategy/batting-order-sabermetrics
// ══════════════════════════════════════════════════════════════════════
var _mtLineupMode = "saber"; // "saber" | "traditional"

async function myTeamGenerateLineup() {
  var modal = document.getElementById("mt-lineup-modal");
  var content = document.getElementById("mt-lineup-content");
  modal.style.display = "flex";
  content.innerHTML =
    "<div style=\"padding:32px;text-align:center;color:var(--text3);font-family:'Barlow Condensed',sans-serif;font-size:14px\">Loading stats...</div>";
  // Mirror hubRefreshAll() sequence — myTeamLoad() sets _myTeamNameCache correctly
  try {
    await myTeamLoad();
  } catch (e) {}
  try {
    allGames = await loadAllGames();
  } catch (e) {}
  try {
    _mtBuildLineupContent();
  } catch (e) {
    content.innerHTML =
      "<div style=\"padding:32px;text-align:center;color:#cc1a1a;font-family:'Barlow Condensed',sans-serif;font-size:14px\">Error: " +
      escHtml(String(e.message || e)) +
      "</div>";
  }
}

function _mtBuildLineupContent() {
  var content = document.getElementById("mt-lineup-content");
  var teamName = _getMyTeamName() || "";
  var games = getTeamGames(teamName);
  var eligible = myTeamRoster.filter(function (p) {
    return !_isPitcherPos(p.pos) && p.lineupEligible !== false;
  });

  if (!eligible.length) {
    content.innerHTML =
      '<div style="padding:40px;text-align:center;color:var(--text3);font-family:\'Barlow Condensed\',sans-serif;font-size:15px">No eligible position players.<br><span style="font-size:12px">Use the In/Out badge on each card to mark who is available.</span></div>';
    return;
  }

  // Populate _nameAliases — side effect of _mergeStatMapByPlayer inside these calls.
  // Without this, getPlayerCareerStats only matches exact name strings from game records.
  getTeamRoster(teamName, games);
  getTeamPitchers(teamName, games);

  // Score every eligible player
  // PA-weighted: need ≥5 PA to count as "has data"; confidence ramps to full at 20 PA
  var MIN_PA = 5;
  var scored = eligible.map(function (p) {
    var stats = getPlayerCareerStats(teamName, p.name, games);
    var pa =
      stats.pa != null
        ? stats.pa
        : (stats.ab || 0) + (stats.bb || 0) + (stats.hbp || 0);
    var obp = 0,
      slg = 0,
      ops = 0,
      hr = stats.hr || 0;
    var hasData = false,
      score = 0,
      obpScore = 0;
    if (pa >= MIN_PA && (stats.ab || 0) > 0) {
      hasData = true;
      obp =
        ((stats.hits || 0) +
          (stats.bb || 0) +
          (stats.hbp || 0) +
          (stats.ci || 0)) /
        pa;
      var tb =
        (stats.hits || 0) -
        (stats.doubles || 0) -
        (stats.triples || 0) -
        (stats.hr || 0) +
        (stats.doubles || 0) * 2 +
        (stats.triples || 0) * 3 +
        (stats.hr || 0) * 4;
      slg = tb / stats.ab;
      ops = obp + slg;
      // Confidence multiplier — prevents tiny-sample players from gaming rankings
      var conf = Math.min(1, pa / 20);
      score = ops * conf;
      obpScore = obp * conf;
    }
    return {
      p: p,
      pa: pa,
      obp: obp,
      slg: slg,
      ops: ops,
      hr: hr,
      hasData: hasData,
      score: score,
      obpScore: obpScore,
    };
  });

  var used = {};
  function pickBy(sortFn) {
    var avail = scored.filter(function (x) {
      return !used[x.p.id];
    });
    if (!avail.length) return null;
    avail.sort(function (a, b) {
      return sortFn(b) - sortFn(a);
    });
    used[avail[0].p.id] = true;
    return avail[0];
  }

  var lineup = [];
  var i;

  if (_mtLineupMode === "saber") {
    // Sabermetric order — sort by PA-weighted score, not raw stats
    lineup[1] = pickBy(function (x) {
      return x.score;
    }); // 2: Best score
    lineup[0] = pickBy(function (x) {
      return x.obpScore;
    }); // 1: Best OBP score
    lineup[3] = pickBy(function (x) {
      return (
        x.score * 0.6 +
        (x.slg + x.hr * 0.04) * Math.min(1, x.pa / 20) * 0.4
      );
    }); // 4: Power
    lineup[2] = pickBy(function (x) {
      return x.score;
    }); // 3: 2nd-best
    lineup[4] = pickBy(function (x) {
      return x.score;
    }); // 5: 3rd-best
    lineup[5] = pickBy(function (x) {
      return x.score;
    }); // 6
    lineup[6] = pickBy(function (x) {
      return x.score;
    }); // 7
    lineup[8] = pickBy(function (x) {
      return x.obpScore;
    }); // 9: OBP rover
    lineup[7] = pickBy(function (x) {
      return x.score;
    }); // 8: weakest
  } else {
    // Traditional order — PA-weighted
    lineup[2] = pickBy(function (x) {
      return x.score;
    }); // 3: Best hitter
    lineup[0] = pickBy(function (x) {
      return x.obpScore;
    }); // 1: Best OBP
    lineup[3] = pickBy(function (x) {
      return (
        x.score * 0.6 +
        (x.slg + x.hr * 0.04) * Math.min(1, x.pa / 20) * 0.4
      );
    }); // 4: Power
    lineup[4] = pickBy(function (x) {
      return x.slg * Math.min(1, x.pa / 20);
    }); // 5: 2nd power
    lineup[1] = pickBy(function (x) {
      return x.obpScore;
    }); // 2: Contact/OBP
    lineup[5] = pickBy(function (x) {
      return x.score;
    }); // 6
    lineup[6] = pickBy(function (x) {
      return x.score;
    }); // 7
    lineup[7] = pickBy(function (x) {
      return x.score;
    }); // 8
    lineup[8] = pickBy(function (x) {
      return x.ops;
    }); // 9: Weakest
  }

  // Fill any empty slots from remaining players
  for (i = 0; i < 9; i++) {
    if (!lineup[i]) {
      lineup[i] = pickBy(function (x) {
        return x.ops;
      });
    }
  }

  var saberReasons = [
    {
      role: "Leadoff",
      why: "Best OBP guy — maximizes scoring chances",
    },
    {
      role: "2nd",
      why: "Best overall hitter — most plate appearances with runners on base",
    },
    {
      role: "3rd",
      why: "Second-best hitter — most PA's w/ RISP available",
    },
    {
      role: "Cleanup",
      why: "Best power (SLG/HR) — bats with 1-2 runners on to clear the bases",
    },
    {
      role: "5th",
      why: "Third-best bat — protects the cleanup hitter and extends big innings",
    },
    {
      role: "6th",
      why: "Solid bat keeps pressure on after the top of the order",
    },
    {
      role: "7th",
      why: "Consistent contact; keeps innings alive for the top of the order",
    },
    {
      role: "8th",
      why: "Weakest bat placed in lowest-leverage spot to minimize damage",
    },
    {
      role: "9-Hole",
      why: "Second-best OBP 'rover' — turns the lineup over so the top of order leads off next inning",
    },
  ];
  var tradReasons = [
    {
      role: "Leadoff",
      why: "Best OBP + baserunning — traditional table-setter who can steal bases and score",
    },
    {
      role: "2nd",
      why: "Best contact/bat control — puts ball in play, moves runners with less power required",
    },
    {
      role: "3rd",
      why: "Best overall hitter — traditional slot for highest batting average",
    },
    {
      role: "Cleanup",
      why: "Most powerful bat — drives in runs with the table set by the top of the order",
    },
    {
      role: "5th",
      why: "Second-best power — protects the cleanup hitter, prevents pitchers walking him",
    },
    {
      role: "6th",
      why: "Solid hitter who keeps pressure on; often best remaining bat",
    },
    {
      role: "7th",
      why: "Above-average bat; contributes in a lower-leverage spot",
    },
    {
      role: "8th",
      why: "Weaker bat; traditionally second-to-last before the pitcher",
    },
    {
      role: "9th",
      why: "Weakest bat / pitcher's spot — minimal plate appearance impact",
    },
  ];
  var reasons = _mtLineupMode === "saber" ? saberReasons : tradReasons;

  // Build HTML using string concatenation to avoid nested template literal issues
  var html = "";

  // Toggle buttons
  html +=
    '<div style="display:flex;gap:6px;margin-bottom:16px;align-items:center">';
  html +=
    "<span style=\"font-size:10px;color:var(--text3);font-family:'Barlow Condensed',sans-serif;letter-spacing:1px;text-transform:uppercase;margin-right:4px\">Method:</span>";
  html +=
    '<button onclick="_mtSetLineupMode(\'saber\')" style="padding:5px 13px;border-radius:20px;border:1.5px solid ' +
    (_mtLineupMode === "saber" ? "var(--accent)" : "var(--border2)") +
    ";background:" +
    (_mtLineupMode === "saber" ? "var(--accent)" : "none") +
    ";color:" +
    (_mtLineupMode === "saber" ? "#fff" : "var(--text2)") +
    ";font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:12px;cursor:pointer\">Sabermetric</button>";
  html +=
    '<button onclick="_mtSetLineupMode(\'traditional\')" style="padding:5px 13px;border-radius:20px;border:1.5px solid ' +
    (_mtLineupMode === "traditional"
      ? "var(--accent)"
      : "var(--border2)") +
    ";background:" +
    (_mtLineupMode === "traditional" ? "var(--accent)" : "none") +
    ";color:" +
    (_mtLineupMode === "traditional" ? "#fff" : "var(--text2)") +
    ";font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:12px;cursor:pointer\">Traditional</button>";
  html += "</div>";

  // Explain the method
  if (_mtLineupMode === "saber") {
    html +=
      '<div style="background:rgba(99,102,241,.08);border:1px solid rgba(99,102,241,.25);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:11px;color:var(--text2);line-height:1.5">';
    html +=
      "<strong style=\"font-family:'Barlow Condensed',sans-serif;font-size:12px\">Sabermetric method</strong> — Based on run-expectancy research (<em>The Book</em>, Tango/Lichtman/Dolphin). " +
      "Best hitter bats 2nd (most PA in run-producing context). OBP trumps speed in the leadoff spot. " +
      'The 9-hole becomes a "rover" (second-best OBP) to turn the lineup over for the top of the order.</div>';
  } else {
    html +=
      '<div style="background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.25);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:11px;color:var(--text2);line-height:1.5">';
    html +=
      "<strong style=\"font-family:'Barlow Condensed',sans-serif;font-size:12px\">Traditional method</strong> — Classic baseball lineup construction. " +
      "Best hitter bats 3rd, fastest/best OBP leads off, second-best contact hitter bats 2nd. " +
      "Power bats at 4 and 5, weakest hitter at 9.</div>";
  }

  if (eligible.length < 9) {
    html +=
      '<div style="background:rgba(251,191,36,.1);border:1px solid rgba(251,191,36,.3);border-radius:8px;padding:8px 14px;margin-bottom:12px;font-size:11px;color:var(--text2)">Only ' +
      eligible.length +
      " eligible player" +
      (eligible.length !== 1 ? "s" : "") +
      " — need 9 for a full lineup.</div>";
  }

  html += '<table style="width:100%;border-collapse:collapse">';
  html += '<thead><tr style="border-bottom:2px solid var(--border)">';
  html +=
    "<th style=\"font-family:'Barlow Condensed',sans-serif;font-size:9px;letter-spacing:2px;color:var(--text3);text-align:left;padding:6px 8px 8px 0;width:36px\">#</th>";
  html +=
    "<th style=\"font-family:'Barlow Condensed',sans-serif;font-size:9px;letter-spacing:2px;color:var(--text3);text-align:left;padding:6px 8px 8px\">PLAYER</th>";
  html +=
    "<th style=\"font-family:'Barlow Condensed',sans-serif;font-size:9px;letter-spacing:2px;color:var(--text3);text-align:center;padding:6px 8px 8px;width:56px\">OPS</th>";
  html +=
    "<th style=\"font-family:'Barlow Condensed',sans-serif;font-size:9px;letter-spacing:2px;color:var(--text3);text-align:left;padding:6px 8px 8px\">REASON</th>";
  html += "</tr></thead><tbody>";

  for (i = 0; i < 9; i++) {
    var entry = lineup[i] || null;
    var sr = reasons[i];
    var playerCell = entry
      ? '<div style="display:flex;align-items:center;gap:8px"><span style="font-family:\'Barlow Condensed\',sans-serif;font-weight:900;font-size:13px;color:var(--accent)">#' +
        escHtml(entry.p.num || "—") +
        "</span><div><div style=\"font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:15px;color:var(--text)\">" +
        escHtml(entry.p.name) +
        '</div><div style="font-size:9px;color:var(--text3)">' +
        escHtml(entry.p.pos || "—") +
        "</div></div></div>"
      : '<span style="color:var(--text3);font-style:italic;font-size:13px">— empty —</span>';
    var opsCell = "";
    if (entry && entry.hasData) {
      var paNote =
        entry.pa < 20
          ? '<div style="font-size:8px;color:var(--text3)">' +
            entry.pa +
            " PA</div>"
          : "";
      opsCell =
        "<div style=\"font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:14px;color:var(--accent)\">" +
        _fmtRate(entry.ops) +
        "</div>" +
        paNote;
    } else if (entry && entry.pa > 0 && entry.pa < MIN_PA) {
      opsCell =
        '<div style="font-size:9px;color:var(--text3)">' +
        entry.pa +
        " PA<br>(low sample)</div>";
    } else if (entry) {
      opsCell =
        '<div style="font-size:10px;color:var(--text3)">No stats</div>';
    }
    html += '<tr style="border-bottom:1px solid var(--border)">';
    html +=
      '<td style="padding:10px 8px 10px 0;vertical-align:middle"><div style="font-family:\'Barlow Condensed\',sans-serif;font-weight:900;font-size:18px;color:var(--text3)">' +
      (i + 1) +
      '</div><div style="font-size:8px;color:var(--text3);letter-spacing:.5px">' +
      sr.role +
      "</div></td>";
    html +=
      '<td style="padding:10px 8px;vertical-align:middle">' +
      playerCell +
      "</td>";
    html +=
      '<td style="padding:10px 8px;vertical-align:middle;text-align:center">' +
      opsCell +
      "</td>";
    html +=
      '<td style="padding:10px 8px;vertical-align:middle;font-size:11px;color:var(--text3);line-height:1.4">' +
      escHtml(sr.why) +
      "</td>";
    html += "</tr>";
  }
  html += "</tbody></table>";
  html +=
    '<div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border);font-size:10px;color:var(--text3)">Ranking uses PA-weighted OPS (min 5 PA; full confidence at 20+ PA). Players with fewer than 5 tracked PA are placed by positional profile. Toggle "In Lineup / Out" on each card to control eligibility.</div>';

  document.getElementById("mt-lineup-content").innerHTML = html;
}

function _mtSetLineupMode(mode) {
  _mtLineupMode = mode;
  _mtBuildLineupContent();
}

function myTeamUseAsAway() {
  const name = (
    document.getElementById("myteam-name-input")?.value || "My Team"
  ).trim();
  const inp = document.getElementById("away-name-input");
  if (inp) {
    inp.value = name;
    updateTeamNames();
  }
  _rosterSrcAway = "myteam";
  if (currentPanel === "myteam") openPanel("tracker");
  setTimeout(
    function () {
      lineupModalSide = "away";
      qs("lineup-modal").style.display = "flex";
      renderLineupModal();
      lmShowRosterPanel(true);
    },
    currentPanel === "myteam" ? 250 : 0
  );
}

function myTeamUseAsHome() {
  const name = (
    document.getElementById("myteam-name-input")?.value || "My Team"
  ).trim();
  const inp = document.getElementById("home-name-input");
  if (inp) {
    inp.value = name;
    updateTeamNames();
  }
  _rosterSrcHome = "myteam";
  if (currentPanel === "myteam") openPanel("tracker");
  setTimeout(
    function () {
      lineupModalSide = "home";
      qs("lineup-modal").style.display = "flex";
      renderLineupModal();
      lmShowRosterPanel(false);
    },
    currentPanel === "myteam" ? 250 : 0
  );
}

// In-game sub menu — shown when clicking a roster card during a live game
var _lmSubPlayer = null;
var _lmSubMenu = null;

function lmShowSubMenu(p, anchorEl) {
  _lmSubPlayer = p;
  // Remove any existing menu
  if (_lmSubMenu) {
    _lmSubMenu.remove();
    _lmSubMenu = null;
  }

  var menu = document.createElement("div");
  _lmSubMenu = menu;
  menu.style.cssText =
    "position:absolute;right:0;top:100%;z-index:9999;background:var(--surface2);border:1.5px solid var(--border2);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.25);padding:8px;min-width:200px;animation:fadeIn .15s";
  menu.innerHTML =
    '<div style="font-family:Barlow Condensed,sans-serif;font-weight:800;font-size:13px;color:var(--text);padding:4px 6px 8px;border-bottom:1px solid var(--border);margin-bottom:6px">' +
    "#" +
    (p.num || "—") +
    " " +
    p.name +
    '<div style="font-size:10px;color:var(--text3);font-weight:500">' +
    (p.pos || "—") +
    " · " +
    (p.bat || "R") +
    "/" +
    (p.throw || "R") +
    "</div></div>" +
    '<div style="font-size:9px;color:var(--text3);font-family:Barlow,sans-serif;font-weight:600;letter-spacing:1px;text-transform:uppercase;padding:2px 6px 4px">Substitute as:</div>';

  var opts = [
    {
      label: "🔄 Pinch Hitter",
      sub: "PH",
      desc: "Replace current batter",
    },
    {
      label: "🏃 Pinch Runner",
      sub: "PR",
      desc: "Replace a baserunner",
    },
    {
      label: "🛡 Defensive Sub",
      sub: "DEF",
      desc: "Replace a fielder",
    },
  ];
  opts.forEach(function (opt) {
    var btn = document.createElement("button");
    btn.style.cssText =
      "display:flex;flex-direction:column;width:100%;text-align:left;background:none;border:none;padding:7px 8px;border-radius:7px;cursor:pointer;transition:background .12s;font-family:Barlow Condensed,sans-serif";
    btn.innerHTML =
      '<span style="font-weight:700;font-size:13px;color:var(--text)">' +
      opt.label +
      "</span>" +
      '<span style="font-size:10px;color:var(--text3)">' +
      opt.desc +
      "</span>";
    btn.addEventListener("mouseover", function () {
      this.style.background = "var(--surface3)";
    });
    btn.addEventListener("mouseout", function () {
      this.style.background = "none";
    });
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      lmApplySub(_lmSubPlayer, opt.sub);
      menu.remove();
      _lmSubMenu = null;
    });
    menu.appendChild(btn);
  });

  // Also offer "Set in lineup slot" for pre-game edits fallback
  var slotBtn = document.createElement("button");
  slotBtn.style.cssText =
    "display:flex;flex-direction:column;width:100%;text-align:left;background:none;border:none;padding:7px 8px;border-radius:7px;cursor:pointer;transition:background .12s;font-family:Barlow Condensed,sans-serif;border-top:1px solid var(--border);margin-top:4px";
  slotBtn.innerHTML =
    '<span style="font-weight:700;font-size:13px;color:var(--text2)">📋 Set in lineup</span><span style="font-size:10px;color:var(--text3)">Fill next empty slot</span>';
  slotBtn.addEventListener("mouseover", function () {
    this.style.background = "var(--surface3)";
  });
  slotBtn.addEventListener("mouseout", function () {
    this.style.background = "none";
  });
  slotBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    var lineup =
      lineupModalSide === "away" ? S.lineupAway : S.lineupHome;
    var emptyIdx = lineup.findIndex(function (b) {
      return !b.name || /^Player \d/.test(b.name);
    });
    if (emptyIdx < 0) emptyIdx = 0;
    lmDropPlayerIntoSlot(_lmSubPlayer.id, emptyIdx);
    menu.remove();
    _lmSubMenu = null;
  });
  menu.appendChild(slotBtn);

  // Position menu relative to card
  anchorEl.style.position = "relative";
  anchorEl.appendChild(menu);

  // Close on outside click
  setTimeout(function () {
    document.addEventListener("click", function closer(e) {
      if (!menu.contains(e.target)) {
        menu.remove();
        _lmSubMenu = null;
        document.removeEventListener("click", closer);
      }
    });
  }, 10);
}

function lmApplySub(p, subType) {
  saveLineupModalInputs();
  const side = lineupModalSide;
  const lineup = side === "away" ? S.lineupAway : S.lineupHome;
  const player = {
    name: p.name,
    num: p.num || "0",
    pos: p.pos || "OF",
    hand: p.bat || "R",
    isPH: false,
    isPR: false,
    isDEF: false,
  };

  if (subType === "PH") {
    // Replace the currently active batter
    const batIdx = side === "away" ? S.awayBatterIdx : S.homeBatterIdx;
    const activeIdx = batIdx % lineup.length;
    player.isPH = true;
    lineup[activeIdx] = player;
    clearAtBat();
    renderLineup();
    updateScoreBug();
    toast(p.name + " in as Pinch Hitter");
    closeLineupModal();
  } else if (subType === "PR") {
    // Replace a baserunner — show which base
    lmShowBaseSelector(p);
  } else if (subType === "DEF") {
    // Replace fielder — find by slot selection
    player.isDEF = true;
    var emptyIdx = lineup.findIndex(function (b) {
      return !b.name || /^Player \d/.test(b.name);
    });
    if (emptyIdx < 0) emptyIdx = 0;
    lineup[emptyIdx] = player;
    renderLineup();
    renderLineupModal();
    toast(p.name + " in as Defensive Sub");
  }
}

function lmShowBaseSelector(p) {
  var existing = document.getElementById("lm-base-selector");
  if (existing) existing.remove();
  var sel = document.createElement("div");
  sel.id = "lm-base-selector";
  sel.style.cssText =
    "position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center";
  var inner = document.createElement("div");
  inner.style.cssText =
    "background:var(--surface2);border:1.5px solid var(--border2);border-radius:12px;padding:20px;text-align:center;min-width:240px";
  inner.innerHTML =
    '<div style="font-family:Barlow Condensed,sans-serif;font-weight:800;font-size:16px;color:var(--text);margin-bottom:4px">' +
    p.name +
    "</div>" +
    '<div style="font-size:11px;color:var(--text3);margin-bottom:14px">Which base runner to replace?</div>';
  var btnRow = document.createElement("div");
  btnRow.style.cssText =
    "display:flex;gap:8px;justify-content:center;margin-bottom:12px";
  ["1st", "2nd", "3rd"].forEach(function (base) {
    var b = document.createElement("button");
    b.textContent = base;
    b.style.cssText =
      "padding:10px 16px;background:var(--surface3);border:1px solid var(--border2);border-radius:8px;font-family:Barlow Condensed,sans-serif;font-weight:700;font-size:14px;color:var(--text);cursor:pointer";
    b.addEventListener("click", function () {
      lmApplyPR(p.id, base);
      sel.remove();
    });
    btnRow.appendChild(b);
  });
  inner.appendChild(btnRow);
  var cancel = document.createElement("button");
  cancel.textContent = "Cancel";
  cancel.style.cssText =
    "padding:6px 16px;background:none;border:1px solid var(--border);border-radius:6px;font-size:12px;color:var(--text3);cursor:pointer";
  cancel.addEventListener("click", function () {
    sel.remove();
  });
  inner.appendChild(cancel);
  sel.appendChild(inner);
  document.body.appendChild(sel);
}
function lmApplyPR(playerId, base) {
  const p = myTeamRoster.find(function (x) {
    return x.id === playerId;
  });
  if (!p || !S.bases[base]) {
    toast("No runner on " + base);
    return;
  }
  S.runnerNames[base] = p.name;
  const side = lineupModalSide;
  const lineup = side === "away" ? S.lineupAway : S.lineupHome;
  // Find the outgoing runner in lineup and replace with PR
  const outgoing = S.runnerNames[base];
  const idx = lineup.findIndex(function (b) {
    return b.name === outgoing;
  });
  const player = {
    name: p.name,
    num: p.num || "0",
    pos: p.pos || "OF",
    hand: p.bat || "R",
    isPR: true,
    isPH: false,
    isDEF: false,
  };
  if (idx >= 0) lineup[idx] = player;
  updateScoreBug();
  renderLineup();
  toast(p.name + " in as Pinch Runner on " + base);
  closeLineupModal();
}

function lmShowRosterPanel(isAway) {
  const panel = document.getElementById("lm-roster-panel");
  const cards = document.getElementById("lm-roster-cards");
  const title = document.getElementById("lm-roster-title");
  if (!panel || !cards) return;
  if (!myTeamRoster.length) {
    panel.style.display = "none";
    return;
  }

  const teamName = (
    document.getElementById("myteam-name-input")?.value || "My Team"
  ).trim();
  if (title) title.textContent = teamName;

  const POS_ORDER = [
    "C",
    "C/RHP",
    "C/2B",
    "1B",
    "2B",
    "3B",
    "SS",
    "INF",
    "INF/OF",
    "1B/OF",
    "SS/2B",
    "3B/RHP",
    "OF",
    "LF",
    "CF",
    "RF",
    "DH",
    "UTL",
    "RHP",
    "LHP",
    "P",
    "UTL/RHP",
  ];
  const isPitch = function (p) {
    return ["RHP", "LHP", "P", "UTL/RHP", "C/RHP", "3B/RHP"].includes(
      p.pos
    );
  };
  const sorted = myTeamRoster.slice().sort(function (a, b) {
    var ai = POS_ORDER.indexOf(a.pos),
      bi = POS_ORDER.indexOf(b.pos);
    if (ai < 0) ai = 50;
    if (bi < 0) bi = 50;
    if (ai !== bi) return ai - bi;
    return parseInt(a.num || 99) - parseInt(b.num || 99);
  });

  // Group by section
  const catchers = sorted.filter(function (p) {
    return ["C", "C/RHP", "C/2B"].includes(p.pos);
  });
  const infielders = sorted.filter(function (p) {
    return [
      "1B",
      "2B",
      "3B",
      "SS",
      "INF",
      "INF/OF",
      "1B/OF",
      "SS/2B",
      "3B/RHP",
    ].includes(p.pos);
  });
  const outfielders = sorted.filter(function (p) {
    return ["OF", "LF", "CF", "RF"].includes(p.pos);
  });
  const dh = sorted.filter(function (p) {
    return p.pos === "DH";
  });
  const pitchers = sorted.filter(function (p) {
    return ["RHP", "LHP", "P", "UTL/RHP"].includes(p.pos);
  });
  const utility = sorted.filter(function (p) {
    return p.pos === "UTL";
  });

  cards.innerHTML = "";
  var groups = [
    ["Catchers", catchers],
    ["Infielders", infielders],
    ["Outfielders", outfielders],
    ["DH", dh],
    ["Pitchers", pitchers],
    ["Utility", utility],
  ];
  groups.forEach(function (g) {
    var label = g[0],
      players = g[1];
    if (!players.length) return;
    var sec = document.createElement("div");
    sec.style.cssText = "margin-bottom:10px";
    var lbl = document.createElement("div");
    lbl.style.cssText =
      "font-family:Barlow,sans-serif;font-weight:700;font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:var(--text3);padding:4px 0;margin-bottom:4px;border-bottom:1px solid var(--border)";
    lbl.textContent = label + " (" + players.length + ")";
    sec.appendChild(lbl);
    players.forEach(function (p) {
      var pitch = isPitch(p);
      var col = pitch ? "var(--blue)" : "var(--accent)";
      var card = document.createElement("div");
      card.draggable = true;
      card.style.cssText =
        "display:flex;align-items:center;gap:8px;padding:6px 8px;background:var(--surface);border:1px solid var(--border);border-radius:7px;cursor:grab;user-select:none;transition:all .12s;margin-bottom:4px";
      card.innerHTML =
        '<div style="font-family:Barlow Condensed,sans-serif;font-weight:900;font-size:15px;color:' +
        col +
        ';width:30px;text-align:right;flex-shrink:0">#' +
        (p.num || "—") +
        "</div>" +
        '<div style="flex:1;min-width:0">' +
        '<div style="font-family:Barlow Condensed,sans-serif;font-weight:700;font-size:13px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' +
        p.name +
        "</div>" +
        '<div style="font-size:9px;color:var(--text3)">' +
        (p.pos || "—") +
        " · " +
        (p.bat || "R") +
        "/" +
        (p.throw || "R") +
        (p.ht ? " · " + p.ht : "") +
        "</div>" +
        "</div>" +
        '<div style="font-size:10px;color:var(--text3);opacity:.4">⠿</div>';
      card.addEventListener("dragstart", function (e) {
        _dragPlayerId = p.id;
        e.dataTransfer.setData("text/plain", p.id);
        e.dataTransfer.effectAllowed = "copy";
      });
      card.addEventListener("click", function () {
        var isPitcherPos = ["RHP", "LHP", "P", "UTL/RHP"].includes(
          p.pos
        );
        if (isPitcherPos) {
          lmDropPitcherFromRoster(p.id);
        } else {
          var gameActive = S.pitchLog && S.pitchLog.length > 0;
          if (gameActive) {
            // In-game: show sub options
            lmShowSubMenu(p, card);
          } else {
            var lineup =
              lineupModalSide === "away" ? S.lineupAway : S.lineupHome;
            var emptyIdx = lineup.findIndex(function (b) {
              return !b.name || /^Player \d/.test(b.name);
            });
            if (emptyIdx < 0) emptyIdx = 0;
            lmDropPlayerIntoSlot(p.id, emptyIdx);
          }
        }
      });
      card.addEventListener("mouseover", function () {
        this.style.borderColor = col;
        this.style.background = "var(--surface3)";
        this.style.transform = "translateX(2px)";
      });
      card.addEventListener("mouseout", function () {
        this.style.borderColor = "var(--border)";
        this.style.background = "var(--surface)";
        this.style.transform = "";
      });
      sec.appendChild(card);
    });
    cards.appendChild(sec);
  });

  panel.style.display = "block";
  // Show pitcher drop hint
  var pdh = document.getElementById("lm-pitcher-drop-hint");
  if (pdh) pdh.style.display = "block";
  // Switch the lineup modal tab to the correct side
  switchLineupModalTab(isAway ? "away" : "home");
}

function openMyTeamDrawer(isAway) {
  if (!myTeamRoster.length) {
    toast("No players in My Team roster");
    return;
  }
  const drawer = document.getElementById("myteam-drawer");
  const cards = document.getElementById("myteam-drawer-cards");
  const label = document.getElementById("myteam-drawer-label");
  if (!drawer || !cards) return;
  const teamName = (
    document.getElementById("myteam-name-input")?.value || "My Team"
  ).trim();
  if (label) label.textContent = teamName + " · drag or click to add";
  const sideKey = isAway ? "away" : "home";
  const isPitch = function (p) {
    return ["RHP", "LHP", "P", "UTL/RHP", "C/RHP", "3B/RHP"].includes(
      p.pos
    );
  };
  const sorted = myTeamRoster.slice().sort(function (a, b) {
    if (isPitch(a) !== isPitch(b)) return isPitch(a) ? 1 : -1;
    return parseInt(a.num || 99) - parseInt(b.num || 99);
  });
  cards.innerHTML = "";
  sorted.forEach(function (p) {
    const pitch = isPitch(p);
    const col = pitch ? "var(--blue)" : "var(--accent)";
    const el = document.createElement("div");
    el.draggable = true;
    el.style.cssText =
      "display:flex;align-items:center;gap:8px;padding:5px 8px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;cursor:grab;user-select:none;transition:all .12s";
    el.innerHTML =
      '<div style="font-family:Barlow Condensed,sans-serif;font-weight:900;font-size:14px;color:' +
      col +
      ';width:26px;text-align:right;flex-shrink:0">#' +
      (p.num || "—") +
      "</div>" +
      '<div style="flex:1;min-width:0"><div style="font-family:Barlow Condensed,sans-serif;font-weight:700;font-size:13px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' +
      p.name +
      "</div>" +
      '<div style="font-size:9px;color:var(--text3)">' +
      (p.pos || "—") +
      " · " +
      (p.bat || "R") +
      "/" +
      (p.throw || "R") +
      "</div></div>" +
      '<div style="font-size:9px;color:var(--text3);opacity:.4">⠿</div>';
    el.addEventListener("dragstart", function (e) {
      myTeamDragStart(e, p.id);
    });
    el.addEventListener("click", function () {
      myTeamDrawerClick(p.id, sideKey);
    });
    el.addEventListener("mouseover", function () {
      this.style.borderColor = col;
      this.style.background = "var(--surface3)";
    });
    el.addEventListener("mouseout", function () {
      this.style.borderColor = "var(--border)";
      this.style.background = "var(--surface2)";
    });
    cards.appendChild(el);
  });
  drawer.style.display = "block";
}

function closeMyTeamDrawer() {
  const d = document.getElementById("myteam-drawer");
  if (d) d.style.display = "none";
}

// ── Show/hide "Use Opponent" buttons based on whether opponents exist ─
function oppRefreshUseButtons() {
  const hasOpps = _opponents && _opponents.length > 0;
  const disp = hasOpps ? "block" : "none";
  [
    "use-opp-away-btn",
    "use-opp-home-btn",
    "mob-use-opp-away-btn",
    "mob-use-opp-home-btn",
  ].forEach(function (id) {
    const btn = document.getElementById(id);
    if (btn) btn.style.display = disp;
  });
}

// ══════════════════════════════════════════════════════════════════════
//  USE OPPONENT — Picker + Roster Panel
// ══════════════════════════════════════════════════════════════════════

var _oppPickerSide = null; // 'away' | 'home'
// Tracks which roster source is loaded per side: null | 'myteam' | opp-object
var _rosterSrcAway = null;
var _rosterSrcHome = null;

function oppPickerOpen(side) {
  if (!_opponents || !_opponents.length) {
    toast(
      "No opponents loaded — add teams in the Opponents panel first"
    );
    return;
  }
  _oppPickerSide = side;
  const list = document.getElementById("opp-picker-list");
  const title = document.getElementById("opp-picker-title");
  title.textContent =
    "Select Opponent (" + (side === "away" ? "Away" : "Home") + ")";
  list.innerHTML = "";
  _opponents.forEach(function (opp) {
    const btn = document.createElement("div");
    btn.style.cssText =
      "display:flex;align-items:center;gap:12px;padding:11px 14px;background:var(--surface);border:1.5px solid var(--border2);border-radius:10px;cursor:pointer;transition:all .14s;user-select:none";
    btn.innerHTML =
      '<div style="flex:1;min-width:0">' +
      "<div style=\"font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:17px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis\">" +
      escHtml(opp.name) +
      "</div>" +
      '<div style="font-size:10px;color:var(--text3);margin-top:1px">' +
      opp.roster.length +
      " player" +
      (opp.roster.length !== 1 ? "s" : "") +
      "</div>" +
      "</div>" +
      '<div style="font-size:18px;color:var(--text3)">›</div>';
    btn.addEventListener("mouseover", function () {
      this.style.borderColor = "#1a5acc";
      this.style.transform = "translateX(2px)";
    });
    btn.addEventListener("mouseout", function () {
      this.style.borderColor = "var(--border2)";
      this.style.transform = "";
    });
    btn.addEventListener("click", function () {
      oppPickerClose();
      oppUseAsLineup(opp, _oppPickerSide);
    });
    list.appendChild(btn);
  });
  document.getElementById("opp-picker-modal").style.display = "flex";
}

function oppPickerClose() {
  document.getElementById("opp-picker-modal").style.display = "none";
}

function oppUseAsLineup(opp, side) {
  // Track roster source per side for mobile lineup picker
  if (side === "away") _rosterSrcAway = opp;
  else _rosterSrcHome = opp;
  // Set the team name input
  const inp = document.getElementById(side + "-name-input");
  if (inp) {
    inp.value = opp.name;
    updateTeamNames();
  }
  // Open lineup modal on the right side with opponent roster panel
  if (currentPanel !== "tracker") openPanel("tracker");
  setTimeout(
    function () {
      lineupModalSide = side;
      document.getElementById("lineup-modal").style.display = "flex";
      renderLineupModal();
      lmShowOpponentRosterPanel(opp, side === "away");
    },
    currentPanel !== "tracker" ? 250 : 0
  );
}

function lmShowOpponentRosterPanel(opp, isAway) {
  const panel = document.getElementById("lm-roster-panel");
  const cards = document.getElementById("lm-roster-cards");
  const title = document.getElementById("lm-roster-title");
  if (!panel || !cards) return;
  if (!opp.roster.length) {
    toast(
      opp.name + " has no players — add some in the Opponents panel"
    );
    panel.style.display = "none";
    return;
  }

  if (title) {
    title.textContent = opp.name;
    title.style.color = "#1a5acc";
  }

  const POS_ORDER = [
    "C",
    "C/RHP",
    "C/2B",
    "1B",
    "2B",
    "3B",
    "SS",
    "INF",
    "INF/OF",
    "1B/OF",
    "SS/2B",
    "3B/RHP",
    "OF",
    "LF",
    "CF",
    "RF",
    "DH",
    "UTL",
    "RHP",
    "LHP",
    "P",
    "UTL/RHP",
  ];
  const isPitch = function (p) {
    return ["RHP", "LHP", "P", "UTL/RHP", "C/RHP", "3B/RHP"].includes(
      p.pos
    );
  };
  const sorted = opp.roster.slice().sort(function (a, b) {
    var ai = POS_ORDER.indexOf(a.pos),
      bi = POS_ORDER.indexOf(b.pos);
    if (ai < 0) ai = 50;
    if (bi < 0) bi = 50;
    if (ai !== bi) return ai - bi;
    return parseInt(a.num || 99) - parseInt(b.num || 99);
  });

  const groups = [
    [
      "Catchers",
      sorted.filter(function (p) {
        return ["C", "C/RHP", "C/2B"].includes(p.pos);
      }),
    ],
    [
      "Infielders",
      sorted.filter(function (p) {
        return [
          "1B",
          "2B",
          "3B",
          "SS",
          "INF",
          "INF/OF",
          "1B/OF",
          "SS/2B",
          "3B/RHP",
        ].includes(p.pos);
      }),
    ],
    [
      "Outfielders",
      sorted.filter(function (p) {
        return ["OF", "LF", "CF", "RF"].includes(p.pos);
      }),
    ],
    [
      "DH",
      sorted.filter(function (p) {
        return p.pos === "DH";
      }),
    ],
    [
      "Pitchers",
      sorted.filter(function (p) {
        return ["RHP", "LHP", "P", "UTL/RHP"].includes(p.pos);
      }),
    ],
    [
      "Utility",
      sorted.filter(function (p) {
        return p.pos === "UTL";
      }),
    ],
  ];

  cards.innerHTML = "";
  groups.forEach(function (g) {
    var label = g[0],
      players = g[1];
    if (!players.length) return;
    var sec = document.createElement("div");
    sec.style.cssText = "margin-bottom:10px";
    var lbl = document.createElement("div");
    lbl.style.cssText =
      "font-family:Barlow,sans-serif;font-weight:700;font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:var(--text3);padding:4px 0;margin-bottom:4px;border-bottom:1px solid var(--border)";
    lbl.textContent = label + " (" + players.length + ")";
    sec.appendChild(lbl);
    players.forEach(function (p) {
      var pitch = isPitch(p);
      var col = pitch ? "#1a5acc" : "var(--accent)";
      var card = document.createElement("div");
      card.draggable = true;
      card.style.cssText =
        "display:flex;align-items:center;gap:8px;padding:6px 8px;background:var(--surface);border:1px solid var(--border);border-radius:7px;cursor:grab;user-select:none;transition:all .12s;margin-bottom:4px";
      card.innerHTML =
        "<div style=\"font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:15px;color:" +
        col +
        ';width:30px;text-align:right;flex-shrink:0">#' +
        (p.num || "—") +
        "</div>" +
        '<div style="flex:1;min-width:0">' +
        "<div style=\"font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:13px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis\">" +
        p.name +
        "</div>" +
        '<div style="font-size:9px;color:var(--text3)">' +
        (p.pos || "—") +
        " · " +
        (p.bat || "R") +
        "/" +
        (p.throw || "R") +
        (p.ht ? " · " + p.ht : "") +
        "</div>" +
        "</div>" +
        '<div style="font-size:10px;color:var(--text3);opacity:.4">⠿</div>';

      card.addEventListener("dragstart", function (e) {
        // Store player data on a temp global so drop handlers can find it
        window._oppDragPlayer = p;
        _dragPlayerId = p.id;
        e.dataTransfer.setData("text/plain", "opp::" + p.id);
        e.dataTransfer.effectAllowed = "copy";
      });
      card.addEventListener("click", function () {
        if (pitch) {
          lmDropOppPitcherFromRoster(p, opp);
        } else {
          var lineup =
            lineupModalSide === "away" ? S.lineupAway : S.lineupHome;
          var emptyIdx = lineup.findIndex(function (b) {
            return !b.name || /^Player \d/.test(b.name);
          });
          if (emptyIdx < 0) emptyIdx = 0;
          lmDropOppPlayerIntoSlot(p, emptyIdx);
        }
      });
      card.addEventListener("mouseover", function () {
        this.style.borderColor = col;
        this.style.background = "var(--surface3)";
        this.style.transform = "translateX(2px)";
      });
      card.addEventListener("mouseout", function () {
        this.style.borderColor = "var(--border)";
        this.style.background = "var(--surface)";
        this.style.transform = "";
      });
      sec.appendChild(card);
    });
    cards.appendChild(sec);
  });

  panel.style.display = "block";
  var pdh = document.getElementById("lm-pitcher-drop-hint");
  if (pdh) pdh.style.display = "block";
  switchLineupModalTab(isAway ? "away" : "home");
}

function lmDropOppPlayerIntoSlot(p, slotIdx) {
  const lineup =
    lineupModalSide === "away" ? S.lineupAway : S.lineupHome;
  lineup[slotIdx] = {
    name: p.name,
    num: p.num || String(slotIdx + 1),
    pos: p.pos || "OF",
    hand: p.bat || "R",
    isPH: false,
    isPR: false,
    isDEF: false,
  };
  renderLineupModal();
  setTimeout(function () {
    var posEl = document.getElementById("lm-pos-" + slotIdx);
    if (posEl) {
      posEl.style.borderColor = "#1a5acc";
      posEl.style.background = "rgba(26,90,204,.08)";
      posEl.focus();
      setTimeout(function () {
        posEl.style.borderColor = "";
        posEl.style.background = "";
      }, 1200);
    }
  }, 40);
}

function lmDropOppPitcherFromRoster(p, opp) {
  const side =
    typeof lineupModalSide !== "undefined" ? lineupModalSide : "away";
  const list = side === "away" ? S.pitchersAway : S.pitchersHome;
  if (
    list.find(function (x) {
      return x.name === p.name;
    })
  ) {
    toast(p.name + " already in pitcher list");
    return;
  }
  const isDefault =
    list.length === 1 &&
    (!list[0].name || /^Pitcher/.test(list[0].name)) &&
    list[0].pitches === 0;
  const entry = {
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
    er: 0,
  };
  if (isDefault) {
    list[0] = entry;
  } else {
    list.push(entry);
  }
  renderLineupModal();
  toast(p.name + " added to pitchers");
}

// ── Wire drop target for opp players in lineup-modal drop zones ──────
// Patch lmDropPlayerIntoSlot to also handle opp:: prefixed drag IDs
var _origLmDrop = null;
(function patchLmDrop() {
  // We rely on the drag handler setting window._oppDragPlayer
  // and the drop handler calling lmDropPlayerIntoSlot with "opp::id"
  // Override: if playerId starts with "opp::", use opponent player
  var _orig = lmDropPlayerIntoSlot;
  lmDropPlayerIntoSlot = function (playerId, slotIdx) {
    if (typeof playerId === "string" && playerId.startsWith("opp::")) {
      if (window._oppDragPlayer) {
        lmDropOppPlayerIntoSlot(window._oppDragPlayer, slotIdx);
        window._oppDragPlayer = null;
      }
      return;
    }
    _orig(playerId, slotIdx);
  };
  var _origPitch = lmDropPitcherFromRoster;
  lmDropPitcherFromRoster = function (playerId) {
    if (typeof playerId === "string" && playerId.startsWith("opp::")) {
      if (window._oppDragPlayer) {
        lmDropOppPitcherFromRoster(window._oppDragPlayer, null);
        window._oppDragPlayer = null;
      }
      return;
    }
    _origPitch(playerId);
  };
})();

function myTeamDrawerClick(playerId, side) {
  const p = myTeamRoster.find(function (x) {
    return x.id === playerId;
  });
  if (!p) return;
  const isAway = side === "away";
  const lineup = isAway ? S.lineupAway : S.lineupHome;
  const emptyIdx = lineup.findIndex(function (b) {
    return !b.name || /^Player \d/.test(b.name);
  });
  const idx =
    emptyIdx >= 0
      ? emptyIdx
      : (isAway ? S.awayBatterIdx : S.homeBatterIdx) % lineup.length;
  lineup[idx] = {
    name: p.name,
    num: p.num || String(idx + 1),
    pos: p.pos || "OF",
    hand: p.bat || "R",
    isPH: false,
    isPR: false,
    isDEF: false,
  };
  const isPitch = ["RHP", "LHP", "P", "UTL/RHP"].includes(p.pos);
  if (isPitch) {
    const pl = isAway ? S.pitchersAway : S.pitchersHome;
    if (
      !pl.find(function (x) {
        return x.name === p.name;
      })
    )
      pl.push({
        name: p.name,
        num: p.num || "0",
        hand: (p.throw || "R") === "L" ? "L" : "R",
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
        active: false,
      });
    renderPitcherList();
  }
  clearAtBat();
  renderLineup();
}

// ── DRAG AND DROP INTO LINEUP ───────────────────────────────────────

let _dragPlayerId = null;

function myTeamDragStart(e, playerId) {
  _dragPlayerId = playerId;
  e.dataTransfer.setData("text/plain", playerId);
  e.dataTransfer.effectAllowed = "copy";
}

function lineupSlotDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "copy";
  e.currentTarget.style.background = "rgba(204,26,26,.15)";
  e.currentTarget.style.borderColor = "var(--accent)";
}

function lineupSlotDragLeave(e) {
  e.currentTarget.style.background = "";
  e.currentTarget.style.borderColor = "";
}

function lineupSlotDrop(e, slotIdx, isAway) {
  e.preventDefault();
  e.currentTarget.style.background = "";
  e.currentTarget.style.borderColor = "";
  const playerId =
    e.dataTransfer.getData("text/plain") || _dragPlayerId;
  const p = myTeamRoster.find(function (x) {
    return x.id === playerId;
  });
  if (!p) return;
  const lineup = isAway ? S.lineupAway : S.lineupHome;
  lineup[slotIdx] = {
    name: p.name,
    num: p.num || String(slotIdx + 1),
    pos: p.pos || "OF",
    hand: p.bat || "R",
    isPH: false,
    isPR: false,
    isDEF: false,
  };
  const isPitch = ["RHP", "LHP", "P", "UTL/RHP"].includes(p.pos);
  if (isPitch) {
    const pl = isAway ? S.pitchersAway : S.pitchersHome;
    if (
      !pl.find(function (x) {
        return x.name === p.name;
      })
    )
      pl.push({
        name: p.name,
        num: p.num || "0",
        hand: (p.throw || "R") === "L" ? "L" : "R",
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
        active: false,
      });
    renderPitcherList();
  }
  clearAtBat();
  renderLineup();
  _dragPlayerId = null;
}

// ── ROSTER IMPORT ───────────────────────────────────────────────────

function myTeamImport(input) {
  const file = input.files[0];
  if (!file) return;
  const ext = file.name.split(".").pop().toLowerCase();
  const reader = new FileReader();
  reader.onload = function (e) {
    if (ext === "pdf") {
      myTeamParsePDF(e.target.result).then(function (players) {
        _myTeamFinishImport(players, input);
      });
      return;
    }
    var players = [];
    try {
      if (ext === "trx") players = myTeamParseTRX(e.target.result);
      else if (ext === "csv") players = myTeamParseCSV(e.target.result);
      else if (ext === "xlsx")
        players = myTeamParseXLSX(e.target.result);
    } catch (err) {
      alert("Import failed: " + err.message);
      return;
    }
    _myTeamFinishImport(players, input);
  };
  if (ext === "xlsx" || ext === "pdf") reader.readAsArrayBuffer(file);
  else reader.readAsText(file);
}

function _myTeamFinishImport(players, input) {
  if (!players || !players.length) {
    alert("No players found in file.");
    return;
  }
  var added = 0,
    updated = 0;
  for (var i = 0; i < players.length; i++) {
    var p = players[i];
    var existing = myTeamRoster.find(function (x) {
      return x.num === p.num && p.num;
    });
    if (existing) {
      Object.assign(existing, p, { id: existing.id });
      updated++;
    } else {
      p.id =
        "p_" +
        Date.now() +
        "_" +
        Math.random().toString(36).slice(2, 6);
      myTeamRoster.push(p);
      added++;
    }
  }
  myTeamSave();
  myTeamRender();
  toast("Imported: " + added + " added, " + updated + " updated");
  if (input) input.value = "";
}

function myTeamParseTRX(text) {
  // Format: ShortName @num @flags @Y @FullName @Pos @Ht @Wt @Hometown
  const players = [];
  for (const line of text.split("\n")) {
    const parts = line.split("@").map((s) => s.trim());
    if (parts.length < 6) continue;
    const num = parts[1];
    const name = parts[4];
    const pos = parts[5];
    const ht = parts[6] || "";
    const wt = parts[7] || "";
    if (!name || name.length < 2) continue;
    // Derive bat/throw from position name (RHP/LHP/LHH etc.)
    let bat = "R",
      thr = "R";
    if (pos.startsWith("LHP") || pos.startsWith("LH"))
      (bat = "L"), (thr = "L");
    else if (pos.startsWith("RHP") || pos.startsWith("RH"))
      (bat = "R"), (thr = "R");
    players.push({
      name,
      num,
      pos: pos.replace(/\s+/g, ""),
      bat,
      throw: thr,
      ht,
      wt,
    });
  }
  return players;
}

// ── Smart roster table parser (shared by CSV and XLSX) ──────────────────
// Accepts any column ordering and handles many header naming conventions.
// Normalize a verbose or non-standard position string to an app position code.
// throwHand ("R" or "L") is used to resolve pitcher handedness from "Pitcher" etc.
// Returns null if the input cannot be mapped (caller should keep original or use a default).
function _normalizeRosterPos(raw, throwHand) {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;

  // Already a recognized app code — pass through
  const KNOWN =
    /^(C|1B|2B|3B|SS|OF|LF|CF|RF|INF|INF\/OF|1B\/OF|DH|RHP|LHP|P|UTL|UTL\/RHP|C\/RHP|C\/2B|SS\/2B|3B\/RHP)$/i;
  if (KNOWN.test(s)) return s.toUpperCase();

  const isL = String(throwHand || "R")
    .toUpperCase()
    .startsWith("L");
  const pitchCode = isL ? "LHP" : "RHP";
  const lo = s.toLowerCase().replace(/[-_]/g, " ");

  const hasPitch = /pitch/i.test(lo);
  const hasOF = /out.?field|outfielder/i.test(lo);
  const hasIF = /in.?field|infielder/i.test(lo);
  const hasC = /^catch|catcher/i.test(lo);
  const has1B = /first.?base|1st.?base/i.test(lo);
  const has2B = /second.?base|2nd.?base/i.test(lo);
  const has3B = /third.?base|3rd.?base/i.test(lo);
  const hasSS = /short.?stop/i.test(lo);
  const hasDH = /design|^dh$/i.test(lo);
  const hasUtil = /utilit|^utl$/i.test(lo);
  const hasLF = /^left.?field$|^lf$/i.test(lo);
  const hasCF = /^center.?field$|^cf$/i.test(lo);
  const hasRF = /^right.?field$|^rf$/i.test(lo);

  // Combo: pitcher + position player (e.g. "Outfield/Pitcher", "Catcher/Pitcher")
  if (
    hasPitch &&
    (hasOF || hasIF || hasC || has3B || has1B || has2B || hasSS)
  ) {
    if (hasC) return isL ? "LHP" : "C/RHP";
    if (has3B) return isL ? "LHP" : "3B/RHP";
    return isL ? "LHP" : "UTL/RHP";
  }

  // Pure pitcher (including "Pitcher", "P", "Starting Pitcher", etc.)
  if (hasPitch || /^p$/i.test(s)) return pitchCode;

  // Specific outfield corners before generic OF
  if (hasLF) return "LF";
  if (hasCF) return "CF";
  if (hasRF) return "RF";
  if (hasOF) return "OF";

  if (hasC) return "C";
  if (has1B) return "1B";
  if (has2B) return "2B";
  if (has3B) return "3B";
  if (hasSS) return "SS";
  if (hasIF) return "INF";
  if (hasDH) return "DH";
  if (hasUtil) return "UTL";

  return null; // unrecognized
}

function _smartParseRosterTable(rows) {
  // Normalize a header cell to a plain lowercase key
  const norm = (s) =>
    String(s || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

  // Normalize a handedness value to "R" or "L" (or "S" for switch)
  const hand = (v) => {
    const s = String(v || "")
      .trim()
      .toUpperCase();
    if (s.startsWith("L")) return "L";
    if (s.startsWith("S")) return "S";
    return "R";
  };

  // Score a row for likelihood of being a header row
  const HEADER_KEYWORDS = [
    "name",
    "player",
    "num",
    "no",
    "number",
    "jersey",
    "pos",
    "position",
    "bat",
    "bats",
    "throw",
    "throws",
    "ht",
    "height",
    "wt",
    "weight",
    "class",
    "year",
    "yr",
    "hometown",
    "school",
    "#",
  ];
  const scoreRow = (row) =>
    row.reduce((n, cell) => {
      const raw = String(cell || "").trim();
      if (raw === "#") return n + 1; // "#" alone normalizes to "" so check raw first
      const k = norm(raw);
      return (
        n +
        (HEADER_KEYWORDS.some(
          (kw) => norm(kw) === k || (k && k.includes(norm(kw)))
        )
          ? 1
          : 0)
      );
    }, 0);

  // Find the header row (highest score, must match at least 2 keywords)
  let headerIdx = -1,
    bestScore = 1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const s = scoreRow(rows[i]);
    if (s > bestScore) {
      bestScore = s;
      headerIdx = i;
    }
  }

  // Column field mapping rules — checked in priority order per column
  const FIELD_RULES = [
    // jersey number
    {
      field: "num",
      match: (k) =>
        k === "#" ||
        /^(jersey|jsy|uniform)/.test(k) ||
        /^(no|num|number)/.test(k),
    },
    // player name
    {
      field: "name",
      match: (k) =>
        k === "name" ||
        k === "player" ||
        k === "playername" ||
        k === "fullname" ||
        k === "studentname",
    },
    // position
    { field: "pos", match: (k) => k === "pos" || k === "position" },
    // combined bats/throws like "B/T" or "Bat/Throw"
    {
      field: "bt",
      match: (k) =>
        k === "bt" ||
        k === "b/t" ||
        k === "bat/throw" ||
        k === "bats/throws" ||
        k === "b-t" ||
        k === "batthrow" ||
        k === "batsthrows",
    },
    // bats only
    {
      field: "bat",
      match: (k) =>
        k === "bat" ||
        k === "bats" ||
        k === "batting" ||
        k === "hits" ||
        k === "b",
    },
    // throws only
    {
      field: "thr",
      match: (k) =>
        k === "throw" ||
        k === "throws" ||
        k === "throwing" ||
        k === "throwinghand" ||
        k === "arm" ||
        k === "t",
    },
    // height / weight
    { field: "ht", match: (k) => k === "ht" || k === "height" },
    { field: "wt", match: (k) => k === "wt" || k === "weight" },
    // class / year
    {
      field: "cls",
      match: (k) =>
        k === "class" ||
        k === "yr" ||
        k === "year" ||
        k === "cl" ||
        k === "grade" ||
        k === "eligibility" ||
        k === "elig",
    },
    // extras (ignored but recognized so they don't pollute position detection)
    {
      field: "hometown",
      match: (k) =>
        k === "hometown" ||
        k === "city" ||
        k === "town" ||
        k === "residence",
    },
    {
      field: "school",
      match: (k) =>
        k === "highschool" ||
        k === "hs" ||
        k === "school" ||
        k === "schoolname" ||
        k === "preschool",
    },
    {
      field: "_skip",
      match: (k) =>
        /^(gp|gs|g|ab|avg|era|ip|h|r|er|bb|so|sv|w|l|rbi|slg|obp|ops|stat|stats|pa)/.test(
          k
        ),
    },
  ];

  const mapCol = (header) => {
    const raw = String(header || "").trim();
    if (/^#/.test(raw)) return "num"; // "#", "# ★", "#  (required)", etc.
    const k = norm(raw);
    if (!k) return null;
    for (const rule of FIELD_RULES) {
      if (rule.match(k)) return rule.field;
    }
    return null;
  };

  // Build column-to-field map from header row (or fall back to positional guess)
  let colMap = []; // index → field name
  if (headerIdx >= 0) {
    colMap = rows[headerIdx].map(mapCol);
  }

  const players = [];

  const dataStart = headerIdx >= 0 ? headerIdx + 1 : 0;
  for (let ri = dataStart; ri < rows.length; ri++) {
    const row = rows[ri];
    if (!row || row.length < 2) continue;
    const cells = row.map((c) => String(c || "").trim());

    // Check for "No.: X" labeled-cell format (some XLSX exports)
    const noCell = cells.find((c) => /^No\.\s*:/i.test(c));
    if (noCell) {
      const posCell = cells.find((c) => /^Pos\.\s*:/i.test(c));
      const btCell = cells.find((c) => /^B\/T\s*:/i.test(c));
      const htCell = cells.find((c) => /^Ht\.\s*:/i.test(c));
      const wtCell = cells.find((c) => /^Wt\.\s*:/i.test(c));
      const name = (cells[2] || "").trim();
      if (name.length < 2) continue;
      const bt = btCell
        ? btCell.replace(/^B\/T\s*:\s*/i, "").split("/")
        : ["R", "R"];
      players.push({
        name,
        num: noCell.replace(/^No\.\s*:\s*/i, ""),
        pos: posCell ? posCell.replace(/^Pos\.\s*:\s*/i, "") : "OF",
        bat: hand(bt[0]),
        throw: hand(bt[1]),
        ht: htCell ? htCell.replace(/^Ht\.\s*:\s*/i, "") : "",
        wt: wtCell ? wtCell.replace(/^Wt\.\s*:\s*/i, "") : "",
      });
      continue;
    }

    // Use column map if we have headers
    let num = "",
      name = "",
      pos = "",
      bat = "",
      thr = "",
      ht = "",
      wt = "",
      bt = null;

    if (headerIdx >= 0) {
      cells.forEach((val, ci) => {
        const field = colMap[ci];
        if (!field || field === "_skip") return;
        switch (field) {
          case "num":
            num = val.replace(/[^0-9]/g, "");
            break;
          case "name":
            name = val;
            break;
          case "pos":
            pos = val;
            break;
          case "bt":
            bt = val;
            break;
          case "bat":
            bat = val;
            break;
          case "thr":
            thr = val;
            break;
          case "ht":
            ht = val;
            break;
          case "wt":
            wt = val;
            break;
        }
      });

      // Handle combined B/T column
      if (bt) {
        if (bt.includes("/")) {
          const parts = bt.split("/");
          bat = hand(parts[0]);
          thr = hand(parts[1]);
        } else {
          // Single value — applies to both if no separate columns
          bat = bat || hand(bt);
          thr = thr || hand(bt);
        }
      }
      bat = bat ? hand(bat) : "R";
      thr = thr ? hand(thr) : "R";
    } else {
      // No header row found — fall back to positional scan
      num = cells[0].replace(/[^0-9]/g, "");
      name = cells[1] || "";
      for (let ci = 2; ci < cells.length; ci++) {
        const c = cells[ci];
        if (/^[RLSB]\/[RL]$/i.test(c)) {
          const parts = c.split("/");
          bat = hand(parts[0]);
          thr = hand(parts[1]);
        } else if (/^\d+-\d+$/.test(c)) ht = c;
        else if (/^\d{3}$/.test(c)) wt = c;
        else if (
          /^(C|1B|2B|3B|SS|OF|LF|CF|RF|INF|DH|RHP|LHP|P|UTL)/i.test(c)
        )
          pos = c;
      }
      bat = bat || "R";
      thr = thr || "R";
    }

    name = name.trim();
    if (!name || name.length < 2) continue;
    // Skip rows that look like headers or totals
    if (/^(name|player|total|team)/i.test(name)) continue;

    // Normalize verbose positions ("Pitcher" → RHP/LHP, "Outfielder" → OF, etc.)
    pos = _normalizeRosterPos(pos, thr) || pos;
    if (!pos) pos = "OF";
    players.push({ name, num, pos, bat, throw: thr, ht, wt });
  }
  return players;
}

function myTeamParseCSV(text) {
  // Parse CSV into rows of cells, handling quoted fields
  const parseCSVLine = (line) => {
    const cells = [];
    let cur = "",
      inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQ = !inQ;
      } else if (ch === "," && !inQ) {
        cells.push(cur.trim());
        cur = "";
      } else cur += ch;
    }
    cells.push(cur.trim());
    return cells;
  };

  const rows = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map(parseCSVLine);

  return _smartParseRosterTable(rows);
}

function myTeamParseXLSX(buffer) {
  try {
    const XLSX = window.XLSX;
    if (!XLSX)
      throw new Error("XLSX not loaded yet — try again in 1 second");
    const wb = XLSX.read(buffer, { type: "arraybuffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: "",
    });
    const strRows = rows.map((r) =>
      r.map((c) => String(c || "").trim())
    );
    return _smartParseRosterTable(strRows);
  } catch (err) {
    console.warn("XLSX parse error:", err.message);
    alert("XLSX import error: " + err.message);
    return [];
  }
}

// PDF roster parser — uses coordinate-aware row/column extraction
function myTeamParsePDF(arrayBuffer) {
  return new Promise(function (resolve) {
    if (!window.pdfjsLib) {
      alert("PDF.js is loading, try again in 2 seconds.");
      resolve([]);
      return;
    }
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    window.pdfjsLib
      .getDocument({ data: arrayBuffer })
      .promise.then(function (pdf) {
        var pages = [];
        for (var p = 1; p <= pdf.numPages; p++) pages.push(p);
        return Promise.all(
          pages.map(function (pn) {
            return pdf.getPage(pn).then(function (page) {
              return page.getTextContent().then(function (tc) {
                // Return raw items with position data
                return tc.items.map(function (it) {
                  return {
                    str: it.str,
                    x: it.transform[4],
                    y: it.transform[5],
                  };
                });
              });
            });
          })
        );
      })
      .then(function (pageItems) {
        // Parse each page independently so every page gets its own
        // header detection and Y-row grouping.  Web-printed rosters
        // repeat the column header on every page, so this correctly
        // handles multi-page PDFs without cross-page row collisions.
        var allPlayers = [];
        pageItems.forEach(function (items) {
          var players = _parsePDFRosterItems(items);
          allPlayers = allPlayers.concat(players);
        });
        resolve(allPlayers);
      })
      .catch(function (err) {
        alert("PDF error: " + err.message);
        resolve([]);
      });
  });
}

function _parsePDFRosterItems(items) {
  // ── Regexes ─────────────────────────────────────────────────────────
  var POS =
    /^(C|1B|2B|3B|SS|OF|LF|CF|RF|INF|DH|RHP|LHP|P|UTL|1B\/OF|INF\/OF|C\/RHP|C\/2B|SS\/2B|3B\/RHP|UTL\/RHP)$/i;
  var VERBOSE_POS =
    /^(pitcher|pitching|outfield|outfielder|infield|infielder|catcher|first\s*base|second\s*base|third\s*base|shortstop|short\s*stop|designated\s*hitter|utility|left\s*field|center\s*field|right\s*field|outfield\/pitcher|pitcher\/outfield|infield\/pitcher|pitcher\/infield|catcher\/pitcher|pitcher\/catcher)$/i;
  var HT = /^\d[-']\d+["']?$/;
  var WT = /^\d{2,3}$/;
  var BT = /^[RLSBrlsb]\/[RLrl]$/;
  var JNUM = /^\d{1,2}$/;
  var YEAR_TOKEN =
    /^(Fr\.|So\.|Jr\.|Sr\.|Gr\.|FY|FR|SO|JR|SR|GR|R-Fr\.|R-Jr\.|R-Sr\.|Fy\.|Fy|1st|2nd|3rd|4th|5th|Freshman|Sophomore|Sophmore|Junior|Senior|Graduate|Yr\.|Year)$/i;

  // ── 1. Sort items top-to-bottom (high Y = top of page), left-to-right ─
  var sorted = items
    .filter(function (it) {
      return it.str.trim();
    })
    .slice()
    .sort(function (a, b) {
      return b.y !== a.y ? b.y - a.y : a.x - b.x;
    });
  if (!sorted.length) return [];

  // ── 2. Find header row — scan first 80 items with 15pt Y-band ─────────
  var HDR_TOL = 15;
  var COL_SNAP = 20;
  var colX = {
    num: -1,
    name: -1,
    yr: -1,
    pos: -1,
    ht: -1,
    wt: -1,
    bt: -1,
  };
  var headerY = -1;
  var headerFound = false;

  var maxScan = Math.min(sorted.length, 80);
  for (var si = 0; si < maxScan && !headerFound; si++) {
    var candidateY = sorted[si].y;
    var band = sorted.filter(function (it) {
      return Math.abs(it.y - candidateY) <= HDR_TOL;
    });
    var strs = band.map(function (it) {
      return it.str.toLowerCase().replace(/\.$/, "");
    });
    var hasNum = strs.some(function (s) {
      return (
        s === "no" ||
        s === "#" ||
        s === "jersey" ||
        s === "num" ||
        s === "number"
      );
    });
    var hasName = strs.some(function (s) {
      return s === "name" || s === "player";
    });
    var hasPos = strs.some(function (s) {
      return s === "pos" || s === "position";
    });
    if ((hasNum || hasName) && hasPos) {
      headerFound = true;
      headerY = candidateY;
      band.forEach(function (it) {
        var sl = it.str.toLowerCase().replace(/\.$/, "");
        if (
          sl === "no" ||
          sl === "#" ||
          sl === "jersey" ||
          sl === "num" ||
          sl === "number"
        )
          colX.num = it.x;
        if (sl === "name" || sl === "player") colX.name = it.x;
        if (
          sl === "yr" ||
          sl === "year" ||
          sl === "class" ||
          sl === "cl" ||
          sl === "grade"
        )
          colX.yr = it.x;
        if (sl === "pos" || sl === "position") colX.pos = it.x;
        if (sl === "ht" || sl === "height") colX.ht = it.x;
        if (sl === "wt" || sl === "weight") colX.wt = it.x;
        if (
          sl === "b/t" ||
          sl === "b-t" ||
          sl === "bat/thr" ||
          sl === "b" ||
          sl === "t"
        )
          colX.bt = it.x;
      });
    }
  }

  // ── 3. Filter to items below the header ───────────────────────────────
  var dataItems = headerFound
    ? sorted.filter(function (it) {
        return it.y < headerY - HDR_TOL;
      })
    : sorted;

  // ── 4. Helper: parse a bucket of items as one player ─────────────────
  function extractPlayer(cells) {
    var num = "",
      name = "",
      pos = "",
      ht = "",
      wt = "",
      bt = "";
    if (colX.num >= 0) {
      // Tightly-anchored columns checked first; name is the catch-all between
      // the name anchor and the pos anchor (excluding the YR column).
      cells.forEach(function (c) {
        if (colX.num >= 0 && Math.abs(c.x - colX.num) < COL_SNAP) {
          if (!num) num = c.str;
          return;
        }
        if (colX.bt >= 0 && Math.abs(c.x - colX.bt) < COL_SNAP) {
          if (!bt) bt = c.str;
          return;
        }
        if (colX.ht >= 0 && Math.abs(c.x - colX.ht) < COL_SNAP) {
          if (!ht) ht = c.str;
          return;
        }
        if (colX.wt >= 0 && Math.abs(c.x - colX.wt) < COL_SNAP) {
          if (!wt) wt = c.str;
          return;
        }
        if (colX.pos >= 0 && Math.abs(c.x - colX.pos) < COL_SNAP) {
          if (!pos) pos = c.str;
          return;
        }
        // Skip the YR/class column — don't absorb year values into names
        if (colX.yr >= 0 && Math.abs(c.x - colX.yr) < COL_SNAP) {
          return;
        }
        // Name: from name anchor up to (but not including) pos anchor
        // Also stop before the YR column anchor if it exists
        var nameEnd = colX.pos >= 0 ? colX.pos - COL_SNAP : Infinity;
        if (colX.yr >= 0 && colX.yr - COL_SNAP < nameEnd)
          nameEnd = colX.yr - COL_SNAP;
        if (
          colX.name >= 0 &&
          c.x >= colX.name - COL_SNAP &&
          c.x < nameEnd
        ) {
          name = (name ? name + " " : "") + c.str;
          return;
        }
      });
    } else {
      // No header — sequential token parse
      var tokens = [];
      cells.forEach(function (c) {
        tokens = tokens.concat(c.str.split(/\s+/));
      });
      tokens = tokens.filter(function (t) {
        return t.trim();
      });
      var ti = 0;
      if (!JNUM.test(tokens[0])) return null;
      num = tokens[ti++];
      var nameParts = [];
      while (ti < tokens.length) {
        var t = tokens[ti];
        if (
          YEAR_TOKEN.test(t) ||
          POS.test(t) ||
          HT.test(t) ||
          BT.test(t) ||
          JNUM.test(t)
        )
          break;
        if (/^[A-Za-z]/.test(t)) nameParts.push(t);
        else break;
        ti++;
      }
      name = nameParts.join(" ");
      if (ti < tokens.length && YEAR_TOKEN.test(tokens[ti])) ti++;
      if (
        ti < tokens.length &&
        (POS.test(tokens[ti]) || VERBOSE_POS.test(tokens[ti]))
      )
        pos = tokens[ti++];
      if (ti < tokens.length && HT.test(tokens[ti])) ht = tokens[ti++];
      if (ti < tokens.length && WT.test(tokens[ti])) wt = tokens[ti++];
      if (ti < tokens.length && BT.test(tokens[ti])) bt = tokens[ti++];
    }

    // Clean up
    num = num.replace(/[^\d]/g, "").trim();
    name = name.replace(/,$/, "").trim();
    name = name
      .split(/\s+/)
      .filter(function (w) {
        return (
          !YEAR_TOKEN.test(w) &&
          !POS.test(w) &&
          !VERBOSE_POS.test(w) &&
          !HT.test(w) &&
          !JNUM.test(w)
        );
      })
      .join(" ")
      .trim();
    bt = bt.toUpperCase().trim();

    if (!JNUM.test(num) || !name || name.length < 2) return null;
    if (YEAR_TOKEN.test(name) || POS.test(name)) return null;

    var bat = "R",
      thr = "R";
    if (bt) {
      var bm = bt.match(/^([RLSB])\/([RL])$/i);
      if (bm) {
        bat = bm[1].toUpperCase();
        thr = bm[2].toUpperCase();
      }
    }
    // Normalize verbose/non-standard positions now that throw hand is known
    pos =
      _normalizeRosterPos(pos.trim(), thr) ||
      (POS.test(pos.trim()) ? pos.trim().toUpperCase() : "");
    return {
      name: name,
      num: num,
      pos: pos || "OF",
      bat: bat,
      throw: thr,
      ht: ht,
      wt: wt,
    };
  }

  // ── 5. Two-pass nearest-jersey assignment ─────────────────────────────
  // Pass 1: locate all jersey-number items in the num column.
  // Pass 2: assign every other item to whichever jersey's Y it is closest
  // to (within MAX_ROW_DIST). This prevents items that appear slightly
  // above a jersey number from bleeding into the previous player's bucket.
  var players = [];

  if (headerFound && colX.num >= 0) {
    var MAX_ROW_DIST = 30;

    // Pass 1 — collect jersey anchors
    var jerseyAnchors = [];
    dataItems.forEach(function (it) {
      var atNumCol = Math.abs(it.x - colX.num) < COL_SNAP;
      var cleaned = it.str
        .trim()
        .replace(/^#/, "")
        .replace(/[.\s]+$/, "");
      if (atNumCol && JNUM.test(cleaned)) {
        jerseyAnchors.push({ y: it.y, item: it });
      }
    });

    if (jerseyAnchors.length) {
      // Build per-jersey buckets, seeded with the jersey item itself
      var bucketMap = {};
      jerseyAnchors.forEach(function (ja) {
        bucketMap[ja.y] = [ja.item];
      });

      // Pass 2 — assign all other items to nearest jersey
      dataItems.forEach(function (it) {
        var atNumCol = Math.abs(it.x - colX.num) < COL_SNAP;
        var cleaned = it.str
          .trim()
          .replace(/^#/, "")
          .replace(/[.\s]+$/, "");
        if (atNumCol && JNUM.test(cleaned)) return; // already seeded
        var best = null,
          bestDist = MAX_ROW_DIST + 1;
        jerseyAnchors.forEach(function (ja) {
          var d = Math.abs(it.y - ja.y);
          if (d < bestDist) {
            bestDist = d;
            best = ja;
          }
        });
        if (best) bucketMap[best.y].push(it);
      });

      // Parse each bucket in top-to-bottom order
      jerseyAnchors
        .slice()
        .sort(function (a, b) {
          return b.y - a.y;
        })
        .forEach(function (ja) {
          var p = extractPlayer(bucketMap[ja.y]);
          if (p) players.push(p);
        });
    }
  } else {
    // No reliable header/num column — fall back to Y-row grouping
    var ROW_TOL = 8;
    var rows = [];
    dataItems.forEach(function (it) {
      var row = rows.find(function (r) {
        return Math.abs(r.y - it.y) <= ROW_TOL;
      });
      if (!row) {
        row = { y: it.y, cells: [] };
        rows.push(row);
      }
      row.cells.push(it);
    });
    rows.sort(function (a, b) {
      return b.y - a.y;
    });
    rows.forEach(function (row) {
      var p = extractPlayer(
        row.cells.slice().sort(function (a, b) {
          return a.x - b.x;
        })
      );
      if (p) players.push(p);
    });
  }

  return players;
}

// ── ROSTER TEMPLATE DOWNLOAD ───────────────────────────────────────
function downloadRosterTemplate() {
  function _doDownload() {
    const XLSX = window.XLSX;
    if (!XLSX) {
      alert(
        "Spreadsheet library not loaded yet — please try again in a moment."
      );
      return;
    }

    // ── Shared style helpers ──────────────────────────────────────────
    // Dark navy header (matches PitchTrack nav bar)
    const headerFill = { fgColor: { rgb: "111827" } };
    const accentFill = { fgColor: { rgb: "CC1A1A" } }; // PT red
    const guideFill = { fgColor: { rgb: "1E2A3A" } }; // dark blue-grey for guide panel
    const altRowFill = { fgColor: { rgb: "F7F8FA" } }; // light stripe
    const sampleFill = { fgColor: { rgb: "FFF8F0" } }; // warm tint for sample row
    const guideCellFill = { fgColor: { rgb: "F0F4FA" } }; // guide value cells

    const boldWhite = {
      bold: true,
      color: { rgb: "FFFFFF" },
      name: "Calibri",
      sz: 11,
    };
    const boldRed = {
      bold: true,
      color: { rgb: "FF4444" },
      name: "Calibri",
      sz: 10,
    };
    const boldDark = {
      bold: true,
      color: { rgb: "111827" },
      name: "Calibri",
      sz: 11,
    };
    const italicGrey = {
      italic: true,
      color: { rgb: "888888" },
      name: "Calibri",
      sz: 10,
    };
    const normalDark = {
      color: { rgb: "111827" },
      name: "Calibri",
      sz: 11,
    };
    const guideTitle = {
      bold: true,
      color: { rgb: "FFFFFF" },
      name: "Calibri",
      sz: 11,
    };
    const guideKey = {
      bold: true,
      color: { rgb: "CC1A1A" },
      name: "Calibri",
      sz: 10,
    };
    const guideVal = {
      color: { rgb: "333333" },
      name: "Calibri",
      sz: 10,
    };
    const guideNote = {
      italic: true,
      color: { rgb: "666666" },
      name: "Calibri",
      sz: 9,
    };
    const centerAlign = { horizontal: "center", vertical: "center" };
    const leftAlign = { horizontal: "left", vertical: "center" };

    const cell = (v, font, fill, alignment, numFmt) => ({
      v,
      t: typeof v === "number" ? "n" : "s",
      s: {
        font: font || normalDark,
        fill: fill
          ? { patternType: "solid", ...fill }
          : { patternType: "none" },
        alignment: alignment || leftAlign,
        border: {
          bottom: { style: "thin", color: { rgb: "DDDDDD" } },
          right: { style: "thin", color: { rgb: "DDDDDD" } },
        },
        ...(numFmt ? { numFmt } : {}),
      },
    });

    const hcell = (v) => ({
      // header cell
      v,
      t: "s",
      s: {
        font: boldWhite,
        fill: { patternType: "solid", ...headerFill },
        alignment: centerAlign,
        border: {
          bottom: { style: "medium", color: { rgb: "CC1A1A" } },
          right: { style: "thin", color: { rgb: "334455" } },
        },
      },
    });

    const gcell = (v, font, fill) => ({
      // guide panel cell
      v,
      t: "s",
      s: {
        font: font || guideVal,
        fill: fill
          ? { patternType: "solid", ...fill }
          : { patternType: "solid", ...guideCellFill },
        alignment: leftAlign,
        border: {
          bottom: { style: "thin", color: { rgb: "CCCCCC" } },
          right: { style: "thin", color: { rgb: "CCCCCC" } },
          left: { style: "thin", color: { rgb: "CCCCCC" } },
        },
      },
    });

    // ── Sheet data ────────────────────────────────────────────────────
    // Columns: A=# B=Name C=Pos D=Bat E=Throw F=Ht G=Wt  [H=spacer]  I=guide-label J=guide-value
    //
    // Row 1  — main headers + guide panel header
    // Row 2  — sample (italic/tinted)
    // Rows 3+ — blank data rows (20)
    // Guide rows run alongside rows 1–15 in cols I/J

    const GUIDE = [
      // [label, value]
      ["PITCHTRACK ROSTER IMPORT GUIDE", ""],
      ["", ""],
      ["REQUIRED COLUMNS", ""],
      ["#  (Jersey Number)", "Digits only — e.g.  5,  12,  99"],
      ["Name", "Full name — First Last"],
      [
        "Pos  (Position)",
        "C · 1B · 2B · 3B · SS · INF · OF · LF · CF · RF · DH · RHP · LHP · P · UTL",
      ],
      [
        "Bat  (Batting Hand)",
        "R  =  Right      L  =  Left      S  =  Switch",
      ],
      ["Throw  (Throwing Hand)", "R  =  Right      L  =  Left"],
      ["", ""],
      ["OPTIONAL COLUMNS", ""],
      ["Ht  (Height)", "Format:  6-1   or   6'1\""],
      ["Wt  (Weight)", "Pounds — e.g.  185"],
      ["", ""],
      ["TIPS", ""],
      [
        "Column order",
        "Any order is fine — the importer reads headers",
      ],
      [
        "Extra columns",
        "Extra columns (stats, class year, etc.) are ignored",
      ],
      ["Sample row", "Row 2 is an example — overwrite or delete it"],
      [
        "B/T shorthand",
        "You may use a single  B/T  column (e.g.  R/R)",
      ],
    ];

    const aoa = [];

    // Row 1 — headers
    // IMPORTANT: column A header must start with "#" so the importer's
    // mapCol() can identify it. The ★ markers on other columns are fine
    // because norm() strips non-ascii chars leaving the keyword intact.
    aoa.push([
      hcell("#"),
      hcell("Name ★"),
      hcell("Pos ★"),
      hcell("Bat ★"),
      hcell("Throw ★"),
      hcell("Ht"),
      hcell("Wt"),
      cell(
        "  ★ = required",
        {
          italic: true,
          color: { rgb: "CC1A1A" },
          name: "Calibri",
          sz: 9,
        },
        null,
        leftAlign
      ),
      gcell(
        "  ★ = REQUIRED FIELD — must be filled in for every player",
        guideTitle,
        guideFill
      ),
      gcell("", guideTitle, guideFill),
    ]);

    // Row 2 — sample row
    const sFont = {
      italic: true,
      color: { rgb: "999999" },
      name: "Calibri",
      sz: 10,
    };
    aoa.push([
      cell("12", sFont, { fgColor: { rgb: "FFF8F0" } }, centerAlign),
      cell("John Smith", sFont, { fgColor: { rgb: "FFF8F0" } }),
      cell("OF", sFont, { fgColor: { rgb: "FFF8F0" } }, centerAlign),
      cell("R", sFont, { fgColor: { rgb: "FFF8F0" } }, centerAlign),
      cell("R", sFont, { fgColor: { rgb: "FFF8F0" } }, centerAlign),
      cell("6-1", sFont, { fgColor: { rgb: "FFF8F0" } }, centerAlign),
      cell("185", sFont, { fgColor: { rgb: "FFF8F0" } }, centerAlign),
      cell(
        "← sample row — overwrite or delete",
        {
          italic: true,
          color: { rgb: "AAAAAA" },
          name: "Calibri",
          sz: 9,
        },
        null,
        leftAlign
      ),
      gcell(
        GUIDE[0][0],
        {
          bold: true,
          color: { rgb: "FFFFFF" },
          name: "Calibri",
          sz: 12,
        },
        guideFill
      ),
      gcell("", null, guideFill),
    ]);

    // Rows 3–22 — 20 blank data rows, alternating stripe
    for (let i = 0; i < 20; i++) {
      const stripe =
        i % 2 === 1 ? { fgColor: { rgb: "F7F8FA" } } : null;
      const guideIdx = i + 1; // GUIDE rows 1..20
      const [gl, gv] =
        guideIdx < GUIDE.length ? GUIDE[guideIdx] : ["", ""];

      // Style guide label cells
      let glFont = guideVal;
      let glFill = guideCellFill;
      if (
        gl === "REQUIRED COLUMNS" ||
        gl === "OPTIONAL COLUMNS" ||
        gl === "TIPS"
      ) {
        glFont = {
          bold: true,
          color: { rgb: "FFFFFF" },
          name: "Calibri",
          sz: 10,
        };
        glFill = accentFill;
      } else if (gl === "") {
        glFill = { fgColor: { rgb: "E8ECF2" } };
      }

      aoa.push([
        cell("", normalDark, stripe, centerAlign),
        cell("", normalDark, stripe),
        cell("", normalDark, stripe, centerAlign),
        cell("", normalDark, stripe, centerAlign),
        cell("", normalDark, stripe, centerAlign),
        cell("", normalDark, stripe, centerAlign),
        cell("", normalDark, stripe, centerAlign),
        cell("", normalDark, null), // H spacer
        gcell(gl, glFont, glFill),
        gcell(gv, guideVal, guideCellFill),
      ]);
    }

    // ── Build worksheet from aoa ───────────────────────────────────
    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // ── Column widths ──────────────────────────────────────────────
    ws["!cols"] = [
      { wch: 10 }, // A  #
      { wch: 24 }, // B  Name
      { wch: 8 }, // C  Pos
      { wch: 7 }, // D  Bat
      { wch: 8 }, // E  Throw
      { wch: 8 }, // F  Ht
      { wch: 7 }, // G  Wt
      { wch: 26 }, // H  sample-row note / spacer
      { wch: 24 }, // I  Guide label
      { wch: 60 }, // J  Guide value
    ];

    // ── Row heights ────────────────────────────────────────────────
    ws["!rows"] = [{ hpt: 20 }]; // header row slightly taller

    // ── Freeze top row ─────────────────────────────────────────────
    ws["!freeze"] = { xSplit: 0, ySplit: 1, topLeftCell: "A2" };

    // ── Merge guide header across I1:J1 and I2:J2 ─────────────────
    ws["!merges"] = [
      { s: { r: 0, c: 8 }, e: { r: 0, c: 9 } }, // I1:J1 — "★ = REQUIRED..."
      { s: { r: 1, c: 8 }, e: { r: 1, c: 9 } }, // I2:J2 — "PITCHTRACK ROSTER IMPORT GUIDE"
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "PitchTrack Roster");

    // Write with cellStyles enabled
    XLSX.writeFile(wb, "PitchTrack_Roster_Template.xlsx", {
      cellStyles: true,
    });
  }

  if (window.XLSX) {
    _doDownload();
  } else {
    const check = setInterval(function () {
      if (window.XLSX) {
        clearInterval(check);
        _doDownload();
      }
    }, 200);
    setTimeout(function () {
      clearInterval(check);
    }, 10000);
  }
}

// Load SheetJS + PDF.js dynamically
(function () {
  if (!window.XLSX) {
    var s = document.createElement("script");
    s.src =
      "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    document.head.appendChild(s);
  }
  if (!window.pdfjsLib) {
    var p = document.createElement("script");
    p.src =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    document.head.appendChild(p);
  }
})();
// Legacy SheetJS loader reference kept for compat
(function loadSheetJS() {
  if (window.XLSX) return;
  const s = document.createElement("script");
  s.src =
    "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
  document.head.appendChild(s);
})();

