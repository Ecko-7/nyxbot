import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

// Simple in-memory rate limiter — per IP, 10 image requests per 60 seconds
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

// Enrich prompt with artistic quality terms for better FLUX output
function enhancePrompt(prompt: string, nsfw: boolean): string {
  const qualityTags = 'cinematic lighting, ultra detailed, high quality, 8k';
  const nsfwTags = nsfw ? ', explicit, uncensored, nsfw' : ', safe for work';
  return `${prompt}, ${qualityTags}${nsfwTags}`;
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

  try {
    // FLUX.1-schnell — significantly better quality than SD 2.1, fast inference
    const response = await fetch(
      'https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${hfToken}`,
          'Content-Type': 'application/json',
          'X-Wait-For-Model': 'true',
        },
        body: JSON.stringify({
          inputs: enhancedPrompt,
          parameters: {
            num_inference_steps: 4,   // schnell is optimized for 4 steps
            guidance_scale: 0,         // schnell uses guidance_scale 0
          },
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json(
        { error: `HF ${response.status}: ${err.slice(0, 160)}` },
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
