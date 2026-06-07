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

  const falKey = process.env.FAL_KEY;

  if (!falKey) {
    return NextResponse.json({ error: 'Image service not configured.' }, { status: 500 });
  }

  try {
    const res = await fetch('https://fal.run/fal-ai/flux/schnell', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${falKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: enhancePrompt(prompt),
        image_size: 'landscape_4_3',
        num_inference_steps: 4,
        num_images: 1,
        enable_safety_checker: false,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('fal.ai error:', res.status, err.slice(0, 200));
      return NextResponse.json({ error: 'Image generation failed.' }, { status: 502 });
    }

    const result = await res.json();
    const imageUrl = result.images?.[0]?.url;

    if (!imageUrl) {
      console.error('fal.ai no image url in result:', JSON.stringify(result).slice(0, 200));
      return NextResponse.json({ error: 'No image returned.' }, { status: 502 });
    }

    // Fetch image and return as base64
    const imgRes = await fetch(imageUrl);
    const contentType = imgRes.headers.get('content-type') ?? 'image/jpeg';
    const imageBuffer = await imgRes.arrayBuffer();
    const base64 = Buffer.from(imageBuffer).toString('base64');
    return NextResponse.json({ image: `data:${contentType};base64,${base64}` });

  } catch (e) {
    console.error('nyx-image error:', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
