import { PDFDocument } from 'pdf-lib';
import { buildNotebookPdf } from '../../../lib/notebookPdf';

export const runtime = 'nodejs';

async function fetchPhoto(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch photo: ${url}`);
  const mimeType = res.headers.get('content-type') || 'image/jpeg';
  const arrayBuffer = await res.arrayBuffer();
  return { bytes: Buffer.from(arrayBuffer), mimeType };
}

export async function POST(request) {
  try {
    const { project, entries } = await request.json();

    if (!entries || entries.length === 0) {
      return Response.json({ error: 'No entries to export yet.' }, { status: 400 });
    }

    const pdfDoc = await PDFDocument.create();
    pdfDoc.setTitle(`Engineering Notebook — ${project || 'Untitled project'}`);
    pdfDoc.setProducer('Engineering Notebook Builder');

    const bytes = await buildNotebookPdf(pdfDoc, { project, entries }, fetchPhoto);

    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="engineering-notebook.pdf"`,
      },
    });
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Could not generate the PDF. Please try again.' }, { status: 500 });
  }
}
