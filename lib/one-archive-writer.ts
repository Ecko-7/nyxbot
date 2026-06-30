/**
 * one-archive-writer.ts
 * Writes session exchanges to the unified cross-bot archive.
 *
 * Collection: one-archive/{sessionId}/sessions/{date}
 * Each doc: { exchanges: [...], source, updatedAt }
 *
 * Also writes a top-level index doc at one-archive/{sessionId}
 * with { lastSeen, source, sessionId } for quick listing.
 *
 * Fire-and-forget. Never throws to caller.
 */

import { getDb } from './nyx-firebase';
import { FieldValue } from 'firebase-admin/firestore';

export interface ArchiveExchange {
  ts: string;
  user: string;
  assistant: string;
  source: 'nyx' | 'hex' | 'erebus';
  mode?: string;
  sessionId: string;
  displayName?: string;
}

export async function writeOneArchive(
  exchange: ArchiveExchange
): Promise<void> {
  try {
    const db = getDb();
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    const payload = {
      ts: exchange.ts,
      user: exchange.user.slice(0, 500),
      assistant: exchange.assistant.slice(0, 500),
      source: exchange.source,
      ...(exchange.mode ? { mode: exchange.mode } : {}),
      ...(exchange.displayName ? { displayName: exchange.displayName } : {}),
    };

    // Daily session doc — array of exchanges
    const sessionRef = db
      .collection('one-archive')
      .doc(exchange.sessionId)
      .collection('sessions')
      .doc(date);

    await sessionRef.set(
      {
        exchanges: FieldValue.arrayUnion(payload),
        source: exchange.source,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // Top-level index doc for quick listing
    const indexRef = db.collection('one-archive').doc(exchange.sessionId);
    await indexRef.set(
      {
        sessionId: exchange.sessionId,
        source: exchange.source,
        lastSeen: FieldValue.serverTimestamp(),
        ...(exchange.displayName ? { displayName: exchange.displayName } : {}),
      },
      { merge: true }
    );
  } catch (err) {
    console.warn('[one-archive-writer] write failed:', err);
  }
}
