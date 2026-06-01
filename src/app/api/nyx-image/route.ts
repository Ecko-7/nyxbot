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

function enhancePrompt(prompt: string): string {
  return `${prompt.trim()}, cinematic lighting, ultra detailed, high quality`;
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';

  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: 'Rate limit exceeded. Slow down.' }, { status: 429 });
  }

  const { prompt } = await req.json();

  if (!prompt || typeof prompt !== 'string') {
    return NextResponse.json({ error: 'Invalid prompt.' }, { status: 400 });
  }

  try {
    const encoded = encodeURIComponent(enhancePrompt(prompt));
    // Pollinations: free, no token, returns image directly
    // seed=-1 = random each time, width/height for good aspect ratio
    const url = `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=768&seed=-1&nologo=true`;

    const response = await fetch(url, {
      headers: { 'User-Agent': 'NyxBot/1.0' },
    });

    if (!response.ok) {
      const errText = await response.text();
      return NextResponse.json(
        { error: `Image generation failed (${response.status}): ${errText.slice(0, 200)}` },
        { status: response.status }
      );
    }

    const contentType = response.headers.get('content-type') ?? 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      const text = await response.text();
      return NextResponse.json(
        { error: `Unexpected response: ${text.slice(0, 200)}` },
        { status: 502 }
      );
    }

    const imageBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(imageBuffer).toString('base64');

    return NextResponse.json({ image: `data:${contentType};base64,${base64}` });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
