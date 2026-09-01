// ─────────────────────────────────────────────────────────────────────

// ── Storage polyfill ──────────────────────────────────────────────────────────
// Uses Claude's native window.storage when inside Claude.ai,
// falls back to localStorage so the app works on any web host (GitHub Pages etc.)
if (!window.storage) {
  window.storage = {
    _ls: window.localStorage,
    set: async (key, value, _shared) => {
      try {
        window.storage._ls.setItem("pt_" + key, value);
        return { key, value };
      } catch (e) {
        console.error("storage.set failed", e);
        return null;
      }
    },
    get: async (key, _shared) => {
      const value = window.storage._ls.getItem("pt_" + key);
      if (value === null) throw new Error("Key not found: " + key);
      return { key, value };
    },
    delete: async (key, _shared) => {
      window.storage._ls.removeItem("pt_" + key);
      return { key, deleted: true };
    },
    list: async (prefix, _shared) => {
      const prefixed = "pt_" + prefix;
      const keys = [];
      for (let i = 0; i < window.storage._ls.length; i++) {
        const k = window.storage._ls.key(i);
        if (k && k.startsWith(prefixed)) {
          keys.push(k.slice(3)); // strip the 'pt_' wrapper, return original key
        }
      }
      return { keys };
    },
  };
  console.log(
    "[PitchTrack] Running with localStorage (no Claude storage detected)"
  );
}
// ─────────────────────────────────────────────────────────────────────────────
/* SHELL */
// ═══ SHELL STATE ═══
let currentPanel = null; // 'tracker' | 'hub'
let unsavedGame = false;
let pendingFn = null;

function showHome() {
  document.getElementById("home-screen").classList.remove("gone");
  document.getElementById("shell-nav").classList.remove("vis");
  document
    .querySelectorAll(".app-panel")
    .forEach((p) => p.classList.remove("on"));
  currentPanel = null;
  var mt = document.getElementById("mob-tabs");
  if (mt) mt.style.setProperty("display", "none", "important");
}

// ── Dark mode toggle ──────────────────────────────────────────────
function toggleDarkMode() {
  const isDark = document.body.classList.toggle("dark");
  _applyDarkModeUI(isDark);
}
function _applyDarkModeUI(isDark) {
  const label = isDark ? "Light Mode" : "Dark Mode";
  const navBtn = document.getElementById("sn-theme-btn");
  const hsBtn = document.getElementById("hs-theme-btn");
  if (navBtn) navBtn.textContent = label;
  if (hsBtn) hsBtn.textContent = label;
}

function openPanel(name, skipPrompt) {
  // Role-based access guard
  if (window._ptUserRole) {
    var _rmap = { support_staff: ["tracker"], player: ["myteam"] };
    var _restrict = _rmap[window._ptUserRole];
    if (_restrict && _restrict.indexOf(name) === -1) {
      toast("Your role doesn't have access to that section.");
      return;
    }
  }
  if (
    !skipPrompt &&
    currentPanel === "tracker" &&
    unsavedGame &&
    name === "hub"
  ) {
    pendingFn = () => openPanel(name, true);
    document.getElementById("save-modal").classList.add("on");
    return;
  }
  document.getElementById("home-screen").classList.add("gone");
  document.getElementById("shell-nav").classList.add("vis");
  document
    .querySelectorAll(".app-panel")
    .forEach((p) => p.classList.remove("on"));
  document.getElementById("panel-" + name).classList.add("on");
  document.querySelectorAll(".sn-tab").forEach((t) => t.classList.remove("on"));
  const tab = document.getElementById("sntab-" + name);
  if (tab) tab.classList.add("on");
  document.getElementById("sn-save-btn").style.display =
    name === "tracker" ? "inline-flex" : "none";
  document.getElementById("sn-resume-btn").style.display =
    name === "tracker" ? "inline-flex" : "none";
  currentPanel = name;
  var mt = document.getElementById("mob-tabs");
  if (mt)
    mt.style.setProperty(
      "display",
      name === "tracker" ? "flex" : "none",
      "important"
    );
  if (name === "tracker") {
    // Re-render pitch grid for current active pitcher (or default if none)
    try {
      const ap = activePitcher();
      renderPitchTypeGrid(_resolveActivePitcherTypes(ap));
    } catch (e) {}
  }
  if (name === "hub") {
    try {
      _hubTab = null; // re-evaluate default tab on every entry
      hubRefreshAll();
    } catch (e) {}
  }
  if (name === "myteam") {
    try {
      myTeamRender();
      myTeamLoad();
    } catch (e) {
      console.warn("myteam", e);
    }
  }
  if (name === "opponents") {
    try {
      // Always return to list view when navigating to opponents
      _oppOpenId = null;
      const lv = document.getElementById("opp-list-view");
      const dv = document.getElementById("opp-detail");
      if (lv) lv.style.display = "flex";
      if (dv) dv.classList.remove("open");
      oppLoad();
    } catch (e) {
      console.warn("opponents", e);
    }
  }
  if (name === "scout-overview") {
    try {
      scoutOverviewLoad();
    } catch (e) {
      console.warn("scout-overview", e);
    }
  }
}

// Nav logo → home (with save prompt if in tracker)
function navHome() {
  if (currentPanel === "tracker" && unsavedGame) {
    pendingFn = () => showHome();
    document.getElementById("save-modal").classList.add("on");
  } else {
    showHome();
  }
}

// ═══ SAVE PROMPT ACTIONS ═══
async function smSave() {
  document.getElementById("save-modal").classList.remove("on");
  try {
    await saveGame();
  } catch (e) {}
  unsavedGame = false;
  updateDot();
  if (pendingFn) {
    const f = pendingFn;
    pendingFn = null;
    f();
  }
}
function smSkip() {
  document.getElementById("save-modal").classList.remove("on");
  unsavedGame = false;
  updateDot();
  if (pendingFn) {
    const f = pendingFn;
    pendingFn = null;
    f();
  }
}
function smCancel() {
  document.getElementById("save-modal").classList.remove("on");
  pendingFn = null;
}

// ═══ SAVE BUTTON IN NAV ═══
async function navSave() {
  const btn = document.getElementById("sn-save-btn");
  try {
    await saveGame();
    unsavedGame = false;
    updateDot();
    btn.textContent = "✓ Saved";
    btn.classList.add("ok");
    setTimeout(() => {
      btn.textContent = "Save";
      btn.classList.remove("ok");
    }, 2800);
  } catch (e) {
    alert("Save failed");
  }
}

// ═══ UNSAVED INDICATOR ═══
function markUnsaved() {
  unsavedGame = true;
  updateDot();
}
function updateDot() {
  document.getElementById("unsaved-dot").classList.toggle("show", unsavedGame);
}

// ═══ BOOT ═══
(function bootShell() {
  // nothing auto — wait for user to click home card
})();

/* TRACKER */
