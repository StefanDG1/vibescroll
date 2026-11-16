"""Run through browser-harness with the authorized production Home tab active."""
from pathlib import Path
from datetime import datetime, timezone
import base64, hashlib, json, os, re, time

root = Path(os.environ["LOCALAPPDATA"]) / "VibeScroll" / "ui-snapshot"
root.mkdir(parents=True, exist_ok=True)
staging = root / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
staging.mkdir()
(staging / "evidence").mkdir()

def browser(expression, timeout=40):
    r = cdp("Runtime.evaluate", session_id=production_session, expression=expression, awaitPromise=True, returnByValue=True, _response_timeout=timeout)
    if r.get("exceptionDetails"):
        raise RuntimeError("The authorized browser request did not finish")
    return r["result"].get("value")

matches = [tab for tab in list_tabs() if re.match(r"^https://scroll\.companynerve\.com/app/[a-z0-9]+(?:[/?#]|$)", tab["url"])]
active = current_tab()
selected = next((tab for tab in matches if tab["targetId"] == active.get("targetId")), None) if active else None
if not selected and len(matches) == 1:
    selected = matches[0]
if not selected:
    raise RuntimeError("Open one signed-in VibeScroll workspace or attach browser-harness to the intended tab")
production_session = switch_tab(selected["targetId"])
org = browser("location.origin==='https://scroll.companynerve.com' && location.pathname.split('/')[2]")
if not isinstance(org, str) or not re.fullmatch(r"[a-z0-9]+", org):
    raise RuntimeError("Open the intended signed-in production workspace first")

def get_many(paths):
    return browser("""Promise.all(%s.map(async path => {
      const r = await fetch(path, {cache:'no-store',redirect:'error',signal:AbortSignal.timeout(18000)});
      return [r.status, r.ok ? await r.json() : null];
    }))""" % json.dumps(paths))

def get(path):
    status, body = get_many([path])[0]
    if status != 200 or not isinstance(body,dict):
        raise RuntimeError(f"Authorized read failed with HTTP {status}")
    return body

def paginate(route):
    rows = {}
    cursor = None
    cursors = set()
    for _ in range(100):
        from urllib.parse import urlencode
        page = get(route + ("?" + urlencode({"cursor":cursor}) if cursor else ""))
        for item in page["items"]:
            rows[item.get("id") or item["_id"]] = item
        cursor = page.get("next")
        if not cursor:
            return list(rows.values())
        if cursor in cursors:
            raise RuntimeError("Production returned a repeated cursor")
        cursors.add(cursor)
    raise RuntimeError("The snapshot did not reach the end of this workspace")

workspace = "/api/workspace/"+org
context = get(workspace+"?view=library")
if context.get("role") != "owner":
    raise RuntimeError("This capture requires the selected workspace owner")
work = get(workspace+"?view=inbox")
posts = paginate("/api/posts/"+org)
library = paginate("/api/library/"+org)

def pick(value, keys):
    return {key:value[key] for key in keys.split() if key in value}

def safe_source(data):
    result = pick(data, "_id _creationTime organizationId title kind canonical url sourceType state generation createdAt updatedAt originalSavedAt publishedAt summary mainPoints tags categoryKeys categoryNames coverage insightCount rightsAttested sourceRetentionUntil resultRetention originalText text mediaEvidence originalMediaEvidence analysisVersion analysisSelectionRevision analysis selectedAnalysisVersionId preparedService sharedCloud orderedMedia evidenceRegistry sourceRevision privateLibrary")
    if data.get("linkPreview"):
        result["linkPreview"] = pick(data["linkPreview"], "assetId authorName durationSeconds origin state title updatedAt")
    if data.get("acquisition"):
        result["acquisition"] = pick(data["acquisition"], "description")
    if data.get("personalMedia"):
        result["personalMedia"] = pick(data["personalMedia"], "frames cloudFrames")
    job = data.get("personalAnalysis") or {}
    if job.get("executor") == "work_cloud":
        media = (job.get("cloud") or {}).get("media") or {}
        if media:
            result["personalAnalysis"] = {"executor":"work_cloud","generation":data["generation"],"state":data["personalAnalysis"].get("state"),"cloud":{"media":pick(media,"retainUntil preparationHash")}}
    if data.get("proposals"):
        result["proposals"] = [safe_proposal(p) for p in data["proposals"]]
    return result

def safe_proposal(p):
    result = pick(p, "_id _creationTime organizationId sourceId repositoryId title createdAt updatedAt review disposition version profileVersion baseSha references repo")
    if p.get("detail"):
        result["detail"] = pick(p["detail"], "schemaVersion currentProblem proposedChange steps insightIds benefitHypothesis risks acceptanceCriteria nonGoals verificationNeeds reason")
    return result

projects = [pick(p,"_id organizationId fullName enabled confirmed status profile profileVersion branch sha createdAt updatedAt snapshotCoverage selectionVersion") for p in work["repositories"]]
proposals = [safe_proposal(p) for p in work["proposals"]]
sources = {}
media = set()
post_ids = list(dict.fromkeys(p["id"] for p in posts))
for i in range(0,len(post_ids),3):
    ids = post_ids[i:i+3]
    paths = ["/api/source/"+p+"?organizationId="+org for p in ids]
    for ident, (status, data) in zip(ids, get_many(paths), strict=True):
        if status != 200 or not data or data["_id"] != ident or data["organizationId"] != org:
            raise RuntimeError(f"Post details unavailable (HTTP {status}). The previous snapshot is still active.")
        source = safe_source(data)
        sources[ident] = source
        for key in ["preparedService","sharedCloud","personalMedia"]:
            entry=source.get(key) or {}
            for frame in entry.get("frames",[]):
                media.add(frame.get("reference") or frame.get("assetId"))
            for frame in (entry.get("cloudFrames") or {}).get("frames",[]):
                media.add(frame.get("assetId"))
        for key in ["mediaEvidence","originalMediaEvidence"]:
            for frame in source.get(key,[]):
                if frame.get("kind")=="frame":
                    media.add(frame.get("id"))
        media.add((source.get("linkPreview") or {}).get("assetId"))
    time.sleep(.20)
    if i%48==0:
        print(f"Captured detail for {len(sources)} posts",flush=True)

for p in posts:
    media.update(p["thumbnailAssetIds"])
# Bind browser-visible records to the completed output. A fresh capture uses a
# different directory until both data and media are complete.
snapshot = {
    "organizationId":org,"workspaceName":context["workspaceName"],"privateLibrary":context["privateLibrary"],
    "capturedAt":datetime.now(timezone.utc).isoformat(),"posts":posts,
    "library":[safe_source(p) for p in library if p.get("organizationId")==org],
    "sources":sources,"repositories":projects,"proposals":proposals,
    "runs":[pick(r,"_id organizationId proposalId repositoryId state createdAt updatedAt prState prNumber prUrl mergedAt reverted executor observedAt") for r in work["runs"]],
    "notifications":[pick(n,"_id key message read createdAt updatedAt") for n in work["notifications"]],
    "connections":[pick(c,"provider status updatedAt") for c in work["connections"]],
    "categories":[pick(c,"key name count level parents") for c in context["categories"]],
}
(staging / "data.json").write_text(json.dumps(snapshot,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
refs = sorted(r for r in media if isinstance(r,str) and re.fullmatch(r"[A-Za-z0-9_~.-]{1,320}",r))
print(f"Data captured. {len(posts)} posts, {len(sources)} details, {len(projects)} projects, {len(proposals)} proposals, {len(refs)} evidence references.",flush=True)
count = 0
for i in range(0,len(refs),4):
    part=refs[i:i+4]
    captured=browser("""Promise.all(%s.map(async ref => {
      try {
        const r = await fetch('/api/evidence/'+encodeURIComponent(ref)+'?inline=true',{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(14000)});
        if(!r.ok || !r.headers.get('content-type')?.startsWith('image/jpeg')) return null;
        const b=new Uint8Array(await r.arrayBuffer());
        if(b.length>1000000 || b[0]!==255 || b[1]!==216 || b[2]!==255) return null;
        let s=''; for(let i=0;i<b.length;i+=16384) s+=String.fromCharCode(...b.subarray(i,i+16384));
        return btoa(s);
      } catch { return null; }
    }))""" % json.dumps(part))
    for ref, payload in zip(part, captured, strict=True):
        if payload is None:
            continue
        name=hashlib.sha256(ref.encode()).hexdigest()+".jpg"
        (staging/"evidence"/name).write_bytes(base64.b64decode(payload,validate=True))
        count+=1
    time.sleep(.12)
    if i%120==0:
        print(f"Copied {count} retained images",flush=True)
snapshot["evidenceCount"]=count
snapshot["evidenceRequested"]=len(refs)
(staging / "data.json").write_text(json.dumps(snapshot,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
(root/"current.tmp").write_text(staging.name,encoding="ascii")
(root/"current.tmp").replace(root/"current.txt")
print(f"Snapshot available. {count} of {len(refs)} image references responded with retained JPEG bytes.",flush=True)
