import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VoiceInputEngine, SpeechOutput, NOTHING_HEARD_MESSAGE, NO_SPEECH_MESSAGE } from '../hooks/voiceEngine';
import { voiceApi } from '../api/voice';

vi.mock('../api/voice', () => ({
  voiceApi: {
    transcribeAudio: vi.fn(),
    synthesizeSpeech: vi.fn(),
  },
}));

/** Minimal stand-in for the browser's webkitSpeechRecognition */
class FakeRecognition {
  static instances: FakeRecognition[] = [];
  continuous = false;
  interimResults = false;
  lang = '';
  running = false;
  onresult: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  onend: (() => void) | null = null;

  constructor() {
    FakeRecognition.instances.push(this);
  }

  start() {
    if (this.running) throw new Error('InvalidStateError');
    this.running = true;
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    setTimeout(() => this.onend?.(), 0);
  }

  abort() {
    this.running = false;
  }

  /** Emit results the way Chrome does: the full result list plus the index of the first changed one */
  emit(results: Array<{ text: string; isFinal: boolean }>, resultIndex: number) {
    this.onresult?.({
      resultIndex,
      results: results.map((r) => Object.assign([{ transcript: r.text }], { isFinal: r.isFinal })),
    });
  }
}

function makeCallbacks() {
  return {
    onListeningChange: vi.fn(),
    onTranscribingChange: vi.fn(),
    onInterim: vi.fn(),
    onError: vi.fn(),
    onResult: vi.fn(),
  };
}

describe('VoiceInputEngine (browser speech recognition only)', () => {
  beforeEach(() => {
    FakeRecognition.instances = [];
    (window as any).webkitSpeechRecognition = FakeRecognition;
  });

  afterEach(() => {
    delete (window as any).webkitSpeechRecognition;
    vi.useRealTimers();
  });

  it('uses continuous recognition and delivers all final segments, not just the last one', async () => {
    const callbacks = makeCallbacks();
    const engine = new VoiceInputEngine(callbacks, 'en-IN');
    const rec = FakeRecognition.instances[0];
    expect(rec.continuous).toBe(true);
    expect(rec.interimResults).toBe(true);

    await engine.start();
    expect(callbacks.onListeningChange).toHaveBeenLastCalledWith(true);

    rec.emit([{ text: 'paid 500', isFinal: true }], 0);
    rec.emit(
      [
        { text: 'paid 500', isFinal: true },
        { text: 'for lunch', isFinal: false },
      ],
      1
    );
    expect(callbacks.onInterim).toHaveBeenLastCalledWith('paid 500 for lunch');

    rec.emit(
      [
        { text: 'paid 500', isFinal: true },
        { text: 'for lunch from cash', isFinal: true },
      ],
      1
    );

    engine.stop();
    await vi.waitFor(() => expect(callbacks.onResult).toHaveBeenCalledWith('paid 500 for lunch from cash'));
    expect(callbacks.onListeningChange).toHaveBeenLastCalledWith(false);
    expect(callbacks.onError).not.toHaveBeenCalledWith(NOTHING_HEARD_MESSAGE);
  });

  it('tells the user when nothing was heard', async () => {
    const callbacks = makeCallbacks();
    const engine = new VoiceInputEngine(callbacks, 'en-IN');

    await engine.start();
    engine.stop();

    await vi.waitFor(() => expect(callbacks.onError).toHaveBeenCalledWith(NOTHING_HEARD_MESSAGE));
    expect(callbacks.onResult).not.toHaveBeenCalled();
  });

  it('stops by itself when nothing is said for several seconds', async () => {
    vi.useFakeTimers();
    const callbacks = makeCallbacks();
    const engine = new VoiceInputEngine(callbacks, 'en-IN');

    await engine.start();
    vi.advanceTimersByTime(7500);
    await vi.runAllTimersAsync();

    expect(callbacks.onError).toHaveBeenCalledWith(NO_SPEECH_MESSAGE);
    expect(callbacks.onResult).not.toHaveBeenCalled();
    expect(engine.isActive).toBe(false);
  });

  it('stops after the speaker pauses', async () => {
    vi.useFakeTimers();
    const callbacks = makeCallbacks();
    const engine = new VoiceInputEngine(callbacks, 'en-IN');
    const rec = FakeRecognition.instances[0];

    await engine.start();
    rec.emit([{ text: 'withdrew 2000 from bank', isFinal: true }], 0);
    vi.advanceTimersByTime(2500);
    await vi.runAllTimersAsync();

    expect(callbacks.onResult).toHaveBeenCalledWith('withdrew 2000 from bank');
  });

  it('discards the recording when cancelled', async () => {
    const callbacks = makeCallbacks();
    const engine = new VoiceInputEngine(callbacks, 'en-IN');
    const rec = FakeRecognition.instances[0];

    await engine.start();
    rec.emit([{ text: 'paid 500', isFinal: true }], 0);
    engine.cancel();

    await new Promise((r) => setTimeout(r, 10));
    expect(callbacks.onResult).not.toHaveBeenCalled();
    expect(engine.isActive).toBe(false);
  });
});

describe('SpeechOutput', () => {
  it('resolves true when no speech could be played', async () => {
    (voiceApi.synthesizeSpeech as any).mockRejectedValueOnce(new Error('503'));
    const onSpeaking = vi.fn();
    const output = new SpeechOutput(onSpeaking);

    await expect(output.speak('How much did you pay?', 'neutral_female')).resolves.toBe(true);
    expect(onSpeaking).toHaveBeenLastCalledWith(false);
  });

  it('resolves false when interrupted', async () => {
    (voiceApi.synthesizeSpeech as any).mockReturnValueOnce(new Promise(() => undefined));
    const output = new SpeechOutput(vi.fn());

    const speaking = output.speak('Did you pay in cash or from your bank account?', 'neutral_female');
    output.stop();
    await expect(speaking).resolves.toBe(false);
  });
});
