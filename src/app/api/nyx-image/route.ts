import { NextRequest } from 'next/server';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  const { prompt, nsfw } = await req.json();

  const hfToken = process.env.HF_TOKEN;
  if (!hfToken) {
    return new Response(JSON.stringify({ error: 'HF_TOKEN not set' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const enhancedPrompt = nsfw ? `${prompt}, explicit, uncensored, nsfw` : prompt;

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
    return new Response(JSON.stringify({ error: `HF ${response.status}: ${err.slice(0, 160)}` }), {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Edge-compatible base64 encoding (no Buffer)
  const imageBuffer = await response.arrayBuffer();
  const bytes = new Uint8Array(imageBuffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  const contentType = response.headers.get('content-type') ?? 'image/jpeg';

  return new Response(JSON.stringify({ image: `data:${contentType};base64,${base64}` }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
