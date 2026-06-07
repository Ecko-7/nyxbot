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

const cfRes = await fetch("https://nyx-image-gen.bullmans-account7516.workers.dev", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ prompt }),
});

if (!cfRes.ok) {
  const err = await cfRes.json();
  throw new Error(err.error || "Image generation failed");
}

const arrayBuffer = await cfRes.arrayBuffer();
const base64 = Buffer.from(arrayBuffer).toString("base64");
const imageUrl = `data:image/jpeg;base64,${base64}`;

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
