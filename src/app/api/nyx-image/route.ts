import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

function enhancePrompt(prompt: string): string {
  return `${prompt.trim()}, cinematic lighting, ultra detailed, high quality`;
}

export async function POST(req: NextRequest) {
  const { prompt } = await req.json();

  if (!prompt || typeof prompt !== 'string') {
    return NextResponse.json({ error: 'Invalid prompt.' }, { status: 400 });
  }

  const hfToken = process.env.HF_TOKEN;

  // Try HuggingFace FLUX first if token is available
  if (hfToken) {
    try {
      const response = await fetch(
        'https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${hfToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ inputs: enhancePrompt(prompt) }),
        }
      );

      if (response.ok) {
        const contentType = response.headers.get('content-type') ?? 'image/jpeg';
        if (contentType.startsWith('image/')) {
          const imageBuffer = await response.arrayBuffer();
          const base64 = Buffer.from(imageBuffer).toString('base64');
          return NextResponse.json({ image: `data:${contentType};base64,${base64}` });
        }
      }

      // If HF returns 503 (model loading), fall through to Pollinations
      if (response.status !== 503) {
        const errText = await response.text();
        console.error('HF error:', response.status, errText.slice(0, 100));
      }
    } catch (e) {
      console.error('HF fetch error:', e);
    }
  }

  // Fallback: Pollinations (no token needed)
  try {
    const encoded = encodeURIComponent(enhancePrompt(prompt));
    const url = `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=768&seed=-1&nologo=true`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'NyxBot/1.0' },
    });

    if (!response.ok) {
      const errText = await response.text();
      const isQueue = errText.includes('Queue') || response.status === 402;
      return NextResponse.json(
        { error: isQueue ? 'queue' : `Image generation failed (${response.status})` },
        { status: response.status }
      );
    }

    const contentType = response.headers.get('content-type') ?? 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      return NextResponse.json({ error: 'Unexpected response from image service.' }, { status: 502 });
    }

    const imageBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(imageBuffer).toString('base64');
    return NextResponse.json({ image: `data:${contentType};base64,${base64}` });

  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
