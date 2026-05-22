const state = {
  authConfig: null,
  currentUser: null,
  currentTerm: null,
  notificationSettings: null,
  students: [],
  infractionTypes: [],
  templates: [],
  openActions: [],
  selectedStudentId: null,
  selectedFollowupStudentId: null,
  selectedStatusKey: null
};

const statusOrder = ["admin_review", "device_restriction", "success_contract", "reflection", "monitor"];
const statusLabels = {
  no_violations: "No violations",
  monitor: "Monitor",
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
  logoutButton: document.querySelector("#logout-button"),
  navButtons: document.querySelectorAll(".nav-button"),
  views: document.querySelectorAll(".view"),
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
  studentForm: document.querySelector("#student-form"),
  studentMessage: document.querySelector("#student-message"),
  csvImportForm: document.querySelector("#csv-import-form"),
  csvMessage: document.querySelector("#csv-message"),
  studentList: document.querySelector("#student-list"),
  studentListPanel: document.querySelector("#student-list-panel"),
  studentSearch: document.querySelector("#student-search"),
  studentDetail: document.querySelector("#student-detail"),
  clearStudentsButton: document.querySelector("#clear-students-button"),
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
  currentTermLabel: document.querySelector("#current-term-label"),
  termMessage: document.querySelector("#term-message"),
  startTermButton: document.querySelector("#start-term-button"),
  notificationForm: document.querySelector("#notification-form"),
  notificationMessage: document.querySelector("#notification-message"),
  notificationStatus: document.querySelector("#notification-status")
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
  if (!response.ok) throw new Error(body.error || "Request failed");
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
  populateReporterEmail();
}

async function loadAuth() {
  state.authConfig = await api("/api/auth/config");
  try {
    const { user } = await api("/api/auth/me");
    showApp(user);
    await loadBootstrap();
    return;
  } catch {
    showLogin();
  }

  if (state.authConfig.authDisabled) {
    const { user } = await api("/api/auth/me");
    showApp(user);
    await loadBootstrap();
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
    await loadBootstrap();
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
  renderAll();
  populateReporterEmail();
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
  renderActions();
  renderTemplates();
  renderInfractionSettings();
  renderTermSettings();
  renderNotificationSettings();
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
  els.navButtons.forEach(button => {
    button.classList.toggle("active", button.dataset.view === name);
  });
  els.views.forEach(view => {
    view.classList.toggle("active", view.id === `${name}-view`);
  });
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
}

function selectIncidentStudent(studentId) {
  const selected = state.students.find(student => String(student.id) === String(studentId));
  els.incidentForm.elements.student_id.value = selected ? selected.id : "";
  els.incidentStudentSearch.value = selected ? studentOptionLabel(selected) : "";
  els.incidentStudentSelect.value = selected ? String(selected.id) : "";
  updateIncidentStudentOptions();
}

function renderInfractionOptions() {
  const severity = els.incidentForm.elements.severity.value;
  const select = els.incidentForm.elements.infraction_type_id;
  const options = state.infractionTypes
    .filter(type => type.severity === severity)
    .map(type => `<option value="${type.id}">${escapeHtml(type.label)}</option>`);
  select.innerHTML = options.join("");
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

function latestIncidentIdForStatus(key) {
  return state.students
    .filter(student => student.status.key === key)
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
    const students = state.students.filter(student => student.status.key === key);
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
        ${group.incident_id ? `<button class="danger-button" data-cancel-incident="${group.incident_id}">Cancel Entry</button>` : ""}
        <button class="primary-button" data-followup-student-id="${group.student_id}">Review</button>
      </div>
    </article>
  `;
}

function actionCard(action) {
  const template = templateForAction(action.action_type);
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
        <label class="upload-button">
          <span>Upload Document</span>
          <input type="file" data-document-file="${action.id}" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg">
        </label>
        <button class="quiet-button" data-complete-action="${action.id}">Complete</button>
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
  const groups = state.infractionTypes.reduce((acc, type) => {
    const key = `${type.severity}|${type.category}`;
    acc[key] ||= [];
    acc[key].push(type);
    return acc;
  }, {});

  els.infractionSettings.innerHTML = Object.entries(groups).map(([key, items]) => {
    const [severity, category] = key.split("|");
    return `
      <div class="type-group">
        <h4>${escapeHtml(category)} <span class="badge ${severity === "minor" ? "monitor" : "admin_review"}">${severity}</span></h4>
        <ul>
          ${items.map(item => `<li>${escapeHtml(item.label)}</li>`).join("")}
        </ul>
      </div>
    `;
  }).join("");
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
  const students = state.students.filter(student => student.status.key === key);
  els.statusTitle.textContent = statusLabels[key] || "Current Step";
  els.statusSubtitle.textContent = students.length === 1 ? "1 student currently in this step." : `${students.length} students currently in this step.`;
  els.statusStudentList.innerHTML = students.length
    ? students.map(student => statusStudentRow(student, key)).join("")
    : `<div class="empty">No students currently in this step.</div>`;
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
        </div>
      </div>
      <div class="row-actions">
        ${returnBadge}
        <button class="quiet-button" data-student-id="${student.id}">Review</button>
      </div>
    </article>
  `;
}

function incidentRows(incidents) {
  return incidents.length ? incidents.map(incident => `
    <article class="incident-row ${incident.canceled_at ? "canceled" : ""}">
      <h4>
        ${escapeHtml(incident.occurred_on)}: ${escapeHtml(incident.severity)} - ${escapeHtml(incident.infraction_label || "Uncategorized")}
        ${incident.canceled_at ? `<span class="canceled-badge">Canceled</span>` : ""}
      </h4>
      <div class="meta">
        <span>Reported by ${escapeHtml(incident.reported_by)}</span>
        ${incident.class_period ? `<span>Period ${escapeHtml(incident.class_period)}</span>` : ""}
        ${incident.category ? `<span>${escapeHtml(incident.category)}</span>` : ""}
        ${incident.term_name ? `<span>${escapeHtml(incident.term_name)}</span>` : ""}
        ${incident.canceled_by ? `<span>Canceled by ${escapeHtml(incident.canceled_by)}</span>` : ""}
      </div>
      ${incident.notes ? `<p>${escapeHtml(incident.notes)}</p>` : ""}
      ${incident.canceled_reason ? `<p>${escapeHtml(incident.canceled_reason)}</p>` : ""}
    </article>
  `).join("") : `<div class="empty">No violations recorded.</div>`;
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
  const student = await api(`/api/students/${id}`);
  state.selectedStudentId = id;
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
          <span>${student.device_asset_tag ? `Device ${escapeHtml(student.device_asset_tag)}` : "No device tag"}</span>
        </div>
      </div>
      <div class="detail-actions">
        <span class="badge ${student.status.key}">${escapeHtml(student.status.label)}</span>
        <button class="danger-button" data-delete-student="${student.id}" data-student-name="${escapeHtml(`${student.first_name} ${student.last_name}`)}">Delete student</button>
      </div>
    </div>
    <div class="detail-grid">
      <div class="detail-stat"><span>Total violations</span><strong>${Number(student.counts.total_count || 0)}</strong></div>
      <div class="detail-stat"><span>Minor</span><strong>${Number(student.counts.minor_count || 0)}</strong></div>
      <div class="detail-stat"><span>Major</span><strong>${Number(student.counts.major_count || 0)}</strong></div>
      <div class="detail-stat"><span>Parent/guardian</span><strong>${escapeHtml(student.guardian_name || "Not set")}</strong></div>
      <div class="detail-stat"><span>Contact</span><strong>${escapeHtml(student.guardian_contact || "Not set")}</strong></div>
      <div class="detail-stat"><span>Current step</span><strong>${escapeHtml(student.status.description)}</strong></div>
    </div>
    <h4 class="section-title">Open Follow-Ups</h4>
    <div class="timeline">
      ${openActions.length ? openActions.map(actionCard).join("") : `<div class="empty">No open follow-ups for this student.</div>`}
    </div>
    <h4 class="section-title">Violation History: Current Term</h4>
    <div class="timeline">
      ${incidentRows(currentIncidents)}
    </div>
    <h4 class="section-title">Administrative Step Adjustments: Current Term</h4>
    <div class="timeline">
      ${adjustmentRows(currentAdjustments)}
    </div>
    <details class="history-details">
      <summary>Violation History: Previous Terms (${previousIncidents.length})</summary>
      <div class="timeline">
        ${incidentRows(previousIncidents)}
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

async function importCsv(event) {
  event.preventDefault();
  const file = els.csvImportForm.elements.csv_file.files[0];
  if (!file) return;
  els.csvMessage.textContent = "Reading CSV...";
  const rows = parseCsv(await file.text());
  if (rows.length < 2) {
    els.csvMessage.textContent = "CSV must include a header row and at least one student.";
    return;
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
    els.csvMessage.textContent = "No students found. Check first name and last name column headers.";
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
  const originalText = submitButton.textContent;
  submitButton.disabled = true;
  submitButton.textContent = "Saving...";
  els.incidentMessage.textContent = "Saving...";
  try {
    await api("/api/incidents", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    formElement.reset();
    els.incidentForm.elements.student_id.value = "";
    els.incidentStudentSelect.value = "";
    updateIncidentStudentOptions();
    els.incidentForm.elements.occurred_on.value = today();
    populateReporterEmail();
    renderInfractionOptions();
    await loadBootstrap();
    els.incidentMessage.textContent = "Saved. Next steps were queued.";
    setTimeout(() => { els.incidentMessage.textContent = ""; }, 4000);
  } catch (error) {
    els.incidentMessage.textContent = error.message;
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = originalText;
  }
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

async function cancelIncident(id) {
  const reason = window.prompt("Cancel this violation entry? It will stay in the student history but will no longer count toward steps. Optional reason:");
  if (reason === null) return;
  await api(`/api/incidents/${id}/cancel`, {
    method: "POST",
    body: JSON.stringify({ reason })
  });
  await loadBootstrap();
  if (state.selectedFollowupStudentId) await showFollowups(state.selectedFollowupStudentId);
  if (state.selectedStudentId) await showStudentDetail(state.selectedStudentId);
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
  const confirmed = window.confirm(`Delete ${name} and all related violations/actions? This cannot be undone.`);
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
  const phrase = window.prompt("This will delete every student plus all violation history and action items. Type DELETE ALL STUDENTS to continue.");
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
  const phrase = window.prompt("This will move current-term violations into Previous Terms and reset active counts/follow-ups. Type START NEW TERM to continue.");
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
  if (cancelIncidentButton) cancelIncident(Number(cancelIncidentButton.dataset.cancelIncident));

  const adjustStepButton = event.target.closest("[data-toggle-step-adjust]");
  if (adjustStepButton) {
    const form = els.studentDetail.querySelector(`[data-step-adjust-form="${adjustStepButton.dataset.toggleStepAdjust}"]`);
    if (form) form.hidden = !form.hidden;
  }

  const followupButton = event.target.closest("[data-followup-student-id]");
  if (followupButton) showFollowups(Number(followupButton.dataset.followupStudentId));

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
});

document.addEventListener("change", event => {
  const documentInput = event.target.closest("[data-document-file]");
  if (documentInput) {
    uploadActionDocument(Number(documentInput.dataset.documentFile), documentInput.files[0]);
    documentInput.value = "";
  }
});

document.addEventListener("submit", event => {
  const form = event.target.closest("[data-step-adjust-form]");
  if (form) {
    event.preventDefault();
    submitStepAdjustment(form);
  }
});

els.incidentForm.addEventListener("submit", createIncident);
els.studentForm.addEventListener("submit", createStudent);
els.csvImportForm.addEventListener("submit", importCsv);
els.studentSearch.addEventListener("input", handleStudentSearch);
els.clearStudentsButton.addEventListener("click", clearAllStudents);
els.startTermButton.addEventListener("click", startNewTerm);
els.notificationForm.addEventListener("submit", saveNotificationSettings);
els.templateForm.addEventListener("submit", uploadTemplate);
els.logoutButton.addEventListener("click", logout);
els.incidentForm.addEventListener("change", event => {
  if (event.target.name === "severity") renderInfractionOptions();
});
els.incidentStudentSearch.addEventListener("input", updateIncidentStudentOptions);
els.incidentStudentSearch.addEventListener("change", updateIncidentStudentOptions);
els.incidentStudentSelect.addEventListener("change", event => {
  selectIncidentStudent(event.target.value);
});

els.incidentForm.elements.occurred_on.value = today();
loadAuth().catch(error => {
  document.body.innerHTML = `<main class="content"><div class="panel"><h2>Unable to start</h2><p>${escapeHtml(error.message)}</p></div></main>`;
});
