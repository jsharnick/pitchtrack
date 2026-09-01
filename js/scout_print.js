// ===================== SCOUTING REPORT PRINT FUNCTIONS =====================

// Shared CSS for all printed scouting reports
function _scoutPrintCSS() {
  return [
    "*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }",
    'html, body { background: #fff; font-family: "Barlow Condensed", sans-serif; color: #111318;',
    "  -webkit-print-color-adjust: exact; print-color-adjust: exact; }",
    "@page { size: 8.5in 11in portrait; margin: 0.1in; }",
    // No transform here — JS will measure and inject exact scale per page
    ".scout-report-page {",
    "  width: 8.3in;", // 8.5in - 0.1in margins each side
    "  background: #fff;",
    '  font-family: "Barlow Condensed", sans-serif;',
    "  transform-origin: top left;",
    "  page-break-after: always;",
    "  break-after: page;",
    "  overflow: visible;",
    "}",
    ".scout-report-page:last-child { page-break-after:auto; break-after:auto; }",
    '.scout-section-title { font-family:"Barlow",sans-serif; font-weight:700; font-size:10px;',
    "  letter-spacing:0.5px; text-transform:uppercase; color:#8a909e;",
    "  border-bottom:2px solid #d4d8e0; padding-bottom:2px; margin-bottom:4px; }",
    '.scout-table { width:100%; border-collapse:collapse; font-size:6.5px; font-family:"Barlow",sans-serif; }',
    '.scout-table th { font-family:"Barlow",sans-serif; font-weight:700; font-size:6px;',
    "  letter-spacing:0; text-transform:uppercase; color:#8a909e; padding:1px 2px;",
    "  border-bottom:1px solid #d4d8e0; text-align:center; background:#f8f9fb; }",
    ".scout-table td { padding:1px 2px; border-bottom:0.5px solid #e8eaee; text-align:center;",
    '  font-family:"Barlow",sans-serif; font-size:6.5px; }',
    ".scout-table td:first-child { text-align:left; font-weight:600; color:#4a5060; }",
    ".scout-table tr:last-child td { border-bottom:none; }",
    ".scout-highlight { color:#cc1a1a; font-weight:800; }",
    ".scout-dim { color:#8a909e; }",
    ".scout-good { color:#1a8a3a; font-weight:700; }",
    ".scout-bar-row { display:flex; align-items:center; gap:5px; margin-bottom:2px; }",
    '.scout-bar-label { font-family:"Barlow",sans-serif; font-size:10px; font-weight:500;',
    "  color:#4a5060; width:82px; flex-shrink:0; }",
    ".scout-bar-track { flex:1; background:#e8eaee; border-radius:3px; height:6px; overflow:hidden; }",
    ".scout-bar-fill { height:100%; border-radius:3px; }",
    '.scout-bar-val { font-family:"Share Tech Mono",monospace; font-size:8px; color:#8a909e;',
    "  width:30px; text-align:right; flex-shrink:0; }",
    '.scout-big-stat { font-family:"Barlow Condensed",sans-serif; font-weight:900; font-size:26px; line-height:1; }',
    '.scout-big-lbl { font-family:"Barlow",sans-serif; font-size:8px; font-weight:600; letter-spacing:0; text-transform:uppercase; color:#111318; margin-top:2px; }',
    ".scout-section { margin-bottom:6px; break-inside:avoid; }",
    ".scout-card { background:#fff; border:1px solid #e0e4ea; border-radius:5px; padding:4px 3px; text-align:center; }",
    '.scout-card-val { font-family:"Barlow Condensed",sans-serif; font-weight:800; font-size:16px; }',
    '.scout-card-lbl { font-family:"Barlow",sans-serif; font-size:8px; font-weight:600; color:#111318; margin-top:1px; }',
    ".scout-print-hide { display:none !important; }",
    "svg { max-width:100%; height:auto; }",
  ].join("\n");
}

function _openPrintWindow(html, title) {
  const win = window.open("", "_blank", "width=960,height=780");
  if (!win) {
    alert("Please allow popups to print scouting reports.");
    return;
  }

  // Auto-scale script: after fonts load, measure each report page and scale it
  // to fit exactly within the printable area (8in wide x 10.5in tall at 96dpi)
  const autoScaleScript = `
    document.fonts.ready.then(function(){
      var pages = document.querySelectorAll('.scout-report-page');
      // Printable area at 96dpi: 8.3in wide x 10.8in tall (8.5x11in minus 0.1in margins)
      var printW = 797;
      var printH = 1037;
      pages.forEach(function(page){
// Reset any previous scale
page.style.zoom = '';
var w = page.scrollWidth;
var h = page.scrollHeight;
// Scale to fit both dimensions — use whichever axis is the tighter constraint
var scaleX = printW / w;
var scaleH = printH / h;
var scale  = Math.min(scaleX, scaleH, 1); // never scale up, only down
if(scale < 1){
  page.style.zoom = scale;
  // zoom affects layout flow so page breaks calculate correctly
}
      });
      window.print();
    });
  `;

  const fullHTML =
    '<!DOCTYPE html><html><head><meta charset="utf-8">' +
    "<title>" +
    title +
    "</title>" +
    '<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;800;900' +
    '&family=Barlow:wght@300;400;500;600&family=Share+Tech+Mono&display=swap" rel="stylesheet">' +
    "<style>" +
    _scoutPrintCSS() +
    "</style></head><body>" +
    html +
    "<scr" +
    "ipt>" +
    autoScaleScript +
    "</scr" +
    "ipt>" +
    "</body></html>";
  win.document.write(fullHTML);
  win.document.close();
}

// Print the currently visible scouting report (from team scouting tab)
function printCurrentScoutReport() {
  if (window._ptUserRole === "explorer") {
    toast("Explorer mode — printing disabled");
    return;
  }
  const el = document.getElementById("scout-report-content");
  if (!el || !el.innerHTML.trim()) {
    alert("No scouting report loaded.");
    return;
  }
  const report = el.querySelector(".scout-report-page");
  if (!report) {
    alert("No scouting report found.");
    return;
  }
  _openPrintWindow(report.outerHTML, "PitchTrack Scouting Report");
}

// Print from the player detail scouting tab
function printPlayerScoutReport(teamName, playerName, type) {
  if (window._ptUserRole === "explorer") {
    toast("Explorer mode — printing disabled");
    return;
  }
  // Re-build the report fresh so we always have the latest data
  const games = getTeamGames(teamName);
  const html =
    type === "pitcher"
      ? buildPitcherScoutingReport(teamName, playerName, games)
      : buildHitterScoutingReport(teamName, playerName, games);
  // Extract just the .scout-report-page div
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  const page = tmp.querySelector(".scout-report-page") || tmp;
  _openPrintWindow(page.outerHTML, `${playerName} — Scouting Report`);
}

// Print ALL hitter + pitcher scouting reports for a team, one per page
function printAllScoutReports() {
  if (window._ptUserRole === "explorer") {
    toast("Explorer mode — printing disabled");
    return;
  }
  // Determine which team is currently being viewed
  const teamName = currentView?.data;
  if (!teamName || typeof teamName !== "string") {
    alert("Please open a team page first.");
    return;
  }
  const games = getTeamGames(teamName);
  const players = getTeamRoster(teamName, games)
    .filter((p) => p.pa > 0)
    .sort((a, b) => b.ab - a.ab);
  const pitchers = getTeamPitchers(teamName, games)
    .filter((p) => p.pitches > 0)
    .sort((a, b) => b.pitches - a.pitches);

  if (!players.length && !pitchers.length) {
    alert("No player data found for this team.");
    return;
  }

  // Show a brief loading indicator on the button
  const btn = document.getElementById("print-all-btn");
  if (btn) {
    btn.textContent = "⏳ Building reports…";
    btn.disabled = true;
  }

  // Build all reports asynchronously so the UI can update first
  setTimeout(() => {
    try {
      const pages = [];

      players.forEach((p) => {
        try {
          const html = buildHitterScoutingReport(
            teamName,
            p.name,
            games
          );
          const tmp = document.createElement("div");
          tmp.innerHTML = html;
          const page = tmp.querySelector(".scout-report-page");
          if (page) pages.push(page.outerHTML);
        } catch (e) {
          console.warn("Failed hitter report for", p.name, e);
        }
      });

      pitchers.forEach((p) => {
        try {
          const html = buildPitcherScoutingReport(
            teamName,
            p.name,
            games
          );
          const tmp = document.createElement("div");
          tmp.innerHTML = html;
          const page = tmp.querySelector(".scout-report-page");
          if (page) pages.push(page.outerHTML);
        } catch (e) {
          console.warn("Failed pitcher report for", p.name, e);
        }
      });

      if (!pages.length) {
        alert("Could not generate any reports.");
        return;
      }
      _openPrintWindow(
        pages.join("\n"),
        `${teamName} — Full Scouting Report`
      );
    } finally {
      if (btn) {
        btn.innerHTML = "🖨 Print All Reports";
        btn.disabled = false;
      }
    }
  }, 50);
}

/* BOOT */
(function () {
  var trackerInited = false;
  var hubInited = false;
  var _origOpen = openPanel;
  openPanel = function (name, skip) {
    _origOpen(name, skip);
    if (name === "tracker" && !trackerInited) {
      trackerInited = true;
      setTimeout(function () {
        try {
          trackerInit();
        } catch (e) {
          console.warn(e);
        }
      }, 80);
    }
    if (name === "hub") {
      if (!hubInited) {
        hubInited = true;
        setTimeout(function () {
          try {
            hubBoot();
          } catch (e) {
            console.warn(e);
          }
        }, 80);
      } else {
        // Already booted — just refresh data
        setTimeout(function () {
          try {
            hubRefreshAll();
          } catch (e) {}
        }, 80);
      }
    }
  };
})();

/* ── PRINT: clone scout report into a static body-level element ── */
(function () {
  var _printRoot = null;

  window.addEventListener("beforeprint", function () {
    // Find the active scout report page
    var report = document.querySelector(".scout-report-page");
    if (!report) return;

    // Create a clean static container at the body level
    _printRoot = document.createElement("div");
    _printRoot.id = "print-root";
    _printRoot.style.cssText =
      "position:static;width:100%;background:#fff;";
    _printRoot.innerHTML = report.outerHTML;
    document.body.appendChild(_printRoot);
  });

  window.addEventListener("afterprint", function () {
    if (_printRoot) {
      document.body.removeChild(_printRoot);
      _printRoot = null;
    }
  });
})();

// ════════════════════════════════════════════════════════════════════
// SCOUTING OVERVIEW
// ════════════════════════════════════════════════════════════════════
let _scoutSelectedTeam = null;

async function scoutOverviewLoad() {
  // Ensure game data is loaded (may not be if Stats Hub was never opened)
  if (!allGames.length) {
    const body = document.getElementById("scout-overview-content");
    if (body)
      body.innerHTML = `<div style="color:var(--text2);font-family:'Barlow Condensed',sans-serif;font-size:15px;padding:20px 0;">Loading game data…</div>`;
    try {
      await myTeamLoad();
    } catch (e) {}
    allGames = await loadAllGames();
    try {
      await oppLoad();
    } catch (e) {}
  } else if (!(_opponents && _opponents.length)) {
    try {
      await oppLoad();
    } catch (e) {}
  }

  // Build team list: myTeam + all saved opponents + any misc teams from game history
  const teams = [];
  const seen = new Set();

  // My team
  const myName = window._myTeamNameCache || null;
  if (myName && !seen.has(myName)) {
    seen.add(myName);
    teams.push({ name: myName, label: myName, badge: "MY TEAM" });
  }

  // Saved opponents
  (_opponents || []).forEach((o) => {
    if (!seen.has(o.name)) {
      seen.add(o.name);
      teams.push({ name: o.name, label: o.name, badge: null });
    }
  });

  // Misc teams from game history
  allGames.forEach((g) => {
    [g.awayTeam, g.homeTeam].forEach((t) => {
      if (t && !seen.has(t)) {
        seen.add(t);
        teams.push({ name: t, label: t, badge: "MISC" });
      }
    });
  });

  const btnWrap = document.getElementById("scout-team-btns");
  if (!btnWrap) return;
  if (!teams.length) {
    btnWrap.innerHTML = `<span style="color:var(--text3);font-family:'Barlow Condensed',sans-serif;font-size:13px;">No game history found.</span>`;
    return;
  }
  btnWrap.innerHTML = teams
    .map(
      (t) =>
        `<button class="scout-team-btn${
          _scoutSelectedTeam === t.name ? " active" : ""
        }" data-scout-team="${t.name.replace(
          /"/g,
          "&quot;"
        )}" onclick="scoutSelectTeam(this.dataset.scoutTeam)">
      ${
        t.badge
          ? `<span style="font-size:9px;opacity:0.65;margin-right:4px;">${t.badge}</span>`
          : ""
      }${t.label}
    </button>`
    )
    .join("");

  if (_scoutSelectedTeam && seen.has(_scoutSelectedTeam)) {
    scoutBuildCards(_scoutSelectedTeam);
  } else {
    document.getElementById(
      "scout-overview-content"
    ).innerHTML = `<div style="color:var(--text2);font-family:'Barlow Condensed',sans-serif;font-size:15px;padding:20px 0;">Select a team above to generate scouting cards.</div>`;
  }
}

function scoutSelectTeam(name) {
  _scoutSelectedTeam = name;
  document.querySelectorAll(".scout-team-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.scoutTeam === name);
  });
  scoutBuildCards(name);
}

// Normalize old "FB" pitch type to "4SFB" at display time only — never touches stored data
function _normPT(t) {
  if (!t) return t;
  return t.toUpperCase() === "FB" ? "4SFB" : t;
}

function _scoutFmt(v, dec) {
  if (v == null || isNaN(v)) return "—";
  return dec != null ? v.toFixed(dec) : String(v);
}
function _scoutPct(n, d) {
  if (!d) return "—";
  return ((n / d) * 100).toFixed(0) + "%";
}
function _scoutAvg(h, ab) {
  if (!ab) return ".000";
  return "." + String(Math.round((h / ab) * 1000)).padStart(3, "0");
}
function _scoutOBP(h, bb, hbp, pa) {
  if (!pa) return ".000";
  const n = h + bb + hbp;
  return "." + String(Math.round((n / pa) * 1000)).padStart(3, "0");
}
function _scoutSLG(h, d, t, hr, ab) {
  if (!ab) return ".000";
  const tb = h - d - t - hr + d * 2 + t * 3 + hr * 4;
  return "." + String(Math.round((tb / ab) * 1000)).padStart(3, "0");
}

function scoutBuildCards(teamName) {
  const games = getTeamGames(teamName);
  if (!games.length) {
    document.getElementById(
      "scout-overview-content"
    ).innerHTML = `<div style="color:var(--text2);font-family:'Barlow Condensed',sans-serif;font-size:15px;">No game data for ${teamName}.</div>`;
    return;
  }

  const hitters = getTeamRoster(teamName, games)
    .filter((p) => p.pa >= 1)
    .sort((a, b) => (b.ab || 0) - (a.ab || 0));
  const pitchers = getTeamPitchers(teamName, games).sort(
    (a, b) => (b.pitches || 0) - (a.pitches || 0)
  );

  // Build hitter tendency rows
  const hitterRows = hitters
    .map((p) => {
      const pitches = getPlayerPitches(teamName, p.name, games);
      // Spray direction
      const inPlay = pitches.filter(
        (px) => px.spray && px.spray.x != null
      );
      let pull = 0,
        center = 0,
        oppo = 0;
      const isLHH = (p.hand || "R").toUpperCase().startsWith("L");
      inPlay.forEach((px) => {
        const angle =
          (Math.atan2(px.spray.x - 280, -(px.spray.y - 468)) * 180) /
          Math.PI;
        if (isLHH) {
          if (angle > 15) pull++;
          else if (angle < -15) oppo++;
          else center++;
        } else {
          if (angle < -15) pull++;
          else if (angle > 15) oppo++;
          else center++;
        }
      });
      const ipTotal = pull + center + oppo || 1;
      // Batted ball type
      const gb = inPlay.filter(
        (px) =>
          px.spray.btype === "groundball" ||
          px.spray.btype === "weakgrounder"
      ).length;
      const fb = inPlay.filter(
        (px) =>
          px.spray.btype === "flyball" || px.spray.btype === "popup"
      ).length;
      const ld = inPlay.filter(
        (px) => px.spray.btype === "linedrive"
      ).length;
      const bbTotal = gb + fb + ld || 1;
      // Count tendencies: first pitch swing, 2-strike K rate
      const fpPitches = pitches.filter((px) => {
        const c = _ppc(px);
        return c.balls === 0 && c.strikes === 0;
      });
      const fpSwings = fpPitches.filter((px) =>
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
          "sacbunt",
          "sacfly",
          "error",
        ].includes(px.outcome)
      ).length;
      const twoStrikePitches = pitches.filter((px) => {
        const c = _ppc(px);
        return c.strikes === 2;
      });
      const twoStrikeK = twoStrikePitches.filter(
        (px) =>
          px.outcome === "strike-swinging" ||
          px.outcome === "strike-looking"
      ).length;
      // Hot zone: most hit pitch type
      const hitPitches = pitches.filter((px) =>
        ["single", "double", "triple", "homerun"].includes(px.outcome)
      );
      const ptHits = {};
      hitPitches.forEach((px) => {
        const _pt = _normPT(px.pitchType) || "?";
        ptHits[_pt] = (ptHits[_pt] || 0) + 1;
      });
      const hotPT = Object.entries(ptHits).sort(
        (a, b) => b[1] - a[1]
      )[0];
      // Swing%
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
        "sacbunt",
        "sacfly",
        "error",
      ];
      const swings = pitches.filter((px) =>
        swingOutcomes.includes(px.outcome)
      ).length;
      const chaseOutcomes = ["strike-swinging", "foul"];
      const ooz = pitches.filter((px) => {
        if (!px.pitchX || !px.pitchY) return false;
        const inZ =
          px.pitchX >= 30 &&
          px.pitchX <= 70 &&
          px.pitchY >= 30 &&
          px.pitchY <= 70;
        return !inZ && chaseOutcomes.includes(px.outcome);
      }).length;
      const oozTotal = pitches.filter((px) => {
        if (!px.pitchX || !px.pitchY) return false;
        return !(
          px.pitchX >= 30 &&
          px.pitchX <= 70 &&
          px.pitchY >= 30 &&
          px.pitchY <= 70
        );
      }).length;

      // AVG by pitch family
      const famStats = {
        fb: { h: 0, ab: 0 },
        br: { h: 0, ab: 0 },
        os: { h: 0, ab: 0 },
      };
      const _AB_END = new Set([
        "single",
        "double",
        "triple",
        "homerun",
        "groundout",
        "flyout",
        "lineout",
        "strikeout-swinging",
        "strikeout-looking",
        "error",
      ]);
      const _HIT_END = new Set([
        "single",
        "double",
        "triple",
        "homerun",
      ]);
      pitches.forEach((px) => {
        const fam = pitchTypeFamily(_normPT(px.pitchType) || "");
        if (!famStats[fam]) return;
        if (_AB_END.has(px.outcome)) {
          famStats[fam].ab++;
          if (_HIT_END.has(px.outcome)) famStats[fam].h++;
        }
      });
      const avgFB = famStats.fb.ab
        ? _scoutAvg(famStats.fb.h, famStats.fb.ab)
        : "—";
      const avgBR = famStats.br.ab
        ? _scoutAvg(famStats.br.h, famStats.br.ab)
        : "—";
      const avgCH = famStats.os.ab
        ? _scoutAvg(famStats.os.h, famStats.os.ab)
        : "—";

      // Spray bar HTML
      const pullW = Math.round((pull / ipTotal) * 100);
      const centW = Math.round((center / ipTotal) * 100);
      const oppoW = 100 - pullW - centW;
      const sprayBar = inPlay.length
        ? `<div class="scout-spray-bar">
      <div class="scout-spray-seg" style="width:${pullW}%;background:#e84a4a;"></div>
      <div class="scout-spray-seg" style="width:${centW}%;background:#aaa;"></div>
      <div class="scout-spray-seg" style="width:${oppoW}%;background:#2d8a3e;"></div>
    </div>
    <div style="font-size:11px;font-weight:700;margin-top:3px;display:flex;gap:6px;">
      <span style="color:#e84a4a;">${pullW}% Pull</span>
      <span style="color:#888;">${centW}% Mid</span>
      <span style="color:#2d8a3e;">${oppoW}% Oppo</span>
    </div>`
        : "—";

      // Dominant direction pill
      const dom =
        pull > oppo && pull > center
          ? "Pull"
          : oppo > center
          ? "Oppo"
          : "Middle";
      const domPill = inPlay.length
        ? `<span class="scout-tendency-pill ${
            dom === "Pull"
              ? "pill-pull"
              : dom === "Oppo"
              ? "pill-oppo"
              : "pill-middle"
          }">${dom}</span>`
        : "";

      // Batted ball type pill
      const domBB = gb > fb && gb > ld ? "GB" : fb > ld ? "FB" : "LD";
      const bbPill = inPlay.length
        ? `<span class="scout-tendency-pill ${
            domBB === "GB"
              ? "pill-gb"
              : domBB === "FB"
              ? "pill-fb"
              : "pill-ld"
          }">${domBB}</span>`
        : "";

      return `<tr>
      <td style="font-weight:700;">${p.name}</td>
      <td class="num">${p.num || "—"}</td>
      <td class="num">${p.pos || "—"}</td>
      <td class="num">${p.hand || "—"}</td>
      <td class="num">${p.ab || 0}</td>
      <td class="num">${_scoutAvg(p.hits, p.ab)}</td>
      <td class="num">${_scoutOBP(p.hits, p.bb, p.hbp, p.pa)}</td>
      <td class="num">${_scoutPct(p.k, p.pa)}</td>
      <td class="num">${_scoutPct(p.bb, p.pa)}</td>
      <td>${sprayBar}</td>
      <td>${domPill} ${bbPill}</td>
      <td class="num">${
        fpPitches.length ? _scoutPct(fpSwings, fpPitches.length) : "—"
      }</td>
      <td class="num">${
        twoStrikePitches.length
          ? _scoutPct(twoStrikeK, twoStrikePitches.length)
          : "—"
      }</td>
      <td class="num">${
        pitches.length ? _scoutPct(swings, pitches.length) : "—"
      }</td>
      <td>${
        hotPT
          ? `<span style="font-size:11px;font-weight:700;">${hotPT[0]}</span> <span style="color:var(--text3);font-size:10px;">(${hotPT[1]}H)</span>`
          : "—"
      }</td>
      <td class="num">${avgFB}</td>
      <td class="num">${avgBR}</td>
      <td class="num">${avgCH}</td>
    </tr>`;
    })
    .join("");

  // Build pitcher tendency rows
  const pitcherRows = pitchers
    .map((p) => {
      const pitches = getPitcherPitches(teamName, p.name, games);
      // Pitch mix
      const ptCount = {};
      pitches.forEach((px) => {
        const _pt = _normPT(px.pitchType) || "?";
        ptCount[_pt] = (ptCount[_pt] || 0) + 1;
      });
      const topPitches = Object.entries(ptCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);
      const mixStr = topPitches
        .map(([t, n]) => `${t} ${_scoutPct(n, pitches.length)}`)
        .join(" · ");
      // First pitch tendency
      const fpPitches = pitches.filter((px) => {
        const c = _ppc(px);
        return c.balls === 0 && c.strikes === 0;
      });
      const fpStrikes = fpPitches.filter((px) =>
        [
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
          "sacbunt",
          "sacfly",
          "error",
        ].includes(px.outcome)
      ).length;
      // 2-strike put-away
      const twoK = pitches.filter((px) => {
        const c = _ppc(px);
        return c.strikes === 2;
      });
      const twoKPtCount = {};
      twoK.forEach((px) => {
        const _pt = _normPT(px.pitchType) || "?";
        twoKPtCount[_pt] = (twoKPtCount[_pt] || 0) + 1;
      });
      const putaway = Object.entries(twoKPtCount).sort(
        (a, b) => b[1] - a[1]
      )[0];
      // Strike% by pitch type
      const ptStr = {};
      pitches.forEach((px) => {
        const _pt = _normPT(px.pitchType) || "?";
        if (!ptStr[_pt]) ptStr[_pt] = { t: 0, s: 0 };
        ptStr[_pt].t++;
        if (_isStrike(px.outcome)) ptStr[_pt].s++;
      });
      const strByPt = Object.entries(ptStr)
        .sort((a, b) => b[1].t - a[1].t)
        .slice(0, 3)
        .map(([t, s]) => `${t} ${((s.s / s.t) * 100).toFixed(0)}%`)
        .join(" · ");
      // Velo range
      const vels = pitches
        .map((px) => parseFloat(px.velocity))
        .filter((v) => !isNaN(v) && v > 0);
      const avgVel = vels.length
        ? (vels.reduce((a, b) => a + b, 0) / vels.length).toFixed(1)
        : "—";
      const maxVel = vels.length ? Math.max(...vels).toFixed(1) : "—";
      // Zone%
      const zoneP = pitches.filter(
        (px) =>
          px.pitchX >= 30 &&
          px.pitchX <= 70 &&
          px.pitchY >= 30 &&
          px.pitchY <= 70
      ).length;

      return `<tr>
      <td style="font-weight:700;">${p.name}</td>
      <td class="num">${p.num || "—"}</td>
      <td class="num">${p.hand || "R"}</td>
      <td class="num">${p.games || 0}</td>
      <td class="num">${p.pitches || 0}</td>
      <td class="num">${avgVel}</td>
      <td class="num">${maxVel}</td>
      <td class="num">${
        pitches.length ? _scoutPct(p.k, p.bf || 1) : "—"
      }</td>
      <td class="num">${
        pitches.length ? _scoutPct(p.bb, p.bf || 1) : "—"
      }</td>
      <td class="num">${
        pitches.length ? _scoutPct(zoneP, pitches.length) : "—"
      }</td>
      <td class="num">${
        fpPitches.length ? _scoutPct(fpStrikes, fpPitches.length) : "—"
      }</td>
      <td>${mixStr || "—"}</td>
      <td>${strByPt || "—"}</td>
      <td>${putaway ? `<strong>${putaway[0]}</strong>` : "—"}</td>
    </tr>`;
    })
    .join("");

  const html = `
    <div class="scout-print-bar">
      <button class="scout-print-btn" onclick="scoutPrint('hitters')">&#9112; Print Hitter Cards</button>
      <button class="scout-print-btn" onclick="scoutPrint('pitchers')">&#9112; Print Pitcher Cards</button>
      <button class="scout-print-btn" onclick="scoutPrint('both')">&#9112; Print Both (Double-Sided)</button>
    </div>
    <div class="scout-card-section" id="scout-hitter-section">
      <div class="scout-card-section-title">Hitter Tendencies — ${teamName}</div>
      ${
        hitters.length
          ? `<div style="overflow-x:auto;"><table class="scout-card-table">
        <thead><tr>
          <th>Player</th>
          <th class="num">#</th>
          <th class="num">POS</th>
          <th class="num">B</th>
          <th class="num">AB</th>
          <th class="num">AVG</th>
          <th class="num">OBP</th>
          <th class="num">K%</th>
          <th class="num">BB%</th>
          <th>Spray (Pull·Ctr·Oppo)</th>
          <th>Profile</th>
          <th class="num">FP Sw%</th>
          <th class="num">2K K%</th>
          <th class="num">Sw%</th>
          <th>Hits Off</th>
          <th class="num">vs FB</th>
          <th class="num">vs BR</th>
          <th class="num">vs CH</th>
        </tr></thead>
        <tbody>${hitterRows}</tbody>
      </table></div>`
          : `<div style="color:var(--text3);font-family:'Barlow Condensed',sans-serif;font-size:13px;">No hitter data.</div>`
      }
    </div>
    <div class="scout-card-section" id="scout-pitcher-section">
      <div class="scout-card-section-title">Pitcher Tendencies — ${teamName}</div>
      ${
        pitchers.length
          ? `<div style="overflow-x:auto;"><table class="scout-card-table">
        <thead><tr>
          <th>Pitcher</th>
          <th class="num">#</th>
          <th class="num">H</th>
          <th class="num">G</th>
          <th class="num">P</th>
          <th class="num">Avg V</th>
          <th class="num">Max V</th>
          <th class="num">K%</th>
          <th class="num">BB%</th>
          <th class="num">Zone%</th>
          <th class="num">FPS%</th>
          <th>Top Pitches</th>
          <th>Str% by Pitch</th>
          <th>2K Putaway</th>
        </tr></thead>
        <tbody>${pitcherRows}</tbody>
      </table></div>`
          : `<div style="color:var(--text3);font-family:'Barlow Condensed',sans-serif;font-size:13px;">No pitcher data.</div>`
      }
    </div>`;

  document.getElementById("scout-overview-content").innerHTML = html;
}

function scoutPrint(which) {
  const printCSS = `
    <style>
      * { box-sizing: border-box; }
      body { font-family: 'Arial Narrow', 'Barlow Condensed', Arial, sans-serif; font-size: 7px; margin: 0; color: #111; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      h1 { font-size: 10px; font-weight: 900; letter-spacing: 0.5px; text-transform: uppercase; margin: 0 0 3px; }
      h2 { font-size: 8px; font-weight: 700; letter-spacing: 0.3px; text-transform: uppercase; margin: 0 0 3px; color: #555; border-bottom: 1px solid #222; padding-bottom: 2px; }
      .page { padding: 6px 8px; page-break-after: always; overflow: hidden; }
      .page:last-child { page-break-after: avoid; }
      table { width: 100%; border-collapse: collapse; font-size: 7px; margin-bottom: 4px; }
      th { background: #333; color: #fff; font-weight: 700; font-size: 6px; letter-spacing: 0; text-transform: uppercase; padding: 1.5px 2px; text-align: left; }
      th.num, td.num { text-align: center; }
      td { padding: 1.5px 2px; border-bottom: 0.5px solid #e0e0e0; vertical-align: middle; font-size: 7px; }
      tr:nth-child(even) td { background: #f9f9f9; }
      .spray-bar { display: flex; height: 5px; border-radius: 2px; overflow: hidden; }
      .pull-seg { background: #e84a4a; height: 100%; }
      .ctr-seg { background: #aaa; height: 100%; }
      .oppo-seg { background: #2d8a3e; height: 100%; }
      .pill { display: inline-block; padding: 0px 2px; border-radius: 4px; font-size: 6px; font-weight: 700; }
      .pill-pull { background: #fde8e8; color: #c03030; }
      .pill-oppo { background: #d4f0db; color: #1e6a2a; }
      .pill-middle { background: #eee; color: #555; }
      .pill-center { background: #eee; color: #555; }
      .pill-gb { background: #d4f0db; color: #1e6a2a; }
      .pill-fb { background: #fde8e8; color: #c03030; }
      .pill-ld { background: #fff8d4; color: #9a7000; }
      .legend { font-size: 6px; color: #888; margin-top: 3px; }
      .legend span { margin-right: 6px; }
      .dsided-note { font-size: 6px; color: #888; text-align: center; margin: 4px 0 0; border-top: 0.5px dashed #ccc; padding-top: 3px; }
    </style>`;

  const teamName = _scoutSelectedTeam;
  if (!teamName) return;
  const games = getTeamGames(teamName);
  const hitters = getTeamRoster(teamName, games)
    .filter((p) => p.pa >= 1)
    .sort((a, b) => (b.ab || 0) - (a.ab || 0));
  const pitchers = getTeamPitchers(teamName, games).sort(
    (a, b) => (b.pitches || 0) - (a.pitches || 0)
  );

  const buildHitterPrintTable = () => {
    const rows = hitters
      .map((p) => {
        const pitches = getPlayerPitches(teamName, p.name, games);
        const inPlay = pitches.filter(
          (px) => px.spray && px.spray.x != null
        );
        let pull = 0,
          center = 0,
          oppo = 0;
        const isLHH = (p.hand || "R").toUpperCase().startsWith("L");
        inPlay.forEach((px) => {
          const angle =
            (Math.atan2(px.spray.x - 280, -(px.spray.y - 468)) * 180) /
            Math.PI;
          if (isLHH) {
            if (angle > 15) pull++;
            else if (angle < -15) oppo++;
            else center++;
          } else {
            if (angle < -15) pull++;
            else if (angle > 15) oppo++;
            else center++;
          }
        });
        const ip = pull + center + oppo || 1;
        const pullW = Math.round((pull / ip) * 100),
          centW = Math.round((center / ip) * 100),
          oppoW = 100 - pullW - centW;
        const gb = inPlay.filter((px) =>
          ["groundball", "weakgrounder"].includes(px.spray.btype)
        ).length;
        const fb = inPlay.filter((px) =>
          ["flyball", "popup"].includes(px.spray.btype)
        ).length;
        const ld = inPlay.filter(
          (px) => px.spray.btype === "linedrive"
        ).length;
        const fpP = pitches.filter((px) => {
          const c = _ppc(px);
          return c.balls === 0 && c.strikes === 0;
        });
        const fpSw = fpP.filter((px) =>
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
            "sacbunt",
            "sacfly",
            "error",
          ].includes(px.outcome)
        ).length;
        const tkP = pitches.filter((px) => {
          const c = _ppc(px);
          return c.strikes === 2;
        });
        const tkK = tkP.filter(
          (px) =>
            px.outcome === "strike-swinging" ||
            px.outcome === "strike-looking"
        ).length;
        const swings = pitches.filter((px) =>
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
            "sacbunt",
            "sacfly",
            "error",
          ].includes(px.outcome)
        ).length;
        const hitP = pitches.filter((px) =>
          ["single", "double", "triple", "homerun"].includes(px.outcome)
        );
        const ptH = {};
        hitP.forEach((px) => {
          const _pt = _normPT(px.pitchType) || "?";
          ptH[_pt] = (ptH[_pt] || 0) + 1;
        });
        const hotPT = Object.entries(ptH).sort(
          (a, b) => b[1] - a[1]
        )[0];
        const dom =
          pull > oppo && pull > center
            ? "Pull"
            : oppo > center
            ? "Oppo"
            : "Middle";
        const domBB = gb > fb && gb > ld ? "GB" : fb > ld ? "FB" : "LD";
        // AVG by pitch family
        const famStatsPr = {
          fb: { h: 0, ab: 0 },
          br: { h: 0, ab: 0 },
          os: { h: 0, ab: 0 },
        };
        const _AB_ENDp = new Set([
          "single",
          "double",
          "triple",
          "homerun",
          "groundout",
          "flyout",
          "lineout",
          "strikeout-swinging",
          "strikeout-looking",
          "error",
        ]);
        const _HIT_ENDp = new Set([
          "single",
          "double",
          "triple",
          "homerun",
        ]);
        pitches.forEach((px) => {
          const fam = pitchTypeFamily(_normPT(px.pitchType) || "");
          if (!famStatsPr[fam]) return;
          if (_AB_ENDp.has(px.outcome)) {
            famStatsPr[fam].ab++;
            if (_HIT_ENDp.has(px.outcome)) famStatsPr[fam].h++;
          }
        });
        const avgFBp = famStatsPr.fb.ab
          ? _scoutAvg(famStatsPr.fb.h, famStatsPr.fb.ab)
          : "—";
        const avgBRp = famStatsPr.br.ab
          ? _scoutAvg(famStatsPr.br.h, famStatsPr.br.ab)
          : "—";
        const avgCHp = famStatsPr.os.ab
          ? _scoutAvg(famStatsPr.os.h, famStatsPr.os.ab)
          : "—";
        return `<tr>
        <td style="font-weight:700;">${p.name}</td>
        <td class="num">${p.num || "—"}</td>
        <td class="num">${p.pos || "—"}</td>
        <td class="num">${p.hand || "—"}</td>
        <td class="num">${p.ab || 0}</td>
        <td class="num">${_scoutAvg(p.hits, p.ab)}</td>
        <td class="num">${_scoutOBP(p.hits, p.bb, p.hbp, p.pa)}</td>
        <td class="num">${_scoutPct(p.k, p.pa)}</td>
        <td class="num">${_scoutPct(p.bb, p.pa)}</td>
        <td>${
          inPlay.length
            ? `<div class="spray-bar"><div class="pull-seg" style="width:${pullW}%"></div><div class="ctr-seg" style="width:${centW}%"></div><div class="oppo-seg" style="width:${oppoW}%"></div></div><div style="font-size:5.5px;margin-top:1px;white-space:nowrap;"><span style="color:#c03030">${pullW}P</span>·<span style="color:#888">${centW}M</span>·<span style="color:#1e6a2a">${oppoW}O</span></div>`
            : "—"
        }</td>
        <td><span class="pill ${
          dom === "Pull"
            ? "pill-pull"
            : dom === "Oppo"
            ? "pill-oppo"
            : "pill-middle"
        }">${dom}</span> <span class="pill ${
          domBB === "GB"
            ? "pill-gb"
            : domBB === "FB"
            ? "pill-fb"
            : "pill-ld"
        }">${domBB}</span></td>
        <td class="num">${
          fpP.length ? _scoutPct(fpSw, fpP.length) : "—"
        }</td>
        <td class="num">${
          tkP.length ? _scoutPct(tkK, tkP.length) : "—"
        }</td>
        <td class="num">${
          pitches.length ? _scoutPct(swings, pitches.length) : "—"
        }</td>
        <td>${hotPT ? `${hotPT[0]} (${hotPT[1]}H)` : "—"}</td>
        <td class="num">${avgFBp}</td>
        <td class="num">${avgBRp}</td>
        <td class="num">${avgCHp}</td>
      </tr>`;
      })
      .join("");
    return `<table>
      <thead><tr>
        <th>Player</th><th class="num">#</th><th class="num">POS</th><th class="num">B</th>
        <th class="num">AB</th><th class="num">AVG</th><th class="num">OBP</th>
        <th class="num">K%</th><th class="num">BB%</th>
        <th>Spray (Pull·Ctr·Oppo)</th><th>Profile</th>
        <th class="num">FP Sw%</th><th class="num">2K K%</th><th class="num">Sw%</th><th>Hits Off</th>
        <th class="num">vs FB</th><th class="num">vs BR</th><th class="num">vs CH</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="legend">
      <span>&#9632; Pull (Red)</span><span>&#9632; Middle (Gray)</span><span>&#9632; Oppo (Green)</span>
      <span>FP Sw% = First Pitch Swing%</span><span>2K K% = K rate with 2 strikes</span>
    </div>`;
  };

  const buildPitcherPrintTable = () => {
    const rows = pitchers
      .map((p) => {
        const pitches = getPitcherPitches(teamName, p.name, games);
        const ptCount = {};
        pitches.forEach((px) => {
          const _pt = _normPT(px.pitchType) || "?";
          ptCount[_pt] = (ptCount[_pt] || 0) + 1;
        });
        const topP = Object.entries(ptCount)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([t, n]) => `${t} ${_scoutPct(n, pitches.length)}`)
          .join(" · ");
        const fpP = pitches.filter((px) => {
          const c = _ppc(px);
          return c.balls === 0 && c.strikes === 0;
        });
        const fpStr = fpP.filter((px) =>
          [
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
            "sacbunt",
            "sacfly",
            "error",
          ].includes(px.outcome)
        ).length;
        const tkP = pitches.filter((px) => {
          const c = _ppc(px);
          return c.strikes === 2;
        });
        const tkPtC = {};
        tkP.forEach((px) => {
          const _pt = _normPT(px.pitchType) || "?";
          tkPtC[_pt] = (tkPtC[_pt] || 0) + 1;
        });
        const putaway = Object.entries(tkPtC).sort(
          (a, b) => b[1] - a[1]
        )[0];
        const vels = pitches
          .map((px) => parseFloat(px.velocity))
          .filter((v) => !isNaN(v) && v > 0);
        const avgV = vels.length
          ? (vels.reduce((a, b) => a + b, 0) / vels.length).toFixed(1)
          : "—";
        const maxV = vels.length ? Math.max(...vels).toFixed(1) : "—";
        const zoneP = pitches.filter(
          (px) =>
            px.pitchX >= 30 &&
            px.pitchX <= 70 &&
            px.pitchY >= 30 &&
            px.pitchY <= 70
        ).length;
        const ptS = {};
        pitches.forEach((px) => {
          const _pt = _normPT(px.pitchType) || "?";
          if (!ptS[_pt]) ptS[_pt] = { t: 0, s: 0 };
          ptS[_pt].t++;
          if (_isStrike(px.outcome)) ptS[_pt].s++;
        });
        const sByPt = Object.entries(ptS)
          .sort((a, b) => b[1].t - a[1].t)
          .slice(0, 3)
          .map(([t, s]) => `${t} ${((s.s / s.t) * 100).toFixed(0)}%`)
          .join(" · ");
        return `<tr>
        <td style="font-weight:700;">${p.name}</td>
        <td class="num">${p.num || "—"}</td>
        <td class="num">${p.hand || "R"}</td>
        <td class="num">${p.games || 0}</td>
        <td class="num">${p.pitches || 0}</td>
        <td class="num">${avgV}</td>
        <td class="num">${maxV}</td>
        <td class="num">${
          pitches.length ? _scoutPct(p.k, p.bf || 1) : "—"
        }</td>
        <td class="num">${
          pitches.length ? _scoutPct(p.bb, p.bf || 1) : "—"
        }</td>
        <td class="num">${
          pitches.length ? _scoutPct(zoneP, pitches.length) : "—"
        }</td>
        <td class="num">${
          fpP.length ? _scoutPct(fpStr, fpP.length) : "—"
        }</td>
        <td>${topP || "—"}</td>
        <td>${sByPt || "—"}</td>
        <td>${putaway ? `<strong>${putaway[0]}</strong>` : "—"}</td>
      </tr>`;
      })
      .join("");
    return `<table>
      <thead><tr>
        <th>Pitcher</th><th class="num">#</th><th class="num">H</th><th class="num">G</th>
        <th class="num">P</th><th class="num">Avg V</th><th class="num">Max V</th>
        <th class="num">K%</th><th class="num">BB%</th><th class="num">Zone%</th>
        <th class="num">FPS%</th><th>Top Pitches</th><th>Str% by Pitch</th><th>2K Putaway</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="legend">
      <span>FPS% = First Pitch Strike%</span><span>Zone% = pitches in strike zone</span><span>Str% = strike rate per pitch type</span><span>2K Putaway = most used pitch with 2 strikes</span>
    </div>`;
  };

  let pages = "";
  if (which === "hitters" || which === "both") {
    pages += `<div class="page">
      <h1>Hitter Scouting Card — ${teamName}</h1>
      ${buildHitterPrintTable()}
      ${
        which === "both"
          ? '<div class="dsided-note">Side 1 of 2 — print double-sided (flip on long edge)</div>'
          : ""
      }
    </div>`;
  }
  if (which === "pitchers" || which === "both") {
    pages += `<div class="page">
      <h1>Pitcher Scouting Card — ${teamName}</h1>
      ${buildPitcherPrintTable()}
      ${
        which === "both"
          ? '<div class="dsided-note">Side 2 of 2</div>'
          : ""
      }
    </div>`;
  }

  const frame = document.getElementById("print-scout-frame");
  frame.innerHTML = printCSS + pages;
  document.body.classList.add("scout-printing");
  setTimeout(() => {
    window.print();
    setTimeout(() => {
      document.body.classList.remove("scout-printing");
      frame.innerHTML = "";
    }, 500);
  }, 100);
}
