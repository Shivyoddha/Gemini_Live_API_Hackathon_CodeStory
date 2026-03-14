export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function parseSampleRateFromMime(mimeType: string): number {
  const match = mimeType.match(/rate=(\d+)/i);
  const parsed = match?.[1] ? Number.parseInt(match[1], 10) : 24000;
  return Number.isFinite(parsed) ? parsed : 24000;
}

export function pcm16ToAudioBuffer(
  audioContext: AudioContext,
  bytes: Uint8Array,
  sampleRate: number,
): AudioBuffer {
  const frameCount = Math.floor(bytes.length / 2);
  const buffer = audioContext.createBuffer(1, frameCount, sampleRate);
  const channelData = buffer.getChannelData(0);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < frameCount; i += 1) {
    const sample = view.getInt16(i * 2, true);
    channelData[i] = sample / 32768;
  }
  return buffer;
}

