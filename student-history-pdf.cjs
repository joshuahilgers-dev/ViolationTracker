const PDFDocument = require("pdfkit");

const COLORS = {
  ink: "#17212b",
  muted: "#5b6b7c",
  line: "#d5dee7",
  panel: "#f5f8fa",
  teal: "#0f766e",
  tealLight: "#e5f3f1",
  removed: "#667085",
  removedBackground: "#eef1f4",
  white: "#ffffff"
};

const stepLabels = {
  reflection: "Digital Impact Reflection",
  success_contract: "Technology Success Contract",
  device_restriction: "5 school-day restriction",
  admin_review: "Admin review"
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function safeText(value) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
}

function dateParts(value) {
  const match = safeText(value).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: match[4] == null ? null : Number(match[4]),
    minute: match[5] == null ? null : Number(match[5])
  };
}

function formatDate(value) {
  const parts = dateParts(value);
  if (!parts || !MONTHS[parts.month - 1]) return safeText(value) || "Date not recorded";
  return `${MONTHS[parts.month - 1]} ${parts.day}, ${parts.year}`;
}

function formatDateTime(value) {
  const parts = dateParts(value);
  if (!parts || parts.hour == null) return formatDate(value);
  const suffix = parts.hour >= 12 ? "PM" : "AM";
  const hour = parts.hour % 12 || 12;
  return `${formatDate(value)} at ${hour}:${String(parts.minute || 0).padStart(2, "0")} ${suffix}`;
}

function formatGeneratedAt(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return formatDateTime(value);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date).replace(/, (?=\d{1,2}:\d{2})/, " at ");
}

function schoolYearLabel(term) {
  const startedOn = term?.started_on || safeText(term?.name).match(/(\d{4}-\d{2}-\d{2})/)?.[1];
  const parts = dateParts(startedOn);
  if (!parts) return safeText(term?.name || term?.started_on || "Current term");
  return `${parts.year}-${String(parts.year + 1).slice(-2)} School Year`;
}

function historyFilename(student, now = new Date(), audience = "full") {
  const name = `${student.last_name}-${student.first_name}`.normalize("NFKD")
    .replace(/[^a-zA-Z0-9-]/g, "_").slice(0, 90);
  const prefix = audience === "parent" ? "Parent-Tech-History" : "Full-Tech-History";
  return `${prefix}-${name}-${student.id}-${now.toISOString().slice(0, 10)}.pdf`;
}

function createStudentHistoryPdf(student, term, now = new Date(), options = {}) {
  return new Promise((resolve, reject) => {
    const audience = options.audience === "parent" ? "parent" : "full";
    const isParent = audience === "parent";
    const doc = new PDFDocument({
      size: "LETTER",
      margins: { top: 48, bottom: 54, left: 48, right: 48 },
      bufferPages: true
    });
    const chunks = [];
    doc.on("data", chunk => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    const name = `${student.first_name} ${student.last_name}`;
    const contentX = doc.page.margins.left;
    const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const contentBottom = doc.page.height - doc.page.margins.bottom;
    const title = isParent ? "Student Technology History" : "Full Student Technology History";
    const termName = schoolYearLabel(term);
    let activeSection = "";

    function recordTermLabel(value) {
      return safeText(value) === safeText(term?.name) ? termName : schoolYearLabel({ name: value });
    }

    doc.info.Title = `${title} - ${name}`;
    doc.info.Author = "WRPS Technology Violation Tracker";

    function setFont(font = "Helvetica", size = 9, color = COLORS.ink) {
      doc.font(font).fontSize(size).fillColor(color);
    }

    function textHeight(value, width, font = "Helvetica", size = 9, lineGap = 2) {
      setFont(font, size);
      return doc.heightOfString(safeText(value), { width, lineGap });
    }

    function addContinuationPage() {
      doc.addPage();
      setFont("Helvetica-Bold", 8.5, COLORS.muted);
      doc.text("WRPS | TECHNOLOGY VIOLATION TRACKER", contentX, 50, { width: contentWidth / 2, lineBreak: false });
      setFont("Helvetica-Bold", 8, COLORS.muted);
      doc.text(`${name} | ID ${student.student_number || student.id}`, contentX + contentWidth / 2, 50, {
        width: contentWidth / 2,
        align: "right",
        lineBreak: false
      });
      doc.moveTo(contentX, 66).lineTo(contentX + contentWidth, 66).lineWidth(0.6).strokeColor(COLORS.line).stroke();
      doc.y = 79;
      if (activeSection) {
        setFont("Helvetica-Bold", 13, COLORS.ink);
        doc.text(`${activeSection} - continued`, contentX, doc.y, { width: contentWidth });
        doc.y += 8;
      }
    }

    function ensureSpace(height) {
      if (doc.y + height > contentBottom) addContinuationPage();
    }

    function drawBadge(value, rightX, y, fill = COLORS.tealLight, color = COLORS.teal) {
      const label = safeText(value).toUpperCase();
      setFont("Helvetica-Bold", 7, color);
      const width = Math.max(48, doc.widthOfString(label) + 16);
      doc.roundedRect(rightX - width, y, width, 15, 7).fill(fill);
      setFont("Helvetica-Bold", 7, color);
      doc.text(label, rightX - width, y + 4, { width, align: "center", lineBreak: false });
      return width;
    }

    function drawFirstPageHeader() {
      setFont("Helvetica-Bold", 9, COLORS.muted);
      doc.text("WRPS | TECHNOLOGY VIOLATION TRACKER", contentX, doc.y, { width: 330 });
      setFont("Helvetica-Bold", 22, COLORS.ink);
      doc.moveDown(0.65).text(title, { width: contentWidth });
      setFont("Helvetica-Bold", 16, COLORS.ink);
      doc.moveDown(0.28).text(name, { width: contentWidth });
      setFont("Helvetica", 8.7, COLORS.muted);
      doc.moveDown(0.45).text(
        `ID ${student.student_number || "Not set"} | Grade ${student.grade || "Not set"} | Device ${student.device_asset_tag || "not set"} | Generated ${formatGeneratedAt(now)}`,
        { width: contentWidth }
      );
      doc.moveDown(0.75);
    }

    function drawSummary() {
      const stats = [
        ["TOTAL VIOLATIONS", Number(student.counts?.total_count || 0)],
        ["MINOR", Number(student.counts?.minor_count || 0)],
        ["MAJOR", Number(student.counts?.major_count || 0)],
        ["WARNINGS", Number(student.counts?.warning_count || 0)]
      ];
      const gap = 9;
      const boxWidth = (contentWidth - gap * 3) / 4;
      const y = doc.y;
      for (let index = 0; index < stats.length; index += 1) {
        const x = contentX + index * (boxWidth + gap);
        doc.roundedRect(x, y, boxWidth, 42, 5).fillAndStroke(COLORS.panel, COLORS.line);
        setFont("Helvetica-Bold", 6.5, COLORS.muted);
        doc.text(stats[index][0], x + 10, y + 9, { width: boxWidth - 20, lineBreak: false });
        setFont("Helvetica-Bold", 13, COLORS.ink);
        doc.text(String(stats[index][1]), x + 10, y + 23, { width: boxWidth - 20, lineBreak: false });
      }
      const stepY = y + 52;
      doc.roundedRect(contentX, stepY, contentWidth, 44, 5).fillAndStroke(COLORS.tealLight, "#b9dbd7");
      setFont("Helvetica-Bold", 6.5, COLORS.teal);
      doc.text("CURRENT STEP", contentX + 11, stepY + 8, { width: contentWidth - 22, lineBreak: false });
      setFont("Helvetica-Bold", 11, COLORS.ink);
      doc.text(student.status?.label || "Not set", contentX + 11, stepY + 22, { width: contentWidth - 22, lineBreak: false });
      setFont("Helvetica", 7.5, COLORS.muted);
      doc.text(isParent
        ? `Current term: ${termName}. This summary shows the student's recorded violations and warnings.`
        : `Current term: ${termName}. Full history includes removed entries and internal workflow details.`,
      contentX, stepY + 54, { width: contentWidth });
      doc.y = stepY + 75;
    }

    function section(sectionTitle, subtitle = "") {
      activeSection = "";
      ensureSpace(subtitle ? 62 : 48);
      activeSection = sectionTitle;
      doc.y += 4;
      setFont("Helvetica-Bold", 14, COLORS.ink);
      doc.text(sectionTitle, contentX, doc.y, { width: contentWidth });
      if (subtitle) {
        setFont("Helvetica", 7.5, COLORS.muted);
        doc.text(subtitle, contentX, doc.y + 2, { width: contentWidth });
      }
      doc.y += 9;
    }

    function drawRecordCard({
      heading,
      status = "",
      date = "",
      metadata = [],
      notes = "",
      removed = false,
      compact = false
    }) {
      const x = contentX;
      const width = contentWidth;
      const padding = compact ? 10 : 12;
      const innerWidth = width - padding * 2;
      const headingSize = compact ? 9 : 10;
      const bodySize = compact ? 7.5 : 8;
      const lineGap = 2;
      setFont("Helvetica-Bold", 7);
      const badgeWidth = status ? Math.max(48, doc.widthOfString(status.toUpperCase()) + 16) : 0;
      const headingWidth = innerWidth - (badgeWidth ? badgeWidth + 10 : 0);
      const headingHeight = textHeight(heading, headingWidth, "Helvetica-Bold", headingSize, lineGap);
      const dateHeight = date ? textHeight(date, innerWidth, "Helvetica-Bold", 7.5, 1) + 3 : 0;
      const metadataRows = metadata.filter(Boolean).map(value => ({
        value: safeText(value),
        height: textHeight(value, innerWidth, "Helvetica", bodySize, lineGap)
      }));
      const metadataHeight = metadataRows.reduce((sum, row) => sum + row.height + 2, 0);
      const notesHeight = notes ? 11 + textHeight(notes, innerWidth, "Helvetica", bodySize, lineGap) : 0;
      const height = padding + headingHeight + 5 + dateHeight + metadataHeight + notesHeight + padding;
      const maxCardHeight = contentBottom - 92;

      if (height > maxCardHeight) {
        ensureSpace(85);
        setFont("Helvetica-Bold", headingSize, removed ? COLORS.removed : COLORS.ink);
        doc.text(heading, x + 4, doc.y, { width: width - 8, lineGap });
        if (date) {
          setFont("Helvetica-Bold", 7.5, COLORS.muted);
          doc.text(date, x + 4, doc.y + 3, { width: width - 8, lineGap: 1 });
        }
        for (const row of metadataRows) {
          setFont("Helvetica", bodySize, COLORS.ink);
          doc.text(row.value, x + 4, doc.y + 2, { width: width - 8, lineGap });
        }
        if (notes) {
          setFont("Helvetica-Bold", 7, COLORS.muted);
          doc.text("Notes", x + 4, doc.y + 4, { width: width - 8 });
          setFont("Helvetica", bodySize, COLORS.ink);
          doc.text(notes, x + 4, doc.y + 2, { width: width - 8, lineGap });
        }
        doc.y += 8;
        return;
      }

      ensureSpace(height + 10);
      const y = doc.y;
      const fill = removed ? COLORS.removedBackground : COLORS.white;
      const accent = removed ? COLORS.removed : COLORS.teal;
      doc.roundedRect(x, y, width, height, 5).fillAndStroke(fill, COLORS.line);
      doc.roundedRect(x, y, 4, height, 2).fill(accent);
      const textX = x + padding;
      let cursorY = y + padding;

      setFont("Helvetica-Bold", headingSize, removed ? COLORS.removed : COLORS.ink);
      doc.text(heading, textX, cursorY, { width: headingWidth, lineGap });
      if (status) {
        drawBadge(status, x + width - padding, y + padding - 1,
          removed ? COLORS.removedBackground : COLORS.tealLight,
          removed ? COLORS.removed : COLORS.teal);
      }
      cursorY += headingHeight + 5;
      if (date) {
        setFont("Helvetica-Bold", 7.5, COLORS.muted);
        doc.text(date, textX, cursorY, { width: innerWidth, lineGap: 1 });
        cursorY += dateHeight;
      }
      for (const row of metadataRows) {
        setFont("Helvetica", bodySize, COLORS.ink);
        doc.text(row.value, textX, cursorY, { width: innerWidth, lineGap });
        cursorY += row.height + 2;
      }
      if (notes) {
        setFont("Helvetica-Bold", 7, COLORS.muted);
        doc.text("Notes", textX, cursorY + 1, { width: innerWidth, lineBreak: false });
        cursorY += 11;
        setFont("Helvetica", bodySize, COLORS.ink);
        doc.text(notes, textX, cursorY, { width: innerWidth, lineGap });
      }
      doc.y = y + height + 9;
    }

    function incidentCard(incident) {
      const isWarning = incident.entry_type === "warning";
      const entryLabel = isWarning ? "Warning" : `${String(incident.severity || "").toLowerCase()} violation`;
      const removed = Boolean(incident.canceled_at);
      const status = removed ? "Removed" : (isWarning ? "Warning" : "Current");
      const metadata = [];
      if (!isParent && incident.reported_by) metadata.push(`Reported by: ${incident.reported_by}`);
      if (incident.class_period) metadata.push(`Class period: ${incident.class_period}`);
      if (incident.category) metadata.push(`Category: ${incident.category}`);
      if (!isParent && incident.converted_at) {
        metadata.push(`Converted to warning: ${formatDateTime(incident.converted_at)}${incident.converted_by ? ` by ${incident.converted_by}` : ""}`);
      } else if (isParent && incident.converted_at) {
        metadata.push(`Converted to warning: ${formatDate(incident.converted_at)}`);
      }
      if (!isParent && incident.conversion_reason) metadata.push(`Conversion reason: ${incident.conversion_reason}`);
      if (!isParent && incident.canceled_at) {
        metadata.push(`Removed: ${formatDateTime(incident.canceled_at)}${incident.canceled_by ? ` by ${incident.canceled_by}` : ""}`);
        if (incident.canceled_reason) metadata.push(`Removal reason: ${incident.canceled_reason}`);
      }
      drawRecordCard({
        heading: `${entryLabel.charAt(0).toUpperCase()}${entryLabel.slice(1)} | ${incident.infraction_label || "Uncategorized"}`,
        status,
        date: `${formatDate(incident.occurred_on)} | ${recordTermLabel(incident.term_name)}`,
        metadata,
        notes: incident.notes || "",
        removed
      });
    }

    function incidentSection(sectionTitle, rows) {
      const visibleRows = isParent ? rows.filter(item => !item.canceled_at) : rows;
      if (!visibleRows.length) return;
      section(sectionTitle, isParent
        ? "Entries shown here remain part of the student's recorded history."
        : "Includes warnings and removed entries for internal review.");
      for (const incident of visibleRows) incidentCard(incident);
    }

    function adjustmentSection(sectionTitle, rows) {
      if (!rows.length) return;
      section(sectionTitle);
      for (const item of rows) {
        const metadata = [
          item.term_name && `Term: ${recordTermLabel(item.term_name)}`,
          item.adjusted_by && `Adjusted by: ${item.adjusted_by}`,
          item.ended_at && `Ended: ${formatDateTime(item.ended_at)}${item.ended_by ? ` by ${item.ended_by}` : ""}`,
          `Reason: ${item.reason || "Not recorded"}`,
          item.ended_reason && `End reason: ${item.ended_reason}`
        ].filter(Boolean);
        drawRecordCard({
          heading: stepLabels[item.target_step] || item.target_step,
          status: item.ended_at ? "Ended" : "Active override",
          date: formatDate(item.created_at),
          metadata,
          removed: Boolean(item.ended_at),
          compact: true
        });
      }
    }

    function actionSection(actions) {
      if (!actions.length) return;
      section("Follow-Up History: All Terms", "Internal workflow and completion history.");
      for (const action of actions) {
        const metadata = [
          action.created_at && `Created: ${formatDateTime(action.created_at)}`,
          action.due_on && `Due: ${formatDate(action.due_on)}`,
          action.check_in_through && `Teacher check-ins through: ${formatDate(action.check_in_through)}`,
          action.completed_on && `Completed: ${formatDate(action.completed_on)}`,
          action.owner && `Owner: ${action.owner}`
        ].filter(Boolean);
        drawRecordCard({
          heading: action.title,
          status: action.status,
          metadata,
          notes: action.notes || "",
          compact: true
        });
      }
    }

    function documentSection(documents) {
      if (!documents.length) return;
      section("Stored Document Index", "Uploaded files are listed below; their contents are not included in this PDF.");
      for (const item of documents) {
        drawRecordCard({
          heading: item.original_name,
          metadata: [
            item.title || item.action_title,
            item.term_name && `Term: ${recordTermLabel(item.term_name)}`,
            item.uploaded_at && `Uploaded: ${formatDateTime(item.uploaded_at)}`,
            item.uploaded_by && `Uploaded by: ${item.uploaded_by}`
          ].filter(Boolean),
          compact: true
        });
      }
    }

    drawFirstPageHeader();
    drawSummary();

    if (Number(student.active) === 0) {
      section("Archived Student");
      drawRecordCard({
        heading: "Archived record",
        status: "Archived",
        date: formatDate(student.archived_at),
        metadata: !isParent && student.archived_by ? [`Archived by: ${student.archived_by}`] : [],
        notes: student.archived_reason || ""
      });
    }

    incidentSection("Technology History: Current Term", student.currentIncidents || []);
    incidentSection("Technology History: Previous Terms", student.previousIncidents || []);

    if (!isParent) {
      adjustmentSection("Administrative Step Adjustments: Current Term", student.currentAdjustments || []);
      adjustmentSection("Administrative Step Adjustments: Previous Terms", student.previousAdjustments || []);
      actionSection(student.actions || []);
      documentSection(student.documents || []);
    }

    if (isParent && !(student.currentIncidents || []).some(item => !item.canceled_at)
      && !(student.previousIncidents || []).some(item => !item.canceled_at)) {
      section("Technology History");
      setFont("Helvetica", 9, COLORS.muted);
      doc.text("No active violations or warnings are recorded for this student.", contentX, doc.y, { width: contentWidth });
    }

    const range = doc.bufferedPageRange();
    for (let page = 0; page < range.count; page += 1) {
      doc.switchToPage(page);
      const bottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.moveTo(contentX, 748).lineTo(contentX + contentWidth, 748).lineWidth(0.6).strokeColor(COLORS.line).stroke();
      setFont("Helvetica", 8, COLORS.muted);
      doc.text(`Confidential student record | ID ${student.student_number || student.id}`, contentX, 758, {
        width: 400,
        lineBreak: false
      });
      doc.text(`Page ${page + 1} of ${range.count}`, 460, 758, { width: 104, align: "right", lineBreak: false });
      doc.page.margins.bottom = bottom;
    }
    doc.end();
  });
}

module.exports = {
  createStudentHistoryPdf,
  formatDate,
  formatDateTime,
  historyFilename,
  schoolYearLabel
};
