"""Build/check the tools-only package. No source content, credentials or network."""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
MEDIA = ROOT / 'packages' / 'media'
FILES = ('cloud_job.py', 'cloud_ytdlp.py', 'cloud_extraction.py', 'cloud_prepare.py', 'prepare_cloud_dependencies.py',
         'restore_cloud_frames.py', 'local_whisper.py', 'asr_verification.py',
         'asr-model.lock.json', 'cloud-downloader.lock.json', 'requirements-captions.lock')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--refresh', action='store_true')
    parser.add_argument('--build', action='store_true')
    args = parser.parse_args()
    manifest = {'schemaVersion': 'cloud-media-tools-v1', 'pythonMinimum': [3, 10], 'asrPython': [3, 13],
                'supportedPlatforms': ['instagram', 'tiktok'], 'files': {}}
    contents = {}
    for name in FILES:
        path = MEDIA / name
        if path.is_symlink():
            raise RuntimeError('Tool symlinks are not package sources.')
        # Normalize repository text so Windows checkout line endings cannot
        # produce a different deployed policy from the same source commit.
        data = path.read_bytes().replace(b'\r\n', b'\n')
        contents[name] = data
        manifest['files'][name] = {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
    lock = MEDIA / 'cloud-extractor.lock.json'
    if args.refresh:
        lock.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8', newline='\n')
    if json.loads(lock.read_bytes()) != manifest:
        raise RuntimeError('Cloud tool manifest is stale; review changes before refreshing it.')
    if args.build:
        digest = hashlib.sha256(json.dumps(manifest, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
        output = ROOT / 'outputs' / 'cloud-media-package'
        output.mkdir(parents=True, exist_ok=True, mode=0o700)
        archive = output / f'cloud-media-{digest[:16]}.zip'
        with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED) as package:
            for name, data in {**contents, lock.name: json.dumps(manifest, indent=2).encode()}.items():
                entry = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
                entry.compress_type = zipfile.ZIP_DEFLATED
                entry.external_attr = 0o100600 << 16
                package.writestr(entry, data)
        print(json.dumps({'package': str(archive), 'sha256': hashlib.sha256(archive.read_bytes()).hexdigest(), 'files': len(contents)}))
    else:
        print('Cloud media tool manifest matches reviewed source files.')


if __name__ == '__main__':
    main()
