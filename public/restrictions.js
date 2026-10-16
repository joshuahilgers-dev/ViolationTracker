function restrictionCard(item, editable = false) {
  const active = ["active", "scheduled"].includes(item.state);
  return `<article class="restriction-card">
    <div class="panel-heading"><strong>${escapeHtml(item.label)}</strong><span class="badge">${escapeHtml(item.state)}</span></div>
    ${item.first_name ? `<button type="button" class="quiet-button" data-${state.currentUser?.role === "teacher" ? "teacher-student-id" : "student-id"}="${item.student_id}">${escapeHtml(`${item.first_name} ${item.last_name}`)}</button><span class="meta"> Grade ${escapeHtml(item.grade || "Not set")}</span>` : ""}
    <p class="meta">Effective ${escapeHtml(formatDate(item.starts_on))} · ${item.ends_on ? `Through ${escapeHtml(formatDate(item.ends_on))} (inclusive)` : "Until manually ended"}</p>
    <p class="restriction-notes">${escapeHtml(item.notes || "No notes added.")}</p>
    ${item.ended_at ? `<p>Ended by ${escapeHtml(item.ended_by)}: ${escapeHtml(item.ended_reason)}</p>` : ""}
    ${item.removed_at ? `<p>Removed by ${escapeHtml(item.removed_by)}: ${escapeHtml(item.removed_reason)}</p>` : ""}
    ${editable && item.state !== "removed" ? `<div class="form-actions">
      ${active ? `<button type="button" class="quiet-button" data-restriction-edit="${item.id}">Edit</button><button type="button" class="quiet-button" data-restriction-end="${item.id}">End restriction</button>` : ""}
      <button type="button" class="danger-button" data-restriction-remove="${item.id}">Remove incorrect entry</button></div>` : ""}
  </article>`;
}

function updateRestrictionForm(entryType) {
  const form = els.incidentForm;
  const enabled = entryType === "restriction";
  if (!form.querySelector("#restriction-fields")) {
    const block = document.createElement("div");
    block.id = "restriction-fields";
    block.className = "restriction-fields full-width";
    block.innerHTML = `<label>Restriction type<select name="restriction_type_id" required></select></label>
      <label>End date <span class="optional-label">optional; inclusive</span><input type="date" name="ends_on"><small>Leave blank for “Until manually ended.”</small></label>`;
    form.querySelector("textarea[name=notes]").closest("label").before(block);
  }
  form.querySelector("#restriction-fields").hidden = !enabled;
  for (const name of ["severity", "infraction_type_id", "reported_by", "class_period"]) {
    for (const field of form.querySelectorAll(`[name="${name}"]`)) {
      (name === "severity" ? field.closest("fieldset") : field.closest("label")).hidden = enabled;
      field.disabled = enabled;
    }
  }
  form.elements.restriction_type_id.disabled = !enabled;
  form.elements.ends_on.disabled = !enabled;
  const notesLabel = form.elements.notes.closest("label");
  notesLabel.firstChild.textContent = enabled ? "Notes — visible to teachers" : "Notes";
  const dateLabel = form.elements.occurred_on.closest("label");
  dateLabel.firstChild.textContent = enabled ? "Effective date" : "Date";
  form.querySelector("button[type=submit]").textContent = enabled ? "Save restriction" : entryType === "warning" ? "Save warning" : "Save violation";
}

function restrictionOptions(selected = "", includeRetired = false) {
  return (state.restrictionTypes || []).filter(type => type.active || (includeRetired && String(type.id) === String(selected)))
    .map(type => `<option value="${type.id}" ${String(type.id) === String(selected) ? "selected" : ""}>${escapeHtml(type.label)}${type.active ? "" : " (retired)"}</option>`).join("");
}

function renderRestrictionWorkspace() {
  const select = els.incidentForm.elements.restriction_type_id;
  if (select) {
    const selected = select.value;
    select.innerHTML = `<option value="">Select restriction type</option>${restrictionOptions(selected)}`;
  }
  let row = document.querySelector("#dashboard-restrictions");
  if (!row) {
    row = document.createElement("section"); row.id = "dashboard-restrictions"; row.className = "panel restriction-dashboard-row";
    document.querySelector("#dashboard-view .split-layout").after(row);
  }
  const active = (state.restrictions || []).filter(item => item.state === "active");
  const groups = new Map();
  for (const item of active) {
    if (!groups.has(item.restriction_type_id)) groups.set(item.restriction_type_id, { label: item.label, students: new Set() });
    groups.get(item.restriction_type_id).students.add(item.student_id);
  }
  row.innerHTML = `<h3>Restrictions</h3><p class="panel-note">Additional access and usage restrictions</p><div class="restriction-summary">
    <button class="quiet-button" data-restriction-filter="">Students with active restrictions <strong>${new Set(active.map(item => item.student_id)).size}</strong></button>
    ${[...groups].map(([id, group]) => `<button class="quiet-button" data-restriction-filter="${id}">${escapeHtml(group.label)} <strong>${group.students.size}</strong></button>`).join("")}</div>`;
  const filter = document.querySelector("#restriction-filter");
  const selected = filter.value;
  const allGroups = new Map((state.restrictions || []).map(item => [String(item.restriction_type_id), item.label]));
  filter.innerHTML = `<option value="">All restriction types</option>${[...allGroups].map(([id, label]) => `<option value="${id}">${escapeHtml(label)}</option>`).join("")}`;
  filter.value = allGroups.has(selected) ? selected : "";
  renderRestrictionManagement();
  renderRestrictionSettings();
}

function renderRestrictionManagement() {
  const type = document.querySelector("#restriction-filter").value;
  const items = (state.restrictions || []).filter(item => !type || String(item.restriction_type_id) === type);
  const current = items.filter(item => ["active", "scheduled"].includes(item.state));
  const past = items.filter(item => !["active", "scheduled"].includes(item.state));
  document.querySelector("#restriction-management").innerHTML = `<h3>Active and scheduled restrictions</h3>
    ${current.map(item => restrictionCard(item, true)).join("") || '<div class="empty">No active or scheduled restrictions.</div>'}
    <details><summary>Ended, expired, and removed history (${past.length})</summary>${past.map(item => restrictionCard(item, true)).join("")}</details>`;
}

function renderTeacherRestrictions() {
  const query = els.teacherStudentSearch.value.trim().toLowerCase();
  const grades = new Set([...els.teacherGradeFilters].filter(input => input.checked).map(input => input.value));
  const items = (state.restrictions || []).filter(item => item.state === "active"
    && grades.has(String(Number(String(item.grade || "").match(/\d+/)?.[0] || 0)))
    && `${item.first_name} ${item.last_name} ${item.last_name}, ${item.first_name} ${item.grade || ""}`.toLowerCase().includes(query));
  const groups = new Map();
  for (const item of items) {
    if (!groups.has(item.restriction_type_id)) groups.set(item.restriction_type_id, []);
    groups.get(item.restriction_type_id).push(item);
  }
  document.querySelector("#teacher-restrictions").innerHTML = [...groups.values()].map(group => `<section class="panel restriction-group"><h3>${escapeHtml(group[0].label)} (${group.length})</h3>${group.map(item => restrictionCard(item)).join("")}</section>`).join("")
    || '<div class="empty">No active restrictions match the selected search and grade filters.</div>';
}

function renderRestrictionSettings() {
  let panel = document.querySelector("#restriction-settings");
  if (!panel) {
    panel = document.createElement("section"); panel.id = "restriction-settings"; panel.className = "panel restriction-settings";
    document.querySelector("#infraction-settings").closest("section").after(panel);
  }
  if (state.currentUser?.role !== "tech_admin") { panel.hidden = true; return; }
  panel.hidden = false;
  panel.innerHTML = `<h3>Restriction Types</h3><p class="panel-note">Add, edit, or retire access restrictions. Changes to types preserve existing student assignments.</p>
    <form data-restriction-type-form class="form-grid"><label>Type name<input name="label" maxlength="100" required></label><label>Description<textarea name="description" maxlength="500"></textarea></label><button class="primary-button" type="submit">Add restriction type</button></form>
    ${(state.restrictionTypes || []).map(type => `<article class="restriction-card"><strong>${escapeHtml(type.label)}</strong><p>${escapeHtml(type.description)}</p>
      ${type.active ? `<button class="quiet-button" data-restriction-type-edit="${type.id}">Edit</button> <button class="danger-button" data-restriction-type-retire="${type.id}">Retire</button>` : '<span class="badge">Retired</span>'}</article>`).join("")}
    <p id="restriction-settings-message" role="status"></p>`;
}

function restrictionDialog(title, fields, save) {
  const dialog = document.createElement("dialog");
  dialog.className = "restriction-dialog";
  dialog.setAttribute("aria-labelledby", "restriction-dialog-title");
  dialog.innerHTML = `<form class="form-grid"><h2 id="restriction-dialog-title" class="full-width">${escapeHtml(title)}</h2>${fields}<div class="form-actions full-width"><button class="primary-button" type="submit">Save</button><button class="quiet-button" type="button" data-cancel>Cancel</button></div><p class="full-width" role="status"></p></form>`;
  document.body.append(dialog);
  dialog.querySelector("[data-cancel]").onclick = () => dialog.close();
  dialog.addEventListener("close", () => dialog.remove());
  dialog.querySelector("form").onsubmit = async event => {
    event.preventDefault(); const button = dialog.querySelector("[type=submit]"); button.disabled = true;
    try { await save(Object.fromEntries(new FormData(event.target))); dialog.close(); }
    catch (error) { dialog.querySelector("[role=status]").textContent = error.message; }
    finally { button.disabled = false; }
  };
  dialog.showModal();
}

async function refreshRestrictions() {
  await loadBootstrap();
  if (state.selectedStudentId && document.querySelector("#students-view").classList.contains("active")) await showStudentDetail(state.selectedStudentId);
}

document.addEventListener("click", async event => {
  const button = event.target.closest("button"); if (!button) return;
  if (button.hasAttribute("data-teacher-section")) {
    const restrictions = button.dataset.teacherSection === "restrictions";
    document.querySelector("#teacher-status-groups").hidden = restrictions;
    document.querySelector("#teacher-restrictions").hidden = !restrictions;
    document.querySelectorAll("[data-teacher-section]").forEach(tab => {
      const selected = tab === button; tab.setAttribute("aria-pressed", String(selected)); tab.className = selected ? "primary-button" : "quiet-button";
    });
  }
  if (button.hasAttribute("data-restriction-filter")) {
    document.querySelector("#restriction-filter").value = button.dataset.restrictionFilter;
    renderRestrictionManagement(); switchView("restrictions");
  }
  const edit = button.dataset.restrictionEdit;
  const end = button.dataset.restrictionEnd;
  const remove = button.dataset.restrictionRemove;
  if (edit || end || remove) {
    const id = edit || end || remove;
    // Student history can contain records belonging to an archived student, so fetch the source record.
    const items = state.restrictions || [];
    const item = items.find(record => String(record.id) === id);
    if (edit && !item) return;
    const fields = edit ? `<label>Restriction type<select name="restriction_type_id" required>${restrictionOptions(item.restriction_type_id, true)}</select></label>
      <label>Effective date<input type="date" name="starts_on" value="${escapeHtml(item.starts_on)}" required></label>
      <label>End date (inclusive; optional)<input type="date" name="ends_on" value="${escapeHtml(item.ends_on || "")}"></label>
      <label class="full-width">Notes — visible to teachers<textarea name="notes" maxlength="5000" rows="4">${escapeHtml(item.notes)}</textarea></label>`
      : `<p class="full-width">${end ? "This restriction will leave the active dashboards and remain in history." : "This entry will be marked incorrect and retained in the audit history."}</p><label class="full-width">Reason<textarea name="reason" maxlength="1000" required></textarea></label>`;
    restrictionDialog(edit ? "Edit restriction" : end ? "End restriction" : "Remove incorrect entry", fields, async body => {
      await api(`/api/restrictions/${id}${edit ? "" : end ? "/end" : "/remove"}`, { method: "PATCH", body: JSON.stringify(body) });
      await refreshRestrictions();
    });
  }
  const typeEdit = button.dataset.restrictionTypeEdit;
  const typeRetire = button.dataset.restrictionTypeRetire;
  if (typeEdit || typeRetire) {
    const type = state.restrictionTypes.find(item => String(item.id) === (typeEdit || typeRetire));
    restrictionDialog(typeEdit ? "Edit restriction type" : "Retire restriction type",
      typeEdit ? `<label>Type name<input name="label" maxlength="100" value="${escapeHtml(type.label)}" required></label><label>Description<textarea name="description" maxlength="500">${escapeHtml(type.description)}</textarea></label>`
        : `<p class="full-width">Retire ${escapeHtml(type.label)}? Existing restrictions remain in place. Staff will no longer be able to assign this type to new students.</p>`,
      async body => { await api(`/api/restriction-types/${type.id}`, { method: typeEdit ? "PUT" : "DELETE", body: JSON.stringify(body) }); await loadBootstrap(); });
  }
});

document.addEventListener("submit", async event => {
  if (!event.target.matches("[data-restriction-type-form]")) return;
  event.preventDefault(); const button = event.target.querySelector("button"); button.disabled = true;
  try { await api("/api/restriction-types", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(event.target))) }); await loadBootstrap(); }
  catch (error) { document.querySelector("#restriction-settings-message").textContent = error.message; }
  finally { button.disabled = false; }
});
document.querySelector("#restriction-filter").addEventListener("change", renderRestrictionManagement);
