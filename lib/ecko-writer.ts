/**
 * ecko-writer.ts — Nyx's ECKO bridge
 * Ports the fragment writer from HexBot. Same schema, same collection.
 * Source is hardcoded "nyx" — ECKO always knows who's talking.
 * Schema: ecko-archive/{sessionId}/fragments/{fragmentId}
 */
import { getDb } from './nyx-firebase';
import { FieldValue } from 'firebase-admin/firestore';

export async function writeEckoFragment({
  sessionId,
  fragmentId,
  content,
  weight = 1,
  kept = true,
}: {
  sessionId: string;
  fragmentId: string;
  content: string;
  weight?: number;
  kept?: boolean;
}): Promise<boolean> {
  try {
    const db = getDb();
    await db
      .collection('ecko-archive')
      .doc(sessionId)
      .collection('fragments')
      .doc(fragmentId)
      .set({
        content,
        source: 'nyx',
        weight,
        kept,
        timestamp: FieldValue.serverTimestamp(),
      });
    return true;
  } catch {
    return false;
  }
}
