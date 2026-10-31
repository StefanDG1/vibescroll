"""Built compact UI + official MCP Apps bridge. Synthetic data only."""
from pathlib import Path
HARNESS_PORT = 4319
exec(Path("apps/widget/harness/browser_helpers.py").read_text(encoding="utf-8"), globals())

def childjs(expression):
    return request("Runtime.evaluate", session_id=child_session, expression=expression, returnByValue=True)["result"].get("value")

def escape():
    raw_cdp("Input.dispatchKeyEvent", type="keyDown", key="Escape", code="Escape", windowsVirtualKeyCode=27)
    raw_cdp("Input.dispatchKeyEvent", type="keyUp", key="Escape", code="Escape", windowsVirtualKeyCode=27)

def goal(text="Improve the first useful result before requesting setup."):
    click_child("What would you like to improve?", role="textbox")
    raw_cdp("Input.insertText", text=text)

def card(params="", width=680):
    open_case("resource=card" + ("&"+params if params else ""), width)
    until(lambda: "Designing a useful first experience" in body(), "compact source read")

def compose():
    click_child("Let people try", partial=True)
    until(lambda: "Use in a project" in body(), "shared insight expansion")
    click_child("Use in a project")
    until(lambda: childjs("!!document.querySelector('dialog[open]')"), "proposal panel")
    goal()

def note(name):
    passed(name)
    print(name, flush=True)

card()
assert childjs("document.querySelectorAll('.post-insight-card').length") == 1
assert not any(r.get('name') in ['save_link','save_project_proposal'] for r in receipts())
count=len(receipts())
click_child("Let people try", partial=True)
until(lambda: "Use in a project" in body(), "shared card expanded")
click_child("Evidence and options", partial=True)
until(lambda: childjs("!!document.querySelector('dialog[open]')"), "evidence drawer")
assert len(receipts()) == count
escape()
until(lambda: not childjs("!!document.querySelector('dialog[open]')"), "Escape closes evidence")
assert childjs("document.activeElement.getAttribute('aria-label').startsWith('Evidence and options')")
note("shared insight/evidence controls render without writes and restore focus")
click_child("Use in a project")
until(lambda: childjs("!!document.querySelector('dialog[open]')"), "proposal panel")
goal()
click_parent("Switch theme")
until(lambda: childjs("document.querySelector('.compact-root').dataset.theme") == 'dark', "host theme")
assert childjs("document.querySelector('textarea').value") == "Improve the first useful result before requesting setup."
click_child("Save proposal")
until(lambda: "Proposal saved" in body(), "MCP planning save")
assert sum(r.get('name')=='save_project_proposal' for r in receipts()) == 1
click_child("Continue in chat")
until(lambda: any(r['event']=='message' for r in receipts()), "host follow-up message")
assert any(r.get('name')=='get_project_proposal' for r in receipts())
click_child("Open proposal", role='link')
until(lambda: any(r['event']=='protected-link' for r in receipts()), "website proposal link")
note("same proposal form saves, preserves a draft across theme change and continues through host messaging")

card('save=unknown-once')
compose()
click_child("Save proposal")
until(lambda: "Retry save" in body(), "unknown write outcome")
assert childjs("document.querySelector('textarea').disabled")
click_child("Retry save")
until(lambda: "Proposal saved" in body(), "unknown request reconciliation")
writes=[r for r in receipts() if r.get('name')=='save_project_proposal']
assert len(writes)==2 and writes[0]['requestKey']==writes[1]['requestKey']
assert sum(r.get('name')=='get_project_application_context' for r in receipts())==1
note("unknown save replays one exact request without a second context or duplicate draft")

card('save=stale-once')
compose()
click_child("Save proposal")
until(lambda: "The post or project changed" in body(), "known stale rejection")
assert not childjs("document.querySelector('textarea').disabled")
assert childjs("document.querySelector('textarea').value")
note("known stale rejection preserves editable user input")

card('messages=0')
compose()
click_child("Save proposal")
until(lambda: "Proposal saved" in body(), "no-message host save")
assert "Continue in chat" not in body() and "Open proposal" in body()
note("a host without message capability keeps save and website follow-up usable")

card()
click_parent("Remove fixture access")
click_child("Refresh this post")
until(lambda: "This request was not confirmed" in body(), "revoked access response")
assert "Let people try the useful part first" not in body()
note("revoked access clears earlier source content before retry")

card('safe=1',375)
assert childjs("document.documentElement.scrollWidth <= innerWidth")
compose()
assert childjs("document.querySelector('dialog[open]').scrollWidth <= innerWidth")
assert childjs("parseInt(getComputedStyle(document.querySelector('.compact-root')).paddingTop)") >= 24
note("375px source and drawer fit with host safe-area insets")

open_case('resource=workspace',680)
until(lambda: "Recent posts" in body(), "compact workspace")
click_child("Post link", role="textbox")
raw_cdp("Input.insertText",text="https://www.instagram.com/reel/synthetic/")
click_child("Save link")
until(lambda: "Designing a useful first experience" in body(), "explicit link save readback")
assert sum(r.get('name')=='save_link' for r in receipts())==1
note("explicit link capture opens its current source without starting work on render")

open_case('resource=card&job=waiting',680)
until(lambda: 'Metadata arrived before analysis' in body(), 'early metadata title')
assert childjs("!!document.querySelector('progress')")
childjs("window._realNow=Date.now; Date.now=()=>window._realNow()+310000")
until(lambda: 'Check latest status' in body(), 'finite visible polling')
assert not childjs("!!document.querySelector('progress')")
assert sum(r.get('name')=='get_job_status' for r in receipts()) == 1
note("early metadata is visible before analysis and expired polling does not imply live progress")

open_case('resource=export',680)
until(lambda: 'Fixture snapshot' in body(), 'historical read-only export')
assert any(r['event']=='file-read' for r in receipts())
assert not any(r['event']=='tool' for r in receipts())
note("historical exports retain read-only file authority")

Path('outputs/redesign-20261030/compact-protocol-results.json').write_text(json.dumps({'scope':'built HTML + official AppBridge + synthetic tools, not real ChatGPT/OAuth acceptance','results':results},indent=2),encoding='utf-8')
request('Emulation.clearDeviceMetricsOverride')
request('Emulation.setFocusEmulationEnabled',enabled=False)
raw_cdp('Target.closeTarget',targetId=parent_target)
print(json.dumps(results),flush=True)
