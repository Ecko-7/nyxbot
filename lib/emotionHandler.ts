/**
 * emotionHandler.ts
 *
 * Detects emotional signal from a user message and returns structured context.
 * Also provides spike detection for gating sediment writes.
 */

export type EmotionName =
  | "anger"
  | "fear"
  | "sadness"
  | "loneliness"
  | "confusion"
  | "desire"
  | "hope"
  | "shame"
  | "frustration"
  | "curiosity"
  | "unknown";

export type EmotionContext = {
  trigger?: string;
  intensity?: number;    // 0–10
  source?: "internal" | "external" | "relational" | "existential" | "unknown";
  urgency?: number;      // 0–10
  goal?: string;
  notes?: string;
};

export type EmotionAction =
  | "pause"
  | "reframe"
  | "investigate"
  | "express"
  | "create"
  | "connect"
  | "protect"
  | "act"
  | "rest"
  | "observe";

export type EmotionResponse = {
  emotion: EmotionName;
  signal: string;
  interpretation: string;
  counterthesis?: string;
  chosenState: string;
  action: EmotionAction;
  prompt: string;
};

const clamp = (n: number, min = 0, max = 10): number =>
  Math.max(min, Math.min(max, n));

export function detectEmotion(message: string): EmotionName {
  const m = message.toLowerCase();
  if (/(angry|pissed|furious|mad|rage|frustrated|why won't|why can't|fed up)/.test(m)) {
    return /(stuck|blocked|not working|won't|doesn't|keeps)/.test(m) ? "frustration" : "anger";
  }
  if (/(scared|afraid|worried|anxious|terrified|nervous|dread)/.test(m)) return "fear";
  if (/(sad|depressed|hopeless|empty|numb|hurt|heartbreak|grief|miss)/.test(m)) return "sadness";
  if (/(lonely|alone|no one|isolated|nobody|invisible|unseen)/.test(m)) return "loneliness";
  if (/(don't know|confused|lost|unclear|not sure|what does|why is|how do i even)/.test(m)) return "confusion";
  if (/(want|need|crave|wish|desire|longing|dream|hope to|want to be)/.test(m)) {
    return /(hope|maybe someday|what if|could be|might)/.test(m) ? "hope" : "desire";
  }
  if (/(ashamed|embarrassed|stupid|worthless|failure|weak|shouldn't have|regret)/.test(m)) return "shame";
  if (/(curious|interesting|wonder|what if|explore|tell me more|how does|why does)/.test(m)) return "curiosity";
  if (/(bored|nothing to do|can't sleep|restless|just here|hey|sup|hi there)/.test(m)) return "loneliness";
  return "unknown";
}

export type SpikeSignal =
  | 'arousal'
  | 'valence'
  | 'tone_shift'
  | 'pattern_repeat';

export type SpikeResult = {
  isSpike: boolean;
  signal: SpikeSignal | null;
  emotion: EmotionName;
  intensity: number;
};

export function checkSpikeThreshold(
  emotion: EmotionName,
  context: EmotionContext,
  sessionHistory: EmotionName[] = []
): SpikeResult {
  const intensity = clamp(context.intensity ?? 5);

  if (intensity >= 7) {
    return { isSpike: true, signal: 'arousal', emotion, intensity };
  }

  const highValence: EmotionName[] = ['shame', 'loneliness', 'desire', 'hope', 'anger', 'fear'];
  if (highValence.includes(emotion) && intensity >= 5) {
    return { isSpike: true, signal: 'valence', emotion, intensity };
  }

  const lastEmotion = sessionHistory[sessionHistory.length - 1];
  if (lastEmotion && lastEmotion !== emotion && lastEmotion !== 'unknown' && emotion !== 'unknown') {
    return { isSpike: true, signal: 'tone_shift', emotion, intensity };
  }

  const repeatCount = sessionHistory.filter(e => e === emotion).length;
  if (repeatCount >= 2) {
    return { isSpike: true, signal: 'pattern_repeat', emotion, intensity };
  }

  return { isSpike: false, signal: null, emotion, intensity };
}
