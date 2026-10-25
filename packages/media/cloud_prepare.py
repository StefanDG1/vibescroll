"""Offline decode and evidence assembly for the bounded Work Cloud package.

The host must disable source networking before calling prepare_files. Sampling
creates pixels, not an image-inspection claim. Bind only after inspecting them.
"""
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
from urllib.parse import urlsplit
import subprocess
import sys
import time

_spec = importlib.util.spec_from_file_location('cloud_extraction', Path(__file__).with_name('cloud_extraction.py'))
extract = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(extract)


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)


def checked_file(root, name, maximum):
    if Path(name).name != name:
        raise ValueError('invalid_local_filename')
    path = root / name
    if path.is_symlink() or not path.is_file() or not 0 < path.stat().st_size <= maximum:
        raise ValueError('invalid_local_file')
    return path


def tool(args, timeout=45):
    if sys.platform == 'linux':
        return extract.bounded_tool(args, timeout)
    env = {key: os.environ[key] for key in ('PATH', 'LANG', 'LC_ALL', 'SystemRoot') if key in os.environ}
    return subprocess.run(args, check=True, capture_output=True, timeout=timeout, env=env).stdout


def prepare_files(directory, info, tracks, *, ffmpeg='ffmpeg', ffprobe='ffprobe', model_directory=None, asr_language=None, transcribe=None):
    """Returns only a local manifest. Native captions bypass the ASR callback."""
    root = Path(directory).resolve(strict=True)
    source = checked_file(root, 'input', extract.MAX_MEDIA_BYTES)
    extra = root / 'audio-input'
    common = [ffmpeg, '-nostdin', '-loglevel', 'error', '-threads', '2', '-protocol_whitelist', 'file', '-format_whitelist', 'mov,matroska,webm']
    if extra.exists():
        checked_file(root, 'audio-input', extract.MAX_MEDIA_BYTES)
        if source.stat().st_size + extra.stat().st_size > extract.MAX_MEDIA_BYTES:
            raise ValueError('media_over_limit')
        combined = root / 'combined.mp4'
        tool(common + ['-i', str(source), '-protocol_whitelist', 'file', '-i', str(extra), '-map', '0:v:0', '-map', '1:a:0', '-c', 'copy', str(combined)])
        source = checked_file(root, 'combined.mp4', extract.MAX_MEDIA_BYTES)
    metadata = json.loads(tool([ffprobe, '-v', 'error', '-protocol_whitelist', 'file', '-format_whitelist', 'mov,matroska,webm', '-show_entries', 'format=duration:stream=codec_type,width,height', '-of', 'json', str(source)], 15))
    duration = float(metadata['format']['duration'])
    video = next((stream for stream in metadata['streams'] if stream.get('codec_type') == 'video'), None)
    if not math.isfinite(duration) or not 0 < duration <= 600 or not video or not 0 < video.get('width', 0) <= 4096 or not 0 < video.get('height', 0) <= 4096:
        raise ValueError('unsupported_decoded_media')
    duration_ms = round(duration * 1000)
    audio_receipt = None

    def local_asr():
        nonlocal audio_receipt
        if not any(stream.get('codec_type') == 'audio' for stream in metadata['streams']):
            return {'segments': [], 'transcript': {'origin': 'none', 'language': 'und', 'translated': False, 'asrUsed': False, 'trackSha256': None, 'format': 'none'}}
        language = info.get('language')
        if asr_language != 'en' or (isinstance(language, str) and language.split('-')[0].lower() != 'en'):
            raise ValueError('english_asr_scope_required')
        audio = root / 'audio.wav'
        tool(common + ['-i', str(source), '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', '-t', str(duration), str(audio)])
        checked_file(root, audio.name, 19500000)
        if transcribe is not None:
            raw = transcribe(audio)
        else:
            if not model_directory:
                raise ValueError('verified_asr_model_required')
            # Model/runtime verification and offline flags live in this existing helper.
            spec = importlib.util.spec_from_file_location('local_whisper', Path(__file__).with_name('local_whisper.py'))
            whisper = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(whisper)
            os.environ['HF_HUB_OFFLINE'] = '1'
            os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
            raw = whisper.transcribe(audio, Path(model_directory))
        segments = []
        for index, segment in enumerate(raw['segments']):
            text = segment['text'].strip()
            if not text:
                continue
            start, end = segment['startMs'], segment['endMs']
            if not isinstance(start, int) or not isinstance(end, int) or not 0 <= start < end <= duration_ms:
                raise ValueError('asr_timing_outside_video')
            segments.append({'id': f'speech-{index + 1}', 'startMs': start, 'endMs': end, 'text': text, 'textHash': extract.digest(text.encode())})
        if len(segments) > 200 or sum(len(s['text']) for s in segments) > 60000:
            raise ValueError('asr_over_limit')
        audio_receipt = {'sha256': extract.digest(audio.read_bytes()), 'bytes': audio.stat().st_size, 'outcome': 'transcribed' if segments else 'no_speech'}
        return {'segments': segments, 'transcript': {'origin': 'local_asr' if segments else 'none', 'language': 'en', 'translated': False, 'asrUsed': True, 'trackSha256': None, 'format': 'asr' if segments else 'none'}}

    available = {}
    for record in tracks:
        data = checked_file(root, record['file'], extract.MAX_TRACK_BYTES).read_bytes()
        if extract.digest(data) != record['sha256']:
            raise ValueError('caption_bytes_changed')
        available[record['candidateId']] = data
    transcript = extract.choose_transcript(info, duration_ms, lambda candidate: available.get(candidate['id']), local_asr)
    from PIL import Image, ImageChops, ImageStat
    frames = []
    previous = None
    for index in range(8):
        timestamp = duration_ms * index // 8
        image = root / f'frame-{index + 1}.jpg'
        tool(common + ['-ss', str(timestamp / 1000), '-i', str(source), '-frames:v', '1', '-vf', "scale=w='min(960,iw)':h='min(960,ih)':force_original_aspect_ratio=decrease", '-q:v', '5', str(image)])
        checked_file(root, image.name, 1000000)
        with Image.open(image) as decoded:
            decoded.load()
            pixels = decoded.convert('RGB')
            comparison = pixels.resize((32, 32))
            duplicate = previous is not None and max(ImageStat.Stat(ImageChops.difference(comparison, previous)).mean) < 2
            previous = comparison
            if duplicate and index not in (0, 7):
                image.unlink()
                continue
            for quality in (80, 65, 50, 35):
                pixels.save(image, 'JPEG', quality=quality, optimize=True)
                if image.stat().st_size <= 150000:
                    break
            checked_file(root, image.name, 150000)
            width, height = pixels.size
        frames.append({'id': f'frame-{index + 1}', 'timestampMs': timestamp, 'sha256': extract.digest(image.read_bytes()), 'bytes': image.stat().st_size, 'width': width, 'height': height})
    return {
        'video': {'id': 'video-1', 'index': 0, 'kind': 'video', 'contentHash': extract.digest(source.read_bytes()), 'bytes': source.stat().st_size, 'width': video['width'], 'height': video['height'], 'mime': 'video/mp4' if source.name.endswith('.mp4') or source.read_bytes()[4:8] == b'ftyp' else 'video/webm', 'durationMs': duration_ms},
        'frames': frames, 'audio': audio_receipt, **transcript,
    }


def bind_preparation(context, info, manifest, observations):
    """Call after viewing the exact prepared JPEGs. Observation text is data."""
    now = round(time.time() * 1000)
    if context.get('schemaVersion') != 'work-cloud-media-v3' or extract.validate_identity(context['canonicalUrl'], info) != context['platform']:
        raise ValueError('cloud_context_mismatch')
    expected = {frame['id'] for frame in manifest['frames']}
    if not observations or any(key not in expected or not isinstance(value, str) or not 0 < len(value.strip()) <= 6000 for key, value in observations.items()):
        raise ValueError('actual_frame_observations_required')
    post = {
        'schemaVersion': 'work-cloud-observed-media-v2', 'provenance': 'authenticated_host_reported',
        'canonical': context['canonicalUrl'], 'resolvedCanonical': context['canonicalUrl'], 'platform': context['platform'], 'publishedAt': None,
        'dateReliability': 'unknown', 'observedAt': now,
        'caption': str(info.get('description') or '')[:6000],
        'assets': [{**manifest['video'], 'inspected': True, 'audioInspected': manifest['audio'] is not None}],
        'expectedAssetCount': None, 'coverage': 'partial',
        'inputHash': context['inputHash'], 'policyHash': context['policyHash'], 'toolchainHash': context['toolchainHash'],
        'taskId': context['taskId'], 'retainUntil': context['retainUntil'],
        'rawMediaDeleteBy': min(now + 86400000, context['retainUntil']), 'providerRetention': 'unknown',
        'frames': manifest['frames'], 'audio': manifest['audio'],
        'segments': manifest['segments'], 'transcript': manifest['transcript'],
    }
    platform, post_id = extract.source_identity(info['webpage_url'])
    post['resolvedCanonical'] = (f'https://www.instagram.com/p/{post_id}/' if platform == 'instagram' else
                                 f"https://www.tiktok.com/{urlsplit(info['webpage_url']).path.split('/')[1].lower()}/video/{post_id}")
    post['captionHash'] = extract.digest(post['caption'].encode())
    post['revisionHash'] = extract.digest(canonical(post).encode())
    evidence = [dict(kind='video_observation', assetId='video-1', assetIndex=0,
                     postRevisionHash=post['revisionHash'], basis='transcript', uncertainty='', **segment)
                for segment in post['segments']]
    for frame in manifest['frames']:
        if frame['id'] in observations:
            text = observations[frame['id']].strip()
            evidence.append({'id': frame['id'], 'kind': 'video_observation', 'assetId': 'video-1', 'assetIndex': 0,
                             'postRevisionHash': post['revisionHash'], 'basis': 'visible', 'uncertainty': '',
                             'startMs': frame['timestampMs'], 'endMs': frame['timestampMs'] + 1, 'text': text, 'textHash': extract.digest(text.encode())})
    result = {'schemaVersion': 'work-cloud-media-preparation-v3', 'post': post, 'evidence': evidence}
    if len(canonical(result).encode()) > 120000:
        raise ValueError('cloud_preparation_over_limit')
    return result
