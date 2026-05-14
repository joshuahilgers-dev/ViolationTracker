const state = {
  students: [],
  infractionTypes: [],
  openActions: [],
  selectedStudentId: null
};

const statusOrder = ["admin_review", "device_restriction", "success_contract", "reflection", "monitor"];
const statusLabels = {
  monitor: "Monitor",
  reflection: "Digital Impact Reflection",
  success_contract: "Technology Success Contract",
  device_restriction: "5 school-day restriction",
  admin_review: "Admin review"
};

const els = {
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
  studentList: document.querySelector("#student-list"),
  studentSearch: document.querySelector("#student-search"),
  studentDetail: document.querySelector("#student-detail"),
  actionList: document.querySelector("#action-list"),
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
  if (!response.ok) throw new Error(body.error || "Request failed");
  return body;
}

async function loadBootstrap() {
  const data = await api("/api/bootstrap");
  state.students = data.students;
  state.infractionTypes = data.infractionTypes;
  state.openActions = data.openActions;
  renderAll();
}

function renderAll() {
  renderMetrics();
  renderStudentOptions();
  renderInfractionOptions();
  renderDashboardActions();
  renderStatusGroups();
  renderStudents();
  renderActions();
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
    .map(type => `<option value="${type.id}">${escapeHtml(type.category)}: ${escapeHtml(type.label)}</option>`);
  select.innerHTML = options.join("");
}

function renderDashboardActions() {
  const actions = state.openActions.slice(0, 6);
  els.dashboardActions.innerHTML = actions.length
    ? actions.map(actionCard).join("")
    : `<div class="empty">No open follow-ups right now.</div>`;
}

function renderStatusGroups() {
  els.statusGroups.innerHTML = statusOrder.map(key => {
    const students = state.students.filter(student => student.status.key === key);
    return `
      <div class="status-group">
        <h4><span class="badge ${key}">${statusLabels[key]}</span> ${students.length}</h4>
        <div class="meta">${students.slice(0, 5).map(student => escapeHtml(`${student.first_name} ${student.last_name}`)).join(" | ") || "No students"}</div>
      </div>
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
  els.actionList.innerHTML = state.openActions.length
    ? state.openActions.map(actionCard).join("")
    : `<div class="empty">No open follow-ups right now.</div>`;
}

function actionCard(action) {
  const studentName = action.student_name || `${action.first_name || ""} ${action.last_name || ""}`.trim();
  return `
    <article class="action-row">
      <div>
        <h4>${escapeHtml(action.title)}</h4>
        <div class="meta">
          <span>${escapeHtml(studentName)}</span>
          <span>Owner: ${escapeHtml(action.owner || "Unassigned")}</span>
          <span>Due: ${escapeHtml(action.due_on || "No date")}</span>
        </div>
        ${action.notes ? `<div class="meta">${escapeHtml(action.notes)}</div>` : ""}
      </div>
      <button class="quiet-button" data-complete-action="${action.id}">Complete</button>
    </article>
  `;
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
      <span class="badge ${student.status.key}">${escapeHtml(student.status.label)}</span>
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
  const form = new FormData(event.currentTarget);
  const payload = Object.fromEntries(form.entries());
  await api("/api/students", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  event.currentTarget.reset();
  await loadBootstrap();
}

async function createIncident(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const payload = Object.fromEntries(form.entries());
  await api("/api/incidents", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  els.incidentMessage.textContent = "Saved. Next steps were queued.";
  event.currentTarget.reset();
  els.incidentForm.elements.occurred_on.value = today();
  renderInfractionOptions();
  await loadBootstrap();
  setTimeout(() => { els.incidentMessage.textContent = ""; }, 4000);
}

async function completeAction(id) {
  await api(`/api/actions/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "complete" })
  });
  await loadBootstrap();
  if (state.selectedStudentId) await showStudentDetail(state.selectedStudentId);
}

document.addEventListener("click", event => {
  const nav = event.target.closest("[data-view]");
  if (nav) switchView(nav.dataset.view);

  const openView = event.target.closest("[data-open-view]");
  if (openView) switchView(openView.dataset.openView);

  const studentButton = event.target.closest("[data-student-id]");
  if (studentButton) showStudentDetail(Number(studentButton.dataset.studentId));

  const completeButton = event.target.closest("[data-complete-action]");
  if (completeButton) completeAction(Number(completeButton.dataset.completeAction));
});

els.incidentForm.addEventListener("submit", createIncident);
els.studentForm.addEventListener("submit", createStudent);
els.studentSearch.addEventListener("input", renderStudents);
els.incidentForm.addEventListener("change", event => {
  if (event.target.name === "severity") renderInfractionOptions();
});

els.incidentForm.elements.occurred_on.value = today();
loadBootstrap().catch(error => {
  document.body.innerHTML = `<main class="content"><div class="panel"><h2>Unable to start</h2><p>${escapeHtml(error.message)}</p></div></main>`;
});
