import express from 'express';
import multer from 'multer';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { transcribeJob, renderJob, checkDependencies } from './src/process.js';
import { buildCues } from './src/subtitles.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JOBS_DIR = path.join(__dirname, 'jobs');
const UPLOAD_TMP = path.join(__dirname, 'uploads');
fs.mkdirSync(JOBS_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_TMP, { recursive: true });

const upload = multer({
  dest: UPLOAD_TMP,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /^video\//i.test(file.mimetype)
      || /\.(mp4|mov|mkv|webm|avi|m4v|wmv|flv|mpe?g|ts|3gp|ogv)$/i.test(file.originalname);
    cb(ok ? null : new Error('Format non supporté. Dépose un fichier vidéo (MP4, MOV, MKV, WEBM…).'), ok);
  },
});

// Garde-fous : une erreur isolée ne doit jamais tuer le serveur.
process.on('uncaughtException', (e) => console.error('⚠️  Exception non gérée :', e && e.message ? e.message : e));
process.on('unhandledRejection', (e) => console.error('⚠️  Rejet de promesse non géré :', e && e.message ? e.message : e));

const app = express();
app.use(express.json({ limit: '1mb' }));
// Pas de cache sur l'interface (html/js/css) : les mises à jour s'appliquent
// toujours sans avoir à vider le cache du navigateur.
app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  lastModified: false,
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-store'),
}));
app.use('/fonts', express.static(path.join(__dirname, 'fonts')));

const jobs = new Map();

app.get('/api/health', async (req, res) => res.json(await checkDependencies()));

// 1) Upload + transcription (avec gestion propre des erreurs multer)
const uploadSingle = upload.single('video');
app.post('/api/jobs', (req, res) => {
  uploadSingle(req, res, (uerr) => {
    if (uerr) {
      const msg = uerr.code === 'LIMIT_FILE_SIZE' ? 'Vidéo trop lourde (max 2 Go).' : (uerr.message || 'Échec de l\'envoi.');
      return res.status(400).json({ error: msg });
    }
    if (!req.file) return res.status(400).json({ error: 'Aucune vidéo reçue.' });

    const id = crypto.randomUUID();
    const dir = path.join(JOBS_DIR, id);
    fs.mkdirSync(dir, { recursive: true });

    const ext = path.extname(req.file.originalname) || '.mp4';
    const inputPath = path.join(dir, 'input' + ext);
    try {
      fs.renameSync(req.file.path, inputPath);
    } catch {
      fs.copyFileSync(req.file.path, inputPath);
      fs.rmSync(req.file.path, { force: true });
    }

    const language = req.body.language || 'auto';
    const model = ['tiny', 'base', 'small', 'medium', 'large-v3'].includes(req.body.model) ? req.body.model : 'small';

    const job = {
      id, status: 'queued', progress: 0, stage: 'En file…', error: null,
      dir, inputPath, language, model, createdAt: Date.now(),
      words: [], cues: [], duration: 0, dim: null, renders: new Map(),
    };
    jobs.set(id, job);
    res.json({ jobId: id });

    transcribeJob(job, (u) => Object.assign(job, u)).catch((err) => {
      job.status = 'error';
      job.error = err.message || String(err);
      job.stage = 'Erreur';
    });
  });
});

// État de la transcription
app.get('/api/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job introuvable' });
  const { status, progress, stage, error, language, duration, dim, cueCount } = job;
  res.json({ status, progress, stage, error, language, duration, dim, cueCount });
});

// Lire les cues (blocs de sous-titres éditables)
app.get('/api/jobs/:id/cues', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job introuvable' });
  res.json({ cues: job.cues || [], duration: job.duration || 0 });
});

// Enregistrer les cues édités
app.post('/api/jobs/:id/cues', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job introuvable' });
  const incoming = Array.isArray(req.body.cues) ? req.body.cues : null;
  if (!incoming) return res.status(400).json({ error: 'Format invalide.' });

  const cues = incoming
    .map((c) => ({ start: Math.max(0, Number(c.start) || 0), end: Math.max(0, Number(c.end) || 0), text: String(c.text || '').trim() }))
    .filter((c) => c.text && c.end > c.start)
    .sort((a, b) => a.start - b.start);
  if (!cues.length) return res.status(400).json({ error: 'Aucun sous-titre valide.' });

  job.cues = cues;
  res.json({ ok: true, cueCount: cues.length, cues });
});

// Sert la vidéo d'origine (pour la prévisualiser dans l'éditeur de sous-titres)
app.get('/api/jobs/:id/source', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job || !job.inputPath || !fs.existsSync(job.inputPath)) return res.status(404).send('Vidéo introuvable.');
  res.sendFile(job.inputPath);
});

// Re-générer automatiquement les cues depuis les mots (découpage rythmique)
app.post('/api/jobs/:id/cues/regenerate', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job introuvable' });
  if (!job.words || !job.words.length) return res.status(409).json({ error: 'Pas de transcription.' });
  const maxWords = Math.max(1, Math.min(8, parseInt(req.body.maxWords, 10) || 4));
  job.cues = buildCues(job.words, { maxWords });
  res.json({ ok: true, cueCount: job.cues.length, cues: job.cues });
});

// 2) Lancer un rendu (aperçu ou final, ou export .srt)
app.post('/api/jobs/:id/render', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job introuvable' });
  if (!job.cues || !job.cues.length) return res.status(409).json({ error: 'Transcription pas encore prête.' });

  const rid = crypto.randomUUID();
  const render = {
    id: rid, status: 'queued', progress: 0, error: null,
    options: req.body.options || {}, preview: !!req.body.preview,
    outputPath: null, outputName: null,
  };
  job.renders.set(rid, render);
  res.json({ renderId: rid });

  renderJob(job, render, (u) => Object.assign(render, u)).catch((err) => {
    render.status = 'error';
    render.error = err.message || String(err);
  });
});

app.get('/api/jobs/:id/renders/:rid', (req, res) => {
  const job = jobs.get(req.params.id);
  const render = job && job.renders.get(req.params.rid);
  if (!render) return res.status(404).json({ error: 'Rendu introuvable' });
  const { status, progress, error, outputName } = render;
  res.json({ status, progress, error, outputName });
});

app.get('/api/jobs/:id/renders/:rid/download', (req, res) => {
  const job = jobs.get(req.params.id);
  const render = job && job.renders.get(req.params.rid);
  if (!render || render.status !== 'done' || !render.outputPath) return res.status(404).send('Aucun fichier disponible.');
  res.download(render.outputPath, render.outputName);
});

// Nettoyage périodique : supprime les jobs (fichiers + mémoire) de plus de 3 h
// pour ne pas remplir le disque ni la RAM au fil de l'usage.
const JOB_TTL_MS = 3 * 60 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (job.createdAt && now - job.createdAt > JOB_TTL_MS) {
      try { fs.rmSync(job.dir, { recursive: true, force: true }); } catch { /* déjà supprimé */ }
      jobs.delete(id);
    }
  }
}, 30 * 60 * 1000).unref();

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`\n🎬  Scriptshort en ligne :  http://localhost:${PORT}\n`);
  checkDependencies().then((d) => {
    if (!d.ffmpeg || !d.ffprobe) console.warn('⚠️  FFmpeg/ffprobe introuvable dans le PATH.');
    if (!d.python) console.warn('⚠️  Python introuvable dans le PATH.');
    else if (!d.fasterWhisper) console.warn('⚠️  faster-whisper non installé — lance : npm run setup:py');
    if (d.ffmpeg && d.python && d.fasterWhisper) console.log('✅  Toutes les dépendances sont prêtes.\n');
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n⚠️  Le port ${PORT} est déjà utilisé.\n   Scriptshort est probablement déjà lancé (ouvre http://localhost:${PORT}),\n   ou un autre programme occupe ce port. Ferme l'autre fenêtre puis réessaie.\n`);
  } else {
    console.error('Erreur serveur :', err.message);
  }
  process.exit(1);
});
