"""Explicit tools-only setup for pure wheels, including hosts without pip.

No source/model data and no install hooks. Run only during approved cache setup.
"""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import stat
import urllib.request
import zipfile

PARSER = {
    'url': 'https://files.pythonhosted.org/packages/4f/43/6b89c84f5a6753b1dbc43b8d010443b8f2314a2b94f34e448975d115c962/pysubs2-1.9.0-py3-none-any.whl',
    'sha256': '83f1979cb7e064294f0c8473ef672ca2e5c0a7172bbf8ae9b4337899d5cdf01f',
}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise ValueError('unexpected_dependency_redirect')


def unpack_reviewed_wheels(directory, wheels):
    target = Path(directory)
    if target.name != '_deps' or not target.is_absolute() or target.resolve() != target or target.exists():
        raise ValueError('new_private_dependency_directory_required')
    checked = []
    names = set()
    total = 0
    # Verify every archive before creating or executing anything from it.
    for payload, expected_hash in wheels:
        if len(payload) > 4 * 1024 * 1024 or hashlib.sha256(payload).hexdigest() != expected_hash:
            raise ValueError('dependency_hash_mismatch')
        archive = zipfile.ZipFile(io.BytesIO(payload))
        if len(archive.infolist()) > 5000:
            raise ValueError('dependency_file_count_over_limit')
        for entry in archive.infolist():
            path = PurePosixPath(entry.filename)
            total += entry.file_size
            if path.is_absolute() or '..' in path.parts or '\\' in entry.filename or ':' in entry.filename or len(entry.filename) > 300 or stat.S_ISLNK(entry.external_attr >> 16) or entry.filename in names or entry.file_size > 4 * 1024 * 1024 or total > 32 * 1024 * 1024:
                raise ValueError('invalid_pure_wheel_path_or_size')
            names.add(entry.filename)
        checked.append(archive)
    target.mkdir(mode=0o700, parents=False, exist_ok=False)
    for archive in checked:
        for entry in archive.infolist():
            path = target.joinpath(*PurePosixPath(entry.filename).parts)
            if entry.is_dir():
                path.mkdir(parents=True, exist_ok=True, mode=0o700)
                continue
            path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            with path.open('xb') as output:
                os.chmod(path, 0o600)
                output.write(archive.read(entry))
    return target


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--directory', required=True)
    args = parser.parse_args()
    target = Path(args.directory)
    if target.name != '_deps' or not target.is_absolute() or target.resolve() != target or target.exists():
        raise ValueError('new_private_dependency_directory_required')
    downloader = json.loads(Path(__file__).with_name('cloud-downloader.lock.json').read_bytes())
    opener = urllib.request.build_opener(NoRedirect)
    wheels = []
    for package in (PARSER, downloader):
        if not package['url'].startswith('https://files.pythonhosted.org/packages/'):
            raise ValueError('unreviewed_dependency_host')
        with opener.open(package['url'], timeout=30) as response:
            wheels.append((response.read(4 * 1024 * 1024 + 1), package['sha256']))
    result = unpack_reviewed_wheels(args.directory, wheels)
    print(json.dumps({'prepared': True, 'directory': str(result), 'downloadedWheels': 2, 'hashesVerified': True, 'sourceRequests': 0, 'modelRequests': 0}))


if __name__ == '__main__':
    main()
