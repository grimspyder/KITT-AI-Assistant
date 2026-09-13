import { ConvState, ConvEvent, MachineSnapshot, step, initialState } from '@/lib/conversation/stateMachine';

describe('conversation state machine', () => {
  it('starts DISCONNECTED and activates to IDLE', () => {
    let m = initialState();
    expect(m.state).toBe('DISCONNECTED');
    m = step(m, { type: 'ACTIVATE' });
    expect(m.state).toBe('IDLE');
  });

  it('walks the full happy path: idle->listening->processing->speaking->idle', () => {
    let m: MachineSnapshot = { state: 'IDLE', history: [] };
    m = step(m, { type: 'START_LISTENING' });
    expect(m.state).toBe('LISTENING');
    m = step(m, { type: 'SUBMIT_UTTERANCE' });
    expect(m.state).toBe('PROCESSING');
    m = step(m, { type: 'RESPONSE_STARTED' });
    expect(m.state).toBe('SPEAKING');
    m = step(m, { type: 'PLAYBACK_ENDED' });
    expect(m.state).toBe('IDLE');
  });

  it('interrupts from SPEAKING to INTERRUPTED, then returns to LISTENING', () => {
    let m: MachineSnapshot = { state: 'SPEAKING', history: [] };
    m = step(m, { type: 'INTERRUPTION_DETECTED' });
    expect(m.state).toBe('INTERRUPTED');
    m = step(m, { type: 'START_LISTENING' });
    expect(m.state).toBe('LISTENING');
  });

  it('ignores invalid events without crashing', () => {
    let m: MachineSnapshot = { state: 'IDLE', history: [] };
    m = step(m, { type: 'RESPONSE_STARTED' });
    expect(m.state).toBe('IDLE');
    m = step(m, { type: 'PLAYBACK_ENDED' });
    expect(m.state).toBe('IDLE');
  });

  it('handles ERROR and RESET', () => {
    let m: MachineSnapshot = { state: 'PROCESSING', history: [] };
    m = step(m, { type: 'ERROR', message: 'boom' });
    expect(m.state).toBe('ERROR');
    expect(m.error).toBe('boom');
    m = step(m, { type: 'RESET' });
    expect(m.state).toBe('IDLE');
  });

  it('records history of visited states', () => {
    let m = initialState();
    m = step(m, { type: 'ACTIVATE' });
    m = step(m, { type: 'START_LISTENING' });
    m = step(m, { type: 'SUBMIT_UTTERANCE' });
    expect(m.history).toEqual(['DISCONNECTED', 'IDLE', 'LISTENING']);
  });

  it('covers every state x event combination without throwing', () => {
    const events: ConvEvent['type'][] = ['ACTIVATE','START_LISTENING','STOP_LISTENING','SUBMIT_UTTERANCE','RESPONSE_STARTED','PLAYBACK_ENDED','INTERRUPTION_DETECTED','ERROR','DISCONNECT','RESET'];
    const states: ConvState[] = ['DISCONNECTED','IDLE','LISTENING','PROCESSING','SPEAKING','INTERRUPTED','ERROR'];
    for (const s of states) {
      let m: MachineSnapshot = { state: s, history: [] };
      for (const e of events) {
        expect(() => step(m, { type: e } as ConvEvent)).not.toThrow();
        m = { state: s, history: [] };
      }
    }
  });
});