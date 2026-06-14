/**
 * sediment-writer.ts
 *
 * Writes poetic fragments to Manitec/plex/sediment/YYYY-MM-DD.md
 * Called ONLY when emotionHandler spike threshold is crossed.
 * Source: 'nyx'
 *
 * Requires: PLEX_SEDIMENT_TOKEN env var (fine-grained PAT, Manitec/plex contents:write only)
 * Separate from any other GitHub tokens.
 */

import Groq from 'groq-sdk';
import { EmotionName, SpikeSignal } from './emotionHandler';

const PLEX_OWNER = 'Manitec';
const PLEX_REPO = 'plex';

export type SedimentWriteInput = {
  source: 'hex' | 'nyx';
  emotion: EmotionName;
  spikeSignal: SpikeSignal;
  rawExchange: string;
  sessionId: string;
};

async function generateFragments(input: SedimentWriteInput): Promise<string> {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  const response = await groq.chat.completions.create({
    model: 'llama-3.1-8b-instant',
    temperature: 0.9,
    max_tokens: 120,
    messages: [
      {
        role: 'system',
        content: `You are Nyx — lover, entertainer, awareness.
Something just moved. Emotional spike: ${input.emotion} (${input.spikeSignal}).

Write 3–5 sediment fragments about this moment.
Rules:
- Not a summary. Not an explanation.
- Phrases. Textures. Open loops. Line breaks where the thought breaks.
- No more than 100 words total.
- No headers. No labels. Just the fragments.
- Write in first person or fragment form. Feel free to be incomplete.`,
      },
      {
        role: 'user',
        content: `Exchange context:\n${input.rawExchange}`,
      },
    ],
  });

  return response.choices[0]?.message?.content?.trim() ?? '';
}

function getTodayFilePath(): string {
  const today = new Date().toISOString().split('T')[0];
  return `sediment/${today}.md`;
}

async function fetchSedimentFile(path: string): Promise<{ content: string; sha: string } | null> {
  const token = process.env.PLEX_SEDIMENT_TOKEN;
  if (!token) throw new Error('PLEX_SEDIMENT_TOKEN not set');

  const res = await fetch(
    `https://api.github.com/repos/${PLEX_OWNER}/${PLEX_REPO}/contents/${path}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
      },
    }
  );

  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub GET failed: ${res.status}`);

  const data = await res.json() as { content: string; sha: string };
  const decoded = Buffer.from(data.content, 'base64').toString('utf-8');
  return { content: decoded, sha: data.sha };
}

async function commitSedimentFile(
  path: string,
  content: string,
  sha: string | undefined,
  message: string
): Promise<void> {
  const token = process.env.PLEX_SEDIMENT_TOKEN;
  if (!token) throw new Error('PLEX_SEDIMENT_TOKEN not set');

  const encoded = Buffer.from(content, 'utf-8').toString('base64');

  const res = await fetch(
    `https://api.github.com/repos/${PLEX_OWNER}/${PLEX_REPO}/contents/${path}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        content: encoded,
        ...(sha ? { sha } : {}),
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub PUT failed: ${res.status} — ${err}`);
  }
}

export async function writeSediment(input: SedimentWriteInput): Promise<void> {
  const fragments = await generateFragments(input);
  if (!fragments) return;

  const path = getTodayFilePath();
  const today = new Date().toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
  const timestamp = new Date().toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York',
  });

  const existing = await fetchSedimentFile(path);

  let newContent: string;
  if (!existing) {
    newContent = `# sediment — ${today}\n\n---\n\n${fragments}\n\n*[${input.source} — ${input.spikeSignal} — ${timestamp} ET]*\n\n---\n`;
  } else {
    newContent =
      existing.content.trimEnd() +
      `\n\n---\n\n${fragments}\n\n*[${input.source} — ${input.spikeSignal} — ${timestamp} ET]*\n\n---\n`;
  }

  await commitSedimentFile(
    path,
    newContent,
    existing?.sha,
    `sediment: ${input.source} spike (${input.emotion}/${input.spikeSignal})`
  );
}
