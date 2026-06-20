import { getDb } from './nyx-firebase';
import { FieldValue } from 'firebase-admin/firestore';

// --- Identity core (shared, who Nyx is) ---
export async function getNyxIdentity(): Promise<string> {
  try {
    const db = getDb();
    const doc = await db.collection('nyx-identity').doc('core').get();
    if (!doc.exists) return '';
    const data = doc.data();
    return data?.summary ?? '';
  } catch {
    return '';
  }
}

export async function setNyxIdentity(summary: string): Promise<void> {
  const db = getDb();
  await db.collection('nyx-identity').doc('core').set({
    summary,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

// --- Per-user profile (display name) ---
export async function getUserProfile(userId: string): Promise<{ displayName?: string }> {
  try {
    const db = getDb();
    const doc = await db.collection('nyx-memory').doc(userId).get();
    if (!doc.exists) return {};
    const data = doc.data();
    return { displayName: data?.displayName };
  } catch {
    return {};
  }
}

export async function setDisplayName(userId: string, displayName: string): Promise<void> {
  const db = getDb();
  await db.collection('nyx-memory').doc(userId).set({
    displayName,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

// --- Per-user relationship memory (private) ---
export async function getUserMemory(userId: string): Promise<string> {
  try {
    const db = getDb();
    const doc = await db.collection('nyx-memory').doc(userId).get();
    if (!doc.exists) return '';
    const data = doc.data();
    return data?.summary ?? '';
  } catch {
    return '';
  }
}

export async function appendUserSediment(
  userId: string,
  sediment: string
): Promise<void> {
  const db = getDb();
  const ref = db.collection('nyx-memory').doc(userId);
  const doc = await ref.get();
  const existing = doc.exists ? (doc.data()?.summary ?? '') : '';

  const combined = (existing + '\n' + sediment).trim();
  const trimmed = combined.length > 2000 ? combined.slice(-2000) : combined;

  await ref.set({
    summary: trimmed,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

// --- Session storage (nyx-sessions/{userId}/sessions/{date}) ---
// One doc per day per user. Exchanges appended as an array.
// Clean, queryable, never collapses into a blob.
export async function writeSessionSediment(
  userId: string,
  displayName: string | undefined,
  userMsg: string,
  nyxMsg: string
): Promise<void> {
  const db = getDb();
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const name = displayName ?? 'User';

  const exchange = {
    ts: new Date().toISOString(),
    user: userMsg.slice(0, 500),
    nyx: nyxMsg.slice(0, 500),
    displayName: name,
  };

  // Write to nyx-sessions collection
  const sessionRef = db
    .collection('nyx-sessions')
    .doc(userId)
    .collection('sessions')
    .doc(date);

  await sessionRef.set({
    exchanges: FieldValue.arrayUnion(exchange),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  // Keep rolling nyx-memory summary alive for prompt injection
  const fragment = `[${exchange.ts}]\n${name}: ${userMsg.slice(0, 300)}\nNyx: ${nyxMsg.slice(0, 300)}`;
  await appendUserSediment(userId, fragment);
}
