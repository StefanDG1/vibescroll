"""Synthetic parser and fallback boundaries. No network or media execution."""
import importlib.util
import json
from pathlib import Path
import tempfile
import shutil
import subprocess
import wave
import unittest
from unittest.mock import patch
from types import SimpleNamespace

spec = importlib.util.spec_from_file_location('x_post_worker', Path(__file__).resolve().parents[1] / 'packages/media/x-post-worker.py')
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)
POST = '1234567890123456789'


class SelectedPost(unittest.TestCase):
    def gallery(self, count=0):
        meta = {'tweet_id': int(POST), 'content': 'Complete long text 🐦' * 100, 'count': count, 'author': {'name': 'Author'}}
        return [[2, meta]] + [[3, 'https://pbs.twimg.com/media/image.png', dict(meta, type='photo')] for _ in range(count)]

    def test_full_text_and_every_attachment(self):
        for count in (0, 1, 4):
            post = worker.gallery_result(self.gallery(count), POST)
            self.assertEqual(len(post['assets']), count)
            self.assertEqual(post['text'], 'Complete long text 🐦' * 100)
        with self.assertRaisesRegex(ValueError, 'identity'):
            worker.gallery_result(self.gallery(), '123')
        bad = self.gallery(1); bad.pop()
        with self.assertRaisesRegex(ValueError, 'incomplete'):
            worker.gallery_result(bad, POST)

    def test_fallback_preserves_order_and_highest_mp4(self):
        media = {'all': [{'type': 'photo', 'url': 'https://pbs.twimg.com/media/1.png'},
                         {'type': 'video', 'formats': [{'container': 'mp4', 'bitrate': 1, 'url': 'https://video.twimg.com/low.mp4'},
                                                       {'container': 'mp4', 'bitrate': 2, 'url': 'https://video.twimg.com/high.mp4'}]}], 'photos': [{}], 'videos': [{}]}
        data = {'code': 200, 'status': {'id': POST, 'text': 'Entire caption', 'media': media}}
        post = worker.fx_result(data, POST)
        self.assertEqual([a['kind'] for a in post['assets']], ['image', 'video'])
        self.assertTrue(post['assets'][1]['url'].endswith('/high.mp4'))
        media['all'].pop()
        with self.assertRaisesRegex(ValueError, 'incomplete'):
            worker.fx_result(data, POST)

    def test_only_transport_or_parser_failure_uses_fallback(self):
        cases = [(1, b'connection timed out', b'', True), (1, b'HTTP 503 Service Unavailable', b'', True), (0, b'', b'invalid json', True),
                 (1, b'HTTP 429 Too Many Requests', b'', False), (1, b'HTTP 403', b'', False),
                 (1, b'private post', b'', False), (0, b'', json.dumps(self.gallery()).encode(), False)]
        fallback = json.dumps({'code': 200, 'status': {'id': POST, 'text': 'Full caption', 'media': {'all': [], 'photos': [], 'videos': []}}}).encode()
        for code, stderr, stdout, used in cases:
            with self.subTest(code=code, stderr=stderr), tempfile.TemporaryDirectory() as tmp, patch.object(worker, 'ROOT', Path(tmp)), \
                 patch.object(worker.subprocess, 'run', return_value=SimpleNamespace(returncode=code, stderr=stderr, stdout=stdout)), \
                 patch.object(worker, 'get', return_value=(fallback, 'application/json', len(fallback))) as get:
                (Path(tmp) / 'request.json').write_text(json.dumps({'url': f'https://x.com/i/web/status/{POST}'}))
                if code and not used:
                    with self.assertRaises(ValueError): worker.inspect()
                else:
                    worker.inspect()
                self.assertEqual(get.called, used)

    @unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'), 'project decoder tools unavailable')
    def test_decodes_every_owned_attachment_and_preserves_separate_video_times(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(worker, 'ROOT', Path(tmp)):
            root = Path(tmp)
            def run(args):
                subprocess.run(['ffmpeg', '-nostdin', '-v', 'error'] + args, check=True, capture_output=True)
            run(['-f', 'lavfi', '-i', 'color=c=blue:s=160x240', '-frames:v', '1', '-c:v', 'mjpeg', '-f', 'image2', str(root / 'asset-1.input')])
            with wave.open(str(root / 'silent.wav'), 'wb') as stream:
                stream.setnchannels(1); stream.setsampwidth(2); stream.setframerate(16000)
                stream.writeframes(bytes(16000 * 2 * 2))
            for index in (2, 3):
                audio = ['-i', str(root / 'silent.wav')] if index == 2 else ['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=16000']
                run(['-f', 'lavfi', '-i', 'color=c=green:s=160x240:r=10:d=2'] + audio + [
                     '-t', '2', '-c:v', 'mpeg4', '-c:a', 'aac', '-f', 'mp4', str(root / f'asset-{index}.input')])
            assets = []
            for index in range(1, 4):
                data = (root / f'asset-{index}.input').read_bytes()
                assets.append({'kind': 'image' if index == 1 else 'video', 'mime': 'image/jpeg' if index == 1 else 'video/mp4',
                               'bytes': len(data), 'contentHash': worker.digest(data), 'animated': False})
            worker.write_json('request.json', {'maximumDurationMs': 6000})
            worker.write_json('x-acquired.json', {'postId': POST, 'canonical': f'https://x.com/i/web/status/{POST}',
                                               'provider': 'gallery-dl', 'text': 'Full caption', 'assets': assets})
            worker.decode()
            result = worker.read_json('x-result.json')
            self.assertEqual(len(result['post']['assets']), 3)
            self.assertEqual(len(result['frames']), 17)
            self.assertEqual({f['assetId'] for f in result['frames']}, {'asset-1', 'asset-2', 'asset-3'})
            self.assertEqual([a['assetId'] for a in result['audios']], ['asset-3'])
            self.assertEqual(result['post']['assets'][1]['audioStatus'], 'silent')
            for frame in result['frames']:
                self.assertTrue((root / frame['id']).read_bytes().startswith(b'\xff\xd8\xff'))
                self.assertLess(frame['timestampMs'], 2000)


if __name__ == '__main__':
    unittest.main()
