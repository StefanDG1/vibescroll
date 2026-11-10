"""Selected public X post acquisition and offline decoding inside the job VM.

gallery-dl is invoked as a separate pinned program. No account cookies, plugins,
source-derived commands, arbitrary link following, or access-denial fallback.
"""
import array
import hashlib
import json
import math
import os
from pathlib import Path
import re
import subprocess
import sys
import urllib.error
import urllib.request
from urllib.parse import urlsplit
import wave

ROOT = Path('/home/user/media')
TOOLS = Path('/home/user/tools')
MAX_BYTES = 50 * 1024 * 1024
MAX_JSON = 2 * 1024 * 1024


def digest(data):
    return hashlib.sha256(data).hexdigest()


def canonical(data):
    return json.dumps(data, sort_keys=True, separators=(',', ':'), ensure_ascii=False)


def write_json(name, data):
    path = ROOT / name
    with path.open('x', encoding='utf-8') as stream:
        os.chmod(path, 0o600)
        stream.write(canonical(data))


def read_json(name, limit=MAX_JSON):
    path = ROOT / name
    if path.is_symlink() or path.stat().st_size > limit:
        raise ValueError('post_manifest_over_limit')
    return json.loads(path.read_text(encoding='utf-8'))


def post_id(raw):
    url = urlsplit(raw)
    match = re.fullmatch(r'/i/web/status/([0-9]{2,20})', url.path)
    if url.scheme != 'https' or url.hostname != 'x.com' or url.username or url.password or url.port or url.query or url.fragment or not match:
        raise ValueError('invalid_x_identity')
    return match[1]


def asset_url(raw):
    if not isinstance(raw, str) or len(raw) > 4096 or re.search(r'[\s\\\x00-\x1f]', raw):
        raise ValueError('invalid_attachment_url')
    url = urlsplit(raw)
    if url.scheme != 'https' or url.hostname not in ('pbs.twimg.com', 'video.twimg.com') or url.username or url.password or url.port or url.fragment:
        raise ValueError('invalid_attachment_url')
    return raw


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise ValueError('source_redirect_denied')


def get(raw, maximum, output=None):
    request = urllib.request.Request(raw, headers={'User-Agent': 'VibeScroll/1.0 selected-post reader', 'Accept-Encoding': 'identity'})
    opener = urllib.request.build_opener(NoRedirect)
    with opener.open(request, timeout=12) as response:
        if response.status != 200 or int(response.headers.get('Content-Length', '0')) > maximum:
            raise ValueError('source_response_over_limit')
        mime = response.headers.get_content_type()
        chunks, size = [], 0
        stream = output.open('xb') if output else None
        try:
            if stream:
                os.chmod(output, 0o600)
            while True:
                chunk = response.read(min(65536, maximum + 1 - size))
                if not chunk:
                    break
                size += len(chunk)
                if size > maximum:
                    raise ValueError('source_response_over_limit')
                if stream:
                    stream.write(chunk)
                else:
                    chunks.append(chunk)
        finally:
            if stream:
                stream.close()
    return b''.join(chunks), mime, size


def gallery_result(messages, expected):
    if not isinstance(messages, list) or len(messages) > 36:
        raise ValueError('invalid_gallery_manifest')
    metadata, assets = None, []
    for message in messages:
        if not isinstance(message, list) or len(message) < 2 or not isinstance(message[-1], dict):
            raise ValueError('invalid_gallery_manifest')
        record = message[-1]
        if str(record.get('tweet_id')) != expected:
            raise ValueError('post_identity_mismatch')
        if message[0] == 2:
            if metadata is not None:
                raise ValueError('unexpected_post_collection')
            metadata = record
        elif message[0] == 3:
            kind = record.get('type')
            if kind not in ('photo', 'video', 'animated_gif'):
                raise ValueError('unsupported_attachment_type')
            assets.append({'kind': 'image' if kind == 'photo' else 'video',
                           'animated': kind == 'animated_gif', 'url': asset_url(message[1])})
        else:
            raise ValueError('unexpected_post_collection')
    if metadata is None or type(metadata.get('count')) is not int or metadata['count'] != len(assets):
        raise ValueError('incomplete_attachment_manifest')
    text = metadata.get('content')
    author = metadata.get('author') or {}
    return {'provider': 'gallery-dl', 'text': text, 'authorName': author.get('nick') or author.get('name') or '', 'assets': assets}


def fx_result(data, expected):
    if not isinstance(data, dict) or data.get('code') != 200:
        raise ValueError('post_unavailable')
    post = data.get('status')
    if not isinstance(post, dict) or str(post.get('id')) != expected or not isinstance(post.get('media'), dict):
        raise ValueError('post_identity_mismatch')
    media = post['media']
    all_media = media.get('all', [])
    if not isinstance(all_media, list) or len(all_media) > 35:
        raise ValueError('invalid_fallback_manifest')
    if len(all_media) != len(media.get('photos', [])) + len(media.get('videos', [])):
        raise ValueError('incomplete_attachment_manifest')
    assets = []
    for record in all_media:
        kind = record.get('type')
        if kind not in ('photo', 'video', 'gif'):
            raise ValueError('unsupported_attachment_type')
        raw = record.get('url')
        if kind != 'photo':
            variants = [f for f in record.get('formats', []) if f.get('container') == 'mp4']
            if not variants:
                raise ValueError('unsupported_attachment_type')
            raw = max(variants, key=lambda f: f.get('bitrate', 0))['url']
        assets.append({'kind': 'image' if kind == 'photo' else 'video', 'animated': kind == 'gif', 'url': asset_url(raw)})
    return {'provider': 'fxtwitter', 'text': post.get('text'), 'authorName': (post.get('author') or {}).get('name') or '', 'assets': assets}


def inspect():
    request = read_json('request.json', 3000)
    expected = post_id(request['url'])
    env = dict(os.environ)
    env['PYTHONPATH'] = str(TOOLS / '_deps')
    command = [sys.executable, '-B', '-m', 'gallery_dl', '--config-ignore', '--http-timeout', '8', '--retries', '0',
               '-o', 'cache.file=null', '-o', 'extractor.twitter.ratelimit=abort', '-o', 'extractor.twitter.retries-api=0',
               '-o', 'extractor.twitter.text-tweets=true', '-o', 'extractor.twitter.quoted=false',
               '-o', 'extractor.twitter.conversations=false', '-o', 'extractor.twitter.cards=false',
               '-o', 'extractor.twitter.replies=true', '-j', request['url']]
    try:
        result = subprocess.run(command, capture_output=True, timeout=28, env=env)
        if len(result.stdout) > MAX_JSON:
            raise ValueError('post_manifest_over_limit')
        if result.returncode:
            error = result.stderr.decode('utf-8', errors='replace')[:16000].lower()
            if re.search(r'429|rate.?limit|401|403|404|protected|private|not found|not authorized|suspended|(?:post|tweet) (?:is )?unavailable', error):
                raise ValueError('post_unavailable')
            if not re.search(r'timeout|timed out|connection|50[0-9]|parse|keyerror|attributeerror|json|extract|module', error):
                raise ValueError('post_retrieval_failed')
            raise RuntimeError('gallery_transport_or_parser_failure')
        try:
            post = gallery_result(json.loads(result.stdout), expected)
        except ValueError as error:
            if not isinstance(error, json.JSONDecodeError) and str(error) not in ('invalid_gallery_manifest', 'incomplete_attachment_manifest'):
                raise
            raise RuntimeError('gallery_transport_or_parser_failure') from error
    except (subprocess.TimeoutExpired, RuntimeError):
        payload, mime, _ = get(f'https://api.fxtwitter.com/2/status/{expected}', MAX_JSON)
        if mime != 'application/json':
            raise ValueError('invalid_fallback_response')
        post = fx_result(json.loads(payload), expected)
    text = post['text']
    if not isinstance(text, str) or len(text) > 60000 or (not text.strip() and not post['assets']) or len(post['assets']) > 35:
        raise ValueError('post_text_or_assets_over_limit')
    post.update(postId=expected, canonical=request['url'])
    write_json('x-acquisition.json', post)
    write_json('metadata.json', {'title': (text.splitlines()[0] if text.strip() else f"X post from {post['authorName']}")[:160],
                                 'authorName': str(post['authorName'])[:160], 'resolvedCanonical': request['url']})


def download():
    post = read_json('x-acquisition.json')
    total = 0
    for index, asset in enumerate(post['assets']):
        path = ROOT / f'asset-{index + 1}.input'
        _, mime, size = get(asset_url(asset['url']), MAX_BYTES - total, path)
        if size == 0 or mime not in (('image/jpeg', 'image/png', 'image/webp') if asset['kind'] == 'image' else ('video/mp4',)):
            raise ValueError('unsupported_attachment_content')
        total += size
        asset.update(file=path.name, mime=mime, bytes=size, contentHash=digest(path.read_bytes()))
    write_json('x-acquired.json', post)


def tool(args, timeout=20):
    return subprocess.run(args, check=True, capture_output=True, timeout=timeout, cwd=ROOT).stdout


def media_info(path):
    return json.loads(tool(['ffprobe', '-v', 'error', '-protocol_whitelist', 'file', '-show_entries',
                           'format=duration:stream=codec_type,width,height', '-of', 'json', str(path)], 10))


def decode():
    post = read_json('x-acquired.json')
    request = read_json('request.json', 3000)
    assets, frames, audios = [], [], []
    total_duration = 0
    image_count = sum(a['kind'] == 'image' for a in post['assets'])
    video_count = len(post['assets']) - image_count
    samples = min(8, (48 - image_count) // max(1, video_count))
    if samples < 1:
        raise ValueError('attachment_frame_limit')
    for index, source in enumerate(post['assets']):
        path = ROOT / f'asset-{index + 1}.input'
        if path.is_symlink() or not path.is_file() or path.stat().st_size != source['bytes'] or digest(path.read_bytes()) != source['contentHash']:
            raise ValueError('attachment_changed')
        info = media_info(path)
        video = [s for s in info['streams'] if s.get('codec_type') == 'video']
        if len(video) != 1 or not 0 < video[0].get('width', 0) <= 4096 or not 0 < video[0].get('height', 0) <= 4096:
            raise ValueError('unsupported_attachment_dimensions')
        asset = {k: source[k] for k in ('kind', 'mime', 'bytes', 'contentHash')}
        asset.update(id=f'asset-{index + 1}', index=index, width=video[0]['width'], height=video[0]['height'])
        if asset['kind'] == 'video':
            duration = float(info['format']['duration'])
            if not math.isfinite(duration) or not 0 < duration <= 600:
                raise ValueError('over_limit_duration')
            duration_ms = round(duration * 1000)
            total_duration += duration_ms
            if total_duration > request['maximumDurationMs']:
                raise ValueError('reviewed_duration_exceeded')
            asset.update(durationMs=duration_ms, animated=source['animated'], audioStatus='none')
            if any(s.get('codec_type') == 'audio' for s in info['streams']):
                name = f'asset-{index + 1}.wav'
                tool(['ffmpeg', '-nostdin', '-v', 'error', '-threads', '2', '-protocol_whitelist', 'file', '-i', str(path),
                      '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', '-t', str(duration), str(ROOT / name)], 40)
                if (ROOT / name).stat().st_size > 19500000:
                    raise ValueError('audio_over_limit')
                with wave.open(str(ROOT / name), 'rb') as stream:
                    pcm = array.array('h', stream.readframes(stream.getnframes()))
                asset['audioStatus'] = 'prepared' if any(pcm) else 'silent'
                if asset['audioStatus'] == 'prepared':
                    audios.append({'file': name, 'assetId': asset['id'], 'assetIndex': index, 'durationMs': duration_ms})
            times = sorted({max(0, min(duration_ms - 250, duration_ms * i // max(1, samples - 1))) for i in range(samples)})
        else:
            times = [0]
        for number, timestamp in enumerate(times):
            name = f'asset-{index + 1}-frame-{number:03}.jpg'
            frame_path = ROOT / name
            for quality in (5, 12, 24, 31):
                tool(['ffmpeg', '-nostdin', '-v', 'error', '-threads', '2', '-ss', str(timestamp / 1000),
                      '-protocol_whitelist', 'file', '-i', str(path), '-frames:v', '1', '-vf',
                      'scale=960:960:force_original_aspect_ratio=decrease,format=yuvj420p', '-threads', '2',
                      '-q:v', str(quality), '-y', str(frame_path)], 12)
                if 0 < frame_path.stat().st_size <= 150000:
                    break
            if not 0 < frame_path.stat().st_size <= 150000:
                raise ValueError('source_image_over_limit')
            frames.append({'id': name, 'timestampMs': timestamp, 'assetId': asset['id'], 'assetIndex': index})
        assets.append(asset)
    manifest = {'version': 'x-post-evidence-v1', 'postId': post['postId'], 'provider': post['provider'],
                'text': post['text'], 'textHash': digest(post['text'].encode()), 'assets': assets,
                'expectedAssetCount': len(assets), 'coverage': 'complete_manifest'}
    source_hash = digest(canonical({'canonical': post['canonical'], 'text': post['text'], 'assets': assets}).encode())
    write_json('x-result.json', {'post': manifest, 'durationMs': total_duration, 'frames': frames, 'audios': audios,
                                'sourceHash': source_hash, 'sourceBytes': sum(a['bytes'] for a in assets),
                                'ffmpegVersion': tool(['ffmpeg', '-version'], 5).decode().splitlines()[0][:250],
                                'ffprobeVersion': tool(['ffprobe', '-version'], 5).decode().splitlines()[0][:250],
                                'pythonVersion': sys.version.split()[0]})


def setup():
    import prepare_cloud_dependencies
    wheels = read_json('x-dependencies.json', 12000)
    prepare_cloud_dependencies.unpack_reviewed_wheels(str(TOOLS / '_deps'),
        [((TOOLS / f'wheel-{i}.zip').read_bytes(), w['sha256']) for i, w in enumerate(wheels)])


if __name__ == '__main__':
    {'setup': setup, 'inspect': inspect, 'download': download, 'decode': decode}[sys.argv[1]]()
