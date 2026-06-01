import { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  const { prompt, nsfw } = await req.json();

  const model = nsfw
    ? 'enhanceaiteam/Flux-uncensored'
    : 'black-forest-labs/FLUX.1-schnell';

  const hfToken = process.env.HF_TOKEN;
  if (!hfToken) {
    return new Response(JSON.stringify({ error: 'HF_TOKEN not set' }), { status: 500 });
  }

  const response = await fetch(
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

  if (!response.ok) {
    const err = await response.text();
    return new Response(JSON.stringify({ error: err }), { status: response.status });
  }

  const imageBuffer = await response.arrayBuffer();
  const base64 = Buffer.from(imageBuffer).toString('base64');
  const contentType = response.headers.get('content-type') ?? 'image/jpeg';

  return new Response(JSON.stringify({ image: `data:${contentType};base64,${base64}` }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
