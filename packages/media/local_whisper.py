"""Transcribe bounded normalized PCM, never decode arbitrary uploaded media here."""

import argparse
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import wave


# Resolve only the reviewed package helper, including when launched with -I.
_helper = Path(__file__).absolute().with_name("asr_verification.py")
_spec = importlib.util.spec_from_file_location("vibescroll_asr_verification", _helper)
verification = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(verification)


def verify_model(path):
    lock = verification.load_lock()
    verification.verify_directory(path, lock)
    verification.verify_runtime(lock)
    return lock["model"]["revision"]


def normalized_pcm(path):
    if path.is_symlink() or not path.is_file():
        raise ValueError("LOCAL_ASR_INPUT_INVALID")
    size = path.stat().st_size
    if not 44 <= size <= 19_500_000:
        raise ValueError("LOCAL_ASR_INPUT_LIMIT")
    with path.open("rb") as content:
        data = content.read(19_500_001)
    if len(data) != size:
        raise ValueError("LOCAL_ASR_INPUT_CHANGED")
    with wave.open(io.BytesIO(data), "rb") as audio:
        frames = audio.getnframes()
        if (audio.getnchannels(), audio.getsampwidth(), audio.getframerate(), audio.getcomptype()) != (1, 2, 16000, "NONE"):
            raise ValueError("LOCAL_ASR_NORMALIZED_PCM_REQUIRED")
        if not 0 < frames <= 9_600_000:
            raise ValueError("LOCAL_ASR_DURATION_LIMIT")
        pcm = audio.readframes(frames)
        if len(pcm) != frames * 2:
            raise ValueError("LOCAL_ASR_TRUNCATED_INPUT")
    return pcm, frames / 16000, hashlib.sha256(data).hexdigest()


def bounded_segment_timing(start, end, duration_ms):
    # Whisper can place the final spoken segment slightly past the real EOF.
    # Accept only a bounded terminal overrun, never extend evidence past audio.
    if not 0 <= start <= end or start >= duration_ms or end > duration_ms + 5000:
        raise ValueError("LOCAL_ASR_TIMING_INVALID")
    return start, min(end, duration_ms), end > duration_ms


def transcribe(path, model_path):
    pcm, duration, digest = normalized_pcm(path)
    revision = verify_model(model_path)
    import numpy as np
    from faster_whisper import WhisperModel

    samples = np.frombuffer(pcm, dtype="<i2").astype(np.float32) / 32768
    segments = []
    clipped = False
    # Silence is not a transcript. Do not introduce a second VAD model.
    if np.max(np.abs(samples)) >= .0004 and np.sqrt(np.mean(samples * samples)) >= .0001:
        model = WhisperModel(str(model_path), device="cpu", compute_type="int8", cpu_threads=4, local_files_only=True)
        output, _ = model.transcribe(samples, language="en", task="transcribe", beam_size=3,
                                     vad_filter=False, condition_on_previous_text=False,
                                     word_timestamps=False)
        total = 0
        for item in output:
            text = item.text.strip()
            start, end = round(item.start * 1000), round(item.end * 1000)
            start, end, was_clipped = bounded_segment_timing(start, end, round(duration * 1000))
            clipped = clipped or was_clipped
            total += len(text)
            if len(segments) >= 200 or len(text) > 4000 or total > 60000:
                raise ValueError("LOCAL_ASR_OUTPUT_LIMIT")
            if text:
                segments.append({"index": len(segments), "startMs": start,
                                 "endMs": end, "text": text})
    return {"schemaVersion": 1, "model": "openai/whisper-small.en",
            "weightDistribution": "Systran/faster-whisper-small.en",
            "weightRevision": revision,
            "runtime": "faster-whisper", "runtimeVersion": "1.2.1",
            "device": "cpu", "computeType": "int8", "language": "en",
            "durationMs": round(duration * 1000), "audioSha256": digest,
            "segments": segments, "coverage": "audio_only",
            "warnings": ["Automatic transcription can contain errors; review the original audio."] +
                        (["The final transcript segment timing was clipped to the actual audio duration."] if clipped else [])}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--audio", required=True)
    parser.add_argument("--model-directory", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    # Model download is a separate setup step. A job cannot fetch new weights.
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
    result = transcribe(Path(args.audio), Path(args.model_directory))
    with open(args.output, "x", encoding="utf-8") as output:
        json.dump(result, output, ensure_ascii=False)
    print(json.dumps({"completed": True, "segments": len(result["segments"])}))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        code = str(error)
        if not code.startswith("LOCAL_ASR_") or len(code) > 80:
            code = "LOCAL_ASR_FAILED"
        print(code, file=sys.stderr)
        sys.exit(1)
