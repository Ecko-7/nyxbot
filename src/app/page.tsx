'use client';
import { useState, useRef, useEffect } from 'react';

type Message = { role: 'user' | 'nyx'; content: string };
type Mode = 'Conversation' | 'Roleplay' | 'Visual';

export default function NyxBot() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'nyx', content: 'You took long enough. Come here and tell me what we\'re making.' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<Mode>('Conversation');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

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
      const res = await fetch('/api/nyx-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMsg].map(m => ({
            role: m.role === 'nyx' ? 'assistant' : 'user',
            content: m.content,
          })),
          mode,
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

        <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: '16px' }}>
          <strong style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>Profile</strong>
          <p style={{ color: 'var(--muted)', marginTop: '10px', fontSize: '0.875rem', lineHeight: 1.6 }}>
            Memory and continuity coming soon.
          </p>
        </div>
      </aside>

      {/* Main */}
      <main style={{ display: 'grid', gridTemplateRows: 'auto 1fr auto', minHeight: '100vh' }}>

        {/* Header */}
        <header style={{
          padding: '20px 28px',
          borderBottom: '1px solid var(--line)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '4px' }}>NyxBot</h1>
            <p style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>Mode: {mode}</p>
          </div>
          <div style={{
            padding: '6px 14px',
            borderRadius: '999px',
            background: 'rgba(168,70,255,0.15)',
            border: '1px solid rgba(168,70,255,0.3)',
            fontSize: '0.75rem',
            color: '#d8a8ff',
          }}>● Live</div>
        </header>

        {/* Chat */}
        <section style={{ padding: '24px 28px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {messages.map((msg, i) => (
            <div
              key={i}
              style={{
                maxWidth: '760px',
                padding: '14px 18px',
                borderRadius: '18px',
                border: '1px solid var(--line)',
                lineHeight: 1.65,
                fontSize: '0.95rem',
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                background: msg.role === 'nyx'
                  ? 'linear-gradient(135deg, rgba(168,70,255,0.14), rgba(255,94,168,0.08))'
                  : 'var(--panel)',
                whiteSpace: 'pre-wrap',
              }}
            >
              {msg.content || (loading && i === messages.length - 1 ? '...' : '')}
            </div>
          ))}
          <div ref={bottomRef} />
        </section>

        {/* Composer */}
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
            placeholder="Type to Nyx... (Enter to send, Shift+Enter for newline)"
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
                : 'linear-gradient(135deg, var(--accent), var(--accent-2))',
              color: 'white',
              fontWeight: 700,
              fontSize: '0.9rem',
              cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s',
              whiteSpace: 'nowrap',
            }}
          >
            {loading ? '...' : 'Send'}
          </button>
        </div>
      </main>
    </div>
  );
}
