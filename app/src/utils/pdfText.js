// Browser-only PDF text extraction. We use pdfjs-dist's legacy ESM build to
// stay compatible with Vite, and configure the worker via a Vite ?url import
// so it ships as a static asset on GitHub Pages.

import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * Extracts text from a PDF File/Blob, line by line, by grouping text items
 * that share approximately the same Y coordinate on each page. PDFs don't
 * have a real concept of "lines" - we synthesize them.
 *
 * @param {File|Blob|ArrayBuffer} input
 * @param {(progress:{page:number,total:number})=>void} [onProgress]
 * @returns {Promise<string[]>} Array of line strings across all pages.
 */
export async function extractTextLines(input, onProgress) {
  const data =
    input instanceof ArrayBuffer
      ? new Uint8Array(input)
      : new Uint8Array(await input.arrayBuffer());

  const doc = await pdfjsLib.getDocument({ data }).promise;
  const allLines = [];

  for (let p = 1; p <= doc.numPages; p++) {
    if (onProgress) onProgress({ page: p, total: doc.numPages });
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();

    const items = tc.items
      .filter((it) => typeof it.str === 'string' && it.str.length)
      .map((it) => ({
        str: it.str,
        x: it.transform[4],
        y: Math.round(it.transform[5]),
      }));

    items.sort((a, b) => b.y - a.y || a.x - b.x);

    let currentY = null;
    let buffer = [];
    const flush = () => {
      if (!buffer.length) return;
      const line = buffer
        .map((it) => it.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (line) allLines.push(line);
      buffer = [];
    };

    for (const it of items) {
      if (currentY === null) currentY = it.y;
      if (Math.abs(it.y - currentY) > 2) {
        flush();
        currentY = it.y;
      }
      buffer.push(it);
    }
    flush();
  }

  await doc.cleanup();
  return allLines;
}
