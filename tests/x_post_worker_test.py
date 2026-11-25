"""Synthetic parser and fallback boundaries. No network or media execution."""
import importlib.util
import json
from pathlib import Path
import tempfile
import shutil
import subprocess
import sys
from io import BytesIO
import wave
import unittest
from unittest.mock import Mock, patch
from types import SimpleNamespace

spec = importlib.util.spec_from_file_location('x_post_worker', Path(__file__).resolve().parents[1] / 'packages/media/x-post-worker.py')
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)
POST = '1234567890123456789'
social_spec = importlib.util.spec_from_file_location(
    'social_public_post', Path(__file__).resolve().parents[1] / 'packages/media/social-public-post.py')
social = importlib.util.module_from_spec(social_spec)
social_spec.loader.exec_module(social)


class OrderedPublicPost(unittest.TestCase):
    url = 'https://www.instagram.com/p/ABCdef1/'
    embed_url = url + 'embed/captioned/'

    @staticmethod
    def instagram_embed(item, **context_overrides):
        context = {'shortcode': item['shortcode'], 'type': item['__typename'], 'copyright_blocked': False}
        context.update(context_overrides)
        init = {'isSidecar': item['__typename'] == 'GraphSidecar',
                'contextJSON': json.dumps({'context': context, 'gql_data': {'shortcode_media': item}})}
        block = {'require': [['PolarisEmbedSimple', 'init', [], [init]]]}
        return ('<script>requireLazy(["TimeSliceImpl","ServerJS"],function(TimeSlice,ServerJS){'
                'var s=(new ServerJS());s.handle(' + json.dumps(block) + ');});</script>')

    @staticmethod
    def instagram_post(two=True):
        image = {'id': '801', 'is_video': False,
                 'display_url': 'https://a.cdninstagram.com/photo.jpg'}
        item = dict(image, shortcode='ABCdef1', __typename='GraphImage',
                    owner={'id': '12345', 'username': 'author'},
                    edge_media_to_caption={'edges': [{'node': {'text': 'Full caption 🌊'}}]})
        if two:
            video = {'id': '802', 'is_video': True, 'display_url': 'https://a.cdninstagram.com/cover.jpg',
                     'video_url': 'https://a.cdninstagram.com/clip.mp4'}
            item.update(__typename='GraphSidecar',
                        edge_sidecar_to_children={'count': 2, 'edges': [{'node': image}, {'node': video}]})
        return item

    def parse_tiktok(self, item, count, suffix=None):
        item['imagePost'] = {
            'imageCount': count,
            'images': [
                {'imageURL': {'urlList': [f'https://a.tiktokcdn.com/{index}.jpg']}}
                for index in (2, 1)
            ],
        }
        scripts = {'__DEFAULT_SCOPE__': {'webapp.video-detail': {
            'statusCode': 0, 'itemInfo': {'itemStruct': item},
        }}}
        return social.parse_post(
            'https://vm.tiktok.com/ABCdef123/',
            f'https://www.tiktok.com/{suffix or f"@author/video/{POST}"}',
            '<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">' + json.dumps(scripts) + '</script>',
        )

    def test_typed_short_link_preserves_photo_order_and_rejects_missing_slides(self):
        item = {'id': POST, 'author': {'id': '54321', 'uniqueId': 'Author'},
                'desc': 'Whole caption with emoji 🌊', 'createTime': 1700000000,
                'video': {'playAddr': 'https://a.tiktokcdn.com/cover-video.mp4'}}
        post = self.parse_tiktok(item, 2)
        self.assertEqual(post['provider'], 'public_page')
        self.assertEqual(post['canonical'], f'https://www.tiktok.com/@author/photo/{POST}')
        self.assertEqual(post['authorId'], '54321')
        self.assertEqual(post['text'], item['desc'])
        self.assertEqual([asset['url'].rsplit('/', 1)[1] for asset in post['assets']], ['2.jpg', '1.jpg'])
        bare = self.parse_tiktok(item, 2, f'@/photo/{POST}')
        self.assertEqual(bare['canonical'], post['canonical'])
        self.assertEqual(bare['authorId'], post['authorId'])
        with self.assertRaisesRegex(ValueError, 'incomplete_post_manifest'):
            self.parse_tiktok(item, 3)
        item['author']['uniqueId'] = 'another'
        with self.assertRaisesRegex(ValueError, 'post_author_mismatch'):
            self.parse_tiktok(item, 2)

    def test_tiktok_accepts_same_id_alias_redirect_once_without_looping(self):
        photo = f'https://www.tiktok.com/@author/photo/{POST}'
        alias = photo.replace('/photo/', '/video/')
        redirect = social.urllib.error.HTTPError(alias, 302, 'Redirect',
                                                 {'Location': photo}, None)
        body = BytesIO(b'<html>post</html>')
        body.status = 200
        body.headers = SimpleNamespace(get_content_type=lambda: 'text/html')
        opener = SimpleNamespace(open=Mock(side_effect=[redirect, body]))
        with patch.object(social.urllib.request, 'build_opener', return_value=opener):
            self.assertEqual(social.read_page(photo, 'test-proxy'), (photo, '<html>post</html>'))
        self.assertEqual([c.args[0].full_url for c in opener.open.call_args_list], [alias, photo])

    def test_tiktok_short_redirect_can_omit_profile_but_must_prove_photo_type(self):
        short = 'https://vm.tiktok.com/ABCdef123/'
        bare_photo = f'https://www.tiktok.com/@/photo/{POST}'
        alias = bare_photo.replace('/photo/', '/video/')
        item = {'id': POST, 'author': {'id': '12345', 'uniqueId': 'fixture'},
                'desc': 'Photo redirect must not accept this video', 'createTime': 1700000000,
                'video': {'playAddr': 'https://a.tiktokcdn.com/clip.mp4'}}
        data = {'__DEFAULT_SCOPE__': {'webapp.video-detail': {
            'statusCode': 0, 'itemInfo': {'itemStruct': item},
        }}}
        html = '<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">' + json.dumps(data) + '</script>'
        redirect = social.urllib.error.HTTPError(short, 302, 'Redirect', {'Location': bare_photo}, None)
        body = BytesIO(html.encode())
        body.status = 200
        body.headers = SimpleNamespace(get_content_type=lambda: 'text/html')
        opener = SimpleNamespace(open=Mock(side_effect=[redirect, body]))
        with patch.object(social.urllib.request, 'build_opener', return_value=opener):
            with self.assertRaisesRegex(ValueError, 'incomplete_photo_manifest'):
                social.acquire_post(short, 'test-proxy')
        self.assertEqual([c.args[0].full_url for c in opener.open.call_args_list], [short, alias])
        with self.assertRaisesRegex(ValueError, 'unsupported_post_reference'):
            social.reference(bare_photo)

    def test_instagram_metadata_or_preview_cannot_replace_a_missing_carousel(self):
        url = 'https://www.instagram.com/p/ABCdef1/'
        html = '<meta property="og:image" content="https://a.cdninstagram.com/preview.jpg">'
        with self.assertRaisesRegex(ValueError, 'post_manifest_unavailable'):
            social.parse_post(url, url, html)

    def test_public_instagram_embed_reads_exact_caption_and_every_ordered_child(self):
        for mixed in (False, True):
            item = self.instagram_post(mixed)
            result = social.parse_post(self.url, self.embed_url, self.instagram_embed(item), embed=True)
            self.assertEqual(result['canonical'], self.url)
            self.assertEqual(result['provider'], 'instagram_embed')
            self.assertEqual(result['text'], 'Full caption 🌊')
            self.assertEqual(result['authorId'], '12345')
            self.assertIsNone(result['publishedAt'])
            self.assertEqual([a['kind'] for a in result['assets']], ['image', 'video'] if mixed else ['image'])
            if mixed:
                self.assertTrue(result['assets'][1]['url'].endswith('/clip.mp4'))

    def test_captioned_single_photo_proves_identity_and_omits_embed_comments(self):
        profile = 'https://www.instagram.com/example/'
        fixture = f'''<div class="Embed" data-media-type="GraphImage" data-media-id="801"
                       data-owner-id="12345" data-permalink="{self.url}">
          <a class="Username" href="{profile}">example</a>
          <a class="EmbeddedMedia" href="{self.url}">
            <img class="EmbeddedMediaImage" src="https://a.cdninstagram.com/photo.jpg">
          </a>
          <div class="Caption"><a class="CaptionUsername" href="{profile}">example</a>
          Line one<br>Line <a href="https://www.instagram.com/explore/">two</a>.
          <div class="CaptionComments"><span>Exclude this.</span></div></div>
        </div>'''
        result = social.parse_post(self.url, self.embed_url, fixture, embed=True)
        self.assertEqual(result['authorId'], '12345')
        self.assertEqual(result['text'], 'Line one\nLine two.')
        self.assertEqual(result['expectedAssetCount'], 1)
        with self.assertRaisesRegex(ValueError, 'post_manifest_unavailable'):
            social.parse_post(self.url, self.embed_url, fixture.replace('GraphImage', 'GraphSidecar'), embed=True)
        with self.assertRaisesRegex(ValueError, 'post_author_mismatch'):
            social.parse_post(self.url, self.embed_url, fixture.replace(
                f'CaptionUsername" href="{profile}', 'CaptionUsername" href="https://www.instagram.com/elsewhere/'), embed=True)

    def test_embed_rejects_wrong_identity_disabled_carousel_and_cover_only_video(self):
        item = self.instagram_post()
        for context, error in [({'shortcode': 'another'}, 'post_identity_mismatch'),
                               ({'copyright_blocked': True}, 'post_unavailable')]:
            with self.assertRaisesRegex(ValueError, error):
                social.parse_post(self.url, self.embed_url, self.instagram_embed(item, **context), embed=True)
        edges = item['edge_sidecar_to_children']['edges']
        edges[1]['node'].pop('video_url')
        with self.assertRaisesRegex(ValueError, 'attachment_media_unavailable'):
            social.parse_post(self.url, self.embed_url, self.instagram_embed(item), embed=True)
        edges.pop()
        with self.assertRaisesRegex(ValueError, 'incomplete_carousel_manifest'):
            social.parse_post(self.url, self.embed_url, self.instagram_embed(item), embed=True)

    @unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'), 'project decoder tools unavailable')
    def test_normal_worker_keeps_embed_identity_through_inspection_download_and_decode(self):
        item = self.instagram_post(False)
        with tempfile.TemporaryDirectory() as tmp, patch.object(worker, 'ROOT', Path(tmp)), \
             patch.dict(sys.modules, {'social_public_post': social}), \
             patch.object(worker, 'acquisition_proxy', return_value='test-proxy'), \
             patch.object(social, 'read_page', return_value=(self.embed_url, self.instagram_embed(item))) as read:
            sample = Path(tmp) / 'fixture.jpg'
            subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=160x240',
                            '-frames:v', '1', '-c:v', 'mjpeg', '-f', 'image2', str(sample)], check=True)
            data = sample.read_bytes()
            def fake_get(url, maximum, path):
                self.assertEqual(url, item['display_url'])
                self.assertLessEqual(len(data), maximum)
                path.write_bytes(data)
                return None, 'image/jpeg', len(data)
            worker.write_json('request.json', {'url': self.url, 'platform': 'instagram',
                                              'instagramEmbed': True, 'maximumDurationMs': 6000})
            worker.inspect()
            read.assert_called_once_with(self.embed_url, 'test-proxy', embed=True)
            self.assertNotIn('publishedAt', worker.read_json('metadata.json'))
            with patch.object(worker, 'get', side_effect=fake_get):
                worker.download()
            worker.decode()
            result = worker.read_json('x-result.json')
            self.assertEqual(result['post']['provider'], 'instagram_embed')
            self.assertIsNone(result['post']['publishedAt'])
            self.assertEqual(len(result['frames']), 1)


class SelectedPost(unittest.TestCase):
    def setUp(self):
        environment = patch.dict(worker.os.environ, {'VIBE_DOWNLOAD_PROXY': 'http://127.0.0.1:47891'})
        environment.start()
        self.addCleanup(environment.stop)

    def test_acquisition_requires_the_exact_broker_for_both_providers(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(worker, 'ROOT', Path(tmp)), \
             patch.object(worker.subprocess, 'run', return_value=SimpleNamespace(returncode=0, stderr=b'', stdout=json.dumps(self.gallery()).encode())) as run:
            worker.write_json('request.json', {'url': f'https://x.com/i/web/status/{POST}'})
            worker.inspect()
            command = run.call_args.args[0]
            self.assertEqual(command[command.index('--proxy') + 1], 'http://127.0.0.1:47891')
        with patch.object(worker.urllib.request, 'build_opener', side_effect=RuntimeError('synthetic_stop_before_network')) as opener:
            with self.assertRaisesRegex(RuntimeError, 'synthetic_stop_before_network'):
                worker.get(f'https://api.fxtwitter.com/2/status/{POST}', 1000)
            self.assertEqual(opener.call_args.args[0].proxies, {'https': 'http://127.0.0.1:47891'})
        for invalid in ['', 'http://example.test:47891']:
            with patch.dict(worker.os.environ, {'VIBE_DOWNLOAD_PROXY': invalid}):
                with self.assertRaisesRegex(ValueError, 'acquisition_proxy_required'):
                    worker.get(f'https://api.fxtwitter.com/2/status/{POST}', 1000)

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
            try:
                worker.decode()
            except subprocess.CalledProcessError as error:
                self.fail(error.stderr.decode('utf-8', errors='replace'))
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
