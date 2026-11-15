export const DOCUMENT_LIMITS = {
  maxFileBytes: 20 * 1024 * 1024,
  maxPdfPages: 100,
  maxOcrPages: 25,
  maxExtractedCharacters: 250000,
  maxSectionCharacters: 40000,
};

const extensionOf = (name = '') => name.toLowerCase().match(/\.([^.]+)$/)?.[1] || '';

export function validateDocumentFile(file, limits = DOCUMENT_LIMITS) {
  if (!file || typeof file.name !== 'string') throw new Error('Choose a PDF, TXT, or DOCX file.');
  const extension = extensionOf(file.name);
  if (!['pdf', 'txt', 'docx'].includes(extension)) throw new Error('Unsupported file type. Choose a PDF, TXT, or DOCX file.');
  if (!file.size) throw new Error('This file is empty.');
  if (file.size > limits.maxFileBytes) throw new Error(`This file is larger than ${Math.round(limits.maxFileBytes / 1024 / 1024)} MB.`);
  return extension;
}

export function chunkText(text, maxCharacters = DOCUMENT_LIMITS.maxSectionCharacters) {
  const normalized = text.replace(/\r\n?/g, '\n').trim();
  if (!normalized) return [];
  const explicitPages = normalized.split('\f').map((part) => part.trim()).filter(Boolean);
  const chunks = [];
  for (const page of explicitPages) {
    let remaining = page;
    while (remaining.length > maxCharacters) {
      let cut = remaining.lastIndexOf('\n', maxCharacters);
      if (cut < maxCharacters * .6) cut = remaining.lastIndexOf(' ', maxCharacters);
      if (cut < maxCharacters * .6) cut = maxCharacters;
      chunks.push(remaining.slice(0, cut).trim());
      remaining = remaining.slice(cut).trim();
    }
    if (remaining) chunks.push(remaining);
  }
  return chunks;
}

function ensureSafeTotal(sections, limits) {
  const total = sections.reduce((sum, section) => sum + section.text.length, 0);
  if (!total) throw new Error('No readable text was found in this document.');
  if (total > limits.maxExtractedCharacters) {
    throw new Error(`This document contains more than ${limits.maxExtractedCharacters.toLocaleString()} characters. Split it into smaller files.`);
  }
  return sections;
}

async function defaultPdfLoader() {
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  return pdfjs;
}

async function defaultDocxLoader() {
  const loaded = await import('mammoth/mammoth.browser.js');
  return loaded.default ?? loaded;
}

async function defaultOcr(file, options = {}) {
  const [{ recognizeBest }, { browserTools }] = await Promise.all([
    import('../../camera/src/ocr/ocr.js'),
    import('../../camera/src/ocr/imageTools.js'),
  ]);
  return recognizeBest(file, { ...options, tools: options.tools || browserTools });
}

async function renderPdfPage(page, pageNumber) {
  const viewport = page.getViewport({ scale: 1.6 });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext('2d', { alpha: false });
  await page.render({ canvasContext: context, viewport }).promise;
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', .92));
  if (!blob) throw new Error(`Could not prepare PDF page ${pageNumber} for OCR.`);
  return new File([blob], `pdf-page-${pageNumber}.jpg`, { type: 'image/jpeg' });
}

function pdfItemsToText(items) {
  let text = '';
  for (const item of items) {
    if (!item?.str) continue;
    text += item.str;
    text += item.hasEOL ? '\n' : ' ';
  }
  return text.replace(/[ \t]+\n/g, '\n').replace(/[ \t]{2,}/g, ' ').trim();
}

async function extractPdf(file, options) {
  const { limits, onStatus, pdfLoader, ocr, renderPage, tools } = options;
  const pdfjs = await pdfLoader();
  const loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer() });
  const pdf = await loadingTask.promise;
  if (!pdf.numPages) throw new Error('This PDF has no pages.');
  if (pdf.numPages > limits.maxPdfPages) throw new Error(`This PDF has more than ${limits.maxPdfPages} pages. Split it into smaller files.`);
  const sections = [];
  let ocrCount = 0;
  for (let number = 1; number <= pdf.numPages; number += 1) {
    onStatus?.(`Reading PDF page ${number} of ${pdf.numPages}.`);
    const page = await pdf.getPage(number);
    let text = pdfItemsToText((await page.getTextContent()).items || []);
    let method = 'text';
    if (text.length < 12) {
      ocrCount += 1;
      if (ocrCount > limits.maxOcrPages) throw new Error(`This PDF needs OCR on more than ${limits.maxOcrPages} pages. Split it into smaller files.`);
      onStatus?.(`Running private on-device OCR on PDF page ${number} of ${pdf.numPages}.`);
      const image = await renderPage(page, number);
      const output = await ocr(image, { tools, onStatus: (status) => onStatus?.(`Page ${number}: ${status}`) });
      text = (typeof output === 'string' ? output : output.text || '').trim();
      method = 'ocr';
    }
    if (text) sections.push({ id: `page-${number}`, label: `Page ${number}`, text, method });
    else sections.push({ id: `page-${number}`, label: `Page ${number}`, text: '', method, empty: true });
  }
  return { kind: 'pdf', sections, pageCount: pdf.numPages, usedOcr: ocrCount > 0 };
}

async function extractTxt(file, { limits, onStatus }) {
  onStatus?.('Reading text file.');
  const chunks = chunkText(await file.text(), limits.maxSectionCharacters);
  return { kind: 'txt', sections: chunks.map((text, index) => ({ id: `section-${index + 1}`, label: chunks.length === 1 ? 'Text' : `Section ${index + 1}`, text, method: 'text' })) };
}

async function extractDocx(file, { limits, onStatus, docxLoader }) {
  onStatus?.('Reading DOCX paragraphs.');
  const mammoth = await docxLoader();
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  const paragraphs = result.value.replace(/\r\n?/g, '\n').split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const chunks = chunkText(paragraphs.join('\n\n'), limits.maxSectionCharacters);
  return {
    kind: 'docx',
    sections: chunks.map((text, index) => ({ id: `section-${index + 1}`, label: chunks.length === 1 ? 'Document' : `Section ${index + 1}`, text, method: 'text' })),
    warnings: (result.messages || []).map((message) => message.message).filter(Boolean),
  };
}

export async function extractDocument(file, {
  limits = DOCUMENT_LIMITS, onStatus,
  pdfLoader = defaultPdfLoader, docxLoader = defaultDocxLoader,
  ocr = defaultOcr, renderPage = renderPdfPage, tools,
} = {}) {
  const kind = validateDocumentFile(file, limits);
  let result;
  if (kind === 'pdf') result = await extractPdf(file, { limits, onStatus, pdfLoader, ocr, renderPage, tools });
  else if (kind === 'docx') result = await extractDocx(file, { limits, onStatus, docxLoader });
  else result = await extractTxt(file, { limits, onStatus });
  ensureSafeTotal(result.sections, limits);
  return { ...result, name: file.name };
}
