// Settings drawer — organized sections; secrets masked; test buttons.
'use client';

import { useState } from 'react';
import { KITTSettings, DEFAULT_SYSTEM_PROMPT, TTSProviderId, ProviderId, STTProviderId } from '@/lib/config/settings';
import { llmClient } from '@/lib/llm/client';
import { TTSClient } from '@/lib/tts/client';
import { AudioPipeline } from '@/lib/audio/pipeline';
import { maskKey } from '@/lib/config/storage';

interface Props {
  settings: KITTSettings;
  micList: MediaDeviceInfo[];
  onClose: (next?: KITTSettings) => void;
  onDeleteSecrets: () => void;
}

type Section = 'AI BRAIN' | 'VOICE' | 'SPEECH' | 'AUDIO' | 'PERSONALITY' | 'CONVERSATION' | 'DISPLAY' | 'PRIVACY' | 'ADVANCED';
const SECTIONS: Section[] = ['AI BRAIN', 'VOICE', 'SPEECH', 'AUDIO', 'PERSONALITY', 'CONVERSATION', 'DISPLAY', 'PRIVACY', 'ADVANCED'];

export default function SettingsPanel({ settings, micList, onClose, onDeleteSecrets }: Props) {
  const [s, setS] = useState<KITTSettings>({ ...settings });
  const [section, setSection] = useState<Section>('AI BRAIN');
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const upd = (patch: Partial<KITTSettings>) => setS((prev) => ({ ...prev, ...patch }));

  const input: React.CSSProperties = { background: '#0d0d0d', border: '1px solid #333', color: '#ddd', padding: '6px 8px', borderRadius: 4, width: '100%', boxSizing: 'border-box' };
  const label: React.CSSProperties = { display: 'block', fontSize: 11, color: '#888', margin: '10px 0 4px', letterSpacing: '0.08em' };

  const runTestLLM = async () => {
    setTesting(true);
    setTestMsg(null);
    const r = await llmClient.testConnection({ provider: s.llm.provider, apiKey: s.llm.apiKey, model: s.llm.model, baseUrl: s.llm.baseUrl || undefined });
    setTestMsg({ ok: r.ok, text: r.message });
    setTesting(false);
  };

  const runTestVoice = async () => {
    setTesting(true);
    setTestMsg(null);
    const pipe = new AudioPipeline();
    const tts = new TTSClient(pipe);
    const r = await tts.testVoice(s.tts);
    setTestMsg({ ok: r.ok, text: r.message });
    pipe.close();
    setTesting(false);
  };

  return (
    <div role="dialog" aria-label="Settings" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 50, overflowY: 'auto', padding: '16px' }}>
      <div style={{ maxWidth: 640, margin: '0 auto', color: '#ccc' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 16, letterSpacing: '0.2em', color: '#ff5050' }}>KITT SETTINGS</h2>
          <button className="kitt-btn" onClick={() => onClose(s)}>CLOSE (SAVE)</button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '12px 0' }}>
          {SECTIONS.map((sec) => (
            <button key={sec} className="kitt-btn" style={{ background: section === sec ? '#3a0d0d' : '#151515', borderColor: section === sec ? '#ff1a1a' : '#3a3a3a' }} onClick={() => setSection(sec)}>
              {sec}
            </button>
          ))}
        </div>

        {section === 'AI BRAIN' && (
          <div>
            <label style={label}>Provider</label>
            <select style={input} value={s.llm.provider} onChange={(e) => upd({ llm: { ...s.llm, provider: e.target.value as ProviderId } })}>
              <option value="demo">Demo (no API)</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="gemini">Google Gemini</option>
              <option value="openai-compatible">OpenAI-compatible endpoint</option>
              <option value="openrouter">OpenRouter</option>
            </select>
            {s.llm.provider === 'openai-compatible' && (
              <>
                <label style={label}>Base URL</label>
                <input style={input} value={s.llm.baseUrl ?? ''} onChange={(e) => upd({ llm: { ...s.llm, baseUrl: e.target.value } })} placeholder="https://host/v1" />
              </>
            )}
            {s.llm.provider === 'openrouter' && (
              <p style={{ fontSize: 11, color: '#666' }}>Models use vendor/name form, e.g. openai/gpt-4o-mini, anthropic/claude-3.5-sonnet.</p>
            )}
            <label style={label}>Model</label>
            <input style={input} value={s.llm.model} onChange={(e) => upd({ llm: { ...s.llm, model: e.target.value } })} />
            {s.llm.provider !== 'demo' && (
              <>
                <label style={label}>API key (stored encrypted on this device only)</label>
                <input type="password" style={input} value={s.llm.apiKey} onChange={(e) => upd({ llm: { ...s.llm, apiKey: e.target.value } })} placeholder={s.llm.apiKey ? maskKey(s.llm.apiKey) : 'paste key…'} />
              </>
            )}
            <label style={label}>Temperature ({s.llm.temperature.toFixed(2)})</label>
            <input type="range" min={0} max={1.5} step={0.05} value={s.llm.temperature} onChange={(e) => upd({ llm: { ...s.llm, temperature: Number(e.target.value) } })} style={{ width: '100%' }} />
            <label style={label}>Max response tokens</label>
            <input type="number" style={input} value={s.llm.maxTokens} onChange={(e) => upd({ llm: { ...s.llm, maxTokens: Number(e.target.value) || 300 } })} />
            <button className="kitt-btn" disabled={testing} onClick={() => void runTestLLM()} style={{ marginTop: 12 }}>
              {testing ? 'TESTING…' : 'TEST CONNECTION'}
            </button>
          </div>
        )}

        {section === 'VOICE' && (
          <div>
            <label style={label}>Voice provider</label>
            <select style={input} value={s.tts.provider} onChange={(e) => upd({ tts: { ...s.tts, provider: e.target.value as TTSProviderId } })}>
              <option value="demo">Demo synth voice (no API)</option>
              <option value="browser">Browser built-in voice</option>
              <option value="elevenlabs">ElevenLabs</option>
              <option value="openai">OpenAI TTS</option>
            </select>
            {(s.tts.provider === 'elevenlabs' || s.tts.provider === 'openai') && (
              <>
                <label style={label}>API key</label>
                <input type="password" style={input} value={s.tts.apiKey} onChange={(e) => upd({ tts: { ...s.tts, apiKey: e.target.value } })} placeholder={s.tts.apiKey ? maskKey(s.tts.apiKey) : 'paste key…'} />
                <label style={label}>{s.tts.provider === 'elevenlabs' ? 'Voice ID' : 'Voice (alloy/echo/fable/onyx/nova/shimmer)'}</label>
                <input style={input} value={s.tts.voiceId} onChange={(e) => upd({ tts: { ...s.tts, voiceId: e.target.value } })} />
                <label style={label}>Model {s.tts.provider === 'elevenlabs' ? '(eleven_turbo_v2_5 / eleven_multilingual_v2)' : '(tts-1 / tts-1-hd)'}</label>
                <input style={input} value={s.tts.model} onChange={(e) => upd({ tts: { ...s.tts, model: e.target.value } })} />
              </>
            )}
            <label style={label}>Stability ({s.tts.stability.toFixed(2)})</label>
            <input type="range" min={0} max={1} step={0.05} value={s.tts.stability} onChange={(e) => upd({ tts: { ...s.tts, stability: Number(e.target.value) } })} style={{ width: '100%' }} />
            <label style={label}>Similarity boost ({s.tts.similarityBoost.toFixed(2)})</label>
            <input type="range" min={0} max={1} step={0.05} value={s.tts.similarityBoost} onChange={(e) => upd({ tts: { ...s.tts, similarityBoost: Number(e.target.value) } })} style={{ width: '100%' }} />
            <label style={label}>Style ({s.tts.style.toFixed(2)})</label>
            <input type="range" min={0} max={1} step={0.05} value={s.tts.style} onChange={(e) => upd({ tts: { ...s.tts, style: Number(e.target.value) } })} style={{ width: '100%' }} />
            <label style={label}>Speed ({s.tts.speed.toFixed(2)}x)</label>
            <input type="range" min={0.7} max={1.3} step={0.05} value={s.tts.speed} onChange={(e) => upd({ tts: { ...s.tts, speed: Number(e.target.value) } })} style={{ width: '100%' }} />
            <label style={label}>Speaker boost (ElevenLabs)</label>
            <input type="checkbox" checked={s.tts.speakerBoost} onChange={(e) => upd({ tts: { ...s.tts, speakerBoost: e.target.checked } })} />
            <label style={label}>Output volume ({Math.round(s.tts.outputVolume * 100)}%)</label>
            <input type="range" min={0} max={1} step={0.05} value={s.tts.outputVolume} onChange={(e) => upd({ tts: { ...s.tts, outputVolume: Number(e.target.value) } })} style={{ width: '100%' }} />
            <button className="kitt-btn" disabled={testing} onClick={() => void runTestVoice()} style={{ marginTop: 12 }}>
              {testing ? 'TESTING…' : 'TEST VOICE'}
            </button>
          </div>
        )}

        {section === 'SPEECH' && (
          <div>
            <label style={label}>Speech recognition</label>
            <select style={input} value={s.stt.provider} onChange={(e) => upd({ stt: { ...s.stt, provider: e.target.value as STTProviderId } })}>
              <option value="browser">Browser recognition (Chrome/Edge)</option>
              <option value="openai">OpenAI Whisper (API key required)</option>
            </select>
            {s.stt.provider === 'openai' && (
              <>
                <label style={label}>Whisper API key</label>
                <input type="password" style={input} value={s.stt.apiKey} onChange={(e) => upd({ stt: { ...s.stt, apiKey: e.target.value } })} placeholder={s.stt.apiKey ? maskKey(s.stt.apiKey) : 'paste key…'} />
              </>
            )}
            <label style={label}>Hands-free conversation (auto end-of-turn)</label>
            <input type="checkbox" checked={s.mic.handsFree} onChange={(e) => upd({ mic: { ...s.mic, handsFree: e.target.checked } })} />
            <label style={label}>Automatic interruption (barge-in)</label>
            <input type="checkbox" checked={s.mic.autoInterrupt} onChange={(e) => upd({ mic: { ...s.mic, autoInterrupt: e.target.checked } })} />
            <label style={label}>Echo cancellation</label>
            <input type="checkbox" checked={s.mic.echoCancellation} onChange={(e) => upd({ mic: { ...s.mic, echoCancellation: e.target.checked } })} />
            <label style={label}>Noise suppression</label>
            <input type="checkbox" checked={s.mic.noiseSuppression} onChange={(e) => upd({ mic: { ...s.mic, noiseSuppression: e.target.checked } })} />
            <label style={label}>Auto gain control</label>
            <input type="checkbox" checked={s.mic.autoGainControl} onChange={(e) => upd({ mic: { ...s.mic, autoGainControl: e.target.checked } })} />
          </div>
        )}

        {section === 'AUDIO' && (
          <div>
            <label style={label}>Microphone</label>
            <select style={input} onChange={() => undefined} value="">
              <option value="">System default</option>
              {micList.map((m, i) => (
                <option key={m.deviceId} value={m.deviceId}>{m.label || `Microphone ${i + 1}`}</option>
              ))}
            </select>
            <p style={{ fontSize: 11, color: '#666' }}>Output device follows the OS default (browser limitation).</p>
          </div>
        )}

        {section === 'PERSONALITY' && (
          <div>
            <label style={label}>What KITT calls you</label>
            <input style={input} value={s.userName} onChange={(e) => upd({ userName: e.target.value })} placeholder="(optional) your name" />
            <label style={label}>Response length</label>
            <select style={input} value={s.responseLength} onChange={(e) => upd({ responseLength: e.target.value as KITTSettings['responseLength'] })}>
              <option value="concise">Concise</option>
              <option value="normal">Normal</option>
              <option value="detailed">Detailed</option>
            </select>
          </div>
        )}

        {section === 'CONVERSATION' && (
          <div>
            <label style={label}>Save conversation history (this session)</label>
            <input type="checkbox" checked={s.saveHistory} onChange={(e) => upd({ saveHistory: e.target.checked })} />
            <p style={{ fontSize: 11, color: '#666' }}>Use New Conversation on the main screen to clear context.</p>
          </div>
        )}

        {section === 'DISPLAY' && (
          <div>
            <label style={label}>Brightness ({Math.round(s.display.brightness * 100)}%)</label>
            <input type="range" min={0.3} max={1.4} step={0.05} value={s.display.brightness} onChange={(e) => upd({ display: { ...s.display, brightness: Number(e.target.value) } })} style={{ width: '100%' }} />
            <label style={label}>LED smoothing ({s.display.smoothing.toFixed(2)}) — higher = slower bars</label>
            <input type="range" min={0} max={1} step={0.05} value={s.display.smoothing} onChange={(e) => upd({ display: { ...s.display, smoothing: Number(e.target.value) } })} style={{ width: '100%' }} />
            <label style={label}>Show transcript</label>
            <input type="checkbox" checked={s.display.showTranscript} onChange={(e) => upd({ display: { ...s.display, showTranscript: e.target.checked } })} />
            <label style={label}>Reduced motion (slower LED response)</label>
            <input type="checkbox" checked={s.display.reducedMotion} onChange={(e) => upd({ display: { ...s.display, reducedMotion: e.target.checked, smoothing: e.target.checked ? 0.9 : 0.5 } })} />
          </div>
        )}

        {section === 'PRIVACY' && (
          <div>
            <p style={{ fontSize: 12, color: '#999' }}>
              Microphone audio is processed locally and sent only to the configured speech provider (browser recognition, or Whisper via the server proxy). Voice text goes to the configured TTS provider. Audio is never recorded or stored unless you enable history.
            </p>
            <label style={label}>Remember API keys on this device (AES-GCM encrypted)</label>
            <input type="checkbox" checked={s.persistSecrets} onChange={(e) => upd({ persistSecrets: e.target.checked })} />
            <button className="kitt-btn" onClick={onDeleteSecrets} style={{ marginTop: 10 }}>DELETE SAVED KEYS</button>
          </div>
        )}

        {section === 'ADVANCED' && (
          <div>
            <label style={label}>KITT system prompt</label>
            <textarea style={{ ...input, minHeight: 180, fontFamily: 'monospace', fontSize: 12 }} value={s.systemPrompt} onChange={(e) => upd({ systemPrompt: e.target.value })} />
            <button className="kitt-btn" onClick={() => upd({ systemPrompt: DEFAULT_SYSTEM_PROMPT })} style={{ marginTop: 8 }}>RESET TO DEFAULT</button>
          </div>
        )}

        {testMsg && (
          <div style={{ marginTop: 12, fontSize: 13, color: testMsg.ok ? '#7bd87b' : '#ff6b6b' }}>{testMsg.ok ? '✔ ' : '✖ '}{testMsg.text}</div>
        )}

        <div style={{ margin: '16px 0 40px', display: 'flex', gap: 8 }}>
          <button className="kitt-btn" onClick={() => setS({ ...settings })}>REVERT</button>
          <button className="kitt-btn" onClick={() => onClose(s)}>SAVE & CLOSE</button>
        </div>
      </div>
    </div>
  );
}