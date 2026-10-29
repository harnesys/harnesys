export interface VoiceRecording {
  audioBase64: string;
  mimeType: string;
}

export interface VoiceRecorderCallbacks {
  onStart(): void;
}

export interface VoiceRecorder {
  start(): Promise<void>;
  stop(): Promise<VoiceRecording>;
  dispose(): void;
}

const BASE64_CHUNK = 0x8000;

export function createVoiceRecorder(callbacks: VoiceRecorderCallbacks): VoiceRecorder {
  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  return { start, stop, dispose };
  async function start(): Promise<void> {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recorder = new MediaRecorder(stream, mediaRecorderOptions());
    chunks = [];
    recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    });
    recorder.start();
    callbacks.onStart();
  }
  function stop(): Promise<VoiceRecording> {
    return new Promise((resolve, reject) => {
      const active = recorder;
      const captured = stream;
      if (!active || !captured || active.state === 'inactive') {
        reject(new Error('voice recorder is not active'));
        return;
      }
      active.addEventListener(
        'stop',
        () => {
          const mimeType = active.mimeType || 'audio/webm';
          const blob = new Blob(chunks, { type: mimeType });
          chunks = [];
          release(captured, active);
          blob
            .arrayBuffer()
            .then((buffer) => resolve({ audioBase64: bytesToBase64(buffer), mimeType }))
            .catch(reject);
        },
        { once: true },
      );
      active.stop();
    });
  }
  function dispose(): void {
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
    if (stream) {
      release(stream, recorder);
    }
  }
}

function mediaRecorderOptions(): MediaRecorderOptions {
  if (
    typeof MediaRecorder.isTypeSupported === 'function' &&
    MediaRecorder.isTypeSupported('audio/webm')
  ) {
    return { mimeType: 'audio/webm' };
  }
  return {};
}

function release(stream: MediaStream, recorder: MediaRecorder | null): void {
  for (const track of stream.getTracks()) {
    track.stop();
  }
  if (recorder) {
    recorder.ondataavailable = null;
    recorder.onstop = null;
  }
}

function bytesToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let index = 0; index < bytes.length; index += BASE64_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(index, index + BASE64_CHUNK));
  }
  return btoa(binary);
}
