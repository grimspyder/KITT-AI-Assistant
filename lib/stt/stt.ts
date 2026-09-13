// STT: browser Web Speech API (default) or OpenAI Whisper via /api/stt.
import { STTConfig } from '../config/settings';

export interface BrowserRecognitionHandlers {
  onResult: (text: string, isFinal: boolean) => void;
  onError?: (message: string) => void;
  onEnd?: () => void;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
// The Web Speech API has no standard TS typings; `any` is intentional here.
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
}

export class BrowserRecognition {
  private rec: SpeechRecognitionLike | null = null;
  private running = false;

  get supported(): boolean {
    return typeof window !== 'undefined' && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  }

  start(h: BrowserRecognitionHandlers, continuous = false): void {
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Ctor) {
      h.onError?.('Browser speech recognition not supported. Use Chrome or Edge, or configure Whisper in Settings.');
      return;
    }
    this.stop();
    const rec: SpeechRecognitionLike = new Ctor();
    rec.continuous = continuous;
    rec.interimResults = true;
    rec.lang = 'en-US';
    rec.onresult = (e: any) => {
      let text = '';
      let isFinal = false;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
        if (e.results[i].isFinal) isFinal = true;
      }
      if (text) h.onResult(text, isFinal);
    };
    rec.onerror = (e: any) => {
      if (e.error === 'not-allowed') h.onError?.('Microphone permission denied.');
      else if (e.error !== 'aborted' && e.error !== 'no-speech') h.onError?.(`Speech recognition error: ${e.error}`);
    };
    rec.onend = () => {
      this.running = false;
      h.onEnd?.();
    };
    this.rec = rec;
    this.running = true;
    rec.start();
  }

  stop(): void {
    if (this.rec) {
      try { this.rec.stop(); } catch { /* */ }
      this.running = false;
      this.rec = null;
    }
  }

  get isRunning(): boolean {
    return this.running;
  }
}

export async function whisperTranscribe(audio: Blob, cfg: STTConfig): Promise<string> {
  const form = new FormData();
  form.append('audio', audio, 'speech.webm');
  form.append('model', cfg.model || 'whisper-1');
  form.append('language', cfg.language || 'en');
  const res = await fetch('/api/stt', {
    method: 'POST',
    headers: { 'x-stt-key': cfg.apiKey },
    body: form,
  });
  if (!res.ok) {
    let msg = `Transcription error ${res.status}`;
    try { const j = await res.json(); if (j.error) msg = j.error; } catch { /* */ }
    throw new Error(msg);
  }
  const j = await res.json();
  return j.text ?? '';
}