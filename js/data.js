// ===== DATA HELPERS =====
function getTeamGames(teamName) {
  return allGames.filter(
    (g) => g.awayTeam === teamName || g.homeTeam === teamName
  );
}

function getTeamRecord(teamName, games) {
  let w = 0,
    l = 0,
    t = 0,
    runs = 0,
    ra = 0,
    h = 0,
    hr = 0;
  games.forEach((g) => {
    const isHome = g.homeTeam === teamName;
    const tf = isHome ? g.homeScore : g.awayScore;
    const ta = isHome ? g.awayScore : g.homeScore;
    if (tf > ta) w++;
    else if (tf < ta) l++;
    else t++;
    runs += tf;
    ra += ta;
    const batters = isHome ? g.homeBatters : g.awayBatters;
    (batters || []).forEach((b) => {
      h += b.hits || 0;
      hr += b.hr || 0;
    });
  });
  return { w, l, t, runs, ra, rd: runs - ra, h, hr };
}

// ── Player identity helpers ───────────────────────────────────────────
// Maps canonical display name → Set of all raw names that merged into it.
// Populated as a side effect of _mergeStatMapByPlayer so that pitch/career
// lookups can find records stored under any historical name variant.
let _nameAliases = {}; // { "Jack Kane": Set(["Kane", "Jack Kane"]), ... }

// Extract the last word (surname) from a name string, lowercased.
function _lastName(name) {
  if (!name) return "";
  return name.trim().split(/\s+/).pop().toLowerCase();
}

// Look up the canonical full name from loaded rosters (myTeam + opponents)
// by matching jersey number + last name. Returns null if not found.
function _canonicalName(name, num) {
  if (!num) return null;
  const last = _lastName(name);
  const numStr = String(num);
  const checkRoster = (roster) =>
    (roster || []).find(
      (r) => String(r.num) === numStr && _lastName(r.name) === last
    );
  const myMatch = checkRoster(myTeamRoster);
  if (myMatch) return myMatch.name;
  for (const opp of _opponents || []) {
    const oppMatch = checkRoster(opp.roster);
    if (oppMatch) return oppMatch.name;
  }
  return null;
}

// After building a raw stat map, merge entries that share last name + jersey #.
// Resolves the canonical full name from loaded rosters when available.
function _mergeStatMapByPlayer(rawMap) {
  const groups = {};
  Object.values(rawMap).forEach((p) => {
    const groupKey = p.num
      ? _lastName(p.name) + "|" + p.num
      : "name|" + p.name; // no number → don't cross-merge
    if (!groups[groupKey]) groups[groupKey] = [];
    groups[groupKey].push(p);
  });

  const result = {};
  Object.entries(groups).forEach(([groupKey, entries]) => {
    const base = { ...entries[0] };
    for (let i = 1; i < entries.length; i++) {
      const e = entries[i];
      Object.keys(base).forEach((k) => {
        if (typeof base[k] === "number") base[k] += e[k] || 0;
      });
    }
    // Prefer roster-sourced canonical name, then longest name among merged entries
    const canonical = _canonicalName(base.name, base.num);
    base.name =
      canonical ||
      entries.reduce((a, b) => (a.name.length >= b.name.length ? a : b))
        .name;
    // Register all raw names under this canonical name so pitch/career
    // lookups can still find records stored under any historical variant.
    const aliasSet = new Set(entries.map((e) => e.name));
    aliasSet.add(base.name);
    _nameAliases[base.name] = aliasSet;
    result[groupKey] = base;
  });
  return result;
}
// ─────────────────────────────────────────────────────────────────────

function getTeamRoster(teamName, games) {
  const playerMap = {};
  games.forEach((g) => {
    const isHome = g.homeTeam === teamName;
    const batters = isHome ? g.homeBatters : g.awayBatters;
    (batters || []).forEach((p) => {
      if (!p.name) return;
      const key = p.name + (p.num || "");
      if (!playerMap[key])
        playerMap[key] = {
          name: p.name,
          num: p.num,
          pos: p.pos,
          hand: p.hand,
          games: 0,
          pa: 0,
          ab: 0,
          hits: 0,
          doubles: 0,
          triples: 0,
          hr: 0,
          bb: 0,
          k: 0,
          hbp: 0,
          ci: 0,
          pitchesSeen: 0,
          r: 0,
          rbi: 0,
          sb: 0,
          cs: 0,
          po: 0,
        };
      const m = playerMap[key];
      const pa =
        p.pa != null
          ? p.pa || 0
          : (p.ab || 0) + (p.bb || 0) + (p.hbp || 0); // backwards compat
      if (pa > 0) m.games++;
      m.pa += pa;
      m.ab += p.ab || 0;
      m.hits += p.hits || 0;
      m.doubles += p.doubles || 0;
      m.triples += p.triples || 0;
      m.hr += p.hr || 0;
      m.bb += p.bb || 0;
      m.k += p.k || 0;
      m.hbp += p.hbp || 0;
      m.ci += p.ci || 0;
      m.pitchesSeen += p.pitchesSeen || 0;
      m.r += p.r || 0;
      m.rbi += p.rbi || 0;
      m.sb += p.sb || 0;
      m.cs += p.cs || 0;
      m.po += p.po || 0;
    });
  });
  const merged = _mergeStatMapByPlayer(playerMap);
  return Object.values(merged).filter((p) => p.pa > 0);
}

function getTeamPitchers(teamName, games) {
  const pitcherMap = {};
  games.forEach((g) => {
    // Pitchers of teamName pitch when the OTHER team bats
    const pitchers =
      g.awayTeam === teamName ? g.awayPitchers : g.homePitchers;
    (pitchers || []).forEach((p) => {
      if (!p.name) return;
      if (!pitcherMap[p.name])
        pitcherMap[p.name] = {
          name: p.name,
          num: p.num,
          hand: p.hand || "R",
          games: 0,
          pitches: 0,
          strikes: 0,
          k: 0,
          bb: 0,
          hits: 0,
          swings: 0,
          looks: 0,
          outs: 0,
          r: 0,
          hbp: 0,
          bf: 0,
        };
      const m = pitcherMap[p.name];
      if (p.pitches > 0) m.games++;
      m.pitches += p.pitches || 0;
      m.strikes += p.strikes || 0;
      m.k += p.k || 0;
      m.bb += p.bb || 0;
      m.hits += p.hits || 0;
      m.swings += p.swings || 0;
      m.looks += p.looks || 0;
      m.outs += p.outs || 0;
      m.r += p.r || 0;
      m.hbp += p.hbp || 0;
      m.bf += p.bf || 0;
    });
  });
  const merged = _mergeStatMapByPlayer(pitcherMap);
  return Object.values(merged).filter((p) => p.pitches > 0);
}

// ── Roster sidebar — shown on player and pitcher detail pages ──────────
function buildRosterSidebar(teamName, currentName, games, type) {
  // type: 'batter' | 'pitcher'
  const players =
    type === "pitcher"
      ? getTeamPitchers(teamName, games)
      : getTeamRoster(teamName, games);

  const viewType = type === "pitcher" ? "pitcher" : "player";

  const items = players
    .map((p) => {
      const isCurrent = p.name === currentName;
      const meta =
        type === "pitcher"
          ? `${p.games}G · ${p.pitches}P · ${p.k}K`
          : `${p.games}G · ${
              p.ab > 0 ? _fmtRate(p.hits / p.ab) : ".---"
            }`;
      return `<button
      onclick="showView('${viewType}',JSON.stringify({team:'${escAttr(
        teamName
      )}',name:'${escAttr(p.name)}'}),true)"
      style="width:100%;display:flex;align-items:center;gap:8px;padding:7px 10px;background:${
isCurrent ? "rgba(204,26,26,.07)" : "transparent"
      };border:none;border-left:3px solid ${
        isCurrent ? "var(--accent)" : "transparent"
      };border-radius:0;cursor:pointer;text-align:left;transition:all .13s"
      onmouseover="if(!${isCurrent})this.style.background='var(--surface2)'"
      onmouseout="if(!${isCurrent})this.style.background='transparent'">
      <div style="width:26px;height:26px;border-radius:50%;background:${
isCurrent ? "var(--accent)" : "var(--surface3)"
      };display:flex;align-items:center;justify-content:center;flex-shrink:0">
<span style="font-family:'Share Tech Mono',monospace;font-size:9px;font-weight:700;color:${
  isCurrent ? "#fff" : "var(--text3)"
}">${escHtml(p.num || "?")}</span>
      </div>
      <div style="min-width:0;flex:1">
<div style="font-family:'Barlow Condensed',sans-serif;font-weight:${
  isCurrent ? "800" : "600"
};font-size:13px;color:${
        isCurrent ? "var(--accent)" : "var(--text)"
      };white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(
        p.name
      )}</div>
<div style="font-size:10px;color:var(--text3)">${meta}</div>
      </div>
    </button>`;
    })
    .join("");

  const pills = players
    .map((p) => {
      const isCurrent = p.name === currentName;
      return `<button
      onclick="showView('${viewType}',JSON.stringify({team:'${escAttr(
        teamName
      )}',name:'${escAttr(p.name)}'}),true)"
      style="display:inline-flex;align-items:center;gap:5px;padding:6px 10px;background:${
isCurrent ? "var(--accent)" : "var(--surface2)"
      };border:1.5px solid ${
        isCurrent ? "var(--accent)" : "var(--border)"
      };border-radius:20px;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation;flex-shrink:0">
      <span style="font-family:'Share Tech Mono',monospace;font-size:9px;font-weight:700;color:${
isCurrent ? "#fff" : "var(--text3)"
      }">#${escHtml(p.num || "?")}</span>
      <span style="font-family:'Barlow Condensed',sans-serif;font-weight:${
isCurrent ? "800" : "600"
      };font-size:12px;color:${
        isCurrent ? "#fff" : "var(--text)"
      };max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(
        p.name.split(" ").pop()
      )}</span>
    </button>`;
    })
    .join("");

  const mobilePills = `<div class="hub-mob-player-nav">
    <div style="font-size:8px;letter-spacing:2px;color:var(--text3);text-transform:uppercase;font-weight:700;margin-bottom:8px">${escHtml(
      teamName
    )} · ${type === "pitcher" ? "Pitchers" : "Batters"}</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px">${
      pills ||
      '<span style="font-size:12px;color:var(--text3)">No players</span>'
    }</div>
  </div>`;

  const sidebar = `<div class="hub-roster-sidebar" style="width:200px;flex-shrink:0;background:var(--surface);border-left:1px solid var(--border);margin:-20px -24px -20px 24px;padding-top:14px;overflow-y:auto;max-height:calc(100vh - 88px);position:sticky;top:0;align-self:flex-start">
    <div style="font-size:8px;letter-spacing:2px;color:var(--text3);text-transform:uppercase;font-weight:700;padding:0 10px 8px;border-bottom:1px solid var(--border)">${escHtml(
      teamName
    )} · ${type === "pitcher" ? "Pitchers" : "Batters"}</div>
    ${
      items ||
      '<div style="padding:12px;font-size:12px;color:var(--text3)">No players</div>'
    }
  </div>`;

  return { sidebar, mobilePills };
}

function getPlayerCareerStats(teamName, playerName, games) {
  const base = {
    name: playerName,
    num: "—",
    pos: "—",
    hand: "R",
    games: 0,
    pa: 0,
    ab: 0,
    hits: 0,
    doubles: 0,
    triples: 0,
    hr: 0,
    bb: 0,
    k: 0,
    hbp: 0,
    ci: 0,
    pitchesSeen: 0,
    sb: 0,
    cs: 0,
    po: 0,
    r: 0,
    rbi: 0,
  };
  const names = _nameAliases[playerName] || new Set([playerName]);
  games.forEach((g) => {
    const isHome = g.homeTeam === teamName;
    const batters = isHome ? g.homeBatters : g.awayBatters;
    const p = batters?.find((b) => names.has(b.name));
    if (!p) return;
    base.num = p.num || base.num;
    base.pos = p.pos || base.pos;
    base.hand = p.hand || base.hand;
    const pa =
      p.pa != null
        ? p.pa || 0
        : (p.ab || 0) + (p.bb || 0) + (p.hbp || 0);
    if (pa > 0) base.games++;
    base.pa += pa;
    base.ab += p.ab || 0;
    base.hits += p.hits || 0;
    base.doubles += p.doubles || 0;
    base.triples += p.triples || 0;
    base.hr += p.hr || 0;
    base.bb += p.bb || 0;
    base.k += p.k || 0;
    base.hbp += p.hbp || 0;
    base.ci += p.ci || 0;
    base.pitchesSeen += p.pitchesSeen || 0;
    base.sb += p.sb || 0;
    base.cs += p.cs || 0;
    base.po += p.po || 0;
    base.r += p.r || 0;
    base.rbi += p.rbi || 0;
  });
  return base;
}

function buildBaserunningTab(stats, games, teamName, playerName) {
  const sb = stats.sb || 0,
    cs = stats.cs || 0,
    po = stats.po || 0,
    r = stats.r || 0,
    rbi = stats.rbi || 0;
  const att = sb + cs;
  const sbPct = att > 0 ? Math.round((sb / att) * 100) + "%" : "—";

  // Count extra base advances from game log (runner advances tagged to this player)
  let xba = 0,
    wpAdv = 0,
    pbAdv = 0,
    errAdv = 0;
  games.forEach((g) => {
    (g.gameLog || []).forEach((e) => {
      const txt = (e.title || "") + (e.detail || "");
      if (!txt.includes(playerName)) return;
      if (txt.includes("Wild Pitch") && txt.includes("→")) wpAdv++;
      if (txt.includes("Passed Ball") && txt.includes("→")) pbAdv++;
      if (txt.includes("Advances on Error") && txt.includes("→"))
        errAdv++;
    });
  });

  // Fielding stats
  let fPO = 0,
    fA = 0,
    fE = 0;
  games.forEach((g) => {
    Object.values(g.fieldingStats || {}).forEach((f) => {
      if (
        f.name === playerName &&
        (g.awayTeam === teamName || g.homeTeam === teamName)
      ) {
        fPO += f.po || 0;
        fA += f.a || 0;
        fE += f.e || 0;
      }
    });
  });
  const tc = fPO + fA + fE;
  const fpct = tc > 0 ? _fmtRate((fPO + fA) / tc) : "—";

  const card = (val, lbl, accent = false) =>
    `<div class="stat-card${
      accent ? " accent" : ""
    }"><div class="stat-card-val">${val}</div><div class="stat-card-lbl">${lbl}</div></div>`;

  return `
    <div>
      <div class="section-title" style="margin-bottom:12px">Baserunning</div>
      <div class="stat-cards">
${card(r, "Runs Scored", true)}
${card(rbi, "RBI")}
${card(sb, "SB", true)}
${card(cs, "CS")}
${card(att, "SB Att")}
${card(sbPct, "SB%")}
${card(po, "Picked Off")}
${card(wpAdv, "WP Advances")}
${card(pbAdv, "PB Advances")}
${card(errAdv, "Error Advances")}
      </div>
    </div>`;
}

function buildDefenseTab(stats, games, teamName, playerName) {
  const aliases = _nameAliases[playerName] || new Set([playerName]);
  let fPO = 0,
    fA = 0,
    fE = 0;
  games.forEach((g) => {
    Object.values(g.fieldingStats || {}).forEach((f) => {
      if (
        aliases.has(f.name) &&
        (g.awayTeam === teamName || g.homeTeam === teamName)
      ) {
        fPO += f.po || 0;
        fA += f.a || 0;
        fE += f.e || 0;
      }
    });
  });
  const tc = fPO + fA + fE;
  const fpct = tc > 0 ? _fmtRate((fPO + fA) / tc) : "—";

  const card = (val, lbl, accent = false) =>
    `<div class="stat-card${
      accent ? " accent" : ""
    }"><div class="stat-card-val">${val}</div><div class="stat-card-lbl">${lbl}</div></div>`;

  return `
    <div>
      <div class="section-title" style="margin-bottom:12px">Defense</div>
      <div class="stat-cards">
${card(fPO, "Putouts", true)}
${card(fA, "Assists")}
${card(fE, "Errors")}
${card(tc, "Tot. Chances")}
${card(fpct, "FPCT")}
      </div>
    </div>`;
}

function aggregateBattersFromGame(batters) {
  return (batters || [])
    .filter((b) => (b.pa || 0) > 0)
    .map((b) => ({ ...b, games: 1 }));
}
function aggregatePitchersFromGame(pitchers) {
  return (pitchers || [])
    .filter((p) => p.pitches > 0)
    .map((p) => ({ ...p, games: 1 }));
}

// ===== PITCHER DETAIL VIEW =====
function renderPitcher(teamName, pitcherName) {
  try {
    const _allTeamGames = getTeamGames(teamName);
    const games = _recentFilter
      ? (() => {
          const names =
            _nameAliases[pitcherName] || new Set([pitcherName]);
          return [..._allTeamGames]
            .sort((a, b) => b.date.localeCompare(a.date))
            .filter((g) =>
              (g.pitchLog || []).some((p) => {
                const pt =
                  p.isTop !== undefined
                    ? p.isTop
                      ? g.homeTeam
                      : g.awayTeam
                    : p.pitcherTeam;
                return pt === teamName && names.has(p.pitcher);
              })
            )
            .slice(0, 3);
        })()
      : _allTeamGames;
    const allPitches = getPitcherPitches(teamName, pitcherName, games);

    let career = {
      num: "—",
      hand: "R",
      games: 0,
      pitches: 0,
      strikes: 0,
      k: 0,
      bb: 0,
      hits: 0,
      swings: 0,
      looks: 0,
      outs: 0,
      r: 0,
      hbp: 0,
      bf: 0,
    };
    games.forEach((g) => {
      const pitchers =
        g.awayTeam === teamName ? g.awayPitchers : g.homePitchers;
      const _pNamesCareer =
        _nameAliases[pitcherName] || new Set([pitcherName]);
      const p = (pitchers || []).find((x) => _pNamesCareer.has(x.name));
      if (!p || !p.pitches) return;
      career.num = p.num || career.num;
      career.hand = p.hand || career.hand;
      career.games++;
      career.pitches += p.pitches || 0;
      career.strikes += p.strikes || 0;
      career.k += p.k || 0;
      career.bb += p.bb || 0;
      career.hits += p.hits || 0;
      career.swings += p.swings || 0;
      career.looks += p.looks || 0;
      career.outs += p.outs || 0;
      career.r += p.r || 0;
      career.hbp += p.hbp || 0;
      career.bf += p.bf || 0;
    });

    const kbb =
      career.bb > 0
        ? (career.k / career.bb).toFixed(2)
        : career.k > 0
        ? "∞"
        : "—";
    const vels = allPitches
      .map((p) => parseFloat(p.velocity))
      .filter((v) => !isNaN(v) && v > 0);
    const avgVel = vels.length
      ? (vels.reduce((a, b) => a + b, 0) / vels.length).toFixed(1)
      : "—";
    const maxVel = vels.length ? Math.max(...vels) : "—";
    // Use pitch log as ground truth for all rate stats
    const logTotal = allPitches.length;
    const logStrikes = allPitches.filter((p) =>
      _isStrike(p.outcome)
    ).length;
    const logSwings = allPitches.filter((p) =>
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
    const logLooks = allPitches.filter(
      (p) => p.outcome === "strike-looking"
    ).length;
    const logHBP = allPitches.filter((p) => p.outcome === "hbp").length;
    const sp =
      logTotal > 0 ? Math.round((logStrikes / logTotal) * 100) : 0;
    const swp =
      logTotal > 0 ? Math.round((logSwings / logTotal) * 100) : 0;
    const lkp =
      logTotal > 0 ? Math.round((logLooks / logTotal) * 100) : 0;
    const fpPitches = allPitches.filter((p) => _isFirstPitch(p));
    const fpsPct =
      fpPitches.length > 0
        ? Math.round(
            (fpPitches.filter((p) => _isStrike(p.outcome)).length /
              fpPitches.length) *
              100
          )
        : null;

    const c = document.getElementById("hub-content");
    const _pitcherSidebar = buildRosterSidebar(
      teamName,
      pitcherName,
      games,
      "pitcher"
    );
    c.innerHTML = `<div style="display:flex;gap:0;align-items:flex-start;min-height:100%"><div style="flex:1;min-width:0">
    <div class="breadcrumb">
      <a data-team="${escAttr(
teamName
      )}" onclick="showView('team',this.getAttribute('data-team'))" style="cursor:pointer">← ${escHtml(
      teamName
    )}</a>
      <span class="breadcrumb-sep">/</span><span>${escHtml(pitcherName)}</span>
    </div>
    <div class="player-detail-header">
      <div class="player-number">#${career.num || "—"}</div>
      <div>
<div class="player-info-name">${escHtml(pitcherName)}</div>
<div class="player-info-meta">Pitcher · ${escHtml(teamName)} · ${
      career.games
    } game${career.games !== 1 ? "s" : ""} · ${
      career.pitches
    } pitches · ${allPitches.length} logged</div>
      </div>
      <div style="margin-left:auto;display:flex;gap:14px;align-items:center;flex-wrap:wrap">
<div style="text-align:center"><div style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:28px;color:var(--accent)">${
  career.k
}</div><div style="font-size:9px;letter-spacing:2px;color:var(--text3);text-transform:uppercase">K</div></div>
<div style="text-align:center"><div style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:28px">${
  career.bb
}</div><div style="font-size:9px;letter-spacing:2px;color:var(--text3);text-transform:uppercase">BB</div></div>
<div style="text-align:center"><div style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:28px">${sp}%</div><div style="font-size:9px;letter-spacing:2px;color:var(--text3);text-transform:uppercase">Str%</div></div>
<div style="text-align:center"><div style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:28px">${
  fpsPct !== null ? fpsPct + "%" : "—"
}</div><div style="font-size:9px;letter-spacing:2px;color:var(--text3);text-transform:uppercase">FPS%</div></div>
<div style="text-align:center"><div style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:28px;color:var(--green)">${kbb}</div><div style="font-size:9px;letter-spacing:2px;color:var(--text3);text-transform:uppercase">K/BB</div></div>
<div style="text-align:center"><div style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:28px;color:var(--blue)">${avgVel}</div><div style="font-size:9px;letter-spacing:2px;color:var(--text3);text-transform:uppercase">Avg MPH</div></div>
      </div>
    </div>
    <div class="stat-cards">
      <div class="stat-card accent"><div class="stat-card-val">${(function () {
const f = Math.floor((career.outs || 0) / 3),
  r = (career.outs || 0) % 3;
return (career.outs || 0) > 0
  ? r === 0
    ? f + ".0"
    : f + "." + r
  : "0.0";
      })()}</div><div class="stat-card-lbl">IP</div></div>
      <div class="stat-card"><div class="stat-card-val">${
career.bf || 0
      }</div><div class="stat-card-lbl">BF</div></div>
      <div class="stat-card"><div class="stat-card-val">${
career.pitches
      }</div><div class="stat-card-lbl">Pitches</div></div>
      <div class="stat-card"><div class="stat-card-val">${sp}%</div><div class="stat-card-lbl">Strike%</div></div>
      <div class="stat-card"><div class="stat-card-val">${
fpsPct !== null ? fpsPct + "%" : "—"
      }</div><div class="stat-card-lbl">FPS%</div></div>
      <div class="stat-card"><div class="stat-card-val">${
career.k
      }</div><div class="stat-card-lbl">Strikeouts</div></div>
      <div class="stat-card"><div class="stat-card-val">${
career.bb
      }</div><div class="stat-card-lbl">Walks</div></div>
      <div class="stat-card"><div class="stat-card-val">${
career.hits
      }</div><div class="stat-card-lbl">Hits Allowed</div></div>
      <div class="stat-card"><div class="stat-card-val">${
career.r || 0
      }</div><div class="stat-card-lbl">Runs Allowed</div></div>
      <div class="stat-card"><div class="stat-card-val">${
career.hbp || 0
      }</div><div class="stat-card-lbl">HBP</div></div>
      <div class="stat-card"><div class="stat-card-val">${kbb}</div><div class="stat-card-lbl">K/BB</div></div>
      <div class="stat-card"><div class="stat-card-val">${swp}%</div><div class="stat-card-lbl">Swing%</div></div>
      <div class="stat-card"><div class="stat-card-val">${lkp}%</div><div class="stat-card-lbl">Called K%</div></div>
      <div class="stat-card"><div class="stat-card-val">${avgVel}</div><div class="stat-card-lbl">Avg Velo</div></div>
      <div class="stat-card"><div class="stat-card-val">${maxVel}</div><div class="stat-card-lbl">Max Velo</div></div>
    </div>

    <div class="section-title" style="margin:14px 0 8px">Traditional Stats</div>
    <div class="stat-cards" style="margin-bottom:14px">
      ${(function () {
const ip = career.outs || 0;
const ipFull = ip / 3;
const ipDisplay = ip > 0 ? Math.floor(ipFull) + "." + (ip % 3) : "0.0";
const era = ip > 0 ? (((career.r || 0) / ipFull) * 9).toFixed(2) : "—";
const whip =
  ip > 0
    ? (((career.bb || 0) + (career.hits || 0)) / ipFull).toFixed(2)
    : "—";
const ab = (career.bf || 0) - (career.bb || 0) - (career.hbp || 0);
const avgAgainst = ab > 0 ? _fmtRate((career.hits || 0) / ab) : ".---";
const obpAgainst =
  (career.bf || 0) > 0
    ? _fmtRate(
        ((career.hits || 0) + (career.bb || 0) + (career.hbp || 0)) /
          career.bf
      )
    : ".---";
const k9 = ip > 0 ? (((career.k || 0) / ipFull) * 9).toFixed(1) : "—";
const bb9 = ip > 0 ? (((career.bb || 0) / ipFull) * 9).toFixed(1) : "—";
const kPct =
  (career.bf || 0) > 0
    ? Math.round(((career.k || 0) / career.bf) * 100) + "%"
    : "—";
const bbPct =
  (career.bf || 0) > 0
    ? Math.round(((career.bb || 0) / career.bf) * 100) + "%"
    : "—";
const card = (val, lbl, accent) =>
  `<div class="stat-card${
    accent ? " accent" : ""
  }"><div class="stat-card-val">${val}</div><div class="stat-card-lbl">${lbl}</div></div>`;
return (
  card(era, "ERA", true) +
  card(whip, "WHIP", true) +
  card(avgAgainst, "AVG Against") +
  card(obpAgainst, "OBP Against") +
  card(k9, "K/9") +
  card(bb9, "BB/9") +
  card(kPct, "K%") +
  card(bbPct, "BB%")
);
      })()}
    </div>

    <div class="scout-print-hide" style="display:flex;justify-content:flex-end;align-items:center;gap:10px;margin-bottom:8px">
      ${
_recentFilter
  ? `<span style="font-family:'Barlow Condensed',sans-serif;font-size:11px;letter-spacing:1px;color:var(--text3);text-transform:uppercase">Showing last 3 appearances</span>`
  : ""
      }
      <button class="recent-filter-btn${
_recentFilter ? " rfb-active" : ""
      }" onclick="toggleRecentFilter()">
${_recentFilter ? "⏱ Last 3 Games" : "⏱ Filter Recent"}
      </button>
    </div>
    <div class="tab-row" id="pitcher-tab-row">
      <div class="tab active" onclick="pitcherTab('zone')">Pitch Zone</div>
      <div class="tab" onclick="pitcherTab('mix')">Pitch Mix</div>
      <div class="tab" onclick="pitcherTab('stats')">Stats</div>
      <div class="tab" onclick="pitcherTab('splits')">Pitch Splits</div>
      <div class="tab" onclick="pitcherTab('gamelog')">Game Log</div>
      <div class="tab" onclick="pitcherTab('scouting')">Scouting Report</div>
    </div>

    <div id="ptab-p-zone">
      <div style="display:grid;grid-template-columns:340px 1fr;gap:20px;align-items:start">
<div>
  <div class="section-title" style="margin-bottom:8px">Pitch Locations · <span id="pitcher-zone-count">${
    allPitches.length
  } pitches logged</span></div>
  ${buildPitchTypeFilterBar(allPitches, "pitcher-zone-wrap")}
  ${buildOutcomeFilterBar(allPitches, "pitcher-zone-wrap")}
  <div id="pitcher-zone-wrap">
    ${buildPitchZoneSVG(allPitches, 320, 290)}
  </div>
  ${pitchZoneLegend()}
</div>
<div>
  <div class="section-title" style="margin-bottom:8px">Zone Command</div>
  ${buildZoneTendenciesFiltered(allPitches, "pitcher-zt")}
  <div style="margin-top:16px">
    <div class="section-title" style="margin-bottom:8px">Hot / Cold Zone</div>
    ${buildHotColdZoneFiltered(allPitches, "pitcher", "pitcher-hcz")}
  </div>
</div>
      </div>
    </div>

    <div id="ptab-p-mix" style="display:none">
      ${buildPitchMixTab(allPitches)}
    </div>

    <div id="ptab-p-stats" style="display:none">
      ${buildPitcherStatsTab(teamName, pitcherName, games, allPitches, career)}
    </div>

    <div id="ptab-p-splits" style="display:none">
      ${buildPitcherSplitsTab(teamName, pitcherName, games, allPitches)}
    </div>

    <div id="ptab-p-gamelog" style="display:none">
      <div class="section-title" style="margin-bottom:10px">Game Log</div>
      ${buildPitcherGameLog(teamName, pitcherName, games)}
    </div>

    <div id="ptab-p-scouting" style="display:none">
      <div style="display:flex;gap:8px;margin-bottom:14px" class="scout-print-hide">
<button onclick="printPlayerScoutReport('${escAttr(
  teamName
)}','${escAttr(
      pitcherName
    )}','pitcher')" style="padding:7px 18px;background:var(--accent);border:none;border-radius:7px;color:#fff;font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:14px;letter-spacing:1px;cursor:pointer;display:flex;align-items:center;gap:7px">🖨 Print Report</button>
      </div>
      <div id="ptab-p-scouting-content">${buildPitcherScoutingReport(
teamName,
pitcherName,
games
      )}</div>
    </div>
  ${_pitcherSidebar.mobilePills}</div>${_pitcherSidebar.sidebar}</div>`;
  } catch (e) {
    console.error("renderPitcher crashed:", e);
    document.getElementById("hub-content").innerHTML =
      '<div class="empty-state">Error: ' +
      escHtml(e.message) +
      "</div>";
  }
}
function pitcherTab(tab) {
  _lastPitcherTab = tab;
  document.querySelectorAll("#pitcher-tab-row .tab").forEach((t, i) => {
    const tabs = [
      "zone",
      "mix",
      "stats",
      "splits",
      "gamelog",
      "scouting",
    ];
    t.classList.toggle("active", tabs[i] === tab);
  });
  ["zone", "mix", "stats", "splits", "gamelog", "scouting"].forEach(
    (t) => {
      const el = document.getElementById("ptab-p-" + t);
      if (el) el.style.display = t === tab ? "block" : "none";
    }
  );
  if (tab === "zone")
    setTimeout(() => selectAllPitchTypes("pitcher-zone-wrap"), 0);
  // Push URL with tab sub-path
  if (typeof _ptPushDeepRoute === "function" && currentView && currentView.type === "pitcher")
    _ptPushDeepRoute("pitcher", currentView.data, tab);
}

function buildPitcherSplitsTab(
  teamName,
  pitcherName,
  games,
  allPitches
) {
  if (!allPitches.length)
    return '<div class="empty-state">No pitch data logged yet.</div>';

  // Attach game context (home/away, gameId) to each pitch
  // allPitches is already alias-resolved via getPitcherPitches(); build a
  // game-context lookup map so we can attach _isHome without re-filtering.
  const _gameCtxMap = {};
  games.forEach((g) => {
    _gameCtxMap[g.id] = {
      isHome: g.homeTeam === teamName,
      date: g.date,
    };
  });
  const pitches = allPitches.map((p) => {
    const ctx = _gameCtxMap[p.gameId] || {};
    return {
      ...p,
      _isHome: ctx.isHome,
      _gameId: p.gameId,
      _gameDate: ctx.date || p.gameDate,
    };
  });
  if (!pitches.length)
    return '<div class="empty-state">No pitch data logged yet.</div>';

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

  function _pRow(label, subset) {
    if (!subset.length)
      return `<tr><td style="font-weight:500;color:var(--text2)">${label}</td><td colspan="6" style="color:var(--text3)">—</td></tr>`;
    const n = subset.length;
    const strikes = subset.filter((p) => _isStrike(p.outcome)).length;
    const inZone = subset.filter(
      (p) =>
        p.pitchX != null &&
        p.pitchX >= 31 &&
        p.pitchX <= 69 &&
        p.pitchY != null &&
        p.pitchY >= 30.9 &&
        p.pitchY <= 69.1
    ).length;
    const swings = subset.filter((p) =>
      swingOutcomes.includes(p.outcome)
    ).length;
    const whiffs = subset.filter(
      (p) => p.outcome === "strike-swinging"
    ).length;
    const fps = subset.filter((p) => _isFirstPitch(p));
    const fpStr = fps.filter((p) => _isStrike(p.outcome)).length;
    const sp = Math.round((strikes / n) * 100);
    const zp = Math.round((inZone / n) * 100);
    const swp = Math.round((swings / n) * 100);
    const whp = swings > 0 ? Math.round((whiffs / swings) * 100) : 0;
    const fpsp =
      fps.length > 0 ? Math.round((fpStr / fps.length) * 100) : null;
    const spColor =
      sp >= 65
        ? "color:var(--green);font-weight:800"
        : sp < 52
        ? "color:var(--red);font-weight:800"
        : "";
    return `<tr>
      <td style="font-weight:500;color:var(--text2)">${label}</td>
      <td>${n}</td>
      <td style="${spColor}">${sp}%</td>
      <td>${zp}%</td>
      <td>${swp}%</td>
      <td>${whp}%</td>
      <td style="color:var(--text3)">${
        fpsp !== null ? fpsp + "%" : "—"
      }</td>
    </tr>`;
  }

  function _pTable(rows, title) {
    return `<div style="margin-bottom:28px">
      <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:9px;letter-spacing:3px;text-transform:uppercase;color:var(--text3);margin-bottom:8px">${title}</div>
      <div style="overflow-x:auto">
      <table class="data-table" style="min-width:500px">
        <thead><tr>
          <th style="text-align:left;min-width:160px">Split</th>
          <th>P</th><th>Str%</th><th>Zone%</th><th>Swing%</th><th>Whiff%</th><th>FPS%</th>
        </tr></thead>
        <tbody>${rows.join("")}</tbody>
      </table></div>
    </div>`;
  }

  // Home / Away
  const homeAwayRows = [
    _pRow(
      "Home",
      pitches.filter((p) => p._isHome)
    ),
    _pRow(
      "Away",
      pitches.filter((p) => !p._isHome)
    ),
  ];

  // Runners on base
  const runnersRows = [
    _pRow(
      "Bases Empty",
      pitches.filter(
        (p) =>
          p.runnersOn &&
          !p.runnersOn["1st"] &&
          !p.runnersOn["2nd"] &&
          !p.runnersOn["3rd"]
      )
    ),
    _pRow(
      "Runners On",
      pitches.filter(
        (p) =>
          p.runnersOn &&
          (p.runnersOn["1st"] ||
            p.runnersOn["2nd"] ||
            p.runnersOn["3rd"])
      )
    ),
    _pRow(
      "RISP",
      pitches.filter(
        (p) => p.runnersOn && (p.runnersOn["2nd"] || p.runnersOn["3rd"])
      )
    ),
    _pRow(
      "Bases Loaded",
      pitches.filter(
        (p) =>
          p.runnersOn &&
          p.runnersOn["1st"] &&
          p.runnersOn["2nd"] &&
          p.runnersOn["3rd"]
      )
    ),
  ];

  // Outs in inning
  const outsRows = [
    _pRow(
      "0 Outs",
      pitches.filter((p) => p.outs === 0)
    ),
    _pRow(
      "1 Out",
      pitches.filter((p) => p.outs === 1)
    ),
    _pRow(
      "2 Outs",
      pitches.filter((p) => p.outs === 2)
    ),
  ];

  // Count splits — every individual count with ≥1 pitch, plus key grouped counts
  const _allCounts = [
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
  const countRows = [
    _pRow(
      "First Pitch (0-0)",
      pitches.filter((p) => {
        const c = _ppc(p);
        return c.balls === 0 && c.strikes === 0;
      })
    ),
    _pRow(
      "Ahead in Count",
      pitches.filter((p) => {
        const c = _ppc(p);
        return c.strikes > c.balls;
      })
    ),
    _pRow(
      "Even Count (excl. 0-0)",
      pitches.filter((p) => {
        const c = _ppc(p);
        return (
          c.balls === c.strikes && !(c.balls === 0 && c.strikes === 0)
        );
      })
    ),
    _pRow(
      "Behind in Count",
      pitches.filter((p) => {
        const c = _ppc(p);
        return c.balls > c.strikes;
      })
    ),
    _pRow(
      "2-Strike",
      pitches.filter((p) => _ppc(p).strikes === 2)
    ),
    _pRow(
      "2-Strike (not full)",
      pitches.filter((p) => {
        const c = _ppc(p);
        return c.strikes === 2 && c.balls < 3;
      })
    ),
    _pRow(
      "Full Count (3-2)",
      pitches.filter((p) => {
        const c = _ppc(p);
        return c.balls === 3 && c.strikes === 2;
      })
    ),
  ];
  const individualCountRows = _allCounts
    .map(([b, s]) => {
      const subset = pitches.filter((p) => {
        const c = _ppc(p);
        return c.balls === b && c.strikes === s;
      });
      return subset.length >= 1 ? _pRow(`${b}-${s}`, subset) : null;
    })
    .filter(Boolean);

  // By inning
  const innings = [
    ...new Set(pitches.map((p) => p.inning).filter((x) => x != null)),
  ].sort((a, b) => a - b);
  const inningRows = innings.map((i) =>
    _pRow(
      `Inning ${i}`,
      pitches.filter((p) => p.inning === i)
    )
  );

  // Recent games
  const sortedGames = games
    .filter((g) => pitches.some((p) => p._gameId === g.id))
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const recentIds5 = sortedGames.slice(-5).map((g) => g.id);
  const recentIds10 = sortedGames.slice(-10).map((g) => g.id);
  const recentRows = [
    _pRow(
      "Last 5 Games",
      pitches.filter((p) => recentIds5.includes(p._gameId))
    ),
    _pRow(
      "Last 10 Games",
      pitches.filter((p) => recentIds10.includes(p._gameId))
    ),
  ];

  // By month
  const byMonth = {};
  pitches.forEach((p) => {
    if (!p._gameDate) return;
    const m = p._gameDate.slice(0, 7);
    if (!byMonth[m]) byMonth[m] = [];
    byMonth[m].push(p);
  });
  const monthKeys = Object.keys(byMonth).sort();
  const monthRows =
    monthKeys.length > 1
      ? monthKeys.map((m) => {
          const d = new Date(m + "-02");
          const lbl = d.toLocaleString("default", {
            month: "long",
            year: "numeric",
          });
          return _pRow(lbl, byMonth[m]);
        })
      : [];

  // By pitch type (outcome splits)
  const typeSet = [
    ...new Set(
      pitches.map((p) =>
        p.pitchType && p.pitchType !== "—" ? p.pitchType : "UNKN"
      )
    ),
  ].sort();
  const typeRows = typeSet.map((t) =>
    _pRow(
      t,
      pitches.filter(
        (p) =>
          (p.pitchType && p.pitchType !== "—"
            ? p.pitchType
            : "UNKN") === t
      )
    )
  );

  // vs Batter Handedness (requires batterHand in pitch log)
  const handPitches = pitches.filter(
    (p) => p.batterHand === "R" || p.batterHand === "L"
  );
  const handRows = [
    _pRow(
      "vs RHB",
      pitches.filter((p) => p.batterHand === "R")
    ),
    _pRow(
      "vs LHB",
      pitches.filter((p) => p.batterHand === "L")
    ),
  ];
  const handNote = !handPitches.length
    ? `<div style="font-size:10px;color:var(--text3);font-style:italic;margin-top:4px">Batter handedness tracked starting from newly recorded games</div>`
    : "";

  // Times Through Order (TTO) — computed from pitcher-team pitch sequence per game
  // pitchLog was unshifted (newest first) so reverse per-game to get chronological order
  const _pitchesByGame = {};
  pitches.forEach((p, i) => {
    if (!_pitchesByGame[p._gameId]) _pitchesByGame[p._gameId] = [];
    _pitchesByGame[p._gameId].push({ p, i });
  });
  Object.values(_pitchesByGame).forEach((entries) => {
    const ordered = [...entries].reverse();
    const appearances = {};
    let prevBatterIdx = null;
    ordered.forEach(({ p, i }) => {
      const bi = p.batterIdx;
      if (bi !== prevBatterIdx) {
        appearances[bi] = (appearances[bi] || 0) + 1;
        prevBatterIdx = bi;
      }
      pitches[i]._tto = appearances[bi] || 1;
    });
  });
  const ttoRows = [
    _pRow(
      "1st Time Through",
      pitches.filter((p) => p._tto === 1)
    ),
    _pRow(
      "2nd Time Through",
      pitches.filter((p) => p._tto === 2)
    ),
    _pRow(
      "3rd Time Through+",
      pitches.filter((p) => p._tto >= 3)
    ),
  ];

  // Velocity by pitch type
  const _veloByType = {};
  pitches.forEach((p) => {
    const v = parseFloat(p.velocity);
    if (isNaN(v) || v <= 0) return;
    const t = p.pitchType && p.pitchType !== "—" ? p.pitchType : null;
    if (!t) return;
    if (!_veloByType[t]) _veloByType[t] = [];
    _veloByType[t].push(v);
  });
  const veloTypeKeys = Object.keys(_veloByType).sort();
  const veloTableRows = veloTypeKeys.map((t) => {
    const vs = _veloByType[t];
    const avg = (vs.reduce((a, b) => a + b, 0) / vs.length).toFixed(1);
    const max = Math.max(...vs).toFixed(1);
    const min = Math.min(...vs).toFixed(1);
    return `<tr>
      <td style="font-weight:500;color:var(--text2)">${t}</td>
      <td>${vs.length}</td>
      <td style="font-weight:700">${avg}</td>
      <td style="color:var(--green)">${max}</td>
      <td style="color:var(--text3)">${min}</td>
    </tr>`;
  });
  const veloTable = veloTableRows.length
    ? `<div style="margin-bottom:28px">
    <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:9px;letter-spacing:3px;text-transform:uppercase;color:var(--text3);margin-bottom:8px">Velocity by Pitch Type</div>
    <div style="overflow-x:auto">
    <table class="data-table" style="min-width:360px">
      <thead><tr><th style="text-align:left;min-width:140px">Pitch</th><th>Count</th><th>Avg MPH</th><th>Max</th><th>Min</th></tr></thead>
      <tbody>${veloTableRows.join("")}</tbody>
    </table></div>
  </div>`
    : "";

  return `<div style="padding:4px 0">
    ${_pTable(homeAwayRows, "Home / Away")}
    ${_pTable(handRows, "vs Batter Handedness")}${handNote}
    ${_pTable(ttoRows, "Times Through the Order")}
    ${_pTable(runnersRows, "Runners on Base")}
    ${_pTable(outsRows, "Outs in Inning")}
    ${_pTable(countRows, "Count Splits (Grouped)")}
    ${
      individualCountRows.length
        ? _pTable(individualCountRows, "Individual Count Splits")
        : ""
    }
    ${innings.length ? _pTable(inningRows, "By Inning") : ""}
    ${_pTable(recentRows, "Recent Performance")}
    ${monthRows.length ? _pTable(monthRows, "By Month") : ""}
    ${typeRows.length ? _pTable(typeRows, "By Pitch Type") : ""}
    ${veloTable}
  </div>`;
}

function buildPitchMixTab(allPitches) {
  const pitchesJson = JSON.stringify(allPitches).replace(/'/g, "&#39;");
  return `<div id="pmix-container" data-all-pitches='${pitchesJson}'>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:start;max-width:900px">
      <div>
<!-- Filterable stat cards — updated by the existing outcome filter -->
<div class="section-title" style="margin-bottom:8px" id="pmix-arsenal-title">Pitch Arsenal · ${
  allPitches.length
} pitches</div>
<div id="pmix-arsenal-stats">${buildArsenalStats(allPitches)}</div>
<!-- Full pitch breakdown with its own filter/charts — stays intact -->
<div style="margin-top:14px">${buildPitchBreakdown(allPitches)}</div>
      </div>
      <div>
<div class="section-title" style="margin-bottom:10px">Results Against</div>
<div id="pmix-results">${buildPitcherResultsBreakdown(allPitches)}</div>
      </div>
    </div>
  </div>`;
}

// Renders only the filterable stat cards for Pitch Arsenal (no filter bar)
function buildArsenalStats(pitches) {
  if (!pitches.length)
    return '<div class="empty-state" style="padding:10px 0">No pitches for selection</div>';
  const vels = pitches
    .map((p) => parseFloat(p.velocity))
    .filter((v) => !isNaN(v) && v > 0);
  const avgVel = vels.length
    ? (vels.reduce((a, b) => a + b, 0) / vels.length).toFixed(1)
    : "—";
  const maxVel = vels.length ? Math.max(...vels).toFixed(1) : "—";
  const total = pitches.length;
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
  const strikes = pitches.filter((p) => _isStrike(p.outcome)).length;
  const strPct = total > 0 ? Math.round((strikes / total) * 100) : 0;
  const fp = pitches.filter((p) => _isFirstPitch(p));
  const fpsPct =
    fp.length > 0
      ? Math.round(
          (fp.filter((p) => _isStrike(p.outcome)).length / fp.length) *
            100
        )
      : null;
  const swings = pitches.filter((p) =>
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
  const swingPct = total > 0 ? Math.round((swings / total) * 100) : 0;
  return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 14px;text-align:center">
      <div style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:26px;color:#cc1a1a">${avgVel}</div>
      <div style="font-size:8px;letter-spacing:2px;color:var(--text3);text-transform:uppercase">Avg Velo</div>
    </div>
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 14px;text-align:center">
      <div style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:26px;color:var(--text)">${maxVel}</div>
      <div style="font-size:8px;letter-spacing:2px;color:var(--text3);text-transform:uppercase">Max Velo</div>
    </div>
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 14px;text-align:center">
      <div style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:26px;color:#cc1a1a">${strPct}%</div>
      <div style="font-size:8px;letter-spacing:2px;color:var(--text3);text-transform:uppercase">Strike%</div>
    </div>
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 14px;text-align:center">
      <div style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:26px;color:var(--text)">${
fpsPct !== null ? fpsPct + "%" : "—"
      }</div>
      <div style="font-size:8px;letter-spacing:2px;color:var(--text3);text-transform:uppercase">FPS%</div>
    </div>
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 14px;text-align:center">
      <div style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:26px;color:var(--text)">${zonePct}%</div>
      <div style="font-size:8px;letter-spacing:2px;color:var(--text3);text-transform:uppercase">Zone%</div>
    </div>
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 14px;text-align:center">
      <div style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:26px;color:var(--text)">${swingPct}%</div>
      <div style="font-size:8px;letter-spacing:2px;color:var(--text3);text-transform:uppercase">Swing%</div>
    </div>
  </div>`;
}

function buildPitcherResultsBreakdown(pitches) {
  if (!pitches.length)
    return '<div class="empty-state" style="padding:20px 0">No pitch data logged yet.<br><small style="color:var(--text3)">Pitch data is tracked from new saves going forward.</small></div>';

  const total = pitches.length;
  const outcomes = {
    "Swinging K": pitches.filter((p) => p.outcome === "strike-swinging")
      .length,
    "Called K": pitches.filter((p) => p.outcome === "strike-looking")
      .length,
    Ball: pitches.filter((p) => p.outcome === "ball").length,
    Foul: pitches.filter((p) => p.outcome === "foul").length,
    Hit: pitches.filter((p) =>
      ["single", "double", "triple", "homerun"].includes(p.outcome)
    ).length,
    "Field Out": pitches.filter((p) =>
      ["groundout", "flyout", "lineout", "sacfly", "sacbunt"].includes(
        p.outcome
      )
    ).length,
    Walk: pitches.filter((p) => p.balls >= 4 && p.outcome === "ball")
      .length,
    HBP: pitches.filter((p) => p.outcome === "hbp").length,
  };
  const colors = {
    "Swinging K": "#cc1a1a",
    "Called K": "#f57a7a",
    Ball: "#5baef5",
    Foul: "#c07020",
    Hit: "#4ae88a",
    "Field Out": "#c084f5",
    Walk: "#5baef5",
    HBP: "#c84af0",
  };

  const rows = Object.entries(outcomes)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([lbl, n]) => {
      const pct = Math.round((n / total) * 100);
      return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
<div style="font-family:'Barlow Condensed',sans-serif;font-weight:600;font-size:13px;color:var(--text2);width:90px;flex-shrink:0">${lbl}</div>
<div style="flex:1;background:var(--surface3);border-radius:3px;height:14px;overflow:hidden">
  <div style="width:${pct}%;height:100%;background:${
        colors[lbl] || "#8a909e"
      };border-radius:3px"></div>
</div>
<div style="font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--text3);width:52px;text-align:right;flex-shrink:0">${n} · ${pct}%</div>
      </div>`;
    })
    .join("");

  // Batters faced breakdown
  const batters = {};
  pitches.forEach((p) => {
    if (p.batter && p.batter !== "—")
      batters[p.batter] = (batters[p.batter] || 0) + 1;
  });
  const topBatters = Object.entries(batters)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

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
  const swings = pitches.filter((p) =>
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
  const contactPitches = pitches.filter((p) =>
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
  const contactPct =
    swings > 0 ? Math.round((contactPitches / swings) * 100) : 0;

  return `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:16px">
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px;text-align:center">
<div style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:22px;color:var(--accent)">${zonePct}%</div>
<div style="font-size:8px;letter-spacing:2px;color:var(--text3);text-transform:uppercase">Zone%</div>
      </div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px;text-align:center">
<div style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:22px">${swingPct}%</div>
<div style="font-size:8px;letter-spacing:2px;color:var(--text3);text-transform:uppercase">Swing%</div>
      </div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px;text-align:center">
<div style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:22px;color:var(--green)">${contactPct}%</div>
<div style="font-size:8px;letter-spacing:2px;color:var(--text3);text-transform:uppercase">Contact%</div>
      </div>
    </div>
    <div style="margin-bottom:16px">
      <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:9px;letter-spacing:3px;text-transform:uppercase;color:var(--text3);margin-bottom:8px">Outcome Breakdown</div>
      ${
rows ||
'<div style="color:var(--text3);font-size:12px">No outcomes recorded</div>'
      }
    </div>
    ${
      topBatters.length
? `<div>
      <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:9px;letter-spacing:3px;text-transform:uppercase;color:var(--text3);margin-bottom:8px">Most Faced</div>
      ${topBatters
.map(
  ([name, count]) => `
<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--surface3);font-size:12px">
  <span style="color:var(--text2)">${escHtml(name)}</span>
  <span style="font-family:'Share Tech Mono',monospace;color:var(--text3)">${count}P</span>
</div>`
)
.join("")}
    </div>`
: ""
    }
  `;
}

function buildPitcherStatsTab(
  teamName,
  pitcherName,
  games,
  allPitches,
  career
) {
  // career: object from getTeamPitchers() with: games, pitches, strikes, k, bb, hits, outs, r, hbp, bf, swings
  const c = career || {
    games: 0,
    pitches: 0,
    strikes: 0,
    k: 0,
    bb: 0,
    hits: 0,
    outs: 0,
    r: 0,
    hbp: 0,
    bf: 0,
    swings: 0,
  };
  // Shared table helpers — defined first so all code below can use them
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
  const eraColor = (v) =>
    parseFloat(v) >= 9
      ? "color:#cc1a1a;font-weight:800"
      : parseFloat(v) <= 2
      ? "color:#1a8a3a;font-weight:800"
      : "";

  const ip = c.outs || 0;
  const ipFull = ip / 3;
  const ipDisp = ip > 0 ? Math.floor(ipFull) + "." + (ip % 3) : "0.0";
  const fmtIP = (o) =>
    o > 0 ? Math.floor(o / 3) + "." + (o % 3) : "0.0";
  const era = ip > 0 ? (((c.r || 0) / ipFull) * 9).toFixed(2) : "—";
  const whip =
    ip > 0 ? (((c.bb || 0) + (c.hits || 0)) / ipFull).toFixed(2) : "—";
  const k9 = ip > 0 ? (((c.k || 0) / ipFull) * 9).toFixed(1) : "—";
  const bb9 = ip > 0 ? (((c.bb || 0) / ipFull) * 9).toFixed(1) : "—";
  const kPct =
    (c.bf || 0) > 0
      ? (((c.k || 0) / c.bf) * 100).toFixed(1) + "%"
      : "—";
  const bbPct =
    (c.bf || 0) > 0
      ? (((c.bb || 0) / c.bf) * 100).toFixed(1) + "%"
      : "—";
  const strPct =
    (c.pitches || 0) > 0
      ? Math.round(((c.strikes || 0) / c.pitches) * 100) + "%"
      : "—";
  const kbb =
    (c.bb || 0) > 0
      ? ((c.k || 0) / c.bb).toFixed(2)
      : (c.k || 0) > 0
      ? "∞"
      : "—";
  const vels = allPitches
    .map((p) => parseFloat(p.velocity))
    .filter((v) => !isNaN(v) && v > 0);
  const avgVel = vels.length
    ? (vels.reduce((a, b) => a + b, 0) / vels.length).toFixed(1)
    : "—";
  const maxVel = vels.length ? Math.max(...vels).toFixed(1) : "—";

  // --- Batting stats allowed (via _extractABs pipeline) ---
  const pNames = _nameAliases[pitcherName] || new Set([pitcherName]);
  const facedABs = [];
  games.forEach((g) => {
    const pitchLog = g.pitchLog || [];
    const myPitches = pitchLog.filter(
      (p) => pNames.has(p.pitcher) && p.pitcherTeam === teamName
    );
    if (!myPitches.length) return;
    const oppTeam = g.awayTeam === teamName ? g.homeTeam : g.awayTeam;
    const faced = [
      ...new Set(myPitches.map((p) => p.batter).filter(Boolean)),
    ];
    faced.forEach((bName) => {
      const bAbs = _extractABs(pitchLog, bName, oppTeam, g).filter(
        (ab) => pNames.has(ab.pitcher)
      );
      bAbs.forEach((ab) => {
        ab._bHand = ab.pitches[0]?.batterHand || "—";
        ab._gameId = g.id;
        ab._gameDate = g.date;
        ab._opp = oppTeam;
        ab._isHome = g.homeTeam === teamName;
        facedABs.push(ab);
      });
    });
  });

  const _line = (absArr) =>
    absArr.length ? _sumStats(absArr.map(_abToStats)) : null;
  const _rates = (st) => {
    if (!st || st.pa === 0) return null;
    const obp = st.pa > 0 ? (st.h + st.bb + st.hbp) / st.pa : null;
    const slg = st.ab > 0 ? st.tb / st.ab : null;
    return {
      pa: st.pa,
      ab: st.ab,
      h: st.h,
      h2b: st.h2b,
      h3b: st.h3b,
      hr: st.hr,
      k: st.k,
      bb: st.bb,
      hbp: st.hbp,
      avg: st.ab > 0 ? st.h / st.ab : null,
      obp,
      slg,
      ops: obp !== null && slg !== null ? obp + slg : null,
      iso: st.ab > 0 ? (st.tb - st.h) / st.ab : null,
      kpct: st.pa > 0 ? st.k / st.pa : null,
      bbpct: st.pa > 0 ? st.bb / st.pa : null,
    };
  };

  const fR = (v, d = 3) =>
    v !== null && v !== undefined
      ? v >= 1
        ? v.toFixed(d)
        : "." +
          Math.round(v * 1000)
            .toString()
            .padStart(3, "0")
      : ".---";
  const fP = (v) =>
    v !== null && v !== undefined ? (v * 100).toFixed(1) + "%" : "—";
  const colorAvg = (v) =>
    v === null
      ? ""
      : v >= 0.3
      ? "color:#cc1a1a;font-weight:800"
      : v < 0.2
      ? "color:#1a8a3a;font-weight:700"
      : "";
  const colorOPS = (v) =>
    v === null
      ? ""
      : v >= 0.8
      ? "color:#cc1a1a;font-weight:800"
      : v < 0.6
      ? "color:#1a8a3a;font-weight:700"
      : "";

  const overall = _rates(_line(facedABs));
  const vsRHB = _rates(_line(facedABs.filter((a) => a._bHand === "R")));
  const vsLHB = _rates(_line(facedABs.filter((a) => a._bHand === "L")));
  const home = _rates(_line(facedABs.filter((a) => a._isHome)));
  const away = _rates(_line(facedABs.filter((a) => !a._isHome)));
  const hasHand = facedABs.some(
    (a) => a._bHand === "R" || a._bHand === "L"
  );

  const allowedRow = (lbl, r, bold) => {
    if (!r)
      return `<tr>${tdL(
        lbl,
        bold
      )}<td colspan="16" style="padding:8px 10px;color:var(--text3);font-style:italic;font-family:'Barlow Condensed',sans-serif;text-align:center">No data</td></tr>`;
    return `<tr>
      ${tdL(lbl, bold)}
      ${td(r.pa)}${td(r.ab)}${td(r.h)}${td(r.h2b)}${td(r.h3b)}
      ${td(r.hr, r.hr > 0 ? "color:#cc1a1a;font-weight:800" : "")}
      ${td(r.bb)}${td(r.hbp || 0)}${td(r.k)}
      ${td(fR(r.avg), colorAvg(r.avg))}
      ${td(fR(r.obp))}${td(fR(r.slg))}
      ${td(fR(r.ops), colorOPS(r.ops))}
      ${td(fP(r.iso))}${td(fP(r.kpct))}${td(fP(r.bbpct))}
    </tr>`;
  };

  // Per-game rows (traditional pitching stats)
  const gameRows = [];
  games.forEach((g) => {
    const pitchers =
      g.awayTeam === teamName ? g.awayPitchers : g.homePitchers;
    const p = (pitchers || []).find((x) => pNames.has(x.name));
    if (!p || !p.pitches) return;
    const opp = g.awayTeam === teamName ? g.homeTeam : g.awayTeam;
    const gip = p.outs || 0;
    const gipDisp = fmtIP(gip);
    const gERA =
      gip > 0 ? (((p.r || 0) / (gip / 3)) * 9).toFixed(2) : "—";
    const gWHIP =
      gip > 0
        ? (((p.bb || 0) + (p.hits || 0)) / (gip / 3)).toFixed(2)
        : "—";
    const gSP =
      p.pitches > 0
        ? Math.round(((p.strikes || 0) / p.pitches) * 100) + "%"
        : "—";
    // Batting allowed this game from facedABs
    const gABs = facedABs.filter((a) => a._gameId === g.id);
    const gRates = _rates(_line(gABs));
    gameRows.push(`<tr>
      ${tdL(g.date, false)}${tdL(escHtml(opp), false)}
      ${td(gipDisp)}${td(p.pitches)}${td(p.bf || "—")}
      ${td(p.k || 0)}${td(p.bb || 0)}${td(p.hits || 0)}${td(
      p.r || 0
    )}${td(p.hbp || 0)}
      ${td(gERA, eraColor(gERA))}${td(gWHIP)}${td(gSP)}
      ${td(
        gRates ? fR(gRates.avg) : ".---",
        colorAvg(gRates?.avg ?? null)
      )}
      ${td(
        gRates ? fR(gRates.ops) : ".---",
        colorOPS(gRates?.ops ?? null)
      )}
    </tr>`);
  });

  return `
    <div style="margin-bottom:28px">
      <div class="section-title" style="margin-bottom:12px">Career Pitching</div>
      ${tbl(`
<thead><tr>
  ${th("G", true)}${th("IP")}${th("BF")}${th("P")}${th("K")}${th(
"BB"
      )}${th("H")}${th("R")}${th("HBP")}
  ${th("ERA")}${th("WHIP")}${th("K/9")}${th("BB/9")}${th("K/BB")}
  ${th("K%")}${th("BB%")}${th("Str%")}${th("Avg MPH")}${th("Max MPH")}
</tr></thead>
<tbody><tr>
  ${tdL(c.games, true)}${td(ipDisp)}${td(c.bf || 0)}${td(
c.pitches
      )}${td(c.k)}${td(c.bb)}
  ${td(c.hits)}${td(c.r || 0)}${td(c.hbp || 0)}
  ${td(era, eraColor(era))}${td(whip)}
  ${td(k9)}${td(bb9)}${td(kbb)}
  ${td(kPct)}${td(bbPct)}${td(strPct)}${td(avgVel)}${td(maxVel)}
</tr></tbody>`)}
    </div>

    <div style="margin-bottom:28px">
      <div class="section-title" style="margin-bottom:12px">Batting Stats Allowed</div>
      ${
facedABs.length === 0
  ? '<div class="empty-state" style="padding:20px 0">No pitch log data — record new games to populate batting stats allowed.</div>'
  : tbl(`
<thead><tr>
  ${th("Split", true)}${th("PA")}${th("AB")}${th("H")}${th("2B")}${th(
      "3B"
    )}${th("HR")}
  ${th("BB")}${th("HBP")}${th("K")}
  ${th("AVG")}${th("OBP")}${th("SLG")}${th("OPS")}${th("ISO")}${th(
      "K%"
    )}${th("BB%")}
</tr></thead>
<tbody>
  ${allowedRow("Overall", overall, true)}
  ${allowedRow("Home", home, false)}
  ${allowedRow("Away", away, false)}
  ${hasHand ? allowedRow("vs RHB", vsRHB, false) : ""}
  ${hasHand ? allowedRow("vs LHB", vsLHB, false) : ""}
  ${
    !hasHand
      ? `<tr><td colspan="17" style="padding:8px 10px;color:var(--text3);font-style:italic;font-size:11px;font-family:'Barlow Condensed',sans-serif">Batter handedness tracked from newly recorded games</td></tr>`
      : ""
  }
</tbody>`)
      }
    </div>

    ${
      gameRows.length > 0
? `
    <div>
      <div class="section-title" style="margin-bottom:12px">Game-by-Game Log</div>
      ${tbl(`
<thead><tr>
  ${th("Date", true)}${th("Opp", true)}${th("IP")}${th("P")}${th("BF")}
  ${th("K")}${th("BB")}${th("H")}${th("R")}${th("HBP")}
  ${th("ERA")}${th("WHIP")}${th("Str%")}${th("AVG Ag.")}${th("OPS Ag.")}
</tr></thead>
<tbody>${gameRows.join("")}</tbody>`)}
    </div>`
: ""
    }`;
}

function buildPitcherGameLog(teamName, pitcherName, games) {
  const rows = [];
  games.forEach((g) => {
    const pitchers =
      g.awayTeam === teamName ? g.awayPitchers : g.homePitchers;
    const _pNamesGL =
      _nameAliases[pitcherName] || new Set([pitcherName]);
    const p = (pitchers || []).find((x) => _pNamesGL.has(x.name));
    if (!p || !p.pitches) return;
    const opp = g.awayTeam === teamName ? g.homeTeam : g.awayTeam;
    const sp =
      p.pitches > 0 ? Math.round((p.strikes / p.pitches) * 100) : 0;
    const kbb =
      p.bb > 0 ? (p.k / p.bb).toFixed(1) : p.k > 0 ? "∞" : "—";
    rows.push(`<tr>
      <td>${g.date}</td>
      <td>${escHtml(opp)}</td>
      <td>${p.pitches}</td>
      <td>${p.strikes}</td>
      <td class="${p.k >= 5 ? "good" : ""}">${p.k}</td>
      <td class="${p.bb >= 4 ? "dim" : ""}">${p.bb}</td>
      <td>${p.hits}</td>
      <td class="${sp >= 65 ? "good" : sp < 55 ? "dim" : ""}">${sp}%</td>
      <td>${kbb}</td>
    </tr>`);
  });
  if (!rows.length)
    return '<div class="empty-state">No pitching data found</div>';
  return `<table class="data-table">
    <thead><tr><th>Date</th><th>Opp</th><th>P</th><th>Str</th><th>K</th><th>BB</th><th>H</th><th>Str%</th><th>K/BB</th></tr></thead>
    <tbody>${rows.join("")}</tbody>
  </table>`;
}

