"""Reproduce original JPEGs only. Never change an accepted preparation to fit.

The original operator recipe was FFmpeg input seeking, scale=width:-2 and -q 3.
A source or JPEG hash mismatch stops repair and requires separate review.
"""
import hashlib
import importlib.util
import json
from pathlib import Path
import re

spec = importlib.util.spec_from_file_location('cloud_extraction', Path(__file__).with_name('cloud_extraction.py'))
extraction = importlib.util.module_from_spec(spec)
spec.loader.exec_module(extraction)


def restore_frames(directory, preparation, ffmpeg='ffmpeg', run=None):
    root = Path(directory).resolve(strict=True)
    source = root / 'input'
    post = preparation['post']
    if post.get('schemaVersion') not in ('work-cloud-observed-media-v1', 'work-cloud-observed-media-v2') or len(post.get('assets', [])) != 1:
        raise ValueError('invalid_original_preparation')
    asset = post['assets'][0]
    if source.is_symlink() or not source.is_file() or not 0 < source.stat().st_size <= 50 * 1024 * 1024:
        raise ValueError('invalid_repair_source')
    if source.stat().st_size != asset['bytes'] or hashlib.sha256(source.read_bytes()).hexdigest() != asset['contentHash']:
        raise ValueError('original_source_bytes_changed')
    frames = post.get('frames', [])
    if not 0 < len(frames) <= 48:
        raise ValueError('invalid_original_frames')
    if run is None:
        run = extraction.bounded_tool
    restored = []
    for frame in frames:
        if not re.fullmatch(r'[A-Za-z0-9_-]{1,100}', frame['id']) or not 0 <= frame['timestampMs'] < asset['durationMs'] or not 0 < frame['bytes'] <= 150000 or not 0 < frame['width'] <= 960 or not 0 < frame['height'] <= 960:
            raise ValueError('invalid_original_frame')
        path = root / (frame['id'] + '.jpg')
        if path.exists() or path.is_symlink():
            raise ValueError('repair_file_already_exists')
        run([ffmpeg, '-nostdin', '-hide_banner', '-loglevel', 'error', '-protocol_whitelist', 'file,pipe',
             '-ss', str(frame['timestampMs'] / 1000), '-i', str(source), '-map', '0:v:0', '-frames', '1',
             '-vf', f"scale={frame['width']}:-2", '-q', '3', '-an', str(path)], 30)
        if path.is_symlink() or path.stat().st_size != frame['bytes'] or hashlib.sha256(path.read_bytes()).hexdigest() != frame['sha256']:
            raise ValueError('original_frame_bytes_changed')
        restored.append({'id': frame['id'], 'file': path.name, 'sha256': frame['sha256'], 'bytes': frame['bytes']})
    return restored
