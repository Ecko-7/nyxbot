import { NextRequest } from 'next/server';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { prompt, nsfw } = await req.json();

  const hfToken = process.env.HF_TOKEN;
  if (!hfToken) {
    console.error('HF_TOKEN is not set');
    return new Response(JSON.stringify({ error: 'HF_TOKEN not set' }), { status: 500 });
  }

  // Use faster/more reliable models
  const model = nsfw
    ? 'enhanceaiteam/Flux-uncensored'
    : 'stabilityai/stable-diffusion-xl-base-1.0';

  console.log(`Generating image with model: ${model}, prompt: ${prompt}`);

  try {
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
        signal: AbortSignal.timeout(55000),
      }
    );

    console.log(`HF response status: ${response.status}`);

    if (!response.ok) {
      const err = await response.text();
      console.error(`HF error: ${err}`);
      return new Response(JSON.stringify({ error: err }), { status: response.status });
    }

    const imageBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(imageBuffer).toString('base64');
    const contentType = response.headers.get('content-type') ?? 'image/jpeg';

    return new Response(JSON.stringify({ image: `data:${contentType};base64,${base64}` }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('nyx-image fetch failed:', e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
}
