// TTS server route: proxies ElevenLabs / OpenAI TTS. Streams audio bytes
// straight through; the key is used server-side only.
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

interface Body {
  provider: 'elevenlabs' | 'openai';
  apiKey: string;
  voiceId: string;
  model: string;
  text: string;
  stability: number;
  similarityBoost: number;
  style: number;
  speed: number;
  speakerBoost: boolean;
}

export async function POST(req: NextRequest) {
  let b: Body;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }
  if (!b.apiKey) return NextResponse.json({ error: 'No voice API key configured.' }, { status: 401 });
  if (!b.text?.trim()) return NextResponse.json({ error: 'No text to speak.' }, { status: 400 });

  const upstream = new AbortController();
  req.signal.addEventListener('abort', () => upstream.abort());

  try {
    let res: Response;
    if (b.provider === 'elevenlabs') {
      if (!b.voiceId) return NextResponse.json({ error: 'No voice ID configured.' }, { status: 400 });
      res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(b.voiceId)}?output_format=mp3_44100_128`, {
        method: 'POST',
        signal: upstream.signal,
        headers: {
          'xi-api-key': b.apiKey,
          'content-type': 'application/json',
          accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text: b.text,
          model_id: b.model || 'eleven_turbo_v2_5',
          voice_settings: {
            stability: b.stability,
            similarity_boost: b.similarityBoost,
            style: b.style,
            use_speaker_boost: b.speakerBoost,
            speed: b.speed,
          },
        }),
      });
    } else {
      res = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        signal: upstream.signal,
        headers: {
          authorization: `Bearer ${b.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: b.model || 'tts-1',
          voice: b.voiceId || 'onyx',
          input: b.text,
          speed: b.speed,
          response_format: 'mp3',
        }),
      });
    }
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '');
      let msg = `Voice provider error ${res.status}`;
      try {
        const j = JSON.parse(text);
        msg = j?.detail?.message || j?.error?.message || j?.detail || msg;
      } catch {
        /* keep default */
      }
      if (res.status === 401) msg = 'Invalid voice API key. Check Settings.';
      if (res.status === 429) msg = 'Voice provider rate limit reached.';
      return NextResponse.json({ error: String(msg).slice(0, 300) }, { status: 502 });
    }
    return new NextResponse(res.body, {
      headers: { 'content-type': 'audio/mpeg', 'cache-control': 'no-store' },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Voice synthesis failed.';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}