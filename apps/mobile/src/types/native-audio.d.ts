declare module '@fugood/react-native-audio-pcm-stream/index.js' {
  type AudioOptions = {
    sampleRate: number;
    channels: number;
    bitsPerSample: number;
    audioSource?: number;
    bufferSize?: number;
    wavFile: string;
  };

  const LiveAudioStream: {
    init(options: AudioOptions): void;
    start(): void;
    stop(): Promise<string>;
    on(event: 'data', callback: (data: string) => void): void;
  };

  export default LiveAudioStream;
}
