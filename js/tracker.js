// ===================== COMMIT PITCH =====================
function commitPitch() {
  const outcome = S.selectedOutcome;
  const px = S.pitchX,
    py = S.pitchY;
  const pitchType = S.selectedPitchType || "—";
  const velocity = qs("vel-input").value.trim();
  const p = activePitcher();

  // Snapshot full game state BEFORE any changes — enables full undo of any outcome
  _takeSnapshot();

  S.pitchCount++;
  if (p) {
    p.pitches++;
    // Count batter faced once per PA (first pitch of each AB)
    if (S.currentAtBatPitches.length === 0) p.bf = (p.bf || 0) + 1;
  }

  // Assign a stable game ID on the very first pitch so all saves overwrite the same record
  if (!S.gameId) S.gameId = `ptgame_${Date.now()}`;

  // Capture runner state BEFORE any advancement for blurb
  captureRunnersForBlurb();

  // Pitch type family
  const ptFamily = pitchTypeFamily(pitchType);

  // Capture count BEFORE any increment so pitch log stores pre-pitch count
  const _prePitchBalls = S.balls;
  const _prePitchStrikes = S.strikes;

  let dotClass = "",
    logLabel = "";

  if (outcome === "strike-swinging") {
    S.strikes++;
    if (p) {
      p.strikes++;
      p.swings++;
    }
    dotClass = ptFamily + "-swing";
    logLabel = "K Swing";
  } else if (outcome === "strike-looking") {
    S.strikes++;
    if (p) {
      p.strikes++;
      p.looks++;
    }
    dotClass = ptFamily + "-called";
    logLabel = "K Look";
  } else if (outcome === "ball") {
    S.balls++;
    dotClass = ptFamily + "-ball";
    logLabel = "Ball";
  } else if (outcome === "foul") {
    if (S.strikes < 2) {
      S.strikes++;
      if (p) p.strikes++;
    }
    dotClass = ptFamily + "-foul";
    logLabel = "Foul";
  } else if (outcome === "hbp") {
    dotClass = ptFamily + "-ball";
    logLabel = "HBP";
  } else if (outcome === "ci") {
    dotClass = ptFamily + "-ball";
    logLabel = "CI";
  } else if (outcome === "error") {
    dotClass = "ip-hit";
    logLabel = "E";
    if (p) {
      p.strikes++;
    }
  } else if (isHitOutcome(outcome)) {
    dotClass = "ip-hit";
    logLabel =
      outcome === "homerun"
        ? "HR"
        : outcome === "single"
        ? "1B"
        : outcome === "double"
        ? "2B"
        : "3B";
    if (p) {
      p.strikes++;
      p.hits++;
    }
  } else if (isFieldOut(outcome)) {
    dotClass = "ip-out";
    logLabel =
      outcome === "groundout"
        ? "GO"
        : outcome === "flyout"
        ? "FO"
        : "LO";
    if (p) p.strikes++;
  } else if (outcome === "sacbunt") {
    dotClass = "ip-out";
    logLabel = "SB";
    if (p) p.strikes++;
  } else if (outcome === "sacfly") {
    dotClass = "ip-out";
    logLabel = "SF";
    if (p) p.strikes++;
  }

  placePitchDot(px, py, dotClass, S.pitchCount, velocity);
  if (placeholderEl) {
    placeholderEl.remove();
    placeholderEl = null;
  }

  const entry = {
    num: p ? p.pitches : S.pitchCount,
    outcome,
    label: logLabel,
    pitchType,
    dotClass,
    velocity,
    loc: zoneLabel(px, py),
    pitchX: px,
    pitchY: py,
    balls: _prePitchBalls,
    strikes: _prePitchStrikes,
    _prePitchCount: true,
    batter: currentBatter()?.name || "—",
    inning: S.inning,
    isTop: S.isTop,
    pitcher: p?.name || "—",
    pitcherNum: p?.num || "—",
    pitcherTeam: S.isTop
      ? qs("home-name-input").value || "HOME"
      : qs("away-name-input").value || "AWAY",
    pitcherHand:
      (S.isTop ? S.pitchersHome : S.pitchersAway).find((x) => x.active)
        ?.hand || "R",
    batterHand: currentBatter()?.hand || "—",
    runnersOn: { ...S.bases }, // snapshot of base state when pitch was thrown
    outs: S.outs,
    batterIdx: currentBatterIdx() % currentLineup().length,
    isPH: !!currentBatter()?.isPH,
    isPR: !!currentBatter()?.isPR,
    isDEF: !!currentBatter()?.isDEF,
  };
  S.pitchLog.unshift(entry);
  try {
    markUnsaved();
  } catch (e) {}
  S.currentAtBatPitches.push(entry);
  addAbChip(dotClass, logLabel, pitchType, velocity);
  renderPitchLog();
  renderPitcherList();
  renderPitchMix();
  updateScoreBug();
  renderLiveScoutingTab();
  checkPitchCountWarning(p);

  // Auto-save every pitch (debounced 2s — catches crashes mid-inning)
  _scheduleAutoSave();

  // Build blurb for mid-AB pitches immediately; AB-ending ones update after resolution
  const _blurbCount = { balls: S.balls, strikes: S.strikes };

  // ---- END-OF-AB CHECKS ----
  let abEnded = false;
  if (outcome === "hbp") {
    if (p) p.hbp = (p.hbp || 0) + 1;
    toast("HBP — Batter takes first!");
    logEvent(
      "⚡",
      "HBP",
      `${currentBatter()?.name || "Batter"} hit by pitch`
    );
    updatePlayBlurb(
      "hbp",
      pitchType,
      velocity,
      zoneLabel(px, py),
      null,
      0,
      S.bases,
      _blurbCount
    );
    recordAtBatResult("HBP", "HBP");
    advanceOnWalk();
    abEnded = true;
  } else if (outcome === "ci") {
    toast("🧤 Catcher's Interference — Batter takes first!");
    logEvent(
      "🧤",
      "Catcher's Interference",
      `${currentBatter()?.name || "Batter"} reaches on CI`
    );
    updatePlayBlurb(
      "ci",
      pitchType,
      velocity,
      zoneLabel(px, py),
      null,
      0,
      S.bases,
      _blurbCount
    );
    recordAtBatResult("CI", "CI");
    advanceOnWalk();
    abEnded = true;
  } else if (outcome === "error") {
    // Show base selection modal — game logic continues in commitError()
    S.pendingErrorEntry = entry;
    qs("error-modal").style.display = "flex";
    abEnded = true;
    return; // wait for modal selection
  } else if (S.balls >= 4) {
    if (p) p.bb++;
    toast("Walk!");
    logEvent(
      "🚶",
      "Walk (BB)",
      `${currentBatter()?.name || "Batter"} takes first · ${
        p ? p.name : ""
      }`
    );
    recordAtBatResult("BB", "BB");
    updatePlayBlurb(
      "ball",
      pitchType,
      velocity,
      zoneLabel(px, py),
      null,
      0,
      S.bases,
      _blurbCount
    );
    advanceOnWalk();
    abEnded = true;
  } else if (S.strikes >= 3) {
    if (p) {
      p.k++;
      p.outs = (p.outs || 0) + 1;
    }
    S.outs++;
    const isLooking = outcome === "strike-looking";
    toast(isLooking ? "Called Strike Three!" : "Strikeout Swinging!");
    logEvent(
      isLooking ? "🫵" : "💨",
      isLooking ? "Called K" : "Strikeout",
      `${currentBatter()?.name || "Batter"} K · ${p ? p.name : ""} (${
        p ? p.k : "?"
      }K)`
    );
    recordAtBatResult("K", "K");
    updatePlayBlurb(
      isLooking ? "strikeout-looking" : "strikeout-swinging",
      pitchType,
      velocity,
      zoneLabel(px, py),
      null,
      0,
      S.bases,
      _blurbCount
    );
    abEnded = true;
    if (S.outs >= 3) {
      handleThreeOuts();
      return;
    }
    nextBatter();
  } else if (isFieldOut(outcome)) {
    abEnded = true;
    openSprayModal(outcome, entry, () => {
      // For ground outs with runners on base, ask who was retired
      const runnersOn = ["1st", "2nd", "3rd"].filter((b) => S.bases[b]);
      if (outcome === "groundout" && runnersOn.length > 0) {
        showForceOutQuestion(
          outcome,
          entry,
          pitchType,
          velocity,
          px,
          py
        );
      } else {
        // Normal fly out / line out — batter is always the one out
        commitBatterOut(
          outcome,
          logLabel,
          entry,
          pitchType,
          velocity,
          px,
          py
        );
      }
    });
  } else if (outcome === "sacfly") {
    S.outs++;
    {
      const _cp = activePitcher();
      if (_cp) _cp.outs = (_cp.outs || 0) + 1;
    }
    let sfRuns = 0;
    if (S.bases["3rd"]) {
      const _sfRunner = S.runnerNames["3rd"];
      S.bases["3rd"] = false;
      clearRunner("3rd");
      addRun("3rd");
      sfRuns = 1;
      const _sfBs = getBatterStats(currentBatterKey());
      _sfBs.rbi = (_sfBs.rbi || 0) + 1;
      toast("Sac Fly — Run scores!");
    } else toast("Sac Fly — Out (no runner on 3rd).");
    logEvent("🏃", "Sac Fly", `${currentBatter()?.name || "Batter"}`);
    recordAtBatResult("O", "SF");
    abEnded = true;
    openSprayModal(outcome, entry, () => {
      updatePlayBlurb(
        "sacfly",
        pitchType,
        velocity,
        zoneLabel(px, py),
        entry.spray || null,
        sfRuns,
        S.bases,
        _blurbCount
      );
      if (S.outs >= 3) {
        handleThreeOuts();
        return;
      }
      const runnersOn = ["1st", "2nd", "3rd"].some((b) => S.bases[b]);
      if (runnersOn) {
        showRunnerAdvanceOnOut(outcome, () => {
          if (S.outs >= 3) {
            handleThreeOuts();
            return;
          }
          nextBatter();
        });
      } else {
        nextBatter();
      }
    });
  } else if (outcome === "sacbunt") {
    S.outs++;
    {
      const _cp = activePitcher();
      if (_cp) _cp.outs = (_cp.outs || 0) + 1;
    }
    toast("Sac Bunt — Batter out.");
    logEvent(
      "🟤",
      "Sac Bunt",
      `${currentBatter()?.name || "Batter"} · ${S.outs} out${
        S.outs > 1 ? "s" : ""
      } this inning`
    );
    recordAtBatResult("O", "SB");
    abEnded = true;
    openSprayModal(outcome, entry, () => {
      updatePlayBlurb(
        "groundout",
        pitchType,
        velocity,
        zoneLabel(px, py),
        entry.spray || null,
        0,
        S.bases,
        _blurbCount
      );
      if (S.outs >= 3) {
        handleThreeOuts();
        return;
      }
      const runnersOn = ["1st", "2nd", "3rd"].some((b) => S.bases[b]);
      if (runnersOn) {
        showRunnerAdvanceOnOut(outcome, () => {
          if (S.outs >= 3) {
            handleThreeOuts();
            return;
          }
          nextBatter();
        });
      } else {
        nextBatter();
      }
    });
  } else if (isHitOutcome(outcome)) {
    openSprayModal(outcome, entry, () => {
      handleHit(outcome);
    });
    abEnded = true;
  }

  if (!abEnded) {
    // Mid-AB — blurb immediately
    updatePlayBlurb(
      outcome,
      pitchType,
      velocity,
      zoneLabel(px, py),
      null,
      0,
      S.bases,
      _blurbCount
    );
    resetAfterPitch();
    updateScoreBug();
  }
}

function currentBatterHand() {
  const b = currentBatter();
  const hand = b?.hand || "R";
  if (hand === "S") {
    const p = activePitcher();
    const pitcherHand = p?.hand || "R";
    return pitcherHand === "L" ? "R" : "L";
  }
  return hand;
}

// Update the IN/OUT visual labels on the zone canvas based on batter handedness
function updateZoneHandednessLabels() {
  const isLefty = currentBatterHand() === "L";
  const inEl = qs("zone-lbl-in");
  const outEl = qs("zone-lbl-out");
  if (!inEl || !outEl) return;
  inEl.textContent = isLefty ? "OUT" : "IN";
  outEl.textContent = isLefty ? "IN" : "OUT";
  updateBatterSilhouette(isLefty);
}

function updateBatterSilhouette(isLefty) {
  const el = qs("zone-batter-svg");
  if (!el) return;
  // Zone 300px wide, strike box left edge at 93px.
  // Batter image 107px wide — place so his body is mostly left of the box.
  // left:-5px: right edge = 102px, slight overlap with box edge (realistic — batter leans over plate).
  // LHH: mirror to right side.
  if (isLefty) {
    el.style.left = "auto";
    el.style.right = "-90px";
    el.style.transform = "scaleX(-1)";
  } else {
    el.style.left = "-90px";
    el.style.right = "auto";
    el.style.transform = "scaleX(1)";
  }
  el.innerHTML = getBatterSVG();
}

function getBatterSVG() {
  return `<img src="data:image/png;base64,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"
    style="height:min(480px,calc(100vh - 310px));width:auto;display:block;"
    alt="batter">`;
}

function zoneLabel(px, py) {
  const inZ = isInZone(px, py);
  // For LHH, left side of canvas is outside (they stand on the right of plate)
  const isLefty = currentBatterHand() === "L";
  const insideCol = isLefty ? "Outside" : "Inside";
  const outsideCol = isLefty ? "Inside" : "Outside";
  if (inZ) {
    // 3×3 grid inside box (31–69%), thirds at ~44% and 56%
    const col = px < 44 ? insideCol : px > 56 ? outsideCol : "Middle";
    const row = py < 44 ? "High" : py > 56 ? "Low" : "Middle";
    if (row === "Middle" && col === "Middle") return "Heart";
    if (row === "Middle") return col;
    if (col === "Middle") return row;
    return `${row} ${col}`;
  }
  // Outside zone — describe chase area by quadrant
  const col = px < 31 ? insideCol : px > 69 ? outsideCol : "Middle";
  const row = py < 30.9 ? "High" : py > 69.1 ? "Low" : "Middle";
  const way = px < 15 || px > 85 || py < 15 || py > 85;
  const prefix = way ? "Way " : "Chase ";
  if (row === "Middle" && col === "Middle") return prefix + "Edge";
  if (row === "Middle") return prefix + col;
  if (col === "Middle") return prefix + row;
  return prefix + `${row} ${col}`;
}

function placePitchDot(px, py, cls, num, vel) {
  const d = document.createElement("div");
  d.className = `pitch-dot ${cls}`;
  d.style.left = px + "%";
  d.style.top = py + "%";
  d.textContent = num;
  const loc = zoneLabel(px, py);
  d.title = `#${num} · ${loc}${vel ? " · " + vel + "mph" : ""}`;
  qs("pitch-dots").appendChild(d);
}
function addAbChip(cls, label, type, vel) {
  const chip = document.createElement("div");
  chip.className = "ab-pitch-chip";
  const velHtml = vel
    ? `<span style="color:var(--accent)"> ${vel}</span>`
    : "";
  chip.innerHTML = `<div class="chip-dot" style="background:${dotColor(
    cls
  )}"></div><span>${label}</span><span style="color:var(--text3)">${
    type !== "—" ? " " + type : ""
  }</span>${velHtml}`;
  qs("ab-strip").appendChild(chip);
}
function resetPitchControls(clearZone = true) {
  S.pitchX = null;
  S.pitchY = null;
  S.selectedOutcome = null;
  S.selectedPitchType = null;
  if (placeholderEl) {
    placeholderEl.remove();
    placeholderEl = null;
  }
  qsa(".outcome-btn").forEach((b) => b.classList.remove("selected"));
  qsa(".pitch-type-btn").forEach((b) => b.classList.remove("selected"));
  qs("commit-pitch").disabled = true;
  qs("zone-hint").textContent = "Click zone to place pitch";
  qs("zone-hint").className = "";
  const velEl = qs("vel-input");
  if (velEl) velEl.value = "";
  if (clearZone) {
    qs("pitch-dots").innerHTML = "";
    qsa("#ab-strip .ab-pitch-chip").forEach((c) => c.remove());
    S.currentAtBatPitches = [];
    S.pitchCount = 0;
    if (inPlayOpen) {
      inPlayOpen = false;
      qs("inplay-grid").style.display = "none";
      qs("inplay-toggle-btn").classList.remove("open");
    }
    _inPlayCat = null;
    ["hit", "out", "sac", "err"].forEach((c) => {
      const s = qs("ipc-sub-" + c);
      if (s) s.style.display = "none";
      const b = qs("ipc-" + c);
      if (b) {
        b.style.background = "var(--surface)";
        b.style.borderColor = "var(--border2)";
        b.style.color = "var(--text2)";
      }
    });
  }
}
// After committing a pitch mid-AB: keep zone dots, just clear outcome/type selection
function resetAfterPitch() {
  const wasContact = isContactOutcome(S.selectedOutcome || "");
  S.selectedOutcome = null;
  S.selectedPitchType = null;
  S._lastFielder = null;
  S._lastScoreStr = null;
  if (placeholderEl) {
    placeholderEl.remove();
    placeholderEl = null;
  }
  qsa(".outcome-btn").forEach((b) => b.classList.remove("selected"));
  qsa(".pitch-type-btn").forEach((b) => b.classList.remove("selected"));
  qs("commit-pitch").disabled = true;
  const velEl = qs("vel-input");
  if (velEl) velEl.value = "";
  // Close in-play panel after a contact/in-play outcome was committed
  if (inPlayOpen && wasContact) {
    inPlayOpen = false;
    qs("inplay-grid").style.display = "none";
    qs("inplay-toggle-btn").classList.remove("open");
    _inPlayCat = null;
    ["hit", "out", "sac", "err"].forEach((c) => {
      const s = qs("ipc-sub-" + c);
      if (s) s.style.display = "none";
      const b = qs("ipc-" + c);
      if (b) {
        b.style.background = "var(--surface)";
        b.style.borderColor = "var(--border2)";
        b.style.color = "var(--text2)";
      }
    });
  }
}
function clearAtBat() {
  S.balls = 0;
  S.strikes = 0;
  resetPitchControls(true);
  clearPlayBlurb();
  updateScoreBug();
  renderLineup();
}
function clearZoneOnly() {
  qs("pitch-dots").innerHTML = "";
  if (placeholderEl) {
    placeholderEl.remove();
    placeholderEl = null;
  }
}

// ===================== WALK / HBP =====================
function advanceOnWalk() {
  const b = S.bases;
  const batter = currentBatter()?.name || null;
  if (b["1st"] && b["2nd"] && b["3rd"]) {
    const _wRun = S.runnerNames["3rd"];
    clearRunner("3rd");
    addRun("3rd");
    const _wBs = getBatterStats(currentBatterKey());
    _wBs.rbi = (_wBs.rbi || 0) + 1;
  } else if (b["1st"] && b["2nd"]) {
    b["3rd"] = true;
    moveRunner("2nd", "3rd");
  } else if (b["1st"]) {
    b["2nd"] = true;
    moveRunner("1st", "2nd");
  }
  b["1st"] = true;
  setRunner("1st", batter);
  nextBatter();
}

// ===================== HITS =====================
function handleHit(hitType) {
  recordAtBatResult(
    "H",
    hitType === "homerun"
      ? "HR"
      : hitType === "single"
      ? "1B"
      : hitType === "double"
      ? "2B"
      : "3B"
  );
  if (hitType === "homerun") {
    let runs = 1;
    ["1st", "2nd", "3rd"].forEach((base) => {
      if (S.bases[base]) runs++;
    });
    S.bases = { "1st": false, "2nd": false, "3rd": false };
    // clear all runners first, then addRun for each
    S.runnerNames = { "1st": null, "2nd": null, "3rd": null };
    for (let i = 0; i < runs; i++) addRun();
    const _hrBs = getBatterStats(currentBatterKey());
    _hrBs.rbi = (_hrBs.rbi || 0) + runs;
    _hrBs.r = (_hrBs.r || 0) + 1;
    const msg = `HOME RUN! ${runs} run${runs > 1 ? "s" : ""} score!`;
    toast(msg);
    logEvent(
      "",
      `HOME RUN — ${currentBatter()?.name || "?"}`,
      `${runs} run${runs > 1 ? "s" : ""} score · ${awayName()} ${
        S.awayScore
      }, ${homeName()} ${S.homeScore}`
    );
    updatePlayBlurb(
      "homerun",
      S.pitchLog[0]?.pitchType || "—",
      S.pitchLog[0]?.velocity || "",
      S.pitchLog[0]?.loc || "",
      S.pitchLog[0]?.spray || null,
      runs,
      S.bases,
      { balls: 0, strikes: 0 }
    );
    nextBatter();
    return;
  }
  const runners = [];
  if (S.bases["3rd"]) runners.push("3rd");
  if (S.bases["2nd"]) runners.push("2nd");
  if (S.bases["1st"]) runners.push("1st");
  const newBase =
    hitType === "single" ? "1st" : hitType === "double" ? "2nd" : "3rd";
  if (!runners.length) {
    S.bases = { "1st": false, "2nd": false, "3rd": false };
    S.runnerNames = { "1st": null, "2nd": null, "3rd": null };
    S.bases[newBase] = true;
    setRunner(newBase, currentBatter()?.name || null);
    const hitName = hitType.charAt(0).toUpperCase() + hitType.slice(1);
    toast(` ${hitName}!`);
    logEvent(
      "",
      `${hitName} — ${currentBatter()?.name || "?"}`,
      `On ${newBase}`
    );
    updatePlayBlurb(
      hitType,
      S.pitchLog[0]?.pitchType || "—",
      S.pitchLog[0]?.velocity || "",
      S.pitchLog[0]?.loc || "",
      S.pitchLog[0]?.spray || null,
      0,
      S.bases,
      { balls: 0, strikes: 0 }
    );
    nextBatter();
    return;
  }
  S.modalHit = { hitType, newBase, runners };
  S.runnerQueue = [...runners];
  S.runnerMoves = {};
  S.currentQueueIdx = 0;
  showRunnerModal();
}

// ===================== RUNNER MODAL =====================
function showRunnerModal() {
  if (S.currentQueueIdx >= S.runnerQueue.length) {
    applyRunnerMoves();
    return;
  }
  const runner = S.runnerQueue[S.currentQueueIdx];
  const hit = S.modalHit;
  qs("modal-title").textContent = `Runner on ${runner}`;
  qs("modal-sub").textContent = `${hit.hitType} by ${
    currentBatter()?.name || "batter"
  }. Where does the runner from ${runner} go?`;
  ["1st", "2nd", "3rd", "home"].forEach((b) => {
    const el = qs("modal-" + b);
    if (el)
      el.className =
        "baserun-base baserun-" +
        (b === "2nd"
          ? "second"
          : b === "3rd"
          ? "third"
          : b === "1st"
          ? "first"
          : "home");
  });
  const srcId = `modal-${runner}`;
  if (qs(srcId)) qs(srcId).classList.add("runner-here");
  const dests = getDestOpts(runner, hit.hitType);
  dests.forEach((d) => {
    const el = qs("modal-" + d);
    if (el && !el.classList.contains("runner-here"))
      el.classList.add("target-base");
  });
  const qEl = qs("runner-queue");
  qEl.innerHTML = "";
  dests.forEach((dest) => {
    const btn = document.createElement("button");
    btn.className =
      "runner-move-btn" + (dest === "home" ? " score-btn" : "");
    btn.innerHTML =
      dest === "home" ? ` Scores — +1 Run` : `→ Advances to ${dest}`;
    btn.onclick = () => {
      S.runnerMoves[runner] = dest;
      S.currentQueueIdx++;
      showRunnerModal();
    };
    qEl.appendChild(btn);
  });
  // "Thrown out" options — runner tried to advance but was retired
  // Show thrown out at the base BEYOND each reachable destination
  const thrownOutBases = [];
  dests.forEach((dest) => {
    const beyondMap = {
      "1st": "2nd",
      "2nd": "3rd",
      "3rd": "home",
      home: null,
    };
    // Offer "thrown out at" for each destination they could attempt
    // e.g. runner on 1st on a double: could be thrown out at 3rd or home
    if (dest === "3rd") thrownOutBases.push("3rd");
    if (dest === "home") thrownOutBases.push("home");
  });
  // Deduplicate and only show bases beyond their starting point
  const shownTO = new Set();
  thrownOutBases.forEach((toBase) => {
    if (shownTO.has(toBase)) return;
    shownTO.add(toBase);
    const btn = document.createElement("button");
    btn.className = "runner-move-btn";
    btn.style.cssText =
      "border-color:rgba(204,26,26,.3);color:var(--red)";
    btn.innerHTML = `✕ Thrown out at ${
      toBase === "home" ? "home plate" : toBase
    }`;
    btn.onclick = () => {
      S.runnerMoves[runner] = "out:" + toBase;
      S.currentQueueIdx++;
      showRunnerModal();
    };
    qEl.appendChild(btn);
  });
  qs("baserun-modal").classList.add("active");
}
function getDestOpts(from, hitType) {
  const all = ["1st", "2nd", "3rd", "home"];
  const fromIdx = from === "1st" ? 0 : from === "2nd" ? 1 : 2;
  return all.slice(fromIdx);
}
function quickRunnerDest(base) {
  const runner = S.runnerQueue[S.currentQueueIdx];
  if (!runner) return;
  S.runnerMoves[runner] = base;
  S.currentQueueIdx++;
  showRunnerModal();
}
function cancelModal() {
  qs("baserun-modal").classList.remove("active");
  applyRunnerMoves();
}
function confirmRunnerMoves() {
  qs("baserun-modal").classList.remove("active");
  applyRunnerMoves();
}
function applyRunnerMoves() {
  qs("baserun-modal").classList.remove("active");
  const hit = S.modalHit;
  if (!hit) return;
  const newBases = { "1st": false, "2nd": false, "3rd": false };
  let runs = 0,
    thrownOut = 0;
  for (const [from, to] of Object.entries(S.runnerMoves)) {
    if (to === "home") runs++;
    else if (to.startsWith("out:")) {
      // Runner was thrown out — add an out, log where
      thrownOut++;
      S.outs++;
      const atBase = to.split(":")[1];
      logEvent(
        "🏷️",
        `Thrown out at ${atBase === "home" ? "home plate" : atBase}`,
        `Runner from ${from} retired`
      );
    } else {
      newBases[to] = true;
    }
  }
  newBases[hit.newBase] = true;
  S.runnerNames[hit.newBase] = currentBatter()?.name || null;
  S.bases = newBases;
  for (let i = 0; i < runs; i++) addRun();
  if (runs > 0) {
    const _rmBs = getBatterStats(currentBatterKey());
    _rmBs.rbi = (_rmBs.rbi || 0) + runs;
  }
  // Check if thrown out ended the inning before proceeding
  if (thrownOut > 0 && S.outs >= 3) {
    S.modalHit = null;
    S.runnerQueue = [];
    S.runnerMoves = {};
    handleThreeOuts();
    return;
  }
  if (runs > 0) {
    toast(` ${runs} run${runs > 1 ? "s" : ""} score!`);
    logEvent(
      "",
      `${runs} run${runs > 1 ? "s" : ""} score`,
      `${hit.hitType} by ${
        currentBatter()?.name || "?"
      } · ${awayName()} ${S.awayScore}, ${homeName()} ${S.homeScore}`
    );
    // Blurb for hit with runs scored
    updatePlayBlurb(
      hit.hitType,
      S.pitchLog[0]?.pitchType || "—",
      S.pitchLog[0]?.velocity || "",
      S.pitchLog[0]?.loc || "",
      S.pitchLog[0]?.spray || null,
      runs,
      S.bases,
      { balls: S.balls, strikes: S.strikes }
    );
  } else {
    toast(
      ` ${hit.hitType.charAt(0).toUpperCase() + hit.hitType.slice(1)}!`
    );
    logEvent(
      "",
      `${hit.hitType.charAt(0).toUpperCase() + hit.hitType.slice(1)}`,
      `${currentBatter()?.name || "?"}`
    );
    updatePlayBlurb(
      hit.hitType,
      S.pitchLog[0]?.pitchType || "—",
      S.pitchLog[0]?.velocity || "",
      S.pitchLog[0]?.loc || "",
      S.pitchLog[0]?.spray || null,
      0,
      S.bases,
      { balls: S.balls, strikes: S.strikes }
    );
  }
  const _blurbBatter = currentBatter()?.name || "?";
  const _blurbHitType = hit.hitType;
  const _blurbRuns = runs;
  const _blurbBases = { ...S.bases };

  S.modalHit = null;
  S.runnerQueue = [];
  S.runnerMoves = {};
  nextBatter();

  // Blurb after runner positions resolved
  updatePlayBlurb(
    _blurbHitType,
    S.pitchLog[0]?.pitchType || "—",
    S.pitchLog[0]?.velocity || "",
    S.pitchLog[0]?.loc || "",
    S.pitchLog[0]?.spray || null,
    _blurbRuns,
    _blurbBases,
    { balls: 0, strikes: 0 }
  );
}

// ===================== RUNNER ADVANCE ON OUT =====================
// After a field out / sac fly, ask where each baserunner went.
// Options: stays, advances one base, advances two, scores, or out (FC/DP)
function showRunnerAdvanceOnOut(outcome, afterCallback) {
  const runners = ["3rd", "2nd", "1st"].filter((b) => S.bases[b]);
  if (!runners.length) {
    afterCallback();
    return;
  }

  const batter = currentBatter()?.name || "Batter";
  const label =
    {
      groundout: "Ground Out",
      flyout: "Fly Out",
      lineout: "Line Out",
      sacfly: "Sac Fly",
      sacbunt: "Sac Bunt",
    }[outcome] || outcome;

  // Queue through each runner one at a time
  S._raQueue = [...runners];
  S._raMoves = {};
  S._raIdx = 0;
  S._raCallback = afterCallback;
  S._raOutcome = outcome;
  S._raBatter = batter;
  S._raLabel = label;

  _showNextRunnerAdvance();
}

function _showNextRunnerAdvance() {
  if (S._raIdx >= S._raQueue.length) {
    _applyRunnerAdvance();
    return;
  }
  const base = S._raQueue[S._raIdx];
  const batter = S._raBatter;
  const label = S._raLabel;

  // Build destination options based on which base runner is on
  const baseName = {
    "1st": "first",
    "2nd": "second",
    "3rd": "third",
  };
  const nextBase = { "1st": "2nd", "2nd": "3rd", "3rd": "home" };

  qs("modal-title").textContent = `Runner on ${base}`;
  qs(
    "modal-sub"
  ).textContent = `${label} — ${batter}. Where does the runner from ${base} go?`;

  // Reset base highlights
  ["1st", "2nd", "3rd", "home"].forEach((b) => {
    const el = qs("modal-" + b);
    if (el)
      el.className =
        "baserun-base baserun-" +
        (b === "2nd"
          ? "second"
          : b === "3rd"
          ? "third"
          : b === "1st"
          ? "first"
          : "home");
  });
  const srcEl = qs("modal-" + base);
  if (srcEl) srcEl.classList.add("runner-here");

  const qEl = qs("runner-queue");
  qEl.innerHTML = "";

  const addBtn = (label, value, extraClass = "") => {
    const btn = document.createElement("button");
    btn.className =
      "runner-move-btn" + (extraClass ? " " + extraClass : "");
    btn.innerHTML = label;
    btn.onclick = () => {
      S._raMoves[base] = value;
      S._raIdx++;
      _showNextRunnerAdvance();
    };
    qEl.appendChild(btn);
  };

  // Always offer: stays, advances, scores
  addBtn(`→ Stays on ${base}`, "stays");
  if (base !== "3rd") {
    addBtn(`→ Advances to ${nextBase[base]}`, nextBase[base]);
  }
  // From 1st can also reach 3rd on a long fly
  if (base === "1st") addBtn(`→ Advances to 3rd`, "3rd");
  addBtn(` Scores — +1 Run`, "home", "score-btn");
  // Thrown out options — show which base they were retired at
  const nextBases = {
    "1st": ["2nd", "3rd", "home"],
    "2nd": ["3rd", "home"],
    "3rd": ["home"],
  };
  (nextBases[base] || []).forEach((atBase) => {
    const btn2 = document.createElement("button");
    btn2.className = "runner-move-btn";
    btn2.style.cssText =
      "border-color:rgba(204,26,26,.3);color:var(--red)";
    btn2.innerHTML = `✕ Thrown out at ${
      atBase === "home" ? "home plate" : atBase
    }`;
    btn2.onclick = () => {
      S._raMoves[base] = "out:" + atBase;
      S._raIdx++;
      _showNextRunnerAdvance();
    };
    qEl.appendChild(btn2);
  });

  qs("baserun-modal").classList.add("active");
}

function _applyRunnerAdvance() {
  qs("baserun-modal").classList.remove("active");

  const newBases = { "1st": false, "2nd": false, "3rd": false };
  let runs = 0,
    basesOut = 0;

  // Copy over runners not in the queue (shouldn't happen but safety)
  ["1st", "2nd", "3rd"].forEach((b) => {
    if (S.bases[b] && !S._raQueue.includes(b)) newBases[b] = true;
  });

  for (const [from, to] of Object.entries(S._raMoves)) {
    if (to === "home") {
      runs++;
    } else if (to === "out" || to.startsWith("out:")) {
      basesOut++;
      S.outs++;
      if (to.startsWith("out:")) {
        const atBase = to.split(":")[1];
        logEvent(
          "🏷️",
          `Thrown out at ${atBase === "home" ? "home plate" : atBase}`,
          `Runner from ${from} retired`
        );
      }
    } else if (to === "stays") {
      newBases[from] = true;
    } else {
      newBases[to] = true;
    } // advanced to a base
  }

  S.bases = newBases;
  for (let i = 0; i < runs; i++) addRun();
  if (runs > 0) {
    const _raoBs = getBatterStats(currentBatterKey());
    _raoBs.rbi = (_raoBs.rbi || 0) + runs;
  }

  if (runs > 0) {
    toast(`${runs} run${runs > 1 ? "s" : ""} score on the play!`);
    logEvent(
      "🏃",
      `${runs} run${runs > 1 ? "s" : ""} score`,
      `${S._raLabel} — ${S._raBatter}`
    );
  }
  if (basesOut > 0 && S.outs >= 3) {
    // Extra outs recorded — check for end of inning
    S._raQueue = [];
    S._raMoves = {};
    S._raIdx = 0;
    const cb = S._raCallback;
    S._raCallback = null;
    handleThreeOuts();
    return;
  }

  updateScoreBug();
  renderBoxScore();
  S._raQueue = [];
  S._raMoves = {};
  S._raIdx = 0;
  const cb = S._raCallback;
  S._raCallback = null;
  if (cb) cb();
}

// ===================== SCORING =====================
function addRun(scoringBase) {
  const key = `${S.inning}-${S.isTop ? "t" : "b"}`;
  let ir = S.inningRuns.find((r) => r.key === key);
  if (!ir) {
    ir = { key, inning: S.inning, isTop: S.isTop, runs: 0 };
    S.inningRuns.push(ir);
  }
  ir.runs++;
  if (S.isTop) S.awayScore++;
  else S.homeScore++;
  // Credit R to the runner who scored
  const runnerName = scoringBase ? S.runnerNames[scoringBase] : null;
  if (runnerName) {
    const rKey = _batterKeyByName(runnerName);
    if (rKey) {
      const bs = getBatterStats(rKey);
      bs.r = (bs.r || 0) + 1;
    }
  }
  // Credit R allowed to the current pitcher (the one pitching when the run scores)
  {
    const _rp = activePitcher();
    if (_rp) _rp.r = (_rp.r || 0) + 1;
  }
  updateScoreBug();
  renderBoxScore();
}
function changeScore(team, d) {
  if (team === "away") S.awayScore = Math.max(0, S.awayScore + d);
  else S.homeScore = Math.max(0, S.homeScore + d);
  updateScoreBug();
  renderBoxScore();
}

// ===================== INNING =====================
function changeInning(d) {
  S.inning = Math.max(1, S.inning + d);
  updateScoreBug();
  logEvent(
    "",
    `Inning ${S.inning}`,
    `${S.isTop ? "Top" : "Bottom"} of ${S.inning} — ${awayName()} ${
      S.awayScore
    }, ${homeName()} ${S.homeScore}`
  );
}
function setHalf(half) {
  S.isTop = half === "top";
  clearAtBat();
  renderLineup();
  renderPitcherList();
  updateScoreBug();
  try {
    updateZoneHandednessLabels();
  } catch (e) {}
}

// ===================== BATTER FLOW =====================
function nextBatter() {
  const next = (currentBatterIdx() + 1) % currentLineup().length;
  setBatterIdx(next);
  S.balls = 0;
  S.strikes = 0;
  S.pitchCount = 0;
  resetPitchControls(true);
  clearPlayBlurb();
  renderLineup();
  updateScoreBug();
  renderLiveScoutingTab();
}
function handleThreeOuts() {
  toast("Three Outs! Switching sides.");
  logEvent(
    "⚾",
    `End of ${S.isTop ? "Top" : "Bottom"} ${S.inning}`,
    `${awayName()} ${S.awayScore}, ${homeName()} ${S.homeScore}`
  );
  // Advance past the batter who made the last out — correct batter leads off next time this team hits
  const nextIdx = (currentBatterIdx() + 1) % currentLineup().length;
  setBatterIdx(nextIdx);
  S.outs = 0;
  S.bases = { "1st": false, "2nd": false, "3rd": false };
  S.runnerNames = { "1st": null, "2nd": null, "3rd": null };
  if (!S.isTop) S.inning++;
  S.isTop = !S.isTop;
  clearAtBat();
  clearPlayBlurb();
  renderLineup();
  renderPitcherList();
  updateScoreBug();
  renderLiveScoutingTab();
  try {
    if (
      typeof _currentMobTab !== "undefined" &&
      _currentMobTab === "pitchers"
    )
      renderMobPitchers();
  } catch (e) {}
  // Autosave silently after every half-inning
  saveGame(true).catch(() => {});
}
function recordAtBatResult(type, label, rbi) {
  const key = currentBatterKey();
  const bs = getBatterStats(key);
  bs.pa++; // every result is a plate appearance
  if (type !== "BB" && type !== "HBP" && type !== "CI") bs.ab++;
  if (type === "H") bs.hits++;
  if (type === "BB") bs.bb++;
  if (type === "K") bs.k++;
  if (type === "HBP") bs.hbp++;
  if (type === "CI") bs.ci++;
  if (rbi) bs.rbi = (bs.rbi || 0) + rbi;
  if (!S.lineupResults[key]) S.lineupResults[key] = [];
  S.lineupResults[key].push({ type, label });
}

// ===================== PITCHERS =====================

// Returns the opponent object whose name matches a given team-name input value, or null.
function _getOppByTeamName(name) {
  if (!name || !_opponents || !_opponents.length) return null;
  return (
    _opponents.find(function (o) {
      return o.name === name;
    }) || null
  );
}

function toggleAddPitcherForm() {
  var _myTN = window._myTeamNameCache || "";
  // The PITCHING side is the opposite of the batting side
  var pitchingTeamName = S.isTop ? homeName() : awayName();
  var isMyTeamPitching = _myTN && pitchingTeamName === _myTN;
  var oppPitching = _getOppByTeamName(pitchingTeamName);

  if (isMyTeamPitching) {
    // My Team is pitching — show My Team pitcher picker
    var pitchers = (myTeamRoster || []).filter(function (p) {
      return ["RHP", "LHP", "P", "UTL/RHP", "C/RHP", "3B/RHP"].includes(
        p.pos
      );
    });
    if (pitchers.length > 0) {
      showPitcherPicker(pitchers);
    } else {
      qs("add-pitcher-form").classList.toggle("open");
    }
  } else if (
    oppPitching &&
    oppPitching.roster &&
    oppPitching.roster.length > 0
  ) {
    // An opponent is pitching — show opponent pitcher picker
    var oppPitchers = oppPitching.roster.filter(function (p) {
      return ["RHP", "LHP", "P", "UTL/RHP", "C/RHP", "3B/RHP"].includes(
        p.pos
      );
    });
    if (oppPitchers.length > 0) {
      showOppPitcherPicker(oppPitchers, activePitcherList());
    } else {
      qs("add-pitcher-form").classList.toggle("open");
    }
  } else {
    // No roster loaded — fall back to manual entry form
    qs("add-pitcher-form").classList.toggle("open");
  }
}

function showOppPitcherPicker(pitchers, pitcherList) {
  var existing = document.getElementById("pitcher-picker-overlay");
  if (existing) {
    existing.remove();
    return;
  }
  var overlay = document.createElement("div");
  overlay.id = "pitcher-picker-overlay";
  overlay.style.cssText =
    "position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:2000;display:flex;align-items:center;justify-content:center";
  var panel = document.createElement("div");
  panel.style.cssText =
    "background:var(--surface2);border:1.5px solid var(--border2);border-radius:14px;width:min(400px,95vw);max-height:80vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.5)";
  var hdr = document.createElement("div");
  hdr.style.cssText =
    "padding:14px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0";
  hdr.innerHTML =
    '<div><div style="font-family:Barlow Condensed,sans-serif;font-weight:900;font-size:18px;color:var(--text)">Bring In Pitcher</div>' +
    '<div style="font-size:11px;color:var(--text3);margin-top:2px">Select from opponent roster</div></div>';
  var xBtn = document.createElement("button");
  xBtn.textContent = "×";
  xBtn.style.cssText =
    "background:none;border:none;font-size:22px;color:var(--text3);cursor:pointer;padding:0 6px;line-height:1";
  xBtn.onclick = function () {
    overlay.remove();
  };
  hdr.appendChild(xBtn);
  panel.appendChild(hdr);
  var list = document.createElement("div");
  list.style.cssText = "overflow-y:auto;flex:1;padding:8px";
  var sorted = pitchers.slice().sort(function (a, b) {
    return parseInt(a.num || 99) - parseInt(b.num || 99);
  });
  sorted.forEach(function (p) {
    var hand = (p.throw || "R") === "L" ? "LHP" : "RHP";
    var card = document.createElement("div");
    card.style.cssText =
      "display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:8px;cursor:pointer;transition:background .1s;border-bottom:1px solid var(--border)";
    card.innerHTML =
      '<div style="font-family:Barlow Condensed,sans-serif;font-weight:900;font-size:17px;color:#1a5acc;width:32px;text-align:right;flex-shrink:0">#' +
      (p.num || "—") +
      "</div>" +
      '<div style="flex:1"><div style="font-family:Barlow Condensed,sans-serif;font-weight:700;font-size:14px;color:var(--text)">' +
      p.name +
      "</div>" +
      '<div style="font-size:10px;color:var(--text3)">' +
      hand +
      (p.ht ? " · " + p.ht : "") +
      "</div></div>" +
      '<div style="font-size:11px;color:#1a5acc;font-family:Barlow Condensed,sans-serif;font-weight:700">Bring In →</div>';
    card.addEventListener("mouseover", function () {
      this.style.background = "var(--surface3)";
    });
    card.addEventListener("mouseout", function () {
      this.style.background = "";
    });
    card.addEventListener("click", function () {
      overlay.remove();
      pitcherList.forEach(function (x) {
        x.active = false;
      });
      // Replace default placeholder if it has no pitches
      var isDefault =
        pitcherList.length === 1 &&
        (!pitcherList[0].name ||
          /^Pitcher/.test(pitcherList[0].name)) &&
        pitcherList[0].pitches === 0;
      var entry = {
        name: p.name,
        num: p.num || "",
        hand: p.throw || "R",
        pitchTypes: p.pitchTypes || [],
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
      if (isDefault) {
        pitcherList[0] = entry;
      } else {
        pitcherList.push(entry);
      }
      renderPitcherList();
      updateScoreBug();
      renderPitchTypeGrid(entry.pitchTypes);
      S.selectedPitchType = null;
      logEvent(
        "🔄",
        "Pitching Change",
        "#" + (p.num || "?") + " " + p.name + " now pitching"
      );
      toast(p.name + " now pitching");
    });
    list.appendChild(card);
  });
  panel.appendChild(list);
  var footer = document.createElement("div");
  footer.style.cssText =
    "padding:10px;border-top:1px solid var(--border);flex-shrink:0";
  var manualBtn = document.createElement("button");
  manualBtn.textContent = "+ Enter manually";
  manualBtn.style.cssText =
    "width:100%;padding:8px;background:none;border:1px dashed var(--border2);border-radius:7px;color:var(--text3);font-family:Barlow Condensed,sans-serif;font-weight:700;font-size:12px;cursor:pointer";
  manualBtn.addEventListener("click", function () {
    overlay.remove();
    qs("add-pitcher-form").classList.add("open");
  });
  footer.appendChild(manualBtn);
  panel.appendChild(footer);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) overlay.remove();
  });
}

function showPitcherPicker(pitchers) {
  var existing = document.getElementById("pitcher-picker-overlay");
  if (existing) {
    existing.remove();
    return;
  }
  var overlay = document.createElement("div");
  overlay.id = "pitcher-picker-overlay";
  overlay.style.cssText =
    "position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:2000;display:flex;align-items:center;justify-content:center";
  var panel = document.createElement("div");
  panel.style.cssText =
    "background:var(--surface2);border:1.5px solid var(--border2);border-radius:14px;width:min(400px,95vw);max-height:80vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.5)";
  // Header
  var hdr = document.createElement("div");
  hdr.style.cssText =
    "padding:14px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0";
  hdr.innerHTML =
    '<div><div style="font-family:Barlow Condensed,sans-serif;font-weight:900;font-size:18px;color:var(--text)">Bring In Pitcher</div>' +
    '<div style="font-size:11px;color:var(--text3);margin-top:2px">Select from your roster</div></div>';
  var xBtn = document.createElement("button");
  xBtn.textContent = "×";
  xBtn.style.cssText =
    "background:none;border:none;font-size:22px;color:var(--text3);cursor:pointer;padding:0 6px;line-height:1";
  xBtn.onclick = function () {
    overlay.remove();
  };
  hdr.appendChild(xBtn);
  panel.appendChild(hdr);
  // Pitcher list
  var sorted = pitchers.slice().sort(function (a, b) {
    return parseInt(a.num || 99) - parseInt(b.num || 99);
  });
  var list = document.createElement("div");
  list.style.cssText = "overflow-y:auto;flex:1;padding:8px";
  sorted.forEach(function (p) {
    var hand = (p.throw || "R") === "L" ? "LHP" : "RHP";
    var card = document.createElement("div");
    card.style.cssText =
      "display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:8px;cursor:pointer;transition:background .1s;border-bottom:1px solid var(--border)";
    card.innerHTML =
      '<div style="font-family:Barlow Condensed,sans-serif;font-weight:900;font-size:17px;color:var(--blue);width:32px;text-align:right;flex-shrink:0">#' +
      (p.num || "—") +
      "</div>" +
      '<div style="flex:1"><div style="font-family:Barlow Condensed,sans-serif;font-weight:700;font-size:14px;color:var(--text)">' +
      p.name +
      "</div>" +
      '<div style="font-size:10px;color:var(--text3)">' +
      hand +
      (p.ht ? " · " + p.ht : "") +
      "</div></div>" +
      '<div style="font-size:11px;color:var(--blue);font-family:Barlow Condensed,sans-serif;font-weight:700">Bring In →</div>';
    card.addEventListener("mouseover", function () {
      this.style.background = "var(--surface3)";
    });
    card.addEventListener("mouseout", function () {
      this.style.background = "";
    });
    card.addEventListener("click", function () {
      overlay.remove();
      activePitcherList().forEach(function (x) {
        x.active = false;
      });
      var entry = {
        name: p.name,
        num: p.num || "",
        hand: p.throw || "R",
        pitchTypes: p.pitchTypes || [],
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
      activePitcherList().push(entry);
      renderPitcherList();
      updateScoreBug();
      renderPitchTypeGrid(entry.pitchTypes);
      S.selectedPitchType = null;
      toast(p.name + " now pitching");
    });
    list.appendChild(card);
  });
  panel.appendChild(list);
  // Manual entry fallback
  var footer = document.createElement("div");
  footer.style.cssText =
    "padding:10px;border-top:1px solid var(--border);flex-shrink:0";
  var manualBtn = document.createElement("button");
  manualBtn.textContent = "+ Enter manually";
  manualBtn.style.cssText =
    "width:100%;padding:8px;background:none;border:1px dashed var(--border2);border-radius:7px;color:var(--text3);font-family:Barlow Condensed,sans-serif;font-weight:700;font-size:12px;cursor:pointer";
  manualBtn.addEventListener("click", function () {
    overlay.remove();
    qs("add-pitcher-form").classList.add("open");
  });
  footer.appendChild(manualBtn);
  panel.appendChild(footer);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) overlay.remove();
  });
}
function addPitcher() {
  const name = qs("new-p-name").value.trim();
  const num = qs("new-p-num").value.trim();
  const hand = qs("new-p-hand")?.value || "R";
  if (!name) return;
  activePitcherList().forEach((p) => (p.active = false));
  activePitcherList().push({
    name,
    num,
    hand,
    pitchTypes: [],
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
    poAtt: 0,
    poOuts: 0,
    active: true,
  });
  qs("new-p-name").value = "";
  qs("new-p-num").value = "";
  qs("add-pitcher-form").classList.remove("open");
  renderPitcherList();
  updateScoreBug();
  renderPitchTypeGrid([]);
  S.selectedPitchType = null;
  toast(`Pitching: #${num} ${name}`);
}
function removePitcher(e, i) {
  e.stopPropagation();
  const list = activePitcherList();
  if (list.length <= 1) {
    toast("Need at least one pitcher.");
    return;
  }
  list.splice(i, 1);
  if (!list.some((p) => p.active)) list[list.length - 1].active = true;
  renderPitcherList();
  updateScoreBug();
}
function setActivePitcher(i) {
  activePitcherList().forEach((p, j) => (p.active = i === j));
  const p = activePitcherList()[i];
  renderPitcherList();
  updateScoreBug();
  toast(`Pitching change: ${p.name}`);
  logEvent(
    "🔄",
    `Pitching Change`,
    `#${p.num || "?"} ${p.name} now pitching`
  );
  // Update pitch type grid for this pitcher's repertoire
  renderPitchTypeGrid(p.pitchTypes || []);
  S.selectedPitchType = null;
}
let editingPitcher = null; // index into activePitcherList()

function renderPitcherList() {
  const list = activePitcherList();
  const el = qs("pitcher-list");
  el.innerHTML = "";
  list.forEach((p, i) => {
    const div = document.createElement("div");
    const isEditing = editingPitcher === i;

    if (isEditing) {
      div.className = "pitcher-card";
      div.style.flexWrap = "wrap";
      div.style.gap = "6px";
      div.innerHTML = `
<div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:10px;color:var(--text3);width:100%;letter-spacing:1px;text-transform:uppercase">Edit Pitcher</div>
<input class="setup-input num-in" id="edit-p-num-${i}"  value="${
        p.num || ""
      }"  placeholder="#"    style="width:38px;flex-shrink:0;padding:5px 4px;text-align:center;font-size:13px">
<input class="setup-input"        id="edit-p-name-${i}" value="${
        p.name || ""
      }" placeholder="Name..." style="flex:1;font-size:13px">
<select id="edit-p-hand-${i}" style="background:var(--surface3);border:1px solid var(--border2);border-radius:4px;color:var(--text);font-family:'Barlow Condensed',sans-serif;font-size:13px;padding:4px 5px;outline:none;cursor:pointer;flex-shrink:0"><option value="R"${
        (p.hand || "R") === "R" ? " selected" : ""
      }>R</option><option value="L"${
        p.hand === "L" ? " selected" : ""
      }>L</option></select>
<button onclick="savePitcherEdit(${i})" style="background:var(--accent);border:none;border-radius:5px;color:var(--bg);font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:13px;padding:5px 10px;cursor:pointer;flex-shrink:0">✓</button>
<button onclick="cancelPitcherEdit()" style="background:none;border:1px solid var(--border);border-radius:5px;color:var(--text3);padding:6px 7px;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="1" y1="1" x2="11" y2="11"/><line x1="11" y1="1" x2="1" y2="11"/></svg></button>
      `;
      setTimeout(() => {
        const n = qs(`edit-p-name-${i}`);
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
  <div class="pitcher-card-name"><span style="color:var(--text3);font-size:12px;margin-right:4px">#${
    p.num || "?"
  }</span>${p.name} <span style="font-size:9px;font-weight:700;color:${
        (p.hand || "R") === "L" ? "var(--blue)" : "var(--text3)"
      };letter-spacing:1px;margin-left:2px">${p.hand || "R"}HP</span>${
        p.active
          ? ' <span style="font-size:9px;color:var(--accent);letter-spacing:1px">NOW</span>'
          : ""
      }</div>
  <div class="pitcher-card-stats">${p.pitches}P · ${p.strikes}str · ${
        p.k
      }K · ${p.bb}BB · ${p.hits}H${
        p.swings || p.looks
          ? " · " + p.swings + "sw/" + p.looks + "lk"
          : ""
      }</div>
</div>
<button onclick="startPitcherEdit(event,${i})" title="Edit" style="background:none;border:1px solid var(--border);border-radius:3px;color:var(--text3);font-size:10px;padding:2px 5px;cursor:pointer;opacity:0;transition:all .12s" class="pitcher-edit-btn">✎</button>
<button class="pitcher-del" onclick="removePitcher(event,${i})">✕</button>
      `;
      div.onclick = (e) => {
        if (
          e.target.closest(".pitcher-del") ||
          e.target.closest(".pitcher-edit-btn")
        )
          return;
        setActivePitcher(i);
      };
    }
    // Show edit btn on hover
    if (!isEditing) {
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
  // Always sync pitch grid to active pitcher — most reliable hook since
  // renderPitcherList() is called after every pitch, undo, resume, and change.
  try {
    renderPitchTypeGrid(_resolveActivePitcherTypes(activePitcher()));
  } catch (e) {}
}
function startPitcherEdit(e, i) {
  e.stopPropagation();
  editingPitcher = i;
  renderPitcherList();
}
function _syncLineupPitchers() {
  try {
    renderLineupPitchers();
  } catch (e) {}
}
function savePitcherEdit(i) {
  const list = activePitcherList();
  const n = qs(`edit-p-name-${i}`)?.value.trim();
  const num = qs(`edit-p-num-${i}`)?.value.trim();
  const hand = qs(`edit-p-hand-${i}`)?.value || "R";
  if (n) list[i].name = n;
  list[i].num = num || list[i].num;
  list[i].hand = hand;
  editingPitcher = null;
  renderPitcherList();
  updateScoreBug();
}
function cancelPitcherEdit() {
  editingPitcher = null;
  renderPitcherList();
}

// ===================== LINEUP =====================
let editingSlot = null;
function renderLineup() {
  const lineup = currentLineup();
  const idx = currentBatterIdx() % lineup.length;
  qs("lineup-batting-label").textContent = S.isTop
    ? "AWAY BATTING"
    : "HOME BATTING";
  renderLineupPitchers();
  const list = qs("lineup-list");
  list.innerHTML = "";
  lineup.forEach((b, i) => {
    const slot = document.createElement("div");
    const isActive = i === idx;
    const isEditing =
      editingSlot &&
      editingSlot.side === (S.isTop ? "away" : "home") &&
      editingSlot.idx === i;
    const key = getBatterKey(S.isTop, i);
    const results = S.lineupResults[key] || [];
    const chips = results
      .slice(-4)
      .map(
        (r) => `<span class="at-bat-result ${r.type}">${r.label}</span>`
      )
      .join("");
    if (isEditing) {
      slot.className = "lineup-slot editing";
      slot.innerHTML = `
<!-- Title + save/cancel in same row -->
<div style="display:flex;align-items:center;justify-content:space-between;width:100%;margin-bottom:5px">
  <div style="font-size:8px;letter-spacing:2px;color:var(--text3);text-transform:uppercase;font-weight:700">${
    i + 1
  }. Player</div>
  <div style="display:flex;gap:3px">
    <button class="lineup-edit-save"   onclick="saveLineupSlot(${i})">✓</button>
    <button class="lineup-edit-cancel" onclick="cancelEdit()" style="display:flex;align-items:center;justify-content:center;padding:5px 7px"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="1" y1="1" x2="11" y2="11"/><line x1="11" y1="1" x2="1" y2="11"/></svg></button>
  </div>
</div>
<!-- Row 1: inputs only, full width -->
<div style="display:flex;gap:4px;align-items:center;width:100%;margin-bottom:6px">
  <input class="lineup-edit-input num-in"  id="edit-num-${i}"  value="${
        b.num || ""
      }" placeholder="#" maxlength="3">
  <input class="lineup-edit-input name-in" id="edit-name-${i}" value="${
        b.name
      }"    placeholder="Name..." style="min-width:0">
  <input class="lineup-edit-input pos-in"  id="edit-pos-${i}"  value="${
        b.pos
      }"     placeholder="POS" maxlength="3">
  <select id="edit-hand-${i}" style="background:var(--surface3);border:1px solid var(--border2);border-radius:4px;color:var(--text);font-family:'Barlow Condensed',sans-serif;font-size:13px;padding:4px 5px;outline:none;cursor:pointer;flex-shrink:0">
    <option value="R"${b.hand === "R" ? " selected" : ""}>R</option>
    <option value="L"${b.hand === "L" ? " selected" : ""}>L</option>
    <option value="S"${b.hand === "S" ? " selected" : ""}>S</option>
  </select>
</div>
<!-- Row 2: substitution type pills -->
<div style="font-size:8px;letter-spacing:2px;color:var(--text3);text-transform:uppercase;font-weight:700;margin-bottom:4px">Substitution</div>
<div style="display:flex;gap:5px;flex-wrap:wrap">
  ${["PH", "PR", "DEF"]
    .map((type) => {
      const active =
        type === "PH" ? b.isPH : type === "PR" ? b.isPR : b.isDEF;
      const label =
        type === "PH"
          ? "Pinch Hitter"
          : type === "PR"
          ? "Pinch Runner"
          : "Defensive Sub";
      return `<button onclick="toggleInlineSub('${type}',${i})" id="inline-${type.toLowerCase()}-${i}"
      style="padding:4px 10px;border:1.5px solid ${
        active ? "var(--accent)" : "var(--border2)"
      };border-radius:5px;
      background:${active ? "rgba(204,26,26,.08)" : "none"};
      color:${active ? "var(--accent)" : "var(--text3)"};
      font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:10px;letter-spacing:.5px;
      cursor:pointer;transition:all .14s;white-space:nowrap">
      ${active ? "✓ " : ""} ${label}
    </button>`;
    })
    .join("")}
</div>
      `;
      setTimeout(() => {
        const n = qs(`edit-name-${i}`);
        if (n) {
          n.focus();
          n.select();
        }
      }, 30);
    } else {
      slot.className = "lineup-slot" + (isActive ? " active" : "");
      slot.setAttribute("ondragover", "lineupSlotDragOver(event)");
      slot.setAttribute("ondragleave", "lineupSlotDragLeave(event)");
      slot.setAttribute(
        "ondrop",
        "lineupSlotDrop(event," +
          i +
          "," +
          (S.isTop ? "true" : "false") +
          ")"
      );
      slot.style.transition = "background .1s,border-color .1s";
      slot.innerHTML = `
<div class="lineup-order-num">${i + 1}</div>
<div class="lineup-jersey">#${b.num || "—"}</div>
<div class="lineup-info">
  <div class="lineup-name">${
    b.name
  } <span style="font-size:9px;font-weight:700;color:${
        b.hand === "L"
          ? "var(--blue)"
          : b.hand === "S"
          ? "var(--foul)"
          : "var(--text3)"
      };letter-spacing:1px;margin-left:2px">${b.hand || "R"}</span>${
        b.isPH
          ? '<span style="font-size:9px;font-weight:800;color:var(--accent);letter-spacing:1px;margin-left:4px;background:rgba(204,26,26,.08);padding:1px 4px;border-radius:3px">PH</span>'
          : ""
      }${
        b.isPR
          ? '<span style="font-size:9px;font-weight:800;color:var(--blue);letter-spacing:1px;margin-left:4px;background:rgba(26,90,204,.08);padding:1px 4px;border-radius:3px">PR</span>'
          : ""
      }${
        b.isDEF
          ? '<span style="font-size:9px;font-weight:800;color:var(--green);letter-spacing:1px;margin-left:4px;background:rgba(26,138,58,.08);padding:1px 4px;border-radius:3px">DEF</span>'
          : ""
      }</div>
  <div class="lineup-sub"><span class="lineup-pos">${
    b.pos
  }</span>${chips}</div>
</div>
<button class="lineup-edit-btn" onclick="startEdit(event,${i})">✎</button>
      `;
      slot.querySelector(".lineup-info").onclick = () => {
        setBatterIdx(i);
        clearAtBat();
      };
      slot.querySelector(".lineup-order-num").onclick = () => {
        setBatterIdx(i);
        clearAtBat();
      };
    }
    list.appendChild(slot);
  });
}
function startEdit(e, i) {
  e.stopPropagation();
  editingSlot = { side: S.isTop ? "away" : "home", idx: i };
  renderLineup();
}
function saveLineupSlot(i) {
  const lineup = currentLineup();
  const n = qs(`edit-name-${i}`).value.trim();
  const pos = qs(`edit-pos-${i}`).value.trim().toUpperCase();
  const num = qs(`edit-num-${i}`).value.trim();
  const hand = qs(`edit-hand-${i}`)?.value || "R";
  if (n) lineup[i].name = n;
  if (pos) lineup[i].pos = pos;
  lineup[i].num = num;
  lineup[i].hand = hand;
  // isPH preserved via toggleInlinePH — no need to read here
  editingSlot = null;
  renderLineup();
  updateScoreBug();
}
function cancelEdit() {
  editingSlot = null;
  renderLineup();
}

function toggleInlineSub(type, i) {
  var _myTN = window._myTeamNameCache || "";
  var battingTeamName = S.isTop ? awayName() : homeName();
  var isMyTeamBatting = _myTN && battingTeamName === _myTN;
  // If My Team is batting and has position players, show My Team roster picker
  if (isMyTeamBatting && myTeamRoster && myTeamRoster.length > 0) {
    showInlineSubPicker(type, i);
    return;
  }
  // If an opponent is batting and has a roster, show opponent roster picker
  var oppBatting = _getOppByTeamName(battingTeamName);
  if (oppBatting && oppBatting.roster && oppBatting.roster.length > 0) {
    showOppInlineSubPicker(type, i, oppBatting);
    return;
  }
  // Fallback: just toggle flag
  const lineup = currentLineup();
  const key = type === "PH" ? "isPH" : type === "PR" ? "isPR" : "isDEF";
  lineup[i][key] = !lineup[i][key];
  const btn = document.getElementById(
    `inline-${type.toLowerCase()}-${i}`
  );
  if (btn) {
    const active = lineup[i][key];
    const label =
      type === "PH"
        ? "Pinch Hitter"
        : type === "PR"
        ? "Pinch Runner"
        : "Defensive Sub";
    btn.style.borderColor = active ? "var(--accent)" : "var(--border2)";
    btn.style.background = active ? "rgba(204,26,26,.08)" : "none";
    btn.style.color = active ? "var(--accent)" : "var(--text3)";
    btn.innerHTML = (active ? "✓ " : " ") + label;
  }
}
// Legacy alias
function toggleInlinePH(i) {
  toggleInlineSub("PH", i);
}

function showOppInlineSubPicker(type, slotIdx, opp) {
  var existing = document.getElementById("inline-sub-picker");
  if (existing) {
    existing.remove();
    return;
  }
  var labels = {
    PH: "Pinch Hitter",
    PR: "Pinch Runner",
    DEF: "Defensive Sub",
  };
  var isPitch = function (p) {
    return ["RHP", "LHP", "P", "UTL/RHP", "C/RHP", "3B/RHP"].includes(
      p.pos
    );
  };
  var posOrder = [
    "C",
    "C/2B",
    "1B",
    "2B",
    "3B",
    "SS",
    "INF",
    "INF/OF",
    "1B/OF",
    "OF",
    "LF",
    "CF",
    "RF",
    "DH",
    "UTL",
  ];
  var players = (opp.roster || [])
    .filter(function (p) {
      return !isPitch(p);
    })
    .sort(function (a, b) {
      var ai = posOrder.indexOf(a.pos),
        bi = posOrder.indexOf(b.pos);
      if (ai < 0) ai = 50;
      if (bi < 0) bi = 50;
      return ai !== bi
        ? ai - bi
        : parseInt(a.num || 99) - parseInt(b.num || 99);
    });
  var overlay = document.createElement("div");
  overlay.id = "inline-sub-picker";
  overlay.style.cssText =
    "position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:2000;display:flex;align-items:center;justify-content:center";
  var panel = document.createElement("div");
  panel.style.cssText =
    "background:var(--surface2);border:1.5px solid var(--border2);border-radius:14px;width:min(400px,95vw);max-height:80vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.5)";
  var hdr = document.createElement("div");
  hdr.style.cssText =
    "padding:14px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0";
  var outgoing = currentLineup()[slotIdx];
  hdr.innerHTML =
    '<div><div style="font-family:Barlow Condensed,sans-serif;font-weight:900;font-size:18px;color:var(--text)">Select ' +
    (labels[type] || type) +
    "</div>" +
    '<div style="font-size:11px;color:var(--text3);margin-top:2px">Replacing: <strong>' +
    ((outgoing && outgoing.name) || "slot " + (slotIdx + 1)) +
    "</strong> · " +
    opp.name +
    "</div></div>";
  var xBtn = document.createElement("button");
  xBtn.textContent = "×";
  xBtn.style.cssText =
    "background:none;border:none;font-size:22px;color:var(--text3);cursor:pointer;padding:0 6px;line-height:1";
  xBtn.onclick = function () {
    overlay.remove();
  };
  hdr.appendChild(xBtn);
  panel.appendChild(hdr);
  var list = document.createElement("div");
  list.style.cssText = "overflow-y:auto;flex:1;padding:8px";
  if (!players.length) {
    list.innerHTML =
      '<div style="padding:24px;text-align:center;color:var(--text3);font-size:13px">No position players in ' +
      opp.name +
      "'s roster</div>";
  } else {
    players.forEach(function (p) {
      var card = document.createElement("div");
      card.style.cssText =
        "display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:8px;cursor:pointer;transition:background .1s;border-bottom:1px solid var(--border)";
      card.innerHTML =
        '<div style="font-family:Barlow Condensed,sans-serif;font-weight:900;font-size:17px;color:#1a5acc;width:32px;text-align:right;flex-shrink:0">#' +
        (p.num || "—") +
        "</div>" +
        '<div style="flex:1"><div style="font-family:Barlow Condensed,sans-serif;font-weight:700;font-size:14px;color:var(--text)">' +
        p.name +
        "</div>" +
        '<div style="font-size:10px;color:var(--text3)">' +
        (p.pos || "—") +
        " · " +
        (p.bat || "R") +
        "/" +
        (p.throw || "R") +
        (p.ht ? " · " + p.ht : "") +
        "</div></div>" +
        '<div style="font-size:11px;color:#1a5acc;font-family:Barlow Condensed,sans-serif;font-weight:700">Select →</div>';
      card.addEventListener("mouseover", function () {
        this.style.background = "var(--surface3)";
      });
      card.addEventListener("mouseout", function () {
        this.style.background = "";
      });
      card.addEventListener("click", function () {
        overlay.remove();
        var lineup = currentLineup();
        var outName = (lineup[slotIdx] && lineup[slotIdx].name) || "";
        lineup[slotIdx] = {
          name: p.name,
          num: p.num || String(slotIdx + 1),
          pos: p.pos || "OF",
          hand: p.bat || "R",
          isPH: type === "PH",
          isPR: type === "PR",
          isDEF: type === "DEF",
        };
        if (type === "PR" && outName) {
          ["1st", "2nd", "3rd"].forEach(function (base) {
            if (S.runnerNames[base] === outName)
              S.runnerNames[base] = p.name;
          });
        }
        renderLineup();
        updateScoreBug();
        toast(
          p.name +
            " in as " +
            (labels[type] || type) +
            (outName ? " for " + outName : "")
        );
      });
      list.appendChild(card);
    });
  }
  panel.appendChild(list);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) overlay.remove();
  });
}

function showInlineSubPicker(type, slotIdx) {
  var existing = document.getElementById("inline-sub-picker");
  if (existing) {
    existing.remove();
    return;
  }
  var labels = {
    PH: "Pinch Hitter",
    PR: "Pinch Runner",
    DEF: "Defensive Sub",
  };
  var overlay = document.createElement("div");
  overlay.id = "inline-sub-picker";
  overlay.style.cssText =
    "position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:2000;display:flex;align-items:center;justify-content:center";
  var panel = document.createElement("div");
  panel.style.cssText =
    "background:var(--surface2);border:1.5px solid var(--border2);border-radius:14px;width:min(400px,95vw);max-height:80vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.5)";
  // Header
  var hdr = document.createElement("div");
  hdr.style.cssText =
    "padding:14px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0";
  var outgoing = currentLineup()[slotIdx];
  hdr.innerHTML =
    '<div><div style="font-family:Barlow Condensed,sans-serif;font-weight:900;font-size:18px;color:var(--text)">Select ' +
    (labels[type] || type) +
    "</div>" +
    '<div style="font-size:11px;color:var(--text3);margin-top:2px">Replacing: <strong>' +
    ((outgoing && outgoing.name) || "slot " + (slotIdx + 1)) +
    "</strong></div></div>";
  var xBtn = document.createElement("button");
  xBtn.textContent = "×";
  xBtn.style.cssText =
    "background:none;border:none;font-size:22px;color:var(--text3);cursor:pointer;padding:0 6px;line-height:1";
  xBtn.onclick = function () {
    overlay.remove();
  };
  hdr.appendChild(xBtn);
  panel.appendChild(hdr);
  // Player list — position players only (no pitchers)
  var isPitch = function (p) {
    return ["RHP", "LHP", "P", "UTL/RHP", "C/RHP", "3B/RHP"].includes(
      p.pos
    );
  };
  var posOrder = [
    "C",
    "C/2B",
    "1B",
    "2B",
    "3B",
    "SS",
    "INF",
    "INF/OF",
    "1B/OF",
    "OF",
    "LF",
    "CF",
    "RF",
    "DH",
    "UTL",
  ];
  var players = myTeamRoster
    .filter(function (p) {
      return !isPitch(p);
    })
    .sort(function (a, b) {
      var ai = posOrder.indexOf(a.pos),
        bi = posOrder.indexOf(b.pos);
      if (ai < 0) ai = 50;
      if (bi < 0) bi = 50;
      return ai !== bi
        ? ai - bi
        : parseInt(a.num || 99) - parseInt(b.num || 99);
    });
  var list = document.createElement("div");
  list.style.cssText = "overflow-y:auto;flex:1;padding:8px";
  if (!players.length) {
    list.innerHTML =
      '<div style="padding:24px;text-align:center;color:var(--text3);font-size:13px">No position players in roster</div>';
  } else {
    players.forEach(function (p) {
      var card = document.createElement("div");
      card.style.cssText =
        "display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:8px;cursor:pointer;transition:background .1s;border-bottom:1px solid var(--border)";
      card.innerHTML =
        '<div style="font-family:Barlow Condensed,sans-serif;font-weight:900;font-size:17px;color:var(--accent);width:32px;text-align:right;flex-shrink:0">#' +
        (p.num || "—") +
        "</div>" +
        '<div style="flex:1"><div style="font-family:Barlow Condensed,sans-serif;font-weight:700;font-size:14px;color:var(--text)">' +
        p.name +
        "</div>" +
        '<div style="font-size:10px;color:var(--text3)">' +
        (p.pos || "—") +
        " · " +
        (p.bat || "R") +
        "/" +
        (p.throw || "R") +
        (p.ht ? " · " + p.ht : "") +
        "</div></div>" +
        '<div style="font-size:11px;color:var(--blue);font-family:Barlow Condensed,sans-serif;font-weight:700">Select →</div>';
      card.addEventListener("mouseover", function () {
        this.style.background = "var(--surface3)";
      });
      card.addEventListener("mouseout", function () {
        this.style.background = "";
      });
      card.addEventListener("click", function () {
        overlay.remove();
        // Apply the sub
        var lineup = currentLineup();
        var outName = (lineup[slotIdx] && lineup[slotIdx].name) || "";
        lineup[slotIdx] = {
          name: p.name,
          num: p.num || String(slotIdx + 1),
          pos: p.pos || "OF",
          hand: p.bat || "R",
          isPH: type === "PH",
          isPR: type === "PR",
          isDEF: type === "DEF",
        };
        if (type === "PR" && outName) {
          ["1st", "2nd", "3rd"].forEach(function (base) {
            if (S.runnerNames[base] === outName)
              S.runnerNames[base] = p.name;
          });
        }
        renderLineup();
        updateScoreBug();
        var lbl = labels[type] || type;
        toast(
          p.name + " in as " + lbl + (outName ? " for " + outName : "")
        );
      });
      list.appendChild(card);
    });
  }
  panel.appendChild(list);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) overlay.remove();
  });
}

// ===================== PITCH LOG =====================
function renderPitchLog() {
  const log = qs("pitch-log");
  log.innerHTML = "";
  if (!S.pitchLog.length) {
    log.innerHTML =
      '<div style="padding:20px;text-align:center;color:var(--text3);font-size:12px">No pitches yet.</div>';
    return;
  }
  S.pitchLog.forEach((e) => {
    const d = document.createElement("div");
    d.className = "pitch-log-entry";
    d.innerHTML = `
      <div class="log-num">${e.num}</div>
      <div class="log-dot" style="background:${dotColor(e.dotClass)}"></div>
      <div class="log-outcome" style="color:${dotColor(e.dotClass)}">${
      e.label
    }</div>
      <div class="log-vel">${e.velocity ? e.velocity : "—"}</div>
      <div class="log-type">
${e.batter}${e.pitchType !== "—" ? " · " + e.pitchType : ""}
<span style="color:var(--text3);font-size:8px"> ${e.loc || ""}</span>
${
  e.spray
    ? `<span style="color:var(--accent);font-size:9px;margin-left:3px">${sprayBtypeIcon(
        e.spray.btype
      )} ${sprayBtypeLabel(e.spray.btype)}${
        e.spray.hardHit ? " 🔴" : ""
      } · ${e.spray.zone}</span>`
    : ""
}
      </div>
      <div class="log-count">${e.balls}-${e.strikes}</div>
    `;
    log.appendChild(d);
  });
  // sync mobile log panel
  try {
    if (
      typeof _currentMobTab !== "undefined" &&
      _currentMobTab === "log" &&
      _mobLogTab === "pitchlog"
    )
      renderMobLog("pitchlog");
  } catch (e) {}
}
function clearLog() {
  S.pitchLog = [];
  renderPitchLog();
}

// ===================== UNDO =====================
function undoLastPitch() {
  if (!_undoStack.length) {
    toast("Nothing to undo.");
    return;
  }
  const snap = _undoStack.pop();
  _restoreSnapshot(snap);

  // Close any open modals that may be waiting for input
  [
    "error-modal",
    "spray-modal",
    "fielder-modal",
    "pitch-clock-modal",
    "runner-action-modal",
    "dp-modal",
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });
  // baserun-modal uses classList.add("active") — must close the same way
  const baserunEl = document.getElementById("baserun-modal");
  if (baserunEl) {
    baserunEl.classList.remove("active");
    baserunEl.style.display = ""; // clear any inline override
  }
  // Restore base onclick handlers in case they were overridden by showForceOutQuestion
  ["1st", "2nd", "3rd"].forEach((b) => {
    const bEl = document.getElementById("modal-" + b);
    if (bEl) {
      bEl.classList.remove("runner-here");
      bEl.onclick = () => quickRunnerDest(b);
    }
  });

  // Clear any pending state
  S.pendingErrorEntry = null;
  S.modalHit = null;
  S.runnerQueue = [];
  S.runnerMoves = {};
  S.currentQueueIdx = 0;
  sprayCallback = null;
  sprayEntry = null;
  dpCallback = null;

  // Re-render everything
  try {
    renderPitchTypeGrid(_resolveActivePitcherTypes(activePitcher()));
  } catch (e) {}
  resetPitchControls(false); // clear outcome/type selection, keep zone dots from restored pitchLog
  renderPitchZoneFromLog(); // redraw dots from restored pitchLog
  renderPitchLog();
  renderPitcherList();
  renderPitchMix();
  renderLineup();
  renderBoxScore();
  updateScoreBug();
  clearPlayBlurb();
  try {
    renderMobPitchers();
  } catch (e) {}
  try {
    renderMobLineup();
  } catch (e) {}
  markUnsaved();
  toast("↩ Undone — game state restored.");
}

// Redraw pitch dots in zone from current pitchLog (used after undo)
function renderPitchZoneFromLog() {
  const dotsEl = document.getElementById("pitch-dots");
  if (!dotsEl) return;
  dotsEl.innerHTML = "";
  // Only draw dots from currentAtBatPitches (current AB)
  [...S.currentAtBatPitches].reverse().forEach((e) => {
    if (e.pitchX != null && e.pitchY != null) {
      placePitchDot(e.pitchX, e.pitchY, e.dotClass, e.num, e.velocity);
    }
  });
  // Redraw ab-strip chips
  const strip = document.getElementById("ab-strip");
  if (strip) {
    strip.querySelectorAll(".ab-pitch-chip").forEach((c) => c.remove());
    S.currentAtBatPitches.forEach((e) =>
      addAbChip(e.dotClass, e.label, e.pitchType, e.velocity)
    );
  }
}

// ===================== BOX SCORE =====================
function renderBoxScore() {
  const maxInn = Math.max(S.inning, 9);
  const aBy = {},
    hBy = {};
  S.inningRuns.forEach((r) => {
    if (r.isTop) aBy[r.inning] = (aBy[r.inning] || 0) + r.runs;
    else hBy[r.inning] = (hBy[r.inning] || 0) + r.runs;
  });
  let hdrs = "<th></th>";
  for (let i = 1; i <= maxInn; i++) hdrs += `<th>${i}</th>`;
  hdrs += "<th>R</th>";
  let aRow = `<td>${awayName()}</td>`,
    hRow = `<td>${homeName()}</td>`;
  for (let i = 1; i <= maxInn; i++) {
    const ar = aBy[i],
      hr = hBy[i];
    aRow += `<td class="${ar ? " scored" : ""}">${
      ar !== undefined ? ar : "—"
    }</td>`;
    hRow += `<td class="${hr ? " scored" : ""}">${
      hr !== undefined ? hr : "—"
    }</td>`;
  }
  aRow += `<td style="color:var(--text);font-weight:700">${S.awayScore}</td>`;
  hRow += `<td style="color:var(--text);font-weight:700">${S.homeScore}</td>`;
  let html = `<div class="section-label">${awayName()} vs ${homeName()}</div>
  <div style="overflow-x:auto;padding:0 10px 8px">
    <table class="box-table"><thead><tr>${hdrs}</tr></thead><tbody><tr>${aRow}</tr><tr>${hRow}</tr></tbody></table>
  </div>`;
  qs("box-score-wrap").innerHTML = html;
  renderBatterStats();
}
function renderBatterStats() {
  const mk = (isAway, lineup) =>
    lineup
      .map((b, i) => {
        const bs = getBatterStats(getBatterKey(isAway, i));
        const pa = bs.pa || 0;
        const avg = bs.ab > 0 ? _fmtRate(bs.hits / bs.ab) : "—";
        const obp =
          pa > 0
            ? _fmtRate(
                (bs.hits +
                  (bs.bb || 0) +
                  (bs.hbp || 0) +
                  (bs.ci || 0)) /
                  pa
              )
            : "—";
        return `<tr><td>#${b.num || "—"} ${
          b.name
        }</td><td>${pa}</td><td>${bs.ab}</td><td>${bs.hits}</td><td>${
          bs.bb || 0
        }</td><td>${bs.hbp || 0}</td><td>${
          bs.k
        }</td><td>${avg}</td><td>${obp}</td></tr>`;
      })
      .join("");
  qs("batter-stats-wrap").innerHTML = `
    <div class="section-label" style="margin-top:6px">${awayName()} Batters</div>
    <div style="overflow-x:auto;padding:0 10px">
      <table class="batter-table"><thead><tr><th>Batter</th><th>PA</th><th>AB</th><th>H</th><th>BB</th><th>HBP</th><th>K</th><th>AVG</th><th>OBP</th></tr></thead>
      <tbody>${mk(true, S.lineupAway)}</tbody></table>
    </div>
    <div class="section-label" style="margin-top:8px">${homeName()} Batters</div>
    <div style="overflow-x:auto;padding:0 10px">
      <table class="batter-table"><thead><tr><th>Batter</th><th>PA</th><th>AB</th><th>H</th><th>BB</th><th>HBP</th><th>K</th><th>AVG</th><th>OBP</th></tr></thead>
      <tbody>${mk(false, S.lineupHome)}</tbody></table>
    </div>
  `;
  try {
    if (
      typeof _currentMobTab !== "undefined" &&
      _currentMobTab === "log" &&
      _mobLogTab === "boxscore"
    )
      renderMobLog("boxscore");
  } catch (e) {}
}

// ===================== PITCH MIX =====================
function renderPitchMix() {
  const wrap = qs("pitch-mix-wrap");
  if (!S.pitchLog.length) {
    wrap.innerHTML =
      '<div style="padding:20px;text-align:center;color:var(--text3);font-size:12px">No pitches yet.</div>';
    return;
  }

  // Build per-pitcher sections for both teams
  const awayName = qs("away-name-input")?.value || "AWAY";
  const homeName = qs("home-name-input")?.value || "HOME";

  // Group pitchers by team — away pitchers threw when isTop=false (home batting), home when isTop=true
  // S.pitchersAway = away team's pitching staff (pitched when home team batted, isTop=false... wait)
  // Actually: isTop=true means AWAY is batting → HOME pitcher is pitching
  //           isTop=false means HOME is batting → AWAY pitcher is pitching
  // So: away pitchers appear in pitchLog when isTop=false (away team pitching to home batters) -- NO
  // Away pitchers pitch TO home batters → home team bats → isTop=false
  // Home pitchers pitch TO away batters → away team bats → isTop=true
  const awayPitcherNames = [
    ...new Set(
      S.pitchLog
        .filter(
          (e) => e.isTop === false && e.pitcher && e.pitcher !== "—"
        )
        .map((e) => e.pitcher)
    ),
  ];
  const homePitcherNames = [
    ...new Set(
      S.pitchLog
        .filter(
          (e) => e.isTop === true && e.pitcher && e.pitcher !== "—"
        )
        .map((e) => e.pitcher)
    ),
  ];

  // Fallback: use pitchersList if no pitcher field stored
  const awayPList = S.pitchersAway.filter((p) => p.pitches > 0);
  const homePList = S.pitchersHome.filter((p) => p.pitches > 0);

  let html = "";

  const buildPitcherSection = (pitcherName, pitcherNum, pitches) => {
    if (!pitches.length) return "";
    const total = pitches.length;
    const types = {};
    const outs = { swing: 0, look: 0, ball: 0, foul: 0, contact: 0 };
    pitches.forEach((e) => {
      if (e.pitchType && e.pitchType !== "—")
        types[e.pitchType] = (types[e.pitchType] || 0) + 1;
      if (e.outcome === "strike-swinging") outs.swing++;
      else if (e.outcome === "strike-looking") outs.look++;
      else if (e.outcome === "ball") outs.ball++;
      else if (e.outcome === "foul") outs.foul++;
      else if (isContactOutcome(e.outcome)) outs.contact++;
    });
    const vels = pitches
      .map((e) => parseFloat(e.velocity))
      .filter((v) => !isNaN(v) && v > 0);
    const avgV = vels.length
      ? (vels.reduce((a, b) => a + b, 0) / vels.length).toFixed(1)
      : "—";
    const maxV = vels.length ? Math.max(...vels) : "—";

    let s = `<div style="background:var(--surface2);border-radius:8px;padding:10px 12px;margin-bottom:10px">`;
    s += `<div style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:13px;letter-spacing:1px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center">
      <span>#${pitcherNum || "?"} ${pitcherName}</span>
      <span style="font-weight:400;font-size:11px;color:var(--text3)">${total}P · ${avgV} avg · ${maxV} max</span>
    </div>`;

    // Pitch usage bars
    const sortedTypes = Object.entries(types).sort(
      (a, b) => b[1] - a[1]
    );
    if (sortedTypes.length) {
      sortedTypes.forEach(([t, c]) => {
        const pct = Math.round((c / total) * 100);
        s += `<div class="stat-bar-wrap"><div class="stat-bar-lbl"><span class="stat-bar-name">${t}</span><span class="stat-bar-val">${c} · ${pct}%</span></div><div class="stat-bar"><div class="stat-bar-fill" style="width:${pct}%"></div></div></div>`;
      });
    }

    // Outcome breakdown
    const outcomeMap = {
      swing: ["Swinging K", "#3a7fd5"],
      look: ["Called K", "#85c0f5"],
      ball: ["Ball", "rgba(100,120,160,.5)"],
      foul: ["Foul", "var(--foul)"],
      contact: ["In Play", "var(--accent)"],
    };
    s += `<div style="margin-top:6px">`;
    Object.entries(outs).forEach(([k, c]) => {
      if (!c) return;
      const [lbl, clr] = outcomeMap[k];
      const pct = Math.round((c / total) * 100);
      s += `<div class="stat-bar-wrap"><div class="stat-bar-lbl"><span class="stat-bar-name" style="color:${clr}">${lbl}</span><span class="stat-bar-val">${c} · ${pct}%</span></div><div class="stat-bar"><div class="stat-bar-fill" style="width:${pct}%;background:${clr}"></div></div></div>`;
    });
    s += `</div></div>`;
    return s;
  };

  // Away team pitchers section
  if (awayPList.length) {
    html += `<div class="section-label">${awayName} Pitching</div>`;
    awayPList.forEach((p) => {
      // Get pitches thrown by this pitcher (isTop=false = away pitching, home batting)
      const pitches = S.pitchLog.filter(
        (e) => e.pitcher === p.name && e.isTop === false
      );
      // Fallback: if no pitcher field, show all away pitches divided by count
      const usePitches = pitches.length
        ? pitches
        : S.pitchLog.filter((e) => !e.isTop).slice(0, p.pitches);
      html += buildPitcherSection(p.name, p.num, usePitches);
    });
  }

  // Home team pitchers section
  if (homePList.length) {
    html += `<div class="section-label" style="margin-top:4px">${homeName} Pitching</div>`;
    homePList.forEach((p) => {
      const pitches = S.pitchLog.filter(
        (e) => e.pitcher === p.name && e.isTop === true
      );
      const usePitches = pitches.length
        ? pitches
        : S.pitchLog.filter((e) => e.isTop).slice(0, p.pitches);
      html += buildPitcherSection(p.name, p.num, usePitches);
    });
  }

  if (!html)
    html =
      '<div style="padding:20px;text-align:center;color:var(--text3);font-size:12px">No pitcher data yet.</div>';

  wrap.innerHTML = html;
  try {
    if (
      typeof _currentMobTab !== "undefined" &&
      _currentMobTab === "log" &&
      _mobLogTab === "pitchmix"
    )
      renderMobLog("pitchmix");
  } catch (e) {}
}

// ===================== TABS =====================
function switchTab(tab) {
  qsa(".right-tab").forEach((t) => t.classList.remove("active"));
  qsa(".right-tab-content").forEach((c) =>
    c.classList.remove("active")
  );
  const tabEl = qs("tab-" + tab);
  const contentEl = qs("content-" + tab);
  if (tabEl) tabEl.classList.add("active");
  if (contentEl) contentEl.classList.add("active");
  if (tab === "boxscore") renderBoxScore();
  if (tab === "pitchstats") renderPitchMix();
  if (tab === "gamelog") renderGameLog();
  if (tab === "scouting") renderLiveScoutingTab(true); // force reload on tab open
}

// ── LIVE SCOUTING TAB ─────────────────────────────────────────────
// Cache for scouting tab saved games — avoids re-fetching storage on every pitch
let _scoutGamesCache = null;
let _scoutGamesCacheKey = null; // invalidate when team names change

function renderLiveScoutingTab(forceReload) {
  const wrap = qs("live-scout-wrap");
  if (!wrap) return;

  // Only show if the tab is active
  const scoutContent = qs("content-scouting");
  if (!scoutContent || !scoutContent.classList.contains("active"))
    return;

  const cacheKey = awayName() + "|" + homeName();
  if (
    forceReload ||
    !_scoutGamesCache ||
    _scoutGamesCacheKey !== cacheKey
  ) {
    // Need fresh data — show loading only on first load, not on pitch updates
    if (!_scoutGamesCache) {
      wrap.innerHTML =
        '<div style="padding:20px;color:var(--text3);font-family:Barlow,sans-serif;font-size:12px;text-align:center">Loading…</div>';
    }
    _scoutGamesCacheKey = cacheKey;
    loadAllGames()
      .then((saved) => {
        _scoutGamesCache = saved;
        _renderLiveScoutingTab(wrap, saved);
      })
      .catch(() => {
        _scoutGamesCache = [];
        _renderLiveScoutingTab(wrap, []);
      });
  } else {
    // Use cache — instant render on every pitch
    _renderLiveScoutingTab(wrap, _scoutGamesCache);
  }
}

function _renderLiveScoutingTab(wrap, savedGames) {
  const pitcher = activePitcher();
  const batter = currentBatter();
  const pitchingTeam = S.isTop
    ? qs("home-name-input")?.value || "HOME"
    : qs("away-name-input")?.value || "AWAY";

  // Build a live snapshot of the current game so stats include unsaved pitches
  const _liveSnap = (() => {
    const awT = awayName(),
      hmT = homeName();
    const mkBatter = (p, i, isAway) => {
      const bs2 = getBatterStats(getBatterKey(isAway, i));
      const res = S.lineupResults[getBatterKey(isAway, i)] || [];
      return {
        name: p.name,
        num: p.num,
        pos: p.pos,
        hand: p.hand,
        pa: bs2.pa || 0,
        ab: bs2.ab || 0,
        hits: bs2.hits || 0,
        bb: bs2.bb || 0,
        k: bs2.k || 0,
        hbp: bs2.hbp || 0,
        ci: bs2.ci || 0,
        r: bs2.r || 0,
        rbi: bs2.rbi || 0,
        sb: bs2.sb || 0,
        cs: bs2.cs || 0,
        doubles: res.filter((r) => r.label === "2B").length,
        triples: res.filter((r) => r.label === "3B").length,
        hr: res.filter((r) => r.label === "HR").length,
      };
    };
    return {
      id: "__live__",
      date: new Date().toISOString().split("T")[0],
      awayTeam: awT,
      homeTeam: hmT,
      pitchLog: S.pitchLog,
      awayBatters: S.lineupAway.map((p, i) => mkBatter(p, i, true)),
      homeBatters: S.lineupHome.map((p, i) => mkBatter(p, i, false)),
      awayPitchers: S.pitchersAway.map((p) => ({ ...p })),
      homePitchers: S.pitchersHome.map((p) => ({ ...p })),
    };
  })();
  // Merge live snapshot with freshly-loaded saved games, deduplicating by gameId
  const _liveGames = [
    _liveSnap,
    ...savedGames.filter((g) => g.id !== S.gameId),
  ];

  // Pitcher career stats — scan pitch logs across all games
  let pitcherCareer = null;
  let careerPoAtt = 0,
    careerPoOuts = 0;
  try {
    // Match pitcher by exact name OR last name + jersey number so records
    // stored under an older name variant (e.g. "Slack" vs "Tyler Slack") are found.
    const pName = pitcher?.name;
    const pLast = _lastName(pName || "");
    const pNum = pitcher?.num;
    const _pitcherMatch = (name, num) =>
      name === pName ||
      (pLast &&
        _lastName(name) === pLast &&
        (!pNum || !num || String(pNum) === String(num)));

    const pGames = _liveGames.filter(
      (g) => g.awayTeam === pitchingTeam || g.homeTeam === pitchingTeam
    );
    const allPPs = pGames.flatMap((g) =>
      (g.pitchLog || []).filter((e) =>
        _pitcherMatch(e.pitcher, e.pitcherNum)
      )
    );
    // Aggregate pickoff data from pitcher objects across all games
    pGames.forEach((g) => {
      const pitchers =
        g.awayTeam === pitchingTeam ? g.awayPitchers : g.homePitchers;
      const p = (pitchers || []).find((x) =>
        _pitcherMatch(x.name, x.num)
      );
      if (p) {
        careerPoAtt += p.poAtt || 0;
        careerPoOuts += p.poOuts || 0;
      }
    });
    if (allPPs.length) {
      const totP = allPPs.length;
      const totStr = allPPs.filter((e) => _isStrike(e.outcome)).length;
      const totK = allPPs.filter(
        (e) =>
          e.outcome === "strike-swinging" ||
          e.outcome === "strike-looking"
      ).length;
      const totW = allPPs.filter(
        (e) => e.outcome === "ball" && (e.balls || 0) >= 4
      ).length;
      pitcherCareer = {
        pitches: totP,
        spPct: totP > 0 ? Math.round((totStr / totP) * 100) : 0,
        k: totK,
        bb: totW,
      };
    }
  } catch (e) {}

  // Pitcher current-game stats (match by name only — pitcherTeam may vary by game)
  const pitcherPitches = S.pitchLog.filter(
    (e) => e.pitcher === pitcher?.name
  );
  const pTotal = pitcherPitches.length;
  const pStrikes = pitcherPitches.filter((e) =>
    _isStrike(e.outcome)
  ).length;
  const pSwings = pitcherPitches.filter((e) =>
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
    ].includes(e.outcome)
  ).length;
  const pWhiffs = pitcherPitches.filter(
    (e) => e.outcome === "strike-swinging"
  ).length;
  const pVels = pitcherPitches
    .map((e) => parseFloat(e.velocity))
    .filter((v) => !isNaN(v) && v > 0);
  const pAvgVel = pVels.length
    ? (pVels.reduce((a, b) => a + b, 0) / pVels.length).toFixed(1)
    : "—";
  const pMaxVel = pVels.length ? Math.max(...pVels) : "—";
  const pSp = pTotal > 0 ? Math.round((pStrikes / pTotal) * 100) : 0;
  const pWhPct =
    pSwings > 0 ? Math.round((pWhiffs / pSwings) * 100) : 0;
  const pZone = pitcherPitches.filter(
    (e) =>
      e.pitchX != null &&
      e.pitchX >= 31 &&
      e.pitchX <= 69 &&
      e.pitchY != null &&
      e.pitchY >= 30.9 &&
      e.pitchY <= 69.1
  ).length;
  const pZonePct = pTotal > 0 ? Math.round((pZone / pTotal) * 100) : 0;
  const fpPitches = pitcherPitches.filter((e) => _isFirstPitch(e));
  const fpsPct =
    fpPitches.length > 0
      ? Math.round(
          (fpPitches.filter((e) => _isStrike(e.outcome)).length /
            fpPitches.length) *
            100
        )
      : 0;
  const oo11Pitches = pitcherPitches.filter(
    (e) =>
      (e.balls === 1 &&
        e.strikes === 2 &&
        ["strike-swinging", "strike-looking", "foul"].includes(
          e.outcome
        )) ||
      (e.balls === 2 && e.strikes === 1 && e.outcome === "ball")
  );
  const oo11Pct =
    oo11Pitches.length > 0
      ? Math.round(
          (oo11Pitches.filter((e) =>
            ["strike-swinging", "strike-looking", "foul"].includes(
              e.outcome
            )
          ).length /
            oo11Pitches.length) *
            100
        )
      : 0;

  // Pitch type pie
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
  const ptMap = {};
  pitcherPitches.forEach((e) => {
    const t = e.pitchType && e.pitchType !== "—" ? e.pitchType : "UNKN";
    ptMap[t] = (ptMap[t] || 0) + 1;
  });
  const ptSorted = Object.entries(ptMap).sort((a, b) => b[1] - a[1]);
  let pitchPie =
    '<div style="color:var(--text3);font-size:11px;padding:6px 0">No pitches yet</div>';
  if (ptSorted.length && pTotal > 0) {
    const R = 44,
      CX = 50,
      CY = 50;
    let angle = -Math.PI / 2;
    const slices = ptSorted
      .map(([t, n]) => {
        const sweep = (n / pTotal) * Math.PI * 2;
        const x1 = CX + R * Math.cos(angle),
          y1 = CY + R * Math.sin(angle);
        angle += sweep;
        const x2 = CX + R * Math.cos(angle),
          y2 = CY + R * Math.sin(angle);
        const large = sweep > Math.PI ? 1 : 0;
        const col = typeColors[t] || "#8a909e";
        const midA = angle - sweep / 2;
        const lx = (CX + R * 0.62 * Math.cos(midA)).toFixed(1),
          ly = (CY + R * 0.62 * Math.sin(midA)).toFixed(1);
        const pct = Math.round((n / pTotal) * 100);
        return (
          '<path d="M' +
          CX +
          "," +
          CY +
          " L" +
          x1.toFixed(1) +
          "," +
          y1.toFixed(1) +
          " A" +
          R +
          "," +
          R +
          " 0 " +
          large +
          ",1 " +
          x2.toFixed(1) +
          "," +
          y2.toFixed(1) +
          ' Z" fill="' +
          col +
          '" stroke="#fff" stroke-width="1.5"/>' +
          (pct >= 8
            ? '<text x="' +
              lx +
              '" y="' +
              ly +
              '" text-anchor="middle" dominant-baseline="middle" font-size="9" font-weight="700" fill="white">' +
              pct +
              "%</text>"
            : "")
        );
      })
      .join("");
    const legend = ptSorted
      .map(([t, n]) => {
        const col = typeColors[t] || "#8a909e";
        return (
          '<div style="display:flex;align-items:center;gap:4px;margin-bottom:3px"><div style="width:8px;height:8px;border-radius:2px;background:' +
          col +
          ';flex-shrink:0"></div><span style="font-family:Share Tech Mono,monospace;font-size:10px;font-weight:700;color:' +
          col +
          '">' +
          t +
          '</span><span style="font-family:Barlow,sans-serif;font-size:10px;color:var(--text3);margin-left:auto">' +
          Math.round((n / pTotal) * 100) +
          "%</span></div>"
        );
      })
      .join("");
    pitchPie =
      '<div style="display:flex;gap:10px;align-items:center"><svg viewBox="0 0 100 100" width="88" height="88" style="flex-shrink:0">' +
      slices +
      '</svg><div style="flex:1">' +
      legend +
      "</div></div>";
  }

  // Batter stats — derive directly from pitch log via _extractABs (same as Stats Hub)
  // This works whether the game is saved or not, and reflects mid-game state accurately
  const batterKey = currentBatterKey();
  const bs = getBatterStats(batterKey); // for K count (updated per AB)
  const battingTeam = S.isTop ? awayName() : homeName();
  let bavg = "—",
    bobp = "—",
    bslg = "—",
    bpa = 0,
    bab = 0,
    bhits = 0;
  try {
    if (batter?.name) {
      // Search ALL games for this batter — _extractABs filters by name internally
      const allABs = _liveGames.flatMap((g) =>
        _extractABs(g.pitchLog || [], batter.name, battingTeam, g)
      );
      if (allABs.length) {
        const st = _sumStats(allABs.map(_abToStats));
        bpa = st.pa;
        bab = st.ab;
        bhits = st.h;
        bavg = _fmtAvg(st.h, st.ab);
        bobp = _fmtOBP(st.h, st.bb, st.hbp, st.pa);
        bslg = _fmtSLG(st.tb, st.ab);
      }
    }
  } catch (e) {
    console.warn("Scout batter lookup error:", e);
  }
  const bResults = (S.lineupResults[batterKey] || [])
    .slice(-8)
    .map((r) => {
      const cls =
        r.type === "H"
          ? "color:var(--hit);font-weight:700"
          : r.type === "K"
          ? "color:var(--strike)"
          : r.type === "BB"
          ? "color:var(--ball)"
          : "color:var(--text3)";
      return (
        '<span style="font-family:monospace;font-size:9px;padding:1px 4px;background:var(--surface3);border-radius:3px;' +
        cls +
        '">' +
        r.label +
        "</span>"
      );
    })
    .join("");
  const batterVsPitcher = S.pitchLog.filter((e) => {
    const bNames =
      _nameAliases[batter?.name] || new Set([batter?.name]);
    return bNames.has(e.batter) && e.pitcher === pitcher?.name;
  });
  const bvpTotal = batterVsPitcher.length;
  const bvpSwings = batterVsPitcher.filter((e) =>
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
    ].includes(e.outcome)
  ).length;
  const bvpWhiffs = batterVsPitcher.filter(
    (e) => e.outcome === "strike-swinging"
  ).length;

  // Mini spray chart — all-time from all games
  const _allBatterPitches = batter?.name
    ? _liveGames.flatMap((g) =>
        (g.pitchLog || []).filter((e) => e.batter === batter.name)
      )
    : [];
  const bipPitches = _allBatterPitches.filter(
    (e) => e.spray?.x != null
  );
  let sprayMini = "";
  if (bipPitches.length > 0) {
    const hitColor = (o) =>
      o === "homerun"
        ? "#e8c84a"
        : o === "triple"
        ? "#c084f5"
        : o === "double"
        ? "#5baef5"
        : o === "single"
        ? "#4ae88a"
        : o === "error"
        ? "#f5a050"
        : "#e84a4a";
    const HX = 280,
      HY = 468;
    const traj = (tx, ty, bt) => {
      if (bt === "flyball" || bt === "popup") {
        const mx = (HX + tx) / 2,
          my = (HY + ty) / 2,
          dx = 280 - mx,
          dy = 100 - my,
          len = Math.sqrt(dx * dx + dy * dy) || 1,
          push = Math.sqrt((tx - HX) ** 2 + (ty - HY) ** 2) * 0.35;
        return (
          "M" +
          HX +
          "," +
          HY +
          " Q" +
          (mx + (dx / len) * push).toFixed(1) +
          "," +
          (my + (dy / len) * push).toFixed(1) +
          " " +
          tx +
          "," +
          ty
        );
      }
      return "M" + HX + "," + HY + " L" + tx + "," + ty;
    };
    const paths = bipPitches
      .map((e) => {
        const d = traj(e.spray.x, e.spray.y, e.spray.btype);
        const col = hitColor(e.outcome);
        const isOut = ![
          "single",
          "double",
          "triple",
          "homerun",
          "error",
        ].includes(e.outcome);
        const lw = isOut ? 1.5 : 2.2,
          op = isOut ? 0.5 : 0.9;
        const da =
          e.spray.btype === "groundball" ||
          e.spray.btype === "weakgrounder"
            ? 'stroke-dasharray="3,4"'
            : "";
        return (
          '<path d="' +
          d +
          '" fill="none" stroke="' +
          col +
          '" stroke-width="' +
          lw +
          '" stroke-linecap="round" opacity="' +
          op +
          '" ' +
          da +
          '/><circle cx="' +
          e.spray.x +
          '" cy="' +
          e.spray.y +
          '" r="' +
          (isOut ? 4 : 5) +
          '" fill="' +
          col +
          '" opacity="' +
          op +
          '" stroke="white" stroke-width="1"/>'
        );
      })
      .join("");
    sprayMini =
      '<svg viewBox="0 0 560 510" style="width:100%;border-radius:6px;display:block;border:1px solid var(--border)">' +
      '<rect width="560" height="510" fill="#111a0d"/>' +
      '<path d="M280,480 L18,220 Q280,-60 542,220 Z" fill="#1a2e14"/>' +
      '<path d="M280,480 L18,220 Q280,-60 542,220 Z" fill="none" stroke="#3a2510" stroke-width="22"/>' +
      '<path d="M280,480 L18,220 L0,510 Z" fill="#0f1a0a" opacity=".6"/>' +
      '<path d="M280,480 L542,220 L560,510 Z" fill="#0f1a0a" opacity=".6"/>' +
      '<line x1="280" y1="480" x2="20" y2="200" stroke="rgba(255,255,255,.25)" stroke-width="1.5"/>' +
      '<line x1="280" y1="480" x2="540" y2="200" stroke="rgba(255,255,255,.25)" stroke-width="1.5"/>' +
      '<path d="M280,470 L145,335 L280,200 L415,335 Z" fill="#3e2810"/>' +
      '<path d="M280,440 L172,332 L280,224 L388,332 Z" fill="#1a2e14"/>' +
      '<circle cx="280" cy="340" r="14" fill="#4a3010"/>' +
      paths +
      "</svg>";
  }

  // Hot/cold zone — all-time
  const bzPitches = _allBatterPitches.filter((e) => e.pitchX != null);
  const hczMini =
    bzPitches.length > 0
      ? buildScoutHotColdZone(bzPitches, "batter")
      : "";

  // Helpers
  const currentCount = S.balls + "-" + S.strikes;
  const countLabel =
    S.balls > S.strikes
      ? "Hitter's count"
      : S.strikes > S.balls
      ? "Pitcher's count"
      : S.balls === 3 && S.strikes === 2
      ? "Full count"
      : "Even";
  const matchup =
    pitcher?.hand === "L" && batter?.hand === "L"
      ? "L vs L"
      : pitcher?.hand === "L"
      ? "L vs R"
      : batter?.hand === "L"
      ? "R vs L"
      : "R vs R";
  const statBox = (val, lbl, accent) => {
    const c = accent || "var(--text)";
    return (
      '<div style="text-align:center;background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:5px 3px">' +
      '<div style="font-family:Barlow Condensed,sans-serif;font-weight:900;font-size:16px;line-height:1;color:' +
      c +
      '">' +
      val +
      "</div>" +
      '<div style="font-size:7px;color:var(--text3);margin-top:2px;font-family:Barlow,sans-serif;letter-spacing:0.5px;text-transform:uppercase">' +
      lbl +
      "</div>" +
      "</div>"
    );
  };
  const sec = (t) =>
    '<div style="font-family:Barlow,sans-serif;font-weight:700;font-size:8px;letter-spacing:1.5px;text-transform:uppercase;color:var(--text3);margin:8px 0 5px;border-bottom:1px solid var(--border);padding-bottom:3px">' +
    t +
    "</div>";

  wrap.innerHTML =
    '<div style="padding:8px 10px;font-family:Barlow Condensed,sans-serif">' +
    sec("Situation") +
    '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;margin-bottom:3px">' +
    statBox(currentCount, "Count", "var(--accent)") +
    statBox(S.outs + (S.outs === 1 ? " out" : " outs"), "Outs") +
    statBox(S.inning + (S.isTop ? " ▲" : " ▼"), "Inning") +
    "</div>" +
    '<div style="font-family:Barlow Condensed,sans-serif;font-size:12px;color:var(--text3);text-align:center;margin-bottom:2px">' +
    countLabel +
    " · " +
    matchup +
    "</div>" +
    sec(
      "Pitcher · #" +
        (pitcher?.num || "?") +
        " " +
        (pitcher?.name || "—") +
        " (" +
        (pitcher?.hand || "R") +
        "HP)"
    ) +
    (pitcherCareer
      ? '<div style="font-size:10px;color:var(--text3);font-family:Barlow,sans-serif;margin-bottom:5px">Career: ' +
        pitcherCareer.pitches +
        "P · " +
        pitcherCareer.spPct +
        "% strikes · " +
        pitcherCareer.k +
        "K · " +
        pitcherCareer.bb +
        "BB</div>"
      : "") +
    '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:3px;margin-bottom:5px">' +
    statBox(pitcher?.pitches || 0, "Pitches") +
    statBox(
      pSp + "%",
      "Str%",
      pSp >= 65 ? "var(--green)" : pSp < 52 ? "var(--red)" : ""
    ) +
    statBox(pZonePct + "%", "Zone%") +
    statBox(fpsPct + "%", "FPS%") +
    statBox(
      pWhPct + "%",
      "Whiff%",
      pWhPct >= 28 ? "var(--green)" : ""
    ) +
    "</div>" +
    '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:3px;margin-bottom:6px">' +
    statBox(pAvgVel, "Avg MPH", "var(--blue)") +
    statBox(pMaxVel, "Max MPH") +
    statBox(oo11Pct + "%", "1-1 Conv") +
    "</div>" +
    '<div style="font-size:8px;color:var(--text3);font-family:Barlow,sans-serif;margin-bottom:5px;letter-spacing:1px;text-transform:uppercase">Pitch Mix</div>' +
    pitchPie +
    sec("Pickoff Tendency") +
    '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:3px;margin-bottom:6px">' +
    statBox(pitcher?.poAtt || 0, "This Game") +
    statBox(careerPoAtt, "Career Att") +
    statBox(
      careerPoAtt > 0
        ? Math.round((careerPoOuts / careerPoAtt) * 100) + "%"
        : "—",
      "Out%"
    ) +
    "</div>" +
    sec(
      "Batter · #" +
        (batter?.num || "?") +
        " " +
        (batter?.name || "—") +
        " (" +
        (batter?.hand || "R") +
        "HH)"
    ) +
    '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:3px;margin-bottom:5px">' +
    statBox(bavg, "AVG", bhits > 0 ? "var(--accent)" : "") +
    statBox(bobp, "OBP") +
    statBox(bslg, "SLG") +
    statBox(bs.k || 0, "Ks") +
    "</div>" +
    (bResults
      ? '<div style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:6px">' +
        bResults +
        "</div>"
      : "") +
    (bvpTotal > 0
      ? '<div style="font-size:10px;color:var(--text3);font-family:Barlow,sans-serif;margin-bottom:6px">vs this pitcher: ' +
        bvpTotal +
        "P · " +
        (bvpSwings > 0
          ? Math.round((bvpWhiffs / bvpSwings) * 100) + "% whiff"
          : "—") +
        "</div>"
      : "") +
    (bipPitches.length > 0 ? sec("Spray Chart") + sprayMini : "") +
    (hczMini
      ? sec("Pitch Contact Zone") +
        '<div style="max-width:200px;margin:0 auto 6px">' +
        hczMini +
        "</div>"
      : "") +
    "</div>";
}

// ===================== BASERUNNER ACTION MODAL =====================
let activeRunnerBase = null; // '1st' | '2nd' | '3rd'

function handleBaseClick(base) {
  if (S.bases[base]) {
    openRunnerActionModal(base);
  } else {
    S.bases[base] = true;
    updateScoreBug();
    toast(`Runner placed on ${base}`);
    logEvent("🏃", `Runner on ${base}`, "Manually placed");
  }
}

function openRunnerActionModal(base) {
  activeRunnerBase = base;
  const baseNames = {
    "1st": "First",
    "2nd": "Second",
    "3rd": "Third",
  };
  qs("ram-title").textContent = `Runner on ${base}`;
  qs(
    "ram-sub"
  ).textContent = `${baseNames[base]} base — select an action`;

  // Update mini diamond
  ["1st", "2nd", "3rd"].forEach((b) => {
    const el = qs(`ram-base-${b}`);
    if (el) {
      el.style.background = S.bases[b]
        ? "var(--accent)"
        : "transparent";
      el.style.borderColor = S.bases[b]
        ? "var(--accent)"
        : "var(--text3)";
      el.style.boxShadow = S.bases[b]
        ? "0 0 10px rgba(232,200,74,.6)"
        : "none";
    }
  });

  // Position the runner dot on the active base
  const dotPos = {
    "1st": { top: "52px", left: "102px" },
    "2nd": { top: "2px", left: "52px" },
    "3rd": { top: "52px", left: "2px" },
  };
  const dot = qs("ram-runner-dot");
  if (dot && dotPos[base]) {
    dot.style.top = dotPos[base].top;
    dot.style.left = dotPos[base].left;
  }

  // Show/hide "Scores" only when runner is on 3rd (or 2nd for wild pitch context — always show)
  // Show balk only when at least one runner on base (always relevant)
  qs("runner-action-modal").style.display = "flex";
}

function closeRunnerActionModal() {
  qs("runner-action-modal").style.display = "none";
  activeRunnerBase = null;
}

function executeRunnerAction(action) {
  const base = activeRunnerBase;
  if (!base) return;
  closeRunnerActionModal();

  const baseName = base;
  const batter = currentBatter()?.name || "Runner";

  switch (action) {
    case "stolen-base": {
      const dest =
        base === "1st" ? "2nd" : base === "2nd" ? "3rd" : "home";
      const sbRunner = S.runnerNames[base] || batter;
      const sbKey = _batterKeyByName(sbRunner);
      if (sbKey) {
        const bs = getBatterStats(sbKey);
        bs.sb = (bs.sb || 0) + 1;
      }
      if (dest === "home") {
        S.bases[base] = false;
        addRun(base);
        clearRunner(base);
        toast(`⚡ Stolen Base — ${sbRunner} scores!`);
        logEvent(
          "⚡",
          "Stolen Base (Home)",
          `${sbRunner} steals home & scores`
        );
      } else {
        S.bases[base] = false;
        S.bases[dest] = true;
        moveRunner(base, dest);
        toast(`⚡ Stolen Base — ${sbRunner} advances to ${dest}`);
        logEvent("⚡", "Stolen Base", `${sbRunner}: ${base} → ${dest}`);
      }
      break;
    }
    case "wild-pitch": {
      const dest =
        base === "1st" ? "2nd" : base === "2nd" ? "3rd" : "home";
      if (dest === "home") {
        S.bases[base] = false;
        addRun(base);
        clearRunner(base);
        toast(`🌀 Wild Pitch — Runner scores from ${base}!`);
        logEvent(
          "🌀",
          "Wild Pitch (Scores)",
          `Runner from ${base} scores`
        );
      } else {
        S.bases[base] = false;
        S.bases[dest] = true;
        toast(`🌀 Wild Pitch — Runner: ${base} → ${dest}`);
        logEvent("🌀", "Wild Pitch", `Runner: ${base} → ${dest}`);
      }
      break;
    }
    case "passed-ball": {
      const dest =
        base === "1st" ? "2nd" : base === "2nd" ? "3rd" : "home";
      if (dest === "home") {
        S.bases[base] = false;
        addRun(base);
        clearRunner(base);
        toast(`🧤 Passed Ball — Runner scores from ${base}!`);
        logEvent(
          "🧤",
          "Passed Ball (Scores)",
          `Runner from ${base} scores`
        );
      } else {
        S.bases[base] = false;
        S.bases[dest] = true;
        toast(`🧤 Passed Ball — Runner: ${base} → ${dest}`);
        logEvent("🧤", "Passed Ball", `Runner: ${base} → ${dest}`);
      }
      break;
    }
    case "balk": {
      // All runners advance one base
      let runs = 0;
      const newBases = { "1st": false, "2nd": false, "3rd": false };
      ["3rd", "2nd", "1st"].forEach((b) => {
        if (S.bases[b]) {
          const dest =
            b === "1st" ? "2nd" : b === "2nd" ? "3rd" : "home";
          if (dest === "home") runs++;
          else newBases[dest] = true;
        }
      });
      S.bases = newBases;
      for (let i = 0; i < runs; i++) addRun();
      toast(
        `🚫 Balk — All runners advance${
          runs ? " · " + runs + " score" : ""
        }`
      );
      logEvent(
        "🚫",
        "Balk",
        `All runners advance${
          runs ? " · " + runs + " run(s) score" : ""
        }`
      );
      break;
    }
    case "advance-error": {
      const dest =
        base === "1st" ? "2nd" : base === "2nd" ? "3rd" : "home";
      if (dest === "home") {
        S.bases[base] = false;
        addRun(base);
        clearRunner(base);
        toast(`💥 Error — Runner scores from ${base}!`);
        logEvent(
          "💥",
          "Advances on Error (Scores)",
          `Runner from ${base} scores`
        );
      } else {
        S.bases[base] = false;
        S.bases[dest] = true;
        toast(`💥 Error — Runner: ${base} → ${dest}`);
        logEvent(
          "💥",
          "Advances on Error",
          `Runner: ${base} → ${dest}`
        );
      }
      break;
    }
    case "scores": {
      S.bases[base] = false;
      addRun(base);
      clearRunner(base);
      toast(` Runner scores from ${base}!`);
      logEvent("", "Scores", `Runner from ${base} crosses home plate`);
      break;
    }
    case "caught-stealing": {
      const csRunner = S.runnerNames[base] || batter;
      const csKey = _batterKeyByName(csRunner);
      if (csKey) {
        const bs = getBatterStats(csKey);
        bs.cs = (bs.cs || 0) + 1;
      }
      S.bases[base] = false;
      clearRunner(base);
      S.outs++;
      toast(
        `🏷️ Caught Stealing — Out! (${S.outs} out${
          S.outs > 1 ? "s" : ""
        })`
      );
      logEvent(
        "🏷️",
        "Caught Stealing",
        `${csRunner} out at ${
          base === "1st" ? "2nd" : base === "2nd" ? "3rd" : "home"
        } · ${S.outs} out`
      );
      if (S.outs >= 3) handleThreeOuts();
      break;
    }
    case "picked-off": {
      const poRunner = S.runnerNames[base] || batter;
      const poKey = _batterKeyByName(poRunner);
      if (poKey) {
        const bs = getBatterStats(poKey);
        bs.po = (bs.po || 0) + 1;
      }
      const poPitcher = activePitcher();
      if (poPitcher) {
        poPitcher.poAtt = (poPitcher.poAtt || 0) + 1;
        poPitcher.poOuts = (poPitcher.poOuts || 0) + 1;
      }
      S.bases[base] = false;
      clearRunner(base);
      S.outs++;
      toast(`🎯 Picked Off — ${poRunner} picked off ${base}!`);
      logEvent(
        "🎯",
        "Picked Off",
        `${poRunner} picked off ${base} · ${S.outs} out`
      );
      if (S.outs >= 3) handleThreeOuts();
      break;
    }
    case "pickoff-attempt": {
      const paPitcher = activePitcher();
      if (paPitcher) {
        paPitcher.poAtt = (paPitcher.poAtt || 0) + 1;
      }
      const paRunner = S.runnerNames[base] || "runner";
      toast(`Pickoff attempt at ${base} — ${paRunner} safe`);
      logEvent(
        "↩️",
        "Pickoff Attempt",
        `Throw to ${base} — ${paRunner} safe`
      );
      break;
    }
    case "remove": {
      S.bases[base] = false;
      toast(`Runner removed from ${base}`);
      break;
    }
  }

  updateScoreBug();
  renderLiveScoutingTab();
}

// ===================== GAME LOG =====================
function logEvent(icon, main, meta) {
  S.gameLog.unshift({
    icon,
    main,
    meta,
    inning: S.inning,
    isTop: S.isTop,
    ts: Date.now(),
    score: `${awayName()} ${S.awayScore}–${S.homeScore} ${homeName()}`,
  });
  renderGameLog();
}
function renderGameLog() {
  const el = qs("game-log-list");
  if (!el) return;
  el.innerHTML = "";
  if (!S.gameLog.length) {
    el.innerHTML =
      '<div style="padding:20px;text-align:center;color:var(--text3);font-size:12px">Key events will appear here.</div>';
    return;
  }
  // Color coding by event type
  const iconColor = (e) => {
    const i = e.icon;
    if (["⚡"].includes(i)) return "rgba(232,200,74,.9)"; // steal — gold
    if (["", ""].includes(i)) return "rgba(74,232,138,.9)"; // scores/hits — green
    if (["🏷️", "🎯"].includes(i)) return "rgba(232,74,74,.9)"; // outs — red
    if (["🌀", "🧤", "💥"].includes(i)) return "rgba(91,200,245,.9)"; // errors/wild pitch — blue
    if (["🚫"].includes(i)) return "rgba(232,160,74,.9)"; // balk — orange
    if (["⚾"].includes(i)) return "rgba(139,150,176,.9)"; // inning over — grey
    if ([""].includes(i)) return "rgba(85,95,120,.7)"; // inning marker — dim
    if (["🔄"].includes(i)) return "rgba(200,74,240,.9)"; // pitching change — purple
    return "rgba(232,200,74,.7)";
  };
  const bgColor = (e) => {
    const i = e.icon;
    if (["🏷️", "🎯"].includes(i)) return "rgba(232,74,74,.05)";
    if (["", ""].includes(i)) return "rgba(74,232,138,.04)";
    if (["⚡"].includes(i)) return "rgba(232,200,74,.04)";
    if ([""].includes(i)) return "rgba(255,255,255,.02)";
    return "transparent";
  };

  S.gameLog.forEach((e) => {
    const half = e.isTop ? "TOP" : "BOT";
    const div = document.createElement("div");
    div.className = "game-log-entry";
    div.style.background = bgColor(e);
    div.innerHTML = `
      <div class="game-log-icon" style="color:${iconColor(e)}">${e.icon}</div>
      <div class="game-log-body">
<div class="game-log-main">${e.main}</div>
${e.meta ? `<div class="game-log-meta">${e.meta}</div>` : ""}
${
  e.score
    ? `<div class="game-log-meta" style="color:var(--text3);font-size:8px">${e.score}</div>`
    : ""
}
      </div>
      <div class="game-log-inning">${half} ${e.inning}</div>
    `;
    el.appendChild(div);
  });
  el.scrollTop = 0;
  try {
    if (
      typeof _currentMobTab !== "undefined" &&
      _currentMobTab === "log" &&
      _mobLogTab === "gamelog"
    )
      renderMobLog("gamelog");
  } catch (e) {}
}
function clearGameLog() {
  S.gameLog = [];
  renderGameLog();
}

// ===================== PITCHER PITCH COUNT WARNING =====================
function checkPitchCountWarning(p) {
  if (!p) return;
  if (p.pitches === 75) toast(`Warning: ${p.name}: 75 pitches`);
  if (p.pitches === 90)
    toast(`Warning: ${p.name}: 90 pitches — approaching limit`);
  if (p.pitches === 100) toast(`Alert: ${p.name}: 100 PITCHES`);
}

// ===================== KEYBOARD SHORTCUTS =====================
const PITCH_TYPES = [
  "4SFB",
  "CRV",
  "SLD",
  "CH",
  "CUT",
  "SPL",
  "SNK",
  "KN",
];
let kbdOpen = false;
function toggleKbd() {
  kbdOpen = !kbdOpen;
  qs("kbd-panel").classList.toggle("show", kbdOpen);
}

document.addEventListener("keydown", (e) => {
  // Don't fire when typing in an input
  if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName))
    return;

  switch (e.key) {
    case " ":
    case "Enter":
      e.preventDefault();
      if (!qs("commit-pitch").disabled) commitPitch();
      break;
    case "z":
    case "Z":
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        undoLastPitch();
      }
      break;
    case "Escape":
      clearAtBat();
      break;
    case "s":
    case "S":
      selectOutcome("strike-swinging");
      break;
    case "k":
    case "K":
      selectOutcome("strike-looking");
      break;
    case "b":
    case "B":
      selectOutcome("ball");
      break;
    case "f":
    case "F":
      selectOutcome("foul");
      break;
    case "h":
    case "H":
      selectOutcome("hbp");
      break;
    case "i":
    case "I":
      selectOutcome("ci");
      break;
    case "p":
    case "P":
      toggleInPlay();
      break;
    case "g":
    case "G":
      if (inPlayOpen) selectOutcome("groundout");
      break;
    case "y":
    case "Y":
      if (inPlayOpen) selectOutcome("flyout");
      break;
    case "l":
    case "L":
      if (inPlayOpen) selectOutcome("lineout");
      break;
    case "r":
    case "R":
      if (inPlayOpen) selectOutcome("homerun");
      break;
    case "e":
    case "E":
      if (inPlayOpen) selectOutcome("error");
      break;
    case "a":
    case "A":
      if (inPlayOpen) selectOutcome("single");
      break;
    case "d":
    case "D":
      if (inPlayOpen) selectOutcome("double");
      break;
    case "t":
    case "T":
      if (inPlayOpen) selectOutcome("triple");
      break;
    case "1":
    case "2":
    case "3":
    case "4":
    case "5":
    case "6":
    case "7":
    case "8": {
      const idx = parseInt(e.key) - 1;
      if (idx < _currentPitchKeys.length)
        selectPitchType(_currentPitchKeys[idx]);
      break;
    }
  }
});

// ===================== CSV EXPORT =====================
function exportCSV() {
  if (!S.pitchLog.length) {
    toast("No pitches to export.");
    return;
  }
  const cols = [
    "Pitch#",
    "Inning",
    "Half",
    "Batter",
    "Outcome",
    "Label",
    "PitchType",
    "Velocity",
    "Location",
    "BallType",
    "HardHit",
    "FieldZone",
    "Balls",
    "Strikes",
  ];
  const rows = S.pitchLog
    .slice()
    .reverse()
    .map((e) =>
      [
        e.num,
        e.inning,
        e.isTop ? "TOP" : "BOT",
        `"${e.batter}"`,
        e.outcome,
        e.label,
        e.pitchType,
        e.velocity || "",
        `"${e.loc || ""}"`,
        e.spray ? e.spray.btype : "",
        e.spray ? (e.spray.hardHit ? "Y" : "N") : "",
        e.spray ? `"${e.spray.zone}"` : "",
        e.balls,
        e.strikes,
      ].join(",")
    );
  const csv = [cols.join(","), ...rows].join("\n");
  const a = document.createElement("a");
  a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
  a.download = `pitchtrack_${awayName()}_vs_${homeName()}_inn${
    S.inning
  }.csv`;
  a.click();
  toast("📄 CSV exported!");
}

// ===================== RANDOM LINEUP =====================
const RAND_FIRST = [
  "Aaron",
  "Blake",
  "Carlos",
  "Derek",
  "Eddie",
  "Frank",
  "Gary",
  "Hank",
  "Ivan",
  "Jake",
  "Kevin",
  "Luis",
  "Marcus",
  "Nick",
  "Omar",
  "Pete",
  "Quinn",
  "Ray",
  "Sam",
  "Tony",
  "Ulysses",
  "Vic",
  "Will",
  "Xavier",
  "Yogi",
  "Zach",
  "Jose",
  "Miguel",
  "Dante",
  "Bryce",
  "Cody",
  "Dylan",
  "Evan",
  "Felix",
  "Gavin",
];
const RAND_LAST = [
  "Smith",
  "Johnson",
  "Williams",
  "Brown",
  "Jones",
  "Garcia",
  "Davis",
  "Miller",
  "Wilson",
  "Moore",
  "Taylor",
  "Anderson",
  "Thomas",
  "Jackson",
  "White",
  "Harris",
  "Martin",
  "Thompson",
  "Young",
  "Robinson",
  "Walker",
  "Scott",
  "Hall",
  "Allen",
  "Ramirez",
  "Torres",
  "Cruz",
  "Reyes",
  "Lopez",
  "Hernandez",
  "Rivera",
  "Lewis",
  "Lee",
  "Carter",
  "Phillips",
  "Evans",
  "Turner",
];
const POSITIONS = ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH"];
const HANDS = ["R", "R", "R", "R", "R", "L", "L", "L", "S"]; // weighted toward right

function randEl(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randName() {
  return randEl(RAND_FIRST) + " " + randEl(RAND_LAST);
}
function randNum() {
  return String(Math.floor(Math.random() * 98) + 1);
}

function randomizeLineup() {
  const lineup = currentLineup();
  const usedNums = new Set();
  lineup.forEach((b, i) => {
    let num;
    do {
      num = randNum();
    } while (usedNums.has(num));
    usedNums.add(num);
    b.name = randName();
    b.num = num;
    b.pos = POSITIONS[i] || randEl(POSITIONS);
    b.hand = randEl(HANDS);
  });
  renderLineup();
  updateScoreBug();
  toast("🎲 Random lineup generated!");
}

// ===================== LINEUP EDITOR MODAL =====================
let lineupModalSide = "away"; // 'away' | 'home'

function openLineupModal() {
  lineupModalSide = S.isTop ? "away" : "home";
  qs("lineup-modal").style.display = "flex";
  renderLineupModal();
}
function closeLineupModal() {
  saveLineupModalInputs();
  qs("lineup-modal").style.display = "none";
  var rp = document.getElementById("lm-roster-panel");
  if (rp) rp.style.display = "none";
  renderLineup();
  updateScoreBug();
}
function switchLineupModalTab(side) {
  saveLineupModalInputs(); // save current side before switching
  lineupModalSide = side;
  const aTab = qs("lm-tab-away"),
    hTab = qs("lm-tab-home");
  const activeStyle = "background:var(--accent);color:var(--bg)";
  const inactiveStyle = "background:transparent;color:var(--text3)";
  aTab.style.cssText = aTab.style.cssText.replace(
    /background:[^;]+;color:[^;]+/g,
    ""
  );
  hTab.style.cssText = hTab.style.cssText.replace(
    /background:[^;]+;color:[^;]+/g,
    ""
  );
  if (side === "away") {
    aTab.style.background = "var(--accent)";
    aTab.style.color = "var(--bg)";
    hTab.style.background = "transparent";
    hTab.style.color = "var(--text3)";
  } else {
    hTab.style.background = "var(--accent)";
    hTab.style.color = "var(--bg)";
    aTab.style.background = "transparent";
    aTab.style.color = "var(--text3)";
  }
  renderLineupModal();
}

function renderLineupModal() {
  renderLmPitchers();
  const lineup =
    lineupModalSide === "away" ? S.lineupAway : S.lineupHome;
  const title =
    lineupModalSide === "away"
      ? `${awayName()} — Away Batting Order`
      : `${homeName()} — Home Batting Order`;
  qs("lineup-modal-title").textContent = title;
  const rows = qs("lineup-modal-rows");
  rows.innerHTML = "";
  lineup.forEach((b, i) => {
    const div = document.createElement("div");
    div.className = "lm-row";
    div.innerHTML = `
      <div class="lm-order">${i + 1}</div>
      <input class="lm-input" id="lm-num-${i}"  value="${
      b.num || ""
    }"  placeholder="#"   maxlength="3"  style="text-align:center;padding:5px 4px">
      <input class="lm-input" id="lm-name-${i}" value="${
      b.name || ""
    }" placeholder="Player name...">
      <input class="lm-input" id="lm-pos-${i}"  value="${
      b.pos || ""
    }"  placeholder="POS"  maxlength="3"  style="text-align:center;text-transform:uppercase;padding:5px 4px">
      <select class="lm-select" id="lm-hand-${i}">
<option value="R"${
  (b.hand || "R") === "R" ? " selected" : ""
}>R</option>
<option value="L"${b.hand === "L" ? " selected" : ""}>L</option>
<option value="S"${b.hand === "S" ? " selected" : ""}>S</option>
      </select>
      <button onclick="togglePH(${i})" id="lm-ph-${i}" title="Mark as Pinch Hitter" style="background:${
      b.isPH ? "rgba(204,26,26,.12)" : "none"
    };border:1px solid ${
      b.isPH ? "var(--accent)" : "var(--border)"
    };border-radius:4px;color:${
      b.isPH ? "var(--accent)" : "var(--text3)"
    };font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:10px;padding:4px 4px;cursor:pointer;transition:all .14s;width:100%;letter-spacing:.5px">PH</button>
      <button onclick="randomizeSingleRow(${i})" title="Random player" style="background:none;border:1px solid var(--border);border-radius:4px;color:var(--text3);font-size:12px;padding:4px 6px;cursor:pointer;transition:all .14s;width:100%" onmouseover="this.style.borderColor='var(--green)';this.style.color='var(--green)'" onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--text3)'">🎲</button>
    `;
    // Make row a drop target for roster cards
    div.addEventListener("dragover", function (e) {
      e.preventDefault();
      this.style.background = "rgba(204,26,26,.12)";
      this.style.outline = "2px solid var(--accent)";
    });
    div.addEventListener("dragleave", function () {
      this.style.background = "";
      this.style.outline = "";
    });
    div.addEventListener("drop", function (e) {
      e.preventDefault();
      this.style.background = "";
      this.style.outline = "";
      const pid = e.dataTransfer.getData("text/plain") || _dragPlayerId;
      lmDropPlayerIntoSlot(pid, i);
    });
    rows.appendChild(div);
  });

  // "Add Extra Hitter" button — only show if lineup already has ≥9 slots
  // OR always show so exhibition games can expand beyond 9
  const addBtn = document.createElement("button");
  addBtn.textContent = "+ Add Extra Hitter";
  addBtn.style.cssText =
    "margin-top:10px;width:100%;padding:7px;background:none;border:1px dashed var(--border);border-radius:6px;color:var(--text3);font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:12px;letter-spacing:.5px;cursor:pointer;transition:all .14s";
  addBtn.onmouseover = function () {
    this.style.borderColor = "var(--accent)";
    this.style.color = "var(--accent)";
  };
  addBtn.onmouseout = function () {
    this.style.borderColor = "var(--border)";
    this.style.color = "var(--text3)";
  };
  addBtn.onclick = function () {
    lmAddExtraHitter();
  };
  rows.appendChild(addBtn);

  // Show remove-last button if lineup > 9
  if (lineup.length > 9) {
    const removeBtn = document.createElement("button");
    removeBtn.textContent = "− Remove Last Slot";
    removeBtn.style.cssText =
      "margin-top:4px;width:100%;padding:5px;background:none;border:1px dashed var(--border);border-radius:6px;color:var(--text3);font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:11px;letter-spacing:.5px;cursor:pointer;transition:all .14s";
    removeBtn.onmouseover = function () {
      this.style.borderColor = "#f87171";
      this.style.color = "#f87171";
    };
    removeBtn.onmouseout = function () {
      this.style.borderColor = "var(--border)";
      this.style.color = "var(--text3)";
    };
    removeBtn.onclick = function () {
      lmRemoveLastSlot();
    };
    rows.appendChild(removeBtn);
  }
}

function lmAddExtraHitter() {
  saveLineupModalInputs();
  const lineup =
    lineupModalSide === "away" ? S.lineupAway : S.lineupHome;
  lineup.push({
    name: "",
    num: "",
    pos: "EH",
    hand: "R",
    isPH: false,
    isPR: false,
    isDEF: false,
  });
  renderLineupModal();
  renderLineup();
}

function lmRemoveLastSlot() {
  const lineup =
    lineupModalSide === "away" ? S.lineupAway : S.lineupHome;
  if (lineup.length <= 9) return;
  saveLineupModalInputs();
  lineup.pop();
  // Clamp batter index if it's now out of range
  if (lineupModalSide === "away" && S.awayBatterIdx >= lineup.length)
    S.awayBatterIdx = lineup.length - 1;
  if (lineupModalSide === "home" && S.homeBatterIdx >= lineup.length)
    S.homeBatterIdx = lineup.length - 1;
  renderLineupModal();
  renderLineup();
}

function lmDropPlayerIntoSlot(playerId, slotIdx) {
  const p = myTeamRoster.find(function (x) {
    return x.id === playerId;
  });
  if (!p) return;
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
  // Briefly highlight the pos field as a reminder to verify position
  setTimeout(function () {
    var posEl = document.getElementById("lm-pos-" + slotIdx);
    if (posEl) {
      posEl.style.borderColor = "var(--accent)";
      posEl.style.background = "rgba(204,26,26,.08)";
      posEl.title = "Verify position";
      posEl.focus();
      setTimeout(function () {
        posEl.style.borderColor = "";
        posEl.style.background = "";
        posEl.title = "";
      }, 3500);
    }
  }, 60);
}

function togglePH(i) {
  toggleLmSub("PH", i);
}
function toggleLmSub(type, i) {
  const lineup =
    lineupModalSide === "away" ? S.lineupAway : S.lineupHome;
  const key = type === "PH" ? "isPH" : type === "PR" ? "isPR" : "isDEF";
  lineup[i][key] = !lineup[i][key];
  // Update button style inline without full re-render
}

function saveLineupModalInputs() {
  const lineup =
    lineupModalSide === "away" ? S.lineupAway : S.lineupHome;
  lineup.forEach((b, i) => {
    const nameEl = qs(`lm-name-${i}`),
      numEl = qs(`lm-num-${i}`),
      posEl = qs(`lm-pos-${i}`),
      handEl = qs(`lm-hand-${i}`);
    if (!nameEl) return;
    if (nameEl.value.trim()) b.name = nameEl.value.trim();
    b.num = numEl?.value.trim() || b.num;
    if (posEl.value.trim()) b.pos = posEl.value.trim().toUpperCase();
    if (handEl) b.hand = handEl.value;
  });
}

function randomizeSingleRow(i) {
  const lineup =
    lineupModalSide === "away" ? S.lineupAway : S.lineupHome;
  lineup[i].name = randName();
  lineup[i].num = randNum();
  lineup[i].hand = randEl(HANDS);
  renderLineupModal();
}

function randomizeLineupModal() {
  const lineup =
    lineupModalSide === "away" ? S.lineupAway : S.lineupHome;
  const usedNums = new Set();
  lineup.forEach((b, i) => {
    let num;
    do {
      num = randNum();
    } while (usedNums.has(num));
    usedNums.add(num);
    b.name = randName();
    b.num = num;
    b.hand = randEl(HANDS);
  });
  renderLineupModal();
  toast("🎲 Random lineup!");
}

// ===================== SPRAY CHART =====================
let sprayCallback = null; // function to call after spray is logged/skipped
let sprayEntry = null; // pitch log entry to attach spray data to
let sprayState = {
  btype: null,
  hardHit: false,
  fieldX: null,
  fieldY: null,
};

const BALL_TYPES_NO_HARDCHECK = ["weakgrounder", "popup"];

function openSprayModal(outcome, entry, callback) {
  sprayCallback = callback;
  sprayEntry = entry;
  sprayState = {
    btype: null,
    hardHit: false,
    fieldX: null,
    fieldY: null,
  };

  // Pre-select ball type based on outcome
  const preselect = {
    linedrive: null,
    flyball: null,
    groundout: "groundball",
    flyout: "flyball",
    lineout: "linedrive",
    sacfly: "flyball",
    sacbunt: "weakgrounder",
    single: null,
    double: null,
    triple: null,
    homerun: null,
  };
  const pre = preselect[outcome] || null;

  // Set title / subtitle
  const batter = currentBatter()?.name || "Batter";
  const labels = {
    single: "Single",
    double: "Double",
    triple: "Triple",
    homerun: "Home Run",
    groundout: "Ground Out",
    flyout: "Fly Out",
    lineout: "Line Out",
    sacfly: "Sac Fly",
    sacbunt: "Sac Bunt",
  };
  qs("spray-title").textContent = `Spray Chart — ${
    labels[outcome] || outcome
  }`;
  qs(
    "spray-sub"
  ).textContent = `${batter} · click the field to mark landing spot`;

  // Reset UI
  qsa(".spray-type-btn").forEach((b) => b.classList.remove("selected"));
  qs("hard-hit-btn").classList.remove("active");
  qs("hard-hit-icon").textContent = "🔲";
  qs("spray-marker").style.display = "none";
  qs("spray-field-hint").textContent =
    "Click the field to mark where the ball landed";
  qs("spray-submit-btn").disabled = true;
  qs("spray-submit-btn").style.opacity = ".4";

  if (pre) {
    selectBallType(pre);
  }

  qs("spray-modal").style.display = "block";
}

function selectBallType(btype) {
  sprayState.btype = btype;
  qsa(".spray-type-btn").forEach((b) => b.classList.remove("selected"));
  const btn = document.querySelector(
    `.spray-type-btn[data-btype="${btype}"]`
  );
  if (btn) btn.classList.add("selected");

  // Show/hide hard hit for weak grounder & popup
  const noHard = BALL_TYPES_NO_HARDCHECK.includes(btype);
  qs("hard-hit-row").style.display = noHard ? "none" : "flex";
  if (noHard) {
    sprayState.hardHit = false;
    qs("hard-hit-btn").classList.remove("active");
    qs("hard-hit-icon").textContent = "🔲";
  }

  checkSprayReady();
}

function toggleHardHit() {
  sprayState.hardHit = !sprayState.hardHit;
  const btn = qs("hard-hit-btn");
  btn.classList.toggle("active", sprayState.hardHit);
  qs("hard-hit-icon").textContent = sprayState.hardHit ? "🔴" : "🔲";
}

function handleSprayClick(e) {
  const svg = qs("spray-field");
  const rect = svg.getBoundingClientRect();
  const scaleX = 560 / rect.width;
  const scaleY = 510 / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;

  sprayState.fieldX = Math.round(x);
  sprayState.fieldY = Math.round(y);

  // Move marker
  const marker = qs("spray-marker");
  [qs("spray-dot"), qs("spray-dot-outer")].forEach((el) => {
    el.setAttribute("cx", x);
    el.setAttribute("cy", y);
  });
  const ch = qs("spray-cross-h"),
    cv = qs("spray-cross-v");
  ch.setAttribute("x1", x - 16);
  ch.setAttribute("x2", x + 16);
  ch.setAttribute("y1", y);
  ch.setAttribute("y2", y);
  cv.setAttribute("x1", x);
  cv.setAttribute("x2", x);
  cv.setAttribute("y1", y - 16);
  cv.setAttribute("y2", y + 16);
  marker.style.display = "block";

  qs("spray-field-hint").textContent = `📍 ${sprayZoneLabel(x, y)}`;
  checkSprayReady();
}

function checkSprayReady() {
  const ready = sprayState.btype !== null && sprayState.fieldX !== null;
  qs("spray-submit-btn").disabled = !ready;
  qs("spray-submit-btn").style.opacity = ready ? "1" : ".4";
}

function submitSpray() {
  if (!sprayState.btype || sprayState.fieldX === null) return;
  // Attach spray data to pitch log entry
  if (sprayEntry) {
    sprayEntry.spray = {
      btype: sprayState.btype,
      hardHit: sprayState.hardHit,
      x: sprayState.fieldX,
      y: sprayState.fieldY,
      zone: sprayZoneLabel(sprayState.fieldX, sprayState.fieldY),
    };
  }
  closeSprayModal();
  renderPitchLog();
}

function skipSpray() {
  closeSprayModal();
}

function closeSprayModal() {
  qs("spray-modal").style.display = "none";
  const cb = sprayCallback;
  sprayCallback = null;
  sprayEntry = null;
  if (cb) cb();
}

function sprayZoneLabel(x, y) {
  // Home plate at (280, 468). Compute angle from home plate.
  // 0° = straight up (center field), negative = left, positive = right
  const dx = x - 280;
  const dy = 468 - y; // flip y so up is positive

  // Deep/outfield threshold
  if (dy > 310) {
    // Deep outfield — use angle to determine LF/CF/RF
    const ang = (Math.atan2(dx, dy) * 180) / Math.PI;
    if (ang < -25) return "Deep LF";
    if (ang > 25) return "Deep RF";
    return "Deep CF";
  }
  if (dy > 220) {
    const ang = (Math.atan2(dx, dy) * 180) / Math.PI;
    if (ang < -30) return "LF Gap";
    if (ang < -10) return "Shallow LF";
    if (ang > 30) return "RF Gap";
    if (ang > 10) return "Shallow RF";
    return "Shallow CF";
  }
  // Infield — use angle from home plate to assign wedge
  // Left foul ≈ -45°, right foul ≈ +45°
  const ang = (Math.atan2(dx, dy) * 180) / Math.PI;
  if (ang < -36) return "3B Line";
  if (ang < -18) return "3B Side";
  if (ang < -4) return "Shortstop";
  if (ang < 4) return "Up the Middle";
  if (ang < 18) return "2B / 1B Hole";
  if (ang < 36) return "1B Side";
  return "1B Line";
}

// Spray icon for log display
function sprayBtypeIcon(btype) {
  return (
    {
      linedrive: "↗",
      flyball: "⌒",
      groundball: "⌇",
      weakgrounder: "～",
      popup: "↑",
      lineout: "↗",
    }[btype] || "•"
  );
}
function sprayBtypeLabel(btype) {
  return (
    {
      linedrive: "Line Drive",
      flyball: "Fly Ball",
      groundball: "Ground Ball",
      weakgrounder: "Weak Grounder",
      popup: "Popup",
      lineout: "Line Out",
    }[btype] || btype
  );
}

// ===================== ERROR BASE SELECT =====================
function commitError(base) {
  qs("error-modal").style.display = "none";
  const entry = S.pendingErrorEntry;
  S.pendingErrorEntry = null;
  const batter = currentBatter()?.name || "Batter";
  // 1. Spray chart → 2. Fielder modal → 3. Resolve game logic
  openSprayModal("error", entry || {}, () => {
    openFielderModal(
      "error",
      "Error",
      batter,
      (result) => {
        const posNum = {
          P: 1,
          C: 2,
          "1B": 3,
          "2B": 4,
          "3B": 5,
          SS: 6,
          LF: 7,
          CF: 8,
          RF: 9,
        };
        // result: { fielder, errorPlayer, errorType, throwDir } or null (no fielder)
        const errorPlayer = result?.errorPlayer || null;
        const fielderWho = result?.fielder || null;
        S._lastErrorFielder = errorPlayer || null;
        S._lastErrorPosNum = errorPlayer
          ? posNum[errorPlayer] || ""
          : null;
        S._lastErrorType = result?.errorType || null;
        S._lastErrorFielderWho = fielderWho || null;
        // Track fielding stats
        if (errorPlayer) _trackFielding(errorPlayer, "e");
        if (
          result?.throwDir === "dropped" &&
          fielderWho &&
          fielderWho !== errorPlayer
        ) {
          _trackFielding(fielderWho, "a");
        }
        _resolveError(base, entry);
      },
      true
    );
  });
}
function _resolveError(base, entry) {
  const batter = currentBatter()?.name || "Batter";
  const errorPlayer = S._lastErrorFielder; // who committed the error
  const fielderWho = S._lastErrorFielderWho; // who fielded/threw (may differ)
  const posNum = S._lastErrorPosNum;
  const errorType = S._lastErrorType;
  // Build descriptive suffix: E6 (SS dropped throw, 3B threw)
  let fielderStr = "";
  if (errorPlayer) {
    fielderStr = ` · E${posNum} (${errorPlayer}`;
    if (
      errorType === "throwing" &&
      fielderWho &&
      fielderWho !== errorPlayer
    ) {
      fielderStr += `, threw by ${fielderWho}`;
    }
    fielderStr += ")";
  }
  const runs = base === "home" ? 1 : 0;
  // Build blurb now — fielder is already set on S._lastErrorFielder
  updatePlayBlurb(
    "error",
    entry?.pitchType || "—",
    entry?.velocity || "",
    entry?.loc || "",
    entry?.spray || null,
    runs,
    S.bases,
    { balls: entry?.balls || 0, strikes: entry?.strikes || 0 }
  );
  if (base === "home") {
    S.bases = { "1st": false, "2nd": false, "3rd": false };
    S.runnerNames = { "1st": null, "2nd": null, "3rd": null };
    addRun();
    toast(`💥 Error — ${batter} scores!`);
    logEvent(
      "💥",
      "Error — Batter Scores",
      `${batter} reaches on error, scores${fielderStr}`
    );
    recordAtBatResult("H", "E");
    nextBatter();
  } else {
    const runners = [];
    if (S.bases["3rd"]) runners.push("3rd");
    if (S.bases["2nd"]) runners.push("2nd");
    if (S.bases["1st"]) runners.push("1st");
    if (!runners.length) {
      S.bases = { "1st": false, "2nd": false, "3rd": false };
      S.bases[base] = true;
      toast(`💥 Error — ${batter} reaches ${base}`);
      logEvent(
        "💥",
        "Error",
        `${batter} reaches ${base} on error${fielderStr}`
      );
      recordAtBatResult("H", "E");
      nextBatter();
      return;
    }
    // Use runner modal for baserunner advancement
    S.modalHit = { hitType: "error", newBase: base, runners };
    S.runnerQueue = [...runners];
    S.runnerMoves = {};
    S.currentQueueIdx = 0;
    recordAtBatResult("H", "E");
    showRunnerModal();
  }
}
function closeErrorModal() {
  qs("error-modal").style.display = "none";
  S.pendingErrorEntry = null;
  resetAfterPitch();
  updateScoreBug();
}

// ===================== PLAY BLURB =====================
// State snapshot taken just before AB-ending to capture runners before they move
let blurbRunnersBefore = { "1st": false, "2nd": false, "3rd": false };

function captureRunnersForBlurb() {
  blurbRunnersBefore = { ...S.bases };
}

function setPlayBlurb(html) {
  const el = qs("play-blurb-text");
  if (el) {
    el.innerHTML = html;
  }
}

function clearPlayBlurb() {
  // Don't wipe the blurb — let the previous batter's result persist
  // until the first pitch of the new at-bat replaces it.
  // Just mark as "between batters" with a subtle indicator appended.
  const el = qs("play-blurb-text");
  if (!el) return;
  // If there's already meaningful content (not empty), leave it alone.
  // The next updatePlayBlurb() call will overwrite it naturally.
}

// Pitch type → readable name
function pitchTypeName(t) {
  const m = {
    "4SFB": "fastball",
    "2SFB": "fastball",
    SNK: "sinker",
    CUT: "cutter",
    CRV: "curveball",
    SLD: "slider",
    SW: "sweeper",
    SLV: "slurve",
    CH: "changeup",
    SPL: "splitter",
    VC: "vulcan change",
    KN: "knuckleball",
    SCR: "screwball",
  };
  return m[t] || "pitch";
}

// Zone location → directional description
function locationDesc(loc) {
  if (!loc || loc === "—") return "";
  const m = {
    Heart: "down the middle",
    High: "up in the zone",
    Low: "low in the zone",
    Inside: "inside",
    Outside: "outside",
    "High Inside": "up and in",
    "High Outside": "up and away",
    "Low Inside": "low and in",
    "Low Outside": "low and away",
    "Chase Inside": "off the plate inside",
    "Chase Outside": "off the plate outside",
    "Chase High": "high out of the zone",
    "Chase Low": "in the dirt",
    "Way Inside": "way inside",
    "Way Outside": "way outside",
    "Chase Edge": "just off the corner",
    "Left Field": "to left field",
    "Center Field": "to center field",
    "Right Field": "to right field",
    "Deep LF": "deep to left",
    "Deep CF": "deep to center",
    "Deep RF": "deep to right",
    "LF Gap": "into the left field gap",
    "RF Gap": "into the right field gap",
    "Shallow LF": "to shallow left",
    "Shallow RF": "to shallow right",
    "Shallow CF": "to shallow center",
    "3B Side": "toward third",
    "1B Side": "toward first",
    "Up the Middle": "up the middle",
    Shortstop: "to short",
    "Shortstop Hole": "through the hole",
    "2B / 1B Hole": "through the hole",
    "3B Line": "down the third base line",
    "1B Line": "down the first base line",
    Infield: "to the infield",
  };
  return m[loc] || loc.toLowerCase();
}

// Spray zone → batted ball direction
function sprayDesc(spray) {
  if (!spray) return "";
  const zone = locationDesc(spray.zone);
  const hard = spray.hardHit ? " (hard hit)" : "";
  return zone ? `${zone}${hard}` : "";
}

// Who is on base right now (names or generic)
function runnersOnDesc(bases, lineup, isAway) {
  const on = [];
  ["1st", "2nd", "3rd"].forEach((b) => {
    if (bases[b]) on.push(b);
  });
  if (!on.length) return "";
  return on.map((b) => `runner on ${b}`).join(", ");
}

// Get runner names from lineup at batter index for "who scored"
// We don't track runner identity precisely, so we use generic "a runner"
// unless exactly identified from the batter history
function buildBlurb(
  outcome,
  pitchType,
  velocity,
  loc,
  spray,
  batter,
  pitcher,
  runnersBefore,
  runsScored,
  runnersAfter,
  count,
  abEnding
) {
  const b = (s) => `<span class="blurb-batter">${s}</span>`;
  const pi = (s) => `<span class="blurb-pitcher">${s}</span>`;
  const pt = (s) => `<span class="blurb-pitch">${s}</span>`;
  const res = (s) => `<span class="blurb-result">${s}</span>`;
  const out = (s) => `<span class="blurb-out">${s}</span>`;
  const run = (s) => `<span class="blurb-run">${s}</span>`;
  const neu = (s) => `<span class="blurb-neutral">${s}</span>`;

  const pName =
    pitchType && pitchType !== "—" ? pitchTypeName(pitchType) : "pitch";
  const velStr = velocity ? ` ${velocity} mph` : "";
  const locStr = locationDesc(loc);
  const locPhrase = locStr ? ` ${locStr}` : "";
  const spStr = spray ? sprayDesc(spray) : "";
  const spPhrase = spStr ? ` ${spStr}` : "";

  // Count context (only for non-AB-ending pitches)
  const countStr = `${count.balls}-${count.strikes}`;

  // Runners before (for scoring blurbs)
  const had1st = runnersBefore["1st"];
  const had2nd = runnersBefore["2nd"];
  const had3rd = runnersBefore["3rd"];
  const hadRunners = had1st || had2nd || had3rd;

  switch (outcome) {
    // ── Mid-AB pitches ──────────────────────────────
    case "strike-swinging":
      return `${b(batter)} swings and misses a${
        pName.match(/^[aeiou]/i) ? "n" : ""
      } ${pt(pName + velStr)}${locPhrase}. ${neu(
        "Count: " + countStr
      )}`;

    case "strike-looking":
      return `${b(batter)} takes a${
        pName.match(/^[aeiou]/i) ? "n" : ""
      } ${pt(pName + velStr)}${locPhrase} for a called strike. ${neu(
        "Count: " + countStr
      )}`;

    case "ball":
      return `${b(batter)} takes a${
        pName.match(/^[aeiou]/i) ? "n" : ""
      } ${pt(pName + velStr)}${locPhrase} — ball. ${neu(
        "Count: " + countStr
      )}`;

    case "foul":
      return `${b(batter)} fouls off a${
        pName.match(/^[aeiou]/i) ? "n" : ""
      } ${pt(pName + velStr)}${locPhrase}. ${neu(
        "Count: " + countStr
      )}`;

    case "hbp":
      return `${b(batter)} is hit by a${
        pName.match(/^[aeiou]/i) ? "n" : ""
      } ${pt(pName + velStr)}. ${neu("Takes first base.")}`;

    case "ci":
      return `Catcher's interference — ${b(
        batter
      )} reaches first base.`;

    // ── Strikeouts ──────────────────────────────────
    case "strikeout-swinging":
      return `${pi(pitcher)} strikes out ${b(batter)} swinging on a${
        pName.match(/^[aeiou]/i) ? "n" : ""
      } ${pt(pName + velStr)}${locPhrase}.`;

    case "strikeout-looking":
      return `${pi(pitcher)} strikes out ${b(batter)} looking — ${pt(
        pName + velStr
      )} catches the corner${locPhrase}.`;

    // ── Walk ────────────────────────────────────────
    case "walk":
      return `${b(batter)} draws a walk on a full count ${pt(
        pName + velStr
      )}${locPhrase}. ${neu("Takes first.")}`;

    // ── Hits ────────────────────────────────────────
    case "single": {
      let tail =
        runsScored > 0
          ? ` ${buildScoringTail(runsScored, runnersAfter, run, neu)}`
          : "";
      return `${b(batter)} singles${
        spPhrase || locPhrase ? " " + spPhrase : ""
      }${tail ? ";" : "."} ${tail}`;
    }
    case "double": {
      let tail =
        runsScored > 0
          ? ` ${buildScoringTail(runsScored, runnersAfter, run, neu)}`
          : "";
      return `${b(batter)} doubles${spPhrase ? " " + spPhrase : ""}${
        tail ? ";" : "."
      } ${tail}`;
    }
    case "triple": {
      let tail =
        runsScored > 0
          ? ` ${buildScoringTail(runsScored, runnersAfter, run, neu)}`
          : "";
      return `${b(batter)} triples${spPhrase ? " " + spPhrase : ""}${
        tail ? ";" : "."
      } ${tail}`;
    }
    case "homerun": {
      const extras =
        runsScored > 1 ? ` — ${run(runsScored + " runs score")}.` : "";
      const label =
        runsScored > 1 ? `${runsScored}-run home run` : "home run";
      return `${b(batter)} hits a ${res(label)}${
        spPhrase ? " " + spPhrase : ""
      }${extras || "."}`;
    }

    // ── Outs ────────────────────────────────────────
    case "groundout": {
      const fd = S._lastFielder ? ` to ${S._lastFielder}` : "";
      const sc = S._lastScoreStr
        ? ` ${neu("(" + S._lastScoreStr + ")")}`
        : ` ${neu("(GO)")}`;
      return `${b(batter)} grounds out${
        spPhrase ? " " + spPhrase : ""
      }${fd}.${sc}`;
    }
    case "flyout": {
      const fd = S._lastFielder ? ` to ${S._lastFielder}` : "";
      const sc = S._lastScoreStr
        ? ` ${neu("(" + S._lastScoreStr + ")")}`
        : ` ${neu("(FO)")}`;
      return `${b(batter)} flies out${
        spPhrase ? " " + spPhrase : ""
      }${fd}.${sc}`;
    }
    case "lineout": {
      const fd = S._lastFielder ? ` to ${S._lastFielder}` : "";
      const sc = S._lastScoreStr
        ? ` ${neu("(" + S._lastScoreStr + ")")}`
        : ` ${neu("(LO)")}`;
      return `${b(batter)} lines out${
        spPhrase ? " " + spPhrase : ""
      }${fd}.${sc}`;
    }
    case "sacfly": {
      const fd = S._lastFielder ? ` to ${S._lastFielder}` : "";
      const sc = S._lastScoreStr
        ? ` ${neu("(" + S._lastScoreStr + ")")}`
        : ` ${neu("(SF)")}`;
      const scored = had3rd ? run("scores on the sac fly") : "";
      return `${b(batter)} hits a sacrifice fly${
        spPhrase ? " " + spPhrase : ""
      }${fd}${scored ? "; runner " + scored : ""}.${sc}`;
    }

    case "error": {
      let tail =
        runsScored > 0
          ? ` ${run(
              runsScored + " score" + (runsScored > 1 ? "s" : "")
            )}.`
          : "";
      const ef = S._lastErrorFielder;
      const ep = S._lastErrorPosNum;
      const eStr = ef ? ` ${neu("E" + ep + " (" + ef + ")")}` : "";
      return `${b(batter)} reaches on an error${
        spPhrase ? " " + spPhrase : ""
      }${tail ? ";" + tail : "."} ${eStr}`;
    }

    default:
      return `${b(batter)} — ${outcome}.`;
  }
}

// Build "Jones scored. Miller scored. Williams to 3rd." from run count + bases after
function buildScoringTail(runsScored, runnersAfter, run, neu) {
  // We can't track individual runner names precisely without a full runner registry.
  // Use generic "a run scored" / "2 runs scored" phrasing.
  const rs =
    runsScored === 1
      ? run("a run scored")
      : run(runsScored + " runs scored");
  return rs + ".";
}

// Called after each commit to generate and display the blurb
function updatePlayBlurb(
  outcome,
  pitchType,
  velocity,
  loc,
  spray,
  runsScored,
  runnersAfterMove,
  count
) {
  const batter = currentBatter()?.name || "The batter";
  const pitcher = activePitcher()?.name || "The pitcher";

  // Map commit outcome to blurb key
  let blurbKey = outcome;
  if (outcome === "strike-swinging" && S.strikes >= 3)
    blurbKey = "strikeout-swinging";
  else if (outcome === "strike-looking" && S.strikes >= 3)
    blurbKey = "strikeout-looking";
  else if (S.balls >= 4 && outcome === "ball") blurbKey = "walk";

  const html = buildBlurb(
    blurbKey,
    pitchType,
    velocity,
    loc,
    spray,
    batter,
    pitcher,
    blurbRunnersBefore,
    runsScored,
    runnersAfterMove || S.bases,
    count,
    false
  );
  setPlayBlurb(html);
}

// ===================== DOUBLE PLAY =====================
let dpCallback = null; // called after DP modal resolves

// Called after spray modal closes for a field out — check if DP is possible

// ===================== FORCE OUT / FIELDER'S CHOICE =====================

// Normal out where batter is retired — shared by fly outs, line outs, and GO where batter is out
function commitBatterOut(
  outcome,
  logLabel,
  entry,
  pitchType,
  velocity,
  px,
  py
) {
  S.outs++;
  const batter = currentBatter()?.name || "Batter";
  toast(`Out! (${logLabel})`);
  recordAtBatResult("O", logLabel);
  // Credit out to the active pitcher
  {
    const _cp = activePitcher();
    if (_cp) _cp.outs = (_cp.outs || 0) + 1;
  }
  // Ask who made the play in the field — blurb is built AFTER so it has fielder info
  // result is {putout, assists[]} or null if skipped
  _fielderSkipAssists =
    outcome === "flyout" ||
    outcome === "lineout" ||
    outcome === "sacfly";
  openFielderModal(outcome, logLabel, batter, (result) => {
    _fielderSkipAssists = false;
    const posNum = {
      P: 1,
      C: 2,
      "1B": 3,
      "2B": 4,
      "3B": 5,
      SS: 6,
      LF: 7,
      CF: 8,
      RF: 9,
    };
    const fielder = result?.putout || null;
    const assists = result?.assists || [];
    let scoreStr = "";
    if (fielder) {
      if (outcome === "flyout" || outcome === "sacfly") {
        scoreStr = `F${posNum[fielder] || ""}`;
      } else if (outcome === "lineout") {
        scoreStr = `L${posNum[fielder] || ""}`;
      } else {
        // Build full assist chain: e.g. SS→1B = "6-3"
        const chain = [...assists, fielder]
          .map((p) => posNum[p] || "?")
          .join("-");
        scoreStr = chain;
      }
    }
    // Store for blurb — must be set before updatePlayBlurb is called
    S._lastFielder = fielder || null;
    S._lastScoreStr = scoreStr || null;
    // PO and assists already tracked inside _fielderSelect / _fielderSkip
    updatePlayBlurb(
      outcome,
      pitchType,
      velocity,
      zoneLabel(px, py),
      entry.spray || null,
      0,
      S.bases,
      { balls: S.balls, strikes: S.strikes }
    );
    const assistStr = assists.length > 0 ? assists.join("-") + "-" : "";
    const fielderStr = fielder
      ? ` · ${assistStr}${fielder}${
          scoreStr ? " (" + scoreStr + ")" : ""
        }`
      : "";
    logEvent(
      "🟤",
      `${logLabel} — Out`,
      `${batter}${fielderStr} · ${S.outs} out${
        S.outs > 1 ? "s" : ""
      } this inning`
    );
    checkForDoublePlay(
      outcome,
      pitchType,
      velocity,
      zoneLabel(px, py),
      entry.spray || null,
      () => {
        if (S.outs >= 3) {
          handleThreeOuts();
          return;
        }
        const runnersOn = ["1st", "2nd", "3rd"].some((b) => S.bases[b]);
        if (runnersOn) {
          showRunnerAdvanceOnOut(outcome, () => {
            if (S.outs >= 3) {
              handleThreeOuts();
              return;
            }
            nextBatter();
          });
        } else {
          nextBatter();
        }
      }
    );
  });
}

// After spray on a ground out with runners: ask who was put out
function showForceOutQuestion(
  outcome,
  entry,
  pitchType,
  velocity,
  px,
  py
) {
  const batter = currentBatter()?.name || "Batter";
  const runners = ["1st", "2nd", "3rd"].filter((b) => S.bases[b]);

  qs("modal-title").textContent = "Who was retired?";
  qs(
    "modal-sub"
  ).textContent = `Ground ball — ${batter}. Select who was put out on the play.`;

  // Reset base highlights
  ["1st", "2nd", "3rd", "home"].forEach((b) => {
    const el = qs("modal-" + b);
    if (el)
      el.className =
        "baserun-base baserun-" +
        (b === "2nd"
          ? "second"
          : b === "3rd"
          ? "third"
          : b === "1st"
          ? "first"
          : "home");
  });

  const qEl = qs("runner-queue");
  qEl.innerHTML = "";

  // Helper to build a button
  const addBtn = (label, onClick) => {
    const btn = document.createElement("button");
    btn.className = "runner-move-btn";
    btn.innerHTML = label;
    btn.onclick = onClick;
    qEl.appendChild(btn);
  };

  // Option 1: Batter is out (normal GO)
  addBtn(`🟤 Batter out — Ground Out (GO)`, () => {
    qs("baserun-modal").classList.remove("active");
    commitBatterOut(outcome, "GO", entry, pitchType, velocity, px, py);
  });

  // Option 2+: A runner is out first (FC / force out / traditional DP) — batter may or may not reach
  const selectRunnerRetired = (base) => {
    // Restore base onclick handlers before proceeding
    ["1st", "2nd", "3rd"].forEach((b) => {
      const bEl = qs("modal-" + b);
      if (bEl) {
        bEl.classList.remove("runner-here");
        bEl.onclick = () => quickRunnerDest(b);
      }
    });
    qs("baserun-modal").classList.remove("active");
    commitFieldersChoice(base, entry, pitchType, velocity, px, py);
  };

  runners.forEach((base) => {
    const forceLabels = {
      "1st": "Runner on 1st retired first — FC or DP",
      "2nd": "Runner on 2nd retired first — Force Out / FC or DP",
      "3rd": "Runner on 3rd retired first — Force Out / FC or DP",
    };
    addBtn(`🟤 ${forceLabels[base]}`, () => selectRunnerRetired(base));

    // Also make the base on the diamond directly clickable
    const baseEl = qs("modal-" + base);
    if (baseEl) {
      baseEl.classList.add("runner-here");
      baseEl.onclick = () => selectRunnerRetired(base);
    }
  });

  qs("baserun-modal").classList.add("active");
}

// Fielder's choice: a runner is retired, batter reaches 1st
function commitFieldersChoice(
  retiredBase,
  entry,
  pitchType,
  velocity,
  px,
  py
) {
  const batter = currentBatter()?.name || "Batter";

  S.outs++;
  {
    const _cp = activePitcher();
    if (_cp) _cp.outs = (_cp.outs || 0) + 1;
  }
  // Remove the retired runner
  S.bases[retiredBase] = false;
  // Batter reaches 1st tentatively — may be undone if this is a traditional DP
  const had1st = S.bases["1st"];
  S.bases["1st"] = true;

  // FC: charges an AB, no hit (label may be updated to GDP if traditional DP confirmed)
  recordAtBatResult("O", "FC");

  // Ask whether batter was ALSO retired (traditional double play: runner out first, then batter)
  checkForTraditionalDP(
    retiredBase,
    batter,
    entry,
    pitchType,
    velocity,
    px,
    py,
    had1st
  );
}

// After a fielder's choice, ask if the batter was also thrown out at 1st (traditional DP order)
function checkForTraditionalDP(
  retiredBase,
  batter,
  entry,
  pitchType,
  velocity,
  px,
  py,
  had1st
) {
  const retiredAt =
    retiredBase === "1st"
      ? "2nd"
      : retiredBase === "2nd"
      ? "3rd"
      : "home";

  const finishFC = (afterCb) => {
    toast(
      `Fielder's Choice — ${batter} reaches 1st, runner on ${retiredBase} out`
    );
    logEvent(
      "🟤",
      "Fielder's Choice",
      `${batter} reaches 1st · runner retired at ${retiredAt} · ${S.outs} out`
    );
    updatePlayBlurb(
      "groundout",
      pitchType,
      velocity,
      zoneLabel(px, py),
      entry.spray || null,
      0,
      S.bases,
      { balls: S.balls, strikes: S.strikes }
    );
    afterCb();
  };

  if (S.outs >= 3) {
    finishFC(handleThreeOuts);
    return;
  }

  const fcContinue = () => {
    const anyRunners = ["2nd", "3rd"].some((b) => S.bases[b]) || had1st;
    if (anyRunners) {
      showRunnerAdvanceOnOut("groundout", () => {
        if (S.outs >= 3) {
          handleThreeOuts();
          return;
        }
        nextBatter();
      });
    } else {
      nextBatter();
    }
  };

  // "No DP" button calls dpCallback — wire it to the FC continuation
  dpCallback = () => finishFC(fcContinue);

  // Populate dp-modal to ask about traditional DP
  const dpLabels = {
    "1st": "4-6-3 / 6-4-3 DP",
    "2nd": "5-4-3 / 4-5-3 DP",
    "3rd": "2-3 / 5-4 DP",
  };
  qs(
    "dp-sub"
  ).textContent = `Runner on ${retiredBase} retired at ${retiredAt}. Was the batter also thrown out at 1st? (Traditional DP)`;

  ["1st", "2nd", "3rd"].forEach((b) => {
    const el = qs(`dp-base-${b}`);
    if (el) {
      el.style.background = S.bases[b]
        ? "var(--accent)"
        : "transparent";
      el.style.borderColor = S.bases[b]
        ? "var(--accent)"
        : "var(--border2)";
      el.style.boxShadow = S.bases[b]
        ? "0 0 8px rgba(204,26,26,.4)"
        : "none";
    }
  });

  const btns = qs("dp-runner-btns");
  btns.innerHTML = "";
  const btn = document.createElement("button");
  btn.style.cssText =
    "display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#f4f5f7;border:1.5px solid var(--border2);border-radius:8px;cursor:pointer;transition:all .14s;font-family:'Barlow Condensed',sans-serif;width:100%";
  btn.innerHTML = `
    <div>
      <div style="font-weight:700;font-size:16px;color:var(--text)">Batter also retired at 1st</div>
      <div style="font-size:10px;color:var(--text3);margin-top:1px">${dpLabels[retiredBase]}</div>
    </div>
    <div style="font-family:'Share Tech Mono',monospace;font-size:11px;color:var(--red);font-weight:700">2 OUTS</div>
  `;
  btn.onmouseenter = () => {
    btn.style.borderColor = "var(--red)";
    btn.style.background = "rgba(204,26,26,.06)";
  };
  btn.onmouseleave = () => {
    btn.style.borderColor = "var(--border2)";
    btn.style.background = "#f4f5f7";
  };
  btn.onclick = () =>
    executeTraditionalDP(
      retiredBase,
      batter,
      entry,
      pitchType,
      velocity,
      px,
      py,
      had1st
    );
  btns.appendChild(btn);

  qs("dp-type-label").style.display = "none";
  qs("dp-modal").style.display = "flex";
}

function executeTraditionalDP(
  retiredBase,
  batter,
  entry,
  pitchType,
  velocity,
  px,
  py,
  had1st
) {
  qs("dp-modal").style.display = "none";

  // Batter didn't reach — restore 1st to its state before the FC
  S.bases["1st"] = had1st;

  // Second out: batter retired at 1st
  S.outs++;
  {
    const _cp = activePitcher();
    if (_cp) _cp.outs = (_cp.outs || 0) + 1;
  }

  // Update at-bat result label from FC to GDP (Grounded Into Double Play)
  const batterKey = currentBatterKey();
  const results = S.lineupResults[batterKey];
  if (results && results.length > 0) {
    results[results.length - 1].label = "GDP";
  }

  const retiredAt =
    retiredBase === "1st"
      ? "2nd"
      : retiredBase === "2nd"
      ? "3rd"
      : "home";

  toast(
    `Double Play! — Runner on ${retiredBase} retired at ${retiredAt}, batter out at 1st · ${S.outs} outs`
  );
  logEvent(
    "⚡",
    "Double Play",
    `${batter} — GDP; runner retired at ${retiredAt} · batter out at 1st · ${
      S.outs
    } out${S.outs > 1 ? "s" : ""}`
  );

  const blurbB = (s) => `<span class="blurb-batter">${s}</span>`;
  const blurbOut = (s) => `<span class="blurb-out">${s}</span>`;
  setPlayBlurb(
    `${blurbB(batter)} ${blurbOut(
      "grounded into a double play"
    )}. Runner on ${retiredBase} retired at ${retiredAt}; batter also thrown out at 1st. ${
      S.outs
    } outs.`
  );

  if (S.outs >= 3) {
    handleThreeOuts();
    return;
  }

  // Show runner advance for any runners still on base (not the batter, not the retired runner)
  const anyRunners = ["1st", "2nd", "3rd"].some((b) => S.bases[b]);
  if (anyRunners) {
    showRunnerAdvanceOnOut("groundout", () => {
      if (S.outs >= 3) {
        handleThreeOuts();
        return;
      }
      nextBatter();
    });
  } else {
    nextBatter();
  }
}

function checkForDoublePlay(
  outcome,
  pitchType,
  velocity,
  locStr,
  spray,
  afterCallback
) {
  const runners = ["1st", "2nd", "3rd"].filter((b) => S.bases[b]);

  // DP only possible on ground outs and line outs when runners are on base
  // and we still have outs remaining (not already 2 outs before the play)
  if (
    runners.length === 0 ||
    !["groundout", "lineout"].includes(outcome) ||
    S.outs >= 3
  ) {
    afterCallback();
    return;
  }

  // Open DP modal
  dpCallback = afterCallback;
  S.dpOutcome = outcome;
  S.dpPitchType = pitchType;
  S.dpVelocity = velocity;
  S.dpLoc = locStr;
  S.dpSpray = spray;

  const batter = currentBatter()?.name || "Batter";
  qs("dp-sub").textContent = `${batter} — ${
    outcome === "groundout" ? "Ground Out" : "Line Out"
  }. Was a runner also retired?`;

  // Update mini diamond
  ["1st", "2nd", "3rd"].forEach((b) => {
    const el = qs(
      `dp-base-${b === "1st" ? "1st" : b === "2nd" ? "2nd" : "3rd"}`
    );
    if (el) {
      el.style.background = S.bases[b]
        ? "var(--accent)"
        : "transparent";
      el.style.borderColor = S.bases[b]
        ? "var(--accent)"
        : "var(--border2)";
      el.style.boxShadow = S.bases[b]
        ? "0 0 8px rgba(204,26,26,.4)"
        : "none";
    }
  });

  // Build runner buttons
  const btns = qs("dp-runner-btns");
  btns.innerHTML = "";

  runners.forEach((base) => {
    const btn = document.createElement("button");
    const dpTypes = {
      "1st":
        outcome === "groundout"
          ? "4-6-3 / 6-4-3 DP"
          : "Line out + doubled off",
      "2nd":
        outcome === "groundout"
          ? "5-4-3 / 4-6-3 DP"
          : "Line out + doubled off",
      "3rd":
        outcome === "groundout"
          ? "5-4 / 3-6-1 DP"
          : "Line out + doubled off",
    };
    btn.style.cssText =
      "display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#f4f5f7;border:1.5px solid var(--border2);border-radius:8px;cursor:pointer;transition:all .14s;font-family:'Barlow Condensed',sans-serif;width:100%";
    btn.innerHTML = `
      <div>
<div style="font-weight:700;font-size:16px;color:var(--text)">Runner on ${base} retired</div>
<div style="font-size:10px;color:var(--text3);margin-top:1px">${dpTypes[base]}</div>
      </div>
      <div style="font-family:'Share Tech Mono',monospace;font-size:11px;color:var(--red);font-weight:700">2 OUTS</div>
    `;
    btn.onmouseenter = () => {
      btn.style.borderColor = "var(--red)";
      btn.style.background = "rgba(204,26,26,.06)";
    };
    btn.onmouseleave = () => {
      btn.style.borderColor = "var(--border2)";
      btn.style.background = "#f4f5f7";
    };
    btn.onclick = () => executeDoublePlay(base);
    btns.appendChild(btn);
  });

  qs("dp-type-label").style.display = "none";
  qs("dp-modal").style.display = "flex";
}

function executeDoublePlay(retiredBase) {
  qs("dp-modal").style.display = "none";

  // Remove the retired runner
  S.bases[retiredBase] = false;
  S.outs++; // second out (batter was already +1 out in commitPitch)
  {
    const _cp = activePitcher();
    if (_cp) _cp.outs = (_cp.outs || 0) + 1;
  }

  // Track fielding stats for the second out of the double play.
  // The relay/receiving fielder at the base where the runner was retired
  // gets the putout; the first fielder (already credited with an assist or
  // PO on the batter out) also gets an assist on this throw.
  // Conventional DP relay positions:
  //   runner retired at 2nd → 2B or SS takes the throw → credit 2B/SS PO
  //   runner retired at 3rd → 3B takes the throw → credit 3B PO
  //   runner retired at 1st → 1B takes the throw → credit 1B PO
  //   runner retired at home → C takes the throw → credit C PO
  const dpRelayPos = {
    "1st": "1B",
    "2nd": "SS", // most common; SS covers 2B on 4-6-3 / 6-4-3 style
    "3rd": "3B",
    home: "C",
  };
  const relayPos = dpRelayPos[retiredBase];
  if (relayPos) {
    // The original fielder (S._lastFielder from the batter out) gets an assist
    if (S._lastFielder && S._lastFielder !== relayPos) {
      _trackFielding(S._lastFielder, "a");
    }
    // The relay man at the base gets the putout
    _trackFielding(relayPos, "po");
  }

  const batter = currentBatter()?.name || "Batter";
  const label = S.dpOutcome === "groundout" ? "GO" : "LO";

  toast(`Double Play! (${label}) — 2 outs`);
  logEvent(
    "⚡",
    "Double Play",
    `${batter} — ${label}; runner retired at ${retiredBase} · ${
      S.outs
    } out${S.outs > 1 ? "s" : ""}`
  );

  // Update blurb
  const b = (s) => `<span class="blurb-batter">${s}</span>`;
  const out = (s) => `<span class="blurb-out">${s}</span>`;
  setPlayBlurb(
    `${b(batter)} ${out(
      "grounded into a double play"
    )}. Runner on ${retiredBase} also retired. ${S.outs} outs.`
  );

  if (S.outs >= 3) {
    handleThreeOuts();
    return;
  }

  if (dpCallback) {
    dpCallback();
    dpCallback = null;
  }
}

function closeDpModal() {
  // No DP — just proceed as a regular out
  qs("dp-modal").style.display = "none";
  if (dpCallback) {
    dpCallback();
    dpCallback = null;
  }
}

// ===================== SAVE GAME =====================
// ── Auto-save helpers ─────────────────────────────────────────────────
// Debounced per-pitch save — waits 2s after last pitch before writing.
// Prevents hammering storage on rapid pitch entry while still catching crashes.
let _autoSaveTimer = null;
function _scheduleAutoSave() {
  if (window._ptUserRole === "explorer") return; // Explorer mode: no auto-save
  clearTimeout(_autoSaveTimer);
  _autoSaveTimer = setTimeout(() => {
    if (S.gameId || (S.pitchLog && S.pitchLog.length > 0)) {
      saveGame(true).catch(() => {});
    }
  }, 2000);
}

// Synchronous emergency write to localStorage on page hide/unload.
// Cannot await async storage here — write directly so nothing is lost.
function _emergencyWrite() {
  try {
    if (!S.pitchLog || S.pitchLog.length === 0) return;
    if (!S.gameId) S.gameId = "ptgame_" + Date.now();
    const awayTeam =
      (
        document.getElementById("away-name-input") || {}
      ).value?.trim() || "AWAY";
    const homeTeam =
      (
        document.getElementById("home-name-input") || {}
      ).value?.trim() || "HOME";
    // Build a minimal game snapshot — same shape as saveGame
    const snap = {
      id: S.gameId,
      date: new Date().toISOString().split("T")[0],
      awayTeam,
      homeTeam,
      awayScore: S.awayScore,
      homeScore: S.homeScore,
      innings: S.inning,
      pitchLog: S.pitchLog,
      inningRuns: S.inningRuns,
      gameLog: S.gameLog,
      awayBatters: [],
      homeBatters: [],
      awayPitchers: S.pitchersAway
        ? S.pitchersAway.map((p) => ({ ...p }))
        : [],
      homePitchers: S.pitchersHome
        ? S.pitchersHome.map((p) => ({ ...p }))
        : [],
      fieldingStats: JSON.parse(JSON.stringify(S.fieldingStats || {})),
      totalPitches: S.pitchLog.length,
      resumable: {
        gameId: S.gameId,
        awayScore: S.awayScore,
        homeScore: S.homeScore,
        inning: S.inning,
        isTop: S.isTop,
        outs: S.outs,
        balls: S.balls,
        strikes: S.strikes,
        bases: { ...S.bases },
        awayBatterIdx: S.awayBatterIdx,
        homeBatterIdx: S.homeBatterIdx,
        lineupAway: S.lineupAway
          ? S.lineupAway.map((p) => ({ ...p }))
          : [],
        lineupHome: S.lineupHome
          ? S.lineupHome.map((p) => ({ ...p }))
          : [],
        pitchersAway: S.pitchersAway
          ? S.pitchersAway.map((p) => ({ ...p }))
          : [],
        pitchersHome: S.pitchersHome
          ? S.pitchersHome.map((p) => ({ ...p }))
          : [],
        pitchLog: S.pitchLog.map((p) => ({ ...p })),
        inningRuns: [...S.inningRuns],
        gameLog: [...S.gameLog],
        batterStats: JSON.parse(JSON.stringify(S.batterStats || {})),
        lineupResults: JSON.parse(
          JSON.stringify(S.lineupResults || {})
        ),
        currentAtBatPitches: [...(S.currentAtBatPitches || [])],
        pitchCount: S.pitchCount,
      },
    };
    window.localStorage.setItem("pt_" + S.gameId, JSON.stringify(snap));
    // Update team index synchronously
    try {
      const teamsRaw = window.localStorage.getItem(
        "pt_pitchtrack_teams"
      );
      const teams = teamsRaw ? JSON.parse(teamsRaw) : [];
      [awayTeam, homeTeam].forEach((t) => {
        const lower = t.toLowerCase();
        if (!teams.find((x) => x.toLowerCase() === lower))
          teams.push(t);
      });
      window.localStorage.setItem(
        "pt_pitchtrack_teams",
        JSON.stringify(teams)
      );
    } catch (e) {}
  } catch (e) {}
}

// Save when tab becomes hidden (user switches apps, closes tab, etc.)
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    _emergencyWrite();
  }
});

// Last-resort synchronous write on page unload
window.addEventListener("beforeunload", () => {
  _emergencyWrite();
});
// ─────────────────────────────────────────────────────────────────────

async function saveGame(silent = false) {
  if (window._ptUserRole === "explorer") return; // Explorer mode: no saves
  const awayTeam = qs("away-name-input").value.trim() || "AWAY";
  const homeTeam = qs("home-name-input").value.trim() || "HOME";
  const date = new Date().toISOString().split("T")[0];

  // Use the stable game ID — create one now if no pitches thrown yet
  if (!S.gameId) S.gameId = `ptgame_${Date.now()}`;
  const gameId = S.gameId;

  // Build per-player stats for both teams
  const buildBatterRows = (lineup, isAway) =>
    lineup.map((p, i) => {
      const bs = getBatterStats(getBatterKey(isAway, i));
      const results = S.lineupResults[getBatterKey(isAway, i)] || [];
      // Count pitches seen — filter by batter name AND which team was batting
      // isAway=true means away team bats, which is S.isTop=true in the pitch log
      const pitchesSeen = S.pitchLog.filter(
        (e) => e.batter === p.name && e.isTop === isAway
      ).length;
      return {
        name: p.name,
        num: p.num,
        pos: p.pos,
        hand: p.hand,
        pa: bs.pa,
        ab: bs.ab,
        hits: bs.hits,
        bb: bs.bb,
        k: bs.k,
        hbp: bs.hbp || 0,
        ci: bs.ci || 0,
        pitchesSeen,
        doubles: results.filter((r) => r.label === "2B").length,
        triples: results.filter((r) => r.label === "3B").length,
        hr: results.filter((r) => r.label === "HR").length,
        sb: bs.sb || 0,
        cs: bs.cs || 0,
        po: bs.po || 0,
        r: bs.r || 0,
        rbi: bs.rbi || 0,
        results: results.map((r) => r.label),
      };
    });

  const game = {
    id: gameId,
    date,
    awayTeam,
    homeTeam,
    awayScore: S.awayScore,
    homeScore: S.homeScore,
    innings: S.inning,
    pitchLog: S.pitchLog,
    inningRuns: S.inningRuns,
    gameLog: S.gameLog,
    awayBatters: buildBatterRows(S.lineupAway, true),
    homeBatters: buildBatterRows(S.lineupHome, false),
    awayPitchers: S.pitchersAway.map((p) => ({ ...p })),
    homePitchers: S.pitchersHome.map((p) => ({ ...p })),
    fieldingStats: JSON.parse(JSON.stringify(S.fieldingStats || {})),
    totalPitches: S.pitchLog.length,
    // ── Full resumable state ──
    resumable: {
      gameId: gameId, // store so resume restores the same stable ID
      awayScore: S.awayScore,
      homeScore: S.homeScore,
      inning: S.inning,
      isTop: S.isTop,
      outs: S.outs,
      balls: S.balls,
      strikes: S.strikes,
      bases: { ...S.bases },
      awayBatterIdx: S.awayBatterIdx,
      homeBatterIdx: S.homeBatterIdx,
      lineupAway: S.lineupAway.map((p) => ({ ...p })),
      lineupHome: S.lineupHome.map((p) => ({ ...p })),
      pitchersAway: S.pitchersAway.map((p) => ({ ...p })),
      pitchersHome: S.pitchersHome.map((p) => ({ ...p })),
      pitchLog: S.pitchLog.map((p) => ({ ...p })),
      inningRuns: [...S.inningRuns],
      gameLog: [...S.gameLog],
      batterStats: JSON.parse(JSON.stringify(S.batterStats)),
      lineupResults: JSON.parse(JSON.stringify(S.lineupResults)),
      currentAtBatPitches: [...S.currentAtBatPitches],
      pitchCount: S.pitchCount,
    },
  };

  try {
    await window.storage.set(gameId, JSON.stringify(game), true);

    // Update team index (shared list of all team names for the hub)
    let teamsRaw;
    try {
      teamsRaw = await window.storage.get("pitchtrack_teams", true);
    } catch (e) {}
    const teams = teamsRaw ? JSON.parse(teamsRaw.value) : [];
    [awayTeam, homeTeam].forEach((t) => {
      _addTeamToIndex(t, teams);
    });
    await window.storage.set(
      "pitchtrack_teams",
      JSON.stringify(teams),
      true
    );

    try {
      unsavedGame = false;
      updateDot();
    } catch (e) {}
    if (!silent) {
      toast(`Game saved! ${awayTeam} vs ${homeTeam} — ${date}`);
      try {
        const saveBtn = document.getElementById("sn-save-btn");
        if (saveBtn) {
          saveBtn.textContent = "✓ Saved";
          saveBtn.classList.add("ok");
          setTimeout(() => {
            saveBtn.textContent = "Save";
            saveBtn.classList.remove("ok");
          }, 3000);
        }
      } catch (e) {}
    }
  } catch (err) {
    toast("Save failed — " + (err?.message || "storage unavailable"));
    console.error("saveGame error:", err);
  }
}

// ===================== LOAD / RESUME GAME =====================
async function showResumeModal() {
  const modal = document.getElementById("resume-modal");
  const list = document.getElementById("resume-game-list");
  list.innerHTML =
    '<div style="padding:20px;text-align:center;color:#8a909e;font-size:13px">Loading games…</div>';
  modal.style.display = "flex";

  try {
    const keys = await window.storage.list("ptgame_", true);
    const games = [];
    for (const key of keys?.keys || []) {
      try {
        const raw = await window.storage.get(key, true);
        if (raw?.value) {
          const g = JSON.parse(raw.value);
          if (g.resumable) games.push(g);
        }
      } catch (e) {}
    }
    games.sort((a, b) => b.date.localeCompare(a.date));

    if (!games.length) {
      list.innerHTML =
        '<div style="padding:20px;text-align:center;color:#8a909e;font-size:13px">No saved games with resumable data found.<br><small>Re-save any existing game to enable resuming.</small></div>';
      return;
    }

    list.innerHTML = games
      .map((g) => {
        const r = g.resumable;
        const half = r.isTop ? "Top" : "Bot";
        const progress = `${half} ${r.inning} · ${g.awayTeam} ${r.awayScore}–${r.homeScore} ${g.homeTeam} · ${g.totalPitches}P`;
        return `<div onclick="resumeGame('${g.id}')" style="
display:flex;align-items:center;justify-content:space-between;
padding:12px 16px;border:1.5px solid #d4d8e0;border-radius:10px;
cursor:pointer;transition:all .14s;margin-bottom:8px;background:#f8f9fb
      " onmouseover="this.style.borderColor='#cc1a1a';this.style.background='rgba(204,26,26,.04)'"
 onmouseout="this.style.borderColor='#d4d8e0';this.style.background='#f8f9fb'">
<div>
  <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:16px;color:#111318">
    ${escHtml(g.awayTeam)} vs ${escHtml(g.homeTeam)}
  </div>
  <div style="font-size:11px;color:#8a909e;margin-top:2px">${
    g.date
  } · ${progress}</div>
</div>
<div style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:22px;color:#cc1a1a">
  ${r.awayScore}–${r.homeScore}
</div>
      </div>`;
      })
      .join("");
  } catch (e) {
    list.innerHTML =
      '<div style="padding:20px;text-align:center;color:#cc1a1a;font-size:13px">Failed to load saved games.</div>';
    console.error("showResumeModal error:", e);
  }
}

async function resumeGame(gameId) {
  document.getElementById("resume-modal").style.display = "none";

  try {
    const raw = await window.storage.get(gameId, true);
    if (!raw?.value) throw new Error("Game not found");
    const g = JSON.parse(raw.value);
    const r = g.resumable;
    if (!r) throw new Error("No resumable data");

    // Restore full state
    S.gameId = r.gameId || g.id; // critical — ensures saves overwrite same record
    S.awayScore = r.awayScore;
    S.homeScore = r.homeScore;
    S.inning = r.inning;
    S.isTop = r.isTop;
    S.outs = r.outs;
    S.balls = r.balls || 0;
    S.strikes = r.strikes || 0;
    S.bases = r.bases || { "1st": false, "2nd": false, "3rd": false };
    S.awayBatterIdx = r.awayBatterIdx || 0;
    S.homeBatterIdx = r.homeBatterIdx || 0;
    S.lineupAway = r.lineupAway;
    S.lineupHome = r.lineupHome;
    S.pitchersAway = r.pitchersAway;
    S.pitchersHome = r.pitchersHome;
    S.pitchLog = r.pitchLog || [];
    S.inningRuns = r.inningRuns || [];
    S.gameLog = r.gameLog || [];
    S.batterStats = r.batterStats || {};
    S.fieldingStats = g.fieldingStats || {};
    S.lineupResults = r.lineupResults || {};
    S.currentAtBatPitches = r.currentAtBatPitches || [];
    S.pitchCount = r.pitchCount || 0;

    // Restore team name inputs
    const an = qs("away-name-input"),
      hn = qs("home-name-input");
    if (an) an.value = g.awayTeam;
    if (hn) hn.value = g.homeTeam;

    // Rebuild UI
    renderLineup();
    renderPitcherList();
    updateScoreBug();
    renderPitchLog();
    renderBoxScore();
    renderPitchMix();
    renderGameLog();
    clearAtBat();
    // Restore pitch grid for the active pitcher
    try {
      renderPitchTypeGrid(_resolveActivePitcherTypes(activePitcher()));
    } catch (e) {}

    // Restore AB strip chips for current AB
    qsa("#ab-strip .ab-pitch-chip").forEach((c) => c.remove());
    S.currentAtBatPitches.forEach((p) => {
      addAbChip(p.dotClass, p.label, p.pitchType, p.velocity);
    });

    const blurbBatter = currentBatter()?.name || "Batter";
    setPlayBlurb(
      `<span style="color:var(--text3);font-size:13px">Resumed — ${escHtml(
        g.awayTeam
      )} vs ${escHtml(g.homeTeam)} · ${r.isTop ? "Top" : "Bot"} ${
        r.inning
      }</span>`
    );

    try {
      markUnsaved();
    } catch (e) {} // mark as unsaved since state has changed
    toast(`Resumed: ${g.awayTeam} vs ${g.homeTeam} · ${g.date}`);
  } catch (err) {
    toast("Failed to resume game");
    console.error("resumeGame error:", err);
  }
}

let toastTimer;
// ===================== MOBILE UI =====================
let _currentMobTab = "zone";
let _mobLogTab = "boxscore";

function isMobile() {
  return window.innerWidth <= 768;
}

// ════════════════════════════════════════════════════════════
// KEEP: Mobile Preview — opens an iPhone-frame iframe overlay
// so desktop users can test the mobile layout without a device.
// Button lives on home screen (#mob-preview-wrap), hidden on
// real mobile via CSS. Do NOT remove these functions.
// ════════════════════════════════════════════════════════════
function openMobilePreview() {
  if (document.getElementById("mob-preview-overlay")) return;

  var overlay = document.createElement("div");
  overlay.id = "mob-preview-overlay";
  overlay.style.cssText =
    "position:fixed;inset:0;background:rgba(0,0,0,0.88);z-index:99999;" +
    "display:flex;flex-direction:column;align-items:center;justify-content:center;" +
    "gap:16px;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)";
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) closeMobilePreview();
  });

  var frame = document.createElement("div");
  frame.style.cssText =
    "position:relative;width:393px;" +
    "height:min(852px,calc(100vh - 120px));" +
    "background:#111;border-radius:44px;" +
    "box-shadow:0 0 0 10px #1c1c1c,0 0 0 12px #333,0 40px 80px rgba(0,0,0,0.8);" +
    "overflow:hidden;flex-shrink:0";

  var iframe = document.createElement("iframe");
  iframe.src = "./index.html?preview=1";
  iframe.style.cssText =
    "width:100%;height:100%;border:none;display:block;border-radius:44px";
  iframe.title = "Mobile Preview";

  frame.appendChild(iframe);

  var closeBtn = document.createElement("button");
  closeBtn.textContent = "\u2715  Close Preview";
  closeBtn.style.cssText =
    "background:rgba(255,255,255,0.1);border:1.5px solid rgba(255,255,255,0.25);" +
    "border-radius:8px;color:rgba(255,255,255,0.8);" +
    "font-family:'Barlow Condensed',sans-serif;font-weight:700;" +
    "font-size:13px;letter-spacing:2px;text-transform:uppercase;" +
    "padding:10px 24px;cursor:pointer;-webkit-tap-highlight-color:transparent";
  closeBtn.onclick = closeMobilePreview;

  overlay.appendChild(frame);
  overlay.appendChild(closeBtn);
  document.body.appendChild(overlay);
}

function closeMobilePreview() {
  var el = document.getElementById("mob-preview-overlay");
  if (el) el.parentNode.removeChild(el);
}

function mobTab(tab) {
  _currentMobTab = tab;
  ["zone", "score", "lineup", "pitchers", "log"].forEach((t) => {
    const el = document.getElementById("mobtab-" + t);
    if (el) el.classList.toggle("on", t === tab);
  });
  const panelCenter = document.getElementById("panel-center");
  const scoreP = document.getElementById("mob-score-panel");
  const lineupP = document.getElementById("mob-lineup-panel");
  const pitchersP = document.getElementById("mob-pitchers-panel");
  const logP = document.getElementById("mob-log-panel");
  if (panelCenter)
    panelCenter.style.display = tab === "zone" ? "flex" : "none";
  if (scoreP) scoreP.classList.toggle("on", tab === "score");
  if (lineupP) lineupP.classList.toggle("on", tab === "lineup");
  if (pitchersP) pitchersP.classList.toggle("on", tab === "pitchers");
  if (logP) logP.classList.toggle("on", tab === "log");
  if (tab === "lineup") renderMobLineup();
  if (tab === "pitchers") renderMobPitchers();
  if (tab === "log") renderMobLog(_mobLogTab);
  if (tab === "score") updateMobScore();
}

function mobLogTab(t) {
  _mobLogTab = t;
  ["boxscore", "scouting", "pitchmix", "gamelog"].forEach((id) => {
    const el = document.getElementById("mob-tab-" + id);
    if (el) el.classList.toggle("active", id === t);
  });
  renderMobLog(t);
}

function renderMobLog(t) {
  const wrap = document.getElementById("mob-log-content");
  if (!wrap) return;
  if (t === "scouting") {
    const scoutContent = document.getElementById("content-scouting");
    if (scoutContent) scoutContent.classList.add("active");
    renderLiveScoutingTab(true);
    if (scoutContent) scoutContent.classList.remove("active");
    const src = document.getElementById("live-scout-wrap");
    wrap.innerHTML = src
      ? src.innerHTML
      : '<div style="padding:20px;text-align:center;color:var(--text3);font-size:12px">No scouting data yet.</div>';
    return;
  }
  // Ensure desktop renders are fresh before copying
  try {
    if (t === "boxscore") renderBoxScore();
  } catch (e) {}
  try {
    if (t === "pitchmix") renderPitchMix();
  } catch (e) {}
  const srcMap = {
    boxscore: "content-boxscore",
    pitchmix: "content-pitchstats",
    gamelog: "game-log-list",
  };
  const src = document.getElementById(srcMap[t]);
  wrap.innerHTML = src
    ? src.innerHTML
    : '<div style="padding:20px;text-align:center;color:var(--text3);font-size:12px">No data yet.</div>';
}

let _mobEditingPitcher = null;
let _mobEditingSlot = null;

// ── MOBILE PITCHERS ──────────────────────────────────────────────
function renderMobPitchers() {
  const wrap = document.getElementById("mob-pitchers-content");
  if (!wrap) return;

  const list = activePitcherList();
  const teamLabel = S.isTop ? "HOME PITCHING" : "AWAY PITCHING";
  let html = `<div style="font-size:8px;letter-spacing:2px;color:var(--text3);text-transform:uppercase;font-weight:600;margin-bottom:10px">${teamLabel}</div>`;

  list.forEach((p, i) => {
    const isEditing = _mobEditingPitcher === i;
    const handColor =
      (p.hand || "R") === "L" ? "var(--blue)" : "var(--text3)";
    if (isEditing) {
      html += `<div style="background:var(--surface2);border:1px solid var(--border2);border-radius:8px;padding:10px;margin-bottom:8px">
<div style="font-size:8px;letter-spacing:2px;color:var(--text3);text-transform:uppercase;font-weight:600;margin-bottom:8px">Edit Pitcher</div>
<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
  <input id="mob-ep-num-${i}"  value="${
        p.num || ""
      }"  placeholder="#" style="width:44px;background:var(--surface3);border:1px solid var(--border2);border-radius:5px;color:var(--text);font-family:'Barlow Condensed',sans-serif;font-size:14px;padding:6px 6px;outline:none;text-align:center">
  <input id="mob-ep-name-${i}" value="${
        p.name || ""
      }" placeholder="Name..." style="flex:1;min-width:100px;background:var(--surface3);border:1px solid var(--border2);border-radius:5px;color:var(--text);font-family:'Barlow Condensed',sans-serif;font-size:14px;padding:6px 8px;outline:none">
  <select id="mob-ep-hand-${i}" style="background:var(--surface3);border:1px solid var(--border2);border-radius:5px;color:var(--text);font-family:'Barlow Condensed',sans-serif;font-size:14px;padding:6px 6px;outline:none;cursor:pointer">
    <option value="R"${
      (p.hand || "R") === "R" ? " selected" : ""
    }>R</option>
    <option value="L"${p.hand === "L" ? " selected" : ""}>L</option>
  </select>
  <button onclick="saveMobPitcherEdit(${i})" style="background:var(--accent);border:none;border-radius:5px;color:#fff;font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:14px;padding:7px 12px;cursor:pointer">✓</button>
  <button onclick="_mobEditingPitcher=null;renderMobPitchers()" style="background:none;border:1px solid var(--border);border-radius:5px;color:var(--text3);padding:7px 10px;cursor:pointer">✕</button>
</div>
      </div>`;
    } else {
      html += `<div style="display:flex;align-items:center;gap:8px;padding:9px 10px;background:${
        p.active ? "rgba(204,26,26,.06)" : "var(--surface2)"
      };border:${
        p.active
          ? "1.5px solid var(--accent)"
          : "1px solid var(--border)"
      };border-radius:8px;margin-bottom:6px;cursor:pointer" onclick="setActivePitcher(${i});renderMobPitchers()">
<div style="width:8px;height:8px;border-radius:50%;flex-shrink:0;background:${
  p.active ? "var(--accent)" : "transparent"
};border:${p.active ? "none" : "1px solid var(--text3)"}"></div>
<div style="flex:1;min-width:0">
  <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:15px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
    <span style="color:var(--text3);font-size:12px;margin-right:4px">#${
      p.num || "?"
    }</span>${p.name}
    <span style="font-size:9px;font-weight:700;color:${handColor};letter-spacing:1px;margin-left:4px">${
        p.hand || "R"
      }HP</span>
    ${
      p.active
        ? '<span style="font-size:9px;color:var(--accent);letter-spacing:1px;margin-left:4px">NOW</span>'
        : ""
    }
  </div>
  <div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--text3);margin-top:2px">${
    p.pitches
  }P · ${p.strikes}str · ${p.k}K · ${p.bb}BB · ${p.hits}H</div>
</div>
<button onclick="event.stopPropagation();_mobEditingPitcher=${i};renderMobPitchers()" style="background:none;border:1px solid var(--border);border-radius:4px;color:var(--text3);font-size:11px;padding:4px 8px;cursor:pointer">✎</button>
<button onclick="event.stopPropagation();removePitcher(event,${i});renderMobPitchers()" style="background:none;border:none;color:var(--text3);font-size:13px;padding:4px 7px;cursor:pointer;opacity:.5">✕</button>
      </div>`;
    }
  });

  // Add pitcher form — show roster cards only for the pitching team
  const _pitchSrc = S.isTop ? _rosterSrcHome : _rosterSrcAway;
  const _pitchPool =
    _pitchSrc === "myteam"
      ? myTeamRoster || []
      : _pitchSrc && _pitchSrc.roster
      ? _pitchSrc.roster
      : [];
  const _pitcherPos = ["RHP", "LHP", "P", "UTL/RHP", "C/RHP", "3B/RHP"];
  const primaryPitchers = _pitchPool.filter((p) =>
    _pitcherPos.includes(p.pos)
  );
  const otherPlayers = _pitchPool.filter(
    (p) => !_pitcherPos.includes(p.pos)
  );
  const _mkPitcherCard = (p) =>
    `<div onclick="mobFillPitcherFromRoster('${
      p.id
    }')" style="display:flex;align-items:center;gap:8px;padding:7px 8px;background:var(--surface3);border:1px solid var(--border);border-radius:6px;cursor:pointer;-webkit-tap-highlight-color:transparent">
      <div style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:14px;color:var(--blue);width:30px;text-align:right;flex-shrink:0">#${
        p.num || "—"
      }</div>
      <div style="flex:1;min-width:0">
        <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:13px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${
          p.name
        }</div>
        <div style="font-size:9px;color:var(--text3)">${
          p.pos || "—"
        } · ${p.throw || "R"}HP</div>
      </div>
    </div>`;
  const pitcherRosterHtml =
    primaryPitchers.length > 0 || otherPlayers.length > 0
      ? `<div style="margin-top:8px;border-top:1px solid var(--border);padding-top:8px">
        <div style="font-size:8px;letter-spacing:2px;color:var(--text3);text-transform:uppercase;font-weight:600;margin-bottom:6px">Add from Roster</div>
        <div style="max-height:180px;overflow-y:auto;display:flex;flex-direction:column;gap:3px">
          ${primaryPitchers.map(_mkPitcherCard).join("")}
          ${
            otherPlayers.length > 0
              ? `<div style="font-size:8px;letter-spacing:2px;color:var(--text3);text-transform:uppercase;font-weight:600;margin-top:6px;margin-bottom:2px">Position Players</div>${otherPlayers
                  .map(_mkPitcherCard)
                  .join("")}`
              : ""
          }
        </div>
      </div>`
      : "";
  html += `<div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:10px;margin-top:4px">
    <div style="font-size:8px;letter-spacing:2px;color:var(--text3);text-transform:uppercase;font-weight:600;margin-bottom:8px">Add Pitcher</div>
    <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
      <input id="mob-np-num"  placeholder="#" style="width:44px;background:#fff;border:1px solid var(--border);border-radius:5px;color:var(--text);font-family:'Barlow Condensed',sans-serif;font-size:14px;padding:6px 6px;outline:none;text-align:center">
      <input id="mob-np-name" placeholder="Name..." style="flex:1;min-width:100px;background:#fff;border:1px solid var(--border);border-radius:5px;color:var(--text);font-family:'Barlow Condensed',sans-serif;font-size:14px;padding:6px 8px;outline:none">
      <select id="mob-np-hand" style="background:#fff;border:1px solid var(--border);border-radius:5px;color:var(--text);font-family:'Barlow Condensed',sans-serif;font-size:14px;padding:6px 6px;outline:none;cursor:pointer">
<option value="R">R</option>
<option value="L">L</option>
      </select>
      <button onclick="addMobPitcher()" style="background:var(--accent);border:none;border-radius:5px;color:#fff;font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:13px;padding:7px 12px;cursor:pointer;white-space:nowrap">+ Add</button>
    </div>
    ${pitcherRosterHtml}
  </div>`;

  wrap.innerHTML = html;
}

function saveMobPitcherEdit(i) {
  const list = activePitcherList();
  const n = document.getElementById(`mob-ep-name-${i}`)?.value.trim();
  const num = document.getElementById(`mob-ep-num-${i}`)?.value.trim();
  const hand =
    document.getElementById(`mob-ep-hand-${i}`)?.value || "R";
  if (n) list[i].name = n;
  list[i].num = num || list[i].num;
  list[i].hand = hand;
  _mobEditingPitcher = null;
  renderMobPitchers();
  updateScoreBug();
}

function addMobPitcher() {
  const name = document.getElementById("mob-np-name")?.value.trim();
  const num = document.getElementById("mob-np-num")?.value.trim();
  const hand = document.getElementById("mob-np-hand")?.value || "R";
  if (!name) return;
  activePitcherList().forEach((p) => (p.active = false));
  activePitcherList().push({
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
  document.getElementById("mob-np-name").value = "";
  document.getElementById("mob-np-num").value = "";
  renderMobPitchers();
  renderPitcherList();
  updateScoreBug();
  toast(`Pitching: #${num} ${name}`);
}

function mobFillPitcherFromRoster(pid) {
  const _pitchSrc = S.isTop ? _rosterSrcHome : _rosterSrcAway;
  const _pool =
    _pitchSrc === "myteam"
      ? myTeamRoster || []
      : _pitchSrc && _pitchSrc.roster
      ? _pitchSrc.roster
      : [];
  const p = _pool.find((x) => x.id === pid);
  if (!p) return;
  activePitcherList().forEach((x) => (x.active = false));
  activePitcherList().push({
    name: p.name,
    num: p.num || "0",
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
  renderMobPitchers();
  renderPitcherList();
  updateScoreBug();
  toast(`Pitching: #${p.num} ${p.name}`);
}

function mobFillFromRoster(pid, slotIdx) {
  // Determine correct roster source for the side being edited
  const editSide = _mobEditingSlot ? _mobEditingSlot.side : null;
  const src = editSide === "away" ? _rosterSrcAway : _rosterSrcHome;
  const pool =
    src === "myteam"
      ? myTeamRoster || []
      : src && src.roster
      ? src.roster
      : myTeamRoster || [];
  const p = pool.find((x) => x.id === pid);
  if (!p) return;
  mobShowSubOptions(p, slotIdx);
}

function mobShowSubOptions(p, slotIdx) {
  var existing = document.getElementById("mob-sub-overlay");
  if (existing) existing.remove();

  var overlay = document.createElement("div");
  overlay.id = "mob-sub-overlay";
  overlay.style.cssText =
    "position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:99998;" +
    "display:flex;align-items:flex-end;justify-content:center";
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) overlay.remove();
  });

  var sheet = document.createElement("div");
  sheet.style.cssText =
    "background:var(--surface2);border-radius:20px 20px 0 0;width:100%;" +
    "padding:16px 16px 40px;box-shadow:0 -8px 32px rgba(0,0,0,.3)";

  sheet.innerHTML =
    '<div style="width:40px;height:4px;background:var(--border2);border-radius:2px;margin:0 auto 14px"></div>' +
    '<div style="font-family:Barlow Condensed,sans-serif;font-weight:900;font-size:20px;color:var(--text);margin-bottom:2px">#' +
    (p.num || "\u2014") +
    " " +
    p.name +
    "</div>" +
    '<div style="font-size:11px;color:var(--text3);margin-bottom:14px">' +
    (p.pos || "\u2014") +
    " \u00b7 " +
    (p.bat || "R") +
    "/" +
    (p.throw || "R") +
    "</div>" +
    '<div style="font-size:9px;color:var(--text3);font-family:Barlow,sans-serif;font-weight:600;' +
    'letter-spacing:1.5px;text-transform:uppercase;margin-bottom:10px">Substitute as:</div>';

  var opts = [
    {
      label: "\uD83D\uDD04 Pinch Hitter",
      sub: "PH",
      desc: "Place in slot " + (slotIdx + 1) + " as PH",
    },
    {
      label: "\uD83C\uDFC3 Pinch Runner",
      sub: "PR",
      desc: "Replace a baserunner",
    },
    {
      label: "\uD83D\uDEE1 Defensive Sub",
      sub: "DEF",
      desc: "Place in slot " + (slotIdx + 1) + " as DEF",
    },
    {
      label: "\uD83D\uDCCB Set in lineup",
      sub: "SLOT",
      desc: "Place in slot " + (slotIdx + 1),
    },
  ];

  opts.forEach(function (opt) {
    var btn = document.createElement("button");
    btn.style.cssText =
      "display:flex;flex-direction:column;width:100%;text-align:left;" +
      "background:var(--surface3);border:1px solid var(--border);border-radius:10px;" +
      "padding:12px 14px;cursor:pointer;margin-bottom:8px;" +
      "-webkit-tap-highlight-color:transparent;touch-action:manipulation";
    btn.innerHTML =
      '<span style="font-family:Barlow Condensed,sans-serif;font-weight:700;font-size:15px;color:var(--text)">' +
      opt.label +
      "</span>" +
      '<span style="font-size:11px;color:var(--text3);margin-top:2px">' +
      opt.desc +
      "</span>";
    btn.addEventListener("click", function () {
      overlay.remove();
      var side = S.isTop ? "away" : "home";
      var lineup = side === "away" ? S.lineupAway : S.lineupHome;

      if (opt.sub === "PR") {
        // Base selector uses lmApplySub which needs lineupModalSide
        lineupModalSide = side;
        lmShowBaseSelector(p);
        _mobEditingSlot = null;
        renderMobLineup();
      } else {
        // All other subs go directly into the edited slot
        lineup[slotIdx] = {
          name: p.name,
          num: p.num || String(slotIdx + 1),
          pos: p.pos || "OF",
          hand: p.bat || "R",
          isPH: opt.sub === "PH",
          isPR: false,
          isDEF: opt.sub === "DEF",
        };
        _mobEditingSlot = null;
        renderMobLineup();
        renderLineup();
        updateScoreBug();
        var label =
          opt.sub === "PH"
            ? " as Pinch Hitter"
            : opt.sub === "DEF"
            ? " as Defensive Sub"
            : "";
        toast("#" + p.num + " " + p.name + label);
      }
    });
    sheet.appendChild(btn);
  });

  // Cancel button
  var cancelBtn = document.createElement("button");
  cancelBtn.textContent = "Cancel";
  cancelBtn.style.cssText =
    "width:100%;text-align:center;background:none;border:1.5px solid var(--border2);" +
    "border-radius:10px;padding:12px;cursor:pointer;margin-top:4px;" +
    "font-family:Barlow Condensed,sans-serif;font-weight:700;font-size:15px;" +
    "color:var(--text3);-webkit-tap-highlight-color:transparent;touch-action:manipulation";
  cancelBtn.addEventListener("click", function () {
    overlay.remove();
  });
  sheet.appendChild(cancelBtn);

  overlay.appendChild(sheet);
  document.body.appendChild(overlay);
}

// ── MOBILE LINEUP ─────────────────────────────────────────────────
function renderMobLineup() {
  const wrap = document.getElementById("mob-lineup-content");
  if (!wrap) return;

  const lineup = currentLineup();
  const idx = currentBatterIdx() % lineup.length;
  const side = S.isTop ? "away" : "home";
  const label = S.isTop ? "AWAY BATTING ORDER" : "HOME BATTING ORDER";

  let html = `<div style="font-size:8px;letter-spacing:2px;color:var(--text3);text-transform:uppercase;font-weight:600;margin-bottom:10px">${label}</div>`;

  lineup.forEach((b, i) => {
    const isActive = i === idx;
    const isEditing =
      _mobEditingSlot?.side === side && _mobEditingSlot?.idx === i;
    const handColor =
      b.hand === "L"
        ? "var(--blue)"
        : b.hand === "S"
        ? "var(--foul)"
        : "var(--text3)";

    if (isEditing) {
      // Determine which roster to show based on which team was loaded for this side
      const _rosterSrc =
        side === "away" ? _rosterSrcAway : _rosterSrcHome;
      const _pitcherPositions = [
        "RHP",
        "LHP",
        "P",
        "UTL/RHP",
        "C/RHP",
        "3B/RHP",
      ];
      const _fullBatterPool =
        _rosterSrc === "myteam"
          ? myTeamRoster || []
          : _rosterSrc && _rosterSrc.roster
          ? _rosterSrc.roster
          : [];
      const primaryBatters = _fullBatterPool.filter(
        (p) => !_pitcherPositions.includes(p.pos)
      );
      const pitcherPlayers = _fullBatterPool.filter((p) =>
        _pitcherPositions.includes(p.pos)
      );
      const _mkBatterCard = (p) =>
        `<div onclick="mobFillFromRoster('${
          p.id
        }',${i})" style="display:flex;align-items:center;gap:8px;padding:7px 8px;background:var(--surface3);border:1px solid var(--border);border-radius:6px;cursor:pointer;-webkit-tap-highlight-color:transparent">
          <div style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:14px;color:var(--accent);width:30px;text-align:right;flex-shrink:0">#${
            p.num || "—"
          }</div>
          <div style="flex:1;min-width:0">
            <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:13px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${
              p.name
            }</div>
            <div style="font-size:9px;color:var(--text3)">${
              p.pos || "—"
            } · ${p.bat || "R"}/${p.throw || "R"}</div>
          </div>
        </div>`;
      const rosterPickerHtml =
        _fullBatterPool.length > 0
          ? `<div style="margin-top:8px;border-top:1px solid var(--border);padding-top:8px">
            <div style="font-size:8px;letter-spacing:2px;color:var(--text3);text-transform:uppercase;font-weight:600;margin-bottom:6px">Pick from Roster</div>
            <div style="max-height:200px;overflow-y:auto;display:flex;flex-direction:column;gap:3px">
              ${primaryBatters.map(_mkBatterCard).join("")}
              ${
                pitcherPlayers.length > 0
                  ? `<div style="font-size:8px;letter-spacing:2px;color:var(--text3);text-transform:uppercase;font-weight:600;margin-top:6px;margin-bottom:2px">Pitchers</div>${pitcherPlayers
                      .map(_mkBatterCard)
                      .join("")}`
                  : ""
              }
            </div>
          </div>`
          : "";
      html += `<div style="background:var(--surface2);border:1px solid var(--border2);border-radius:8px;padding:10px;margin-bottom:6px">
<div style="font-size:8px;letter-spacing:2px;color:var(--text3);text-transform:uppercase;font-weight:600;margin-bottom:8px">${
  i + 1
}. Edit Player</div>
<div style="display:flex;gap:5px;align-items:center;flex-wrap:wrap">
  <input id="mob-el-num-${i}"  value="${
        b.num || ""
      }"  placeholder="#"   style="width:44px;background:var(--surface3);border:1px solid var(--border2);border-radius:5px;color:var(--text);font-family:'Barlow Condensed',sans-serif;font-size:14px;padding:6px 5px;outline:none;text-align:center">
  <input id="mob-el-name-${i}" value="${
        b.name || ""
      }" placeholder="Name..." style="flex:1;min-width:100px;background:var(--surface3);border:1px solid var(--border2);border-radius:5px;color:var(--text);font-family:'Barlow Condensed',sans-serif;font-size:14px;padding:6px 8px;outline:none">
  <input id="mob-el-pos-${i}"  value="${
        b.pos || ""
      }"  placeholder="POS" maxlength="3" style="width:44px;background:var(--surface3);border:1px solid var(--border2);border-radius:5px;color:var(--text);font-family:'Barlow Condensed',sans-serif;font-size:14px;padding:6px 5px;outline:none;text-align:center;text-transform:uppercase">
  <select id="mob-el-hand-${i}" style="background:var(--surface3);border:1px solid var(--border2);border-radius:5px;color:var(--text);font-family:'Barlow Condensed',sans-serif;font-size:14px;padding:6px 6px;outline:none;cursor:pointer">
    <option value="R"${
      (b.hand || "R") === "R" ? " selected" : ""
    }>R</option>
    <option value="L"${b.hand === "L" ? " selected" : ""}>L</option>
    <option value="S"${b.hand === "S" ? " selected" : ""}>S</option>
  </select>
  <button onclick="saveMobLineupSlot(${i})" style="background:var(--accent);border:none;border-radius:5px;color:#fff;font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:14px;padding:7px 12px;cursor:pointer">✓</button>
  <button onclick="_mobEditingSlot=null;renderMobLineup()" style="background:none;border:1px solid var(--border);border-radius:5px;color:var(--text3);padding:7px 10px;cursor:pointer">✕</button>
</div>
${rosterPickerHtml}
      </div>`;
    } else {
      html += `<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:${
        isActive
          ? "linear-gradient(90deg,rgba(204,26,26,.08),transparent)"
          : "transparent"
      };border-left:${
        isActive ? "3px solid var(--accent)" : "3px solid transparent"
      };border-radius:6px;margin-bottom:2px" onclick="setBatterIdx(${i});clearAtBat()">
<div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:12px;color:${
  isActive ? "var(--accent)" : "var(--text3)"
};width:14px;text-align:center;flex-shrink:0">${i + 1}</div>
<div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:${
  isActive ? "var(--accent)" : "var(--text2)"
};width:26px;text-align:center;flex-shrink:0;background:var(--surface3);border-radius:3px;padding:1px 2px">#${
        b.num || "—"
      }</div>
<div style="flex:1;min-width:0">
  <div style="font-family:'Barlow Condensed',sans-serif;font-weight:600;font-size:14px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
    ${
      b.name
    } <span style="font-size:9px;font-weight:700;color:${handColor};letter-spacing:1px;margin-left:2px">${
        b.hand || "R"
      }</span>
  </div>
  <div style="font-size:8px;font-weight:600;color:var(--text3);letter-spacing:1px;background:var(--surface3);padding:1px 4px;border-radius:2px;display:inline-block;margin-top:1px">${
    b.pos
  }</div>
</div>
<button onclick="event.stopPropagation();_mobEditingSlot={side:'${side}',idx:${i}};renderMobLineup()" style="background:none;border:1px solid var(--border);border-radius:4px;color:var(--text3);font-size:11px;padding:5px 9px;cursor:pointer;flex-shrink:0">✎</button>
      </div>`;
    }
  });

  wrap.innerHTML = html;
}

function saveMobLineupSlot(i) {
  const lineup = currentLineup();
  const n = document.getElementById(`mob-el-name-${i}`)?.value.trim();
  const num = document.getElementById(`mob-el-num-${i}`)?.value.trim();
  const pos = document
    .getElementById(`mob-el-pos-${i}`)
    ?.value.trim()
    .toUpperCase();
  const hand =
    document.getElementById(`mob-el-hand-${i}`)?.value || "R";
  if (n) lineup[i].name = n;
  if (pos) lineup[i].pos = pos;
  lineup[i].num = num || lineup[i].num;
  lineup[i].hand = hand;
  _mobEditingSlot = null;
  renderMobLineup();
  updateScoreBug();
}

function updateMobScore() {
  const an = awayName();
  const hn = homeName();
  const setEl = (id, v) => {
    const e = document.getElementById(id);
    if (e) e.textContent = v;
  };
  setEl("mob-away-lbl", an);
  setEl("mob-home-lbl", hn);
  setEl("mob-away-val", S.awayScore);
  setEl("mob-home-val", S.homeScore);
  setEl("mob-outs-val", S.outs);
  const inEl = document.getElementById("mob-inning-display");
  if (inEl)
    inEl.innerHTML =
      S.inning +
      `<small style="display:block;font-size:9px;font-weight:600;color:var(--text3);letter-spacing:2px;text-transform:uppercase">${
        S.isTop ? "TOP" : "BOT"
      }</small>`;
  const topBtn = document.getElementById("mob-half-top"),
    botBtn = document.getElementById("mob-half-bot");
  if (topBtn) topBtn.classList.toggle("active", S.isTop);
  if (botBtn) botBtn.classList.toggle("active", !S.isTop);
  const p = activePitcher();
  setEl("mob-pitcher-name", p ? `#${p.num} ${p.name}` : "—");
  setEl(
    "mob-pitcher-stats",
    p ? `${p.pitches}P · ${p.k}K · ${p.bb}BB` : ""
  );
  const b = currentBatter(),
    bs = getBatterStats(currentBatterKey());
  setEl("mob-batter-name", b ? `#${b.num || ""} ${b.name}` : "—");
  setEl(
    "mob-batter-stats",
    `${bs.hits}-${bs.ab} · ${bs.bb}BB · ${bs.pa || 0}PA`
  );
  // Sync mobile base diamonds
  ["1st", "2nd", "3rd"].forEach((b) => {
    const el = document.getElementById("mob-base-" + b);
    if (!el) return;
    const occ = !!S.bases[b];
    el.style.background = occ ? "#cc1a1a" : "transparent";
    el.style.borderColor = occ ? "#cc1a1a" : "#bfc4cf";
    el.style.boxShadow = occ ? "0 0 10px rgba(204,26,26,.4)" : "none";
  });
  const mhw = document.getElementById("mob-home-name-input"),
    hw = document.getElementById("home-name-input");
  if (maw && aw && maw !== document.activeElement) maw.value = aw.value;
  if (mhw && hw && mhw !== document.activeElement) mhw.value = hw.value;
}

// Mirror pitch log / game log updates to mobile log tab when visible
window.addEventListener("pitchtrack:render", () => {
  if (_currentMobTab === "log") renderMobLog(_mobLogTab);
});

function toast(msg) {
  const el = qs("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}
function updateTeamNames() {
  updateScoreBug();
  renderBoxScore();
}

