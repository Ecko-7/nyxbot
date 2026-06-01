import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const { prompt, nsfw } = await req.json();

  const hfToken = process.env.HF_TOKEN;
  if (!hfToken) {
    return NextResponse.json({ error: 'HF_TOKEN not set' }, { status: 500 });
  }

  const enhancedPrompt = nsfw ? `${prompt}, explicit, uncensored, nsfw` : prompt;

  try {
    const response = await fetch(
      'https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-2-1',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${hfToken}`,
          'Content-Type': 'application/json',
          'X-Wait-For-Model': 'true',
        },
        body: JSON.stringify({ inputs: enhancedPrompt }),
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
