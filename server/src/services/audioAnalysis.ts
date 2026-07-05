import { spawn } from 'child_process';
import path from 'path';

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

export type SampleKind = 'one_shot' | 'loop' | 'unknown';

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
  { category: 'percussion', group: 'drums', kw: /\b(perc|percussion|shaker|conga|bongo|tamb|tambourine|cowbell)\b/i },
  { category: 'drumloop', group: 'drums', kw: /\b(drum[-_ ]?loop|beat[-_ ]?loop|groove|break)\b/i },
  { category: 'sub', group: 'bass', kw: /\bsub\b/i },
  { category: 'bass', group: 'bass', kw: /\b(bass|bassline|reese)\b/i },
  { category: 'lead', group: 'melodic', kw: /\b(lead|synth|saw|pluck)\b/i },
  { category: 'pad', group: 'melodic', kw: /\b(pad|ambient|drone|atmos|atmosphere)\b/i },
  { category: 'chord', group: 'melodic', kw: /\b(chord|stab|keys|piano|rhodes|guitar|string|strings)\b/i },
  { category: 'arp', group: 'melodic', kw: /\b(arp|arpeggio|sequence|seq)\b/i },
  { category: 'bell', group: 'melodic', kw: /\b(bell|mallet|glock|kalimba)\b/i },
  { category: 'melody', group: 'melodic', kw: /\b(melody|melodic|loop|riff|top|topline)\b/i },
  { category: 'vocal', group: 'vocal', kw: /\b(vocal|vox|voice|acapella|acappella|adlib|ad[-_ ]?lib|chant|choir|phrase)\b/i },
  { category: 'riser', group: 'fx', kw: /\b(riser|uplifter|sweep|rise)\b/i },
  { category: 'impact', group: 'fx', kw: /\b(impact|hit|boom|downlifter|downshifter|slam)\b/i },
  { category: 'fx', group: 'fx', kw: /\b(fx|effect|texture|foley|noise|glitch|transition|whoosh|reverse)\b/i },
];

const NOTE = '(?:[A-G])(?:#|b)?';
// Require an explicit major/minor quality so we don't mistake the first letter
// of words like "Bass"/"Clap" for a key. e.g. "Amin", "F#m", "Gmaj", "Dbmin".
const KEY_RX = new RegExp(`\\b(${NOTE})[ _-]?(maj(?:or)?|min(?:or)?|m|M)\\b`);

/** Parse hints purely from the filename (no audio). */
function fromFilename(filename: string): {
  bpm: number | null;
  key: string | null;
  category: string | null;
  group: string | null;
  loopHint: boolean;
  oneShotHint: boolean;
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

  const loopHint = /\b(loop|groove|riff|break|melody|melodic|topline)\b/i.test(spaced) || bpm !== null;
  const oneShotHint = /\b(one[-_ ]?shot|oneshot|shot|hit|stab|single)\b/i.test(spaced);
  return { bpm, key, category, group, loopHint, oneShotHint };
}

/** Decide one-shot vs loop from filename hints + duration. */
function decideKind(durationSec: number | null, loopHint: boolean, oneShotHint: boolean): SampleKind {
  if (oneShotHint && !loopHint) return 'one_shot';
  if (loopHint) return 'loop';
  if (durationSec != null) {
    // Short, decaying sounds are one-shots; anything a couple of seconds+ is a loop.
    if (durationSec <= 2) return 'one_shot';
    return 'loop';
  }
  return 'unknown';
}

// --- Optional DSP layer ------------------------------------------------------
const AUBIO = process.env.AUBIO_TEMPO_PATH || process.env.AUBIO_PATH || 'aubio';
const KEYFINDER = process.env.KEYFINDER_PATH || 'keyfinder-cli';
const DSP_TIMEOUT_MS = Number(process.env.DSP_TIMEOUT_MS || 8000);

function runCapture(bin: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    let out = '';
    let done = false;
    let proc: ReturnType<typeof spawn>;
    try {
      proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
      resolve(null);
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
        resolve(null);
      }
    }, DSP_TIMEOUT_MS);
    proc.stdout?.on('data', (d) => (out += d.toString()));
    proc.on('error', () => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        resolve(null);
      }
    });
    proc.on('close', (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(code === 0 ? out : null);
    });
  });
}

/** aubio tempo → median BPM. `aubio tempo` prints one timestamp per beat. */
async function dspBpm(absFile: string): Promise<number | null> {
  // `aubio tempo -i file` prints beat timestamps (seconds), one per line.
  const out = await runCapture(AUBIO, ['tempo', '-i', absFile]);
  if (!out) return null;
  const times = out
    .split(/\s+/)
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0);
  if (times.length < 3) return null;
  const intervals: number[] = [];
  for (let i = 1; i < times.length; i++) intervals.push(times[i] - times[i - 1]);
  intervals.sort((a, b) => a - b);
  const median = intervals[Math.floor(intervals.length / 2)];
  if (!median || median <= 0) return null;
  const bpm = Math.round(60 / median);
  return bpm >= 40 && bpm <= 300 ? bpm : null;
}

/** keyfinder-cli → musical key string like "Am" / "F#" → normalized "A min". */
async function dspKey(absFile: string): Promise<string | null> {
  const out = await runCapture(KEYFINDER, ['-n', absFile]);
  if (!out) return null;
  const raw = out.trim().split(/\s+/).pop() || '';
  const m = raw.match(/^([A-G](?:#|b)?)(m|maj|min)?$/i);
  if (!m) return null;
  const note = m[1][0].toUpperCase() + (m[1][1] === '#' || m[1][1] === 'b' ? m[1][1] : '');
  const q = (m[2] || '').toLowerCase();
  return q === 'm' || q === 'min' ? `${note} min` : q === 'maj' ? `${note} maj` : note;
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
  const kind = decideKind(opts.durationSec, fn.loopHint, fn.oneShotHint);

  let bpm = fn.bpm;
  let key = fn.key;
  let bpmSource: Analysis['bpmSource'] = fn.bpm != null ? 'filename' : null;
  let keySource: Analysis['keySource'] = fn.key != null ? 'filename' : null;

  // DSP only makes sense for loops (BPM) / tonal material (key), and only if a
  // file path is given and DSP is enabled.
  if (opts.useDsp && opts.absFile) {
    if (bpm == null && kind !== 'one_shot') {
      const d = await dspBpm(opts.absFile).catch(() => null);
      if (d != null) {
        bpm = d;
        bpmSource = 'dsp';
      }
    }
    if (key == null) {
      const k = await dspKey(opts.absFile).catch(() => null);
      if (k != null) {
        key = k;
        keySource = 'dsp';
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
