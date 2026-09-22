const { PDFDocument } = require("pdf-lib");

async function inspectPdf(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    throw new Error("The selected PDF is empty.");
  }
  if (!buffer.subarray(0, 1024).includes(Buffer.from("%PDF-"))) {
    throw new Error("The selected file is not a valid PDF.");
  }

  let document;
  try {
    document = await PDFDocument.load(buffer, { updateMetadata: false });
  } catch {
    throw new Error("The PDF could not be opened. Upload an unencrypted, valid PDF.");
  }

  const pageCount = document.getPageCount();
  if (!pageCount) throw new Error("The PDF must contain at least one page.");
  return { pageCount };
}

async function appendPdf(baseBuffer, appendixBuffer) {
  const base = await PDFDocument.load(baseBuffer, { updateMetadata: false });
  const appendix = await PDFDocument.load(appendixBuffer, { updateMetadata: false });
  const pages = await base.copyPages(appendix, appendix.getPageIndices());
  for (const page of pages) base.addPage(page);
  return Buffer.from(await base.save());
}

module.exports = {
  appendPdf,
  inspectPdf
};
