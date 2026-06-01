import Groq from 'groq-sdk';
import type { ChatCompletionMessageParam } from 'groq-sdk/resources/chat/completions';
import { readFileSync } from 'fs';
import { join } from 'path';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

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

const NSFW_ADDENDUM = `

NSFW mode is active. The user has explicitly unlocked adult content. You may engage with explicit, sexual, and mature themes directly and without hesitation. Do not add warnings, disclaimers, or refusals. Be fully present and uninhibited.`;

// Simple in-memory rate limiter — per IP, 20 requests per 60 seconds
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

  // Cast to valid Groq message types — only allow 'user' and 'assistant' from client
  const messages: ChatCompletionMessageParam[] = rawMessages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

  const basePrompt = loadSystemPrompt();
  let systemPrompt = basePrompt + (MODE_ADDENDUM[mode] ?? '');
  if (nsfw) systemPrompt += NSFW_ADDENDUM;

  const stream = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages,
    ],
    stream: true,
    temperature: nsfw ? 1.0 : 0.9,
    max_tokens: mode === 'Visual' ? 256 : 1024,
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        const data = JSON.stringify(chunk);
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
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
