import { spawn, type ChildProcessByStdio } from 'child_process';
import { type Readable } from 'stream';
import fs from 'fs';
import path from 'path';

// =============================================================================
// Media service — the single home for ffmpeg/ffprobe. Everything spawns with
// argument arrays (never a shell string) and validates paths against
// STORAGE_ROOT, so upload metadata and the preview stream share one hardened
// surface.
// =============================================================================

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';
const STORAGE_ROOT = process.env.STORAGE_ROOT || '/var/www/GabrielGomez-storage';

/** Resolve a storage-relative path, refusing anything that escapes STORAGE_ROOT. */
export function resolveInStorage(relPath: string): string {
  const root = path.resolve(STORAGE_ROOT);
  const abs = path.resolve(root, relPath);
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    throw new Error('path escapes storage root');
  }
  return abs;
}

function run(bin: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => (stdout += d.toString()));
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('error', reject);
    proc.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

export interface ProbeResult {
  durationSec: number | null;
  format: string | null;
  bitrateKbps: number | null;
  sampleRate: number | null;
  channels: number | null;
  sizeBytes: number | null;
}

/** ffprobe an audio file → the technical fields we store per track. */
export async function probe(absFile: string): Promise<ProbeResult> {
  const { code, stdout } = await run(FFPROBE, [
    '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', absFile,
  ]);
  if (code !== 0) throw new Error('ffprobe failed');
  const json = JSON.parse(stdout) as {
    streams?: Array<Record<string, unknown>>;
    format?: Record<string, unknown>;
  };
  const audio = (json.streams || []).find((s) => s.codec_type === 'audio') || {};
  const fmt = json.format || {};
  let sizeBytes: number | null = null;
  try {
    sizeBytes = fs.statSync(absFile).size;
  } catch {
    /* ignore */
  }
  return {
    durationSec: fmt.duration ? Math.round(Number(fmt.duration)) : null,
    format: fmt.format_name ? String(fmt.format_name).split(',')[0] : null,
    bitrateKbps: fmt.bit_rate ? Math.round(Number(fmt.bit_rate) / 1000) : null,
    sampleRate: audio.sample_rate ? Number(audio.sample_rate) : null,
    channels: audio.channels ? Number(audio.channels) : null,
    sizeBytes,
  };
}

const PREVIEW_SECONDS = Number(process.env.PREVIEW_SECONDS || 10);

function previewArgs(masterAbs: string, seconds: number, tagFile?: string): string[] {
  if (tagFile && fs.existsSync(tagFile)) {
    return [
      '-y', '-i', masterAbs, '-i', tagFile,
      '-filter_complex',
      '[1:a]aloop=loop=-1:size=2e9,volume=0.55[t];[0:a][t]amix=inputs=2:duration=first:dropout_transition=0[a]',
      '-map', '[a]', '-t', String(seconds), '-ac', '2', '-ar', '44100', '-b:a', '96k',
    ];
  }
  return ['-y', '-i', masterAbs, '-t', String(seconds), '-ac', '2', '-ar', '44100', '-b:a', '96k'];
}

/** Generate the cached 10s tagged preview (offline, on upload). */
export async function makeTaggedPreview(
  masterAbs: string,
  outAbs: string,
  opts: { seconds?: number; tagFile?: string } = {},
): Promise<void> {
  const seconds = opts.seconds ?? PREVIEW_SECONDS;
  const tag = opts.tagFile ?? process.env.PRODUCER_TAG_PATH;
  fs.mkdirSync(path.dirname(outAbs), { recursive: true });
  const { code, stderr } = await run(FFMPEG, [...previewArgs(masterAbs, seconds, tag), outAbs]);
  if (code !== 0) throw new Error(`ffmpeg preview failed: ${stderr.slice(0, 300)}`);
}

/**
 * On-the-fly 10s tagged transcode to mp3 on stdout — the master is never
 * exposed at a reachable path. Caller pipes the returned process's stdout.
 */
export function spawnPreviewTranscode(
  masterAbs: string,
  seconds = PREVIEW_SECONDS,
): ChildProcessByStdio<null, Readable, Readable> {
  const tag = process.env.PRODUCER_TAG_PATH;
  return spawn(FFMPEG, [...previewArgs(masterAbs, seconds, tag), '-f', 'mp3', 'pipe:1'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/** Decode to mono PCM and downsample to `buckets` normalized peaks (0..1). */
export async function extractPeaks(absFile: string, buckets = 400): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG, ['-v', 'error', '-i', absFile, '-ac', '1', '-ar', '8000', '-f', 's16le', 'pipe:1'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const chunks: Buffer[] = [];
    proc.stdout.on('data', (d: Buffer) => chunks.push(d));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error('ffmpeg peaks failed'));
      const buf = Buffer.concat(chunks);
      const samples = Math.floor(buf.length / 2);
      if (samples === 0) return resolve([]);
      const per = Math.max(1, Math.floor(samples / buckets));
      const peaks: number[] = [];
      for (let i = 0; i < samples; i += per) {
        let max = 0;
        const end = Math.min(i + per, samples);
        for (let j = i; j < end; j++) {
          const v = Math.abs(buf.readInt16LE(j * 2));
          if (v > max) max = v;
        }
        peaks.push(Number((max / 32768).toFixed(3)));
      }
      resolve(peaks);
    });
  });
}
