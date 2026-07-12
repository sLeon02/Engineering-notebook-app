export const runtime = 'nodejs';

const GEMINI_MODEL = 'gemini-flash-latest';

async function urlToBase64(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch photo: ${url}`);
  const mimeType = res.headers.get('content-type') || 'image/jpeg';
  const buffer = await res.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  return { mimeType, base64 };
}

export async function POST(request) {
  try {
    const { project, title, date, author, notes, photos } = await request.json();

    if (!process.env.GEMINI_API_KEY) {
      return Response.json(
        { error: 'Server is missing GEMINI_API_KEY. Add it in Vercel/.env.local.' },
        { status: 500 }
      );
    }

    if (!notes?.trim() && (!photos || photos.length === 0)) {
      return Response.json(
        { error: 'Add some notes or at least one photo first.' },
        { status: 400 }
      );
    }

    const promptText = `
Project: ${project || 'Untitled project'}
Entry title: ${title || '(untitled)'}
Date: ${date}
Logged by: ${author || '(unspecified)'}

Raw notes from the student:
"""
${notes || '(no written notes provided — base the entry mainly on the photos)'}
"""

Using the notes and any attached photos above, write this up as a single, well-organized
engineering notebook entry suitable for a STEM/robotics design notebook. Use these section
headers, in this order:

OBJECTIVE
PROCESS & OBSERVATIONS
DATA / RESULTS
REFLECTION & NEXT STEPS

Guidelines:
- Write in first person, as the student, in a clear, professional but natural student voice.
- Only use facts, numbers, and details actually present in the notes or visible in the photos.
  Do not invent data, measurements, or outcomes that weren't given.
- If a section has nothing to say yet, write a brief honest placeholder such as
  "Results pending — see next entry" rather than making something up.
- Reference photos naturally where relevant, without needing image numbers.
- Keep it concise: a few sentences per section is enough.
- Do not repeat the title/date/project header block in your output — just the four sections.
`.trim();

    // Gemini needs raw image bytes, not a hosted URL, so fetch each Supabase photo first.
    const imageParts = [];
    for (const p of photos || []) {
      if (!p.url) continue;
      try {
        const { mimeType, base64 } = await urlToBase64(p.url);
        imageParts.push({ inline_data: { mime_type: mimeType, data: base64 } });
        if (p.caption) imageParts.push({ text: `[Photo caption: ${p.caption}]` });
      } catch (err) {
        console.error('Skipping photo, could not fetch:', err.message);
      }
    }

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: {
            parts: [
              {
                text:
                  'You are helping a high school engineering student write up their design ' +
                  'notebook entries clearly, honestly, and in their own voice. Never fabricate ' +
                  'data or outcomes not present in the provided notes or photos.',
              },
            ],
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: promptText }, ...imageParts],
            },
          ],
          generationConfig: {
            maxOutputTokens: 2048,
            // These flash models "think" before answering by default, and that
            // thinking eats into maxOutputTokens, which is what was truncating
            // replies. We don't need that extra reasoning step for this task.
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      }
    );

    if (!geminiResponse.ok) {
      const errBody = await geminiResponse.text();
      console.error('Gemini error:', errBody);
      return Response.json(
        { error: 'Gemini request failed. Check your API key.' },
        { status: 502 }
      );
    }

    const data = await geminiResponse.json();
    const candidate = data.candidates?.[0];
    const text = candidate?.content?.parts?.map((p) => p.text || '').join('').trim();

    if (!text) {
      return Response.json({ error: 'Gemini returned no text.' }, { status: 502 });
    }

    const truncated = candidate?.finishReason === 'MAX_TOKENS';
    return Response.json({
      text,
      warning: truncated
        ? 'The reply hit the length limit and may be cut off. Try shortening your notes/photos, or ask to regenerate.'
        : null,
    });
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Unexpected server error.' }, { status: 500 });
  }
}
