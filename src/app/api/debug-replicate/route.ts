import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

// DEBUG ROUTE — returns raw Replicate API response as JSON
// Deploy on a preview branch, hit it with curl, inspect the response
// DELETE THIS FILE before merging to main

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();

    const apiKey = process.env.REPLICATE_API_KEY || process.env.REPLICATE_API_TOKEN;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'REPLICATE_API_KEY / REPLICATE_API_TOKEN not set in env' },
        { status: 500 }
      );
    }

    const repRes = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${apiKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'wait',
      },
      body: JSON.stringify(payload),
    });

    const txt = await repRes.text();

    // Return everything raw so we can see exactly what Replicate says
    return new NextResponse(txt, {
      status: repRes.status,
      headers: {
        'Content-Type': repRes.headers.get('content-type') ?? 'application/json',
        'X-Replicate-Status': String(repRes.status),
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
