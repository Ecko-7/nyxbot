import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

const WORKER_URL =
  process.env.NYX_WORKER_URL ??
  'https://nyx-image-gen.bullmans-account7516.workers.dev';

const MAX_PROMPT_LEN = 500;
const FETCH_TIMEOUT_MS = 55_000; // 55s - leaves 5s buffer under maxDuration

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json();

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Invalid prompt.' }, { status: 400 });
    }

    if (prompt.length > MAX_PROMPT_LEN) {
      return NextResponse.json(
        { error: `Prompt must be <= ${MAX_PROMPT_LEN} characters.` },
        { status: 400 }
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let cfRes: Response;
    try {
      cfRes = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
        signal: controller.signal,
      });
    } catch (e) {
      console.error('Worker fetch error:', e);
      return NextResponse.json(
        { error: 'Image generation timed out or failed.' },
        { status: 504 }
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!cfRes.ok) {
      const err = await cfRes.text();
      console.error('Worker error:', err.slice(0, 200));
      return NextResponse.json({ error: 'Image generation failed.' }, { status: 502 });
    }

    const arrayBuffer = await cfRes.arrayBuffer();
    const contentType = cfRes.headers.get('content-type') ?? 'image/jpeg';
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    return NextResponse.json({ image: `data:${contentType};base64,${base64}` });

  } catch (e) {
    console.error('nyx-image error:', e);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
