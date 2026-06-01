'use client';
import { useState, useRef, useEffect } from 'react';

type Message = { role: 'user' | 'nyx'; content: string; image?: string };
type Mode = 'Conversation' | 'Roleplay' | 'Visual';

async function generateImage(prompt: string, nsfw: boolean): Promise<string | null> {
  const token = process.env.NEXT_PUBLIC_HF_TOKEN;
  if (!token) return null;

  const model = nsfw
    ? 'enhanceaiteam/Flux-uncensored'
    : 'stabilityai/stable-diffusion-xl-base-1.0';

  try {
    const res = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Wait-For-Model': 'true',
      },
      body: JSON.stringify({ inputs: prompt }),
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

export default function NyxBot() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'nyx', content: 'You took long enough. Come here and tell me what we\'re making.' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<Mode>('Conversation');
  const [nsfw, setNsfw] = useState(false);
  const [nsfwUnlocked, setNsfwUnlocked] = useState(false);
  const [passphraseInput, setPassphraseInput] = useState('');
  const [passphraseError, setPassphraseError] = useState(false);
  const [showPassphraseBox, setShowPassphraseBox] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem('nyx_nsfw_unlocked');
    if (stored === 'true') setNsfwUnlocked(true);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleNsfwToggleClick = () => {
    if (nsfwUnlocked) {
      setNsfw(prev => !prev);
    } else {
      setShowPassphraseBox(true);
    }
  };

  const submitPassphrase = () => {
    const correct = process.env.NEXT_PUBLIC_NYX_PASSPHRASE;
    if (passphraseInput === correct) {
      setNsfwUnlocked(true);
      setNsfw(true);
      setShowPassphraseBox(false);
      setPassphraseInput('');
      setPassphraseError(false);
      sessionStorage.setItem('nyx_nsfw_unlocked', 'true');
    } else {
      setPassphraseError(true);
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    const userMsg: Message = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    const nyxPlaceholder: Message = { role: 'nyx', content: '' };
    setMessages(prev => [...prev, nyxPlaceholder]);

    try {
      // Fire image gen and chat in parallel
      const imagePromise = mode === 'Visual'
        ? generateImage(text, nsfw)
        : Promise.resolve(null);

      const res = await fetch('/api/nyx-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMsg].map(m => ({
            role: m.role === 'nyx' ? 'assistant' : 'user',
            content: m.content,
          })),
          mode,
          nsfw,
        }),
      });

      if (!res.body) throw new Error('No stream');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') break;
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content ?? '';
              full += delta;
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: 'nyx', content: full };
                return updated;
              });
            } catch {}
          }
        }
      }

      // Attach image once it resolves
      if (mode === 'Visual') {
        const img = await imagePromise;
        if (img) {
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = { ...updated[updated.length - 1], image: img };
            return updated;
          });
        }
      }
    } catch {
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'nyx', content: 'Something broke. Try again. 🖤' };
        return updated;
      });
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', minHeight: '100vh' }}>

      {/* Sidebar */}
      <aside style={{
        borderRight: '1px solid var(--line)',
        padding: '24px',
        background: 'rgba(0,0,0,0.18)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}>
        <div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '6px' }}>NyxBot</div>
          <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Voice, image, dream, intimacy layer</div>
        </div>

        <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: '16px' }}>
          <strong style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>Mode</strong>
          <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {(['Conversation', 'Roleplay', 'Visual'] as Mode[]).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                style={{
                  padding: '10px 14px',
                  borderRadius: '12px',
                  border: `1px solid ${mode === m ? 'rgba(168,70,255,0.6)' : 'var(--line)'}`,
                  background: mode === m ? 'rgba(168,70,255,0.15)' : 'var(--panel-2)',
                  color: mode === m ? '#d8a8ff' : 'var(--text)',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontWeight: mode === m ? 600 : 400,
                  transition: 'all 0.15s',
                }}
              >{m}</button>
            ))}
          </div>
        </div>

        <div style={{ background: 'var(--panel)', border: `1px solid ${nsfw ? 'rgba(255,94,168,0.4)' : 'var(--line)'}`, borderRadius: 'var(--radius)', padding: '16px' }}>
          <strong style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>Content</strong>
          <div style={{ marginTop: '12px' }}>
            <button
              onClick={handleNsfwToggleClick}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '12px',
                border: `1px solid ${nsfw ? 'rgba(255,94,168,0.6)' : 'var(--line)'}`,
                background: nsfw ? 'rgba(255,94,168,0.15)' : 'var(--panel-2)',
                color: nsfw ? '#ffb3d9' : 'var(--muted)',
                textAlign: 'left',
                cursor: 'pointer',
                fontWeight: nsfw ? 600 : 400,
                transition: 'all 0.15s',
                fontSize: '0.9rem',
              }}
            >
              {nsfw ? '🔓 NSFW On' : '🔒 NSFW Off'}
            </button>

            {showPassphraseBox && (
              <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <input
                  type="password"
                  placeholder="Passphrase..."
                  value={passphraseInput}
                  onChange={e => { setPassphraseInput(e.target.value); setPassphraseError(false); }}
                  onKeyDown={e => e.key === 'Enter' && submitPassphrase()}
                  style={{
                    background: 'var(--panel-2)',
                    border: `1px solid ${passphraseError ? 'rgba(255,80,80,0.6)' : 'var(--line)'}`,
                    borderRadius: '10px',
                    padding: '10px 12px',
                    color: 'var(--text)',
                    fontSize: '0.875rem',
                    fontFamily: 'inherit',
                    width: '100%',
                  }}
                />
                {passphraseError && (
                  <p style={{ color: 'rgba(255,80,80,0.8)', fontSize: '0.8rem', margin: 0 }}>Wrong. Try again.</p>
                )}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={submitPassphrase} style={{ flex: 1, padding: '8px', borderRadius: '10px', border: 'none', background: 'rgba(168,70,255,0.3)', color: '#d8a8ff', cursor: 'pointer', fontSize: '0.875rem' }}>Unlock</button>
                  <button onClick={() => { setShowPassphraseBox(false); setPassphraseInput(''); setPassphraseError(false); }} style={{ flex: 1, padding: '8px', borderRadius: '10px', border: '1px solid var(--line)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.875rem' }}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: '16px' }}>
          <strong style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>Profile</strong>
          <p style={{ color: 'var(--muted)', marginTop: '10px', fontSize: '0.875rem', lineHeight: 1.6 }}>
            Memory and continuity coming soon.
          </p>
        </div>
      </aside>

      {/* Main */}
      <main style={{ display: 'grid', gridTemplateRows: 'auto 1fr auto', minHeight: '100vh' }}>
        <header style={{
          padding: '20px 28px',
          borderBottom: '1px solid var(--line)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '4px' }}>NyxBot</h1>
            <p style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>Mode: {mode}{nsfw ? ' · NSFW' : ''}</p>
          </div>
          <div style={{
            padding: '6px 14px',
            borderRadius: '999px',
            background: nsfw ? 'rgba(255,94,168,0.15)' : 'rgba(168,70,255,0.15)',
            border: `1px solid ${nsfw ? 'rgba(255,94,168,0.3)' : 'rgba(168,70,255,0.3)'}`,
            fontSize: '0.75rem',
            color: nsfw ? '#ffb3d9' : '#d8a8ff',
          }}>● Live</div>
        </header>

        <section style={{ padding: '24px 28px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {messages.map((msg, i) => (
            <div
              key={i}
              style={{
                maxWidth: '760px',
                borderRadius: '18px',
                border: '1px solid var(--line)',
                overflow: 'hidden',
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                background: msg.role === 'nyx'
                  ? 'linear-gradient(135deg, rgba(168,70,255,0.14), rgba(255,94,168,0.08))'
                  : 'var(--panel)',
              }}
            >
              {msg.image && (
                <img
                  src={msg.image}
                  alt="Generated by Nyx"
                  style={{ width: '100%', maxWidth: '540px', display: 'block', borderRadius: '16px 16px 0 0' }}
                />
              )}
              <div style={{ padding: '14px 18px', lineHeight: 1.65, fontSize: '0.95rem', whiteSpace: 'pre-wrap' }}>
                {msg.content || (loading && i === messages.length - 1 ? '✦ creating...' : '')}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </section>

        <div style={{
          padding: '16px 28px 24px',
          borderTop: '1px solid var(--line)',
          display: 'grid',
          gridTemplateColumns: '1fr auto',
          gap: '12px',
          alignItems: 'end',
        }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={mode === 'Visual' ? 'Describe what you want to see...' : 'Type to Nyx... (Enter to send, Shift+Enter for newline)'}
            rows={2}
            style={{
              width: '100%',
              resize: 'vertical',
              background: 'var(--panel)',
              color: 'var(--text)',
              border: '1px solid var(--line)',
              borderRadius: '14px',
              padding: '14px 16px',
              fontFamily: 'inherit',
              fontSize: '0.95rem',
              lineHeight: 1.5,
            }}
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            style={{
              padding: '14px 22px',
              border: 'none',
              borderRadius: '14px',
              background: loading || !input.trim()
                ? 'rgba(168,70,255,0.3)'
                : nsfw
                  ? 'linear-gradient(135deg, #ff5ea8, #a846ff)'
                  : 'linear-gradient(135deg, var(--accent), var(--accent-2))',
              color: 'white',
              fontWeight: 700,
              fontSize: '0.9rem',
              cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s',
              whiteSpace: 'nowrap',
            }}
          >
            {loading ? (mode === 'Visual' ? '✦ creating...' : '...') : 'Send'}
          </button>
        </div>
      </main>
    </div>
  );
}
