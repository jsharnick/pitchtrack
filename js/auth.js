function _ptEsc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function _ptMountStorage(teamId) {
  window._ptTeamId = teamId;
  window.storage = {
    set: async function (key, value) {
      var { error } = await window._supabase.from("app_data").upsert(
        {
          team_id: teamId,
          key: key,
          value: value,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "team_id,key" }
      );
      if (error) throw error;
      try {
        localStorage.setItem("pt_" + key, value);
      } catch (e) {}
      return { key: key, value: value };
    },
    get: async function (key) {
      var { data } = await window._supabase
        .from("app_data")
        .select("value")
        .eq("team_id", teamId)
        .eq("key", key)
        .maybeSingle();
      if (!data) throw new Error("Key not found: " + key);
      return { key: key, value: data.value };
    },
    delete: async function (key) {
      await window._supabase
        .from("app_data")
        .delete()
        .eq("team_id", teamId)
        .eq("key", key);
      try {
        localStorage.removeItem("pt_" + key);
      } catch (e) {}
      return { key: key, deleted: true };
    },
    list: async function (prefix) {
      var { data } = await window._supabase
        .from("app_data")
        .select("key")
        .eq("team_id", teamId)
        .like("key", prefix + "%");
      return {
        keys: (data || []).map(function (r) {
          return r.key;
        }),
      };
    },
  };
}

function _ptShowOverlay() {
  var o = document.getElementById("pt-auth-overlay");
  if (o) o.style.display = "flex";
}
function _ptHideOverlay() {
  var o = document.getElementById("pt-auth-overlay");
  if (o) o.style.display = "none";
}

function _ptAuthToggle() {
  var showSignup =
    document.getElementById("pt-signup-form").style.display === "none";
  document.getElementById("pt-auth-form").style.display = showSignup
    ? "none"
    : "block";
  document.getElementById("pt-signup-form").style.display = showSignup
    ? "block"
    : "none";
  document.getElementById("pt-auth-subtitle").textContent = showSignup
    ? "CREATE YOUR ACCOUNT"
    : "SIGN IN TO CONTINUE";
  var authErr = document.getElementById("pt-auth-error");
  var signupErr = document.getElementById("pt-signup-error");
  if (authErr) authErr.style.display = "none";
  if (signupErr) signupErr.style.display = "none";
}

async function _ptAuthSubmit() {
  var email = document.getElementById("pt-auth-email").value.trim();
  var password = document.getElementById("pt-auth-password").value;
  var errEl = document.getElementById("pt-auth-error");
  var btn = document.getElementById("pt-auth-submit");
  errEl.style.display = "none";
  btn.textContent = "…";
  btn.disabled = true;
  try {
    var result = await window._supabase.auth.signInWithPassword({
      email: email,
      password: password,
    });
    if (result.error) throw result.error;
    await _ptOnSignedIn(result.data.user);
  } catch (e) {
    errEl.style.color = "#f87171";
    errEl.textContent = e.message || "Authentication failed";
    errEl.style.display = "block";
  }
  btn.textContent = "Sign In";
  btn.disabled = false;
}

async function _ptSignupSubmit() {
  var username = document
    .getElementById("pt-signup-username")
    .value.trim();
  var email = document.getElementById("pt-signup-email").value.trim();
  var phone = document.getElementById("pt-signup-phone").value.trim();
  var password = document.getElementById("pt-signup-password").value;
  var accountType = document.getElementById("pt-signup-type").value;
  var errEl = document.getElementById("pt-signup-error");
  var btn = document.getElementById("pt-signup-submit");
  errEl.style.display = "none";
  if (!username || !email || !password) {
    errEl.style.color = "#f87171";
    errEl.textContent = "Username, email, and password are required.";
    errEl.style.display = "block";
    return;
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    errEl.style.color = "#f87171";
    errEl.textContent =
      "Username may only contain letters, numbers, and underscores.";
    errEl.style.display = "block";
    return;
  }
  if (password.length < 6) {
    errEl.style.color = "#f87171";
    errEl.textContent = "Password must be at least 6 characters.";
    errEl.style.display = "block";
    return;
  }
  btn.textContent = "…";
  btn.disabled = true;
  try {
    var result = await window._supabase.auth.signUp({
      email: email,
      password: password,
    });
    if (result.error) throw result.error;
    if (!result.data.session) {
      // Store pending profile so it survives the email confirmation redirect
      try {
        localStorage.setItem(
          "pt_pending_profile",
          JSON.stringify({
            username: username,
            phone: phone || null,
            account_type: accountType,
          })
        );
      } catch (e) {}
      errEl.style.color = "#86efac";
      errEl.textContent =
        "Check your email to confirm your account, then sign in.";
      errEl.style.display = "block";
      btn.textContent = "Create Account";
      btn.disabled = false;
      return;
    }
    var userId = result.data.user.id;
    await window._supabase.from("profiles").upsert(
      {
        id: userId,
        username: username,
        phone: phone || null,
        account_type: accountType,
      },
      { onConflict: "id" }
    );
    window._ptAccountType = accountType;
    window._ptUsername = username;
    await _ptOnSignedIn(result.data.user);
  } catch (e) {
    errEl.style.color = "#f87171";
    errEl.textContent = e.message || "Signup failed";
    errEl.style.display = "block";
  }
  btn.textContent = "Create Account";
  btn.disabled = false;
}

async function _ptOnSignedIn(user) {
  // Load profile to get account_type and username
  try {
    var { data: profile } = await window._supabase
      .from("profiles")
      .select("username, account_type")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile) {
      // Check for pending profile saved before email confirmation redirect
      try {
        var pending = JSON.parse(
          localStorage.getItem("pt_pending_profile") || "null"
        );
        if (pending) {
          await window._supabase.from("profiles").upsert(
            {
              id: user.id,
              username: pending.username,
              phone: pending.phone,
              account_type: pending.account_type,
            },
            { onConflict: "id" }
          );
          profile = pending;
          localStorage.removeItem("pt_pending_profile");
        }
      } catch (e) {}
    }
    window._ptAccountType = profile?.account_type || "coach";
    window._ptUsername = profile?.username || user.email.split("@")[0];
  } catch (e) {
    window._ptAccountType = "coach";
    window._ptUsername = user.email.split("@")[0];
  }
  // Hide sign-in/sign-up, show org picker
  document.getElementById("pt-auth-form").style.display = "none";
  document.getElementById("pt-signup-form").style.display = "none";
  document.getElementById("pt-org-picker").style.display = "block";
  document.getElementById("pt-auth-footer").style.display = "block";
  document.getElementById("pt-auth-user-label").textContent =
    window._ptUsername || user.email;
  document.getElementById("pt-auth-subtitle").textContent =
    "SELECT YOUR ORGANIZATION";
  // Show create org section only for head coaches
  var createSection = document.getElementById("pt-create-org-section");
  if (createSection)
    createSection.style.display =
      window._ptAccountType === "org_host" ||
      window._ptAccountType === "head_coach"
        ? "block"
        : "none";
  await _ptLoadOrgs();
}

async function _ptLoadOrgs() {
  var { data: memberships } = await window._supabase
    .from("team_members")
    .select("team_id, role, teams(id, name, pin)");
  var listEl = document.getElementById("pt-org-list");
  if (!listEl) return;
  if (!memberships || memberships.length === 0) {
    listEl.innerHTML =
      '<div style="font-size:13px;color:#5c6280;margin-bottom:8px">No organizations yet.</div>';
    return;
  }
  if (memberships.length === 1) {
    await _ptSelectTeam(
      memberships[0].teams.id,
      memberships[0].teams.name,
      memberships[0].role
    );
    return;
  }
  listEl.innerHTML = memberships
    .map(function (m) {
      return (
        "<div onclick=\"_ptSelectTeam('" +
        m.teams.id +
        "','" +
        _ptEsc(m.teams.name) +
        "','" +
        _ptEsc(m.role) +
        "')\" style=\"padding:11px 14px;background:#0f1117;border:1px solid #2e3248;border-radius:7px;cursor:pointer;margin-bottom:8px;font-family:'Barlow Condensed',sans-serif;font-size:16px;font-weight:700;color:#e8eaf0;display:flex;align-items:center;justify-content:space-between\">" +
        "<span>" +
        _ptEsc(m.teams.name) +
        "</span>" +
        "<span style=\"font-family:'Barlow',sans-serif;font-size:11px;color:#cc1a1a;font-weight:400;letter-spacing:1px;text-transform:uppercase\">" +
        _ptEsc(m.role) +
        "</span></div>"
      );
    })
    .join("");
}

async function _ptJoinOrg() {
  var pin = document.getElementById("pt-join-pin").value.trim();
  var errEl = document.getElementById("pt-join-error");
  errEl.style.display = "none";
  if (pin.length !== 6 || !/^\d{6}$/.test(pin)) {
    errEl.textContent = "PIN must be 6 digits.";
    errEl.style.display = "block";
    return;
  }
  var { data: org } = await window._supabase
    .from("teams")
    .select("id, name")
    .eq("pin", pin)
    .eq("pin_enabled", true)
    .maybeSingle();
  if (!org) {
    errEl.textContent = "Organization not found. Check your PIN.";
    errEl.style.display = "block";
    return;
  }
  var role = window._ptAccountType || "player";
  var { data: userData } = await window._supabase.auth.getUser();
  var { error } = await window._supabase
    .from("team_members")
    .insert({ team_id: org.id, user_id: userData.user.id, role: role });
  if (error && error.code !== "23505") {
    errEl.textContent = error.message;
    errEl.style.display = "block";
    return;
  }
  await _ptSelectTeam(org.id, org.name, role);
}

async function _ptCreateOrg() {
  var name = document.getElementById("pt-new-org-name").value.trim();
  var pin = document.getElementById("pt-new-org-pin").value.trim();
  var errEl = document.getElementById("pt-create-org-error");
  if (!name) {
    errEl.textContent = "Enter an organization name.";
    errEl.style.display = "block";
    return;
  }
  if (!/^\d{6}$/.test(pin)) {
    errEl.textContent = "PIN must be exactly 6 digits.";
    errEl.style.display = "block";
    return;
  }
  errEl.style.display = "none";
  var { data: userData } = await window._supabase.auth.getUser();
  var user = userData.user;
  var { data: team, error } = await window._supabase
    .from("teams")
    .insert({
      name: name,
      created_by: user.id,
      pin: pin,
      pin_enabled: true,
    })
    .select()
    .single();
  if (error) {
    errEl.textContent = error.message;
    errEl.style.display = "block";
    return;
  }
  await window._supabase.from("team_members").insert({
    team_id: team.id,
    user_id: user.id,
    role: window._ptAccountType || "org_host",
  });
  window._ptPendingTeamId = team.id;
  window._ptPendingTeamName = team.name;
  var pinDisplay = document.getElementById("pt-pin-display");
  if (pinDisplay) pinDisplay.textContent = pin;
  var pinReveal = document.getElementById("pt-pin-reveal");
  if (pinReveal) pinReveal.style.display = "block";
  var orgPicker = document.getElementById("pt-org-picker");
  if (orgPicker) orgPicker.style.display = "none";
}

async function _ptEnterPendingOrg() {
  if (window._ptPendingTeamId) {
    await _ptSelectTeam(
      window._ptPendingTeamId,
      window._ptPendingTeamName,
      window._ptAccountType || "org_host"
    );
  }
}

async function _ptSelectTeam(teamId, teamName, role) {
  window._ptUserRole = role || "player";
  _ptMountStorage(teamId);
  // Explorer: override storage writes to be silent no-ops so nothing persists
  if (window._ptUserRole === "explorer") {
    window.storage.set = async function () {
      return null;
    };
    window.storage.delete = async function () {
      return null;
    };
  }
  window._ptWorkspaceName = teamName || "";
  try {
    localStorage.setItem("pt_last_team_id", teamId);
  } catch (e) {}
  _ptHideOverlay();
  try {
    var {
      data: { user },
    } = await window._supabase.auth.getUser();
    _ptShowAccountBtn(
      window._ptUsername || (user ? user.email : ""),
      teamName
    );
  } catch (e) {}
  _ptApplyRoleUI();
}

function _ptApplyRoleUI() {
  var role = window._ptUserRole || "player";
  var panels = [
    "tracker",
    "hub",
    "myteam",
    "opponents",
    "scout-overview",
  ];
  var access = {
    org_host: [
      "tracker",
      "hub",
      "myteam",
      "opponents",
      "scout-overview",
    ],
    head_coach: [
      "tracker",
      "hub",
      "myteam",
      "opponents",
      "scout-overview",
    ],
    assistant_coach: [
      "tracker",
      "hub",
      "myteam",
      "opponents",
      "scout-overview",
    ],
    explorer: [
      "tracker",
      "hub",
      "myteam",
      "opponents",
      "scout-overview",
    ],
    support_staff: ["tracker"],
    player: ["myteam"],
  };
  var allowed = access[role] || ["myteam"];
  // Always show all nav tabs — access is enforced inside openPanel().
  // Hiding tabs makes the nav bar look broken for restricted roles.
  panels.forEach(function (p) {
    var tab = document.getElementById("sntab-" + p);
    if (tab) tab.style.display = "";
  });
  // Explorer: hide save button since nothing writes
  var saveBtn = document.getElementById("sn-save-btn");
  if (saveBtn)
    saveBtn.style.setProperty(
      "display",
      role === "explorer" ? "none" : "",
      "important"
    );
  try {
    var _initPanel = (window._ptInitialPanel && allowed.indexOf(window._ptInitialPanel) !== -1)
      ? window._ptInitialPanel
      : allowed[0];
    window._ptInitialPanel = null;
    openPanel(_initPanel, true);
  } catch (e) {}
}

async function _ptSignOut() {
  try {
    localStorage.removeItem("pt_last_team_id");
  } catch (e) {}
  await window._supabase.auth.signOut();
  window.location.reload();
}

async function _ptForgotPassword() {
  var email = document.getElementById("pt-auth-email").value.trim();
  var errEl = document.getElementById("pt-auth-error");
  if (!email) {
    errEl.style.color = "#f87171";
    errEl.textContent = "Enter your email address above first.";
    errEl.style.display = "block";
    return;
  }
  errEl.style.color = "#86efac";
  errEl.textContent = "Sending reset link…";
  errEl.style.display = "block";
  var { error } = await window._supabase.auth.resetPasswordForEmail(
    email,
    {
      redirectTo: window.location.origin + window.location.pathname,
    }
  );
  if (error) {
    errEl.style.color = "#f87171";
    errEl.textContent = error.message;
  } else {
    errEl.textContent = "Reset link sent — check your email.";
  }
}

async function _ptOpenAccountModal() {
  var modal = document.getElementById("pt-account-modal");
  document.getElementById("pt-acct-pw1").value = "";
  document.getElementById("pt-acct-pw2").value = "";
  document.getElementById("pt-acct-msg").style.display = "none";
  document.getElementById("pt-acct-profile-msg").style.display = "none";
  modal.style.display = "flex";

  // Populate profile fields from live DB
  try {
    var {
      data: { user },
    } = await window._supabase.auth.getUser();
    if (user) {
      var { data: profile } = await window._supabase
        .from("profiles")
        .select("username, phone, account_type")
        .eq("id", user.id)
        .maybeSingle();
      var un = profile?.username || window._ptUsername || "";
      var ph = profile?.phone || "";
      var at = profile?.account_type || window._ptAccountType || "—";
      document.getElementById("pt-acct-username").value = un;
      document.getElementById("pt-acct-phone").value = ph;
      // Account type badge
      var badge = document.getElementById("pt-acct-type-badge");
      if (badge) badge.textContent = at.replace(/_/g, " ");
    }
  } catch (e) {}

  // Role in current org
  var roleRow = document.getElementById("pt-acct-role-row");
  var roleLabel = document.getElementById("pt-acct-role-label");
  if (window._ptUserRole && window._ptTeamId) {
    if (roleRow) roleRow.style.display = "block";
    if (roleLabel)
      roleLabel.textContent = window._ptUserRole.replace(/_/g, " ");
  } else {
    if (roleRow) roleRow.style.display = "none";
  }

  var canManage =
    window._ptUserRole === "org_host" ||
    window._ptUserRole === "head_coach";
  // Show org PIN to managing roles
  var orgPinEl = document.getElementById("pt-account-org-pin");
  if (orgPinEl) {
    orgPinEl.style.display = "none";
    if (canManage && window._ptTeamId) {
      try {
        var { data: org } = await window._supabase
          .from("teams")
          .select("pin")
          .eq("id", window._ptTeamId)
          .single();
        if (org && org.pin) {
          orgPinEl.textContent = "PIN: " + org.pin;
          orgPinEl.style.display = "inline";
        }
      } catch (e) {}
    }
  }
  // Show member management for org_host and head_coach
  var membersSection = document.getElementById(
    "pt-account-members-section"
  );
  if (membersSection)
    membersSection.style.display = canManage ? "block" : "none";
  if (canManage && window._ptTeamId) {
    try {
      var { data: members } = await window._supabase
        .from("team_members")
        .select("user_id, role, profiles(username)")
        .eq("team_id", window._ptTeamId);
      var listEl = document.getElementById("pt-account-members-list");
      var roleOptions = [
        "org_host",
        "head_coach",
        "assistant_coach",
        "support_staff",
        "player",
        "explorer",
      ];
      listEl.innerHTML =
        (members || [])
          .map(function (m) {
            var uid = m.user_id;
            var uname =
              m.profiles && m.profiles.username
                ? m.profiles.username
                : uid.slice(0, 8);
            var opts = roleOptions
              .map(function (r) {
                return (
                  '<option value="' +
                  r +
                  '"' +
                  (m.role === r ? " selected" : "") +
                  ">" +
                  r.replace(/_/g, " ") +
                  "</option>"
                );
              })
              .join("");
            return (
              '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">' +
              "<span style=\"flex:1;font-family:'Barlow Condensed',sans-serif;font-size:14px;color:#e8eaf0\">" +
              _ptEsc(uname) +
              "</span>" +
              "<select onchange=\"_ptUpdateMemberRole('" +
              uid +
              "',this.value)\" style=\"background:#0f1117;border:1px solid #2e3248;border-radius:5px;color:#e8eaf0;padding:4px 6px;font-size:12px;font-family:'Barlow',sans-serif\">" +
              opts +
              "</select>" +
              "<button onclick=\"_ptRemoveMember('" +
              uid +
              '\')" style="background:none;border:none;color:#cc1a1a;cursor:pointer;font-size:15px;padding:0 4px;line-height:1">✕</button>' +
              "</div>"
            );
          })
          .join("") ||
        "<div style=\"font-size:12px;color:#5c6280;font-family:'Barlow',sans-serif\">No members yet.</div>";
    } catch (e) {}
  }
}

async function _ptSaveProfile() {
  var msgEl = document.getElementById("pt-acct-profile-msg");
  var username = document
    .getElementById("pt-acct-username")
    .value.trim();
  var phone = document.getElementById("pt-acct-phone").value.trim();
  if (!username) {
    msgEl.style.color = "#f87171";
    msgEl.textContent = "Username is required.";
    msgEl.style.display = "block";
    return;
  }
  try {
    var {
      data: { user },
    } = await window._supabase.auth.getUser();
    var { error } = await window._supabase.from("profiles").upsert(
      {
        id: user.id,
        username: username,
        phone: phone || null,
        account_type: window._ptAccountType || "coach",
      },
      { onConflict: "id" }
    );
    if (error) throw error;
    // Update in-memory state and nav button label
    window._ptUsername = username;
    var label = document.getElementById("sn-account-label");
    if (label) label.textContent = username;
    var emailEl = document.getElementById("pt-account-email");
    if (emailEl) emailEl.textContent = username;
    msgEl.style.color = "#86efac";
    msgEl.textContent = "Profile saved.";
  } catch (e) {
    msgEl.style.color = "#f87171";
    msgEl.textContent = e.message || "Save failed.";
  }
  msgEl.style.display = "block";
  setTimeout(function () {
    msgEl.style.display = "none";
  }, 3000);
}

async function _ptChangePassword() {
  var pw1 = document.getElementById("pt-acct-pw1").value;
  var pw2 = document.getElementById("pt-acct-pw2").value;
  var msgEl = document.getElementById("pt-acct-msg");
  msgEl.style.display = "none";
  if (!pw1 || pw1.length < 6) {
    msgEl.style.color = "#f87171";
    msgEl.textContent = "Password must be at least 6 characters.";
    msgEl.style.display = "block";
    return;
  }
  if (pw1 !== pw2) {
    msgEl.style.color = "#f87171";
    msgEl.textContent = "Passwords don't match.";
    msgEl.style.display = "block";
    return;
  }
  var { error } = await window._supabase.auth.updateUser({
    password: pw1,
  });
  if (error) {
    msgEl.style.color = "#f87171";
    msgEl.textContent = error.message;
  } else {
    msgEl.style.color = "#86efac";
    msgEl.textContent = "Password updated successfully.";
    document.getElementById("pt-acct-pw1").value = "";
    document.getElementById("pt-acct-pw2").value = "";
  }
  msgEl.style.display = "block";
}

async function _ptUpdateMemberRole(userId, newRole) {
  if (!window._ptTeamId) return;
  await window._supabase
    .from("team_members")
    .update({ role: newRole })
    .eq("team_id", window._ptTeamId)
    .eq("user_id", userId);
}

async function _ptRemoveMember(userId) {
  if (!window._ptTeamId) return;
  if (!confirm("Remove this member from the organization?")) return;
  await window._supabase
    .from("team_members")
    .delete()
    .eq("team_id", window._ptTeamId)
    .eq("user_id", userId);
  _ptOpenAccountModal();
}

function _ptShowAccountBtn(displayName, workspaceName) {
  var btn = document.getElementById("sn-account-btn");
  if (!btn) return;
  var label = document.getElementById("sn-account-label");
  if (label) label.textContent = displayName || "Account";
  btn.style.display = "inline-flex";
  btn.style.alignItems = "center";
  btn.style.gap = "5px";
  // Populate modal fields
  var emailEl = document.getElementById("pt-account-email");
  if (emailEl) emailEl.textContent = displayName || "";
  var wsEl = document.getElementById("pt-account-workspace");
  if (wsEl) wsEl.textContent = workspaceName || "—";
}

async function _ptMigrateLocalData() {
  if (!window._ptTeamId) {
    alert("Not connected to a workspace");
    return;
  }
  var count = 0;
  var keys = [];
  for (var i = 0; i < localStorage.length; i++) {
    var k = localStorage.key(i);
    if (k && k.startsWith("pt_")) keys.push(k);
  }
  if (keys.length === 0) {
    alert("No local data found to migrate.");
    return;
  }
  if (
    !confirm(
      "Upload " + keys.length + " local records to the cloud workspace?"
    )
  )
    return;
  for (var j = 0; j < keys.length; j++) {
    var k2 = keys[j];
    var key = k2.slice(3);
    var value = localStorage.getItem(k2);
    try {
      await window.storage.set(key, value);
      count++;
    } catch (e) {}
  }
  alert("Done! Migrated " + count + " of " + keys.length + " records.");
}

// On page load: skip auth entirely on localhost (dev mode), otherwise check session
(async function _ptInit() {
  var host = window.location.hostname;
  var isLocal =
    host === "localhost" || host === "127.0.0.1" || host === "";
  if (isLocal) {
    // Dev mode: use localStorage directly, no auth required
    console.log("[PitchTrack] localhost detected — skipping auth");
    _ptHideOverlay();
    return;
  }
  _ptShowOverlay();
  try {
    // Handle password reset redirect (Supabase puts #access_token in URL)
    var hash = window.location.hash;
    if (hash && hash.includes("type=recovery")) {
      // Session is set automatically by Supabase from the hash
      var {
        data: { session: recoverSession },
      } = await window._supabase.auth.getSession();
      if (recoverSession) {
        // Clear the hash so it doesn't persist on reload
        window.history.replaceState(null, "", window.location.pathname);
        // Show account modal for them to set a new password immediately
        _ptHideOverlay();
        await _ptSelectTeam(null, null); // mount storage-less shell so modal works
        // Show account modal open to password section
        var lastTeamId2 = null;
        try {
          lastTeamId2 = localStorage.getItem("pt_last_team_id");
        } catch (e) {}
        if (lastTeamId2) {
          var { data: recMem } = await window._supabase
            .from("team_members")
            .select("role, teams(name)")
            .eq("team_id", lastTeamId2)
            .eq("user_id", recoverSession.user.id)
            .maybeSingle();
          await _ptSelectTeam(
            lastTeamId2,
            recMem?.teams?.name || "",
            recMem?.role || "player"
          );
        }
        _ptShowAccountBtn(recoverSession.user.email, "");
        _ptOpenAccountModal();
        var msgEl = document.getElementById("pt-acct-msg");
        if (msgEl) {
          msgEl.style.color = "#86efac";
          msgEl.textContent = "Enter your new password below.";
          msgEl.style.display = "block";
        }
        return;
      }
    }

    var {
      data: { session },
    } = await window._supabase.auth.getSession();
    if (session) {
      // Load profile first so username/accountType are available
      try {
        var { data: prof } = await window._supabase
          .from("profiles")
          .select("username, account_type")
          .eq("id", session.user.id)
          .maybeSingle();
        window._ptAccountType = prof?.account_type || "coach";
        window._ptUsername =
          prof?.username || session.user.email.split("@")[0];
      } catch (e) {}
      // Returning user: try to auto-connect to their last org
      var lastTeamId = null;
      try {
        lastTeamId = localStorage.getItem("pt_last_team_id");
      } catch (e) {}
      if (lastTeamId) {
        // Verify access and fetch role
        var { data: mem } = await window._supabase
          .from("team_members")
          .select("team_id, role, teams(name)")
          .eq("team_id", lastTeamId)
          .eq("user_id", session.user.id)
          .maybeSingle();
        if (mem) {
          await _ptSelectTeam(
            lastTeamId,
            mem.teams?.name || "",
            mem.role || "viewer"
          );
          return;
        }
      }
      // No saved org or access lost — show org picker
      await _ptOnSignedIn(session.user);
    }
  } catch (e) {
    console.warn("Supabase init error", e);
  }
})();
