const state = {
  authConfig: null,
  currentUser: null,
  currentTerm: null,
  notificationSettings: null,
  teacherStudents: [],
  staffUsers: [],
  students: [],
  infractionTypes: [],
  templates: [],
  openActions: [],
  rolloverStudents: [],
  rolloverPreview: null,
  incidentStudentHistory: null,
  incidentHistoryRequest: 0,
  selectedStudentId: null,
  selectedFollowupStudentId: null,
  selectedStatusKey: null
};

const statusOrder = ["admin_review", "device_restriction", "success_contract", "reflection", "monitor", "warnings"];
const statusLabels = {
  no_violations: "No violations",
  monitor: "Monitor",
  warnings: "Warnings documented",
  reflection: "Digital Impact Reflection",
  success_contract: "Technology Success Contract",
  device_restriction: "5 school-day restriction",
  admin_review: "Admin review"
};

const statusLevels = {
  no_violations: 0,
  monitor: 1,
  reflection: 2,
  success_contract: 3,
  device_restriction: 4,
  admin_review: 5
};

const els = {
  loginScreen: document.querySelector("#login-screen"),
  appShell: document.querySelector("#app-shell"),
  googleSignin: document.querySelector("#google-signin"),
  loginMessage: document.querySelector("#login-message"),
  signedInName: document.querySelector("#signed-in-name"),
  signedInEmail: document.querySelector("#signed-in-email"),
  signedInRole: document.querySelector("#signed-in-role"),
  workspaceSwitcher: document.querySelector("#workspace-switcher"),
  workspaceMenu: document.querySelector("#workspace-menu"),
  workspaceIndicator: document.querySelector("#workspace-switch-indicator"),
  workspaceBrandMark: document.querySelector("#workspace-brand-mark"),
  workspaceBrandTitle: document.querySelector("#workspace-brand-title"),
  workspaceBrandSubtitle: document.querySelector("#workspace-brand-subtitle"),
  workspaceOptions: document.querySelectorAll("[data-workspace-view]"),
  logoutButton: document.querySelector("#logout-button"),
  navButtons: document.querySelectorAll(".nav-button"),
  teacherNav: document.querySelector("[data-teacher-nav]"),
  techNavButtons: document.querySelectorAll("[data-tech-nav]"),
  adminNavButtons: document.querySelectorAll("[data-admin-nav]"),
  views: document.querySelectorAll(".view"),
  teacherStudentSearch: document.querySelector("#teacher-student-search"),
  teacherTermLabel: document.querySelector("#teacher-term-label"),
  teacherStatusGroups: document.querySelector("#teacher-status-groups"),
  teacherGradeFilters: document.querySelectorAll("[data-teacher-grade]"),
  teacherStudentDialog: document.querySelector("#teacher-student-dialog"),
  teacherDialogTitle: document.querySelector("#teacher-dialog-title"),
  teacherDialogSubtitle: document.querySelector("#teacher-dialog-subtitle"),
  teacherDialogContent: document.querySelector("#teacher-dialog-content"),
  metricStudents: document.querySelector("#metric-students"),
  metricActions: document.querySelector("#metric-actions"),
  metricContracts: document.querySelector("#metric-contracts"),
  metricAdmin: document.querySelector("#metric-admin"),
  dashboardActions: document.querySelector("#dashboard-actions"),
  statusGroups: document.querySelector("#status-groups"),
  incidentForm: document.querySelector("#incident-form"),
  incidentMessage: document.querySelector("#incident-message"),
  incidentStudentSearch: document.querySelector("#incident-student-search"),
  incidentStudentSelect: document.querySelector("#incident-student-select"),
  incidentStudentOptions: document.querySelector("#incident-student-options"),
  incidentHistorySummary: document.querySelector("#incident-history-summary"),
  studentForm: document.querySelector("#student-form"),
  studentMessage: document.querySelector("#student-message"),
  csvImportForm: document.querySelector("#csv-import-form"),
  csvMessage: document.querySelector("#csv-message"),
  studentList: document.querySelector("#student-list"),
  studentListPanel: document.querySelector("#student-list-panel"),
  studentSearch: document.querySelector("#student-search"),
  studentDetail: document.querySelector("#student-detail"),
  clearStudentsButton: document.querySelector("#clear-students-button"),
  archivedStudentSearch: document.querySelector("#archived-student-search"),
  archivedStudentList: document.querySelector("#archived-student-list"),
  actionList: document.querySelector("#action-list"),
  followupsTitle: document.querySelector("#followups-title"),
  followupsSubtitle: document.querySelector("#followups-subtitle"),
  followupsDetail: document.querySelector("#followups-detail"),
  statusTitle: document.querySelector("#status-title"),
  statusSubtitle: document.querySelector("#status-subtitle"),
  statusStudentList: document.querySelector("#status-student-list"),
  templateForm: document.querySelector("#template-form"),
  templateMessage: document.querySelector("#template-message"),
  templateList: document.querySelector("#template-list"),
  infractionSettings: document.querySelector("#infraction-settings"),
  infractionTypeForm: document.querySelector("#infraction-type-form"),
  infractionMessage: document.querySelector("#infraction-message"),
  currentTermLabel: document.querySelector("#current-term-label"),
  termMessage: document.querySelector("#term-message"),
  startTermButton: document.querySelector("#start-term-button"),
  rolloverForm: document.querySelector("#rollover-form"),
  rolloverMessage: document.querySelector("#rollover-message"),
  rolloverPreview: document.querySelector("#rollover-preview"),
  rolloverApplyButton: document.querySelector("#rollover-apply-button"),
  notificationForm: document.querySelector("#notification-form"),
  notificationMessage: document.querySelector("#notification-message"),
  notificationStatus: document.querySelector("#notification-status"),
  staffAccessForm: document.querySelector("#staff-access-form"),
  staffAccessMessage: document.querySelector("#staff-access-message"),
  staffAccessList: document.querySelector("#staff-access-list")
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...options
  });
  const body = await response.json().catch(() => ({}));
  if (response.status === 401 && path !== "/api/auth/me") {
    showLogin("Your session has expired. Sign in again.");
  }
  if (!response.ok) {
    const error = new Error(body.error || "Request failed");
    error.status = response.status;
    error.code = body.code;
    error.details = body;
    throw error;
  }
  return body;
}

function showLogin(message = "") {
  els.loginScreen.hidden = false;
  els.appShell.hidden = true;
  els.loginMessage.textContent = message;
}

function showApp(user) {
  state.currentUser = user;
  els.loginScreen.hidden = true;
  els.appShell.hidden = false;
  els.signedInName.textContent = user.name || "Signed in";
  els.signedInEmail.textContent = user.email || "";
  els.signedInRole.textContent = user.roleLabel || "";
  const isTeacher = user.role === "teacher";
  const isAdmin = user.role === "tech_admin";
  els.teacherNav.hidden = !isTeacher;
  els.techNavButtons.forEach(button => { button.hidden = isTeacher; });
  els.adminNavButtons.forEach(button => { button.hidden = !isAdmin; });
  els.workspaceSwitcher.disabled = isTeacher;
  els.workspaceSwitcher.setAttribute("aria-label", isTeacher ? "Tech Violations" : "Switch technology workspace");
  els.workspaceIndicator.hidden = isTeacher;
  els.workspaceMenu.hidden = true;
  switchView(isTeacher ? "teacher-dashboard" : "dashboard");
  populateReporterEmail();
}

async function loadWorkspace() {
  if (state.currentUser?.role === "teacher") return loadTeacherDashboard();
  return loadBootstrap();
}

async function loadAuth() {
  state.authConfig = await api("/api/auth/config");
  try {
    const { user } = await api("/api/auth/me");
    showApp(user);
    await loadWorkspace();
    return;
  } catch (error) {
    showLogin(error.status === 403 ? error.message : "");
    if (error.status === 403) return;
  }

  if (state.authConfig.authDisabled) {
    const { user } = await api("/api/auth/me");
    showApp(user);
    await loadWorkspace();
    return;
  }

  if (!state.authConfig.googleClientId) {
    showLogin("Google sign-in is not configured yet. Add GOOGLE_CLIENT_ID on the server.");
    return;
  }

  renderGoogleButton();
}

function renderGoogleButton() {
  const start = () => {
    if (!window.google?.accounts?.id) {
      setTimeout(start, 100);
      return;
    }
    window.google.accounts.id.initialize({
      client_id: state.authConfig.googleClientId,
      callback: handleGoogleCredential,
      hosted_domain: state.authConfig.allowedEmailDomain
    });
    window.google.accounts.id.renderButton(els.googleSignin, {
      theme: "outline",
      size: "large",
      text: "signin_with",
      shape: "rectangular",
      width: 280
    });
  };
  start();
}

async function handleGoogleCredential(response) {
  try {
    els.loginMessage.textContent = "Checking account...";
    const { user } = await api("/api/auth/google", {
      method: "POST",
      body: JSON.stringify({ credential: response.credential })
    });
    showApp(user);
    await loadWorkspace();
  } catch (error) {
    showLogin(error.message);
  }
}

async function loadBootstrap() {
  const data = await api("/api/bootstrap");
  state.currentTerm = data.currentTerm;
  state.notificationSettings = data.notificationSettings;
  state.students = data.students;
  state.infractionTypes = data.infractionTypes;
  state.templates = data.templates || [];
  state.openActions = data.openActions;
  state.incidentStudentHistory = null;
  renderAll();
  if (state.currentUser?.role === "tech_admin") await loadStaffAccess();
  populateReporterEmail();
}

async function loadTeacherDashboard() {
  const data = await api("/api/teacher-dashboard");
  state.currentTerm = data.currentTerm;
  state.teacherStudents = data.students || [];
  renderTeacherDashboard();
}

function populateReporterEmail() {
  const field = els.incidentForm.elements.reported_by;
  if (field && state.currentUser?.email) {
    field.value = state.currentUser.email;
  }
}

function renderAll() {
  renderMetrics();
  renderStudentOptions();
  renderInfractionOptions();
  renderDashboardActions();
  renderStatusGroups();
  renderStudents();
  if (!els.archivedStudentSearch.value.trim()) renderArchivedStudents([], "");
  renderActions();
  renderTemplates();
  renderInfractionSettings();
  renderTermSettings();
  renderNotificationSettings();
}

function renderTeacherDashboard() {
  const query = (els.teacherStudentSearch.value || "").trim().toLowerCase();
  const selectedGrades = new Set([...els.teacherGradeFilters]
    .filter(input => input.checked)
    .map(input => input.value));
  const visible = state.teacherStudents.filter(student => {
    const matchesSearch = [
      student.first_name,
      student.last_name,
      `${student.first_name} ${student.last_name}`,
      `${student.last_name}, ${student.first_name}`,
      student.grade
    ].join(" ").toLowerCase().includes(query);
    const gradeMatch = String(student.grade || "").match(/\d+/);
    const normalizedGrade = gradeMatch ? String(Number(gradeMatch[0])) : "";
    return matchesSearch && selectedGrades.has(normalizedGrade);
  });
  els.teacherTermLabel.textContent = state.currentTerm
    ? `Current term: ${state.currentTerm.name}`
    : "";
  if (!visible.length) {
    els.teacherStatusGroups.innerHTML = `<div class="empty">${query || selectedGrades.size < 3 ? "No students match the selected search and grade filters." : "No students currently have warnings or active technology intervention steps."}</div>`;
    return;
  }
  const order = ["admin_review", "device_restriction", "success_contract", "reflection", "monitor", "warnings"];
  els.teacherStatusGroups.innerHTML = order.map(key => {
    const students = visible.filter(student => student.status.key === key);
    if (!students.length) return "";
    const status = key === "warnings" ? {
      label: "Warnings documented",
      description: "These students have a current-term warning. Warnings do not count toward intervention steps."
    } : students[0].status;
    return `
      <section class="panel teacher-status-section ${escapeHtml(key)}">
        <div class="panel-heading">
          <div>
            <h3>${escapeHtml(status.label)}</h3>
            <p class="panel-note">${escapeHtml(status.description)}</p>
          </div>
          <span class="badge ${escapeHtml(key)}">${students.length} student${students.length === 1 ? "" : "s"}</span>
        </div>
        <div class="teacher-student-grid">
          ${students.map(student => `
            <button type="button" class="teacher-student-card" data-teacher-student-id="${student.id}" aria-label="View details for ${escapeHtml(student.first_name)} ${escapeHtml(student.last_name)}">
              <h4>${escapeHtml(student.first_name)} ${escapeHtml(student.last_name)}</h4>
              <div class="meta">
                ${student.grade ? `<span>Grade ${escapeHtml(student.grade)}</span>` : ""}
                <span>${student.violation_count} violation${student.violation_count === 1 ? "" : "s"}</span>
                ${student.warning_count ? `<span>${student.warning_count} warning${student.warning_count === 1 ? "" : "s"}</span>` : ""}
                ${student.chromebook_return_on ? `<span>Return date ${escapeHtml(student.chromebook_return_on)}</span>` : ""}
              </div>
              <span class="panel-note">Select for details</span>
            </button>
          `).join("")}
        </div>
      </section>`;
  }).join("");
}

async function showTeacherStudentDetail(studentId) {
  els.teacherDialogTitle.textContent = "Student details";
  els.teacherDialogSubtitle.textContent = "Loading current-term history...";
  els.teacherDialogContent.innerHTML = `<div class="empty">Loading...</div>`;
  if (!els.teacherStudentDialog.open) els.teacherStudentDialog.showModal();
  try {
    const data = await api(`/api/teacher-dashboard/students/${studentId}`);
    const student = data.student;
    els.teacherDialogTitle.textContent = `${student.first_name} ${student.last_name}`;
    els.teacherDialogSubtitle.textContent = [
      student.grade ? `Grade ${student.grade}` : "",
      data.currentTerm?.name || "Current term",
      student.status?.label || ""
    ].filter(Boolean).join(" · ");
    els.teacherDialogContent.innerHTML = data.incidents.length
      ? data.incidents.map(incident => {
          const isWarning = incident.entry_type === "warning";
          const entryLabel = isWarning ? "Warning" : `${incident.severity === "major" ? "Major" : "Minor"} violation`;
          return `
            <article class="teacher-history-entry">
              <div class="panel-heading">
                <h3>${escapeHtml(incident.infraction_label)}</h3>
                <span class="badge ${isWarning ? "warnings" : escapeHtml(incident.severity)}">${escapeHtml(entryLabel)}</span>
              </div>
              <div class="meta">
                <span>${escapeHtml(formatDate(incident.occurred_on))}</span>
                ${incident.class_period ? `<span>${escapeHtml(incident.class_period)}</span>` : ""}
                <span>Reported by ${escapeHtml(incident.reported_by)}</span>
              </div>
              ${incident.notes ? `<p>${escapeHtml(incident.notes)}</p>` : ""}
            </article>`;
        }).join("")
      : `<div class="empty">No active warnings or violations are recorded for this term.</div>`;
  } catch (error) {
    els.teacherDialogSubtitle.textContent = "Unable to load details";
    els.teacherDialogContent.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
  }
}

async function loadStaffAccess() {
  const data = await api("/api/staff-access");
  state.staffUsers = data.users || [];
  renderStaffAccess();
}

function renderStaffAccess() {
  if (!els.staffAccessList) return;
  if (!state.staffUsers.length) {
    els.staffAccessList.innerHTML = `<div class="empty">No staff accounts are listed yet.</div>`;
    return;
  }
  els.staffAccessList.innerHTML = state.staffUsers.map(user => `
    <div class="staff-access-row ${user.active ? "" : "inactive"}" data-staff-row="${escapeHtml(user.email)}">
      <div class="staff-identity">
        <strong>${escapeHtml(user.display_name || user.email)}</strong>
        <span>${escapeHtml(user.email)}${user.email === state.currentUser?.email ? " · You" : ""}</span>
      </div>
      <label>
        Access level
        <select data-staff-role>
          <option value="teacher" ${user.role === "teacher" ? "selected" : ""}>Teacher - read only</option>
          <option value="tech_staff" ${user.role === "tech_staff" ? "selected" : ""}>Tech Staff</option>
          <option value="tech_admin" ${user.role === "tech_admin" ? "selected" : ""}>Tech Admin</option>
        </select>
      </label>
      <label class="active-toggle">
        <input type="checkbox" data-staff-active ${user.active ? "checked" : ""}>
        Active
      </label>
      <button class="quiet-button" type="button" data-save-staff="${escapeHtml(user.email)}">Save</button>
    </div>
  `).join("");
}

async function addStaffAccess(event) {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button[type='submit']");
  button.disabled = true;
  els.staffAccessMessage.textContent = "Adding...";
  try {
    await api("/api/staff-access", {
      method: "POST",
      body: JSON.stringify({
        display_name: event.currentTarget.elements.display_name.value,
        email: event.currentTarget.elements.email.value,
        role: event.currentTarget.elements.role.value
      })
    });
    event.currentTarget.reset();
    await loadStaffAccess();
    els.staffAccessMessage.textContent = "Staff access added.";
  } catch (error) {
    els.staffAccessMessage.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

async function saveStaffAccess(email, button) {
  const row = button.closest("[data-staff-row]");
  button.disabled = true;
  const original = button.textContent;
  button.textContent = "Saving...";
  els.staffAccessMessage.textContent = "";
  try {
    const existing = state.staffUsers.find(user => user.email === email);
    const updated = await api(`/api/staff-access/${encodeURIComponent(email)}`, {
      method: "PUT",
      body: JSON.stringify({
        display_name: existing?.display_name || "",
        role: row.querySelector("[data-staff-role]").value,
        active: row.querySelector("[data-staff-active]").checked
      })
    });
    state.staffUsers = state.staffUsers.map(user => user.email === email ? updated : user);
    renderStaffAccess();
    els.staffAccessMessage.textContent = `${email} was updated.`;
  } catch (error) {
    els.staffAccessMessage.textContent = error.message;
    await loadStaffAccess().catch(() => {});
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

function renderTermSettings() {
  if (!els.currentTermLabel) return;
  const term = state.currentTerm;
  els.currentTermLabel.textContent = term
    ? `Current term: ${term.name} (started ${term.started_on})`
    : "Current term is not set.";
}

function renderNotificationSettings() {
  if (!els.notificationForm || !state.notificationSettings) return;
  const emails = state.notificationSettings.teamEmails || [];
  els.notificationForm.elements.team_emails.value = emails.join("\n");
  els.notificationStatus.textContent = state.notificationSettings.emailConfigured
    ? `Email is configured. Dashboard link: ${state.notificationSettings.appBaseUrl}`
    : "Email is not configured on the server yet. Save recipients now; messages will send after SMTP is added.";
}

function switchView(name) {
  if (state.currentUser?.role === "teacher" && name !== "teacher-dashboard") return;
  if (name === "settings" && state.currentUser?.role !== "tech_admin") return;
  els.studentListPanel.open = false;
  window.scrollTo({ top: 0, behavior: "instant" });
  els.navButtons.forEach(button => {
    button.classList.toggle("active", button.dataset.view === name);
  });
  els.views.forEach(view => {
    view.classList.toggle("active", view.id === `${name}-view`);
  });
  const repairWorkspace = name === "repairs";
  els.workspaceBrandMark.textContent = repairWorkspace ? "CR" : "TV";
  els.workspaceBrandTitle.textContent = repairWorkspace ? "Chromebook Repairs" : "Tech Violations";
  els.workspaceBrandSubtitle.textContent = repairWorkspace ? "Repair desk tracker" : "Student support tracker";
  els.workspaceOptions.forEach(option => {
    const selected = option.dataset.workspaceView === (repairWorkspace ? "repairs" : "dashboard");
    option.classList.toggle("active", selected);
    option.setAttribute("aria-current", selected ? "page" : "false");
  });
  els.workspaceMenu.hidden = true;
  els.workspaceSwitcher.setAttribute("aria-expanded", "false");
}

function renderMetrics() {
  els.metricStudents.textContent = state.students.length;
  els.metricActions.textContent = state.openActions.length;
  els.metricContracts.textContent = state.students.filter(student => student.status.key === "success_contract").length;
  els.metricAdmin.textContent = state.students.filter(student => student.status.key === "admin_review").length;
}

function renderStudentOptions() {
  const previous = els.incidentForm.elements.student_id.value;
  els.incidentStudentSelect.innerHTML = [
    `<option value="">Or choose from full list</option>`,
    ...state.students.map(student => (
      `<option value="${student.id}">${escapeHtml(studentOptionLabel(student))}</option>`
    ))
  ].join("");
  els.incidentStudentSelect.value = previous;
  updateIncidentStudentOptions();
}

function studentOptionLabel(student) {
  const parts = [
    `${student.last_name}, ${student.first_name}`,
    student.grade ? `Grade ${student.grade}` : "",
    student.student_number ? `ID ${student.student_number}` : ""
  ].filter(Boolean);
  return parts.join(" - ");
}

function studentSearchText(student) {
  return [
    student.first_name,
    student.last_name,
    `${student.first_name} ${student.last_name}`,
    `${student.last_name}, ${student.first_name}`,
    student.student_number
  ].join(" ").toLowerCase();
}

function matchingIncidentStudents(query) {
  const normalized = query.trim().toLowerCase();
  if (normalized.length < 3) return [];
  return state.students
    .filter(student => studentSearchText(student).includes(normalized))
    .slice(0, 25);
}

function updateIncidentStudentOptions() {
  const query = els.incidentStudentSearch.value;
  const matches = matchingIncidentStudents(query);
  els.incidentStudentOptions.innerHTML = matches.map(student => (
    `<option value="${escapeHtml(studentOptionLabel(student))}"></option>`
  )).join("");
  const selected = state.students.find(student => studentOptionLabel(student) === query);
  els.incidentForm.elements.student_id.value = selected ? selected.id : "";
  els.incidentStudentSelect.value = selected ? String(selected.id) : "";
  loadIncidentStudentHistory(selected?.id);
}

function selectIncidentStudent(studentId) {
  const selected = state.students.find(student => String(student.id) === String(studentId));
  els.incidentForm.elements.student_id.value = selected ? selected.id : "";
  els.incidentStudentSearch.value = selected ? studentOptionLabel(selected) : "";
  els.incidentStudentSelect.value = selected ? String(selected.id) : "";
  updateIncidentStudentOptions();
}

function incidentEntryType(incident) {
  return incident.entry_type === "warning" ? "warning" : "violation";
}

function quickHistoryRow(incident) {
  const entryType = incidentEntryType(incident);
  const label = entryType === "warning" ? "Warning" : `${incident.severity === "major" ? "Major" : "Minor"} violation`;
  return `
    <li class="quick-history-row ${incident.canceled_at ? "canceled" : ""}">
      <span class="quick-history-kind ${entryType}">${label}</span>
      <strong>${escapeHtml(incident.infraction_label || "Uncategorized")}</strong>
      <span>${escapeHtml(formatDate(incident.occurred_on))}${incident.term_name ? ` · ${escapeHtml(incident.term_name)}` : ""}</span>
      ${incident.canceled_at ? `<span class="canceled-badge">Removed</span>` : ""}
    </li>
  `;
}

function renderIncidentHistorySummary() {
  const student = state.incidentStudentHistory;
  if (!student) {
    els.incidentHistorySummary.hidden = true;
    els.incidentHistorySummary.innerHTML = "";
    return;
  }

  const incidents = student.incidents || [];
  const currentIncidents = student.currentIncidents || [];
  const activeCurrent = currentIncidents.filter(incident => !incident.canceled_at);
  const currentWarnings = activeCurrent.filter(incident => incidentEntryType(incident) === "warning");
  const currentViolations = activeCurrent.filter(incident => incidentEntryType(incident) === "violation");
  const selectedTypeId = Number(els.incidentForm.elements.infraction_type_id.value || 0);
  const selectedType = state.infractionTypes.find(type => Number(type.id) === selectedTypeId);
  const matching = selectedTypeId
    ? incidents.filter(incident => Number(incident.infraction_type_id) === selectedTypeId)
    : [];
  const matchingCurrentWarnings = matching.filter(incident =>
    Number(incident.term_id) === Number(state.currentTerm?.id)
      && incidentEntryType(incident) === "warning"
      && !incident.canceled_at
  );
  const recent = incidents.slice(0, 4);

  els.incidentHistorySummary.hidden = false;
  els.incidentHistorySummary.innerHTML = `
    <div class="quick-history-heading">
      <div>
        <h3>${escapeHtml(student.first_name)} ${escapeHtml(student.last_name)}: history at a glance</h3>
        <p>Review recent and matching records before saving this entry.</p>
      </div>
      <button type="button" class="quiet-button compact-button" data-student-id="${student.id}">View full history</button>
    </div>
    <div class="quick-history-stats">
      <span><strong>${currentViolations.length}</strong> current-term violation${currentViolations.length === 1 ? "" : "s"}</span>
      <span><strong>${currentWarnings.length}</strong> current-term warning${currentWarnings.length === 1 ? "" : "s"}</span>
      <span><strong>${escapeHtml(student.status?.label || "No violations")}</strong> current step</span>
    </div>
    <div class="quick-history-grid">
      <section>
        <h4>Similar type: ${escapeHtml(selectedType?.label || "Choose a type")}</h4>
        ${matching.length
          ? `<ul class="quick-history-list">${matching.slice(0, 3).map(quickHistoryRow).join("")}</ul>`
          : `<p class="quick-history-empty">No previous records for this type.</p>`}
        ${matchingCurrentWarnings.length
          ? `<p class="repeat-warning-note"><strong>${matchingCurrentWarnings.length} current-term warning${matchingCurrentWarnings.length === 1 ? "" : "s"}</strong> already recorded for this type.</p>`
          : ""}
      </section>
      <section>
        <h4>Most recent history</h4>
        ${recent.length
          ? `<ul class="quick-history-list">${recent.map(quickHistoryRow).join("")}</ul>`
          : `<p class="quick-history-empty">No warnings or violations recorded.</p>`}
      </section>
    </div>
  `;
}

async function loadIncidentStudentHistory(studentId) {
  const id = Number(studentId || 0);
  if (!id) {
    state.incidentHistoryRequest += 1;
    state.incidentStudentHistory = null;
    renderIncidentHistorySummary();
    return;
  }
  if (Number(state.incidentStudentHistory?.id) === id) {
    renderIncidentHistorySummary();
    return;
  }

  const requestId = ++state.incidentHistoryRequest;
  els.incidentHistorySummary.hidden = false;
  els.incidentHistorySummary.innerHTML = `<p class="quick-history-empty">Loading student history...</p>`;
  try {
    const student = await api(`/api/students/${id}`);
    if (requestId !== state.incidentHistoryRequest || Number(els.incidentForm.elements.student_id.value) !== id) return;
    state.incidentStudentHistory = student;
    renderIncidentHistorySummary();
  } catch (error) {
    if (requestId !== state.incidentHistoryRequest) return;
    state.incidentStudentHistory = null;
    els.incidentHistorySummary.hidden = false;
    els.incidentHistorySummary.innerHTML = `<p class="quick-history-error">${escapeHtml(error.message)}</p>`;
  }
}

function renderInfractionOptions() {
  const severity = els.incidentForm.elements.severity.value;
  const select = els.incidentForm.elements.infraction_type_id;
  const options = state.infractionTypes
    .filter(type => type.severity === severity)
    .map(type => `<option value="${type.id}">${escapeHtml(type.label)}</option>`);
  select.innerHTML = options.join("");
  renderIncidentHistorySummary();
}

function renderDashboardActions() {
  const groups = groupOpenActionsByStudent().slice(0, 6);
  els.dashboardActions.innerHTML = groups.length
    ? groups.map(followupStudentCard).join("")
    : `<div class="empty">No open follow-ups right now.</div>`;
}

function statusAckKey(key) {
  return `vtrack.status.${key}.acknowledgedIncidentId`;
}

function studentsForStatus(key) {
  if (key === "warnings") {
    return state.students.filter(student => student.status.key === "no_violations" && student.warning_count > 0);
  }
  return state.students.filter(student => student.status.key === key);
}

function latestIncidentIdForStatus(key) {
  return studentsForStatus(key)
    .reduce((latest, student) => Math.max(latest, Number(student.last_incident_id || 0)), 0);
}

function statusHasNew(key) {
  const latest = latestIncidentIdForStatus(key);
  const acknowledged = Number(localStorage.getItem(statusAckKey(key)) || 0);
  return latest > acknowledged;
}

function acknowledgeStatusNew(key) {
  const latest = latestIncidentIdForStatus(key);
  if (latest > 0) {
    localStorage.setItem(statusAckKey(key), String(latest));
  }
}

function renderStatusGroups() {
  els.statusGroups.innerHTML = statusOrder.map(key => {
    const students = studentsForStatus(key);
    const hasNew = statusHasNew(key);
    return `
      <button class="status-group status-group-button" type="button" data-status-key="${key}">
        <h4>
          <span class="badge ${key}">${statusLabels[key]}</span>
          ${hasNew ? `<span class="new-badge">New</span>` : ""}
        </h4>
        <div class="status-count">${escapeHtml(students.length === 1 ? "1 student" : `${students.length} students`)}</div>
      </button>
    `;
  }).join("");
}

function renderStudents() {
  const query = els.studentSearch.value.trim().toLowerCase();
  const students = state.students.filter(student => {
    const text = `${student.first_name} ${student.last_name} ${student.student_number || ""}`.toLowerCase();
    return text.includes(query);
  });
  els.studentList.innerHTML = students.length
    ? students.map(student => `
      <article class="list-row">
        <div>
          <h4>${escapeHtml(student.last_name)}, ${escapeHtml(student.first_name)}</h4>
          <div class="meta">
            <span>${student.grade ? `Grade ${escapeHtml(student.grade)}` : "Grade not set"}</span>
            <span>${student.violation_count} total</span>
            <span>${student.minor_count} minor</span>
            <span>${student.major_count} major</span>
            ${student.warning_count ? `<span>${student.warning_count} warning${student.warning_count === 1 ? "" : "s"}</span>` : ""}
          </div>
        </div>
        <button class="quiet-button" data-student-id="${student.id}">Review</button>
      </article>
    `).join("")
    : `<div class="empty">No matching students.</div>`;
}

function handleStudentSearch() {
  if (els.studentSearch.value.trim()) {
    els.studentListPanel.open = true;
  }
  renderStudents();
}

function renderActions() {
  const groups = groupOpenActionsByStudent();
  els.actionList.innerHTML = groups.length
    ? groups.map(followupStudentCard).join("")
    : `<div class="empty">No open follow-ups right now.</div>`;
}

function groupOpenActionsByStudent() {
  const map = new Map();
  for (const action of state.openActions) {
    const studentId = Number(action.student_id);
    if (!map.has(studentId)) {
      map.set(studentId, {
        student_id: studentId,
        student_name: action.student_name || `${action.first_name || ""} ${action.last_name || ""}`.trim(),
        grade: action.grade,
        incident_id: action.incident_id,
        actions: []
      });
    }
    map.get(studentId).actions.push(action);
  }
  return [...map.values()].sort((a, b) => a.student_name.localeCompare(b.student_name));
}

function followupStudentCard(group) {
  const titles = group.actions.map(action => action.title).join(" | ");
  return `
    <article class="action-row">
      <div>
        <h4>${escapeHtml(group.student_name)}</h4>
        <div class="meta">
          <span>${group.grade ? `Grade ${escapeHtml(group.grade)}` : "Grade not set"}</span>
          <span>${group.actions.length} open follow-up${group.actions.length === 1 ? "" : "s"}</span>
        </div>
        <div class="meta">${escapeHtml(titles)}</div>
      </div>
      <div class="row-actions">
        ${group.incident_id ? `<button class="danger-button" data-cancel-incident="${group.incident_id}">Remove violation</button>` : ""}
        <button class="primary-button" data-followup-student-id="${group.student_id}">Review</button>
      </div>
    </article>
  `;
}

function actionCard(action) {
  const template = templateForAction(action.action_type);
  const allowsDocumentUpload = !String(action.action_type || "").startsWith("parent_contact");
  return `
    <article class="action-row" data-action-id="${action.id}">
      <div>
        <h4>${escapeHtml(action.title)}</h4>
        <div class="meta">
          <span>Owner: ${escapeHtml(action.owner || "Unassigned")}</span>
          <span>Due: ${escapeHtml(action.due_on || "No date")}</span>
        </div>
        ${action.notes ? `<div class="meta">${escapeHtml(action.notes)}</div>` : ""}
        ${actionFields(action)}
        ${action.documents?.length ? documentList(action.documents) : ""}
      </div>
      <div class="row-actions">
        ${template ? `<button class="quiet-button" data-print-template="${escapeHtml(template.url)}">Print</button>` : ""}
        ${allowsDocumentUpload ? `
          <label class="upload-button">
            <span>Upload Document</span>
            <input type="file" data-document-file="${action.id}" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg">
          </label>
        ` : ""}
        <button class="success-button" data-complete-action="${action.id}">Complete</button>
      </div>
    </article>
  `;
}

function attachActionDocuments(actions, documents) {
  return actions.map(action => ({
    ...action,
    documents: documents.filter(document => Number(document.action_id) === Number(action.id))
  }));
}

function documentList(documents) {
  return `
    <div class="document-list">
      ${documents.map(document => `
        <a href="${escapeHtml(document.url)}" target="_blank" rel="noopener">${escapeHtml(document.original_name)}</a>
      `).join("")}
    </div>
  `;
}

function actionFields(action) {
  if (action.action_type === "device_restriction") {
    return `
      <div class="action-fields">
        <label>
          Asset tag
          <input data-action-asset-tag="${action.id}" autocomplete="off" placeholder="Scan or enter asset tag" required>
        </label>
        <label>
          Restriction through
          <input type="date" data-action-return-date="${action.id}" value="${escapeHtml(action.due_on || "")}" required>
        </label>
      </div>
    `;
  }
  if (action.action_type === "reentry_check") {
    return `
      <div class="action-fields">
        <label>
          Chromebook return date
          <input type="date" data-action-return-date="${action.id}" value="${escapeHtml(action.due_on || "")}" required>
        </label>
      </div>
    `;
  }
  return "";
}

function templateForAction(actionType) {
  return state.templates.find(template => template.action_type === actionType);
}

function renderInfractionSettings() {
  els.infractionSettings.innerHTML = ["minor", "major"].map(severity => {
    const items = state.infractionTypes.filter(type => type.severity === severity);
    return `
      <div class="type-group">
        <div class="type-group-heading">
          <h4>${severity === "minor" ? "Minor violations" : "Major violations"}</h4>
          <span class="badge ${severity === "minor" ? "monitor" : "admin_review"}">${items.length}</span>
        </div>
        <div class="infraction-type-list">
          ${items.map(item => `
            <article class="infraction-type-row">
              <div class="infraction-type-summary">
                <strong>${escapeHtml(item.label)}</strong>
                <span>${escapeHtml(item.description || "No description")}</span>
              </div>
              <div class="row-actions">
                <button class="quiet-button compact-button" type="button" data-edit-infraction="${item.id}">Edit</button>
                <button class="danger-button compact-button" type="button" data-retire-infraction="${item.id}" data-infraction-label="${escapeHtml(item.label)}">Retire</button>
              </div>
              <form class="infraction-edit-form" data-infraction-edit-form="${item.id}" hidden>
                <label>
                  Type name
                  <input name="label" maxlength="100" value="${escapeHtml(item.label)}" required>
                </label>
                <label>
                  Severity
                  <select name="severity" required>
                    <option value="minor" ${item.severity === "minor" ? "selected" : ""}>Minor</option>
                    <option value="major" ${item.severity === "major" ? "selected" : ""}>Major</option>
                  </select>
                </label>
                <label class="full-width">
                  Description <span class="optional-label">optional</span>
                  <textarea name="description" maxlength="500" rows="2">${escapeHtml(item.description || "")}</textarea>
                </label>
                <div class="form-actions full-width">
                  <button type="submit" class="primary-button">Save changes</button>
                  <button type="button" class="quiet-button" data-cancel-infraction-edit="${item.id}">Cancel</button>
                  <span role="status"></span>
                </div>
              </form>
            </article>
          `).join("")}
        </div>
      </div>
    `;
  }).join("");
}

function toggleInfractionEdit(id, open) {
  document.querySelectorAll("[data-infraction-edit-form]").forEach(form => {
    form.hidden = Number(form.dataset.infractionEditForm) !== Number(id) || !open;
  });
}

async function createInfractionType(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submitButton = form.querySelector("button[type='submit']");
  const originalText = submitButton.textContent;
  submitButton.disabled = true;
  submitButton.textContent = "Adding...";
  els.infractionMessage.textContent = "Adding...";
  try {
    const payload = Object.fromEntries(new FormData(form).entries());
    const result = await api("/api/infraction-types", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    form.reset();
    await loadBootstrap();
    els.infractionMessage.textContent = `${result.label} was ${result.action}.`;
    setTimeout(() => { els.infractionMessage.textContent = ""; }, 5000);
  } catch (error) {
    els.infractionMessage.textContent = error.message;
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = originalText;
  }
}

async function updateInfractionType(form) {
  const id = Number(form.dataset.infractionEditForm);
  const status = form.querySelector("[role='status']");
  const submitButton = form.querySelector("button[type='submit']");
  const originalText = submitButton.textContent;
  submitButton.disabled = true;
  submitButton.textContent = "Saving...";
  status.textContent = "Saving...";
  try {
    const payload = Object.fromEntries(new FormData(form).entries());
    const result = await api(`/api/infraction-types/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    });
    await loadBootstrap();
    els.infractionMessage.textContent = `${result.label} was updated.`;
    setTimeout(() => { els.infractionMessage.textContent = ""; }, 5000);
  } catch (error) {
    status.textContent = error.message;
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = originalText;
  }
}

async function retireInfractionType(id, label) {
  const confirmed = window.confirm(`Retire ${label}? It will no longer appear when adding new violations. Existing student history will remain.`);
  if (!confirmed) return;
  try {
    await api(`/api/infraction-types/${id}`, {
      method: "DELETE",
      body: JSON.stringify({})
    });
    await loadBootstrap();
    els.infractionMessage.textContent = `${label} was retired.`;
    setTimeout(() => { els.infractionMessage.textContent = ""; }, 5000);
  } catch (error) {
    els.infractionMessage.textContent = error.message;
  }
}

function renderTemplates() {
  const labels = Object.fromEntries([...els.templateForm.elements.action_type.options].map(option => [option.value, option.textContent]));
  els.templateList.innerHTML = Object.entries(labels).map(([actionType, label]) => {
    const template = templateForAction(actionType);
    return `
      <article class="list-row">
        <div>
          <h4>${escapeHtml(label)}</h4>
          <div class="meta">${template ? `Uploaded: ${escapeHtml(template.original_name)}` : "No form uploaded"}</div>
        </div>
        <div class="row-actions">
          ${template ? `<button class="quiet-button" data-print-template="${escapeHtml(template.url)}">Print</button>` : ""}
          ${template ? `<button class="danger-button" data-delete-template="${escapeHtml(actionType)}" data-template-label="${escapeHtml(label)}">Delete</button>` : ""}
        </div>
      </article>
    `;
  }).join("");
}

function renderStatusStudents(key) {
  state.selectedStatusKey = key;
  acknowledgeStatusNew(key);
  const students = studentsForStatus(key);
  els.statusTitle.textContent = statusLabels[key] || "Current Step";
  els.statusSubtitle.textContent = key === "warnings"
    ? (students.length === 1 ? "1 student has a current-term warning and no active intervention step." : `${students.length} students have current-term warnings and no active intervention step.`)
    : (students.length === 1 ? "1 student currently in this step." : `${students.length} students currently in this step.`);
  els.statusStudentList.innerHTML = students.length
    ? students.map(student => statusStudentRow(student, key)).join("")
    : `<div class="empty">${key === "warnings" ? "No students currently have warnings without an active intervention step." : "No students currently in this step."}</div>`;
  renderStatusGroups();
  switchView("status");
}

function formatDate(value) {
  if (!value) return "";
  const [year, month, day] = String(value).split("-");
  if (!year || !month || !day) return value;
  return `${month}/${day}/${year}`;
}

function statusStudentRow(student, key) {
  const returnBadge = key === "device_restriction" && student.chromebook_return_on
    ? `<span class="return-date-badge">Return: ${escapeHtml(formatDate(student.chromebook_return_on))}</span>`
    : "";
  return `
    <article class="list-row">
      <div>
        <h4>${escapeHtml(student.last_name)}, ${escapeHtml(student.first_name)}</h4>
        <div class="meta">
          <span>${student.grade ? `Grade ${escapeHtml(student.grade)}` : "Grade not set"}</span>
          <span>${student.violation_count} total</span>
          <span>${student.minor_count} minor</span>
          <span>${student.major_count} major</span>
          ${student.warning_count ? `<span>${student.warning_count} warning${student.warning_count === 1 ? "" : "s"}</span>` : ""}
        </div>
      </div>
      <div class="row-actions">
        ${returnBadge}
        <button class="quiet-button" data-student-id="${student.id}">Review</button>
      </div>
    </article>
  `;
}

function incidentRows(incidents, allowRemoval = true) {
  return incidents.length ? incidents.map(incident => {
    const entryType = incidentEntryType(incident);
    const entryLabel = entryType === "warning" ? "Warning" : `${incident.severity} violation`;
    return `
    <article class="incident-row ${entryType === "warning" ? "warning" : ""} ${incident.canceled_at ? "canceled" : ""}">
      <div class="incident-heading">
        <h4>
          ${escapeHtml(incident.occurred_on)}: ${escapeHtml(entryLabel)} - ${escapeHtml(incident.infraction_label || "Uncategorized")}
          ${entryType === "warning" ? `<span class="warning-badge">Does not count</span>` : ""}
          ${incident.canceled_at ? `<span class="canceled-badge">Removed</span>` : ""}
        </h4>
        ${allowRemoval && !incident.canceled_at ? `
          <div class="row-actions">
            ${entryType === "violation" ? `<button class="quiet-button compact-button" data-convert-incident="${incident.id}">Convert to warning</button>` : ""}
            <button class="danger-button compact-button" data-cancel-incident="${incident.id}" data-entry-type="${entryType}">Remove ${entryType}</button>
          </div>
        ` : ""}
      </div>
      <div class="meta">
        <span>Reported by ${escapeHtml(incident.reported_by)}</span>
        ${incident.class_period ? `<span>Period ${escapeHtml(incident.class_period)}</span>` : ""}
        ${incident.category ? `<span>${escapeHtml(incident.category)}</span>` : ""}
        ${incident.term_name ? `<span>${escapeHtml(incident.term_name)}</span>` : ""}
        ${incident.canceled_by ? `<span>Removed by ${escapeHtml(incident.canceled_by)}</span>` : ""}
        ${incident.converted_by ? `<span>Converted by ${escapeHtml(incident.converted_by)}</span>` : ""}
      </div>
      ${incident.notes ? `<p>${escapeHtml(incident.notes)}</p>` : ""}
      ${incident.conversion_reason ? `<p><strong>Conversion reason:</strong> ${escapeHtml(incident.conversion_reason)}</p>` : ""}
      ${incident.canceled_reason ? `<p><strong>Removal reason:</strong> ${escapeHtml(incident.canceled_reason)}</p>` : ""}
    </article>
  `;
  }).join("") : `<div class="empty">No warnings or violations recorded.</div>`;
}

function profileDocumentCard(document) {
  return `
    <article class="list-row">
      <div>
        <h4>${escapeHtml(document.original_name)}</h4>
        <div class="meta">
          <span>${escapeHtml(document.title || document.action_title || "Student document")}</span>
          ${document.term_name ? `<span>${escapeHtml(document.term_name)}</span>` : ""}
          <span>Uploaded ${escapeHtml(String(document.uploaded_at || "").slice(0, 10))}</span>
        </div>
      </div>
      <a class="quiet-link-button" href="${escapeHtml(document.url)}" target="_blank" rel="noopener">Open</a>
    </article>
  `;
}

function stepAdjustmentOptions(currentKey) {
  const currentLevel = statusLevels[currentKey] ?? 0;
  return ["reflection", "success_contract", "device_restriction", "admin_review"]
    .filter(key => statusLevels[key] > currentLevel)
    .map(key => `<option value="${key}">${escapeHtml(statusLabels[key])}</option>`)
    .join("");
}

function stepAdjustmentForm(student) {
  const options = stepAdjustmentOptions(student.status.key);
  if (!options) {
    return `<div class="empty">This student is already at the highest current step.</div>`;
  }
  return `
    <form class="step-adjust-form" data-step-adjust-form="${student.id}" hidden>
      <label>
        Adjust current step to
        <select name="target_step" required>
          <option value="">Choose higher step</option>
          ${options}
        </select>
      </label>
      <label>
        Reason
        <textarea name="reason" rows="3" required placeholder="Document why this student is being moved to a higher step."></textarea>
      </label>
      <div class="form-actions">
        <button type="submit" class="primary-button">Save adjustment</button>
        <span role="status"></span>
      </div>
    </form>
  `;
}

function adjustmentRows(adjustments) {
  return adjustments.length ? adjustments.map(adjustment => `
    <article class="incident-row">
      <h4>${escapeHtml(String(adjustment.created_at || "").slice(0, 10))}: moved to ${escapeHtml(statusLabels[adjustment.target_step] || adjustment.target_step)}</h4>
      <div class="meta">
        ${adjustment.term_name ? `<span>${escapeHtml(adjustment.term_name)}</span>` : ""}
        ${adjustment.adjusted_by ? `<span>Adjusted by ${escapeHtml(adjustment.adjusted_by)}</span>` : ""}
      </div>
      <p>${escapeHtml(adjustment.reason)}</p>
    </article>
  `).join("") : `<div class="empty">No administrative step adjustments recorded.</div>`;
}

async function showFollowups(studentId) {
  const student = await api(`/api/students/${studentId}`);
  state.selectedFollowupStudentId = studentId;
  const actionsWithDocuments = attachActionDocuments(student.actions, student.documents || []);
  const openActions = actionsWithDocuments.filter(action => action.status === "open");
  els.followupsTitle.textContent = `${student.first_name} ${student.last_name}`;
  els.followupsSubtitle.textContent = openActions.length === 1 ? "1 open follow-up needs attention." : `${openActions.length} open follow-ups need attention.`;
  els.followupsDetail.innerHTML = `
    <section class="panel">
      <div class="detail-header">
        <div>
          <h3>${escapeHtml(student.first_name)} ${escapeHtml(student.last_name)}</h3>
          <div class="meta">
            <span>${student.grade ? `Grade ${escapeHtml(student.grade)}` : "Grade not set"}</span>
            <span>${student.student_number ? `ID ${escapeHtml(student.student_number)}` : "No student ID"}</span>
            <span>${escapeHtml(student.status.label)}</span>
          </div>
        </div>
        <div class="row-actions">
          <button class="quiet-button" data-toggle-step-adjust="${student.id}">Adjust Current Step</button>
          <button class="quiet-button" data-student-id="${student.id}">Open student record</button>
        </div>
      </div>
      ${stepAdjustmentForm(student)}
      <div class="timeline">
        ${openActions.length ? openActions.map(actionCard).join("") : `<div class="empty">No open follow-ups for this student.</div>`}
      </div>
    </section>
  `;
  switchView("followups");
}

async function showStudentDetail(id) {
  els.studentListPanel.open = false;
  const student = await api(`/api/students/${id}`);
  els.studentListPanel.open = false;
  state.selectedStudentId = id;
  const isArchived = Number(student.active) === 0;
  const documents = student.documents || [];
  const actionsWithDocuments = attachActionDocuments(student.actions, documents);
  const openActions = actionsWithDocuments.filter(action => action.status === "open");
  const currentIncidents = student.currentIncidents || student.incidents || [];
  const previousIncidents = student.previousIncidents || [];
  const currentAdjustments = student.currentAdjustments || [];
  const previousAdjustments = student.previousAdjustments || [];
  els.studentDetail.hidden = false;
  els.studentDetail.innerHTML = `
    <div class="detail-header">
      <div>
        <h3>${escapeHtml(student.first_name)} ${escapeHtml(student.last_name)}</h3>
        <div class="meta">
          <span>${student.grade ? `Grade ${escapeHtml(student.grade)}` : "Grade not set"}</span>
          <span>${student.student_number ? `ID ${escapeHtml(student.student_number)}` : "No student ID"}</span>
        </div>
      </div>
      <div class="detail-actions">
        <div class="detail-primary-actions">
          <button class="quiet-button" data-open-view="dashboard">Back to dashboard</button>
          <button class="primary-button" data-export-history="${student.id}" type="button">Export PDF</button>
        </div>
        ${isArchived ? `
          <div class="detail-state-actions">
            <span class="badge archived">Archived</span>
            <button class="primary-button" data-restore-student="${student.id}" data-student-name="${escapeHtml(`${student.first_name} ${student.last_name}`)}">Restore student</button>
          </div>
        ` : `
          <details class="record-actions-menu">
            <summary class="quiet-button">More actions</summary>
            <div class="record-actions-popover">
              <button class="danger-button" data-delete-student="${student.id}" data-student-name="${escapeHtml(`${student.first_name} ${student.last_name}`)}">Delete student</button>
            </div>
          </details>
        `}
      </div>
    </div>
    ${isArchived ? `
      <div class="archived-note">
        This student is archived and hidden from active workflows. Restore the student to enter new violations or warnings or include them in active lists.
      </div>
    ` : ""}
    <div class="detail-grid">
      <div class="detail-stat"><span>Total violations</span><strong>${Number(student.counts.total_count || 0)}</strong></div>
      <div class="detail-stat"><span>Minor</span><strong>${Number(student.counts.minor_count || 0)}</strong></div>
      <div class="detail-stat"><span>Major</span><strong>${Number(student.counts.major_count || 0)}</strong></div>
      <div class="detail-stat"><span>Warnings</span><strong>${Number(student.counts.warning_count || 0)}</strong></div>
      <div class="detail-stat ${isArchived ? "" : "full-width"}"><span>${isArchived ? "Archived date" : "Current step"}</span><strong>${escapeHtml(isArchived ? student.archived_at || "Not set" : student.status.description)}</strong></div>
      ${isArchived ? `<div class="detail-stat full-width"><span>Archive reason</span><strong>${escapeHtml(student.archived_reason || "Not set")}</strong></div>` : ""}
    </div>
    ${isArchived ? "" : `
      <h4 class="section-title">Open Follow-Ups</h4>
      <div class="timeline">
        ${openActions.length ? openActions.map(actionCard).join("") : `<div class="empty">No open follow-ups for this student.</div>`}
      </div>
    `}
    <h4 class="section-title">Technology History: Current Term</h4>
    <div class="timeline">
      ${incidentRows(currentIncidents, !isArchived)}
    </div>
    <h4 class="section-title">Administrative Step Adjustments: Current Term</h4>
    <div class="timeline">
      ${adjustmentRows(currentAdjustments)}
    </div>
    <details class="history-details">
      <summary>Technology History: Previous Terms (${previousIncidents.length})</summary>
      <div class="timeline">
        ${incidentRows(previousIncidents, !isArchived)}
      </div>
    </details>
    <details class="history-details">
      <summary>Administrative Step Adjustments: Previous Terms (${previousAdjustments.length})</summary>
      <div class="timeline">
        ${adjustmentRows(previousAdjustments)}
      </div>
    </details>
    <h4 class="section-title">Stored Documents</h4>
    <div class="document-library">
      ${documents.length ? documents.map(profileDocumentCard).join("") : `<div class="empty">No documents uploaded.</div>`}
    </div>
  `;
  setTimeout(() => {
    els.studentDetail.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 0);
}

async function createStudent(event) {
  event.preventDefault();
  const formElement = event.currentTarget;
  const submitButton = formElement.querySelector("button[type='submit']");
  const form = new FormData(formElement);
  const payload = Object.fromEntries(form.entries());
  const studentName = `${payload.first_name || ""} ${payload.last_name || ""}`.trim();
  const originalText = submitButton.textContent;
  submitButton.disabled = true;
  submitButton.textContent = "Saving...";
  els.studentMessage.textContent = "Saving...";
  try {
    const result = await api("/api/students", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    formElement.reset();
    els.studentSearch.value = "";
    await loadBootstrap();
    els.studentMessage.textContent = `${studentName} was ${result.mode === "updated" ? "updated" : "added"}.`;
    setTimeout(() => { els.studentMessage.textContent = ""; }, 5000);
  } catch (error) {
    els.studentMessage.textContent = error.message;
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = originalText;
  }
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (quoted && char === "\"" && next === "\"") {
      value += "\"";
      i += 1;
    } else if (char === "\"") {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(value.trim());
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(value.trim());
      if (row.some(cell => cell !== "")) rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }
  row.push(value.trim());
  if (row.some(cell => cell !== "")) rows.push(row);
  return rows;
}

function normalizeHeader(header) {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function studentFieldForHeader(header) {
  const key = normalizeHeader(header);
  const map = {
    firstname: "first_name",
    namefirst: "first_name",
    first: "first_name",
    fname: "first_name",
    lastname: "last_name",
    namelast: "last_name",
    last: "last_name",
    lname: "last_name",
    studentid: "student_number",
    studentnumber: "student_number",
    id: "student_number",
    number: "student_number",
    grade: "grade",
    gradecurrentyear: "grade",
    team: "team",
    parent: "guardian_name",
    guardian: "guardian_name",
    guardianname: "guardian_name",
    parentguardian: "guardian_name",
    contact: "guardian_contact",
    parentcontact: "guardian_contact",
    guardiancontact: "guardian_contact",
    email: "guardian_contact",
    phone: "guardian_contact",
    devicetag: "device_asset_tag",
    assettag: "device_asset_tag",
    deviceassettag: "device_asset_tag",
    chromebook: "device_asset_tag"
  };
  return map[key] || null;
}

async function studentsFromCsvFile(file, requireStudentNumber = false) {
  const rows = parseCsv(await file.text());
  if (rows.length < 2) {
    throw new Error("CSV must include a header row and at least one student.");
  }
  const fields = rows[0].map(studentFieldForHeader);
  const students = rows.slice(1).map(row => {
    const student = {};
    fields.forEach((field, index) => {
      if (field) student[field] = row[index] || "";
    });
    return student;
  }).filter(student => student.first_name && student.last_name);

  if (students.length === 0) {
    throw new Error(requireStudentNumber
      ? "No students found. Check first name, last name, and Student Number column headers."
      : "No students found. Check first name and last name column headers.");
  }
  return students;
}

async function importCsv(event) {
  event.preventDefault();
  const file = els.csvImportForm.elements.csv_file.files[0];
  if (!file) return;
  els.csvMessage.textContent = "Reading CSV...";
  let students;
  try {
    students = await studentsFromCsvFile(file);
  } catch (error) {
    els.csvMessage.textContent = error.message;
    return;
  }

  els.csvMessage.textContent = `Importing ${students.length} students...`;
  const result = await api("/api/students/import", {
    method: "POST",
    body: JSON.stringify({ students })
  });
  els.csvImportForm.reset();
  els.studentSearch.value = "";
  await loadBootstrap();
  els.csvMessage.textContent = `${result.created} added, ${result.updated} updated, ${result.skipped} skipped.`;
  if (result.errors?.length) {
    console.warn("CSV import errors", result.errors);
  }
}

function renderArchivedStudents(students, query = "") {
  if (!query.trim()) {
    els.archivedStudentList.innerHTML = `<div class="empty">Search by name or student ID to find archived students.</div>`;
    return;
  }
  els.archivedStudentList.innerHTML = students.length
    ? students.map(student => `
      <article class="list-row">
        <div>
          <h4>${escapeHtml(student.last_name)}, ${escapeHtml(student.first_name)}</h4>
          <div class="meta">
            <span>${student.grade ? `Grade ${escapeHtml(student.grade)}` : "Grade not set"}</span>
            <span>${student.student_number ? `ID ${escapeHtml(student.student_number)}` : "No student ID"}</span>
            <span>${student.archived_at ? `Archived ${escapeHtml(formatDate(student.archived_at))}` : "Archived"}</span>
          </div>
        </div>
        <div class="row-actions">
          <button class="quiet-button" data-student-id="${student.id}">Review</button>
          <button class="primary-button" data-restore-student="${student.id}" data-student-name="${escapeHtml(`${student.first_name} ${student.last_name}`)}">Restore</button>
        </div>
      </article>
    `).join("")
    : `<div class="empty">No archived students matched that search.</div>`;
}

async function searchArchivedStudents() {
  const query = els.archivedStudentSearch.value.trim();
  if (!query) {
    renderArchivedStudents([], query);
    return;
  }
  const students = await api(`/api/students/archived?q=${encodeURIComponent(query)}`);
  renderArchivedStudents(students, query);
}

async function restoreStudent(id, name) {
  const confirmed = window.confirm(`Restore ${name || "this student"} to the active roster?`);
  if (!confirmed) return;
  await api(`/api/students/${id}/restore`, { method: "POST" });
  await loadBootstrap();
  await searchArchivedStudents();
  if (Number(state.selectedStudentId) === Number(id)) {
    await showStudentDetail(id);
  }
}

function previewList(title, items, renderer) {
  const shown = items.slice(0, 8);
  const extra = items.length - shown.length;
  return `
    <div class="preview-list">
      <h4>${escapeHtml(title)} (${items.length})</h4>
      ${shown.length ? shown.map(renderer).join("") : `<div class="empty small">None</div>`}
      ${extra > 0 ? `<div class="meta">+ ${extra} more</div>` : ""}
    </div>
  `;
}

function studentPreviewName(student) {
  return `${student.last_name || ""}, ${student.first_name || ""}${student.student_number ? ` - ID ${student.student_number}` : ""}${student.grade ? ` - Grade ${student.grade}` : ""}`;
}

function renderRolloverPreview(preview) {
  if (!preview) {
    els.rolloverPreview.innerHTML = "";
    els.rolloverApplyButton.disabled = true;
    return;
  }
  const summary = preview.summary;
  els.rolloverApplyButton.disabled = false;
  els.rolloverPreview.innerHTML = `
    <div class="preview-summary">
      <div class="detail-stat"><span>Updates</span><strong>${summary.updates}</strong></div>
      <div class="detail-stat"><span>Reactivations</span><strong>${summary.reactivations}</strong></div>
      <div class="detail-stat"><span>New students</span><strong>${summary.creates}</strong></div>
      <div class="detail-stat"><span>Archive candidates</span><strong>${summary.archiveCandidates}</strong></div>
      <div class="detail-stat"><span>Skipped/errors</span><strong>${summary.skipped}</strong></div>
    </div>
    <div class="preview-grid">
      ${previewList("Returning updates", preview.updates, item => `<div class="meta">${escapeHtml(studentPreviewName(item.incoming))}</div>`)}
      ${previewList("Previously archived to restore", preview.reactivations, item => `<div class="meta">${escapeHtml(studentPreviewName(item.incoming))}</div>`)}
      ${previewList("New students to add", preview.creates, item => `<div class="meta">${escapeHtml(studentPreviewName(item.incoming))}</div>`)}
      ${previewList("Students to archive", preview.archiveCandidates, item => `<div class="meta">${escapeHtml(studentPreviewName(item))}</div>`)}
      ${previewList("Skipped rows", preview.errors, item => `<div class="meta">Row ${escapeHtml(item.row)}: ${escapeHtml(item.error)}</div>`)}
    </div>
  `;
}

async function previewRollover(event) {
  event.preventDefault();
  const file = els.rolloverForm.elements.roster_file.files[0];
  if (!file) return;
  els.rolloverMessage.textContent = "Reading roster...";
  try {
    const students = await studentsFromCsvFile(file, true);
    state.rolloverStudents = students;
    const preview = await api("/api/roster-rollover/preview", {
      method: "POST",
      body: JSON.stringify({
        students,
        schoolYearLabel: els.rolloverForm.elements.school_year_label.value
      })
    });
    state.rolloverPreview = preview;
    renderRolloverPreview(preview);
    els.rolloverMessage.textContent = "Preview ready. Review before applying.";
  } catch (error) {
    state.rolloverStudents = [];
    state.rolloverPreview = null;
    renderRolloverPreview(null);
    els.rolloverMessage.textContent = error.message;
  }
}

async function applyRollover() {
  if (!state.rolloverPreview || !state.rolloverStudents.length) return;
  const phrase = window.prompt("This will start a new school year, archive students missing from the roster, and reset the active term. Type START NEW SCHOOL YEAR to continue.");
  if (phrase !== "START NEW SCHOOL YEAR") return;
  els.rolloverApplyButton.disabled = true;
  els.rolloverMessage.textContent = "Applying rollover...";
  try {
    const result = await api("/api/roster-rollover/apply", {
      method: "POST",
      body: JSON.stringify({
        students: state.rolloverStudents,
        schoolYearLabel: els.rolloverForm.elements.school_year_label.value,
        confirmation: phrase
      })
    });
    state.rolloverPreview = result;
    renderRolloverPreview(result);
    els.rolloverForm.reset();
    state.rolloverStudents = [];
    state.rolloverPreview = null;
    state.selectedStudentId = null;
    els.studentDetail.hidden = true;
    els.studentDetail.innerHTML = "";
    await loadBootstrap();
    els.rolloverMessage.textContent = "New school year rollover applied.";
    els.rolloverApplyButton.disabled = true;
  } catch (error) {
    els.rolloverMessage.textContent = error.message;
  } finally {
    els.rolloverApplyButton.disabled = !state.rolloverPreview;
  }
}

async function createIncident(event) {
  event.preventDefault();
  const formElement = event.currentTarget;
  const submitButton = formElement.querySelector("button[type='submit']");
  updateIncidentStudentOptions();
  if (!formElement.elements.student_id.value) {
    els.incidentStudentSearch.focus();
    els.incidentMessage.textContent = "Choose a student from the matching list.";
    return;
  }
  const form = new FormData(formElement);
  const payload = Object.fromEntries(form.entries());
  submitButton.disabled = true;
  submitButton.textContent = "Saving...";
  els.incidentMessage.textContent = "Saving...";
  try {
    const result = await saveIncidentWithRepeatWarningPrompt(payload);
    if (!result) {
      els.incidentMessage.textContent = "Entry not saved. Review the form and try again.";
      return;
    }
    formElement.reset();
    els.incidentForm.elements.student_id.value = "";
    els.incidentStudentSelect.value = "";
    updateIncidentStudentOptions();
    els.incidentForm.elements.occurred_on.value = today();
    populateReporterEmail();
    renderInfractionOptions();
    updateIncidentEntryTypeUi();
    await loadBootstrap();
    els.incidentMessage.textContent = result.entry_type === "warning"
      ? "Warning saved. It is documented in history and does not count toward the intervention step."
      : "Violation saved. The student's intervention step has been updated.";
    setTimeout(() => { els.incidentMessage.textContent = ""; }, 4000);
  } catch (error) {
    els.incidentMessage.textContent = error.message;
  } finally {
    submitButton.disabled = false;
    updateIncidentEntryTypeUi();
  }
}

function repeatWarningDecision(details) {
  return new Promise(resolve => {
    const dialog = document.createElement("dialog");
    const priorCount = Number(details.priorWarningCount || 1);
    const severity = details.severity === "major" ? "major" : "minor";
    dialog.className = "decision-dialog";
    dialog.innerHTML = `
      <form method="dialog">
        <h3>Previous warning found</h3>
        <p>This student already has ${priorCount} current-term warning${priorCount === 1 ? "" : "s"} for <strong>${escapeHtml(details.infractionLabel || "this type")}</strong>.</p>
        <p>How should this occurrence be recorded?</p>
        <div class="decision-actions">
          <button type="button" class="primary-button" data-warning-decision="violation">Record ${severity} violation</button>
          <button type="button" class="quiet-button" data-warning-decision="warning">Keep as warning</button>
          <button type="button" class="quiet-button" data-warning-decision="back">Go back</button>
        </div>
      </form>
    `;
    const finish = decision => {
      dialog.close();
      dialog.remove();
      resolve(decision);
    };
    dialog.addEventListener("click", event => {
      const button = event.target.closest("[data-warning-decision]");
      if (button) finish(button.dataset.warningDecision);
    });
    dialog.addEventListener("cancel", event => {
      event.preventDefault();
      finish("back");
    });
    document.body.append(dialog);
    dialog.showModal();
  });
}

async function saveIncidentWithRepeatWarningPrompt(payload) {
  try {
    return await api("/api/incidents", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  } catch (error) {
    if (error.code !== "repeat_warning") throw error;
    const decision = await repeatWarningDecision(error.details || {});
    if (decision === "back") return null;
    if (decision === "violation") {
      payload.entry_type = "violation";
    } else {
      payload.confirm_repeat_warning = true;
    }
    return api("/api/incidents", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }
}

function updateIncidentEntryTypeUi() {
  const entryType = els.incidentForm.elements.entry_type.value;
  const submitButton = els.incidentForm.querySelector("button[type='submit']");
  submitButton.textContent = entryType === "warning" ? "Save warning" : "Save violation";
}

async function completeAction(id) {
  const actionRow = document.querySelector(`[data-action-id="${id}"]`);
  const assetTagField = actionRow?.querySelector(`[data-action-asset-tag="${id}"]`);
  const returnDateField = actionRow?.querySelector(`[data-action-return-date="${id}"]`);
  const payload = { status: "complete" };
  if (assetTagField) payload.asset_tag = assetTagField.value.trim();
  if (returnDateField) payload.return_date = returnDateField.value;
  if (assetTagField && !payload.asset_tag) {
    assetTagField.focus();
    window.alert("Enter or scan the asset tag before completing this follow-up.");
    return;
  }
  if (returnDateField && !payload.return_date) {
    returnDateField.focus();
    window.alert("Choose the Chromebook return date before completing this follow-up.");
    return;
  }

  try {
    await api(`/api/actions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
    await loadBootstrap();
    if (state.selectedFollowupStudentId) await showFollowups(state.selectedFollowupStudentId);
    if (state.selectedStudentId) await showStudentDetail(state.selectedStudentId);
  } catch (error) {
    window.alert(error.message);
  }
}

async function cancelIncident(id, entryType = "violation") {
  const label = entryType === "warning" ? "warning" : "violation";
  const reason = window.prompt(`Remove this ${label}? It will remain in the student's history as removed. Enter a reason:`);
  if (reason === null) return;
  if (!reason.trim()) {
    window.alert("Enter a reason before removing the violation.");
    return;
  }
  try {
    await api(`/api/incidents/${id}/cancel`, {
      method: "POST",
      body: JSON.stringify({ reason: reason.trim() })
    });
    await loadBootstrap();
    if (state.selectedFollowupStudentId) await showFollowups(state.selectedFollowupStudentId);
    if (state.selectedStudentId) await showStudentDetail(state.selectedStudentId);
  } catch (error) {
    window.alert(error.message);
  }
}

async function convertIncidentToWarning(id) {
  const reason = window.prompt("Convert this violation to a warning? It will remain in history but stop counting toward intervention steps. Enter a reason:");
  if (reason === null) return;
  if (!reason.trim()) {
    window.alert("Enter a reason before converting the violation.");
    return;
  }
  try {
    await api(`/api/incidents/${id}/convert-to-warning`, {
      method: "POST",
      body: JSON.stringify({ reason: reason.trim() })
    });
    await loadBootstrap();
    if (state.selectedFollowupStudentId) await showFollowups(state.selectedFollowupStudentId);
    if (state.selectedStudentId) await showStudentDetail(state.selectedStudentId);
  } catch (error) {
    window.alert(error.message);
  }
}

async function submitStepAdjustment(form) {
  const studentId = Number(form.dataset.stepAdjustForm);
  const status = form.querySelector("[role='status']");
  const submitButton = form.querySelector("button[type='submit']");
  const originalText = submitButton.textContent;
  submitButton.disabled = true;
  submitButton.textContent = "Saving...";
  status.textContent = "Saving...";
  try {
    const payload = Object.fromEntries(new FormData(form).entries());
    await api(`/api/students/${studentId}/step-adjustments`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    await loadBootstrap();
    if (state.selectedFollowupStudentId === studentId) {
      await showFollowups(studentId);
    } else {
      await showStudentDetail(studentId);
    }
  } catch (error) {
    status.textContent = error.message;
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = originalText;
  }
}

async function exportStudentHistory(button) {
  button.disabled = true;
  button.textContent = "Exporting...";
  try {
    const response = await fetch('/api/students/' + Number(button.dataset.exportHistory) + '/history.pdf');
    if (!response.ok) {
      if (response.status === 401) showLogin("Your session has expired. Sign in again.");
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || "Unable to export student history.");
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] || "Student-Tech-History.pdf";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (error) {
    window.alert(error.message);
  } finally {
    button.disabled = false;
    button.textContent = "Export PDF";
  }
}

function printTemplate(url) {
  const win = window.open(url, "_blank", "noopener");
  if (!win) return;
  win.addEventListener("load", () => win.print(), { once: true });
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function uploadTemplate(event) {
  event.preventDefault();
  const formElement = event.currentTarget;
  const submitButton = formElement.querySelector("button[type='submit']");
  const file = els.templateForm.elements.template_file.files[0];
  if (!file) return;
  const actionType = els.templateForm.elements.action_type.value;
  const label = els.templateForm.elements.action_type.selectedOptions[0].textContent;
  const originalText = submitButton.textContent;
  submitButton.disabled = true;
  submitButton.textContent = "Uploading...";
  els.templateMessage.textContent = "Uploading...";
  try {
    const template = await api("/api/templates", {
      method: "POST",
      body: JSON.stringify({
        action_type: actionType,
        label,
        original_name: file.name,
        mime_type: file.type || "application/octet-stream",
        content_base64: await readFileAsBase64(file)
      })
    });
    state.templates = state.templates.filter(item => item.action_type !== template.action_type).concat(template);
    els.templateForm.reset();
    renderTemplates();
    els.templateMessage.textContent = `${label} form uploaded.`;
    setTimeout(() => { els.templateMessage.textContent = ""; }, 5000);
  } catch (error) {
    els.templateMessage.textContent = error.message;
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = originalText;
  }
}

async function uploadActionDocument(actionId, file) {
  if (!file) return;
  const actionRow = document.querySelector(`[data-action-id="${actionId}"]`);
  const label = actionRow?.querySelector(".upload-button span");
  const originalText = label?.textContent || "Upload Document";
  if (label) label.textContent = "Uploading...";
  try {
    await api(`/api/actions/${actionId}/documents`, {
      method: "POST",
      body: JSON.stringify({
        original_name: file.name,
        mime_type: file.type || "application/octet-stream",
        content_base64: await readFileAsBase64(file)
      })
    });
    if (state.selectedFollowupStudentId) await showFollowups(state.selectedFollowupStudentId);
    if (state.selectedStudentId) await showStudentDetail(state.selectedStudentId);
  } catch (error) {
    window.alert(error.message);
  } finally {
    if (label) label.textContent = originalText;
  }
}

async function deleteTemplate(actionType, label) {
  const confirmed = window.confirm(`Delete the uploaded ${label} form? This cannot be undone.`);
  if (!confirmed) return;
  els.templateMessage.textContent = "Deleting...";
  try {
    await api(`/api/templates/${encodeURIComponent(actionType)}`, {
      method: "DELETE",
      body: JSON.stringify({})
    });
    state.templates = state.templates.filter(template => template.action_type !== actionType);
    renderTemplates();
    els.templateMessage.textContent = `${label} form deleted.`;
    setTimeout(() => { els.templateMessage.textContent = ""; }, 5000);
  } catch (error) {
    els.templateMessage.textContent = error.message;
  }
}

async function deleteStudent(id, name) {
  const confirmed = window.confirm(`Delete ${name} and all related technology history and actions? This cannot be undone.`);
  if (!confirmed) return;
  await api(`/api/students/${id}`, {
    method: "DELETE",
    body: JSON.stringify({})
  });
  state.selectedStudentId = null;
  els.studentDetail.hidden = true;
  els.studentDetail.innerHTML = "";
  await loadBootstrap();
}

async function clearAllStudents() {
  const phrase = window.prompt("This will delete every student plus all warning, violation, and action history. Type DELETE ALL STUDENTS to continue.");
  if (phrase !== "DELETE ALL STUDENTS") return;
  await api("/api/students", {
    method: "DELETE",
    body: JSON.stringify({ confirmation: phrase })
  });
  state.selectedStudentId = null;
  els.studentDetail.hidden = true;
  els.studentDetail.innerHTML = "";
  await loadBootstrap();
}

async function startNewTerm() {
  const phrase = window.prompt("This will move current-term warnings and violations into Previous Terms and reset active counts/follow-ups. Type START NEW TERM to continue.");
  if (phrase !== "START NEW TERM") return;
  const name = window.prompt("Name this new term. Leave blank to use today's date.") || "";
  els.termMessage.textContent = "Starting new term...";
  els.startTermButton.disabled = true;
  try {
    const result = await api("/api/terms/start", {
      method: "POST",
      body: JSON.stringify({ confirmation: phrase, name })
    });
    state.currentTerm = result.currentTerm;
    state.selectedStudentId = null;
    state.selectedFollowupStudentId = null;
    els.studentDetail.hidden = true;
    els.studentDetail.innerHTML = "";
    els.followupsDetail.innerHTML = "";
    await loadBootstrap();
    els.termMessage.textContent = "New term started.";
    setTimeout(() => { els.termMessage.textContent = ""; }, 5000);
  } catch (error) {
    els.termMessage.textContent = error.message;
  } finally {
    els.startTermButton.disabled = false;
  }
}

async function saveNotificationSettings(event) {
  event.preventDefault();
  const submitButton = event.currentTarget.querySelector("button[type='submit']");
  const originalText = submitButton.textContent;
  submitButton.disabled = true;
  submitButton.textContent = "Saving...";
  els.notificationMessage.textContent = "Saving...";
  try {
    const result = await api("/api/settings/notifications", {
      method: "PUT",
      body: JSON.stringify({
        teamEmails: event.currentTarget.elements.team_emails.value
      })
    });
    state.notificationSettings = result;
    renderNotificationSettings();
    els.notificationMessage.textContent = "Recipients saved.";
    setTimeout(() => { els.notificationMessage.textContent = ""; }, 5000);
  } catch (error) {
    els.notificationMessage.textContent = error.message;
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = originalText;
  }
}

async function logout() {
  await api("/api/auth/logout", {
    method: "POST",
    body: JSON.stringify({})
  }).catch(() => {});
  state.currentUser = null;
  showLogin("You have been signed out.");
  if (window.google?.accounts?.id) window.google.accounts.id.disableAutoSelect();
}

document.addEventListener("click", event => {
  const workspaceOption = event.target.closest("[data-workspace-view]");
  if (workspaceOption) {
    const targetView = workspaceOption.dataset.workspaceView;
    switchView(targetView);
    if (targetView === "repairs" && typeof loadRepairWorkspace === "function") loadRepairWorkspace();
    return;
  }

  if (event.target.closest("#workspace-switcher")) {
    if (!els.workspaceSwitcher.disabled) {
      els.workspaceMenu.hidden = !els.workspaceMenu.hidden;
      els.workspaceSwitcher.setAttribute("aria-expanded", String(!els.workspaceMenu.hidden));
    }
    return;
  }

  if (!event.target.closest("#workspace-menu")) {
    els.workspaceMenu.hidden = true;
    els.workspaceSwitcher.setAttribute("aria-expanded", "false");
  }

  const nav = event.target.closest("[data-view]");
  if (nav) switchView(nav.dataset.view);

  const openView = event.target.closest("[data-open-view]");
  if (openView) switchView(openView.dataset.openView);

  const studentButton = event.target.closest("[data-student-id]");
  if (studentButton) {
    switchView("students");
    showStudentDetail(Number(studentButton.dataset.studentId));
  }

  const completeButton = event.target.closest("[data-complete-action]");
  if (completeButton) completeAction(Number(completeButton.dataset.completeAction));

  const cancelIncidentButton = event.target.closest("[data-cancel-incident]");
  if (cancelIncidentButton) {
    cancelIncident(Number(cancelIncidentButton.dataset.cancelIncident), cancelIncidentButton.dataset.entryType);
  }

  const convertIncidentButton = event.target.closest("[data-convert-incident]");
  if (convertIncidentButton) convertIncidentToWarning(Number(convertIncidentButton.dataset.convertIncident));

  const adjustStepButton = event.target.closest("[data-toggle-step-adjust]");
  if (adjustStepButton) {
    const form = document.querySelector(`[data-step-adjust-form="${adjustStepButton.dataset.toggleStepAdjust}"]`);
    if (form) form.hidden = !form.hidden;
  }

  const followupButton = event.target.closest("[data-followup-student-id]");
  if (followupButton) showFollowups(Number(followupButton.dataset.followupStudentId));

  const exportButton = event.target.closest("[data-export-history]");
  if (exportButton) void exportStudentHistory(exportButton);

  const printButton = event.target.closest("[data-print-template]");
  if (printButton) printTemplate(printButton.dataset.printTemplate);

  const deleteTemplateButton = event.target.closest("[data-delete-template]");
  if (deleteTemplateButton) {
    deleteTemplate(deleteTemplateButton.dataset.deleteTemplate, deleteTemplateButton.dataset.templateLabel);
  }

  const statusButton = event.target.closest("[data-status-key]");
  if (statusButton) renderStatusStudents(statusButton.dataset.statusKey);

  const deleteStudentButton = event.target.closest("[data-delete-student]");
  if (deleteStudentButton) {
    deleteStudent(Number(deleteStudentButton.dataset.deleteStudent), deleteStudentButton.dataset.studentName);
  }

  const restoreStudentButton = event.target.closest("[data-restore-student]");
  if (restoreStudentButton) {
    restoreStudent(Number(restoreStudentButton.dataset.restoreStudent), restoreStudentButton.dataset.studentName);
  }

  const editInfractionButton = event.target.closest("[data-edit-infraction]");
  if (editInfractionButton) {
    toggleInfractionEdit(Number(editInfractionButton.dataset.editInfraction), true);
  }

  const cancelInfractionEditButton = event.target.closest("[data-cancel-infraction-edit]");
  if (cancelInfractionEditButton) {
    toggleInfractionEdit(Number(cancelInfractionEditButton.dataset.cancelInfractionEdit), false);
  }

  const retireInfractionButton = event.target.closest("[data-retire-infraction]");
  if (retireInfractionButton) {
    retireInfractionType(Number(retireInfractionButton.dataset.retireInfraction), retireInfractionButton.dataset.infractionLabel);
  }

  const saveStaffButton = event.target.closest("[data-save-staff]");
  if (saveStaffButton) saveStaffAccess(saveStaffButton.dataset.saveStaff, saveStaffButton);

  const teacherStudentButton = event.target.closest("[data-teacher-student-id]");
  if (teacherStudentButton) showTeacherStudentDetail(Number(teacherStudentButton.dataset.teacherStudentId));

  if (event.target.closest("[data-close-teacher-dialog]")) els.teacherStudentDialog.close();
});

document.addEventListener("change", event => {
  const documentInput = event.target.closest("[data-document-file]");
  if (documentInput) {
    uploadActionDocument(Number(documentInput.dataset.documentFile), documentInput.files[0]);
    documentInput.value = "";
  }
});

document.addEventListener("submit", event => {
  const infractionEditForm = event.target.closest("[data-infraction-edit-form]");
  if (infractionEditForm) {
    event.preventDefault();
    updateInfractionType(infractionEditForm);
  }

  const form = event.target.closest("[data-step-adjust-form]");
  if (form) {
    event.preventDefault();
    submitStepAdjustment(form);
  }
});

els.incidentForm.addEventListener("submit", createIncident);
els.studentForm.addEventListener("submit", createStudent);
els.csvImportForm.addEventListener("submit", importCsv);
els.rolloverForm.addEventListener("submit", previewRollover);
els.rolloverApplyButton.addEventListener("click", applyRollover);
els.studentSearch.addEventListener("input", handleStudentSearch);
els.archivedStudentSearch.addEventListener("input", searchArchivedStudents);
els.clearStudentsButton.addEventListener("click", clearAllStudents);
els.startTermButton.addEventListener("click", startNewTerm);
els.notificationForm.addEventListener("submit", saveNotificationSettings);
els.infractionTypeForm.addEventListener("submit", createInfractionType);
els.templateForm.addEventListener("submit", uploadTemplate);
els.staffAccessForm.addEventListener("submit", addStaffAccess);
els.logoutButton.addEventListener("click", logout);
els.teacherStudentSearch.addEventListener("input", renderTeacherDashboard);
els.teacherGradeFilters.forEach(input => input.addEventListener("change", renderTeacherDashboard));
els.teacherStudentDialog.addEventListener("click", event => {
  if (event.target === els.teacherStudentDialog) els.teacherStudentDialog.close();
});
els.incidentForm.addEventListener("change", event => {
  if (event.target.name === "severity") renderInfractionOptions();
  if (event.target.name === "entry_type") updateIncidentEntryTypeUi();
  if (event.target.name === "infraction_type_id") renderIncidentHistorySummary();
});
els.incidentStudentSearch.addEventListener("input", updateIncidentStudentOptions);
els.incidentStudentSearch.addEventListener("change", updateIncidentStudentOptions);
els.incidentStudentSelect.addEventListener("change", event => {
  selectIncidentStudent(event.target.value);
});

els.incidentForm.elements.occurred_on.value = today();
updateIncidentEntryTypeUi();
loadAuth().catch(error => {
  document.body.innerHTML = `<main class="content"><div class="panel"><h2>Unable to start</h2><p>${escapeHtml(error.message)}</p></div></main>`;
});
