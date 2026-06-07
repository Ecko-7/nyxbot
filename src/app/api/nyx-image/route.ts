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
    // Submit to fal.ai FLUX schnell
    const submitRes = await fetch('https://queue.fal.run/fal-ai/flux/schnell', {
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

    if (!submitRes.ok) {
      const err = await submitRes.text();
      console.error('fal submit error:', submitRes.status, err.slice(0, 100));
      return NextResponse.json({ error: 'Image generation failed.' }, { status: 502 });
    }

    const { request_id, response_url } = await submitRes.json();

    // Poll for result
    const pollUrl = response_url || `https://queue.fal.run/fal-ai/flux/schnell/requests/${request_id}`;
    let attempts = 0;
    while (attempts < 30) {
      await new Promise(r => setTimeout(r, 2000));
      const pollRes = await fetch(pollUrl, {
        headers: { 'Authorization': `Key ${falKey}` },
      });

      if (!pollRes.ok) { attempts++; continue; }

      const result = await pollRes.json();

      if (result.status === 'COMPLETED' || result.images) {
        const imageUrl = result.images?.[0]?.url;
        if (!imageUrl) {
          return NextResponse.json({ error: 'No image returned.' }, { status: 502 });
        }

        // Fetch image and convert to base64
        const imgRes = await fetch(imageUrl);
        const contentType = imgRes.headers.get('content-type') ?? 'image/jpeg';
        const imageBuffer = await imgRes.arrayBuffer();
        const base64 = Buffer.from(imageBuffer).toString('base64');
        return NextResponse.json({ image: `data:${contentType};base64,${base64}` });
      }

      if (result.status === 'FAILED') {
        return NextResponse.json({ error: 'Image generation failed.' }, { status: 502 });
      }

      attempts++;
    }

    return NextResponse.json({ error: 'Image generation timed out.' }, { status: 504 });

  } catch (e) {
    console.error('nyx-image error:', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
