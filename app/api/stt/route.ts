// STT server route: OpenAI Whisper transcription (multipart passthrough).
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get('x-stt-key') ?? '';
  if (!apiKey) return NextResponse.json({ error: 'No speech recognition API key configured.' }, { status: 401 });
  const upstream = new AbortController();
  req.signal.addEventListener('abort', () => upstream.abort());
  try {
    const form = await req.formData();
    const file = form.get('audio');
    if (!(file instanceof Blob)) return NextResponse.json({ error: 'No audio supplied.' }, { status: 400 });
    const out = new FormData();
    out.append('file', file, 'audio.webm');
    out.append('model', String(form.get('model') || 'whisper-1'));
    out.append('language', String(form.get('language') || 'en'));
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      signal: upstream.signal,
      headers: { authorization: `Bearer ${apiKey}` },
      body: out,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      if (res.status === 401) return NextResponse.json({ error: 'Invalid speech recognition API key.' }, { status: 502 });
      return NextResponse.json({ error: `Transcription error ${res.status}: ${text.slice(0, 200)}` }, { status: 502 });
    }
    const j = await res.json();
    return NextResponse.json({ text: j.text ?? '' });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Transcription failed.';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}