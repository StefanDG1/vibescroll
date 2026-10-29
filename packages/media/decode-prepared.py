"""Bounded media-only preparation; transcription runs in the trusted controller."""
import hashlib
import json
import math
import pathlib
import resource
import subprocess
import sys

sys.path.insert(0, '/home/user/tools/pysubs2.zip')

ROOT = pathlib.Path('/home/user/media')
resource.setrlimit(resource.RLIMIT_FSIZE, (55_000_000, 55_000_000))
resource.setrlimit(resource.RLIMIT_CPU, (90, 90))


def run(args, timeout=30):
    return subprocess.run(args, check=True, capture_output=True, timeout=timeout,
                          cwd=ROOT).stdout


def prepare():
    source = ROOT / 'input'
    assert source.is_file() and not source.is_symlink()
    assert 0 < source.stat().st_size <= 50 * 1024 * 1024
    acquired = [source]
    extra = ROOT / 'audio-input'
    if extra.exists():
        assert extra.is_file() and not extra.is_symlink()
        assert source.stat().st_size + extra.stat().st_size <= 50 * 1024 * 1024
        acquired.append(extra)
        combined = ROOT / 'combined-input'
        run(['ffmpeg', '-nostdin', '-v', 'error', '-threads', '2',
             '-protocol_whitelist', 'file', '-i', str(source),
             '-protocol_whitelist', 'file', '-i', str(extra), '-map', '0:v:0',
             '-map', '1:a:0', '-c', 'copy', '-f', 'matroska', str(combined)], 30)
        source = combined
    info = json.loads(run(['ffprobe', '-v', 'error', '-protocol_whitelist', 'file',
                          '-show_entries', 'format=duration:stream=codec_type,width,height,duration',
                          '-of', 'json', str(source)], 15))
    duration = float(info['format']['duration'])
    assert math.isfinite(duration) and 0 < duration <= 600
    request = ROOT / 'request.json'
    maximum_ms = 600000
    if request.exists():
        assert not request.is_symlink() and request.stat().st_size <= 3000
        maximum_ms = json.loads(request.read_text())['maximumDurationMs']
        assert type(maximum_ms) is int and 0 < maximum_ms <= 600000
    assert round(duration * 1000) <= maximum_ms, 'reviewed_duration_exceeded'
    streams = info['streams']
    assert len(streams) <= 4
    video = [s for s in streams if s['codec_type'] == 'video']
    audio = [s for s in streams if s['codec_type'] == 'audio']
    assert len(video) == 1 and len(audio) <= 2
    assert 0 < video[0]['width'] <= 4096 and 0 < video[0]['height'] <= 4096
    duration_ms = round(duration * 1000)
    native = None
    tracks_file = ROOT / 'captions.json'
    if tracks_file.is_file() and not tracks_file.is_symlink():
        import cloud_extraction
        for track in json.loads(tracks_file.read_text())[:4]:
            try:
                candidate = track['candidate']
                path = ROOT / track['file']
                assert path.parent == ROOT and not path.is_symlink()
                data = path.read_bytes()
                native = cloud_extraction.parse_captions(data, candidate, duration_ms)
                break
            except (ValueError, OSError, AssertionError):
                continue
    if native is not None:
        (ROOT / 'transcript.json').write_text(json.dumps(native), encoding='utf-8')
    output = {'durationSeconds': duration, 'frames': [],
              'coverage': 'full_sampled' if audio and native is None else 'visual_only'}
    if audio and native is None:
        run(['ffmpeg', '-nostdin', '-v', 'error', '-threads', '2',
             '-protocol_whitelist', 'file', '-i', str(source), '-vn',
             '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le',
             # AAC packet padding can decode past the container timeline.
             # Bound real PCM before ASR instead of altering returned timestamps.
             '-t', str(duration), str(ROOT / 'audio.wav')], 45)
        assert (ROOT / 'audio.wav').stat().st_size <= 19_500_000
        output['audio'] = 'audio.wav'
    video_ms = duration_ms
    try:
        stream_ms = round(float(video[0].get('duration', duration)) * 1000)
        if 0 < stream_ms < video_ms:
            video_ms = stream_ms
    except (TypeError, ValueError):
        pass
    # Eight deterministic samples include a decodable moment near the end.
    times = sorted({min(video_ms - 250, video_ms * i // 7) for i in range(8)})
    times = sorted({max(0, t) for t in times})
    for index, timestamp in enumerate(times):
        name = f'frame-{index:03}.jpg'
        path = ROOT / name
        for quality in (5, 12, 24, 31):
            run(['ffmpeg', '-nostdin', '-v', 'error', '-threads', '2',
                 '-ss', str(timestamp / 1000), '-protocol_whitelist', 'file',
                 '-i', str(source), '-frames:v', '1', '-vf',
                 'scale=540:960:force_original_aspect_ratio=decrease,format=yuvj420p',
                 '-threads', '2', '-q:v', str(quality), '-y', str(path)], 12)
            if path.is_file() and 0 < path.stat().st_size <= 150000:
                break
        assert path.is_file() and 0 < path.stat().st_size <= 150000
        output['frames'].append({'id': name, 'timestampMs': timestamp,
                                 'selectionReason': 'periodic sample'})
    assert output['frames']
    (ROOT / 'manifest.json').write_text(json.dumps(output), encoding='utf-8')
    hashes = [hashlib.sha256(path.read_bytes()).hexdigest() for path in acquired]
    receipt = {'sourceHash': hashlib.sha256(json.dumps(hashes, separators=(',', ':')).encode()).hexdigest(),
               'sourceBytes': sum(path.stat().st_size for path in acquired),
               'width': video[0]['width'], 'height': video[0]['height'],
               'ffmpegVersion': run(['ffmpeg', '-version'], 5).decode('utf-8').splitlines()[0][:250],
               'ffprobeVersion': run(['ffprobe', '-version'], 5).decode('utf-8').splitlines()[0][:250],
               'pythonVersion': sys.version.split()[0]}
    (ROOT / 'source-receipt.json').write_text(json.dumps(receipt), encoding='utf-8')


if __name__ == '__main__':
    prepare()
