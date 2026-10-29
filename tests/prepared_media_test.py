"""Run the actual bounded decoder on owned synthetic media, without platform/API requests."""
import ast
import hashlib
import json
import math
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
import wave

MEDIA = Path(__file__).parents[1] / 'packages/media'
sys.path.insert(0, str(MEDIA))


def decoder(root):
    module = ast.parse((MEDIA / 'decode-prepared.py').read_text(encoding='utf-8'))
    functions = [node for node in module.body if isinstance(node, ast.FunctionDef)]
    scope = {'ROOT': root, 'pathlib': __import__('pathlib'), 'hashlib': hashlib,
             'json': json, 'math': math, 'subprocess': subprocess, 'sys': sys}
    exec(compile(ast.Module(body=functions, type_ignores=[]), 'decode-prepared.py', 'exec'), scope)
    return scope['prepare']


@unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'), 'project decoder tools unavailable')
class PreparedMediaTests(unittest.TestCase):
    def test_actual_source_frames_pcm_and_native_caption_reuse(self):
        for captions in (False, True):
            with self.subTest(captions=captions), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-f', 'lavfi', '-i',
                                'color=c=green:s=160x240:r=10:d=3', '-f', 'lavfi', '-i',
                                'sine=frequency=440:duration=3', '-c:v', 'mpeg4', '-c:a', 'aac',
                                '-shortest', '-f', 'mp4', str(root / 'input')], check=True, capture_output=True)
                source = (root / 'input').read_bytes()
                if captions:
                    (root / 'caption.srt').write_text('1\n00:00:00,000 --> 00:00:01,000\nSynthetic speech.\n', encoding='utf-8')
                    (root / 'captions.json').write_text(json.dumps([{'file': 'caption.srt', 'candidate': {
                        'origin': 'platform_unknown', 'language': 'en', 'translated': False, 'format': 'srt'}}]))
                decoder(root)()
                manifest = json.loads((root / 'manifest.json').read_text())
                self.assertEqual(len(manifest['frames']), 8)
                self.assertEqual(len({f['timestampMs'] for f in manifest['frames']}), 8)
                for frame in manifest['frames']:
                    image = (root / frame['id']).read_bytes()
                    self.assertTrue(image.startswith(b'\xff\xd8\xff'))
                    self.assertLessEqual(len(image), 150000)
                    self.assertLess(frame['timestampMs'], manifest['durationSeconds'] * 1000)
                receipt = json.loads((root / 'source-receipt.json').read_text())
                self.assertEqual(receipt['sourceBytes'], len(source))
                self.assertEqual(receipt['sourceHash'], hashlib.sha256(json.dumps([
                    hashlib.sha256(source).hexdigest()], separators=(',', ':')).encode()).hexdigest())
                if captions:
                    self.assertNotIn('audio', manifest)
                    self.assertFalse((root / 'audio.wav').exists())
                    self.assertEqual(json.loads((root / 'transcript.json').read_text())['segments'][0]['text'], 'Synthetic speech.')
                else:
                    self.assertEqual(manifest['audio'], 'audio.wav')
                    self.assertTrue((root / 'audio.wav').read_bytes().startswith(b'RIFF'))
                    with wave.open(str(root / 'audio.wav'), 'rb') as pcm:
                        self.assertEqual((pcm.getnchannels(), pcm.getsampwidth(), pcm.getframerate()), (1, 2, 16000))
                        # AAC padding can decode beyond the MP4's media timeline.
                        self.assertLessEqual(pcm.getnframes(), math.ceil(manifest['durationSeconds'] * 16000) + 1)

    def test_missing_media_is_rejected_without_a_manifest(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with self.assertRaises(AssertionError):
                decoder(root)()
            self.assertFalse((root / 'manifest.json').exists())

    def test_actual_duration_is_checked_before_pcm_frames_or_caption_processing(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-f', 'lavfi', '-i',
                            'color=c=green:s=160x240:r=10:d=3', '-c:v', 'mpeg4',
                            '-f', 'mp4', str(root / 'input')], check=True, capture_output=True)
            (root / 'request.json').write_text(json.dumps({'maximumDurationMs': 2000}))
            with self.assertRaisesRegex(AssertionError, 'reviewed_duration_exceeded'):
                decoder(root)()
            self.assertFalse((root / 'manifest.json').exists())
            self.assertFalse((root / 'audio.wav').exists())
            self.assertEqual(list(root.glob('frame-*.jpg')), [])


if __name__ == '__main__':
    unittest.main()
