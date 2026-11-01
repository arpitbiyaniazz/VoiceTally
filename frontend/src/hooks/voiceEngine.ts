import { voiceApi } from '../api/voice';

/**
 * Browser voice I/O for the VoiceTally assistant, kept outside React so a recording
 * session's state lives in one place:
 *   - VoiceInputEngine: records the microphone for Voxtral speech-to-text, shows live
 *     Web Speech hints, and stops by itself when the speaker pauses (voice activity detection)
 *   - SpeechOutput: plays Voxtral text-to-speech with a browser speech-synthesis fallback
 */

interface SpeechWindow extends Window {
  webkitSpeechRecognition?: any;
  SpeechRecognition?: any;
  webkitAudioContext?: typeof AudioContext;
}

export type StopReason = 'manual' | 'silence' | 'no-speech' | 'max-duration';

export const NOTHING_HEARD_MESSAGE = "I didn't catch that — please try again.";
export const NO_SPEECH_MESSAGE = "I didn't hear anything — tap the mic when you're ready.";
const MIC_DENIED_MESSAGE = 'Microphone access was denied. Please allow microphone permissions in your browser address bar.';
const NO_MIC_MESSAGE = 'No microphone was detected on your device.';
const UNSUPPORTED_MESSAGE = 'Voice input is not supported in this browser. Please type your request instead.';

/** Stop this long after the speaker goes quiet */
const SILENCE_AFTER_SPEECH_MS = 1500;
/** Give up if nothing is said for this long */
const NO_SPEECH_TIMEOUT_MS = 7000;
const MAX_RECORDING_MS = 30000;
const VAD_INTERVAL_MS = 100;
const VAD_CALIBRATION_MS = 300;
/** How long to wait for the browser recogniser's last result after stopping */
const WEB_SPEECH_GRACE_MS = 1200;
/** Recordings smaller than this hold no usable speech */
const MIN_AUDIO_BYTES = 1000;

const RECORDER_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

interface ListenSession {
  mode: 'starting' | 'recorder' | 'webspeech';
  startedAt: number;
  heardSpeech: boolean;
  lastVoiceAt: number;
  stopping: boolean;
  stopReason?: StopReason;
  done: boolean;
  recognitionActive: boolean;
  finalText: string;
  interimText: string;
  chunks: Blob[];
  stream?: MediaStream;
  recorder?: MediaRecorder;
  vad?: { ctx: AudioContext; source: MediaStreamAudioSourceNode; timer: number };
  timers: number[];
  intervals: number[];
}

export interface VoiceInputCallbacks {
  onListeningChange: (listening: boolean) => void;
  onTranscribingChange: (transcribing: boolean) => void;
  onInterim: (text: string) => void;
  onError: (message: string | null) => void;
  onResult: (text: string) => void;
}

function pickRecorderMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return undefined;
  return RECORDER_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
}

function joinText(...parts: string[]): string {
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

export class VoiceInputEngine {
  private recognition: any = null;
  private session: ListenSession | null = null;
  private readonly callbacks: VoiceInputCallbacks;
  private readonly lang: string;

  constructor(callbacks: VoiceInputCallbacks, lang?: string) {
    this.callbacks = callbacks;
    this.lang = lang || (typeof navigator !== 'undefined' && navigator.language) || 'en-IN';
    this.recognition = this.createRecognition();
  }

  static isSupported(): boolean {
    if (typeof window === 'undefined') return false;
    const win = window as SpeechWindow;
    const canRecord = typeof MediaRecorder !== 'undefined' && typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
    return canRecord || Boolean(win.SpeechRecognition || win.webkitSpeechRecognition);
  }

  get isActive(): boolean {
    return !!this.session && !this.session.done;
  }

  /**
   * Start a listening session: record audio for Voxtral and run the browser recogniser for live hints
   */
  async start(): Promise<void> {
    if (this.isActive) return;
    this.callbacks.onError(null);
    this.callbacks.onInterim('');

    const session: ListenSession = {
      mode: 'starting',
      startedAt: Date.now(),
      heardSpeech: false,
      lastVoiceAt: 0,
      stopping: false,
      done: false,
      recognitionActive: false,
      finalText: '',
      interimText: '',
      chunks: [],
      timers: [],
      intervals: [],
    };
    this.session = session;

    if (this.recognition) {
      try {
        this.recognition.start();
        session.recognitionActive = true;
      } catch {
        // Already running from a previous session that has not ended yet
      }
    }

    const canRecord = typeof MediaRecorder !== 'undefined' && typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
    if (canRecord) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        if (session.done || session.stopping || this.session !== session) {
          // Stopped while the permission prompt was open
          stream.getTracks().forEach((track) => track.stop());
          this.finish(session);
          return;
        }

        const mimeType = pickRecorderMimeType();
        const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) session.chunks.push(event.data);
        };
        session.stream = stream;
        session.recorder = recorder;
        session.mode = 'recorder';
        recorder.start(250);
        this.callbacks.onListeningChange(true);
        this.startVoiceActivityDetection(session, stream);
        this.watch(session);
        return;
      } catch (err: any) {
        const name = err?.name;
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
          this.abortRecognition(session);
          this.finish(session);
          this.callbacks.onError(MIC_DENIED_MESSAGE);
          return;
        }
        if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
          this.abortRecognition(session);
          this.finish(session);
          this.callbacks.onError(NO_MIC_MESSAGE);
          return;
        }
        // Recording unavailable for another reason — continue with the browser recogniser alone
      }
    }

    if (session.stopping) {
      this.abortRecognition(session);
      this.finish(session);
      return;
    }

    if (session.recognitionActive && !session.done) {
      session.mode = 'webspeech';
      this.callbacks.onListeningChange(true);
      this.watch(session);
      return;
    }

    this.finish(session);
    this.callbacks.onError(UNSUPPORTED_MESSAGE);
  }

  /**
   * Stop listening and transcribe what was said
   */
  stop(reason: StopReason = 'manual'): void {
    const session = this.session;
    if (!session || session.done || session.stopping) return;
    session.stopping = true;
    session.stopReason = reason;
    this.clearTimers(session);
    this.stopVoiceActivityDetection(session);
    this.callbacks.onListeningChange(false);

    if (session.recognitionActive) {
      try {
        // stop() (not abort) so the recogniser still delivers its last result
        this.recognition?.stop();
      } catch {
        // Ignore
      }
    }

    if (session.mode === 'recorder' && session.recorder && session.recorder.state !== 'inactive') {
      session.recorder.onstop = () => void this.finalizeRecording(session);
      try {
        session.recorder.stop();
      } catch {
        void this.finalizeRecording(session);
      }
    } else if (session.mode === 'recorder') {
      void this.finalizeRecording(session);
    } else if (session.mode === 'webspeech') {
      if (session.recognitionActive) {
        session.timers.push(window.setTimeout(() => this.finalizeWebSpeech(session), WEB_SPEECH_GRACE_MS));
      } else {
        this.finalizeWebSpeech(session);
      }
    }
    // mode 'starting': start() cleans up once the permission prompt resolves
  }

  /**
   * Stop listening and throw away what was recorded
   */
  cancel(): void {
    const session = this.session;
    if (!session || session.done) return;
    session.done = true;
    this.session = null;
    this.clearTimers(session);
    this.stopVoiceActivityDetection(session);
    this.abortRecognition(session);
    if (session.recorder && session.recorder.state !== 'inactive') {
      session.recorder.onstop = null;
      try {
        session.recorder.stop();
      } catch {
        // Ignore
      }
    }
    session.stream?.getTracks().forEach((track) => track.stop());
    this.callbacks.onListeningChange(false);
    this.callbacks.onInterim('');
  }

  dispose(): void {
    this.cancel();
    if (this.recognition) {
      this.recognition.onresult = null;
      this.recognition.onerror = null;
      this.recognition.onend = null;
      try {
        this.recognition.abort();
      } catch {
        // Ignore
      }
      this.recognition = null;
    }
  }

  // ─── Browser speech recognition (live hints + fallback transcript) ─────────

  private createRecognition(): any {
    if (typeof window === 'undefined') return null;
    const win = window as SpeechWindow;
    const Recognition = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!Recognition) return null;

    try {
      const rec = new Recognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = this.lang;

      rec.onresult = (event: any) => {
        const session = this.session;
        if (!session || session.done) return;
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const text = result?.[0]?.transcript ?? '';
          if (result.isFinal) session.finalText = joinText(session.finalText, text);
          else interim += ` ${text}`;
        }
        session.interimText = joinText(interim);
        const live = joinText(session.finalText, session.interimText);
        if (live) {
          session.heardSpeech = true;
          session.lastVoiceAt = Date.now();
        }
        if (!session.stopping) this.callbacks.onInterim(live);
      };

      rec.onerror = (event: any) => {
        const session = this.session;
        if (!session || session.done) return;
        const error = event?.error;
        // With a recording in progress, Voxtral does the transcription; browser recogniser errors don't matter
        if (session.mode === 'recorder') return;
        if (error === 'not-allowed' || error === 'service-not-allowed') {
          this.finish(session);
          this.callbacks.onError(MIC_DENIED_MESSAGE);
        } else if (error === 'audio-capture') {
          this.finish(session);
          this.callbacks.onError(NO_MIC_MESSAGE);
        }
      };

      rec.onend = () => {
        const session = this.session;
        if (!session) return;
        session.recognitionActive = false;
        if (session.mode !== 'webspeech' || session.done) return;
        if (session.stopping) this.finalizeWebSpeech(session);
        else this.stop('silence'); // the browser ended recognition on its own after a pause
      };

      return rec;
    } catch {
      return null;
    }
  }

  private abortRecognition(session: ListenSession): void {
    if (!session.recognitionActive) return;
    session.recognitionActive = false;
    try {
      this.recognition?.abort();
    } catch {
      // Ignore
    }
  }

  // ─── Voice activity detection ─────────────────────────────────────────────

  private startVoiceActivityDetection(session: ListenSession, stream: MediaStream): void {
    const AudioCtx = typeof AudioContext !== 'undefined' ? AudioContext : (window as SpeechWindow).webkitAudioContext;
    if (!AudioCtx) return;

    try {
      const ctx = new AudioCtx();
      void ctx.resume?.().catch(() => undefined);
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);

      const samples = new Float32Array(analyser.fftSize);
      const calibration: number[] = [];
      let threshold = 0.02;
      let calibrated = false;
      let voicedFrames = 0;

      const timer = window.setInterval(() => {
        if (session.done || session.stopping) return;
        analyser.getFloatTimeDomainData(samples);
        let sum = 0;
        for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
        const rms = Math.sqrt(sum / samples.length);
        const now = Date.now();

        // Measure the room's background level first, then treat clearly louder audio as speech
        if (now - session.startedAt < VAD_CALIBRATION_MS) {
          calibration.push(rms);
          return;
        }
        if (!calibrated) {
          const noise = calibration.length ? calibration.reduce((a, b) => a + b, 0) / calibration.length : 0.008;
          threshold = Math.min(0.05, Math.max(0.012, noise * 2.5));
          calibrated = true;
        }

        if (rms > threshold) {
          voicedFrames++;
          if (voicedFrames >= 2) {
            session.heardSpeech = true;
            session.lastVoiceAt = now;
          }
        } else {
          voicedFrames = 0;
        }
      }, VAD_INTERVAL_MS);

      session.vad = { ctx, source, timer };
    } catch {
      // No voice activity detection: the user stops manually (or the browser recogniser decides)
    }
  }

  private stopVoiceActivityDetection(session: ListenSession): void {
    if (!session.vad) return;
    const { ctx, source, timer } = session.vad;
    window.clearInterval(timer);
    try {
      source.disconnect();
    } catch {
      // Ignore
    }
    void ctx.close?.().catch(() => undefined);
    session.vad = undefined;
  }

  /**
   * Auto-stop: after a pause in speech, when nothing is said at all, or at the maximum length
   */
  private watch(session: ListenSession): void {
    const canDetectSpeech = () => !!session.vad || session.recognitionActive;
    session.intervals.push(
      window.setInterval(() => {
        if (session.done || session.stopping) return;
        const now = Date.now();
        // Browser recogniser results arrive in bursts, so allow a longer pause without voice activity detection
        const pause = session.vad ? SILENCE_AFTER_SPEECH_MS : SILENCE_AFTER_SPEECH_MS + 700;
        if (session.heardSpeech && now - session.lastVoiceAt > pause) this.stop('silence');
        else if (!session.heardSpeech && canDetectSpeech() && now - session.startedAt > NO_SPEECH_TIMEOUT_MS) this.stop('no-speech');
      }, 200)
    );
    session.timers.push(window.setTimeout(() => this.stop('max-duration'), MAX_RECORDING_MS));
  }

  private clearTimers(session: ListenSession): void {
    session.timers.forEach((t) => window.clearTimeout(t));
    session.intervals.forEach((t) => window.clearInterval(t));
    session.timers = [];
    session.intervals = [];
  }

  // ─── Finishing a session ──────────────────────────────────────────────────

  private async finalizeRecording(session: ListenSession): Promise<void> {
    if (session.done) return;
    session.stream?.getTracks().forEach((track) => track.stop());

    if (session.stopReason === 'no-speech') {
      this.nothingHeard(session, NO_SPEECH_MESSAGE);
      return;
    }

    const blob = new Blob(session.chunks, { type: session.recorder?.mimeType || 'audio/webm' });
    session.chunks = [];

    if (blob.size >= MIN_AUDIO_BYTES) {
      this.callbacks.onTranscribingChange(true);
      try {
        const result = await voiceApi.transcribeAudio(blob);
        const text = result?.transcript?.trim();
        if (session.done) return;
        if (text) {
          this.deliver(session, text);
          return;
        }
      } catch {
        // Fall back to the browser transcript
      } finally {
        this.callbacks.onTranscribingChange(false);
      }
    }

    if (session.done) return;
    const fallback = joinText(session.finalText, session.interimText);
    if (fallback) this.deliver(session, fallback);
    else this.nothingHeard(session, NOTHING_HEARD_MESSAGE);
  }

  private finalizeWebSpeech(session: ListenSession): void {
    if (session.done) return;
    this.clearTimers(session);
    const text = joinText(session.finalText, session.interimText);
    if (session.stopReason === 'no-speech' && !text) this.nothingHeard(session, NO_SPEECH_MESSAGE);
    else if (text) this.deliver(session, text);
    else this.nothingHeard(session, NOTHING_HEARD_MESSAGE);
  }

  private deliver(session: ListenSession, text: string): void {
    this.finish(session);
    this.callbacks.onResult(text);
  }

  private nothingHeard(session: ListenSession, message: string): void {
    this.finish(session);
    this.callbacks.onError(message);
  }

  private finish(session: ListenSession): void {
    session.done = true;
    if (this.session === session) this.session = null;
    this.clearTimers(session);
    this.stopVoiceActivityDetection(session);
    session.stream?.getTracks().forEach((track) => track.stop());
    this.callbacks.onListeningChange(false);
    this.callbacks.onInterim('');
  }
}

/**
 * Plays the assistant's replies. speak() resolves true when playback finished (or was skipped
 * because nothing could play), false when it was interrupted.
 */
export class SpeechOutput {
  private audio: HTMLAudioElement | null = null;
  private audioUrl: string | null = null;
  private pending: ((finished: boolean) => void) | null = null;
  private token = 0;
  private readonly onSpeakingChange: (speaking: boolean) => void;

  constructor(onSpeakingChange: (speaking: boolean) => void) {
    this.onSpeakingChange = onSpeakingChange;
  }

  speak(text: string, voice: string): Promise<boolean> {
    this.stop();
    const token = ++this.token;

    return new Promise<boolean>((resolve) => {
      let settled = false;
      const settle = (finished: boolean) => {
        if (settled) return;
        settled = true;
        if (this.pending === settle) this.pending = null;
        if (token === this.token) {
          this.releaseAudio();
          this.onSpeakingChange(false);
        }
        resolve(finished);
      };
      this.pending = settle;
      this.onSpeakingChange(true);

      let fellBack = false;
      const fallback = () => {
        if (fellBack || settled || token !== this.token) return;
        fellBack = true;
        this.releaseAudio();
        this.speakWithBrowser(text, settle);
      };

      voiceApi
        .synthesizeSpeech(text, voice)
        .then((blob) => {
          if (settled || token !== this.token) return;
          if (!blob || blob.size === 0 || /json/i.test(blob.type || '')) {
            fallback();
            return;
          }
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          this.audioUrl = url;
          this.audio = audio;
          audio.onended = () => settle(true);
          audio.onerror = () => fallback();
          const playing = audio.play();
          if (playing && typeof playing.catch === 'function') playing.catch(() => fallback());
        })
        .catch(() => fallback());
    });
  }

  stop(): void {
    this.token++;
    this.releaseAudio();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore
      }
    }
    const pending = this.pending;
    this.pending = null;
    pending?.(false);
    this.onSpeakingChange(false);
  }

  private releaseAudio(): void {
    if (this.audio) {
      this.audio.onended = null;
      this.audio.onerror = null;
      try {
        this.audio.pause();
      } catch {
        // Ignore
      }
      this.audio = null;
    }
    if (this.audioUrl) {
      try {
        URL.revokeObjectURL(this.audioUrl);
      } catch {
        // Ignore
      }
      this.audioUrl = null;
    }
  }

  /**
   * Browser speech synthesis when Voxtral TTS is unavailable
   */
  private speakWithBrowser(text: string, done: (finished: boolean) => void): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      done(true);
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.1; // Clear, pleasant pitch for the female persona
      utterance.lang = 'en-IN';

      const voices = window.speechSynthesis.getVoices();
      const femaleVoice =
        voices.find((v) => v.lang.startsWith('en') && /female|veena|samantha|victoria|zira|karen|tessa|moira|serena|fiona|kavya/i.test(v.name)) ||
        voices.find((v) => /female|veena|samantha|victoria|zira|karen|tessa|moira/i.test(v.name)) ||
        voices.find((v) => v.lang.startsWith('en-IN') || v.lang.startsWith('en'));
      if (femaleVoice) utterance.voice = femaleVoice;

      // Some browsers never fire onend for long utterances
      const safety = window.setTimeout(() => done(true), Math.min(30000, 2500 + text.length * 90));
      utterance.onend = () => {
        window.clearTimeout(safety);
        done(true);
      };
      utterance.onerror = () => {
        window.clearTimeout(safety);
        done(true);
      };
      window.speechSynthesis.speak(utterance);
    } catch {
      done(true);
    }
  }
}
