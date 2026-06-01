import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

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
  const qualityTags = 'cinematic lighting, ultra detailed, high quality';
  const nsfwTags = nsfw ? ', explicit, uncensored, nsfw' : '';
  return `${prompt}, ${qualityTags}${nsfwTags}`;
}

// Model waterfall: try each in order until one succeeds
const MODELS = [
  'stabilityai/stable-diffusion-xl-base-1.0',  // SDXL — free tier, high quality
  'runwayml/stable-diffusion-v1-5',              // SD 1.5 — reliable fallback
];

async function fetchFromModel(model: string, prompt: string, hfToken: string, attempt = 1): Promise<Response> {
  const res = await fetch(
    `https://api-inference.huggingface.co/models/${model}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${hfToken}`,
        'Content-Type': 'application/json',
        'X-Wait-For-Model': 'true',
      },
      body: JSON.stringify({ inputs: prompt }),
    }
  );

  if (res.status === 503 && attempt < 3) {
    await new Promise(r => setTimeout(r, 8000));
    return fetchFromModel(model, prompt, hfToken, attempt + 1);
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

  const enhancedPrompt = enhancePrompt(prompt, nsfw);
  let lastError = 'All image models failed.';

  for (const model of MODELS) {
    try {
      const response = await fetchFromModel(model, enhancedPrompt, hfToken);

      if (!response.ok) {
        const errText = await response.text();
        lastError = `${model} → ${response.status}: ${errText.slice(0, 160)}`;
        continue; // try next model
      }

      const imageBuffer = await response.arrayBuffer();

      // HF sometimes returns JSON error with 200 status — guard against it
      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.startsWith('image/')) {
        const text = Buffer.from(imageBuffer).toString('utf-8');
        lastError = `${model} → unexpected response: ${text.slice(0, 160)}`;
        continue;
      }

      const base64 = Buffer.from(imageBuffer).toString('base64');
      return NextResponse.json({ image: `data:${contentType};base64,${base64}` });

    } catch (e) {
      lastError = `${model} → ${String(e)}`;
      continue;
    }
  }

  return NextResponse.json({ error: lastError }, { status: 503 });
}
