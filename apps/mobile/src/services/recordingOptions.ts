import { AudioQuality, IOSOutputFormat } from 'expo-audio';
import type { RecordingOptions } from 'expo-audio';

export const interviewRecordingOptions: RecordingOptions = {
  directory: 'document',
  isMeteringEnabled: true,
  extension: '.m4a',
  sampleRate: 48_000,
  numberOfChannels: 1,
  bitRate: 128_000,
  android: {
    extension: '.m4a',
    outputFormat: 'mpeg4',
    audioEncoder: 'aac',
    audioSource: 'mic',
  },
  ios: {
    extension: '.m4a',
    sampleRate: 48_000,
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.HIGH,
  },
  web: {
    mimeType: 'audio/mp4',
    bitsPerSecond: 128_000,
  },
};
