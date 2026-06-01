# Changelog

## v1.0.0 — 2026-06-01

First stable release of NyxBot. v1 scope complete.

### Shipped
- Chat interface with streaming responses (Groq / llama-3.3-70b-versatile)
- Model fallback to llama-3.1-8b-instant on rate limit
- Mode switcher: Conversation, Roleplay, Visual
- Image generation via Pollinations.ai (no token required)
- NSFW toggle with passphrase gate
- localStorage conversation persistence with auto-generated title
- Clear conversation button
- Per-IP rate limiting on chat and image routes
- Removed static prototype shell (web/)

### Architecture
- Next.js 14 App Router
- Deployed on Vercel (nyxbot.vercel.app)
- Groq for LLM, Pollinations.ai for image gen
- System prompt loaded from prompts/system.md at runtime

### What v1 is not
- Long-term memory engine
- ECKO/ONE wiring
- Voice layer
- Full autonomy

---

## v2.0.0 — upcoming

See docs/vision.md for direction.
