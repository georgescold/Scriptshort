#!/usr/bin/env python3
"""Transcription locale avec faster-whisper.

Lit une vidéo/audio et écrit sur stdout des lignes NDJSON :
  {"type":"progress","progress":0.0-1.0}
  {"type":"result","language":...,"duration":...,"segments":[...],"words":[...]}
  {"type":"error","message":...}
"""
import sys
import json
import argparse

# Force l'UTF-8 sur stdout (sinon les accents cassent sous Windows).
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass


def emit(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--model", default="small")
    ap.add_argument("--language", default=None)
    ap.add_argument("--device", default="cpu")
    ap.add_argument("--compute_type", default="int8")
    args = ap.parse_args()

    try:
        from faster_whisper import WhisperModel
    except Exception as e:  # noqa: BLE001
        emit({"type": "error", "message": "faster-whisper non installé: " + str(e)})
        return

    try:
        model = WhisperModel(args.model, device=args.device, compute_type=args.compute_type)
        # Amorce pour orienter Whisper vers une orthographe/grammaire correctes.
        prompt = None
        if (args.language or "").lower().startswith("fr"):
            prompt = "Transcription en français, avec une orthographe et une grammaire soignées."
        segments, info = model.transcribe(
            args.input,
            language=args.language,
            word_timestamps=True,
            vad_filter=True,
            beam_size=5,
            initial_prompt=prompt,
        )
        duration = getattr(info, "duration", 0) or 0

        out_segments = []
        out_words = []
        for seg in segments:
            out_segments.append({
                "start": seg.start,
                "end": seg.end,
                "text": (seg.text or "").strip(),
            })
            if seg.words:
                for wd in seg.words:
                    if wd.word is None:
                        continue
                    out_words.append({
                        "start": wd.start,
                        "end": wd.end,
                        "word": wd.word,
                    })
            if duration:
                emit({"type": "progress", "progress": min(0.99, (seg.end or 0) / duration)})

        emit({
            "type": "result",
            "language": getattr(info, "language", None),
            "duration": duration,
            "segments": out_segments,
            "words": out_words,
        })
    except Exception as e:  # noqa: BLE001
        emit({"type": "error", "message": str(e)})


if __name__ == "__main__":
    main()
