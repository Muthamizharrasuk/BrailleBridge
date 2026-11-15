import { describe, expect, it, vi } from 'vitest';
import { DOCUMENT_LIMITS, extractDocument, validateDocumentFile } from './extractDocument.js';

const file = (name, { text = '', size = 10 } = {}) => ({
  name, size,
  text: async () => text,
  arrayBuffer: async () => new ArrayBuffer(8),
});

const pdfLoader = (pages) => async () => ({
  getDocument: () => ({ promise: Promise.resolve({
    numPages: pages.length,
    getPage: async (number) => pages[number - 1],
  }) }),
});

const pdfPage = (items = []) => ({ getTextContent: async () => ({ items }) });

describe('document extraction', () => {
  it('extracts and sections TXT files without changing order', async () => {
    const result = await extractDocument(file('notes.txt', { text: 'First page\fSecond page' }));
    expect(result.kind).toBe('txt');
    expect(result.sections.map((section) => section.text)).toEqual(['First page', 'Second page']);
  });

  it('extracts selectable PDF text page by page', async () => {
    const pages = [
      pdfPage([{ str: 'Page one', hasEOL: true }, { str: 'Second line' }]),
      pdfPage([{ str: 'Page two text' }]),
    ];
    const result = await extractDocument(file('book.pdf'), { pdfLoader: pdfLoader(pages) });
    expect(result.sections).toMatchObject([
      { label: 'Page 1', text: 'Page one\nSecond line', method: 'text' },
      { label: 'Page 2', text: 'Page two text', method: 'text' },
    ]);
    expect(result.usedOcr).toBe(false);
  });

  it('uses the existing OCR path for scanned PDF pages', async () => {
    const page = pdfPage([]);
    const image = file('pdf-page-1.jpg');
    const renderPage = vi.fn().mockResolvedValue(image);
    const ocr = vi.fn().mockResolvedValue({ text: 'Scanned words', confidence: 91 });
    const statuses = [];
    const result = await extractDocument(file('scan.pdf'), {
      pdfLoader: pdfLoader([page]), renderPage, ocr, tools: {}, onStatus: (status) => statuses.push(status),
    });
    expect(renderPage).toHaveBeenCalledWith(page, 1);
    expect(ocr.mock.calls[0][0]).toBe(image);
    expect(result.sections[0]).toMatchObject({ text: 'Scanned words', method: 'ocr' });
    expect(result.usedOcr).toBe(true);
    expect(statuses.join(' ')).toMatch(/on-device OCR/i);
  });

  it('extracts DOCX paragraphs in their original order', async () => {
    const docxLoader = async () => ({ extractRawText: vi.fn().mockResolvedValue({ value: 'Heading\n\nFirst paragraph.\n\nSecond paragraph.', messages: [] }) });
    const result = await extractDocument(file('letter.docx'), { docxLoader });
    expect(result.sections[0].text).toBe('Heading\n\nFirst paragraph.\n\nSecond paragraph.');
  });

  it('rejects unsupported, empty, oversized, and textless files', async () => {
    expect(() => validateDocumentFile(file('image.png'))).toThrow(/Unsupported/);
    expect(() => validateDocumentFile(file('empty.txt', { size: 0 }))).toThrow(/empty/);
    expect(() => validateDocumentFile(file('large.pdf', { size: DOCUMENT_LIMITS.maxFileBytes + 1 }))).toThrow(/larger/);
    await expect(extractDocument(file('blank.txt'))).rejects.toThrow(/No readable text/);
  });

  it('rejects PDFs beyond page and OCR safety limits', async () => {
    const tooMany = Array.from({ length: DOCUMENT_LIMITS.maxPdfPages + 1 }, () => pdfPage([]));
    await expect(extractDocument(file('long.pdf'), { pdfLoader: pdfLoader(tooMany) })).rejects.toThrow(/more than 100 pages/);
    const scanned = Array.from({ length: 2 }, () => pdfPage([]));
    await expect(extractDocument(file('scan.pdf'), {
      limits: { ...DOCUMENT_LIMITS, maxOcrPages: 1 }, pdfLoader: pdfLoader(scanned),
      renderPage: vi.fn().mockResolvedValue(file('page.jpg')), ocr: vi.fn().mockResolvedValue('words'), tools: {},
    })).rejects.toThrow(/more than 1 pages/);
  });
});
