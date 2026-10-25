"""Actual parser and resolved downloader tests. No platform or ASR requests."""
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import subprocess
import sys
import threading
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import unittest
import zipfile
from unittest.mock import Mock

spec = importlib.util.spec_from_file_location('cloud_extraction', Path(__file__).parents[1] / 'packages/media/cloud_extraction.py')
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)
URL = 'https://www.instagram.com/reel/Synthetic123/'
SRT = '1\n00:00:00,000 --> 00:00:01,000\nCheck the source.\n\n2\n00:00:00,800 --> 00:00:02,000\nThen check again.\n'


class CaptionTests(unittest.TestCase):
    def info(self, **extra):
        return {'webpage_url': URL, 'language': 'en', 'duration': 3, 'subtitles': {'en': [{'ext': 'srt', 'data': SRT}]}, **extra}

    def test_inline_automatic_or_unknown_captions_never_start_asr(self):
        for bucket in ('subtitles', 'automatic_captions'):
            info = self.info(subtitles={}, **({bucket: {'en': [{'ext': 'srt', 'data': SRT}]}} if bucket != 'subtitles' else {})) if bucket != 'subtitles' else self.info()
            transcribe = Mock(side_effect=AssertionError('ASR_MUST_NOT_START'))
            result = worker.choose_transcript(info, 3000, lambda c: c['track']['data'].encode(), transcribe)
            self.assertFalse(result['transcript']['asrUsed'])
            self.assertEqual(result['transcript']['origin'], 'platform_unknown' if bucket == 'subtitles' else 'platform_auto')
            self.assertEqual([s['text'] for s in result['segments']], ['Check the source.', 'Then check again.'])
            self.assertEqual(result['segments'][1]['startMs'], 800)
            transcribe.assert_not_called()

    def test_vtt_unicode_and_meaningful_repetition_survive(self):
        data = 'WEBVTT\n\n00:00.000 --> 00:01.000\nAgain, again. Café\n\n00:01.000 --> 00:02.000\nAgain, again. Café\n'
        candidate = {'origin': 'platform_unknown', 'language': 'fr', 'translated': None, 'format': 'vtt'}
        parsed = worker.parse_captions(data.encode(), candidate, 3000)
        self.assertEqual(len(parsed['segments']), 2)
        self.assertEqual(parsed['segments'][0]['text'], 'Again, again. Café')
        self.assertIsNone(parsed['transcript']['translated'])

    def test_invalid_or_empty_tracks_fall_back_once_with_a_reason(self):
        for data in ('', 'not a subtitle', SRT.replace('00:00:02,000', '00:01:02,000')):
            info = self.info(subtitles={'en': [{'ext': 'srt', 'data': data}]})
            transcribe = Mock(return_value={'segments': [], 'transcript': {'origin': 'none', 'asrUsed': False}})
            result = worker.choose_transcript(info, 3000, lambda c: c['track']['data'].encode(), transcribe)
            transcribe.assert_called_once_with()
            self.assertTrue(result['fallbackReasons'])

    def test_never_silently_truncates_dense_captions(self):
        data = '\n\n'.join(f'{i+1}\n00:00:00,000 --> 00:00:01,000\nCue {i}' for i in range(201))
        candidate = {'origin': 'platform_unknown', 'language': 'en', 'translated': False, 'format': 'srt'}
        with self.assertRaisesRegex(ValueError, 'over_limit'):
            worker.parse_captions(data.encode(), candidate, 3000)

    def test_original_language_precedes_translation(self):
        info = self.info(automatic_captions={'fr': [{'ext': 'vtt', 'url': 'https://example.test/track?tlang=fr'}]})
        candidates = worker.caption_candidates(info)
        self.assertEqual(candidates[0]['language'], 'en')
        self.assertFalse(candidates[0]['translated'])
        self.assertTrue(candidates[1]['translated'])

    def test_scope_and_post_identity_are_checked(self):
        from yt_dlp.extractor.tiktok import TikTokVMIE
        for url in ('https://vm.tiktok.com/Abcdef123/', 'https://vt.tiktok.com/Abcdef123/', 'https://www.tiktok.com/t/Abcdef123/'):
            self.assertTrue(TikTokVMIE.suitable(url))
            self.assertEqual(worker.validate_identity(url, {'webpage_url': 'https://www.tiktok.com/@creator/video/1234567890123456789'}), 'tiktok')
        for info in (self.info(webpage_url='https://www.instagram.com/reel/Different12/'), self.info(_type='playlist'), self.info(is_live=True)):
            with self.assertRaises(ValueError):
                worker.validate_identity(URL, info)
        self.assertEqual(worker.validate_identity('https://vm.tiktok.com/Abcdef123/', {'webpage_url': 'https://www.tiktok.com/@creator/video/1234567890123456789'}), 'tiktok')

    def test_resolved_download_reuses_metadata_and_muxed_audio(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            info = self.info(formats=[{'format_id': 'muxed', 'vcodec': 'h264', 'acodec': 'aac', 'height': 720, 'ext': 'mp4'}])
            calls = []
            def run(args, timeout):
                calls.append(args)
                if '--dump-single-json' in args:
                    return json.dumps(info).encode()
                Path(args[args.index('--output') + 1]).write_bytes(b'owned clip bytes')
                return b''
            downloader = worker.ResolvedDownloader(root, str(root / 'yt-dlp'), run)
            downloader.inspect(URL)
            acquired = downloader.download()
            self.assertEqual(acquired['files'], ['input'])
            self.assertEqual(len(calls), 2)
            self.assertEqual(calls[0][-1], URL)
            self.assertNotIn(URL, calls[1])
            self.assertIn('--load-info-json', calls[1])
            self.assertIn('--abort-on-unavailable-fragments', calls[1])

    def test_untrusted_source_starts_no_process(self):
        with tempfile.TemporaryDirectory() as directory:
            run = Mock()
            downloader = worker.ResolvedDownloader(directory, str(Path(directory) / 'yt-dlp'), run)
            for url in ('file:///etc/passwd', 'https://127.0.0.1/video', 'https://www.instagram.com/'):
                with self.assertRaises(ValueError):
                    downloader.inspect(url)
            run.assert_not_called()

    def test_portrait_reels_are_selected_by_short_edge_instead_of_rejected_by_height(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            calls = []
            info = self.info(formats=[{'format_id': 'portrait', 'vcodec': 'h264', 'acodec': 'aac', 'width': 1080, 'height': 1920, 'ext': 'mp4'}])
            def run(args, timeout):
                calls.append(args)
                if '--dump-single-json' in args:
                    return json.dumps(info).encode()
                Path(args[args.index('--output') + 1]).write_bytes(b'portrait fixture')
                return b''
            downloader = worker.ResolvedDownloader(root, str(root / 'yt-dlp'), run)
            downloader.inspect(URL)
            self.assertEqual(downloader.download()['files'], ['input'])
            self.assertEqual(calls[-1][calls[-1].index('--format') + 1], 'portrait')


class OfflinePreparationTests(unittest.TestCase):
    def test_bootstrap_verifies_wheels_and_rejects_traversal_before_writing(self):
        spec = importlib.util.spec_from_file_location('bootstrap', Path(__file__).parents[1] / 'packages/media/prepare_cloud_dependencies.py')
        bootstrap = importlib.util.module_from_spec(spec); spec.loader.exec_module(bootstrap)
        def wheel(name):
            data = io.BytesIO()
            with zipfile.ZipFile(data, 'w') as archive:
                archive.writestr(name, 'owned fixture')
            return data.getvalue()
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / '_deps'
            data = wheel('package/__init__.py')
            with self.assertRaisesRegex(ValueError, 'hash_mismatch'):
                bootstrap.unpack_reviewed_wheels(target, [(data, 'a' * 64)])
            self.assertFalse(target.exists())
            bad = wheel('../outside.txt')
            with self.assertRaisesRegex(ValueError, 'invalid_pure_wheel'):
                bootstrap.unpack_reviewed_wheels(target, [(bad, worker.digest(bad))])
            self.assertFalse(target.exists())
            bootstrap.unpack_reviewed_wheels(target, [(data, worker.digest(data))])
            self.assertEqual((target / 'package/__init__.py').read_text(), 'owned fixture')

    def test_existing_pixel_repair_checks_the_source_before_running_ffmpeg(self):
        spec = importlib.util.spec_from_file_location('restore', Path(__file__).parents[1] / 'packages/media/restore_cloud_frames.py')
        restore = importlib.util.module_from_spec(spec); spec.loader.exec_module(restore)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'input').write_bytes(b'changed source')
            run = Mock()
            with self.assertRaisesRegex(ValueError, 'original_source_bytes_changed'):
                restore.restore_frames(root, {'post': {'schemaVersion': 'work-cloud-observed-media-v1', 'assets': [{'bytes': 14, 'contentHash': 'a' * 64}]}}, run=run)
            run.assert_not_called()

    def test_actual_pinned_cli_retrieves_media_and_subtitles_without_reextracting_the_page(self):
        from yt_dlp.version import __version__
        self.assertEqual(__version__, '2026.10.21')
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            served, job = root / 'served', root / 'job'
            served.mkdir(); job.mkdir()
            subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=160x90:r=10', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=16000', '-t', '2', '-c:v', 'mpeg4', '-c:a', 'aac', str(served / 'clip.mp4')], check=True, capture_output=True, timeout=20)
            (served / 'captions.srt').write_text(SRT, encoding='utf-8')
            requests = []
            class Handler(SimpleHTTPRequestHandler):
                def log_message(self, *args):
                    pass
                def do_GET(self):
                    requests.append(self.path)
                    super().do_GET()
            server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=served))
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                base = f'http://127.0.0.1:{server.server_port}'
                info = {'id': 'owned-fixture', 'title': 'Owned clip', 'webpage_url': URL, 'extractor': 'fixture', 'extractor_key': 'Fixture', 'duration': 2, 'language': 'en',
                        'formats': [{'format_id': 'fixture', 'url': base + '/clip.mp4', 'ext': 'mp4', 'vcodec': 'mpeg4', 'acodec': 'aac', 'width': 160, 'height': 90}],
                        'subtitles': {'en': [{'ext': 'srt', 'url': base + '/captions.srt'}]}}
                probes = []
                def run(args, timeout):
                    if '--dump-single-json' in args:
                        probes.append(args)
                        return json.dumps(info).encode()
                    return subprocess.run([sys.executable, '-m', 'yt_dlp', *args[1:]], check=True, capture_output=True, timeout=timeout).stdout
                downloader = worker.ResolvedDownloader(job, sys.executable, run)
                downloader.inspect(URL)
                resumed = worker.ResolvedDownloader.resume(job, sys.executable, run)
                resumed.download()
                track = resumed.retrieve_caption(worker.caption_candidates(info)[0])
                self.assertEqual(track, (served / 'captions.srt').read_bytes())
                self.assertEqual((job / 'input').read_bytes(), (served / 'clip.mp4').read_bytes())
                self.assertEqual(len(probes), 1)
                self.assertEqual(sorted(requests), ['/captions.srt', '/clip.mp4'])
            finally:
                server.shutdown(); server.server_close(); thread.join(timeout=2)

    def test_actual_decode_and_captions_need_no_asr_or_model_cache(self):
        spec = importlib.util.spec_from_file_location('cloud_prepare', Path(__file__).parents[1] / 'packages/media/cloud_prepare.py')
        preparation = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(preparation)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=160x90:r=10', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=16000', '-t', '2', '-c:v', 'mpeg4', '-c:a', 'aac', '-f', 'mp4', str(root / 'input')], check=True, capture_output=True, timeout=20)
            data = SRT.encode()
            (root / 'captions.srt').write_bytes(data)
            info = {'webpage_url': URL, 'language': 'en', 'subtitles': {'en': [{'ext': 'srt', 'data': SRT}]}}
            asr = Mock(side_effect=AssertionError('NO_ASR_OR_MODEL_CACHE'))
            manifest = preparation.prepare_files(root, info, [{'candidateId': worker.caption_candidates(info)[0]['id'], 'file': 'captions.srt', 'sha256': worker.digest(data), 'bucket': 'subtitles', 'language': 'en', 'format': 'srt'}], transcribe=asr)
            asr.assert_not_called()
            self.assertFalse((root / 'audio.wav').exists())
            self.assertFalse(manifest['transcript']['asrUsed'])
            self.assertIsNone(manifest['audio'])
            self.assertTrue(manifest['frames'])
            from PIL import Image
            for frame in manifest['frames']:
                path = root / (frame['id'] + '.jpg')
                self.assertEqual(worker.digest(path.read_bytes()), frame['sha256'])
                with Image.open(path) as image:
                    self.assertEqual(image.size, (frame['width'], frame['height']))
            context = {'schemaVersion': 'work-cloud-media-v3', 'canonicalUrl': URL, 'platform': 'instagram', 'inputHash': 'a' * 64, 'policyHash': 'b' * 64, 'toolchainHash': 'c' * 64, 'taskId': 'fixture', 'retainUntil': round(__import__('time').time() * 1000) + 3600000}
            with self.assertRaisesRegex(ValueError, 'observations_required'):
                preparation.bind_preparation(context, info, manifest, {})
            bound = preparation.bind_preparation(context, info, manifest, {manifest['frames'][0]['id']: 'A blue synthetic frame.'})
            post = dict(bound['post'])
            recorded = post.pop('revisionHash')
            self.assertEqual(recorded, worker.digest(preparation.canonical(post).encode()))
            self.assertEqual(bound['evidence'][0]['text'], 'Check the source.')
            self.assertEqual(bound['evidence'][-1]['basis'], 'visible')


if __name__ == '__main__':
    unittest.main()
