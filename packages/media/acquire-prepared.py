"""Reuse the reviewed resolver and its immutable metadata across two phases."""
import json
import os
import pathlib
import re
import sys
import time
import acquire
import cloud_extraction as extraction

ROOT = pathlib.Path('/home/user/media')
BINARY = '/home/user/tools/yt-dlp'


def run(args, timeout):
    assert os.environ.get('VIBE_DOWNLOAD_PROXY') == 'http://127.0.0.1:47891'
    code, stdout, stderr = acquire.bounded_run(
        args[:1] + ['--proxy', 'http://127.0.0.1:47891'] + args[1:], timeout)
    if code != 0:
        raise ValueError(extraction.downloader_failure_code(stderr, code))
    return stdout


def main():
    phase = sys.argv[1]
    if phase == 'inspect':
        request = ROOT / 'request.json'
        assert request.stat().st_size <= 3000 and not request.is_symlink()
        url = json.loads(request.read_text())['url']
        worker = extraction.ResolvedDownloader(ROOT, BINARY, run)
        metadata = worker.inspect(url)
        info = worker.info
        metadata['resolvedCanonical'] = info['webpage_url']
        handle = info.get('uploader_id')
        if info.get('extractor_key') == 'TikTok' and isinstance(handle, str) and re.fullmatch(r'[A-Za-z0-9_.]{1,40}', handle):
            metadata['resolvedCanonical'] = f'https://www.tiktok.com/@{handle}/video/{info["id"]}'
        (ROOT / 'metadata.json').write_text(json.dumps(metadata))
    elif phase == 'download':
        worker = extraction.ResolvedDownloader.resume(ROOT, BINARY, run)
        tracks = []
        for candidate in extraction.caption_candidates(worker.info):
            try:
                data = worker.retrieve_caption(candidate)
                name = f'caption-{len(tracks)}.{candidate["format"]}'
                extraction.private_write(ROOT / name, data)
                tracks.append({'file': name, 'candidate': {k: candidate[k] for k in ['id', 'origin', 'language', 'translated', 'format']}})
                break
            except (ValueError, OSError):
                continue
        (ROOT / 'captions.json').write_text(json.dumps(tracks))
        worker.download()
    else:
        raise ValueError('invalid_phase')


if __name__ == '__main__':
    main()
