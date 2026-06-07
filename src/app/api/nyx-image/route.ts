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

  try {
    const encoded = encodeURIComponent(enhancePrompt(prompt));
    const seed = Math.floor(Math.random() * 1000000);
    const apiKey = process.env.POLLINATIONS_API_KEY;

    const url = `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=768&seed=${seed}&nologo=true`;

    const headers: Record<string, string> = {
      'User-Agent': 'NyxBot/1.0',
    };

    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetch(url, { headers });

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
