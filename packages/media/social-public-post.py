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
TT_SHORT = r"/(?:t/)?[A-Za-z0-9]{5,30}/?"
IG_POST = r"/(?:p|reel|reels)/([A-Za-z0-9_-]{5,30})/?"


def secure_url(raw, length=4096):
    if not isinstance(raw, str) or len(raw) > length or re.search(r"[\s\\\x00-\x1f]", raw):
        raise ValueError("invalid_post_url")
    url = urlsplit(raw)
    if url.scheme != "https" or url.username or url.password or url.port or url.fragment:
        raise ValueError("invalid_post_url")
    return url


def reference(raw):
    url = secure_url(raw, 2048)
    if url.hostname in INSTAGRAM and (match := re.fullmatch(IG_POST, url.path)):
        return "instagram", match[1]
    if url.hostname in TIKTOK:
        if match := re.fullmatch(TT_FULL, url.path):
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


def read_page(raw, proxy):
    platform, post_id = reference(raw)
    opener = urllib.request.build_opener(
        urllib.request.ProxyHandler({"https": proxy}), NoRedirect
    )
    for _ in range(5):
        url = urlsplit(raw)
        if platform == "tiktok" and re.fullmatch(TT_FULL, url.path) and "/photo/" in url.path:
            raw = url._replace(path=url.path.replace("/photo/", "/video/", 1)).geturl()
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
                return raw, data.decode("utf-8", "strict")
        except urllib.error.HTTPError as error:
            if error.code not in (301, 302, 303, 307, 308):
                raise ValueError("post_unavailable") from error
            location = error.headers.get("Location")
            if not location:
                raise ValueError("post_redirect_invalid") from error
            target = urljoin(raw, location)
            target_platform, target_id = reference(target)
            if target_platform != platform or (post_id and post_id != target_id):
                raise ValueError("post_identity_changed") from error
            post_id = target_id or post_id
            raw = target
    raise ValueError("post_redirect_limit")


class JsonScripts(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.parts = None
        self.values = []

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag == "script" and (attributes.get("type") == "application/json" or
                                attributes.get("id") == "__UNIVERSAL_DATA_FOR_REHYDRATION__"):
            self.parts = []

    def handle_data(self, data):
        if self.parts is not None:
            self.parts.append(data)

    def handle_endtag(self, tag):
        if tag == "script" and self.parts is not None:
            try:
                self.values.append(json.loads("".join(self.parts)))
            except (ValueError, RecursionError):
                pass
            self.parts = None


def attachment(raw, kind, platform):
    return {"url": media_url(raw, platform), "kind": kind, "animated": False}


def tiktok(values, canonical):
    match = re.fullmatch(TT_FULL, urlsplit(canonical).path)
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
    if not isinstance(author, dict) or author.get("uniqueId", "").lower() != handle.lower():
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
            "authorHandle": author["uniqueId"], "authorName": author.get("nickname") or handle,
            "text": item["desc"], "publishedAt": int(item["createTime"]) * 1000,
            "expectedAssetCount": count, "assets": assets,
            "canonical": f"https://www.tiktok.com/@{handle.lower()}/{route}/{post_id}"}


def instagram(values, post_id):
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
    item = rows[0]
    author = item["owner"]
    if author.get("is_private") or item.get("is_video") is None:
        raise ValueError("post_unavailable")
    caption = item["edge_media_to_caption"]["edges"]
    if len(caption) > 1:
        raise ValueError("unexpected_caption_manifest")
    text = caption[0]["node"]["text"] if caption else ""
    if "edge_sidecar_to_children" in item:
        sidecar = item["edge_sidecar_to_children"]
        children = [edge["node"] for edge in sidecar["edges"]]
        count = sidecar.get("count", len(children))
    else:
        if item.get("__typename") in ("GraphSidecar", "XDTGraphSidecar"):
            raise ValueError("incomplete_carousel_manifest")
        children, count = [item], 1
    assets = []
    for node in children:
        if type(node.get("is_video")) is not bool:
            raise ValueError("attachment_kind_unavailable")
        video = node["is_video"]
        assets.append(attachment(node["video_url" if video else "display_url"],
                                 "video" if video else "image", "instagram"))
    return {"platform": "instagram", "postId": post_id, "authorId": str(author["id"]),
            "authorHandle": author["username"], "authorName": author.get("full_name") or author["username"],
            "text": text, "publishedAt": int(item["taken_at_timestamp"]) * 1000,
            "expectedAssetCount": count, "assets": assets,
            "canonical": f"https://www.instagram.com/p/{post_id}/"}


def parse_post(requested, final, html):
    platform, expected = reference(requested)
    final_platform, actual = reference(final)
    if final_platform != platform or not actual or (expected and expected != actual):
        raise ValueError("post_identity_mismatch")
    document = JsonScripts()
    document.feed(html)
    result = tiktok(document.values, final) if platform == "tiktok" else instagram(document.values, actual)
    if (type(result["expectedAssetCount"]) is not int or
            not 1 <= len(result["assets"]) == result["expectedAssetCount"] <= 35 or
            not isinstance(result["text"], str) or len(result["text"]) > 60000 or
            not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", result["authorId"]) or
            not re.fullmatch(r"[A-Za-z0-9_.]{1,40}", result["authorHandle"])):
        raise ValueError("incomplete_post_manifest")
    return result
