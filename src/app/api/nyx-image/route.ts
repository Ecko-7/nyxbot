import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60; // FLUX cold starts can take 35-50s on free HF tier

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

function enhancePrompt(prompt: string, nsfw: boolean): string {
  const qualityTags = 'cinematic lighting, ultra detailed, high quality, 8k';
  const nsfwTags = nsfw ? ', explicit, uncensored, nsfw' : ', safe for work';
  return `${prompt}, ${qualityTags}${nsfwTags}`;
}

async function fetchImage(prompt: string, hfToken: string, attempt = 1): Promise<Response> {
  const res = await fetch(
    'https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${hfToken}`,
        'Content-Type': 'application/json',
        'X-Wait-For-Model': 'true',
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: { num_inference_steps: 4, guidance_scale: 0 },
      }),
    }
  );

  // HF returns 503 while model loads — retry once after a short wait
  if (res.status === 503 && attempt < 3) {
    await new Promise(r => setTimeout(r, 6000));
    return fetchImage(prompt, hfToken, attempt + 1);
  }

  return res;
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';

  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: 'Rate limit exceeded. Slow down.' }, { status: 429 });
  }

  const { prompt, nsfw } = await req.json();

  if (!prompt || typeof prompt !== 'string') {
    return NextResponse.json({ error: 'Invalid prompt.' }, { status: 400 });
  }

  const hfToken = process.env.HF_TOKEN;
  if (!hfToken) {
    return NextResponse.json({ error: 'HF_TOKEN not set' }, { status: 500 });
  }

  try {
    const response = await fetchImage(enhancePrompt(prompt, nsfw), hfToken);

    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json(
        { error: `Image generation failed (${response.status}): ${err.slice(0, 200)}` },
        { status: response.status }
      );
    }

    const imageBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(imageBuffer).toString('base64');
    const contentType = response.headers.get('content-type') ?? 'image/jpeg';

    return NextResponse.json({ image: `data:${contentType};base64,${base64}` });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
