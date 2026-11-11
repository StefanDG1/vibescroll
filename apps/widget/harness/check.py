"""Legacy export/full-view checks. Run through browser-harness from the repository root."""
from pathlib import Path
exec(Path("apps/widget/harness/browser_helpers.py").read_text(encoding="utf-8"), globals())
open_case('resource=card',680)
until(lambda:'Source evidence' in body(), 'ordinary fetched result rendered as an inline card')
assert 'Back to library' not in body() and 'YOUR KNOWLEDGE' not in body()
assert all(any(r.get('name')==tool for r in receipts()) for tool in ['widget_profiles','widget_state','fetch'])
passed('ordinary MCP fetch receipt and client-only route initialize the production inline card')
capture_card('compact-card-bridge.png')

open_case('resource=card&references=5',680)
until(lambda:'Show 3 more references' in body(), 'bounded reference preview')
rows=lambda:request('Runtime.evaluate',session_id=child_session,expression='document.querySelectorAll(".evidence-row").length',returnByValue=True)['result'].get('value')
assert rows()==2
before=len(receipts())
click_child('Show 3 more references')
until(lambda:rows()==5, 'expanded references')
click_child('Show fewer references')
until(lambda:rows()==2, 'collapsed references')
assert len(receipts())==before
assert request('Runtime.evaluate',session_id=child_session,expression='document.activeElement?.textContent',returnByValue=True)['result'].get('value')=='Show 3 more references'
passed('five references collapse to two, expand without data calls, and retain focus')
capture_card('compact-five-references-bridge.png')

open_case('resource=card&card=status',680)
until(lambda:'Analysis complete' in body(), 'inline analysis status')
assert any(r.get('name')=='get_job_status' for r in receipts())
passed('compact status card reads the current source state through the host bridge')
capture_card('compact-status-bridge.png')

open_case('resource=card&context=0',680)
until(lambda:'Source evidence' in body(), 'inline card without model-context capability')
assert request('Runtime.evaluate',session_id=child_session,expression='Array.from(document.querySelectorAll("button")).some(e=>e.textContent.includes("Add to conversation")&&e.disabled)',returnByValue=True)['result'].get('value')
passed('unsupported model-context attachment is disabled while citations remain readable')

open_case('resource=export',680)
until(lambda:'Fixture snapshot' in body(), 'host file resource read')
assert any(r['event']=='file-read' for r in receipts())
assert not any(r['event']=='tool' for r in receipts())
passed('file entrypoint reads a strict snapshot without acquiring live-record authority')

open_case('resource=card&theme=dark&references=5',320)
until(lambda:'Source evidence' in body(), 'narrow dark inline card')
assert request('Runtime.evaluate',session_id=child_session,expression='!!document.querySelector(".widget-root.dark") && document.documentElement.scrollWidth <= innerWidth',returnByValue=True)['result'].get('value')
assert request('Runtime.evaluate',session_id=child_session,expression='Array.from(document.querySelectorAll(".evidence-row > span:last-child")).every(e => getComputedStyle(e).whiteSpace !== "nowrap" && e.scrollWidth <= e.clientWidth && e.scrollHeight <= e.clientHeight)',returnByValue=True)['result'].get('value')
passed('host theme is applied and the compiled compact card fits 320 pixels')
capture_card('compact-card-mobile-bridge.png')

out=Path('.impeccable/review/widget-bridge-result.json')
out.parent.mkdir(parents=True,exist_ok=True)
out.write_text(json.dumps({'scope':'local production HTML + official AppBridge + synthetic tool projections; not real ChatGPT/Codex or OAuth acceptance','results':results},indent=2),encoding='utf-8')
print(json.dumps(results))

raw_cdp("Target.closeTarget",targetId=parent_target)
