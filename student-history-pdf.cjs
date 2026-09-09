const PDFDocument = require("pdfkit");

const stepLabels = {
  reflection: "Digital Impact Reflection", success_contract: "Technology Success Contract",
  device_restriction: "5 school-day restriction", admin_review: "Admin review"
};

function historyFilename(student, now = new Date()) {
  const name = `${student.last_name}-${student.first_name}`.normalize("NFKD")
    .replace(/[^a-zA-Z0-9-]/g, "_").slice(0, 90);
  return `Tech-History-${name}-${student.id}-${now.toISOString().slice(0, 10)}.pdf`;
}

function createStudentHistoryPdf(student, term, now = new Date()) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margins: { top: 54, bottom: 54, left: 48, right: 48 }, bufferPages: true });
    const chunks = [];
    doc.on("data", chunk => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    const name = `${student.first_name} ${student.last_name}`;
    doc.info.Title = `Technology History - ${name}`;
    doc.info.Author = "WRPS Technology Violation Tracker";
    const text = value => String(value ?? "").replace(/\r\n?/g, "\n").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
    function line(value, bold = false, size = 10) {
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size).fillColor("#18212b")
        .text(text(value), { width: 516, lineGap: 3 });
    }
    function reserve(height) {
      if (doc.y + height > doc.page.height - doc.page.margins.bottom) doc.addPage();
    }
    function section(title) {
      reserve(150);
      doc.moveDown(0.7);
      line(title, true, 13);
      doc.moveDown(0.3);
    }
    function record(title, metadata, notes) {
      doc.font("Helvetica-Bold").fontSize(10);
      let height = doc.heightOfString(text(title), { width: 516, lineGap: 3 });
      doc.font("Helvetica");
      for (const item of [...metadata.filter(Boolean), notes].filter(Boolean)) {
        height += doc.heightOfString(text(item), { width: 516, lineGap: 3 });
      }
      // Keep ordinary records together; allow exceptionally long notes to flow.
      reserve(height < 610 ? height + 12 : 65);
      line(title, true);
      for (const item of metadata.filter(Boolean)) line(item);
      if (notes) line(notes);
      doc.moveDown(0.65);
    }
    function incidents(title, rows) {
      if (!rows.length) return;
      section(title);
      for (const incident of rows) {
        const entryLabel = incident.entry_type === "warning" ? "WARNING" : `${String(incident.severity || "").toUpperCase()} VIOLATION`;
        record(
          `${incident.occurred_on} | ${entryLabel} | ${incident.infraction_label || "Uncategorized"}${incident.canceled_at ? " [REMOVED]" : ""}`,
          [incident.term_name && `Term: ${incident.term_name}`, `Reported by: ${incident.reported_by || "Not recorded"}`,
            incident.class_period && `Class period: ${incident.class_period}`, incident.category && `Category: ${incident.category}`,
            incident.converted_at && `Converted to warning: ${incident.converted_at}${incident.converted_by ? ` by ${incident.converted_by}` : ""}`,
            incident.conversion_reason && `Conversion reason: ${incident.conversion_reason}`,
            incident.canceled_at && `Removed: ${incident.canceled_at}${incident.canceled_by ? ` by ${incident.canceled_by}` : ""}`,
            incident.canceled_reason && `Removal reason: ${incident.canceled_reason}`],
          incident.notes && `Notes: ${incident.notes}`);
      }
    }
    function adjustments(title, rows) {
      if (!rows.length) return;
      section(title);
      for (const item of rows) record(
        `${String(item.created_at || "").slice(0, 10)} | ${stepLabels[item.target_step] || item.target_step}`,
        [item.term_name && `Term: ${item.term_name}`, item.adjusted_by && `Adjusted by: ${item.adjusted_by}`],
        `Reason: ${item.reason || "Not recorded"}`);
    }
    line("WRPS | TECHNOLOGY VIOLATION TRACKER", true, 10);
    doc.moveDown(0.5);
    line("Student Technology History", true, 22);
    line(name, true, 16);
    doc.moveDown(0.5);
    line(`Student ID: ${student.student_number || "Not set"} | Grade: ${student.grade || "Not set"} | Device: ${student.device_asset_tag || "Not set"}`);
    line(`Generated: ${now.toLocaleString("en-US", { timeZone: "America/Chicago", timeZoneName: "short" })}`);
    line(`Current term: ${term.name || term.started_on || "Current term"}`);
    line("Scope: all recorded terms, including warnings and removed entries. Warnings and removed entries do not count toward intervention steps.");
    if (Number(student.active) === 0) {
      line(`Archived: ${student.archived_at || "Date not recorded"}`);
      if (student.archived_reason) line(`Archive reason: ${student.archived_reason}`);
    }
    line(`Current step: ${student.status.label}`);
    const violationCount = Number(student.counts.total_count || 0);
    const warningCount = Number(student.counts.warning_count || 0);
    line(`Current-term counts: ${violationCount} violation${violationCount === 1 ? "" : "s"} | ${student.counts.minor_count || 0} minor | ${student.counts.major_count || 0} major | ${warningCount} warning${warningCount === 1 ? "" : "s"}`);
    incidents("Technology History: Current Term", student.currentIncidents);
    incidents("Technology History: Previous Terms", student.previousIncidents);
    adjustments("Administrative Step Adjustments: Current Term", student.currentAdjustments);
    adjustments("Administrative Step Adjustments: Previous Terms", student.previousAdjustments);
    if (student.actions.length) {
      section("Follow-Up History: All Terms");
      for (const action of student.actions) record(`${action.title} | ${action.status}`, [
        action.created_at && `Created: ${action.created_at}`, action.due_on && `Due: ${action.due_on}`,
        action.completed_on && `Completed: ${action.completed_on}`, action.owner && `Owner: ${action.owner}`
      ], action.notes && `Notes: ${action.notes}`);
    }
    if (student.documents.length) {
      section("Stored Document Index");
      line("Uploaded files are listed below; their contents are not included in this PDF.");
      for (const item of student.documents) record(item.original_name,
        [item.title || item.action_title, item.term_name && `Term: ${item.term_name}`, item.uploaded_at && `Uploaded: ${item.uploaded_at}`]);
    }
    const range = doc.bufferedPageRange();
    for (let page = 0; page < range.count; page++) {
      doc.switchToPage(page);
      // Footer text sits below the content margin; disable that margin while
      // drawing it so PDFKit cannot create extra pages for each footer.
      const bottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.font("Helvetica").fontSize(8).fillColor("#647284");
      doc.text(`Confidential student record | ID ${student.student_number || student.id}`, 48, 758, { width: 400, lineBreak: false });
      doc.text(`Page ${page + 1} of ${range.count}`, 460, 758, { width: 104, align: "right", lineBreak: false });
      doc.page.margins.bottom = bottom;
    }
    doc.end();
  });
}

module.exports = { createStudentHistoryPdf, historyFilename };
