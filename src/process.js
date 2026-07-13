// Orchestration : transcription (une fois) puis rendus (aperçu / final) à la demande.
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { buildAss, buildSrt, normalizeWords, buildCues } from './subtitles.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const FONTS_DIR = path.join(ROOT, 'fonts');
const PY = process.env.PYTHON || 'python';

// Copie les polices du projet dans le dossier du job pour que libass (FFmpeg)
// les trouve via fontsdir=fonts (chemin relatif, sans souci d'échappement Windows).
function ensureFonts(jobDir) {
  const dest = path.join(jobDir, 'fonts');
  if (fs.existsSync(dest)) return true;
  try {
    if (fs.existsSync(FONTS_DIR)) { fs.cpSync(FONTS_DIR, dest, { recursive: true }); return true; }
  } catch { /* polices premium indisponibles : on retombe sur les polices système */ }
  return false;
}

function commandOk(cmd, args) {
  return new Promise((resolve) => {
    try {
      const p = spawn(cmd, args, { shell: false });
      p.on('error', () => resolve(false));
      p.stdout?.on('data', () => {});
      p.stderr?.on('data', () => {});
      p.on('close', (code) => resolve(code === 0));
    } catch {
      resolve(false);
    }
  });
}

export async function checkDependencies() {
  const result = { ffmpeg: false, ffprobe: false, python: false, fasterWhisper: false };
  result.ffmpeg = await commandOk('ffmpeg', ['-version']);
  result.ffprobe = await commandOk('ffprobe', ['-version']);
  result.python = await commandOk(PY, ['--version']);
  if (result.python) result.fasterWhisper = await commandOk(PY, ['-c', 'import faster_whisper']);
  return result;
}

function ffprobeInfo(inputPath) {
  return new Promise((resolve) => {
    const args = ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', inputPath];
    const p = spawn('ffprobe', args);
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.on('error', () => resolve({ width: 1080, height: 1920, duration: 0 }));
    p.on('close', () => {
      try {
        const j = JSON.parse(out);
        const s = (j.streams && j.streams[0]) || {};
        const dur = parseFloat(j.format && j.format.duration) || 0;
        resolve({ width: s.width || 1080, height: s.height || 1920, duration: dur });
      } catch {
        resolve({ width: 1080, height: 1920, duration: 0 });
      }
    });
  });
}

function transcribe(job, onProgress) {
  return new Promise((resolve, reject) => {
    const script = path.join(ROOT, 'transcribe.py');
    const args = [script, '--input', job.inputPath, '--model', job.model];
    if (job.language && job.language !== 'auto') args.push('--language', job.language);

    const p = spawn(PY, args);
    let buf = '';
    let result = null;
    let errBuf = '';
    p.stdout.on('data', (d) => {
      buf += d.toString();
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.type === 'progress') onProgress(msg.progress);
          else if (msg.type === 'result') result = msg;
          else if (msg.type === 'error') reject(new Error(msg.message));
        } catch { /* logs internes ignorés */ }
      }
    });
    p.stderr.on('data', (d) => { errBuf += d.toString(); });
    p.on('error', (err) => reject(err));
    p.on('close', (code) => {
      if (result) resolve(result);
      else reject(new Error('Transcription échouée : ' + (errBuf.slice(-500) || ('code ' + code))));
    });
  });
}

function ffmpegBurn(dir, inputName, vf, outName, onProgress, durationSec, clip) {
  return new Promise((resolve, reject) => {
    const args = ['-y'];
    let dur = durationSec;
    if (clip) {
      dur = clip.end - clip.start;
      args.push('-ss', String(clip.start), '-t', String(dur));
    }
    args.push('-i', inputName, '-vf', vf,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', clip ? '22' : '20', '-pix_fmt', 'yuv420p');
    // Audio toujours réencodé en AAC : compatible MP4 quel que soit le format
    // d'origine (webm/opus, mkv, mov, avi…). Si pas d'audio, ffmpeg l'ignore.
    args.push('-c:a', 'aac', '-b:a', '192k');
    if (!clip) args.push('-movflags', '+faststart'); // lecture web/upload optimisée
    args.push(outName);

    const p = spawn('ffmpeg', args, { cwd: dir });
    let err = '';
    p.stderr.on('data', (d) => {
      const s = d.toString();
      err += s;
      const m = s.match(/time=(\d+):(\d+):(\d+\.\d+)/);
      if (m && dur) {
        const t = (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]);
        onProgress(Math.min(0.99, t / dur));
      }
    });
    p.on('error', (e) => reject(new Error('FFmpeg introuvable ou erreur : ' + e.message)));
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error('FFmpeg : ' + err.slice(-500)))));
  });
}

export async function transcribeJob(job, update) {
  update({ status: 'transcribing', stage: 'Analyse de la vidéo…', progress: 0 });
  const info = await ffprobeInfo(job.inputPath);
  job.dim = { width: info.width, height: info.height };

  update({ stage: 'Transcription en cours…', progress: 0 });
  const tr = await transcribe(job, (pr) => update({ progress: Math.round(pr * 100), stage: 'Transcription en cours…' }));

  // Mots normalisés (contractions recollées) = base pour (re)générer les cues.
  job.words = normalizeWords(tr.words || []);
  job.language = tr.language;
  job.duration = tr.duration || info.duration || 0;

  if (!job.words.length) throw new Error('Aucune parole détectée dans la vidéo.');

  // Cues = blocs éditables (découpage rythmique). Source de vérité du rendu.
  job.cues = buildCues(job.words, { maxWords: 4 });

  update({
    status: 'ready', stage: 'Prêt', progress: 100,
    language: job.language, duration: job.duration, dim: job.dim,
    cueCount: job.cues.length,
  });
}

export async function renderJob(job, render, update) {
  const opts = render.options || {};

  const cues = job.cues || [];

  // Export .srt : pas d'incrustation.
  if (opts.format === 'srt') {
    const name = 'sous-titres.srt';
    const p = path.join(job.dir, `r-${render.id}.srt`);
    fs.writeFileSync(p, buildSrt(cues, opts), 'utf8');
    update({ status: 'done', progress: 100, outputPath: p, outputName: name });
    return;
  }

  let clip = null;
  if (render.preview) {
    const start = cues.length ? Math.max(0, Math.floor(cues[0].start)) : 0;
    const dur = Math.min(5, Math.max(2, (job.duration || 5) - start));
    clip = { start, end: start + dur };
  }

  const ass = buildAss(cues, opts, job.dim, clip);
  const assName = `r-${render.id}.ass`;
  fs.writeFileSync(path.join(job.dir, assName), ass, 'utf8');

  const hasFonts = ensureFonts(job.dir);
  const vf = hasFonts ? `ass=${assName}:fontsdir=fonts` : `ass=${assName}`;

  const inputName = path.basename(job.inputPath);
  const outName = render.preview ? `preview-${render.id}.mp4` : 'video-sous-titree.mp4';

  update({ status: 'rendering', progress: 0 });
  await ffmpegBurn(
    job.dir, inputName, vf, outName,
    (pr) => update({ progress: Math.round(pr * 100) }),
    job.duration, clip,
  );

  update({
    status: 'done', progress: 100,
    outputPath: path.join(job.dir, outName),
    outputName: render.preview ? 'apercu.mp4' : outName,
  });
}
