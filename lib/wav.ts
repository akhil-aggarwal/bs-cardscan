"use client";

/** Records the microphone as 16 kHz mono WAV (a format Gemini accepts on every phone). */
export class WavRecorder {
  private ctx?: AudioContext;
  private stream?: MediaStream;
  private node?: ScriptProcessorNode;
  private chunks: Float32Array[] = [];
  private rate = 44100;

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AC();
    this.rate = this.ctx.sampleRate;
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.node = this.ctx.createScriptProcessor(4096, 1, 1);
    this.node.onaudioprocess = (e) => this.chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    src.connect(this.node);
    this.node.connect(this.ctx.destination);
  }

  /** Stops and returns the recording as base64 WAV (no data: prefix), plus its length in seconds. */
  async stop(): Promise<{ base64: string; seconds: number }> {
    this.node?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    await this.ctx?.close().catch(() => {});
    const len = this.chunks.reduce((n, c) => n + c.length, 0);
    const all = new Float32Array(len);
    let o = 0;
    for (const c of this.chunks) { all.set(c, o); o += c.length; }
    this.chunks = [];
    const target = 16000;
    const ratio = this.rate / target;
    const outLen = Math.floor(all.length / ratio);
    const pcm = new Int16Array(outLen);
    for (let i = 0; i < outLen; i++) {
      // average the samples that fall in this slot (simple low-pass while downsampling)
      const a = Math.floor(i * ratio), b = Math.min(all.length, Math.floor((i + 1) * ratio));
      let sum = 0;
      for (let j = a; j < b; j++) sum += all[j];
      const v = Math.max(-1, Math.min(1, sum / Math.max(1, b - a)));
      pcm[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
    }
    const buf = new ArrayBuffer(44 + pcm.length * 2);
    const dv = new DataView(buf);
    const w = (p: number, s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(p + i, s.charCodeAt(i)); };
    w(0, "RIFF"); dv.setUint32(4, 36 + pcm.length * 2, true); w(8, "WAVE"); w(12, "fmt ");
    dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, target, true); dv.setUint32(28, target * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
    w(36, "data"); dv.setUint32(40, pcm.length * 2, true);
    new Int16Array(buf, 44).set(pcm);
    const bytes = new Uint8Array(buf);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { base64: btoa(bin), seconds: outLen / target };
  }

  cancel() {
    this.node?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close().catch(() => {});
    this.chunks = [];
  }
}
