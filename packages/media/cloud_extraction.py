"""Caption-first preparation helpers. Site access stays in the restricted worker.

The verified yt-dlp CLI processes private resolved info via its supported
--load-info-json interface. One pinned wheel supplies the new CLI.
No source URL, subtitles or provider metadata can supply a command or permission.
"""
import hashlib
import html
import json
import math
import os
from pathlib import Path
import re
import subprocess
import time
from urllib.parse import urlsplit

MAX_MEDIA_BYTES = 50 * 1024 * 1024
MAX_TRACK_BYTES = 250000
MAX_SEGMENTS = 200


def digest(data):
    return hashlib.sha256(data).hexdigest()


def number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def private_write(path, data):
    # One private job directory, no overwrites, symlinks or source-derived names.
    with path.open('xb') as stream:
        os.chmod(path, 0o600)
        stream.write(data)


def native_metadata(info):
    result = {}
    for source, target in [('title', 'title'), ('uploader', 'authorName'), ('channel', 'authorName')]:
        value = info.get(source)
        if isinstance(value, str) and value.strip() and target not in result:
            result[target] = value.strip()[:160]
    duration = info.get('duration')
    if number(duration) and 0 < duration <= 600:
        result['durationSeconds'] = duration
    timestamp = info.get('timestamp')
    if number(timestamp) and 0 < timestamp <= time.time() + 86400:
        result['publishedAt'] = int(timestamp * 1000)
    return result


def source_identity(raw):
    url = urlsplit(raw)
    host = (url.hostname or '').removeprefix('www.')
    if url.scheme != 'https' or url.username or url.password or url.port not in (None, 443):
        raise ValueError('unsupported_source')
    if host == 'instagram.com':
        match = re.fullmatch(r'/(?:p|reel|reels)/([A-Za-z0-9_-]{5,30})/?', url.path)
        if match:
            return 'instagram', match[1]
    if host == 'tiktok.com':
        if re.fullmatch(r'/t/[A-Za-z0-9]{5,30}/?', url.path):
            return 'tiktok', None
        match = re.fullmatch(r'/@[A-Za-z0-9_.]{1,40}/video/([0-9]{10,25})/?', url.path)
        if match:
            return 'tiktok', match[1]
    if host in ('vm.tiktok.com', 'vt.tiktok.com') and re.fullmatch(r'/[A-Za-z0-9]{5,30}/?', url.path):
        return 'tiktok', None
    raise ValueError('unsupported_source')

def resolved_identity(info):
    """Accept bounded TikTok video aliases only in the extractor's result.

    The pinned extractor supports share links, missing handles and opaque
    author IDs. They identify a video by ID, not by a public account name.
    They never become additional URLs the user or downloader may request.
    """
    raw = info.get('webpage_url')
    if not isinstance(raw, str) or len(raw) > 2048:
        raise ValueError('unsupported_resolved_source')
    try:
        identity = source_identity(raw)
        if identity[1] is not None:
            return identity
    except ValueError:
        pass
    try:
        url = urlsplit(raw)
        allowed = (url.scheme == 'https' and not url.username and not url.password and
                   url.port in (None, 443) and url.hostname in ('www.tiktok.com', 'tiktok.com'))
    except ValueError:
        allowed = False
    match = re.fullmatch(r'/(?:@[A-Za-z0-9_.-]{0,128}|share)/video/([0-9]{10,25})/?', url.path) if allowed else None
    if not match or info.get('extractor_key') != 'TikTok' or info.get('id') != match[1]:
        raise ValueError('unsupported_resolved_source')
    return 'tiktok', match[1]


def validate_identity(original, info):
    """MVP admits individual Instagram/TikTok posts, never a collection/card."""
    if not isinstance(info, dict) or info.get('_type', 'video') != 'video' or info.get('entries') is not None or info.get('is_live'):
        raise ValueError('unsupported_collection_or_live')
    expected = source_identity(original)
    resolved = resolved_identity(info)
    if expected[0] != resolved[0] or resolved[1] is None or (expected[1] is not None and expected[1] != resolved[1]):
        raise ValueError('source_identity_mismatch')
    if resolved[0] == 'tiktok' and info.get('id') is not None and info['id'] != resolved[1]:
        raise ValueError('source_identity_mismatch')
    duration = info.get('duration')
    if duration is not None and (not number(duration) or not 0 < duration <= 600):
        raise ValueError('over_limit_duration')
    return resolved[0]


def resolved_canonical(original, info):
    validate_identity(original, info)
    platform, post_id = resolved_identity(info)
    if platform == 'instagram':
        return f'https://www.instagram.com/p/{post_id}/'
    # Preserve an approved full-link identity. A short link may resolve without
    # a public handle; the pinned extractor uses /@_/video/<ID> in that case.
    source = original if source_identity(original)[1] is not None else info['webpage_url']
    handle = urlsplit(source).path.split('/')[1]
    if not re.fullmatch(r'@[A-Za-z0-9_.]{1,40}', handle):
        handle = '@_'
    return f'https://www.tiktok.com/{handle.lower()}/video/{post_id}'


def caption_candidates(info):
    language = info.get('language')
    language = language.lower() if isinstance(language, str) else None
    result = []
    for bucket in ('subtitles', 'automatic_captions'):
        tracks = info.get(bucket) or {}
        if not isinstance(tracks, dict) or len(tracks) > 200:
            continue
        for lang, variants in tracks.items():
            if not isinstance(lang, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,40}', lang) or not isinstance(variants, list):
                continue
            for track in variants[:20]:
                if not isinstance(track, dict) or track.get('ext') not in ('vtt', 'srt'):
                    continue
                inline = track.get('data')
                url = track.get('url')
                if not isinstance(inline, str) and not isinstance(url, str):
                    continue
                translated = ('tlang=' in url) if isinstance(url, str) else False
                source_match = language is not None and lang.lower().removesuffix('-orig') == language
                # TikTok automatic captions also enter `subtitles`. Never infer
                # human authorship merely from that bucket or a display name.
                origin = 'platform_auto' if bucket == 'automatic_captions' else 'platform_unknown'
                result.append({
                    'id': digest(json.dumps([bucket, lang, track], sort_keys=True, ensure_ascii=False).encode()),
                    'language': lang, 'format': track['ext'], 'origin': origin,
                    'translated': True if translated else (False if source_match else None),
                    'bucket': bucket, 'track': track,
                    'priority': (translated, not source_match, bucket != 'subtitles', track['ext'] != 'vtt', lang),
                })
    unique = {}
    for candidate in sorted(result, key=lambda item: item['priority']):
        unique.setdefault(candidate['id'], candidate)
    return list(unique.values())[:4]


def parse_captions(data, candidate, duration_ms):
    if not isinstance(data, bytes) or not 0 < len(data) <= MAX_TRACK_BYTES:
        raise ValueError('caption_bytes_over_limit')
    if not isinstance(duration_ms, int) or not 0 < duration_ms <= 600000:
        raise ValueError('invalid_verified_duration')
    # Import only when captions actually exist; no ASR/model dependency here.
    import pysubs2
    if pysubs2.__version__ != '1.9.0':
        raise ValueError('caption_parser_not_ready')
    text = data.decode('utf-8-sig', errors='strict')
    if '<!DOCTYPE' in text.upper() or '\x00' in text:
        raise ValueError('invalid_caption_content')
    cues = pysubs2.SSAFile.from_string(text, format_=candidate['format'])
    segments = []
    seen = set()
    for cue in cues:
        if cue.is_comment:
            continue
        words = html.unescape(cue.plaintext).strip()
        if not words:
            continue
        if cue.start < 0 or cue.start >= cue.end or cue.end > duration_ms or len(words) > 6000:
            raise ValueError('invalid_caption_timing_or_text')
        key = (cue.start, cue.end, words)
        if key in seen:
            continue
        seen.add(key)
        segments.append({'startMs': cue.start, 'endMs': cue.end, 'text': words})
    segments.sort(key=lambda cue: (cue['startMs'], cue['endMs']))
    if not segments:
        raise ValueError('empty_track')
    if len(segments) > MAX_SEGMENTS or sum(len(cue['text']) for cue in segments) > 60000:
        raise ValueError('caption_segments_over_limit')
    for index, cue in enumerate(segments):
        cue.update(id=f'caption-{index + 1}', textHash=digest(cue['text'].encode()))
    return {
        'transcript': {key: candidate[key] for key in ('origin', 'language', 'translated', 'format')} | {
            'asrUsed': False, 'trackSha256': digest(data),
        },
        'segments': segments,
    }


def choose_transcript(info, duration_ms, retrieve, transcribe):
    failures = []
    for candidate in caption_candidates(info):
        try:
            prepared = parse_captions(retrieve(candidate), candidate, duration_ms)
            return {**prepared, 'fallbackReasons': failures}
        except (ValueError, UnicodeError, OSError) as error:
            if str(error) == 'caption_segments_over_limit':
                raise
            failures.append(str(error)[:80])
    # The caller is responsible for verified PCM, language/model readiness and
    # network-disabled decoding. This callback is never evaluated on success.
    return {**transcribe(), 'fallbackReasons': failures or ['no_supported_caption_track']}


class ResolvedDownloader:
    """One bounded metadata extraction, then downloads from its private result."""
    def __init__(self, directory, binary, run, maximum_ms=60000):
        self.root = Path(directory).resolve(strict=True)
        if Path(directory).absolute() != self.root or not Path(binary).is_absolute():
            raise ValueError('invalid_worker_paths')
        self.binary, self.run = binary, run
        self.deadline = time.monotonic() + maximum_ms / 1000
        self.common = [binary, '--ignore-config', '--no-plugin-dirs', '--no-cache-dir',
                       '--compat-options', 'no-certifi',
                       '--no-playlist', '--no-warnings', '--no-progress', '--socket-timeout', '10',
                       '--retries', '0', '--fragment-retries', '0', '--extractor-retries', '0',
                       '--abort-on-unavailable-fragments', '--max-filesize', str(MAX_MEDIA_BYTES), '--fixup', 'never']

    def call(self, flags):
        remaining = self.deadline - time.monotonic()
        if remaining <= 0:
            raise ValueError('acquisition_deadline')
        return self.run(self.common + flags, remaining)

    def inspect(self, url):
        # Validate URL scope before allowing even the first platform request.
        source_identity(url)
        data = self.call(['--skip-download', '--dump-single-json', '--', url])
        if not isinstance(data, bytes) or len(data) > 1000000:
            raise ValueError('metadata_over_limit')
        info = json.loads(data)
        validate_identity(url, info)
        private_write(self.root / 'resolved-info.json', data)
        private_write(self.root / 'acquisition-state.json', json.dumps({'url': url, 'infoSha256': digest(data), 'deadline': self.deadline}).encode())
        self.info = info
        return native_metadata(info)

    @classmethod
    def resume(cls, directory, binary, run):
        root = Path(directory)
        for name in ('acquisition-state.json', 'resolved-info.json'):
            if (root / name).is_symlink() or (root / name).stat().st_size > 1000000:
                raise ValueError('invalid_private_state')
        state = json.loads((root / 'acquisition-state.json').read_bytes())
        data = (root / 'resolved-info.json').read_bytes()
        if digest(data) != state['infoSha256'] or not number(state['deadline']) or not time.monotonic() < state['deadline'] <= time.monotonic() + 60:
            raise ValueError('expired_or_changed_acquisition_state')
        worker = cls(root, binary, run)
        worker.deadline = state['deadline']
        worker.info = json.loads(data)
        validate_identity(state['url'], worker.info)
        return worker

    def retrieve_caption(self, candidate):
        inline = candidate['track'].get('data')
        if isinstance(inline, str):
            return inline.encode('utf-8')
        info = {**self.info, 'subtitles': {}, 'automatic_captions': {}}
        info[candidate['bucket']] = {candidate['language']: [candidate['track']]}
        # Stable internal paths; never use a provider title as a filename.
        index = len(list(self.root.glob('track-*.json')))
        name = f'track-{index}'
        private_write(self.root / f'{name}.json', json.dumps(info).encode())
        self.call(['--skip-download', '--write-subs', '--write-auto-subs',
                   '--sub-langs', '^' + re.escape(candidate['language']) + '$', '--sub-format', candidate['format'],
                   '--output', str(self.root / name), '--load-info-json', str(self.root / f'{name}.json')])
        path = self.root / f"{name}.{candidate['language']}.{candidate['format']}"
        if path.is_symlink() or not path.is_file() or path.stat().st_size > MAX_TRACK_BYTES:
            raise ValueError('caption_file_unavailable')
        return path.read_bytes()

    def download(self):
        formats = self.info.get('formats') or []
        formats = [f for f in formats if isinstance(f, dict) and isinstance(f.get('format_id'), str) and re.fullmatch(r'[A-Za-z0-9_-]{1,100}', f['format_id'])]
        videos = [f for f in formats if f.get('vcodec') not in (None, 'none') and
                  all(not number(f.get(dimension)) or 0 < f[dimension] <= 1920 for dimension in ('width', 'height')) and
                  (not number(f.get('filesize')) or f['filesize'] <= MAX_MEDIA_BYTES)]
        if not videos:
            raise ValueError('no_supported_video')
        # Prefer one adequate muxed clip. Only obtain another audio stream when
        # the selected video truly has none; never fetch associated music.
        def score(f):
            dimensions = [f[key] for key in ('width', 'height') if number(f.get(key))]
            short_edge = min(dimensions) if dimensions else 720
            return (f.get('acodec') in (None, 'none'), abs(short_edge - 720), f.get('ext') != 'mp4')
        video = min(videos, key=score)
        selected = [('input', video)]
        if video.get('acodec') in (None, 'none'):
            audio = [f for f in formats if f.get('vcodec') == 'none' and f.get('acodec') not in (None, 'none') and 'music' not in (f.get('format_id', '') + ' ' + str(f.get('format_note', ''))).lower()]
            if audio:
                selected.append(('audio-input', audio[-1]))
        for name, fmt in selected:
            self.call(['--format', fmt['format_id'], '--no-part', '--no-overwrites', '--output', str(self.root / name), '--load-info-json', str(self.root / 'resolved-info.json')])
        paths = [self.root / name for name, _ in selected]
        if any(path.is_symlink() or not path.is_file() for path in paths) or not 0 < sum(path.stat().st_size for path in paths) <= MAX_MEDIA_BYTES:
            raise ValueError('download_over_limit_or_incomplete')
        return {'files': [path.name for path in paths], 'bytes': sum(path.stat().st_size for path in paths)}


def child_environment():
    # Preserve the managed host's enforcement proxy and trust roots. These
    # values come only from the trusted host, never from source metadata.
    names = ('PATH', 'LANG', 'LC_ALL', 'HOME', 'TMPDIR',
             'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY',
             'http_proxy', 'https_proxy', 'all_proxy', 'no_proxy',
             'SSL_CERT_FILE', 'SSL_CERT_DIR', 'REQUESTS_CA_BUNDLE', 'CURL_CA_BUNDLE')
    return {key: os.environ[key] for key in names if key in os.environ}



def downloader_failure_code(diagnostic, returncode):
    """A bounded reported hint, never provider attestation or retry authority."""
    if not isinstance(diagnostic, bytes):
        raise ValueError('invalid_downloader_diagnostic')
    if len(diagnostic) > 64000:
        return 'downloader_diagnostic_limit'
    if returncode < 0:
        return 'downloader_terminated'
    text = diagnostic.decode('utf-8', errors='replace').lower()
    # Provider URLs can contain arbitrary text and secrets. They supply no hint.
    text = re.sub(r'https?://\S+', '[url]', text)
    groups = (
        ('downloader_runtime_unavailable', ('no module named', 'error while finding module specification', "can't open file")),
        ('source_rate_limited', ('http error 429', 'too many requests')),
        ('source_transport_unavailable', ('certificate_verify_failed', 'certificate verify failed', 'proxyerror', 'temporary failure in name resolution', 'connection timed out', 'timed out')),
        ('source_access_denied', ('http error 401', 'http error 403', 'your ip address is blocked')),
        ('source_unavailable', ('http error 404', 'video not available', 'this content is no longer available')),
        ('source_metadata_unavailable', ('instagram sent an empty media response', 'unable to extract', 'failed to extract')),
        ('source_access_required', ('redirected to the login page', 'only available for registered users', 'login required', 'log in to access')),
        ('source_media_unsupported', ('there is no video in this post', 'no video formats', 'requested format is not available', 'unsupported url')),
    )
    for code, phrases in groups:
        if any(phrase in text for phrase in phrases):
            return code
    return 'source_download_failed'


def bounded_tool(args, timeout):
    """Linux runtime only. The host must enforce the admitted network policy."""
    import resource
    def limits():
        resource.setrlimit(resource.RLIMIT_FSIZE, (MAX_MEDIA_BYTES, MAX_MEDIA_BYTES))
        resource.setrlimit(resource.RLIMIT_CPU, (60, 60))
        resource.setrlimit(resource.RLIMIT_NOFILE, (128, 128))
    env = child_environment()
    # Spool bounded process output to private files instead of unbounded PIPEs.
    import tempfile
    with tempfile.TemporaryFile() as output, tempfile.TemporaryFile() as errors:
        process = subprocess.Popen(args, stdout=output, stderr=errors, env=env, start_new_session=True, preexec_fn=limits)
        try:
            while process.poll() is None:
                if output.tell() > 1000000 or errors.tell() > 64000:
                    raise ValueError('downloader_diagnostic_limit')
                if timeout <= 0:
                    raise ValueError('acquisition_deadline')
                time.sleep(min(.05, timeout))
                timeout -= .05
            if output.tell() > 1000000 or errors.tell() > 64000:
                raise ValueError('downloader_diagnostic_limit')
            if process.returncode != 0:
                errors.seek(0)
                raise ValueError(downloader_failure_code(errors.read(64001), process.returncode))
            output.seek(0)
            return output.read(1000001)
        finally:
            if process.poll() is None:
                import signal
                os.killpg(process.pid, signal.SIGKILL)
            process.wait()
