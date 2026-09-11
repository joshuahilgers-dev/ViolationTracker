const repairState = {
  loaded: false,
  loading: false,
  students: [],
  repairTypes: [],
  parts: [],
  repairs: [],
  photos: [],
  partUsage: [],
  feeSchedule: [],
  fineDeviceTypes: [],
  expandedStudents: new Set()
};

const MAX_REPAIR_PHOTO_BYTES = 2 * 1024 * 1024;
const REPAIR_PHOTO_TARGET_BYTES = Math.floor(1.9 * 1024 * 1024);
const PARENTSQUARE_URL = "https://www.parentsquare.com/signin";
const SKYWARD_URL = "https://skyward.iscorp.com/WisconsinRapidsWIStu/Home";

const repairEls = {
  newButton: document.querySelector("#new-repair-button"),
  dialog: document.querySelector("#repair-dialog"),
  form: document.querySelector("#repair-form"),
  formMessage: document.querySelector("#repair-form-message"),
  dialogTitle: document.querySelector("#repair-dialog-title"),
  dialogSubtitle: document.querySelector("#repair-dialog-subtitle"),
  saveButton: document.querySelector("#repair-save-button"),
  studentSearch: document.querySelector("#repair-student-search"),
  studentOptions: document.querySelector("#repair-student-options"),
  studentSelect: document.querySelector("#repair-student-select"),
  assetTag: document.querySelector("#repair-asset-tag"),
  kindField: document.querySelector(".repair-kind-field"),
  typeField: document.querySelector("#repair-type-field"),
  typeSelect: document.querySelector("#repair-type-select"),
  otherTypeField: document.querySelector("#repair-other-type-field"),
  deviceTypeField: document.querySelector("#repair-device-type-field"),
  deviceTypeSelect: document.querySelector("#repair-device-type-select"),
  statusField: document.querySelector("#repair-status-field"),
  notesLabel: document.querySelector("#repair-notes-label"),
  partsOptions: document.querySelector("#repair-parts-options"),
  partsFieldset: document.querySelector(".repair-parts-fieldset"),
  damageFee: document.querySelector("#repair-damage-fee"),
  financialFields: document.querySelector("#repair-financial-fields"),
  feeScheduleSelect: document.querySelector("#repair-fee-schedule-select"),
  chromecareStatus: document.querySelector("#repair-chromecare-status"),
  parentNotifiedEdit: document.querySelector("#repair-parent-notified-edit"),
  skywardEnteredEdit: document.querySelector("#repair-skyward-entered-edit"),
  photoField: document.querySelector("#repair-photo-field"),
  existingPhotos: document.querySelector("#repair-existing-photos"),
  search: document.querySelector("#repair-search"),
  statusFilter: document.querySelector("#repair-status-filter"),
  tableBody: document.querySelector("#repair-table-body"),
  empty: document.querySelector("#repair-empty"),
  historyCount: document.querySelector("#repair-history-count"),
  metricOpen: document.querySelector("#repair-metric-open"),
  metricComplete: document.querySelector("#repair-metric-complete"),
  metricFees: document.querySelector("#repair-metric-fees"),
  metricSkyward: document.querySelector("#repair-metric-skyward"),
  metricLowStock: document.querySelector("#repair-metric-low-stock"),
  partForm: document.querySelector("#repair-part-form"),
  partMessage: document.querySelector("#repair-part-message"),
  inventoryList: document.querySelector("#repair-inventory-list"),
  pageMessage: document.querySelector("#repair-page-message"),
  noticeDialog: document.querySelector("#repair-notice-dialog"),
  noticeForm: document.querySelector("#repair-notice-form"),
  noticeSummary: document.querySelector("#repair-notice-summary"),
  noticeMessage: document.querySelector("#repair-notice-message"),
  copyNotice: document.querySelector("#repair-copy-notice"),
  feeScheduleSettings: document.querySelector("#repair-fee-schedule-settings"),
  feeScheduleMessage: document.querySelector("#repair-fee-schedule-message")
};

function repairFormatMoney(cents) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(cents || 0) / 100);
}

function repairFormatDate(value) {
  if (!value) return "—";
  const date = new Date(value.includes("T") ? value : `${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

function repairStudentName(item) {
  return `${item.first_name || ""} ${item.last_name || ""}`.trim();
}

function repairStatusClass(status) {
  return String(status || "").toLowerCase().replaceAll(" ", "-");
}

function setRepairMessage(message, isError = false) {
  repairEls.pageMessage.textContent = message;
  repairEls.pageMessage.classList.toggle("error", isError);
  if (message) setTimeout(() => {
    if (repairEls.pageMessage.textContent === message) repairEls.pageMessage.textContent = "";
  }, 7000);
}

async function loadRepairWorkspace({ quiet = false } = {}) {
  if (repairState.loading) return;
  repairState.loading = true;
  if (!quiet) repairEls.historyCount.textContent = "Loading repair records...";
  try {
    const data = await api("/api/repairs/bootstrap");
    if (Number(data.repairApiVersion || 0) < 2) {
      throw new Error("The repair server is still running an older version. Restart the Technology Violation Tracker service, then refresh this page.");
    }
    repairState.students = data.students || [];
    repairState.repairTypes = data.repairTypes || [];
    repairState.parts = data.parts || [];
    repairState.repairs = data.repairs || [];
    repairState.photos = data.photos || [];
    repairState.partUsage = data.partUsage || [];
    repairState.feeSchedule = data.feeSchedule || [];
    repairState.fineDeviceTypes = data.fineDeviceTypes || [];
    repairState.loaded = true;
    renderRepairWorkspace();
  } catch (error) {
    repairEls.historyCount.textContent = "Unable to load repair records.";
    repairEls.feeScheduleSettings.innerHTML = `<div class="empty">Unable to load the Chromebook Care fee schedule.</div>`;
    repairEls.feeScheduleMessage.textContent = error.message;
    setRepairMessage(error.message, true);
  } finally {
    repairState.loading = false;
  }
}

function renderRepairWorkspace() {
  const repairsOnly = repairState.repairs.filter(repair => (repair.record_kind || "Repair") === "Repair");
  const openRepairs = repairsOnly.filter(repair => repair.status !== "Complete");
  const complete = repairsOnly.filter(repair => repair.status === "Complete");
  const feeTotal = repairState.repairs.reduce((total, repair) => total + Number(repair.fee_amount_cents || 0), 0);
  const needsSkyward = repairState.repairs.filter(repair => Number(repair.damage_fee) && Number(repair.fee_amount_cents) > 0 && !Number(repair.skyward_entered));
  const lowStock = repairState.parts.filter(part => Number(part.quantity) <= Number(part.low_stock_threshold));
  repairEls.metricOpen.textContent = openRepairs.length;
  repairEls.metricComplete.textContent = complete.length;
  repairEls.metricFees.textContent = repairFormatMoney(feeTotal);
  repairEls.metricSkyward.textContent = needsSkyward.length;
  repairEls.metricLowStock.textContent = lowStock.length;
  renderRepairTable();
  renderRepairInventory();
  renderRepairFormOptions();
  renderFeeScheduleSettings();
}

function renderRepairTable() {
  const query = repairEls.search.value.trim().toLowerCase();
  const status = repairEls.statusFilter.value;
  const records = repairState.repairs.filter(repair => {
    const haystack = [
      repairStudentName(repair), repair.student_number, repair.grade, repair.asset_tag,
      repair.repair_type_name, repair.other_details, repair.incident_notes,
      repair.status, repair.parts_used, repair.record_kind, repair.device_type,
      repair.fee_schedule_label, repair.chromecare_status
    ].join(" ").toLowerCase();
    return (!query || haystack.includes(query)) && (!status || (repairRecordKind(repair) === "Repair" && repair.status === status));
  });
  const groups = new Map();
  for (const record of records) {
    const studentId = Number(record.student_id);
    if (!groups.has(studentId)) groups.set(studentId, []);
    groups.get(studentId).push(record);
  }
  const grouped = [...groups.values()];
  repairEls.historyCount.textContent = `${grouped.length} student${grouped.length === 1 ? "" : "s"} · ${records.length} of ${repairState.repairs.length} records shown.`;
  repairEls.empty.hidden = grouped.length > 0;
  repairEls.tableBody.innerHTML = grouped.map(group => repairStudentRows(group)).join("");
}

function repairRecordKind(record) {
  return record.record_kind === "Fine" ? "Fine" : "Repair";
}

function repairRecordLabel(record) {
  if (repairRecordKind(record) === "Fine") {
    return [record.device_type, record.fee_schedule_label].filter(Boolean).join(" · ") || "Fine";
  }
  return record.other_details || record.repair_type_name || "Repair";
}

function repairCareLabel(record) {
  if (record.chromecare_status === "Yes") return "Chromebook Care purchased";
  if (record.chromecare_status === "No") return "No Chromebook Care";
  return "Chromebook Care not confirmed";
}

function repairStudentRows(group) {
  const latest = group[0];
  const studentId = Number(latest.student_id);
  const expanded = repairState.expandedStudents.has(studentId);
  const repairCount = group.filter(record => repairRecordKind(record) === "Repair").length;
  const fineCount = group.length - repairCount;
  const openCount = group.filter(record => repairRecordKind(record) === "Repair" && record.status !== "Complete").length;
  const assessmentRecords = group.filter(record => Number(record.damage_fee));
  const total = assessmentRecords.reduce((sum, record) => sum + Number(record.fee_amount_cents || 0), 0);
  const needsNotice = assessmentRecords.filter(record => !Number(record.parent_notified)).length;
  const needsSkyward = assessmentRecords.filter(record => Number(record.fee_amount_cents) > 0 && !Number(record.skyward_entered)).length;
  const skywardApplicable = assessmentRecords.filter(record => Number(record.fee_amount_cents) > 0);
  const assets = [...new Set(group.map(record => record.asset_tag).filter(Boolean))];
  const careStatuses = [...new Set(group.map(record => record.chromecare_status || "Unknown"))];
  const careSummary = careStatuses.length === 1
    ? repairCareLabel({ chromecare_status: careStatuses[0] })
    : "Chromebook Care varies by record";
  const activity = [
    repairCount ? `${repairCount} repair${repairCount === 1 ? "" : "s"}` : "",
    fineCount ? `${fineCount} fine${fineCount === 1 ? "" : "s"}` : ""
  ].filter(Boolean).join(" · ");
  return `
    <tr class="repair-student-row ${expanded ? "expanded" : ""}" data-repair-student-toggle="${studentId}">
      <td>
        <button class="repair-student-toggle" type="button" aria-expanded="${expanded}" aria-controls="repair-student-details-${studentId}">
          <span class="repair-expand-icon" aria-hidden="true">${expanded ? "−" : "+"}</span>
          <span><strong>${escapeHtml(repairStudentName(latest))}</strong><span class="repair-cell-meta">ID ${escapeHtml(latest.student_number || "—")} · Grade ${escapeHtml(latest.grade || "—")}</span></span>
        </button>
        ${assets.slice(0, 2).map(asset => `<span class="asset-tag">${escapeHtml(asset)}</span>`).join(" ")}
      </td>
      <td><strong>${escapeHtml(activity)}</strong></td>
      <td>${escapeHtml(repairFormatDate(latest.created_at))}</td>
      <td>${openCount ? `<span class="repair-status open">${openCount} open</span>` : `<span class="repair-cell-meta">None</span>`}</td>
      <td>
        ${assessmentRecords.length ? `<strong>${escapeHtml(repairFormatMoney(total))}</strong>` : `<span class="repair-cell-meta">No fees or fines</span>`}
        <span class="repair-cell-meta">${escapeHtml(careSummary)}</span>
        ${needsNotice ? `<span class="workflow-state needs-action">${needsNotice} need${needsNotice === 1 ? "s" : ""} ParentSquare notice</span>` : assessmentRecords.length ? `<span class="workflow-state complete">ParentSquare complete</span>` : ""}
        ${needsSkyward ? `<span class="workflow-state needs-action">${needsSkyward} need${needsSkyward === 1 ? "s" : ""} Skyward entry</span>` : skywardApplicable.length ? `<span class="workflow-state complete">Skyward complete</span>` : assessmentRecords.length ? `<span class="workflow-state complete">No Skyward charge</span>` : ""}
      </td>
      <td><button class="quiet-button compact-button" type="button" data-repair-student-toggle="${studentId}" aria-expanded="${expanded}">${expanded ? "Hide" : "View"}</button></td>
    </tr>
    <tr class="repair-student-details-row" id="repair-student-details-${studentId}" ${expanded ? "" : "hidden"}>
      <td colspan="6"><div class="repair-record-list">${group.map(repairRecordCard).join("")}</div></td>
    </tr>`;
}

function repairRecordCard(record) {
  const kind = repairRecordKind(record);
  const photos = repairState.photos.filter(photo => Number(photo.repair_id) === Number(record.id));
  const hasFee = Number(record.damage_fee);
  const nextStatus = record.status === "Open" ? "In Progress" : "Complete";
  return `
    <article class="repair-record-card ${kind.toLowerCase()}">
      <div class="repair-record-heading">
        <div>
          <span class="repair-kind-badge ${kind.toLowerCase()}">${escapeHtml(kind)}</span>
          <strong>${escapeHtml(repairRecordLabel(record))}</strong>
          <span class="repair-cell-meta">${escapeHtml(repairFormatDate(record.created_at))} · Asset ${escapeHtml(record.asset_tag || "unassigned")}</span>
          <span class="repair-cell-meta">${escapeHtml(repairCareLabel(record))}</span>
        </div>
        ${kind === "Repair" ? `<span class="repair-status ${repairStatusClass(record.status)}">${escapeHtml(record.status)}</span>` : ""}
      </div>
      <p class="repair-record-notes">${escapeHtml(record.incident_notes)}</p>
      ${record.parts_used ? `<span class="repair-cell-meta">Parts: ${escapeHtml(record.parts_used)}</span>` : ""}
      ${photos.length ? `<span class="repair-photo-links">Photos: ${photos.map(photo => `<a href="/repair-photos/${photo.id}" target="_blank" rel="noopener">${escapeHtml(photo.original_name)}</a>`).join(" · ")}</span>` : ""}
      ${hasFee ? `
        <div class="repair-financial-summary">
          <strong>${escapeHtml(repairFormatMoney(record.fee_amount_cents))}</strong>
          <span>${escapeHtml(record.fee_schedule_label || (kind === "Fine" ? "Fine" : "Damage fee"))}</span>
          <span class="workflow-state ${Number(record.parent_notified) ? "complete" : "needs-action"}">${Number(record.parent_notified) ? `ParentSquare notified ${escapeHtml(repairFormatDate(record.parent_notified_at))}` : "ParentSquare notice needed"}</span>
          ${Number(record.fee_amount_cents) > 0 ? `<span class="workflow-state ${Number(record.skyward_entered) ? "complete" : "needs-action"}">${Number(record.skyward_entered) ? `Entered in Skyward ${escapeHtml(repairFormatDate(record.skyward_entered_at))}` : "Skyward entry needed"}</span>` : `<span class="workflow-state complete">No Skyward charge</span>`}
        </div>` : ""}
      <div class="repair-row-actions repair-record-actions">
        ${kind === "Repair" && record.status !== "Complete" ? `<button class="quiet-button compact-button" type="button" data-repair-status="${record.id}" data-next-status="${escapeHtml(nextStatus)}">${record.status === "Open" ? "Start work" : "Complete"}</button>` : ""}
        ${kind === "Repair" && record.status === "Complete" ? `<button class="primary-button compact-button" type="button" data-repair-edit="${record.id}" data-reopen="1">Reopen</button>` : `<button class="quiet-button compact-button" type="button" data-repair-edit="${record.id}">Edit</button>`}
        <button class="quiet-button compact-button" type="button" data-repair-photo-trigger="${record.id}">Add photos</button>
        <input type="file" accept="image/jpeg,image/png,image/webp,image/heic" multiple hidden data-repair-photo-input="${record.id}" aria-label="Add photos to ${escapeHtml(repairRecordLabel(record))}">
        ${hasFee ? `<button class="quiet-button compact-button" type="button" data-repair-notice="${record.id}">${Number(record.parent_notified) ? "Send updated notice" : "ParentSquare notice"}</button>` : ""}
        ${hasFee && Number(record.fee_amount_cents) > 0 ? `<a class="quiet-button compact-button button-link" href="${SKYWARD_URL}" target="_blank" rel="noopener">Open Skyward</a>` : ""}
        ${hasFee && Number(record.fee_amount_cents) > 0 ? `<button class="quiet-button compact-button" type="button" data-repair-skyward="${record.id}" data-entered="${Number(record.skyward_entered) ? "0" : "1"}" ${!Number(record.parent_notified) && !Number(record.skyward_entered) ? 'disabled title="Record the ParentSquare notice first"' : ""}>${Number(record.skyward_entered) ? "Undo Skyward entry" : !Number(record.parent_notified) ? "Notify parent first" : "Mark entered in Skyward"}</button>` : ""}
        <button class="danger-button compact-button" type="button" data-delete-repair="${record.id}">Delete permanently</button>
      </div>
    </article>`;
}

function renderRepairInventory() {
  repairEls.inventoryList.innerHTML = repairState.parts.length ? repairState.parts.map(part => {
    const low = Number(part.quantity) <= Number(part.low_stock_threshold);
    return `
      <div class="repair-inventory-row ${low ? "low-stock" : ""}">
        <div>
          <strong>${escapeHtml(part.name)}</strong>
          <span>${part.sku ? `SKU ${escapeHtml(part.sku)} · ` : ""}${escapeHtml(repairFormatMoney(part.unit_cost_cents))} each</span>
        </div>
        <div class="repair-inventory-quantity">
          <button class="quiet-button compact-button" type="button" data-adjust-repair-part="${part.id}" data-adjust-by="-1" aria-label="Remove one ${escapeHtml(part.name)}">−</button>
          <strong>${Number(part.quantity)}</strong>
          <button class="quiet-button compact-button" type="button" data-adjust-repair-part="${part.id}" data-adjust-by="1" aria-label="Add one ${escapeHtml(part.name)}">+</button>
        </div>
        <span class="repair-stock-label">${low ? "Low stock" : `Reorder at ${Number(part.low_stock_threshold)}`}</span>
      </div>`;
  }).join("") : `<div class="empty">No inventory items yet. Add the first part above.</div>`;
}

function renderRepairFormOptions() {
  const selectedStudent = repairEls.studentSelect.value;
  const selectedType = repairEls.typeSelect.value;
  const selectedSchedule = repairEls.feeScheduleSelect.value;
  const selectedDevice = repairEls.deviceTypeSelect.value;
  repairEls.studentSelect.innerHTML = [
    `<option value="">Or choose from full list</option>`,
    ...repairState.students.map(student => `<option value="${student.id}">${escapeHtml(`${student.last_name}, ${student.first_name} · ID ${student.student_number || "—"} · ${student.device_asset_tag || "No asset"}`)}</option>`)
  ].join("");
  repairEls.studentSelect.value = selectedStudent;
  repairEls.typeSelect.innerHTML = repairState.repairTypes.map(type => `<option value="${type.id}">${escapeHtml(type.name)}</option>`).join("");
  if (selectedType) repairEls.typeSelect.value = selectedType;
  repairEls.feeScheduleSelect.innerHTML = repairState.feeSchedule.map(item => `<option value="${item.id}">${escapeHtml(item.label)}</option>`).join("");
  if (selectedSchedule) repairEls.feeScheduleSelect.value = selectedSchedule;
  repairEls.deviceTypeSelect.innerHTML = repairState.fineDeviceTypes.map(item => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join("");
  if (selectedDevice) repairEls.deviceTypeSelect.value = selectedDevice;
  repairEls.partsOptions.innerHTML = repairState.parts.length ? repairState.parts.map(part => `
    <label class="repair-part-option ${Number(part.quantity) < 1 ? "unavailable" : ""}">
      <input type="checkbox" data-repair-part-id="${part.id}" ${Number(part.quantity) < 1 ? "disabled" : ""}>
      <span>${escapeHtml(part.name)} <small>${Number(part.quantity)} on hand</small></span>
      <input type="number" min="1" max="${Math.max(1, Number(part.quantity))}" value="1" data-repair-part-quantity="${part.id}" aria-label="Quantity of ${escapeHtml(part.name)}" ${Number(part.quantity) < 1 ? "disabled" : ""}>
    </label>`).join("") : `<div class="empty">No parts are in inventory yet.</div>`;
  updateRepairOtherType();
  updateRepairStudentOptions();
}

function repairStudentOptionLabel(student) {
  return `${student.last_name}, ${student.first_name} - ID ${student.student_number || "—"}${student.grade ? ` - Grade ${student.grade}` : ""}`;
}

function repairStudentSearchText(student) {
  return [student.first_name, student.last_name, `${student.first_name} ${student.last_name}`, `${student.last_name}, ${student.first_name}`, student.student_number]
    .join(" ").toLowerCase();
}

function matchingRepairStudents(query) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];
  return repairState.students.filter(student => repairStudentSearchText(student).includes(normalized)).slice(0, 25);
}

function updateRepairStudentOptions() {
  const query = repairEls.studentSearch.value;
  const matches = matchingRepairStudents(query);
  repairEls.studentOptions.innerHTML = matches.map(student => `<option value="${escapeHtml(repairStudentOptionLabel(student))}"></option>`).join("");
  const selected = repairState.students.find(student => repairStudentOptionLabel(student) === query || String(student.student_number || "").toLowerCase() === query.trim().toLowerCase());
  if (selected) selectRepairStudent(selected.id);
}

function selectRepairStudent(studentId) {
  const selected = repairState.students.find(student => String(student.id) === String(studentId));
  repairEls.studentSelect.value = selected ? String(selected.id) : "";
  repairEls.studentSearch.value = selected ? repairStudentOptionLabel(selected) : "";
  updateRepairStudentAsset();
}

function openRepairDialog(record = null, { reopen = false } = {}) {
  repairEls.form.reset();
  repairEls.form.elements.record_id.value = record?.id || "";
  repairEls.form.elements.record_kind.value = record ? repairRecordKind(record) : "Repair";
  repairEls.form.elements.status.value = "Open";
  repairEls.formMessage.textContent = "";
  renderRepairFormOptions();
  repairEls.kindField.querySelectorAll("input").forEach(input => { input.disabled = Boolean(record); });
  repairEls.studentSearch.disabled = Boolean(record);
  repairEls.studentSelect.disabled = Boolean(record);
  repairEls.parentNotifiedEdit.hidden = !record;
  repairEls.skywardEnteredEdit.hidden = !record;
  repairEls.existingPhotos.hidden = true;
  repairEls.existingPhotos.innerHTML = "";
  if (record) {
    selectRepairStudent(record.student_id);
    repairEls.assetTag.value = record.asset_tag || "";
    if (repairRecordKind(record) === "Repair") {
      repairEls.typeSelect.value = String(record.repair_type_id || "");
      repairEls.form.elements.other_type.value = record.other_details || "";
      repairEls.form.elements.status.value = reopen ? "Open" : record.status;
    } else {
      repairEls.deviceTypeSelect.value = record.device_type || repairState.fineDeviceTypes[0] || "";
    }
    repairEls.form.elements.incident_notes.value = record.incident_notes || "";
    repairEls.damageFee.checked = Boolean(Number(record.damage_fee));
    repairEls.feeScheduleSelect.value = String(record.fee_schedule_id || repairState.feeSchedule[0]?.id || "");
    repairEls.chromecareStatus.value = record.chromecare_status || "Unknown";
    repairEls.form.elements.fee_amount.value = (Number(record.fee_amount_cents || 0) / 100).toFixed(2);
    repairEls.form.elements.parent_notified.checked = Boolean(Number(record.parent_notified));
    repairEls.form.elements.skyward_entered.checked = Boolean(Number(record.skyward_entered));
    for (const item of repairState.partUsage.filter(item => Number(item.repair_id) === Number(record.id))) {
      const checkbox = repairEls.partsOptions.querySelector(`[data-repair-part-id="${item.part_id}"]`);
      const quantity = repairEls.partsOptions.querySelector(`[data-repair-part-quantity="${item.part_id}"]`);
      if (checkbox) {
        checkbox.disabled = false;
        checkbox.checked = true;
      }
      if (quantity) {
        quantity.disabled = false;
        quantity.max = Math.max(Number(quantity.max || 1), Number(item.quantity));
        quantity.value = item.quantity;
      }
    }
    const photos = repairState.photos.filter(photo => Number(photo.repair_id) === Number(record.id));
    if (photos.length) {
      repairEls.existingPhotos.hidden = false;
      repairEls.existingPhotos.innerHTML = `<strong>Existing photos</strong><span class="repair-photo-links">${photos.map(photo => `<a href="/repair-photos/${photo.id}" target="_blank" rel="noopener">${escapeHtml(photo.original_name)}</a>`).join(" · ")}</span>`;
    }
    repairEls.dialogTitle.textContent = reopen ? "Reopen repair" : `Edit ${repairRecordKind(record).toLowerCase()}`;
    repairEls.dialogSubtitle.textContent = reopen
      ? "Update the repair, add photos if needed, and save to reopen it."
      : "Update the record and its financial workflow details.";
    repairEls.saveButton.textContent = reopen ? "Save and reopen" : "Save changes";
  } else {
    repairEls.dialogTitle.textContent = "New repair or fine";
    repairEls.dialogSubtitle.textContent = "Use the shared TechViolations roster and device assignment.";
    repairEls.saveButton.textContent = "Save record";
    repairEls.studentSearch.value = "";
    repairEls.studentSelect.value = "";
    repairEls.assetTag.value = "";
    repairEls.feeScheduleSelect.value = String(repairState.feeSchedule[0]?.id || "");
    repairEls.chromecareStatus.value = "Unknown";
  }
  updateRepairKindUi();
  if (!record) applySuggestedFeeForRepairType();
  updateRepairOtherType();
  if (!repairEls.dialog.open) repairEls.dialog.showModal();
  if (!record) repairEls.studentSearch.focus();
}

function updateRepairStudentAsset() {
  const student = repairState.students.find(item => String(item.id) === repairEls.studentSelect.value);
  repairEls.assetTag.value = student?.device_asset_tag || "";
}

function updateRepairOtherType() {
  const type = repairState.repairTypes.find(item => String(item.id) === repairEls.typeSelect.value);
  const isOtherRepair = repairEls.form.elements.record_kind.value === "Repair" && type?.name === "Other";
  repairEls.otherTypeField.hidden = !isOtherRepair;
  repairEls.form.elements.other_type.required = isOtherRepair;
}

function updateRepairKindUi() {
  const isFine = repairEls.form.elements.record_kind.value === "Fine";
  repairEls.typeField.hidden = isFine;
  repairEls.deviceTypeField.hidden = !isFine;
  repairEls.statusField.hidden = isFine;
  repairEls.partsFieldset.hidden = isFine;
  repairEls.photoField.hidden = isFine;
  repairEls.damageFee.closest("label").hidden = isFine;
  repairEls.damageFee.checked = isFine || repairEls.damageFee.checked;
  repairEls.financialFields.hidden = !(isFine || repairEls.damageFee.checked);
  repairEls.notesLabel.textContent = isFine ? "Fine details and notes" : "Incident and repair notes";
  repairEls.typeSelect.required = !isFine;
  repairEls.deviceTypeSelect.required = isFine;
  repairEls.feeScheduleSelect.required = isFine || repairEls.damageFee.checked;
  updateRepairOtherType();
  if (isFine && !repairEls.form.elements.record_id.value) updateSuggestedRepairFee();
}

function updateSuggestedRepairFee() {
  if (repairEls.financialFields.hidden) return;
  const item = repairState.feeSchedule.find(schedule => String(schedule.id) === repairEls.feeScheduleSelect.value);
  if (!item || Number(item.custom_amount)) return;
  const care = repairEls.chromecareStatus.value;
  const cents = care === "Yes" ? Number(item.with_chromecare_cents) : Number(item.without_chromecare_cents);
  repairEls.form.elements.fee_amount.value = (cents / 100).toFixed(2);
}

function selectSuggestedScheduleForRepairType() {
  if (repairEls.form.elements.record_kind.value !== "Repair" || repairEls.form.elements.record_id.value) return;
  const type = repairState.repairTypes.find(item => String(item.id) === repairEls.typeSelect.value);
  const schedule = repairState.feeSchedule.find(item => {
    if (type?.name === "Screen") return item.seed_key === "screen";
    if (type?.name === "Keyboard") return item.seed_key === "keyboard_touchpad";
    return item.seed_key === "other";
  });
  if (schedule) repairEls.feeScheduleSelect.value = String(schedule.id);
  updateSuggestedRepairFee();
}

function applySuggestedFeeForRepairType() {
  if (repairEls.form.elements.record_kind.value !== "Repair" || repairEls.form.elements.record_id.value) return;
  const type = repairState.repairTypes.find(item => String(item.id) === repairEls.typeSelect.value);
  const automaticallyAssessed = type?.name === "Screen" || type?.name === "Keyboard";
  repairEls.damageFee.checked = automaticallyAssessed;
  updateRepairKindUi();
  if (automaticallyAssessed) selectSuggestedScheduleForRepairType();
}

function selectedRepairParts() {
  return [...repairEls.partsOptions.querySelectorAll("[data-repair-part-id]:checked")].map(input => ({
    part_id: Number(input.dataset.repairPartId),
    quantity: Number(repairEls.partsOptions.querySelector(`[data-repair-part-quantity="${input.dataset.repairPartId}"]`)?.value || 1)
  }));
}

function fileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result).split(",")[1] || ""));
    reader.addEventListener("error", () => reject(reader.error || new Error("Unable to read photo.")));
    reader.readAsDataURL(file);
  });
}

function canvasAsBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error("Unable to compress the selected photo."));
    }, type, quality);
  });
}

async function compressRepairPhoto(file) {
  if (file.size < MAX_REPAIR_PHOTO_BYTES) return file;

  let image;
  try {
    image = await createImageBitmap(file);
  } catch {
    throw new Error(`${file.name} is too large and could not be compressed in this browser. Choose a JPG, PNG, WEBP, or a HEIC smaller than 2 MB.`);
  }

  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Photo compression is not available in this browser.");

    const initialScale = Math.min(1, 2400 / Math.max(image.width, image.height));
    let width = Math.max(1, Math.round(image.width * initialScale));
    let height = Math.max(1, Math.round(image.height * initialScale));
    let quality = 0.86;

    for (let attempt = 0; attempt < 12; attempt += 1) {
      canvas.width = width;
      canvas.height = height;
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);

      const blob = await canvasAsBlob(canvas, "image/jpeg", quality);
      if (blob.size <= REPAIR_PHOTO_TARGET_BYTES) {
        const jpegName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
        return new File([blob], jpegName, {
          type: "image/jpeg",
          lastModified: file.lastModified
        });
      }

      if (quality > 0.56) {
        quality -= 0.1;
      } else {
        width = Math.max(1, Math.round(width * 0.8));
        height = Math.max(1, Math.round(height * 0.8));
        quality = 0.8;
      }
    }
  } finally {
    image.close();
  }

  throw new Error(`${file.name} could not be reduced below 2 MB. Try a smaller image.`);
}

async function prepareRepairPhotos(photos, onProgress) {
  const prepared = [];
  for (const [index, photo] of photos.entries()) {
    onProgress(photo.size >= MAX_REPAIR_PHOTO_BYTES
      ? `Compressing photo ${index + 1} of ${photos.length}...`
      : `Preparing photo ${index + 1} of ${photos.length}...`);
    prepared.push(await compressRepairPhoto(photo));
  }
  return prepared;
}

async function uploadPreparedRepairPhotos(recordId, photos, onProgress) {
  let uploaded = 0;
  for (const [index, photo] of photos.entries()) {
    onProgress(`Uploading photo ${index + 1} of ${photos.length}...`);
    await api(`/api/repairs/${recordId}/photos`, {
      method: "POST",
      body: JSON.stringify({
        original_name: photo.name,
        mime_type: photo.type,
        content_base64: await fileAsBase64(photo)
      })
    });
    uploaded += 1;
  }
  return uploaded;
}

async function submitRepair(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submitButton = form.querySelector('button[type="submit"]');
  const photos = [...form.elements.photos.files];
  submitButton.disabled = true;
  try {
    const preparedPhotos = await prepareRepairPhotos(photos, message => { repairEls.formMessage.textContent = message; });

    const recordId = Number(form.elements.record_id.value || 0);
    const isFine = form.elements.record_kind.value === "Fine";
    const hasFee = isFine || form.elements.damage_fee.checked;
    repairEls.formMessage.textContent = `Saving ${isFine ? "fine" : "repair"}...`;
    const result = await api(recordId ? `/api/repairs/${recordId}` : "/api/repairs", {
      method: recordId ? "PATCH" : "POST",
      body: JSON.stringify({
        student_id: Number(form.elements.student_id.value),
        record_kind: form.elements.record_kind.value,
        asset_tag: form.elements.asset_tag.value,
        repair_type_id: Number(form.elements.repair_type_id.value),
        device_type: form.elements.device_type.value,
        other_type: form.elements.other_type.value,
        incident_notes: form.elements.incident_notes.value,
        status: form.elements.status.value,
        damage_fee: hasFee,
        fee_schedule_id: hasFee ? Number(form.elements.fee_schedule_id.value) : null,
        chromecare_status: form.elements.chromecare_status.value,
        fee_amount_cents: Math.round(Number(form.elements.fee_amount.value || 0) * 100),
        parent_notified: form.elements.parent_notified.checked,
        skyward_entered: form.elements.skyward_entered.checked,
        parts: isFine ? [] : selectedRepairParts()
      })
    });
    const savedId = recordId || Number(result.id);
    const uploaded = await uploadPreparedRepairPhotos(savedId, preparedPhotos, message => { repairEls.formMessage.textContent = message; });
    repairState.expandedStudents.add(Number(form.elements.student_id.value));
    repairEls.dialog.close();
    await loadRepairWorkspace({ quiet: true });
    const resetMessage = result.financialReset ? " ParentSquare and Skyward were reset because the amount or coverage changed." : "";
    setRepairMessage(`${isFine ? "Fine" : "Repair"} ${recordId ? "updated" : "saved"}${uploaded ? ` with ${uploaded} new photo${uploaded === 1 ? "" : "s"}` : ""}.${resetMessage}`);
  } catch (error) {
    repairEls.formMessage.textContent = error.message;
  } finally {
    submitButton.disabled = false;
  }
}

async function advanceRepairStatus(button) {
  button.disabled = true;
  try {
    await api(`/api/repairs/${Number(button.dataset.repairStatus)}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: button.dataset.nextStatus })
    });
    await loadRepairWorkspace({ quiet: true });
    setRepairMessage(`Repair marked ${button.dataset.nextStatus.toLowerCase()}.`);
  } catch (error) {
    setRepairMessage(error.message, true);
  } finally {
    button.disabled = false;
  }
}

function openRepairNotice(repairId) {
  const repair = repairState.repairs.find(item => Number(item.id) === Number(repairId));
  if (!repair) return;
  const kind = repairRecordKind(repair);
  const label = repairRecordLabel(repair);
  const amount = repairFormatMoney(repair.fee_amount_cents);
  const careText = repairCareLabel(repair);
  repairEls.noticeForm.reset();
  repairEls.noticeForm.elements.repair_id.value = repair.id;
  repairEls.noticeDialog.querySelector("h2").textContent = `Parent ${kind.toLowerCase()} notice`;
  const chargeText = Number(repair.fee_amount_cents) > 0
    ? `The assessed amount is ${amount}.`
    : "The assessed amount is $0.00, so no Skyward charge is needed.";
  repairEls.noticeForm.elements.message.value = kind === "Fine"
    ? `Hello,\n\nA technology fine record has been created for ${repairStudentName(repair)} for ${label} (asset ${repair.asset_tag || "not assigned"}). ${chargeText} ${careText}.\n\nDetails: ${repair.incident_notes}\n\nPlease contact the school technology office with any questions.`
    : `Hello,\n\nA Chromebook repair has been recorded for ${repairStudentName(repair)} (asset ${repair.asset_tag || "not assigned"}). The repair type is ${label}. Current status: ${repair.status}. ${chargeText} ${careText}.\n\nRepair notes: ${repair.incident_notes}\n\nPlease contact the school technology office with any questions.`;
  repairEls.noticeSummary.textContent = `${repairStudentName(repair)} · ${label} · ${amount}`;
  repairEls.noticeMessage.textContent = "";
  if (!repairEls.noticeDialog.open) repairEls.noticeDialog.showModal();
}

async function copyRepairNotice() {
  const message = repairEls.noticeForm.elements.message.value;
  try {
    await navigator.clipboard.writeText(message);
  } catch {
    repairEls.noticeForm.elements.message.focus();
    repairEls.noticeForm.elements.message.select();
    if (!document.execCommand("copy")) throw new Error("Copy was blocked. Select the message and copy it manually.");
  }
  repairEls.noticeMessage.textContent = "Message copied. Paste it into ParentSquare.";
}

async function submitRepairNotice(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  repairEls.noticeMessage.textContent = "Recording notice...";
  try {
    const repairId = Number(form.elements.repair_id.value);
    await api(`/api/repairs/${repairId}/notice`, {
      method: "POST",
      body: JSON.stringify({})
    });
    repairEls.noticeDialog.close();
    await loadRepairWorkspace({ quiet: true });
    setRepairMessage("ParentSquare notice marked as sent.");
  } catch (error) {
    repairEls.noticeMessage.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

async function markRepairSkyward(button) {
  const entered = button.dataset.entered === "1";
  button.disabled = true;
  try {
    await api(`/api/repairs/${Number(button.dataset.repairSkyward)}/skyward`, {
      method: "PATCH",
      body: JSON.stringify({ entered })
    });
    await loadRepairWorkspace({ quiet: true });
    setRepairMessage(entered ? "Skyward entry marked complete." : "Skyward entry marked not complete.");
  } catch (error) {
    setRepairMessage(error.message, true);
  } finally {
    button.disabled = false;
  }
}

async function deleteRepairRecord(recordId) {
  const record = repairState.repairs.find(item => Number(item.id) === Number(recordId));
  if (!record) return;
  const kind = repairRecordKind(record).toLowerCase();
  const confirmed = window.confirm(`Permanently delete this ${kind} for ${repairStudentName(record)}? Photos will be deleted and used parts will return to inventory. This cannot be undone.`);
  if (!confirmed) return;
  await api(`/api/repairs/${recordId}`, {
    method: "DELETE",
    body: JSON.stringify({ confirmation: "DELETE" })
  });
  await loadRepairWorkspace({ quiet: true });
  setRepairMessage(`${kind[0].toUpperCase()}${kind.slice(1)} permanently deleted.`);
}

function toggleRepairStudent(studentId) {
  if (repairState.expandedStudents.has(studentId)) repairState.expandedStudents.delete(studentId);
  else repairState.expandedStudents.add(studentId);
  renderRepairTable();
}

function renderFeeScheduleSettings() {
  if (!repairEls.feeScheduleSettings) return;
  repairEls.feeScheduleSettings.innerHTML = repairState.feeSchedule.length ? repairState.feeSchedule.map(item => `
    <form class="fee-schedule-row" data-fee-schedule-id="${item.id}">
      <div>
        <strong>${escapeHtml(item.label)}</strong>
        ${Number(item.custom_amount) ? `<span>Suggested amounts for Other; individual records remain editable.</span>` : ""}
      </div>
      <label>Without Care <input name="without_care" type="number" min="0" step="0.01" value="${(Number(item.without_chromecare_cents) / 100).toFixed(2)}" required></label>
      <label>With Care <input name="with_care" type="number" min="0" step="0.01" value="${(Number(item.with_chromecare_cents) / 100).toFixed(2)}" required></label>
      <button class="quiet-button compact-button" type="submit">Save</button>
    </form>`).join("") : `<div class="empty">Loading the Chromebook Care fee schedule...</div>`;
}

async function uploadPhotosFromRepairCard(input) {
  const recordId = Number(input.dataset.repairPhotoInput);
  const photos = [...input.files];
  if (!recordId || !photos.length) return;
  input.disabled = true;
  try {
    const prepared = await prepareRepairPhotos(photos, message => setRepairMessage(message));
    const uploaded = await uploadPreparedRepairPhotos(recordId, prepared, message => setRepairMessage(message));
    await loadRepairWorkspace({ quiet: true });
    setRepairMessage(`${uploaded} photo${uploaded === 1 ? "" : "s"} added.`);
  } catch (error) {
    setRepairMessage(error.message, true);
  } finally {
    input.value = "";
    input.disabled = false;
  }
}

async function saveFeeSchedule(event) {
  const form = event.target.closest("[data-fee-schedule-id]");
  if (!form) return;
  event.preventDefault();
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  repairEls.feeScheduleMessage.textContent = "Saving fee schedule...";
  try {
    await api(`/api/repair-fee-schedule/${Number(form.dataset.feeScheduleId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        without_chromecare_cents: Math.round(Number(form.elements.without_care.value || 0) * 100),
        with_chromecare_cents: Math.round(Number(form.elements.with_care.value || 0) * 100)
      })
    });
    await loadRepairWorkspace({ quiet: true });
    repairEls.feeScheduleMessage.textContent = "Fee schedule updated.";
  } catch (error) {
    repairEls.feeScheduleMessage.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

async function submitRepairPart(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  repairEls.partMessage.textContent = "Adding...";
  try {
    await api("/api/repair-inventory", {
      method: "POST",
      body: JSON.stringify({
        name: form.elements.name.value,
        sku: form.elements.sku.value,
        quantity: Number(form.elements.quantity.value),
        low_stock_threshold: Number(form.elements.low_stock_threshold.value),
        unit_cost_cents: Math.round(Number(form.elements.unit_cost.value || 0) * 100)
      })
    });
    form.reset();
    form.elements.quantity.value = 0;
    form.elements.low_stock_threshold.value = 2;
    form.elements.unit_cost.value = 0;
    await loadRepairWorkspace({ quiet: true });
    repairEls.partMessage.textContent = "Part added.";
  } catch (error) {
    repairEls.partMessage.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

async function adjustRepairPart(button) {
  const part = repairState.parts.find(item => Number(item.id) === Number(button.dataset.adjustRepairPart));
  if (!part) return;
  const quantity = Math.max(0, Number(part.quantity) + Number(button.dataset.adjustBy));
  button.disabled = true;
  try {
    await api(`/api/repair-inventory/${part.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        quantity,
        low_stock_threshold: Number(part.low_stock_threshold),
        unit_cost_cents: Number(part.unit_cost_cents)
      })
    });
    await loadRepairWorkspace({ quiet: true });
  } catch (error) {
    setRepairMessage(error.message, true);
  } finally {
    button.disabled = false;
  }
}

repairEls.newButton.addEventListener("click", async () => {
  if (!repairState.loaded) await loadRepairWorkspace();
  openRepairDialog();
});
repairEls.form.addEventListener("submit", submitRepair);
repairEls.partForm.addEventListener("submit", submitRepairPart);
repairEls.noticeForm.addEventListener("submit", submitRepairNotice);
repairEls.copyNotice.addEventListener("click", () => copyRepairNotice().catch(error => {
  repairEls.noticeMessage.textContent = error.message;
}));
repairEls.noticeDialog.querySelector('a[href*="parentsquare"]').href = PARENTSQUARE_URL;
repairEls.search.addEventListener("input", renderRepairTable);
repairEls.statusFilter.addEventListener("change", renderRepairTable);
repairEls.studentSearch.addEventListener("input", updateRepairStudentOptions);
repairEls.studentSearch.addEventListener("change", updateRepairStudentOptions);
repairEls.studentSearch.addEventListener("keydown", event => {
  if (event.key !== "Enter") return;
  const query = event.currentTarget.value.trim();
  const current = repairState.students.find(student => String(student.id) === repairEls.studentSelect.value);
  if (current && repairStudentOptionLabel(current) === query) {
    event.preventDefault();
    repairEls.assetTag.focus();
    return;
  }
  const exact = repairState.students.find(student => String(student.student_number || "").toLowerCase() === query.toLowerCase());
  const matches = matchingRepairStudents(query);
  const selected = exact || (matches.length === 1 ? matches[0] : null);
  if (selected) {
    event.preventDefault();
    selectRepairStudent(selected.id);
  }
});
repairEls.studentSelect.addEventListener("change", event => selectRepairStudent(event.target.value));
repairEls.typeSelect.addEventListener("change", () => {
  updateRepairOtherType();
  applySuggestedFeeForRepairType();
});
repairEls.form.querySelectorAll('input[name="record_kind"]').forEach(input => input.addEventListener("change", event => {
  repairEls.damageFee.checked = event.target.value === "Fine";
  updateRepairKindUi();
}));
repairEls.damageFee.addEventListener("change", () => {
  updateRepairKindUi();
  if (repairEls.damageFee.checked) selectSuggestedScheduleForRepairType();
});
repairEls.feeScheduleSelect.addEventListener("change", updateSuggestedRepairFee);
repairEls.chromecareStatus.addEventListener("change", updateSuggestedRepairFee);
repairEls.feeScheduleSettings.addEventListener("submit", saveFeeSchedule);

document.addEventListener("click", event => {
  if (event.target.closest("[data-close-repair-dialog]")) repairEls.dialog.close();
  if (event.target.closest("[data-close-repair-notice]")) repairEls.noticeDialog.close();
  const groupToggle = event.target.closest("[data-repair-student-toggle]");
  if (groupToggle) toggleRepairStudent(Number(groupToggle.dataset.repairStudentToggle));
  const statusButton = event.target.closest("[data-repair-status]");
  if (statusButton) advanceRepairStatus(statusButton);
  const editButton = event.target.closest("[data-repair-edit]");
  if (editButton) {
    const record = repairState.repairs.find(item => Number(item.id) === Number(editButton.dataset.repairEdit));
    if (record) openRepairDialog(record, { reopen: editButton.dataset.reopen === "1" });
  }
  const photoTrigger = event.target.closest("[data-repair-photo-trigger]");
  if (photoTrigger) {
    document.querySelector(`[data-repair-photo-input="${Number(photoTrigger.dataset.repairPhotoTrigger)}"]`)?.click();
  }
  const noticeButton = event.target.closest("[data-repair-notice]");
  if (noticeButton) openRepairNotice(Number(noticeButton.dataset.repairNotice));
  const skywardButton = event.target.closest("[data-repair-skyward]");
  if (skywardButton) markRepairSkyward(skywardButton);
  const deleteButton = event.target.closest("[data-delete-repair]");
  if (deleteButton) deleteRepairRecord(Number(deleteButton.dataset.deleteRepair)).catch(error => setRepairMessage(error.message, true));
  const partButton = event.target.closest("[data-adjust-repair-part]");
  if (partButton) adjustRepairPart(partButton);
  const settingsButton = event.target.closest('[data-view="settings"]');
  if (settingsButton && !repairState.loaded) loadRepairWorkspace({ quiet: true });
});

document.addEventListener("change", event => {
  const photoInput = event.target.closest("[data-repair-photo-input]");
  if (photoInput) uploadPhotosFromRepairCard(photoInput);
});

document.addEventListener("tracker:viewchange", event => {
  if (["repairs", "settings"].includes(event.detail?.name) && !repairState.loaded) {
    loadRepairWorkspace({ quiet: event.detail.name === "settings" });
  }
});

repairEls.dialog.addEventListener("click", event => {
  if (event.target === repairEls.dialog) repairEls.dialog.close();
});
repairEls.noticeDialog.addEventListener("click", event => {
  if (event.target === repairEls.noticeDialog) repairEls.noticeDialog.close();
});
