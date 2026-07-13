// Génération des sous-titres .ass (incrustation) et .srt (export).
// Modèle : "cues" = blocs éditables { start, end, text }. Couleurs ASS : &HAABBGGRR.

const DEFAULTS = {
  mode: 'word',            // 'word' = mot à mot (karaoké), 'segment' = phrase entière
  font: 'Arial Black',
  textColor: '#FFFFFF',
  highlightColor: '#FFE000',
  outlineColor: '#000000',
  outlineScale: 1,
  fontScale: 1,
  uppercase: true,
  position: 'middle',
  posY: null,
  animation: 'pop',        // 'none' | 'fade' | 'pop' | 'bounce'
  box: false,
  maxWords: 4,
  punctuation: false,      // false = ponctuation retirée (plus fluide)
};

function resolve(o = {}) {
  const out = { ...DEFAULTS };
  for (const k of Object.keys(o)) {
    if (o[k] !== undefined && o[k] !== null && o[k] !== '') out[k] = o[k];
  }
  if (typeof o.punctuation === 'boolean') out.punctuation = o.punctuation;
  return out;
}

function assTime(t) {
  if (t < 0 || Number.isNaN(t)) t = 0;
  const h = Math.floor(t / 3600); t -= h * 3600;
  const m = Math.floor(t / 60); t -= m * 60;
  const s = Math.floor(t);
  let cs = Math.round((t - s) * 100);
  if (cs >= 100) cs = 99;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function srtTime(t) {
  if (t < 0 || Number.isNaN(t)) t = 0;
  const h = Math.floor(t / 3600); t -= h * 3600;
  const m = Math.floor(t / 60); t -= m * 60;
  const s = Math.floor(t);
  const ms = Math.round((t - s) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function esc(text) {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/\{/g, '(')
    .replace(/\}/g, ')')
    .replace(/\r?\n/g, ' ')
    .trim();
}

// Retire la ponctuation (points, virgules, etc.) mais garde les apostrophes
// (c'est) et les traits d'union (peut-être) à l'intérieur des mots.
export function stripPunct(text) {
  return String(text)
    .replace(/[.,;:!?…«»“”„"()\[\]{}<>]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function hexToAss(hex, alpha = 0) {
  hex = String(hex || '#FFFFFF').replace('#', '');
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  const r = hex.slice(0, 2), g = hex.slice(2, 4), b = hex.slice(4, 6);
  const aa = alpha.toString(16).padStart(2, '0');
  return ('&H' + aa + b + g + r).toUpperCase();
}

function inlineColor(hex) {
  return '&H' + hexToAss(hex).slice(4) + '&';
}

function header(dim, styleLine) {
  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${dim.width}
PlayResY: ${dim.height}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
${styleLine}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
}

// Recolle les morceaux d'un même mot (contractions coupées par Whisper).
export function normalizeWords(words) {
  const out = [];
  for (const w of words) {
    if (w.word == null) continue;
    const raw = w.word;
    const text = raw.trim();
    if (!text) continue;
    const isContinuation = !/^\s/.test(raw) && out.length > 0;
    if (isContinuation) {
      const prev = out[out.length - 1];
      prev.word += text;
      prev.end = w.end;
    } else {
      out.push({ start: w.start, end: w.end, word: text });
    }
  }
  return out;
}

// Découpage RYTHMIQUE : coupe en priorité aux pauses (respirations) et fins de
// phrase, dans la limite de maxWords / maxDur. Donne des blocs naturels.
function groupWords(words, { maxWords = 4, maxGap = 0.35, maxDur = 3.5, maxChars = 42 } = {}) {
  const lines = [];
  let cur = [];
  let chars = 0;
  for (const w of words) {
    if (cur.length) {
      const last = cur[cur.length - 1];
      const gap = w.start - last.end;
      const dur = w.end - cur[0].start;
      const endsSentence = /[.!?…]["»)]?$/.test(last.word);
      const endsClause = /[,;:]$/.test(last.word);
      const tooMany = cur.length >= maxWords;
      const tooLong = chars + 1 + w.word.length > maxChars;
      const tooSlow = dur > maxDur;
      if (endsSentence || gap > maxGap || tooMany || tooLong || tooSlow || (endsClause && cur.length >= 2)) {
        lines.push(cur);
        cur = [];
        chars = 0;
      }
    }
    cur.push(w);
    chars += (chars ? 1 : 0) + w.word.length;
  }
  if (cur.length) lines.push(cur);
  return lines;
}

// Faux génériques de sous-titrage que Whisper "hallucine" sur les silences /
// musiques (appris sur des datasets de sous-titres). Jamais dits dans la vidéo.
const HALLUCINATIONS = [
  /sous[- ]?titr(age|es|é)/i,         // « Sous-titrage », « Sous-titres »
  /\bST['’ ]?\s*\d{2,4}\b/i,          // ST'501, ST 501…
  /\bamara/i,                          // Amara.org
  /\bMFP\b/,                           // Sous-titrage MFP
  /subtitl(e|es|ing|ed)\b/i,           // "subtitles by"…
  /réalisé(e|es|s)? par la communauté/i,
];

function isHallucination(text) {
  const t = String(text || '').trim();
  if (!t) return true;
  return HALLUCINATIONS.some((re) => re.test(t));
}

// Construit les cues (blocs éditables) à partir des mots normalisés.
export function buildCues(words, opts = {}) {
  const groups = groupWords(words, {
    maxWords: opts.maxWords || 4,
    maxGap: opts.maxGap != null ? opts.maxGap : 0.35,
    maxDur: opts.maxDur != null ? opts.maxDur : 3.5,
    maxChars: opts.maxChars != null ? opts.maxChars : 42,
  });
  return groups
    .map((g) => ({
      start: g[0].start,
      end: g[g.length - 1].end,
      text: g.map((w) => w.word).join(' '),
    }))
    .filter((c) => !isHallucination(c.text)); // retire les faux génériques
}

function entrance(anim) {
  switch (anim) {
    case 'fade': return '\\fad(120,0)';
    case 'pop': return '\\fscx70\\fscy70\\t(0,140,\\fscx100\\fscy100)\\fad(60,0)';
    case 'bounce': return '\\fscx45\\fscy45\\t(0,95,\\fscx100\\fscy100)\\t(95,155,\\fscx91\\fscy91)\\t(155,215,\\fscx100\\fscy100)\\fad(45,0)';
    default: return '';
  }
}

// Découpe une liste de mots en lignes tenant chacune dans maxChars caractères.
function splitWordsToLines(wordObjs, maxChars) {
  const lines = [[]];
  let len = 0;
  for (const wo of wordObjs) {
    const add = (len ? 1 : 0) + wo.text.length;
    if (len && len + add > maxChars) { lines.push([]); len = 0; }
    const line = lines[lines.length - 1];
    line.push(wo);
    len += (line.length > 1 ? 1 : 0) + wo.text.length;
  }
  return lines;
}

export function buildSrt(cues, options = {}) {
  const strip = !options.punctuation;
  const out = [];
  let n = 1;
  for (const c of cues) {
    const t = strip ? stripPunct(c.text) : (c.text || '').trim();
    if (!t) continue;
    out.push(`${n++}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${t}`);
  }
  return out.join('\n\n') + '\n';
}

// clip = { start, end } pour ne générer qu'un extrait (aperçu), times décalés.
export function buildAss(cues, options, dim, clip) {
  const o = resolve(options);
  const strip = !o.punctuation;
  const w = dim.width || 1080;
  const h = dim.height || 1920;
  const base = Math.min(w, h);

  const fs = Math.round(base * (o.mode === 'segment' ? 0.05 : 0.072) * o.fontScale);
  const mL = Math.round(w * 0.08);
  const mR = Math.round(w * 0.08);

  const alignByPos = { top: 8, middle: 2, bottom: 2 };
  const mvByPos = { top: Math.round(h * 0.12), middle: Math.round(h * 0.30), bottom: Math.round(h * 0.07) };
  let alignment, marginV;
  if (o.posY != null && o.posY !== '' && !Number.isNaN(Number(o.posY))) {
    const p = Math.max(0, Math.min(100, Number(o.posY)));
    alignment = 2;
    marginV = Math.round(h * (0.04 + (p / 100) * 0.80));
  } else {
    alignment = alignByPos[o.position] || 2;
    marginV = mvByPos[o.position] != null ? mvByPos[o.position] : Math.round(h * 0.30);
  }

  const primary = hexToAss(o.textColor);
  let borderStyle = 1;
  let outline = Math.max(2, Math.round(base * 0.009 * o.outlineScale * (o.mode === 'segment' ? 0.7 : 1)));
  let shadow = Math.max(0, Math.round(base * 0.002));
  let outlineCol = hexToAss(o.outlineColor);
  const backCol = hexToAss('#000000', 0x60);

  if (o.box) {
    borderStyle = 3;
    outlineCol = hexToAss('#000000', 0x40);
    outline = Math.max(4, Math.round(base * 0.012));
    shadow = 0;
  }

  const HEAVY = ['Anton', 'Archivo Black', 'Bebas Neue', 'Luckiest Guy', 'Montserrat ExtraBold', 'Poppins', 'Inter', 'Inter Bold', 'Inter ExtraBold', 'Playfair Display', 'Arial Black', 'Impact'];
  const bold = HEAVY.includes(o.font) ? 0 : (o.mode === 'segment' ? 0 : 1);
  const styleLine = `Style: Cap,${o.font},${fs},${primary},&H000000FF,${outlineCol},${backCol},${bold},0,0,0,100,100,0,0,${borderStyle},${outline},${shadow},${alignment},${mL},${mR},${marginV},1`;

  const charsPerLine = Math.max(8, Math.round(16 / (o.fontScale || 1)));
  const clipStart = clip ? clip.start : 0;
  const events = [];
  function emit(start, end, text, anim) {
    if (clip) {
      if (end <= clip.start || start >= clip.end) return;
      start = Math.max(start, clip.start);
      end = Math.min(end, clip.end);
    }
    if (end <= start) return;
    const tag = anim ? `{${anim}}` : '';
    events.push(`Dialogue: 0,${assTime(start - clipStart)},${assTime(end - clipStart)},Cap,,0,0,0,,${tag}${text}`);
  }

  function tokens(cueText) {
    const raw = strip ? stripPunct(cueText) : String(cueText || '').trim();
    return raw.split(/\s+/).filter(Boolean).map((t, i) => ({
      text: o.uppercase ? esc(t).toUpperCase() : esc(t),
      i,
    }));
  }

  if (o.mode === 'segment') {
    const ent = entrance(o.animation === 'none' ? 'none' : (o.animation || 'fade'));
    for (const cue of cues) {
      const wo = tokens(cue.text);
      if (!wo.length) continue;
      const lines = splitWordsToLines(wo, charsPerLine);
      const text = lines.map((line) => line.map((x) => x.text).join(' ')).join('\\N');
      emit(cue.start, cue.end, text, ent);
    }
  } else {
    const hi = inlineColor(o.highlightColor);
    const baseCol = inlineColor(o.textColor);
    const ent = entrance(o.animation);
    for (const cue of cues) {
      const wo = tokens(cue.text);
      const n = wo.length;
      if (!n) continue;
      // Répartition du temps du bloc sur ses mots (pondérée par la longueur).
      const total = Math.max(0.05, cue.end - cue.start);
      const weights = wo.map((x) => Math.max(1, x.text.length));
      const sumW = weights.reduce((a, b) => a + b, 0);
      const times = [];
      let t = cue.start;
      for (let i = 0; i < n; i++) { const dur = total * weights[i] / sumW; times.push(t); t += dur; }
      times.push(cue.end);
      const lines = splitWordsToLines(wo, charsPerLine);
      for (let k = 0; k < n; k++) {
        const start = times[k];
        const end = times[k + 1];
        const text = lines.map((line) => line.map((x) => (
          x.i === k ? `{\\1c${hi}}${x.text}{\\1c${baseCol}}` : x.text
        )).join(' ')).join('\\N');
        emit(start, end, text, k === 0 ? ent : '');
      }
    }
  }

  return header({ width: w, height: h }, styleLine) + events.join('\n') + '\n';
}
