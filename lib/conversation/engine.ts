// Conversation orchestrator: mic → STT → LLM (streaming) → TTS with
// sentence-level streaming playback, interruption, state machine, latency trace.

import { KITTSettings, systemPromptFor } from '../config/settings';
import { LLMClient, Turn, buildMessages } from '../llm/client';
import { TTSClient } from '../tts/client';
import { AudioPipeline } from '../audio/pipeline';
import { MicCapture } from '../stt/mic';
import { BrowserRecognition, whisperTranscribe } from '../stt/stt';
import { MachineSnapshot, ConvEvent, step, initialState } from './stateMachine';
import { friendlyProviderError } from '../llm/types';

export interface LatencyTrace {
  utteranceEnd?: number;
  transcriptionDone?: number;
  llmFirstToken?: number;
  ttsFirstByte?: number;
  firstPlayback?: number;
}

export interface ConversationHandlers {
  onState?: (s: MachineSnapshot) => void;
  onTranscript?: (role: 'user' | 'assistant', text: string, interim?: boolean) => void;
  onLatency?: (t: LatencyTrace) => void;
  onError?: (message: string) => void;
  onMicrophoneReady?: () => void;
}

export class ConversationEngine {
  machine: MachineSnapshot = initialState();
  history: Turn[] = [];
  pipeline: AudioPipeline;
  latency: LatencyTrace = {};
  private settings: KITTSettings;
  private llm = new LLMClient();
  private tts: TTSClient;
  private mic = new MicCapture();
  private browserRec = new BrowserRecognition();
  private handlers: ConversationHandlers = {};
  private abort: AbortController | null = null;
  private speakQueue: string[] = [];
  private ttsBusy = false;
  private llmDone = false;
  private started = false;
  private micLevelCb: ((level: number) => void) | null = null;
  private permissionStream: MediaStream | null = null;

  constructor(settings: KITTSettings) {
    this.settings = settings;
    this.pipeline = new AudioPipeline();
    this.tts = new TTSClient(this.pipeline);
    this.pipeline.onEnded = () => this.onPlaybackDrained();
  }

  updateSettings(s: KITTSettings): void {
    this.settings = s;
  }

  private dispatch(ev: ConvEvent): void {
    this.machine = step(this.machine, ev);
    this.handlers.onState?.(this.machine);
  }

  private err(message: string): void {
    // Mic-permission problems are reported but leave the engine usable (text input still works).
    if (/microphone permission denied/i.test(message)) {
      this.handlers.onError?.(message);
      if (this.machine.state === 'LISTENING') this.dispatch({ type: 'STOP_LISTENING' });
      return;
    }
    this.dispatch({ type: 'ERROR', message });
    this.handlers.onError?.(message);
  }

  async start(handlers: ConversationHandlers): Promise<void> {
    this.handlers = handlers;
    this.started = true;
    this.dispatch({ type: 'ACTIVATE' });
    this.pipeline.ensure();
    await this.listen();
  }

  isActive(): boolean {
    return this.started;
  }

  /** Begin listening for the next user utterance. */
  async listen(): Promise<void> {
    if (!this.started || this.speakQueue.length > 0 || this.ttsBusy) return;
    this.dispatch({ type: 'START_LISTENING' });
    if (this.settings.stt.provider === 'browser') {
      if (!this.browserRec.supported) {
        this.err('This browser does not support speech recognition. Use Chrome or Edge, or switch Settings → SPEECH to OpenAI Whisper.');
        return;
      }
      try {
        // Explicitly request permission before Web Speech API. This makes the
        // browser prompt appear from the user's START click instead of silently
        // failing inside speech recognition.
        this.permissionStream?.getTracks().forEach((track) => track.stop());
        this.permissionStream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: this.settings.mic.deviceId ? { exact: this.settings.mic.deviceId } : undefined, echoCancellation: this.settings.mic.echoCancellation, noiseSuppression: this.settings.mic.noiseSuppression, autoGainControl: this.settings.mic.autoGainControl } });
        this.handlers.onMicrophoneReady?.();
      } catch (e) {
        const name = e instanceof DOMException ? e.name : '';
        if (name === 'NotFoundError') {
          this.err('No microphone found. Connect a microphone and choose it in Settings → AUDIO.');
        } else if (name === 'NotAllowedError' || name === 'SecurityError') {
          this.err('Microphone permission was blocked. Click the lock icon beside the address, set Microphone to Allow, then reload.');
        } else {
          this.err('Microphone could not be opened: ' + (e instanceof Error ? e.message : String(e)));
        }
        return;
      }
      this.browserRec.start({
        onResult: (text, isFinal) => {
          this.handlers.onTranscript?.('user', text, !isFinal);
          if (isFinal && text.trim()) {
            void this.handleUtterance(text.trim());
          }
        },
        onError: (m) => this.err(m),
        onEnd: () => {
          if (this.machine.state === 'LISTENING' && !this.ttsBusy) {
            this.dispatch({ type: 'STOP_LISTENING' });
            // auto-restart listening for continuous conversation
            setTimeout(() => void this.listen(), 250);
          }
        },
      });
    } else {
      try {
        await this.mic.start(
          {
            onUtterance: (blob) => void this.transcribeBlob(blob),
            onLevel: (l) => this.micLevelCb?.(l),
            onBargeIn: () => this.interrupt(),
            onError: (m) => this.err(m),
          },
          {
            deviceId: this.settings.mic.deviceId,
            echoCancellation: this.settings.mic.echoCancellation,
            noiseSuppression: this.settings.mic.noiseSuppression,
            autoGainControl: this.settings.mic.autoGainControl,
            handsFree: this.settings.mic.handsFree,
            autoInterrupt: this.settings.mic.autoInterrupt,
          },
        );
      } catch (e) {
        this.err(friendlyProviderError(e));
      }
    }
  }

  private async transcribeBlob(blob: Blob): Promise<void> {
    this.latency.utteranceEnd = performance.now();
    this.dispatch({ type: 'SUBMIT_UTTERANCE' });
    try {
      const text = await whisperTranscribe(blob, this.settings.stt);
      this.latency.transcriptionDone = performance.now();
      if (text.trim()) await this.handleUtterance(text.trim());
      else void this.listen();
    } catch (e) {
      this.err(friendlyProviderError(e));
    }
  }

  /** Handle a completed user utterance. */
  async handleUtterance(text: string): Promise<void> {
    if (!text.trim() || !this.started) return;
    this.browserRec.stop();
    this.pipeline.stop(); // in case anything is playing
    this.speakQueue = [];
    this.ttsBusy = false;
    this.llmDone = false;
    this.consideredStart = 0;
    this.latency = { utteranceEnd: performance.now() };
    this.dispatch({ type: 'SUBMIT_UTTERANCE' });
    this.handlers.onTranscript?.('user', text);
    this.history.push({ role: 'user', content: text });

    this.abort = new AbortController();
    let full = '';
    let firstTokenSeen = false;

    try {
      for await (const chunk of this.llm.streamChat(
        buildMessages(systemPromptFor(this.settings), this.history),
        {
          provider: this.settings.llm.provider,
          apiKey: this.settings.llm.apiKey,
          model: this.settings.llm.model,
          baseUrl: this.settings.llm.baseUrl || undefined,
          temperature: this.settings.llm.temperature,
          maxTokens: this.settings.llm.maxTokens,
        },
        this.abort.signal,
      )) {
        full += chunk;
        if (!firstTokenSeen) {
          firstTokenSeen = true;
          this.latency.llmFirstToken = performance.now();
        }
        this.handlers.onTranscript?.('assistant', full, true);
        this.queueFrom(full, false);
      }
      this.llmDone = true;
      this.queueFrom(full, true); // flush tail
      if (full.trim()) {
        this.history.push({ role: 'assistant', content: full.trim() });
        this.handlers.onTranscript?.('assistant', full.trim(), false);
      }
      if (!this.ttsBusy && this.speakQueue.length === 0) {
        // provider returned nothing speakable
        this.dispatch({ type: 'PLAYBACK_ENDED' });
        void this.listen();
      }
      void this.pumpTTS();
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      if (e instanceof Error && e.name === 'AbortError') return;
      this.err(friendlyProviderError(e));
    }
  }

  private consideredStart = 0;

  /** Queue complete sentences from newly arrived text.
   A sentence is only consumed once a terminator [.!?] is FOLLOWED by whitespace
   (or text is final). The un-consumed remainder is re-examined on the next chunk,
   so boundaries that form across chunk edges are never lost. */
  private queueFrom(text: string, final: boolean): void {
    const region = text.slice(this.consideredStart);
    if (!region) {
      if (final) this.consideredStart = text.length;
      return;
    }
    // Find the last terminator-followed-by-whitespace boundary in the region.
    const boundary = /([.!?])(\s+)/g;
    let lastEnd = -1;
    let m: RegExpExecArray | null;
    while ((m = boundary.exec(region)) !== null) {
      lastEnd = m.index + m[1].length; // position just past the terminator
    }
    if (lastEnd === -1) {
      // No complete sentence yet.
      if (final) {
        const t = region.trim();
        if (t) this.speakQueue.push(t);
        this.consideredStart = text.length;
      }
      return;
    }
    const sentence = region.slice(0, lastEnd).trim();
    if (sentence) this.speakQueue.push(sentence);
    this.consideredStart += lastEnd;
    // Recurse to catch multiple completed sentences in this region.
    this.queueFrom(text, final);
  }

  private async pumpTTS(): Promise<void> {
    if (this.ttsBusy) return;
    this.ttsBusy = true;
    while (this.speakQueue.length > 0) {
      const seg = this.speakQueue.shift()!;
      if (this.abort?.signal.aborted) break;
      if (this.machine.state !== 'SPEAKING') {
        this.dispatch({ type: 'RESPONSE_STARTED' });
        this.latency.ttsFirstByte = performance.now();
        this.handlers.onLatency?.({ ...this.latency });
      }
      if (this.settings.mic.autoInterrupt && this.settings.stt.provider !== 'browser') {
        this.mic.bargeInArmed = true;
      }
      try {
        if (this.settings.tts.provider === 'browser') {
          await this.tts.speakBrowserWithEnd(seg, this.settings.tts);
        } else {
          await this.tts.speak(seg, this.settings.tts, this.abort?.signal);
        }
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') break;
        this.err(friendlyProviderError(e));
        break;
      }
    }
    this.ttsBusy = false;
    if (this.llmDone && this.speakQueue.length === 0 && this.machine.state === 'SPEAKING') {
      this.dispatch({ type: 'PLAYBACK_ENDED' });
      void this.listen();
    }
  }

  private onPlaybackDrained(): void {
    // pipeline.onEnded: stream/element playback finished naturally
  }

  interrupt(): void {
    this.abort?.abort();
    this.pipeline.stop();
    this.browserRec.stop();
    this.speakQueue = [];
    this.ttsBusy = false;
    this.llmDone = true;
    this.mic.bargeInArmed = false;
    this.dispatch({ type: 'INTERRUPTION_DETECTED' });
    setTimeout(() => void this.listen(), 300);
  }

  /** Push-to-talk release: transcribe what was captured. */
  async pushToTalkCommit(): Promise<void> {
    this.mic.stopRecording();
    await new Promise((r) => setTimeout(r, 200));
  }

  async sendText(text: string): Promise<void> {
    await this.handleUtterance(text);
  }

  newConversation(): void {
    this.history = [];
  }

  setMicLevelCallback(cb: (level: number) => void): void {
    this.micLevelCb = cb;
  }

  stop(): void {
    this.abort?.abort();
    this.pipeline.stop();
    this.browserRec.stop();
    this.mic.stop();
    this.speakQueue = [];
    this.ttsBusy = false;
    this.started = false;
    this.dispatch({ type: 'DISCONNECT' });
  }
}