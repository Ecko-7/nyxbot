/**
 * ecko-writer.ts — Nyx's ECKO bridge
 * Same schema and collection as HexBot's ecko-writer.
 * Source is hardcoded "nyx" in writeEckoFragment.
 * Schema: ecko-archive/{sessionId}/fragments/{fragmentId}
 *         ecko-archive/{docId}  ← activation records (flat)
 *         ecko-seeds/{seedId}
 */
import { getDb } from './nyx-firebase';
import { FieldValue } from 'firebase-admin/firestore';

export type EckoTriggerType = 'direct' | 'conflict' | 'pattern' | 'gap';
export type EckoCoreActive = 'em' | 'in' | 'aw' | 'unified';

export interface EckoActivationDoc {
  sessionId: string;
  triggerType: EckoTriggerType;
  contextFragment: string;
  response?: string;
  reconstructed: boolean;
  patternTags: string[];
  sessionRef?: string;
  coreActive: EckoCoreActive;
}

/**
 * Check if a pattern tag has appeared in 3 or more archived sessions.
 */
export async function checkPatternThreshold(tag: string): Promise<boolean> {
  try {
    const db = getDb();
    const snap = await db
      .collection('ecko-archive')
      .where('patternTags', 'array-contains', tag)
      .orderBy('timestamp', 'desc')
      .limit(10)
      .get();
    return snap.size >= 3;
  } catch {
    return false;
  }
}

/**
 * Write a single ECKO activation record to /ecko-archive (flat doc).
 * Also updates the session doc's eckoActivated flag.
 * Doc key: sessionId + triggerType + timestamp for uniqueness.
 */
export async function writeEckoActivation(doc: EckoActivationDoc): Promise<boolean> {
  try {
    const db = getDb();
    const ts = Date.now();
    const docId = `${doc.sessionId}__${doc.triggerType}__${ts}`;

    // Write activation record
    await db
      .collection('ecko-archive')
      .doc(docId)
      .set({
        ...doc,
        source: 'nyx',
        timestamp: FieldValue.serverTimestamp(),
        response: doc.response ?? '',
        reconstructed: doc.reconstructed,
      });

    // Update session doc with eckoActivated flag
    await db
      .collection('nyx_sessions')
      .doc(doc.sessionId)
      .set(
        {
          eckoActivated: true,
          eckoLastTrigger: doc.triggerType,
          eckoLastTs: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

    return true;
  } catch {
    return false;
  }
}

/**
 * Write a fragment to /ecko-archive/{sessionId}/fragments/{fragmentId}.
 */
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
