const state = {
  authConfig: null,
  currentUser: null,
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
  studentForm: document.querySelector("#student-form"),
  studentMessage: document.querySelector("#student-message"),
  csvImportForm: document.querySelector("#csv-import-form"),
  csvMessage: document.querySelector("#csv-message"),
  studentList: document.querySelector("#student-list"),
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
  infractionSettings: document.querySelector("#infraction-settings")
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
  const select = els.incidentForm.elements.student_id;
  const previous = select.value;
  select.innerHTML = [
    `<option value="">Select student</option>`,
    ...state.students.map(student => (
      `<option value="${student.id}">${escapeHtml(student.last_name)}, ${escapeHtml(student.first_name)}${student.grade ? ` - Grade ${escapeHtml(student.grade)}` : ""}</option>`
    ))
  ].join("");
  select.value = previous;
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

function renderStatusGroups() {
  els.statusGroups.innerHTML = statusOrder.map(key => {
    const students = state.students.filter(student => student.status.key === key);
    return `
      <button class="status-group status-group-button" type="button" data-status-key="${key}">
        <h4><span class="badge ${key}">${statusLabels[key]}</span> ${students.length}</h4>
        <div class="meta">${escapeHtml(students.length === 1 ? "1 student" : `${students.length} students`)}</div>
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
      <button class="primary-button" data-followup-student-id="${group.student_id}">Complete</button>
    </article>
  `;
}

function actionCard(action) {
  const template = templateForAction(action.action_type);
  return `
    <article class="action-row">
      <div>
        <h4>${escapeHtml(action.title)}</h4>
        <div class="meta">
          <span>Owner: ${escapeHtml(action.owner || "Unassigned")}</span>
          <span>Due: ${escapeHtml(action.due_on || "No date")}</span>
        </div>
        ${action.notes ? `<div class="meta">${escapeHtml(action.notes)}</div>` : ""}
      </div>
      <div class="row-actions">
        ${template ? `<button class="quiet-button" data-print-template="${escapeHtml(template.url)}">Print</button>` : ""}
        <button class="quiet-button" data-complete-action="${action.id}">Complete</button>
      </div>
    </article>
  `;
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
  const students = state.students.filter(student => student.status.key === key);
  els.statusTitle.textContent = statusLabels[key] || "Current Step";
  els.statusSubtitle.textContent = students.length === 1 ? "1 student currently in this step." : `${students.length} students currently in this step.`;
  els.statusStudentList.innerHTML = students.length
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
    : `<div class="empty">No students currently in this step.</div>`;
  switchView("status");
}

async function showFollowups(studentId) {
  const student = await api(`/api/students/${studentId}`);
  state.selectedFollowupStudentId = studentId;
  const openActions = student.actions.filter(action => action.status === "open");
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
        <button class="quiet-button" data-student-id="${student.id}">Open student record</button>
      </div>
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
  const openActions = student.actions.filter(action => action.status === "open");
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
    <h4 class="section-title">Violation History</h4>
    <div class="timeline">
      ${student.incidents.length ? student.incidents.map(incident => `
        <article class="incident-row">
          <h4>${escapeHtml(incident.occurred_on)}: ${escapeHtml(incident.severity)} - ${escapeHtml(incident.infraction_label || "Uncategorized")}</h4>
          <div class="meta">
            <span>Reported by ${escapeHtml(incident.reported_by)}</span>
            ${incident.class_period ? `<span>Period ${escapeHtml(incident.class_period)}</span>` : ""}
            ${incident.category ? `<span>${escapeHtml(incident.category)}</span>` : ""}
          </div>
          ${incident.notes ? `<p>${escapeHtml(incident.notes)}</p>` : ""}
        </article>
      `).join("") : `<div class="empty">No violations recorded.</div>`}
    </div>
  `;
  els.studentDetail.scrollIntoView({ behavior: "smooth", block: "start" });
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
    first: "first_name",
    fname: "first_name",
    lastname: "last_name",
    last: "last_name",
    lname: "last_name",
    studentid: "student_number",
    studentnumber: "student_number",
    id: "student_number",
    number: "student_number",
    grade: "grade",
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
  await api(`/api/actions/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "complete" })
  });
  await loadBootstrap();
  if (state.selectedFollowupStudentId) await showFollowups(state.selectedFollowupStudentId);
  if (state.selectedStudentId) await showStudentDetail(state.selectedStudentId);
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

els.incidentForm.addEventListener("submit", createIncident);
els.studentForm.addEventListener("submit", createStudent);
els.csvImportForm.addEventListener("submit", importCsv);
els.studentSearch.addEventListener("input", renderStudents);
els.clearStudentsButton.addEventListener("click", clearAllStudents);
els.templateForm.addEventListener("submit", uploadTemplate);
els.logoutButton.addEventListener("click", logout);
els.incidentForm.addEventListener("change", event => {
  if (event.target.name === "severity") renderInfractionOptions();
});

els.incidentForm.elements.occurred_on.value = today();
loadAuth().catch(error => {
  document.body.innerHTML = `<main class="content"><div class="panel"><h2>Unable to start</h2><p>${escapeHtml(error.message)}</p></div></main>`;
});
