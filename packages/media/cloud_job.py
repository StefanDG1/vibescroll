"""Run one reviewed Cloud job in explicit stages, without owning MCP credentials."""
import argparse
import importlib.util
import json
import re
import sys
from pathlib import Path


def load(name):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def verify_package(expected):
    import hashlib
    root = Path(__file__).resolve().parent
    manifest = json.loads((root / 'cloud-extractor.lock.json').read_bytes())
    if manifest != expected or manifest.get('schemaVersion') != 'cloud-media-tools-v1':
        raise ValueError('cloud_package_policy_mismatch')
    for name, record in manifest['files'].items():
        if Path(name).name != name or (root / name).is_symlink():
            raise ValueError('invalid_cloud_package_file')
        data = (root / name).read_bytes().replace(b'\r\n', b'\n')
        if len(data) != record['bytes'] or hashlib.sha256(data).hexdigest() != record['sha256']:
            raise ValueError('cloud_package_bytes_changed')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('stage', choices=('inspect', 'acquire', 'prepare', 'bind'))
    parser.add_argument('--directory', required=True)
    parser.add_argument('--url')
    parser.add_argument('--context-file')
    parser.add_argument('--downloader')
    parser.add_argument('--ffmpeg', default='ffmpeg')
    parser.add_argument('--ffprobe', default='ffprobe')
    parser.add_argument('--model-directory')
    parser.add_argument('--asr-language', choices=('en',))
    parser.add_argument('--source-network-disabled', action='store_true')
    args = parser.parse_args()
    dependencies = Path(__file__).resolve().parent / '_deps'
    if dependencies.exists():
        if dependencies.is_symlink() or dependencies.resolve().parent != Path(__file__).resolve().parent:
            raise ValueError('invalid_private_tools_cache')
        sys.path.insert(0, str(dependencies))
    extraction = load('cloud_extraction')
    binary = args.downloader or sys.executable
    def run_downloader(command, timeout):
        if args.downloader:
            return extraction.bounded_tool(command, timeout)
        return extraction.bounded_tool([sys.executable, '-I', str(Path(__file__).with_name('cloud_ytdlp.py')), *command[1:]], timeout)
    root = Path(args.directory)
    if not root.is_absolute() or root.is_symlink() or root.resolve() != root:
        raise ValueError('invalid_private_job_directory')
    if args.stage == 'inspect':
        if not args.context_file:
            raise ValueError('cloud_context_required')
        context_path = Path(args.context_file)
        if context_path.is_symlink() or context_path.stat().st_size > 262144:
            raise ValueError('invalid_cloud_context')
        context = json.loads(context_path.read_bytes())
        if context.get('schemaVersion') != 'work-cloud-media-v3' or context.get('canonicalUrl') != args.url:
            raise ValueError('cloud_context_mismatch')
        verify_package(context['policy']['toolchain']['extractionPackage'])
        root.mkdir(mode=0o700, parents=False, exist_ok=False)
        extraction.private_write(root / 'context.json', json.dumps(context).encode())
        expected = json.loads(Path(__file__).with_name('cloud-downloader.lock.json').read_bytes())['version']
        if run_downloader([binary, '--ignore-config', '--no-plugin-dirs', '--version'], 5).decode().strip() != expected:
            raise ValueError('downloader_version_not_ready')
        worker = extraction.ResolvedDownloader(root, binary, run_downloader)
        result = worker.inspect(args.url)
        extraction.private_write(root / 'metadata.json', json.dumps(result).encode())
    elif args.stage == 'acquire':
        worker = extraction.ResolvedDownloader.resume(root, binary, run_downloader)
        result = worker.download()
        tracks = []
        for index, candidate in enumerate(extraction.caption_candidates(worker.info)):
            try:
                data = worker.retrieve_caption(candidate)
                if not 0 < len(data) <= extraction.MAX_TRACK_BYTES:
                    continue
                name = f'caption-{index + 1}.{candidate["format"]}'
                extraction.private_write(root / name, data)
                tracks.append({key: candidate[key] for key in ('language', 'format', 'bucket')} | {'candidateId': candidate['id'], 'file': name, 'sha256': extraction.digest(data)})
            except (ValueError, OSError):
                continue
        extraction.private_write(root / 'tracks.json', json.dumps(tracks).encode())
        result['captionTracks'] = len(tracks)
    else:
        preparation = load('cloud_prepare')
        def read(name, maximum):
            return json.loads(preparation.checked_file(root, name, maximum).read_bytes())
        info = read('resolved-info.json', 1000000)
        if args.stage == 'prepare':
            if not args.source_network_disabled:
                raise ValueError('disable_source_network_before_decode')
            context = read('context.json', 262144)
            import time
            remaining = (context['deadline'] - time.time() * 1000) / 1000
            if not 0 < remaining <= 900:
                raise ValueError('expired_cloud_execution')
            if sys.platform == 'linux':
                import signal
                signal.alarm(max(1, int(remaining)))
            manifest = preparation.prepare_files(root, info, read('tracks.json', 10000), ffmpeg=args.ffmpeg, ffprobe=args.ffprobe, model_directory=args.model_directory, asr_language=args.asr_language)
            extraction.private_write(root / 'prepared-files.json', preparation.canonical(manifest).encode())
            result = {'frames': len(manifest['frames']), 'segments': len(manifest['segments']), 'transcript': manifest['transcript']}
        else:
            result = preparation.bind_preparation(read('context.json', 262144), info, read('prepared-files.json', 120000), read('observations.json', 120000))
            extraction.private_write(root / 'preparation.json', preparation.canonical(result).encode())
            result = {'preparationFile': 'preparation.json', 'segments': len(result['post']['segments']), 'frames': len(result['post']['frames'])}
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        message = str(error)
        print(message if re.fullmatch(r'[A-Za-z_]{1,80}', message) else 'cloud_preparation_failed', file=sys.stderr)
        sys.exit(1)
