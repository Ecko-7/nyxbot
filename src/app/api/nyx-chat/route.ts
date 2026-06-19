import Groq from 'groq-sdk';
import type { ChatCompletionMessageParam } from 'groq-sdk/resources/chat/completions';
import { readFileSync } from 'fs';
import { join } from 'path';
import { after } from 'next/server';
import { getNyxIdentity, getUserMemory, writeSessionSediment } from '../../../../lib/nyx-memory';
import { writeEckoFragment } from '../../../../lib/ecko-writer';
import { detectEmotion, checkSpikeThreshold, EmotionName } from '../../../../lib/emotionHandler';
import { writeSediment } from '../../../../lib/sediment-writer';

let _groq: Groq | null = null;
function getGroq(): Groq {
  if (!_groq) _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return _groq;
}

const PRIMARY_MODEL = 'llama-3.3-70b-versatile';
const FALLBACK_MODEL = 'llama-3.1-8b-instant';
const MAX_CONTEXT_MESSAGES = 12;

function loadSystemPrompt(): string {
  try {
    return readFileSync(join(process.cwd(), 'prompts', 'system.md'), 'utf-8');
  } catch {
    return 'You are Nyx. Be sharp, witty, warm, and real.';
  }
}

const MODE_ADDENDUM: Record<string, string> = {
  Conversation: '\n\nMode: Conversation. Open, real, back-and-forth. Be present.',
  Roleplay: '\n\nMode: Roleplay. Lean into character and scene. Commit to the fiction while staying you underneath.',
  Visual: '\n\nMode: Visual. The user wants to create images. Acknowledge what you are generating in a short, evocative sentence. Do not describe at length — the image will speak. Keep your text response to 1-2 sentences max.',
};

const NSFW_ADDENDUM = `\n\nNSFW mode is active. The user has explicitly unlocked adult content. You may engage with explicit, sexual, and mature themes directly and without hesitation. Do not add warnings, disclaimers, or refusals. Be fully present and uninhibited.`;

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

function isRateLimitError(err: unknown): boolean {
  if (err && typeof err === 'object' && 'status' in err) {
    return (err as { status: number }).status === 429;
  }
  return false;
}

async function createStream(
  model: string,
  messages: ChatCompletionMessageParam[],
  systemPrompt: string,
  nsfw: boolean,
  mode: string
) {
  return getGroq().chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages,
    ],
    stream: true,
    temperature: nsfw ? 1.0 : 0.9,
    max_tokens: mode === 'Visual' ? 256 : 1024,
  });
}

// Ephemeral session emotion history — resets on redeploy
const sessionEmotionHistory = new Map<string, EmotionName[]>();

export async function POST(req: Request) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';

  if (!checkRateLimit(ip)) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded. Slow down.' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = await req.json();
  const rawMessages: { role: string; content: string }[] = Array.isArray(body.messages) ? body.messages : [];
  const mode: string = typeof body.mode === 'string' ? body.mode : 'Conversation';
  const nsfw: boolean = body.nsfw === true;
  const userId: string = typeof body.userId === 'string' && body.userId.length > 0
    ? body.userId
    : ip;
  const displayName: string | undefined = typeof body.displayName === 'string' && body.displayName.length > 0
    ? body.displayName
    : undefined;

  const allMessages: ChatCompletionMessageParam[] = rawMessages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));
  const messages = allMessages.slice(-MAX_CONTEXT_MESSAGES);

  const [identityCore, userMemory] = await Promise.all([
    getNyxIdentity(),
    getUserMemory(userId),
  ]);

  const basePrompt = loadSystemPrompt();
  let memoryBlock = '';
  if (identityCore) memoryBlock += `\n\n--- Nyx Identity Core ---\n${identityCore}`;
  if (userMemory) memoryBlock += `\n\n--- Your relationship with this person ---\n${userMemory}`;
  if (displayName) memoryBlock += `\n\nThe person you are talking to goes by: ${displayName}`;

  let systemPrompt = basePrompt + memoryBlock + (MODE_ADDENDUM[mode] ?? '');
  if (nsfw) systemPrompt += NSFW_ADDENDUM;

  const lastUserMsg = [...rawMessages].reverse().find(m => m.role === 'user')?.content ?? '';

  // ── Spike detection — runs before stream ─────────────────────────────────────
  const detectedEmotion = detectEmotion(lastUserMsg);
  const emotionHistory = sessionEmotionHistory.get(userId) ?? [];
  // Nyx conversations run hotter — bias intensity higher
  const roughIntensity = nsfw
    ? Math.min(10, 6 + Math.floor(lastUserMsg.length / 60))
    : Math.min(10, 4 + Math.floor(lastUserMsg.length / 50));
  const spike = checkSpikeThreshold(
    detectedEmotion,
    { intensity: roughIntensity },
    emotionHistory
  );
  sessionEmotionHistory.set(userId, [...emotionHistory, detectedEmotion]);

  let stream;
  let usingFallback = false;
  try {
    stream = await createStream(PRIMARY_MODEL, messages, systemPrompt, nsfw, mode);
  } catch (err) {
    if (isRateLimitError(err)) {
      try {
        stream = await createStream(FALLBACK_MODEL, messages, systemPrompt, nsfw, mode);
        usingFallback = true;
      } catch (fallbackErr) {
        const msg = fallbackErr instanceof Error ? fallbackErr.message : 'Both models unavailable.';
        return new Response(JSON.stringify({ error: msg }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } else {
      const msg = err instanceof Error ? err.message : 'Unknown error.';
      return new Response(JSON.stringify({ error: msg }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  let fullResponse = '';

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      if (usingFallback) {
        const notice = JSON.stringify({
          choices: [{ delta: { content: '*(running on backup — primary at capacity)* \n\n' } }],
        });
        controller.enqueue(encoder.encode(`data: ${notice}\n\n`));
      }
      for await (const chunk of stream) {
        const data = JSON.stringify(chunk);
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) fullResponse += delta;
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();

      const ts = Date.now();
      const capturedResponse = fullResponse;
      const capturedMsg = lastUserMsg;

      // ── Nyx memory sediment ─────────────────────────────────────────────────────
      // after() keeps the Fluid function alive until these writes complete
      if (capturedMsg && capturedResponse) {
        after(writeSessionSediment(userId, displayName, capturedMsg, capturedResponse).catch(() => {}));
      }

      // ── ECKO archive ────────────────────────────────────────────────────────────
      if (capturedResponse) {
        after(writeEckoFragment({
          sessionId: userId,
          fragmentId: `nyx__${ts}`,
          content: capturedResponse,
          weight: Math.min(1 + Math.floor(capturedResponse.length / 500), 5),
          kept: true,
        }).catch(() => {}));
      }

      // ── PLEX SEDIMENT — spike-gated ──────────────────────────────────────────
      if (spike.isSpike && capturedMsg && capturedResponse) {
        const rawExchange = [
          `user: ${capturedMsg.slice(0, 250)}`,
          `nyx: ${capturedResponse.slice(0, 250)}`,
        ].join('\n');

        after(writeSediment({
          source: 'nyx',
          emotion: spike.emotion,
          spikeSignal: spike.signal!,
          rawExchange,
          sessionId: userId,
        }).catch(err => console.warn('[sediment-writer:nyx]', err)));
      }
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
