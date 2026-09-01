// ── URL Router ────────────────────────────────────────────────────────────
// Adds history.pushState routing so each tab and detail view has a real URL.
// Works with GitHub Pages via the 404.html SPA redirect trick.
//
// Panel-level paths:   /tracker  /stats_hub  /my_team  /opponents  /scouting_cards
// Deep paths:
//   /stats_hub/team/TeamName
//   /stats_hub/player/TeamName/PlayerName[/tab]
//   /stats_hub/pitcher/TeamName/PitcherName[/tab]
//   /stats_hub/game/GameId
//
// Tabs for players:   spray | zone | breakdown | stats | splits | baserunning | defense | scouting | gamelog
// Tabs for pitchers:  zone | mix | stats | splits | gamelog | scouting

(function () {

  // ── Panel ↔ path maps ──────────────────────────────────────────────────
  var _panelToPath = {
    tracker: "/tracker",
    hub: "/stats_hub",
    myteam: "/my_team",
    opponents: "/opponents",
    "scout-overview": "/scouting_cards",
  };

  var _pathToPanel = {
    "/tracker": "tracker",
    "/stats_hub": "hub",
    "/my_team": "myteam",
    "/opponents": "opponents",
    "/scouting_cards": "scout-overview",
  };

  // ── Suppress URL pushes during back/forward navigation ────────────────
  var _suppress = false;

  // ── Path builders ──────────────────────────────────────────────────────
  function _enc(s) { return encodeURIComponent(s || ""); }

  function _buildDeepPath(type, data, tab) {
    var base;
    if (type === "player" && data && data.team && data.name) {
      base = "/stats_hub/player/" + _enc(data.team) + "/" + _enc(data.name);
      return tab ? base + "/" + tab : base;
    }
    if (type === "pitcher" && data && data.team && data.name) {
      base = "/stats_hub/pitcher/" + _enc(data.team) + "/" + _enc(data.name);
      return tab ? base + "/" + tab : base;
    }
    if (type === "team" && data) {
      return "/stats_hub/team/" + _enc(typeof data === "string" ? data : data.name || "");
    }
    if (type === "game" && data) {
      return "/stats_hub/game/" + _enc(typeof data === "string" ? data : data.id || String(data));
    }
    if (type === "games" || type === "compare") {
      return "/stats_hub";
    }
    return null;
  }

  // ── Deep path parser ───────────────────────────────────────────────────
  function _parseDeepPath(path) {
    var m;
    m = path.match(/^\/stats_hub\/player\/([^\/]+)\/([^\/]+)(?:\/([^\/]+))?$/);
    if (m) return {
      type: "player",
      data: { team: decodeURIComponent(m[1]), name: decodeURIComponent(m[2]) },
      tab: m[3] || null,
    };
    m = path.match(/^\/stats_hub\/pitcher\/([^\/]+)\/([^\/]+)(?:\/([^\/]+))?$/);
    if (m) return {
      type: "pitcher",
      data: { team: decodeURIComponent(m[1]), name: decodeURIComponent(m[2]) },
      tab: m[3] || null,
    };
    m = path.match(/^\/stats_hub\/team\/([^\/]+)$/);
    if (m) return { type: "team", data: decodeURIComponent(m[1]), tab: null };
    m = path.match(/^\/stats_hub\/game\/([^\/]+)$/);
    if (m) return { type: "game", data: decodeURIComponent(m[1]), tab: null };
    return null;
  }

  function _ptPanelForPath(path) {
    if (_pathToPanel[path]) return _pathToPanel[path];
    for (var prefix in _pathToPanel) {
      if (path === prefix || path.startsWith(prefix + "/")) {
        return _pathToPanel[prefix];
      }
    }
    return null;
  }

  // ── Public: push a deep route URL ─────────────────────────────────────
  // Called from showView, playerTab, pitcherTab in hub.js / data.js
  window._ptPushDeepRoute = function (type, data, tab) {
    if (_suppress) return;
    var path = _buildDeepPath(type, data, tab);
    if (path && window.location.pathname !== path) {
      history.pushState({ _ptType: type, _ptData: data, _ptTab: tab }, "", path);
    } else if (path && tab && window.location.pathname === _buildDeepPath(type, data, null)) {
      // Switching tabs updates path in place
      history.replaceState({ _ptType: type, _ptData: data, _ptTab: tab }, "", path);
    }
  };

  // ── Initial route setup ────────────────────────────────────────────────
  function _ptRouteInit() {
    var params = new URLSearchParams(window.location.search);
    var redirectPath = params.get("p");
    if (redirectPath) {
      history.replaceState(null, "", redirectPath);
    }
    var path = window.location.pathname;
    var panel = _ptPanelForPath(path);
    if (panel && panel !== "tracker") {
      window._ptInitialPanel = panel;
    }
    // Parse deep route — stored for hubRefreshAll to consume
    var deep = _parseDeepPath(path);
    if (deep) {
      window._ptDeepRoute = deep;
    }
  }

  // ── Wrap openPanel to push panel-level URL ─────────────────────────────
  var _origOpenPanel = window.openPanel;
  window.openPanel = function (name, skipPrompt) {
    _origOpenPanel(name, skipPrompt);
    if (!_suppress) {
      var path = _panelToPath[name];
      if (path && window.location.pathname !== path) {
        history.pushState({ panel: name }, "", path);
      }
    }
  };

  // ── Back / forward ─────────────────────────────────────────────────────
  window.addEventListener("popstate", function (e) {
    _suppress = true;
    try {
      var state = e.state || {};
      var path = window.location.pathname;

      if (state._ptType) {
        // Deep view state stored by _ptPushDeepRoute
        _origOpenPanel("hub", true);
        if (typeof showView === "function") {
          showView(state._ptType, state._ptData);
          if (state._ptTab) {
            var fn = state._ptType === "pitcher"
              ? (typeof pitcherTab === "function" ? pitcherTab : null)
              : (typeof playerTab === "function" ? playerTab : null);
            if (fn) setTimeout(function () { fn(state._ptTab); }, 100);
          }
        }
      } else {
        // Panel-level or deep path with no stored state
        var panel = (state && state.panel) || _ptPanelForPath(path);
        var deep = _parseDeepPath(path);
        if (deep) {
          _origOpenPanel("hub", true);
          if (typeof showView === "function") {
            showView(deep.type, deep.data);
            if (deep.tab) {
              var tabFn = deep.type === "pitcher"
                ? (typeof pitcherTab === "function" ? pitcherTab : null)
                : (typeof playerTab === "function" ? playerTab : null);
              if (tabFn) setTimeout(function () { tabFn(deep.tab); }, 100);
            }
          }
        } else if (panel) {
          _origOpenPanel(panel, true);
        }
      }
    } finally {
      _suppress = false;
    }
  });

  _ptRouteInit();
})();
