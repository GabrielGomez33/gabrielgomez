import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

// =============================================================================
// Audio analysis for the folder-upload pipeline. Every uploaded music file is
// classified into a musical group/category and one-shot vs loop, with BPM and
// key detected. Detection is layered:
//   1. Heuristics — parse BPM/key from the filename, infer kind from duration,
//      and categorize by filename keywords. Always available, no dependencies.
//   2. DSP (optional) — if `aubio` (tempo) and/or `keyfinder-cli` (key) are on
//      the host, refine BPM/key from the actual signal. Falls back silently.
// The result feeds sample packs (grouping + preview selection) and also enriches
// beatpack/album tracks.
// =============================================================================

// one_shot = short hit (1–4s), loop = 5–20s musical loop, instrumental = a full
// beat/instrumental (>20s), unknown = couldn't tell.
export type SampleKind = 'one_shot' | 'loop' | 'instrumental' | 'unknown';

export interface Analysis {
  kind: SampleKind;
  group: string | null; // drums | bass | melodic | vocal | fx | other
  category: string | null; // kick | snare | hat | 808 | lead | pad | vocal | fx ...
  bpm: number | null;
  key: string | null;
  bpmSource: 'filename' | 'dsp' | null;
  keySource: 'filename' | 'dsp' | null;
}

// Category → group, and the filename keywords that map to each category. Order
// matters: earlier, more specific matches win (e.g. "808" before generic "bass").
const CATEGORY_RULES: Array<{ category: string; group: string; kw: RegExp }> = [
  { category: 'kick', group: 'drums', kw: /\b(kick|bd|bassdrum)\b|kick/i },
  { category: '808', group: 'bass', kw: /\b808\b/i },
  { category: 'snare', group: 'drums', kw: /\bsnare\b|\bsnr\b/i },
  { category: 'clap', group: 'drums', kw: /\bclap\b|\bclp\b/i },
  { category: 'hat', group: 'drums', kw: /\b(hi[-_ ]?hat|hihat|hat|hh|openhat|closedhat)\b/i },
  { category: 'cymbal', group: 'drums', kw: /\b(cymbal|crash|ride)\b/i },
  { category: 'tom', group: 'drums', kw: /\btom\b/i },
  { category: 'rim', group: 'drums', kw: /\b(rim|rimshot)\b/i },
  { category: 'percussion', group: 'drums', kw: /\b(perc|percussion|shaker|conga|bongo|tamb|tambourine|cowbell|stomp(s|ing)?|snap(s)?|foot|feet)\b/i },
  { category: 'drumloop', group: 'drums', kw: /\b(drum[-_ ]?loop|beat[-_ ]?loop|groove|break)\b/i },
  { category: 'sub', group: 'bass', kw: /\bsub\b/i },
  { category: 'bass', group: 'bass', kw: /\b(bass|bassline|reese)\b/i },
  { category: 'lead', group: 'melodic', kw: /\b(lead|synth|saw|pluck)\b/i },
  { category: 'pad', group: 'melodic', kw: /\b(pad|ambient|drone|atmos|atmosphere)\b/i },
  { category: 'chord', group: 'melodic', kw: /\b(chord|stab|keys|piano|rhodes|guitar|string|strings)\b/i },
  { category: 'arp', group: 'melodic', kw: /\b(arp|arpeggio|sequence|seq)\b/i },
  { category: 'bell', group: 'melodic', kw: /\b(bell|mallet|glock|kalimba)\b/i },
  { category: 'melody', group: 'melodic', kw: /\b(melody|melodic|loop|riff|top|topline)\b/i },
  { category: 'vocal', group: 'vocal', kw: /\b(vocal|vox|voice|acapella|acappella|adlib|ad[-_ ]?lib|libs?|chant|choir|choral|gospel|phrase|harmon(y|ies|ize)|hum|humming|whoo+p?|ooh+|aah+|ahh+|oh+|shout|yell|moan|breath|bgv|backing)\b/i },
  { category: 'riser', group: 'fx', kw: /\b(riser|uplifter|sweep|rise)\b/i },
  { category: 'impact', group: 'fx', kw: /\b(impact|hit|boom|downlifter|downshifter|slam)\b/i },
  { category: 'fx', group: 'fx', kw: /\b(fx|effect|texture|foley|noise|glitch|transition|whoosh|reverse)\b/i },
];

const NOTE = '(?:[A-G])(?:#|b)?';
// Require an explicit major/minor quality so we don't mistake the first letter
// of words like "Bass"/"Clap" for a key. e.g. "Amin", "F#m", "Gmaj", "Dbmin".
const KEY_RX = new RegExp(`\\b(${NOTE})[ _-]?(maj(?:or)?|min(?:or)?|m|M)\\b`);

// Tokens we strip from a display name because we surface them as clean, separate
// metadata (BPM/key tags) — and, for sample packs, re-add them to the download
// filename in a tidy form.
const BPM_TOKEN = /\b\d{2,3}\s?bpm\b/gi;
const KEY_TOKEN = new RegExp(`\\b${NOTE}[ _-]?(maj(?:or)?|min(?:or)?|m|M)\\b`, 'g');

/**
 * Turn a raw upload filename into a clean display name: drop the extension,
 * turn separators into spaces, remove BPM/key tokens (shown separately), collapse
 * whitespace, and gently title-case. Falls back to the bare stem if stripping
 * leaves nothing (e.g. a file literally named "Amin.wav").
 */
export function prettifyName(original: string): string {
  const stem = path.parse(original).name;
  let s = stem.replace(/[_\-.]+/g, ' ');
  s = s.replace(BPM_TOKEN, ' ').replace(KEY_TOKEN, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  if (!s) s = stem.replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim() || stem;
  return s
    .split(' ')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/** Compact key form for filenames: "A min" → "Amin", "F# min" → "F#min". */
export function keyForFilename(key: string | null): string {
  return key ? key.replace(/\s+/g, '') : '';
}

/** Parse hints purely from the filename (no audio). */
function fromFilename(filename: string): {
  bpm: number | null;
  key: string | null;
  category: string | null;
  group: string | null;
  loopHint: boolean;
  oneShotHint: boolean;
  beatHint: boolean;
} {
  const base = path.parse(filename).name;
  const spaced = base.replace(/[_\-.]+/g, ' ');

  let bpm: number | null = null;
  const bpmMatch = spaced.match(/\b(\d{2,3})\s?bpm\b/i) || spaced.match(/\bbpm\s?(\d{2,3})\b/i);
  if (bpmMatch) {
    const v = Number(bpmMatch[1]);
    if (v >= 40 && v <= 300) bpm = v;
  }

  let key: string | null = null;
  const keyMatch = spaced.match(KEY_RX);
  if (keyMatch) {
    const accidental = keyMatch[1][1] === '#' || keyMatch[1][1] === 'b' ? keyMatch[1][1] : '';
    const note = keyMatch[1][0].toUpperCase() + accidental;
    const rawQ = keyMatch[2] || '';
    // 'M' means major; lowercase 'm' (and min/minor) mean minor.
    const quality = /^maj/i.test(rawQ) || rawQ === 'M' ? 'maj' : 'min';
    key = `${note} ${quality}`;
  }

  let category: string | null = null;
  let group: string | null = null;
  for (const rule of CATEGORY_RULES) {
    if (rule.kw.test(spaced)) {
      category = rule.category;
      group = rule.group;
      break;
    }
  }

  const loopHint = /\b(loop|groove|riff|break|topline)\b/i.test(spaced);
  const oneShotHint = /\b(one[-_ ]?shot|oneshot|shot|hit|stab)\b/i.test(spaced);
  const beatHint = /\b(type[-_ ]?beat|instrumental|full[-_ ]?beat)\b/i.test(spaced);
  return { bpm, key, category, group, loopHint, oneShotHint, beatHint };
}

/**
 * Classify by duration bands (the source of truth) with filename hints breaking
 * ties when the duration is unknown:
 *   one-shot 1–4s · loop 5–20s · instrumental/beat >20s
 */
function decideKind(
  durationSec: number | null,
  loopHint: boolean,
  oneShotHint: boolean,
  beatHint: boolean,
): SampleKind {
  if (durationSec != null) {
    if (durationSec <= 4) return 'one_shot';
    if (durationSec <= 20) return 'loop';
    return 'instrumental';
  }
  if (beatHint) return 'instrumental';
  if (oneShotHint) return 'one_shot';
  if (loopHint) return 'loop';
  return 'unknown';
}

// --- Optional DSP layer ------------------------------------------------------
const KEYFINDER = process.env.KEYFINDER_PATH || 'keyfinder-cli';
const DSP_TIMEOUT_MS = Number(process.env.DSP_TIMEOUT_MS || 12000);

// Warn once per missing binary so the operator can see DSP isn't wired up,
// instead of silently falling back forever.
const warnedMissing = new Set<string>();
function warnMissing(bin: string): void {
  if (warnedMissing.has(bin)) return;
  warnedMissing.add(bin);
  console.warn(`[audioAnalysis] DSP tool not found: ${bin} — falling back to filename heuristics. Install it or set its *_PATH env.`);
}

interface RunResult {
  out: string | null;
  missing: boolean; // binary not found (ENOENT / spawn failed)
}
function runCapture(bin: string, args: string[], quiet = false): Promise<RunResult> {
  return new Promise((resolve) => {
    let out = '';
    let done = false;
    let proc: ReturnType<typeof spawn>;
    try {
      proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
      if (!quiet) warnMissing(bin);
      resolve({ out: null, missing: true });
      return;
    }
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        try {
          proc.kill('SIGKILL');
        } catch {
          /* ignore */
        }
        resolve({ out: null, missing: false });
      }
    }, DSP_TIMEOUT_MS);
    proc.stdout?.on('data', (d) => (out += d.toString()));
    proc.on('error', (err: NodeJS.ErrnoException) => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        const missing = err?.code === 'ENOENT';
        if (missing && !quiet) warnMissing(bin);
        resolve({ out: null, missing });
      }
    });
    proc.on('close', (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ out: code === 0 ? out : null, missing: false });
    });
  });
}

// Beat-tracking tempo tools vary by distro: the `aubio` multitool wants
// `aubio tempo <file>`, while the standalone binaries `aubiotrack` / `aubiotempo`
// take just `<file>`. Try each until one is present and yields a tempo.
function aubioCandidates(absFile: string): Array<{ bin: string; args: string[] }> {
  const list: Array<{ bin: string; args: string[] }> = [];
  const seen = new Set<string>();
  const add = (bin: string, args: string[]) => {
    if (bin && !seen.has(bin)) {
      seen.add(bin);
      list.push({ bin, args });
    }
  };
  const asStandalone = (b: string) => /aubiotrack|aubiotempo/.test(path.basename(b));
  if (process.env.AUBIO_TEMPO_PATH) {
    const b = process.env.AUBIO_TEMPO_PATH;
    add(b, asStandalone(b) ? [absFile] : ['tempo', absFile]);
  }
  if (process.env.AUBIO_PATH) add(process.env.AUBIO_PATH, ['tempo', absFile]);
  add('aubio', ['tempo', absFile]);
  add('aubiotrack', [absFile]);
  add('aubiotempo', [absFile]);
  return list;
}

/** Parse aubio beat-tracker output (beat timestamps in seconds) → median BPM. */
function bpmFromTimestamps(out: string): number | null {
  // Some builds prefix each line with "bpm:" or similar; grab the numbers.
  const nums = out.split(/\s+/).map(Number).filter((n) => Number.isFinite(n) && n > 0);
  if (nums.length < 3) return null;
  const intervals: number[] = [];
  for (let i = 1; i < nums.length; i++) {
    const d = nums[i] - nums[i - 1];
    if (d > 0.1 && d < 3) intervals.push(d); // plausible beat spacing (20–600 BPM)
  }
  if (intervals.length < 2) return null;
  intervals.sort((a, b) => a - b);
  const median = intervals[Math.floor(intervals.length / 2)];
  if (!median || median <= 0) return null;
  const bpm = Math.round(60 / median);
  return bpm >= 40 && bpm <= 300 ? bpm : null;
}

async function dspBpm(absFile: string): Promise<number | null> {
  let anyFound = false;
  for (const c of aubioCandidates(absFile)) {
    const { out, missing } = await runCapture(c.bin, c.args, true);
    if (!missing) anyFound = true;
    if (out) {
      const bpm = bpmFromTimestamps(out);
      if (bpm) return bpm;
    }
  }
  if (!anyFound) warnMissing('aubio (tried aubio/aubiotrack/aubiotempo — install aubio-tools)');
  return null;
}

/**
 * keyfinder-cli prints the detected key (e.g. "Am", "F#m", "Ab minor"). The file
 * is the positional arg — the previous `-n <file>` form fed the file as the
 * notation flag and detected nothing.
 */
async function dspKey(absFile: string): Promise<string | null> {
  const { out } = await runCapture(KEYFINDER, [absFile]);
  if (!out) return null;
  const text = out.trim();
  // Handle "A minor", "Am", "Abm", "F# major", "C#" etc.
  const m = text.match(/\b([A-G](?:#|b)?)\s*(m|min|minor|maj|major)?\b/i);
  if (!m) return null;
  const note = m[1][0].toUpperCase() + (m[1][1] === '#' || m[1][1] === 'b' ? m[1][1] : '');
  const q = (m[2] || '').toLowerCase();
  if (q === 'm' || q.startsWith('min')) return `${note} min`;
  if (q.startsWith('maj')) return `${note} maj`;
  return note;
}

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
let excerptCounter = 0;

/**
 * For long files (full beats/songs), analyze a short mono excerpt instead of the
 * whole thing — tempo/key are stable, and this keeps aubio/keyfinder fast and
 * inside the timeout. Returns a temp file path (caller deletes) or null.
 */
async function makeExcerpt(absFile: string, seconds = 60, startSec = 15): Promise<string | null> {
  excerptCounter += 1;
  const tmp = path.join(os.tmpdir(), `dspx_${process.pid}_${excerptCounter}.wav`);
  const ok = await new Promise<boolean>((resolve) => {
    let proc: ReturnType<typeof spawn>;
    try {
      proc = spawn(
        FFMPEG,
        ['-v', 'error', '-ss', String(startSec), '-t', String(seconds), '-i', absFile, '-ac', '1', '-ar', '44100', '-y', tmp],
        { stdio: 'ignore' },
      );
    } catch {
      resolve(false);
      return;
    }
    const timer = setTimeout(() => {
      try {
        proc.kill('SIGKILL');
      } catch {
        /* ignore */
      }
      resolve(false);
    }, DSP_TIMEOUT_MS);
    proc.on('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve(code === 0 && fs.existsSync(tmp));
    });
  });
  return ok ? tmp : null;
}

export interface AnalyzeOpts {
  filename: string;
  durationSec: number | null;
  absFile?: string; // enables the DSP layer
  useDsp?: boolean;
}

/** Full analysis: heuristics first, refined by DSP when available. */
export async function analyzeAudio(opts: AnalyzeOpts): Promise<Analysis> {
  const fn = fromFilename(opts.filename);
  const kind = decideKind(opts.durationSec, fn.loopHint, fn.oneShotHint, fn.beatHint);

  let bpm = fn.bpm;
  let key = fn.key;
  let bpmSource: Analysis['bpmSource'] = fn.bpm != null ? 'filename' : null;
  let keySource: Analysis['keySource'] = fn.key != null ? 'filename' : null;

  // Fill anything the filename didn't give us from the signal. BPM is skipped
  // only for one-shot hits (a percussive hit has no tempo); key is attempted for
  // everything tonal. Long files are analyzed from a short excerpt for speed.
  if (opts.useDsp && opts.absFile) {
    const needBpm = bpm == null && kind !== 'one_shot';
    const needKey = key == null;
    if (needBpm || needKey) {
      let target = opts.absFile;
      let tmp: string | null = null;
      if (opts.durationSec != null && opts.durationSec > 90) {
        tmp = await makeExcerpt(opts.absFile).catch(() => null);
        if (tmp) target = tmp;
      }
      if (needBpm) {
        const d = await dspBpm(target).catch(() => null);
        if (d != null) {
          bpm = d;
          bpmSource = 'dsp';
        }
      }
      if (needKey) {
        const k = await dspKey(target).catch(() => null);
        if (k != null) {
          key = k;
          keySource = 'dsp';
        }
      }
      if (tmp) {
        try {
          fs.unlinkSync(tmp);
        } catch {
          /* best effort */
        }
      }
    }
  }

  return {
    kind,
    group: fn.group,
    category: fn.category,
    bpm,
    key,
    bpmSource,
    keySource,
  };
}
