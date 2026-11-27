export interface VoiceStatus {
  enabled: boolean;
  permissionError: string | null;
  level: number;
  speaking: boolean;
}

type VoiceStateListener = (status: VoiceStatus) => void;

export class VoiceChatManager {
  private stream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private dataArray: Uint8Array<ArrayBuffer> | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private enabled = false;
  private speaking = false;
  private level = 0;
  private permissionError: string | null = null;
  private rafId = 0;
  private listeners = new Set<VoiceStateListener>();
  private onSpeakingChange?: (speaking: boolean) => void;
  private onAudioChunk?: (base64: string) => void;
  private lastSendAt = 0;

  public subscribe(listener: VoiceStateListener): () => void {
    this.listeners.add(listener);
    listener(this.getStatus());
    return () => {
      this.listeners.delete(listener);
    };
  }

  public setCallbacks(
    onSpeakingChange?: (speaking: boolean) => void,
    onAudioChunk?: (base64: string) => void,
  ) {
    this.onSpeakingChange = onSpeakingChange;
    this.onAudioChunk = onAudioChunk;
  }

  public getStatus(): VoiceStatus {
    return {
      enabled: this.enabled,
      permissionError: this.permissionError,
      level: this.level,
      speaking: this.speaking,
    };
  }

  private emit() {
    const snapshot = this.getStatus();
    for (const l of this.listeners) l(snapshot);
  }

  public async toggle(): Promise<boolean> {
    if (this.enabled) {
      this.stop();
      return false;
    }
    return this.start();
  }

  public async start(): Promise<boolean> {
    if (this.enabled) return true;
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        this.permissionError = 'Micrófono no disponible en este navegador.';
        this.emit();
        return false;
      }
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      this.permissionError = null;

      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioCtx();
      const source = this.audioCtx.createMediaStreamSource(this.stream);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 256;
      const buf = new ArrayBuffer(this.analyser.frequencyBinCount);
      this.dataArray = new Uint8Array(buf);
      source.connect(this.analyser);

      // Lightweight PCM chunk capture for WebSocket voice relay in rooms
      this.scriptProcessor = this.audioCtx.createScriptProcessor(2048, 1, 1);
      const silentGain = this.audioCtx.createGain();
      silentGain.gain.value = 0;
      source.connect(this.scriptProcessor);
      this.scriptProcessor.connect(silentGain);
      silentGain.connect(this.audioCtx.destination);
      this.scriptProcessor.onaudioprocess = (ev) => {
        if (!this.enabled || !this.speaking || !this.onAudioChunk) return;
        const now = performance.now();
        if (now - this.lastSendAt < 80) return;
        this.lastSendAt = now;
        const input = ev.inputBuffer.getChannelData(0);
        // Downsample 4x to 11kHz Int8 for compact low-latency relay
        const len = Math.floor(input.length / 4);
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          const sample = Math.max(-1, Math.min(1, input[i * 4]));
          bytes[i] = Math.floor((sample + 1) * 127.5);
        }
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        this.onAudioChunk(btoa(bin));
      };

      this.enabled = true;
      this.monitorLoop();
      this.emit();
      return true;
    } catch {
      this.permissionError = 'Permiso de micrófono denegado o sin dispositivo.';
      this.enabled = false;
      this.emit();
      return false;
    }
  }

  public playRemoteAudio(base64: string) {
    if (!base64) return;
    try {
      if (!this.audioCtx) {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.audioCtx = new AudioCtx();
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
      const bin = atob(base64);
      const buffer = this.audioCtx.createBuffer(1, bin.length, Math.max(8000, this.audioCtx.sampleRate / 4));
      const ch = buffer.getChannelData(0);
      for (let i = 0; i < bin.length; i++) {
        ch[i] = bin.charCodeAt(i) / 127.5 - 1;
      }
      const src = this.audioCtx.createBufferSource();
      src.buffer = buffer;
      const gain = this.audioCtx.createGain();
      gain.gain.value = 0.7;
      src.connect(gain).connect(this.audioCtx.destination);
      src.start();
    } catch {
      // Ignore malformed packets
    }
  }

  private monitorLoop = () => {
    if (!this.enabled || !this.analyser || !this.dataArray) return;
    this.analyser.getByteFrequencyData(this.dataArray);
    let sum = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      sum += this.dataArray[i];
    }
    const avg = sum / this.dataArray.length;
    const norm = Math.min(1, avg / 55);
    this.level = norm;
    const nowSpeaking = norm > 0.14;
    if (nowSpeaking !== this.speaking) {
      this.speaking = nowSpeaking;
      this.onSpeakingChange?.(nowSpeaking);
    }
    this.emit();
    this.rafId = requestAnimationFrame(this.monitorLoop);
  };

  public stop() {
    cancelAnimationFrame(this.rafId);
    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor.onaudioprocess = null;
      this.scriptProcessor = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    this.enabled = false;
    this.level = 0;
    if (this.speaking) {
      this.speaking = false;
      this.onSpeakingChange?.(false);
    }
    this.emit();
  }
}

export const voiceChat = new VoiceChatManager();
