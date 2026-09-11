const repairState = {
  loaded: false,
  loading: false,
  students: [],
  repairTypes: [],
  parts: [],
  repairs: [],
  photos: []
};

const repairEls = {
  newButton: document.querySelector("#new-repair-button"),
  dialog: document.querySelector("#repair-dialog"),
  form: document.querySelector("#repair-form"),
  formMessage: document.querySelector("#repair-form-message"),
  studentSelect: document.querySelector("#repair-student-select"),
  assetTag: document.querySelector("#repair-asset-tag"),
  typeSelect: document.querySelector("#repair-type-select"),
  otherTypeField: document.querySelector("#repair-other-type-field"),
  partsOptions: document.querySelector("#repair-parts-options"),
  damageFee: document.querySelector("#repair-damage-fee"),
  feeField: document.querySelector("#repair-fee-field"),
  search: document.querySelector("#repair-search"),
  statusFilter: document.querySelector("#repair-status-filter"),
  tableBody: document.querySelector("#repair-table-body"),
  empty: document.querySelector("#repair-empty"),
  historyCount: document.querySelector("#repair-history-count"),
  metricOpen: document.querySelector("#repair-metric-open"),
  metricComplete: document.querySelector("#repair-metric-complete"),
  metricFees: document.querySelector("#repair-metric-fees"),
  metricLowStock: document.querySelector("#repair-metric-low-stock"),
  partForm: document.querySelector("#repair-part-form"),
  partMessage: document.querySelector("#repair-part-message"),
  inventoryList: document.querySelector("#repair-inventory-list"),
  pageMessage: document.querySelector("#repair-page-message"),
  noticeDialog: document.querySelector("#repair-notice-dialog"),
  noticeForm: document.querySelector("#repair-notice-form"),
  noticeSummary: document.querySelector("#repair-notice-summary"),
  noticeMessage: document.querySelector("#repair-notice-message")
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
    repairState.students = data.students || [];
    repairState.repairTypes = data.repairTypes || [];
    repairState.parts = data.parts || [];
    repairState.repairs = data.repairs || [];
    repairState.photos = data.photos || [];
    repairState.loaded = true;
    renderRepairWorkspace();
  } catch (error) {
    repairEls.historyCount.textContent = "Unable to load repair records.";
    setRepairMessage(error.message, true);
  } finally {
    repairState.loading = false;
  }
}

function renderRepairWorkspace() {
  const open = repairState.repairs.filter(repair => repair.status !== "Complete");
  const complete = repairState.repairs.filter(repair => repair.status === "Complete");
  const feeTotal = repairState.repairs.reduce((total, repair) => total + Number(repair.fee_amount_cents || 0), 0);
  const lowStock = repairState.parts.filter(part => Number(part.quantity) <= Number(part.low_stock_threshold));
  repairEls.metricOpen.textContent = open.length;
  repairEls.metricComplete.textContent = complete.length;
  repairEls.metricFees.textContent = repairFormatMoney(feeTotal);
  repairEls.metricLowStock.textContent = lowStock.length;
  renderRepairTable();
  renderRepairInventory();
  renderRepairFormOptions();
}

function renderRepairTable() {
  const query = repairEls.search.value.trim().toLowerCase();
  const status = repairEls.statusFilter.value;
  const repairs = repairState.repairs.filter(repair => {
    const haystack = [
      repairStudentName(repair), repair.student_number, repair.grade, repair.asset_tag,
      repair.repair_type_name, repair.other_details, repair.incident_notes,
      repair.status, repair.parts_used
    ].join(" ").toLowerCase();
    return (!query || haystack.includes(query)) && (!status || repair.status === status);
  });
  repairEls.historyCount.textContent = `${repairs.length} of ${repairState.repairs.length} repair records shown.`;
  repairEls.empty.hidden = repairs.length > 0;
  repairEls.tableBody.innerHTML = repairs.map(repair => {
    const photos = repairState.photos.filter(photo => Number(photo.repair_id) === Number(repair.id));
    const nextStatus = repair.status === "Open" ? "In Progress" : repair.status === "In Progress" ? "Complete" : "Open";
    const nextLabel = repair.status === "Complete" ? "Reopen" : repair.status === "Open" ? "Start work" : "Complete";
    const repairLabel = repair.other_details || repair.repair_type_name;
    return `
      <tr>
        <td>
          <strong>${escapeHtml(repairStudentName(repair))}</strong>
          <span class="repair-cell-meta">ID ${escapeHtml(repair.student_number || "—")} · Grade ${escapeHtml(repair.grade || "—")}</span>
          <span class="asset-tag">${escapeHtml(repair.asset_tag || "Unassigned")}</span>
        </td>
        <td>
          <strong>${escapeHtml(repairLabel)}</strong>
          <span class="repair-cell-meta">${escapeHtml(repair.incident_notes)}</span>
          ${repair.parts_used ? `<span class="repair-cell-meta">Parts: ${escapeHtml(repair.parts_used)}</span>` : ""}
          ${photos.length ? `<span class="repair-photo-links">${photos.map(photo => `<a href="/repair-photos/${photo.id}" target="_blank" rel="noopener">${escapeHtml(photo.original_name)}</a>`).join(" · ")}</span>` : ""}
        </td>
        <td>${escapeHtml(repairFormatDate(repair.created_at))}</td>
        <td><span class="repair-status ${repairStatusClass(repair.status)}">${escapeHtml(repair.status)}</span></td>
        <td>
          ${Number(repair.damage_fee) ? `<strong>${escapeHtml(repairFormatMoney(repair.fee_amount_cents))}</strong>` : `<span class="repair-cell-meta">No fee</span>`}
          <span class="repair-cell-meta">${Number(repair.parent_notified) ? "Parent notified" : "Notice not recorded"}</span>
        </td>
        <td>
          <div class="repair-row-actions">
            <button class="quiet-button compact-button" type="button" data-repair-status="${repair.id}" data-next-status="${escapeHtml(nextStatus)}">${escapeHtml(nextLabel)}</button>
            <button class="quiet-button compact-button" type="button" data-repair-notice="${repair.id}">${Number(repair.parent_notified) ? "Send again" : "Parent notice"}</button>
          </div>
        </td>
      </tr>`;
  }).join("");
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
  repairEls.studentSelect.innerHTML = [
    `<option value="">Choose a student</option>`,
    ...repairState.students.map(student => `<option value="${student.id}">${escapeHtml(`${student.last_name}, ${student.first_name} · ID ${student.student_number || "—"} · ${student.device_asset_tag || "No asset"}`)}</option>`)
  ].join("");
  repairEls.studentSelect.value = selectedStudent;
  repairEls.typeSelect.innerHTML = repairState.repairTypes.map(type => `<option value="${type.id}">${escapeHtml(type.name)}</option>`).join("");
  repairEls.partsOptions.innerHTML = repairState.parts.length ? repairState.parts.map(part => `
    <label class="repair-part-option ${Number(part.quantity) < 1 ? "unavailable" : ""}">
      <input type="checkbox" data-repair-part-id="${part.id}" ${Number(part.quantity) < 1 ? "disabled" : ""}>
      <span>${escapeHtml(part.name)} <small>${Number(part.quantity)} on hand</small></span>
      <input type="number" min="1" max="${Math.max(1, Number(part.quantity))}" value="1" data-repair-part-quantity="${part.id}" aria-label="Quantity of ${escapeHtml(part.name)}" ${Number(part.quantity) < 1 ? "disabled" : ""}>
    </label>`).join("") : `<div class="empty">No parts are in inventory yet.</div>`;
  updateRepairOtherType();
}

function openRepairDialog() {
  repairEls.form.reset();
  repairEls.form.elements.status.value = "Open";
  repairEls.formMessage.textContent = "";
  renderRepairFormOptions();
  updateRepairStudentAsset();
  repairEls.feeField.hidden = true;
  if (!repairEls.dialog.open) repairEls.dialog.showModal();
}

function updateRepairStudentAsset() {
  const student = repairState.students.find(item => String(item.id) === repairEls.studentSelect.value);
  repairEls.assetTag.value = student?.device_asset_tag || "";
}

function updateRepairOtherType() {
  const type = repairState.repairTypes.find(item => String(item.id) === repairEls.typeSelect.value);
  repairEls.otherTypeField.hidden = type?.name !== "Other";
  repairEls.form.elements.other_type.required = type?.name === "Other";
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

async function submitRepair(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submitButton = form.querySelector('button[type="submit"]');
  const photos = [...form.elements.photos.files];
  if (photos.some(file => file.size > 8 * 1024 * 1024)) {
    repairEls.formMessage.textContent = "Each photo must be smaller than 8 MB.";
    return;
  }
  submitButton.disabled = true;
  repairEls.formMessage.textContent = "Saving repair...";
  try {
    const result = await api("/api/repairs", {
      method: "POST",
      body: JSON.stringify({
        student_id: Number(form.elements.student_id.value),
        asset_tag: form.elements.asset_tag.value,
        repair_type_id: Number(form.elements.repair_type_id.value),
        other_type: form.elements.other_type.value,
        incident_notes: form.elements.incident_notes.value,
        status: form.elements.status.value,
        staff_cc: form.elements.staff_cc.value,
        damage_fee: form.elements.damage_fee.checked,
        fee_amount_cents: Math.round(Number(form.elements.fee_amount.value || 0) * 100),
        parts: selectedRepairParts()
      })
    });
    let uploaded = 0;
    for (const photo of photos) {
      await api(`/api/repairs/${result.id}/photos`, {
        method: "POST",
        body: JSON.stringify({
          original_name: photo.name,
          mime_type: photo.type,
          content_base64: await fileAsBase64(photo)
        })
      });
      uploaded += 1;
    }
    repairEls.dialog.close();
    await loadRepairWorkspace({ quiet: true });
    setRepairMessage(`Repair saved${uploaded ? ` with ${uploaded} photo${uploaded === 1 ? "" : "s"}` : ""}.`);
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
  const label = repair.other_details || repair.repair_type_name;
  const feeText = Number(repair.damage_fee) ? ` A damage fee of ${repairFormatMoney(repair.fee_amount_cents)} has been recorded.` : "";
  repairEls.noticeForm.reset();
  repairEls.noticeForm.elements.repair_id.value = repair.id;
  repairEls.noticeForm.elements.parent_email.value = String(repair.parent_email || "").includes("@") ? repair.parent_email : "";
  repairEls.noticeForm.elements.staff_cc.value = repair.staff_cc || "";
  repairEls.noticeForm.elements.subject.value = `Chromebook repair notice for ${repairStudentName(repair)}`;
  repairEls.noticeForm.elements.message.value = `Hello,\n\nA Chromebook repair has been recorded for ${repairStudentName(repair)} (asset ${repair.asset_tag || "not assigned"}). The repair type is ${label}. Current status: ${repair.status}.${feeText}\n\nRepair notes: ${repair.incident_notes}\n\nPlease contact the school technology office with any questions.`;
  repairEls.noticeSummary.textContent = `${repairStudentName(repair)} · ${label} · ${repair.status}`;
  repairEls.noticeMessage.textContent = "";
  if (!repairEls.noticeDialog.open) repairEls.noticeDialog.showModal();
}

async function submitRepairNotice(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  repairEls.noticeMessage.textContent = "Recording notice...";
  try {
    const repairId = Number(form.elements.repair_id.value);
    const parentEmail = form.elements.parent_email.value.trim();
    const staffCc = form.elements.staff_cc.value.trim();
    await api(`/api/repairs/${repairId}/notice`, {
      method: "POST",
      body: JSON.stringify({ parent_email: parentEmail, staff_cc: staffCc })
    });
    const params = new URLSearchParams({
      subject: form.elements.subject.value,
      body: form.elements.message.value
    });
    if (staffCc) params.set("cc", staffCc);
    window.location.href = `mailto:${encodeURIComponent(parentEmail)}?${params.toString()}`;
    repairEls.noticeDialog.close();
    await loadRepairWorkspace({ quiet: true });
    setRepairMessage("Parent notice recorded and opened in the default email app.");
  } catch (error) {
    repairEls.noticeMessage.textContent = error.message;
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
repairEls.search.addEventListener("input", renderRepairTable);
repairEls.statusFilter.addEventListener("change", renderRepairTable);
repairEls.studentSelect.addEventListener("change", updateRepairStudentAsset);
repairEls.typeSelect.addEventListener("change", updateRepairOtherType);
repairEls.damageFee.addEventListener("change", () => {
  repairEls.feeField.hidden = !repairEls.damageFee.checked;
});

document.addEventListener("click", event => {
  if (event.target.closest("[data-close-repair-dialog]")) repairEls.dialog.close();
  if (event.target.closest("[data-close-repair-notice]")) repairEls.noticeDialog.close();
  const statusButton = event.target.closest("[data-repair-status]");
  if (statusButton) advanceRepairStatus(statusButton);
  const noticeButton = event.target.closest("[data-repair-notice]");
  if (noticeButton) openRepairNotice(Number(noticeButton.dataset.repairNotice));
  const partButton = event.target.closest("[data-adjust-repair-part]");
  if (partButton) adjustRepairPart(partButton);
});

repairEls.dialog.addEventListener("click", event => {
  if (event.target === repairEls.dialog) repairEls.dialog.close();
});
repairEls.noticeDialog.addEventListener("click", event => {
  if (event.target === repairEls.noticeDialog) repairEls.noticeDialog.close();
});
