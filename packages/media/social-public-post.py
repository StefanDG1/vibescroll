"""Decode exactly one public post from the platform's own structured page."""
from html.parser import HTMLParser
import json
import re
import urllib.error
import urllib.request
from urllib.parse import urljoin, urlsplit


TIKTOK = {"tiktok.com", "www.tiktok.com", "vm.tiktok.com", "vt.tiktok.com"}
INSTAGRAM = {"instagram.com", "www.instagram.com"}
TT_FULL = r"/@([A-Za-z0-9_.]{1,40})/(video|photo)/([0-9]{10,25})/?"
TT_RESOLVED = r"/@([A-Za-z0-9_.]{0,40})/(video|photo)/([0-9]{10,25})/?"
TT_SHORT = r"/(?:t/)?[A-Za-z0-9]{5,30}/?"
IG_POST = r"/(?:p|reel|reels)/([A-Za-z0-9_-]{5,30})/?"
IG_EMBED = r"/p/([A-Za-z0-9_-]{5,30})/embed/(?:captioned/)?"
EMBED_WRAPPER = re.compile(
    r'^\s*requireLazy\(\["TimeSliceImpl","ServerJS"\],function'
    r'\(TimeSlice,ServerJS\)\{var s=\(new ServerJS\(\)\);s\.handle\('
)


class MissingEmbedManifest(ValueError):
    pass


def secure_url(raw, length=4096):
    if not isinstance(raw, str) or len(raw) > length or re.search(r"[\s\\\x00-\x1f]", raw):
        raise ValueError("invalid_post_url")
    url = urlsplit(raw)
    if url.scheme != "https" or url.username or url.password or url.port or url.fragment:
        raise ValueError("invalid_post_url")
    return url


def reference(raw, embed=False, resolved=False):
    url = secure_url(raw, 2048)
    if embed:
        if url.hostname in INSTAGRAM and (match := re.fullmatch(IG_EMBED, url.path)):
            return "instagram", match[1]
        raise ValueError("unsupported_post_embed")
    if url.hostname in INSTAGRAM and (match := re.fullmatch(IG_POST, url.path)):
        return "instagram", match[1]
    if url.hostname in TIKTOK:
        if match := re.fullmatch(TT_RESOLVED if resolved else TT_FULL, url.path):
            return "tiktok", match[3]
        if re.fullmatch(TT_SHORT, url.path) and (
            url.hostname in ("vm.tiktok.com", "vt.tiktok.com") or url.path.startswith("/t/")
        ):
            return "tiktok", None
    raise ValueError("unsupported_post_reference")


def media_url(raw, platform):
    url = secure_url(raw)
    suffixes = (".cdninstagram.com", ".fbcdn.net") if platform == "instagram" else (
        ".tiktokcdn.com", ".tiktokcdn-us.com", ".tiktokcdn-eu.com", ".byteoversea.com",
        ".ibytedtos.com", ".muscdn.com",
    )
    if not url.hostname or not url.hostname.endswith(suffixes):
        raise ValueError("unverified_attachment_host")
    return raw


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def read_page(raw, proxy, embed=False):
    platform, post_id = reference(raw, embed)
    opener = urllib.request.build_opener(
        urllib.request.ProxyHandler({"https": proxy}), NoRedirect
    )
    attempted = set()
    for _ in range(5):
        url = urlsplit(raw)
        if platform == "tiktok" and re.fullmatch(TT_RESOLVED, url.path) and "/photo/" in url.path:
            alias = url._replace(path=url.path.replace("/photo/", "/video/", 1)).geturl()
            if alias not in attempted:
                raw = alias
        if raw in attempted:
            raise ValueError("post_redirect_limit")
        attempted.add(raw)
        request = urllib.request.Request(raw, headers={
            "User-Agent": "Mozilla/5.0 (compatible; VibeScroll/1.0; selected-post reader)",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept-Encoding": "identity",
        })
        try:
            with opener.open(request, timeout=8) as response:
                maximum = 8 * 1024 * 1024
                if response.status != 200 or response.headers.get_content_type() != "text/html":
                    raise ValueError("post_unavailable")
                data = response.read(maximum + 1)
                if len(data) > maximum:
                    raise ValueError("post_page_over_limit")
                return url.geturl(), data.decode("utf-8", "strict")
        except urllib.error.HTTPError as error:
            with error:
                if error.code not in (301, 302, 303, 307, 308):
                    raise ValueError("post_unavailable") from error
                location = error.headers.get("Location")
            if not location:
                raise ValueError("post_redirect_invalid") from error
            target = urljoin(raw, location)
            target_platform, target_id = reference(target, embed, resolved=True)
            if target_platform != platform or (post_id and post_id != target_id):
                raise ValueError("post_identity_changed") from error
            post_id = target_id or post_id
            raw = target
    raise ValueError("post_redirect_limit")


class JsonScripts(HTMLParser):
    def __init__(self, embed=False):
        super().__init__(convert_charrefs=False)
        self.embed = embed
        self.parts = None
        self.values = []

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag == "script" and (self.embed or attributes.get("type") == "application/json" or
                                attributes.get("id") == "__UNIVERSAL_DATA_FOR_REHYDRATION__"):
            self.parts = []

    def handle_data(self, data):
        if self.parts is not None:
            self.parts.append(data)

    def handle_endtag(self, tag):
        if tag == "script" and self.parts is not None:
            try:
                script = "".join(self.parts)
                if self.embed:
                    match = EMBED_WRAPPER.match(script)
                    if match:
                        self.values.append(json.JSONDecoder().raw_decode(script, match.end())[0])
                else:
                    self.values.append(json.loads(script))
            except (ValueError, RecursionError):
                pass
            self.parts = None


def instagram_embed_manifest(values, post_id):
    candidates = []
    for block in values:
        if not isinstance(block, dict) or not isinstance(block.get("require"), list):
            continue
        for entry in block["require"]:
            if not isinstance(entry, list) or entry[:2] != ["PolarisEmbedSimple", "init"]:
                continue
            args = entry[3] if len(entry) > 3 else None
            if not isinstance(args, list) or len(args) != 1 or not isinstance(args[0], dict):
                raise ValueError("invalid_embed_manifest")
            arg = args[0]
            if arg.get("contextJSON") is None:
                continue
            data = json.loads(arg["contextJSON"])
            if not isinstance(data, dict):
                raise ValueError("invalid_embed_manifest")
            context = data.get("context")
            item = data.get("gql_data", {}).get("shortcode_media")
            if not isinstance(context, dict) or context.get("shortcode") != post_id:
                raise ValueError("post_identity_mismatch")
            if context.get("copyright_blocked") is not False:
                raise ValueError("post_unavailable")
            if not isinstance(item, dict):
                continue
            kind = item.get("__typename")
            if (item.get("shortcode") != post_id or context.get("type") != kind or
                    kind not in ("GraphImage", "GraphVideo", "GraphSidecar") or
                    arg.get("isSidecar") is not (kind == "GraphSidecar") or
                    ("edge_sidecar_to_children" in item) != (kind == "GraphSidecar") or
                    item.get("is_video") is not (kind == "GraphVideo")):
                raise ValueError("invalid_embed_manifest")
            candidates.append(item)
    if not candidates:
        raise MissingEmbedManifest("post_manifest_unavailable")
    if len(candidates) != 1:
        raise ValueError("unexpected_embed_collection")
    return candidates[0]


class InstagramEmbedPhoto(HTMLParser):
    void = frozenset("area base br col embed hr img input link meta param source track wbr".split())
    omitted_caption = frozenset(("CaptionUsername", "CaptionComments"))

    def __init__(self):
        super().__init__()
        self.stack = []
        self.fields = {}
        self.caption = []

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        classes = frozenset(attributes.get("class", "").split())
        parent = self.stack[-1][1] if self.stack else frozenset()
        scope = parent | classes
        if tag not in self.void:
            self.stack.append((tag, scope))
        if "Embed" not in scope:
            return
        for expected_tag, marker in (("div", "Embed"), ("a", "Username"), ("a", "EmbeddedMedia"),
                                     ("img", "EmbeddedMediaImage"), ("div", "Caption"),
                                     ("a", "CaptionUsername")):
            if tag == expected_tag and marker in classes and (
                marker != "EmbeddedMediaImage" or "EmbeddedMedia" in parent
            ):
                if marker in self.fields:
                    raise ValueError("unexpected_embed_collection")
                self.fields[marker] = attributes
        if tag == "br":
            self.caption_text("\n", scope)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in self.void:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, -1, -1):
            if self.stack[index][0] == tag:
                del self.stack[index:]
                break

    def handle_data(self, data):
        if self.stack:
            self.caption_text(data, self.stack[-1][1])

    def caption_text(self, data, scope):
        if {"Embed", "Caption"} <= scope and not self.omitted_caption.intersection(scope):
            self.caption.append(data)


def instagram_embed_photo(html, final, post_id):
    if not urlsplit(final).path.endswith("/embed/captioned/"):
        raise MissingEmbedManifest("post_manifest_unavailable")
    doc = InstagramEmbedPhoto()
    doc.feed(html)
    root = doc.fields.get("Embed", {})
    if root.get("data-media-type") != "GraphImage":
        raise MissingEmbedManifest("post_manifest_unavailable")
    author_id = root.get("data-owner-id", "")
    media_id = root.get("data-media-id", "")
    if not re.fullmatch(r"[0-9]{1,30}", author_id) or not re.fullmatch(r"[0-9]{1,30}", media_id):
        raise ValueError("invalid_embed_manifest")
    for link in (root.get("data-permalink"), doc.fields.get("EmbeddedMedia", {}).get("href")):
        if reference(link) != ("instagram", post_id):
            raise ValueError("post_identity_mismatch")
    if not {"Caption", "CaptionUsername", "Username", "EmbeddedMediaImage"} <= doc.fields.keys():
        raise MissingEmbedManifest("post_manifest_unavailable")
    handles = set()
    for field in ("Username", "CaptionUsername"):
        profile = secure_url(doc.fields[field].get("href"))
        handle = re.fullmatch(r"/([A-Za-z0-9_.]{1,40})/?", profile.path)
        if profile.hostname not in INSTAGRAM or not handle:
            raise ValueError("post_author_mismatch")
        handles.add(handle[1].lower())
    if len(handles) != 1:
        raise ValueError("post_author_mismatch")
    handle = handles.pop()
    return {"platform": "instagram", "postId": post_id, "authorId": author_id,
            "authorHandle": handle, "authorName": handle, "text": "".join(doc.caption).strip(),
            "publishedAt": None, "expectedAssetCount": 1,
            "assets": [attachment(doc.fields["EmbeddedMediaImage"].get("src"), "image", "instagram")],
            "canonical": f"https://www.instagram.com/p/{post_id}/"}


def attachment(raw, kind, platform):
    return {"url": media_url(raw, platform), "kind": kind, "animated": False}


def tiktok(values, canonical):
    match = re.fullmatch(TT_RESOLVED, urlsplit(canonical).path)
    if not match:
        raise ValueError("post_identity_unresolved")
    handle, route, post_id = match.groups()
    rows = []
    for value in values:
        if not isinstance(value, dict):
            continue
        detail = value.get("__DEFAULT_SCOPE__", {}).get("webapp.video-detail", {})
        item = detail.get("itemInfo", {}).get("itemStruct")
        if detail.get("statusCode") == 0 and isinstance(item, dict) and str(item.get("id")) == post_id:
            rows.append(item)
    if len(rows) != 1:
        raise ValueError("post_manifest_unavailable")
    item = rows[0]
    author = item["author"]
    author_handle = author.get("uniqueId") if isinstance(author, dict) else None
    if (not isinstance(author_handle, str) or not re.fullmatch(r"[A-Za-z0-9_.]{1,40}", author_handle) or
            (handle and author_handle.lower() != handle.lower())):
        raise ValueError("post_author_mismatch")
    if author.get("privateAccount") or item.get("privateItem") or item.get("secret"):
        raise ValueError("post_unavailable")
    if "imagePost" in item:
        images = item["imagePost"]["images"]
        assets = [attachment(image["imageURL"]["urlList"][0], "image", "tiktok") for image in images]
        count = item["imagePost"].get("imageCount", len(images))
        route = "photo"
    else:
        if route == "photo":
            raise ValueError("incomplete_photo_manifest")
        video = item["video"]
        assets = [attachment(video["playAddr"], "video", "tiktok")]
        count = 1
    return {"platform": "tiktok", "postId": post_id, "authorId": str(author["id"]),
            "authorHandle": author_handle, "authorName": author.get("nickname") or author_handle,
            "text": item["desc"], "publishedAt": int(item["createTime"]) * 1000,
            "expectedAssetCount": count, "assets": assets,
            "canonical": f"https://www.tiktok.com/@{author_handle.lower()}/{route}/{post_id}"}


def instagram(values, post_id, embed=False):
    if embed:
        item = instagram_embed_manifest(values, post_id)
    else:
        item = instagram_page_manifest(values, post_id)
    author = item["owner"]
    if author.get("is_private") or type(item.get("is_video")) is not bool:
        raise ValueError("post_unavailable")
    caption = item["edge_media_to_caption"]["edges"]
    if len(caption) > 1:
        raise ValueError("unexpected_caption_manifest")
    text = caption[0]["node"]["text"] if caption else ""
    if "edge_sidecar_to_children" in item:
        sidecar = item["edge_sidecar_to_children"]
        children = [edge["node"] for edge in sidecar["edges"]]
        count = sidecar.get("count", len(children))
        if sidecar.get("page_info", {}).get("has_next_page") or (embed and len(children) < 2):
            raise ValueError("incomplete_carousel_manifest")
    else:
        if item.get("__typename") in ("GraphSidecar", "XDTGraphSidecar"):
            raise ValueError("incomplete_carousel_manifest")
        children, count = [item], 1
    assets = []
    child_ids = set()
    for node in children:
        if type(node.get("is_video")) is not bool:
            raise ValueError("attachment_kind_unavailable")
        if embed:
            child_id = node.get("id")
            if not isinstance(child_id, str) or not re.fullmatch(r"[0-9]{1,30}", child_id) or child_id in child_ids:
                raise ValueError("invalid_attachment_identity")
            child_ids.add(child_id)
        video = node["is_video"]
        asset_url = node.get("video_url" if video else "display_url")
        if not asset_url:
            raise ValueError("attachment_media_unavailable")
        assets.append(attachment(asset_url, "video" if video else "image", "instagram"))
    timestamp = item.get("taken_at_timestamp")
    return {"platform": "instagram", "postId": post_id, "authorId": str(author["id"]),
            "authorHandle": author["username"], "authorName": author.get("full_name") or author["username"],
            "text": text, "publishedAt": int(timestamp) * 1000 if timestamp is not None else None,
            "expectedAssetCount": count, "assets": assets,
            "canonical": f"https://www.instagram.com/p/{post_id}/"}


def instagram_page_manifest(values, post_id):
    rows = []
    pending = list(values)
    while pending:
        value = pending.pop()
        if isinstance(value, dict):
            for key, child in value.items():
                if key in ("shortcode_media", "xdt_shortcode_media") and isinstance(child, dict) and child.get("shortcode") == post_id:
                    rows.append(child)
                elif isinstance(child, (dict, list)):
                    pending.append(child)
        elif isinstance(value, list):
            pending.extend(x for x in value if isinstance(x, (dict, list)))
    if not rows or any(row != rows[0] for row in rows[1:]):
        raise ValueError("post_manifest_unavailable")
    return rows[0]


def parse_post(requested, final, html, embed=False):
    platform, expected = reference(requested)
    final_platform, actual = reference(final, embed, resolved=True)
    if final_platform != platform or not actual or (expected and expected != actual):
        raise ValueError("post_identity_mismatch")
    document = JsonScripts(embed)
    document.feed(html)
    if embed:
        try:
            result = instagram(document.values, actual, embed=True)
        except MissingEmbedManifest:
            result = instagram_embed_photo(html, final, actual)
    else:
        result = tiktok(document.values, final) if platform == "tiktok" else instagram(document.values, actual)
    if (platform == "tiktok" and "/photo/" in urlsplit(requested).path and
            "/photo/" not in urlsplit(result["canonical"]).path):
        raise ValueError("incomplete_photo_manifest")
    if (type(result["expectedAssetCount"]) is not int or
            not 1 <= len(result["assets"]) == result["expectedAssetCount"] <= 35 or
            not isinstance(result["text"], str) or len(result["text"]) > 60000 or
            not re.fullmatch(r"[0-9]{1,30}", result["authorId"]) or
            not re.fullmatch(r"[A-Za-z0-9_.]{1,40}", result["authorHandle"])):
        raise ValueError("incomplete_post_manifest")
    return {**result, "provider": "instagram_embed" if embed else "public_page"}


def acquire_post(raw, proxy, instagram_embed=False):
    platform, post_id = reference(raw)
    if instagram_embed and platform == "instagram" and urlsplit(raw).path.startswith("/p/"):
        final, html = read_page(f"https://www.instagram.com/p/{post_id}/embed/captioned/", proxy, embed=True)
        try:
            return parse_post(raw, final, html, embed=True)
        except MissingEmbedManifest:
            pass
    final, html = read_page(raw, proxy)
    return parse_post(raw, final, html)
