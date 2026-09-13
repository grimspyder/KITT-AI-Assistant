// State machine for the conversation loop.
export type ConvState =
  | 'DISCONNECTED'
  | 'IDLE'
  | 'LISTENING'
  | 'PROCESSING'
  | 'SPEAKING'
  | 'INTERRUPTED'
  | 'ERROR';

export type ConvEvent =
  | { type: 'ACTIVATE' }
  | { type: 'START_LISTENING' }
  | { type: 'STOP_LISTENING' }
  | { type: 'SUBMIT_UTTERANCE' }
  | { type: 'RESPONSE_STARTED' }
  | { type: 'PLAYBACK_ENDED' }
  | { type: 'INTERRUPTION_DETECTED' }
  | { type: 'ERROR'; message: string }
  | { type: 'DISCONNECT' }
  | { type: 'RESET' };

export interface MachineSnapshot {
  state: ConvState;
  error?: string;
  history: ConvState[];
}

const TRANSITIONS: Record<ConvState, Partial<Record<ConvEvent['type'], ConvState>>> = {
  DISCONNECTED: { ACTIVATE: 'IDLE', RESET: 'IDLE' },
  IDLE: { START_LISTENING: 'LISTENING', SUBMIT_UTTERANCE: 'PROCESSING', ERROR: 'ERROR', DISCONNECT: 'DISCONNECTED' },
  LISTENING: { STOP_LISTENING: 'IDLE', SUBMIT_UTTERANCE: 'PROCESSING', ERROR: 'ERROR', DISCONNECT: 'DISCONNECTED' },
  PROCESSING: { RESPONSE_STARTED: 'SPEAKING', STOP_LISTENING: 'PROCESSING', ERROR: 'ERROR', INTERRUPTION_DETECTED: 'INTERRUPTED', RESET: 'IDLE' },
  SPEAKING: { PLAYBACK_ENDED: 'IDLE', INTERRUPTION_DETECTED: 'INTERRUPTED', ERROR: 'ERROR', DISCONNECT: 'DISCONNECTED' },
  INTERRUPTED: { START_LISTENING: 'LISTENING', SUBMIT_UTTERANCE: 'PROCESSING', RESET: 'IDLE' },
  ERROR: { RESET: 'IDLE', START_LISTENING: 'LISTENING', ACTIVATE: 'IDLE' },
};

export function transition(state: ConvState, event: ConvEvent['type']): ConvState {
  const next = TRANSITIONS[state]?.[event];
  if (!next) return state; // deliberate: ignore invalid events, do not crash
  return next;
}

export function step(machine: MachineSnapshot, event: ConvEvent): MachineSnapshot {
  const next = transition(machine.state, event.type);
  if (next === machine.state && event.type !== 'ERROR') {
    // no-op transition (invalid event for this state) — leave snapshot intact
    if (event.type === 'PLAYBACK_ENDED' || event.type === 'SUBMIT_UTTERANCE' || event.type === 'STOP_LISTENING' || event.type === 'START_LISTENING' || event.type === 'RESPONSE_STARTED' || event.type === 'INTERRUPTION_DETECTED') {
      // allow idempotent re-entries for robustness in audio callbacks
    }
    return machine;
  }
  return {
    state: next,
    error: event.type === 'ERROR' ? (event as { message: string }).message : undefined,
    history: [...machine.history.slice(-19), machine.state],
  };
}

export function initialState(): MachineSnapshot {
  return { state: 'DISCONNECTED', history: [] };
}