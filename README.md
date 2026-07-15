# 🎬 Scriptshort

Mini-version locale de SendShort : **tu déposes une vidéo dans le navigateur, tu la récupères avec des sous-titres automatiques incrustés.** 100 % local, gratuit.

- **Transcription** : [Whisper](https://github.com/SYSTRAN/faster-whisper) (tourne sur ton PC, gère le français)
- **Incrustation** : FFmpeg
- **3 styles** : 🔥 Viral (mot surligné façon TikTok) · 🎞️ Classique · 📄 Fichier `.srt`

---

## Prérequis (à installer une fois)

| Outil | Vérifier | Installer |
|-------|----------|-----------|
| **Node.js** | `node --version` | ✅ déjà installé |
| **Python 3.9+** | `python --version` | ✅ déjà installé |
| **FFmpeg** | `ffmpeg -version` | voir ci-dessous |

### Installer FFmpeg (Windows)

Le plus simple, dans PowerShell :

```powershell
winget install Gyan.FFmpeg
```

Puis **ferme et rouvre** ton terminal (pour que le PATH se mette à jour) et vérifie :

```powershell
ffmpeg -version
```

---

## Installation

```powershell
# 1. dépendances Node
npm install

# 2. dépendances Python (Whisper)
npm run setup:py
```

---

## Lancer

**Le plus simple : double-clique sur `Lancer Scriptshort.bat`.**
Il démarre le serveur et ouvre le navigateur tout seul. Garde la fenêtre noire ouverte
pendant l'utilisation ; ferme-la pour arrêter le programme.

Ou en ligne de commande :

```powershell
npm start
```

Puis ouvre **http://localhost:3000** dans ton navigateur.

> ⏳ **Au tout premier traitement**, Whisper télécharge le modèle choisi (≈150 Mo pour `small`). C'est une seule fois.

---

## Utilisation (studio)

1. Glisse une vidéo, choisis la **langue** + la **précision**, puis **Importer & transcrire**.
2. La vidéo est transcrite **une seule fois**. Tu arrives ensuite dans le **studio**.
3. Teste les **modèles de style** (Hormozi, Beast, TikTok, Boxed, Neon, Clean, Classique) et ajuste :
   police, animation, position, couleurs, mots par ligne, MAJUSCULES, mot à mot / phrase entière.
   → L'**aperçu en direct** (dans le navigateur) se met à jour **instantanément** à chaque réglage,
   avec les vrais premiers mots de ta vidéo. Pas besoin de lancer un rendu pour voir le style.
4. Quand un style te plaît, **Générer l'aperçu réel (5 s)** fait le vrai rendu FFmpeg sur ta vidéo.
5. Puis → **Rendu final** (vidéo complète) ou **Télécharger .srt**.

> Galerie de tous les styles : [http://localhost:3000/styles-demo.html](http://localhost:3000/styles-demo.html)

### Styles disponibles
- **Hormozi / Beast / Bebas / TikTok / Neon / Boxed / Fun** : mot à mot, mot prononcé surligné (style viral).
- **Clean** : mot à mot sobre.
- **Classique** : phrase entière en bas de l'écran.

### Polices premium incluses
Polices pro libres (OFL) bundlées dans `fonts/` et utilisées **à la fois dans l'aperçu navigateur et
dans le rendu FFmpeg** (via `fontsdir`) : **Montserrat ExtraBold, Inter / Inter Bold / Inter ExtraBold,
Anton, Bebas Neue, Poppins, Archivo Black, Luckiest Guy, Playfair Display** (+ Arial Black, Impact,
Arial, Verdana du système).

### Réglages fins (studio)
Police, **taille**, **couleur de texte / mot surligné / contour** (sélecteur **ou code `#`**,
avec **couleurs favorites** enregistrées), **hauteur verticale**, mots par ligne, MAJUSCULES,
mot à mot / phrase entière.

### Découpage rythmique
Les sous-titres sont découpés en **blocs (cues)** aux frontières naturelles — pauses,
respirations, fins de phrase — pour coller à l'intonation et au rythme.

### Calage du surlignage sur la voix
En mode mot à mot, chaque mot s'allume sur le **timing réel donné par Whisper** (et non sur une
estimation), puis reste surligné jusqu'au mot suivant. L'aperçu du studio utilise exactement les
mêmes timings que le rendu final.

**Le texte ne disparaît pas pendant les blancs** : un bloc reste affiché jusqu'à l'apparition du
suivant, donc les respirations et pauses courtes ne font plus clignoter les sous-titres. Au-delà de
`maxHold` (2 s par défaut, dans `DEFAULTS` de [`src/subtitles.js`](src/subtitles.js)), c'est un vrai
silence — changement de scène, musique — et l'écran se vide.

Si tu **corriges le texte d'un bloc à la main** dans l'éditeur, ses timings mot à mot ne
correspondent plus : ce bloc-là (et lui seul) retombe sur une répartition approximative, au prorata
de la longueur des mots. Les blocs laissés intacts gardent le calage exact.

### Ponctuation
**Retirée par défaut** (plus fluide à l'écran). Case **« Garder la ponctuation »** pour la
réactiver. Les apostrophes (c'est) et traits d'union (peut-être) sont toujours conservés.

### Éditeur de sous-titres
Bouton **« ✏️ Corriger / ajouter des sous-titres »** : un éditeur où tu peux, pour chaque bloc,
**corriger le texte**, **changer le début/fin** (quand il apparaît), **supprimer**, ou
**ajouter** une nouvelle ligne. Bouton **« ↻ Redécouper auto »** pour régénérer le découpage rythmique.
La **vidéo est intégrée** dans l'éditeur et **se cale automatiquement** sur le temps que tu modifies
(ou clique 👁) → tu vois exactement l'image correspondante pour un calage précis.

### Précision de la transcription
Une amorce française oriente Whisper vers une orthographe correcte. Pour réduire encore les fautes
(homophones type « ces » / « c'est »), choisis le modèle **Medium** ou **Large**. Sinon, corrige
en deux clics dans l'éditeur.

### Couleur favorite par défaut
La première couleur **favorite enregistrée** devient automatiquement la couleur du mot surligné
quand tu choisis un style.

### Animations
`Aucune`, `Fondu`, `Pop` (la ligne grossit en apparaissant), `Rebond`.

### Quel modèle Whisper choisir ?

| Modèle | Vitesse | Qualité | Conseil |
|--------|---------|---------|---------|
| `base` | ⚡⚡⚡ | correcte | tests rapides |
| `small` | ⚡⚡ | bonne | **défaut recommandé** |
| `medium` | ⚡ | très bonne | si la transcription FR fait des fautes |
| `large-v3` | 🐢 | maximale | si tu as un GPU / beaucoup de temps |

Sur CPU, c'est plus lent : compte quelques minutes pour une vidéo de quelques minutes avec `small`.
Avec un GPU NVIDIA + CUDA, c'est bien plus rapide (Whisper utilise alors le GPU automatiquement si tu adaptes `transcribe.py`).

---

## Robustesse (cas couverts)

- **Formats vidéo** : MP4, MOV, MKV, **WEBM**, AVI, M4V… L'audio est toujours réencodé en AAC
  → la sortie MP4 marche même depuis du WEBM/Opus, MKV, etc.
- **Orientation** : portrait (9:16), **paysage (16:9)**, carré — taille des sous-titres adaptée automatiquement.
- **Fichier non vidéo** → refusé avec un message clair.
- **Vidéo trop lourde** (> 2 Go) → message clair.
- **Vidéo sans parole** → message « Aucune parole détectée ».
- **Le serveur ne plante pas** : une erreur isolée est journalisée, pas fatale ; **port déjà occupé** → message explicite.
- **Coupure réseau passagère** → l'interface réessaie (pas d'erreur au moindre hoquet).
- **Texte mal transcrit** → bouton « Corriger le texte ».
- **Disque/RAM** : les fichiers de travail de plus de 3 h sont nettoyés automatiquement.
- **Sortie** : MP4 H.264 + `faststart` (lecture web/upload réseaux sociaux optimisée).

## Structure

```
server.js          serveur web + API des jobs
transcribe.py      transcription Whisper (NDJSON sur stdout)
src/process.js     orchestration : transcription -> sous-titres -> FFmpeg
src/subtitles.js   génération .ass (viral/classique) et .srt
public/            interface web (glisser-déposer)
jobs/              fichiers de travail (ignoré par git)
```

---

## Personnaliser / ajouter des styles

- **Ajouter un modèle de style** : ajoute une entrée dans l'objet `TEMPLATES` de
  [`public/app.js`](public/app.js) (police, couleurs, animation, position…). Il apparaît
  automatiquement comme bouton dans le studio.
- **Réglages fins du rendu** (tailles, marges, regroupement des mots, animations) :
  [`src/subtitles.js`](src/subtitles.js) — voir `groupWords`, `entrance`, et la fonction `buildAss`.
