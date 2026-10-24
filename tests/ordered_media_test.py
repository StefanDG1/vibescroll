"""Synthetic byte decoding only. These tests do not establish VM isolation."""
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
import wave
from unittest.mock import patch

from PIL import Image

spec = importlib.util.spec_from_file_location("ordered_decoder", Path(__file__).resolve().parents[1] / "packages/media/decode-ordered.py")
decoder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(decoder)


class OrderedMediaTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)

    def manifest(self, assets):
        (self.root / "ordered-input.json").write_text(json.dumps({"schemaVersion": "ordered-input-v1", "assets": assets}), encoding="utf-8")

    def image(self, index, size=(100, 60)):
        Image.new("RGB", size, "blue").save(self.root / f"input-{index:03}", "PNG")
        return {"id": f"child{index}", "index": index, "kind": "image", "file": f"input-{index:03}"}

    def test_real_image_order_bytes_and_untimed_representation(self):
        self.manifest([self.image(0), self.image(2)])
        result = decoder.decode_ordered(self.root)
        self.assertEqual([a["index"] for a in result["assets"]], [0, 2])
        for asset in result["assets"]:
            representation = asset["representations"][0]
            self.assertNotIn("timestampMs", representation)
            self.assertNotIn("durationMs", asset)
            self.assertNotIn("inspected", asset)
            self.assertEqual(asset["contentHash"], hashlib.sha256((self.root / f'input-{asset["index"]:03}').read_bytes()).hexdigest())
            self.assertEqual(representation["sha256"], hashlib.sha256((self.root / representation["file"]).read_bytes()).hexdigest())
            with Image.open(self.root / representation["file"]) as image:
                self.assertEqual(image.format, "JPEG")
                self.assertEqual(image.size, (100, 60))
                self.assertFalse(image.getexif())

    def test_corrupt_child_stays_an_explicit_omission(self):
        good = self.image(0)
        (self.root / "input-001").write_bytes(b"this is not an image")
        self.manifest([good, {"id": "bad", "index": 1, "kind": "image", "file": "input-001"}])
        result = decoder.decode_ordered(self.root)
        self.assertEqual(result["omitted"], [{"id": "bad", "index": 1, "reason": "decode_unavailable"}])
        self.assertEqual(len(result["assets"]), 1)

    def test_path_and_duplicate_child_identity_are_rejected_before_decoding(self):
        asset = self.image(0)
        self.manifest([{**asset, "file": "../input-000"}])
        with self.assertRaisesRegex(ValueError, "PATH"):
            decoder.decode_ordered(self.root)
        self.manifest([asset, {**self.image(1), "id": asset["id"]}])
        with self.assertRaisesRegex(ValueError, "IDENTITY"):
            decoder.decode_ordered(self.root)
        self.assertFalse(list(self.root.glob("asset-*.jpg")))

    def test_over_dimension_image_is_not_accepted_as_inspected(self):
        self.manifest([self.image(0, (4100, 1))])
        with self.assertRaisesRegex(ValueError, "UNAVAILABLE"):
            decoder.decode_ordered(self.root)

    def test_existing_representation_is_never_overwritten(self):
        self.manifest([self.image(0)])
        target = self.root / "asset-000-image.jpg"
        target.write_bytes(b"original output")
        with self.assertRaisesRegex(ValueError, "UNAVAILABLE"):
            decoder.decode_ordered(self.root)
        self.assertEqual(target.read_bytes(), b"original output")

    def test_container_groups_do_not_mislabel_quicktime_or_matroska_as_mp4_or_webm(self):
        target = self.root / "header"
        for raw in [b"\x00\x00\x00\x14ftypqt  \x00\x00\x00\x00qt  ", b"\x1a\x45\xdf\xa3\x8b\x42\x82\x88matroska", b"\x1a\x45\xdf\xa3\xff"]:
            target.write_bytes(raw)
            with self.assertRaisesRegex(ValueError, "CONTAINER"):
                decoder.video_mime(target)
        target.write_bytes(b"\x1a\x45\xdf\xa3\x87\x42\x82\x84webm")
        self.assertEqual(decoder.video_mime(target), "video/webm")

    def test_multiple_audio_tracks_are_explicitly_unavailable_instead_of_silently_selecting_one(self):
        target = self.root / "input-000"
        target.write_bytes(b"\x00\x00\x00\x14ftypisom\x00\x00\x00\x00isom")
        probe = {"streams": [{"codec_type": "video"}, {"codec_type": "audio"}, {"codec_type": "audio"}], "format": {"format_name": "mov,mp4"}}
        with patch.object(decoder, "run", return_value=json.dumps(probe).encode()) as command:
            with self.assertRaisesRegex(ValueError, "FORMAT_UNSUPPORTED"):
                decoder.video_asset(target, self.root, 0, 4, 600000)
            self.assertEqual(command.call_count, 1)
        self.assertFalse(list(self.root.glob("asset-*")))

    @unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "Local FFmpeg/FFprobe unavailable; actual audio decoding pending")
    def test_actual_video_audio_is_normalized_to_bound_pcm_with_its_own_hash(self):
        video = self.root / "audio-fixture.mp4"
        subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-f", "lavfi", "-i", "color=c=red:s=32x24:d=1", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-c:v", "mpeg4", "-c:a", "aac", "-shortest", str(video)], check=True, timeout=15)
        video.rename(self.root / "input-000")
        self.manifest([{"id": "video", "index": 0, "kind": "video", "file": "input-000"}])
        result = decoder.decode_ordered(self.root)
        audio = result["assets"][0]["audio"]
        with wave.open(str(self.root / audio["file"]), "rb") as pcm:
            self.assertEqual((pcm.getnchannels(), pcm.getsampwidth(), pcm.getframerate()), (1, 2, 16000))
            self.assertLessEqual(pcm.getnframes(), 16000)
            self.assertGreater(pcm.getnframes(), 15000)
        self.assertEqual(audio["sha256"], hashlib.sha256((self.root / audio["file"]).read_bytes()).hexdigest())

    @unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "Local FFmpeg/FFprobe unavailable; real mixed-video decoding pending")
    def test_mixed_image_video_preserves_child_coordinates_and_actual_video_times(self):
        image = self.image(0)
        video = self.root / "fixture.mp4"
        subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-f", "lavfi", "-i", "color=c=red:s=32x24:d=1", "-c:v", "mpeg4", str(video)], check=True, timeout=15)
        video.rename(self.root / "input-002")
        self.manifest([image, {"id": "video2", "index": 2, "kind": "video", "file": "input-002"}])
        result = decoder.decode_ordered(self.root)
        self.assertEqual([a["kind"] for a in result["assets"]], ["image", "video"])
        self.assertLessEqual(result["videoDurationMs"], 1100)
        for representation in result["assets"][1]["representations"]:
            self.assertGreaterEqual(representation["timestampMs"], 0)
            self.assertLess(representation["timestampMs"], result["assets"][1]["durationMs"])


if __name__ == "__main__":
    unittest.main()
