import { NextRequest } from 'next/server';
import { setDisplayName, getUserProfile } from '../../../../lib/nyx-memory';

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) return new Response(JSON.stringify({ error: 'Missing userId' }), { status: 400 });
  const profile = await getUserProfile(userId);
  return new Response(JSON.stringify(profile), { headers: { 'Content-Type': 'application/json' } });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { userId, displayName } = body;
  if (!userId || !displayName) return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400 });
  await setDisplayName(userId, displayName.trim().slice(0, 40));
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
}
