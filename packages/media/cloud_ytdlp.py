"""Use the new job's pinned wheel without altering the legacy downloader cache."""
import json
from pathlib import Path
import sys

root = Path(__file__).resolve().parent
dependencies = root / '_deps'
if dependencies.exists():
    if dependencies.is_symlink() or dependencies.resolve().parent != root:
        raise RuntimeError('invalid_private_tools_cache')
    sys.path.insert(0, str(dependencies))
import yt_dlp
from yt_dlp.version import __version__
if __version__ != json.loads((root / 'cloud-downloader.lock.json').read_bytes())['version']:
    raise RuntimeError('downloader_version_not_ready')
yt_dlp.main()
