// Server route: chat completions via configured provider. Key arrives from
// the browser (BYOK) but is used only server-side, never echoed back.
import { NextRequest, NextResponse } from 'next/server';
import { openaiProvider } from '@/lib/llm/providers/openaiProvider';
import { anthropicProvider } from '@/lib/llm/providers/anthropicProvider';
import { geminiProvider } from '@/lib/llm/providers/geminiProvider';
import { friendlyProviderError } from '@/lib/llm/types';
import { LLMConfig } from '@/lib/config/settings';

export const runtime = 'nodejs';

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

interface Body {
  provider: string;
  apiKey: string;
  model: string;
  baseUrl?: string;
  temperature: number;
  maxTokens: number;
  messages: { role: string; content: string }[];
  stream?: boolean;
}

function pick(provider: string) {
  switch (provider) {
    case 'openai':
    case 'openai-compatible':
    case 'openrouter':
      return openaiProvider;
    case 'anthropic':
      return anthropicProvider;
    case 'gemini':
      return geminiProvider;
    default:
      return null;
  }
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }
  const { provider, apiKey, model, baseUrl, temperature, maxTokens, messages, stream } = body;
  if (provider === 'demo') {
    return NextResponse.json({ error: 'Demo provider is handled client-side.' }, { status: 400 });
  }
  const impl = pick(provider);
  if (!impl) return NextResponse.json({ error: `Unknown provider: ${provider}` }, { status: 400 });
  if (!apiKey) return NextResponse.json({ error: 'No API key configured.' }, { status: 401 });
  const cfg = { apiKey, model, temperature, maxTokens, baseUrl: provider === 'openrouter' ? OPENROUTER_BASE : baseUrl, provider: provider as LLMConfig['provider'] };
  const chatMessages = messages as { role: 'system' | 'user' | 'assistant'; content: string }[];

  const upstream = new AbortController();
  req.signal.addEventListener('abort', () => upstream.abort());

  try {
    if (stream) {
      const encoder = new TextEncoder();
      const gen = impl.streamChat(chatMessages, cfg, upstream.signal);
      const rs = new ReadableStream({
        async pull(controller) {
          try {
            const { done, value } = await gen.next();
            if (done) {
              controller.close();
              return;
            }
            controller.enqueue(encoder.encode(JSON.stringify({ t: value }) + '\n'));
          } catch (e) {
            controller.enqueue(encoder.encode(JSON.stringify({ e: friendlyProviderError(e) }) + '\n'));
            controller.close();
          }
        },
        cancel() {
          upstream.abort();
        },
      });
      return new NextResponse(rs, {
        headers: { 'content-type': 'application/x-ndjson', 'cache-control': 'no-store' },
      });
    }
    const text = await impl.complete(chatMessages, cfg, upstream.signal);
    return NextResponse.json({ text });
  } catch (e) {
    return NextResponse.json({ error: friendlyProviderError(e) }, { status: 502 });
  }
}