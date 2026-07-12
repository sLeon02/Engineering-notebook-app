const { rgb, StandardFonts } = require('pdf-lib');

const PAGE_W = 612;
const PAGE_H = 792;
const GRID = 18;
const MARGIN_LEFT = 76;
const MARGIN_RIGHT = 40;
const CONTENT_RIGHT = PAGE_W - MARGIN_RIGHT;
const CONTENT_WIDTH = CONTENT_RIGHT - MARGIN_LEFT;
const TOP_START = PAGE_H - 96;
const BOTTOM_RESERVED = 96; // reserved for the signature block, present on every page

const INK = rgb(0.11, 0.17, 0.23);
const INK_SOFT = rgb(0.29, 0.35, 0.44);
const GRIDLINE = rgb(0.82, 0.87, 0.92);
const MARGIN_RED = rgb(0.72, 0.35, 0.35);
const BLUEPRINT = rgb(0.17, 0.37, 0.54);

function drawPageShell(pdfDoc, fonts, { project, pageNumber, continuation }) {
  const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  const { width, height } = page.getSize();

  // quad-ruled grid
  for (let x = MARGIN_LEFT; x <= width - MARGIN_RIGHT; x += GRID) {
    page.drawLine({ start: { x, y: 24 }, end: { x, y: height - 24 }, thickness: 0.4, color: GRIDLINE });
  }
  for (let y = 24; y <= height - 24; y += GRID) {
    page.drawLine({ start: { x: MARGIN_LEFT, y }, end: { x: width - MARGIN_RIGHT, y }, thickness: 0.4, color: GRIDLINE });
  }
  // binding margin (red rule) + punch holes, like a legal/engineering pad
  page.drawLine({ start: { x: MARGIN_LEFT - 8, y: 0 }, end: { x: MARGIN_LEFT - 8, y: height }, thickness: 1.1, color: MARGIN_RED });
  for (let hy = 48; hy < height - 40; hy += 60) {
    page.drawCircle({ x: 22, y: hy, size: 4.5, color: rgb(0.95, 0.95, 0.93), borderColor: rgb(0.72, 0.72, 0.68), borderWidth: 0.8 });
  }

  // header
  page.drawText(project || 'Untitled project', {
    x: MARGIN_LEFT, y: height - 32, size: 9, font: fonts.mono, color: INK_SOFT,
  });
  const stampLabel = `PAGE ${String(pageNumber).padStart(3, '0')}`;
  page.drawRectangle({
    x: CONTENT_RIGHT - 74, y: height - 44, width: 74, height: 18,
    borderColor: BLUEPRINT, borderWidth: 1,
  });
  page.drawText(stampLabel, {
    x: CONTENT_RIGHT - 66, y: height - 39, size: 9, font: fonts.mono, color: BLUEPRINT,
  });
  if (continuation) {
    page.drawText('(continued)', {
      x: CONTENT_RIGHT - 150, y: height - 39, size: 8, font: fonts.mono, color: INK_SOFT,
    });
  }

  // signature block — present on every page, matching real IP-documentation notebooks
  const sigY = 50;
  page.drawLine({ start: { x: MARGIN_LEFT, y: sigY + 14 }, end: { x: 300, y: sigY + 14 }, thickness: 0.8, color: INK_SOFT });
  page.drawText('Entered by', { x: MARGIN_LEFT, y: sigY, size: 7.5, font: fonts.mono, color: INK_SOFT });
  page.drawLine({ start: { x: 320, y: sigY + 14 }, end: { x: 420, y: sigY + 14 }, thickness: 0.8, color: INK_SOFT });
  page.drawText('Date', { x: 320, y: sigY, size: 7.5, font: fonts.mono, color: INK_SOFT });

  page.drawLine({ start: { x: MARGIN_LEFT, y: sigY - 20 }, end: { x: 300, y: sigY - 20 }, thickness: 0.8, color: INK_SOFT });
  page.drawText('Witnessed & understood by', { x: MARGIN_LEFT, y: sigY - 34, size: 7.5, font: fonts.mono, color: INK_SOFT });
  page.drawLine({ start: { x: 320, y: sigY - 20 }, end: { x: 420, y: sigY - 20 }, thickness: 0.8, color: INK_SOFT });
  page.drawText('Date', { x: 320, y: sigY - 34, size: 7.5, font: fonts.mono, color: INK_SOFT });

  return page;
}

function wrapText(text, font, size, maxWidth) {
  const paragraphs = String(text || '').split(/\n/);
  const lines = [];
  paragraphs.forEach((para) => {
    if (para.trim() === '') { lines.push(''); return; }
    const words = para.split(/\s+/);
    let current = '';
    words.forEach((word) => {
      const test = current ? current + ' ' + word : word;
      if (font.widthOfTextAtSize(test, size) > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    });
    if (current) lines.push(current);
  });
  return lines;
}

const SECTION_HEADER = /^[A-Z][A-Z &/]{3,}$/;

/**
 * Builds the full notebook PDF.
 * @param {import('pdf-lib').PDFDocument} pdfDoc
 * @param {{ project: string, entries: Array }} data
 * @param {(url: string) => Promise<{bytes: Buffer, mimeType: string}>} fetchPhoto
 */
async function buildNotebookPdf(pdfDoc, { project, entries }, fetchPhoto) {
  const fonts = {
    mono: await pdfDoc.embedFont(StandardFonts.Courier),
    body: await pdfDoc.embedFont(StandardFonts.Courier),
    bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
  };

  let pageNumber = 0;
  let page = null;
  let cursorY = 0;

  function newPage(continuation) {
    pageNumber += 1;
    page = drawPageShell(pdfDoc, fonts, { project, pageNumber, continuation });
    cursorY = TOP_START;
  }

  function ensureSpace(height) {
    if (cursorY - height < BOTTOM_RESERVED) {
      newPage(true);
    }
  }

  // cover page
  newPage(false);
  page.drawText('ENGINEERING NOTEBOOK', { x: MARGIN_LEFT, y: 520, size: 26, font: fonts.bold, color: INK });
  page.drawText(project || 'Untitled project', { x: MARGIN_LEFT, y: 490, size: 14, font: fonts.mono, color: BLUEPRINT });
  page.drawText(`Compiled ${new Date().toISOString().slice(0, 10)}  ·  ${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`, {
    x: MARGIN_LEFT, y: 468, size: 10, font: fonts.mono, color: INK_SOFT,
  });

  // entries, oldest first so the notebook reads chronologically
  const ordered = [...entries].sort(
    (a, b) => new Date(a.entry_date || 0) - new Date(b.entry_date || 0)
  );

  for (const entry of ordered) {
    newPage(false);

    page.drawText(entry.title || 'Untitled entry', {
      x: MARGIN_LEFT, y: cursorY, size: 19, font: fonts.bold, color: INK,
    });
    cursorY -= 20;
    page.drawText(
      `Date: ${entry.entry_date || '—'}        Logged by: ${entry.author || '—'}`,
      { x: MARGIN_LEFT, y: cursorY, size: 9.5, font: fonts.mono, color: INK_SOFT }
    );
    cursorY -= 24;

    const bodySource = entry.generated?.trim() || entry.notes?.trim() || '(no notes recorded)';
    const lines = wrapText(bodySource, fonts.body, 10.5, CONTENT_WIDTH - 8);
    const lineHeight = 14;

    for (const line of lines) {
      ensureSpace(lineHeight);
      const isHeader = SECTION_HEADER.test(line.trim());
      page.drawText(line, {
        x: MARGIN_LEFT,
        y: cursorY,
        size: 10.5,
        font: isHeader ? fonts.bold : fonts.body,
        color: isHeader ? BLUEPRINT : INK,
      });
      cursorY -= lineHeight;
      if (isHeader) cursorY -= 2;
    }

    // photos, in rows of up to 3
    if (entry.photos?.length) {
      cursorY -= 12;
      const photoW = 148;
      const gap = 12;
      let col = 0;
      let rowMaxH = 0;
      let rowStartY = cursorY;

      for (const photo of entry.photos) {
        let embedded = null;
        try {
          const { bytes, mimeType } = await fetchPhoto(photo.url);
          embedded = mimeType.includes('png')
            ? await pdfDoc.embedPng(bytes)
            : await pdfDoc.embedJpg(bytes);
        } catch (err) {
          console.error('Could not embed photo:', photo.url, err.message);
        }
        if (!embedded) continue;

        const photoH = (embedded.height / embedded.width) * photoW;
        const blockH = photoH + 14;
        rowMaxH = Math.max(rowMaxH, blockH);

        if (col === 0) ensureSpace(blockH), (rowStartY = cursorY);

        const x = MARGIN_LEFT + col * (photoW + gap);
        page.drawImage(embedded, { x, y: rowStartY - photoH, width: photoW, height: photoH });
        if (photo.caption) {
          const capLines = wrapText(photo.caption, fonts.mono, 7.5, photoW);
          page.drawText(capLines[0] || '', {
            x, y: rowStartY - photoH - 11, size: 7.5, font: fonts.mono, color: INK_SOFT,
          });
        }

        col += 1;
        if (col === 3) {
          col = 0;
          cursorY = rowStartY - rowMaxH;
          rowMaxH = 0;
        }
      }
      if (col !== 0) cursorY = rowStartY - rowMaxH;
    }
  }

  return pdfDoc.save();
}

module.exports = { buildNotebookPdf };
