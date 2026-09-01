// ── MOBILE PREVIEW: detect if running inside the preview iframe ──
(function () {
  try {
    if (new URLSearchParams(location.search).get("preview") === "1") {
      document.documentElement.classList.add("mp-active");
    }
    // Show preview button only on localhost (VS Code Live Server) — hidden everywhere else
    var h = location.hostname;
    if (h === "localhost" || h === "127.0.0.1" || h === "") {
      var el = document.getElementById("mob-preview-wrap");
      if (el) el.style.setProperty("display", "block", "important");
    }
  } catch (e) {}
})();

// ── Supabase Auth + Cloud Storage ────────────────────────────────────────────
(function () {
  var _SUPA_URL = "https://xcchcalqoviemlpyjnuk.supabase.co";
  var _SUPA_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhjY2hjYWxxb3ZpZW1scHlqbnVrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4Mjk2MDcsImV4cCI6MjA5MjQwNTYwN30.-HS-pKi2SpXCvbei6Mzn41e46uxaLIQvn2gM6PH0kvQ";
  window._supabase = supabase.createClient(_SUPA_URL, _SUPA_KEY);
})();
window._ptTeamId = null;
window._ptAuthMode = "signin";

