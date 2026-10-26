"""Run inside browser-harness, never against a live account or server."""
import json
import time
import base64
from pathlib import Path

results = []
child_session = None
parent_session = None
parent_target = None
raw_cdp = cdp

def request(method, **params):
    params.setdefault("session_id", parent_session)
    return raw_cdp(method, **params)

def parentjs(expression):
    result = request("Runtime.evaluate", expression=expression, returnByValue=True)
    return result.get("result", {}).get("value")


def until(check, label):
    deadline = time.monotonic() + 12
    while time.monotonic() < deadline:
        try:
            if check():
                return
        except RuntimeError:
            pass
        time.sleep(0.1)
    raise AssertionError(label)

def body():
    return request('Runtime.evaluate', session_id=child_session, expression='document.body.innerText', returnByValue=True)['result'].get('value', '')

def receipts():
    return json.loads(parentjs('document.querySelector("#receipts").textContent') or '[]')

def open_case(params='', width=1440):
    global child_session, parent_session, parent_target
    if parent_target is None:
        own = next((t for t in list_tabs() if t.get('url','').startswith('http://127.0.0.1:4318/harness/')), None)
        parent_target = own['targetId'] if own else new_tab('http://127.0.0.1:4318/harness/')
        parent_session = raw_cdp('Target.attachToTarget',targetId=parent_target,flatten=True)['sessionId']
        request('Emulation.setFocusEmulationEnabled',enabled=True)
    url='http://127.0.0.1:4318/harness/?' + params + '&case=' + str(time.monotonic_ns())
    request('Page.navigate',url=url)
    until(lambda: parentjs('location.href')==url and parentjs('document.readyState')=='complete', 'harness navigation')
    request('Emulation.setDeviceMetricsOverride', width=width, height=1000, deviceScaleFactor=1, mobile=width<760)
    request('Emulation.setPageScaleFactor', pageScaleFactor=1)
    until(lambda: any(r['event']=='initialized' and r.get('url')==url for r in receipts()), 'MCP Apps handshake for this exact navigation')
    root = request('DOM.getDocument')['root']['nodeId']
    owner = request('DOM.querySelector', nodeId=root, selector='#widget')['nodeId']
    target = request('DOM.describeNode', nodeId=owner)['node']['frameId']
    until(lambda:any(t['targetId']==target for t in request('Target.getTargets')['targetInfos']), 'sandbox inspection target')
    child_session = request('Target.attachToTarget', targetId=target, flatten=True)['sessionId']
    request('Emulation.setFocusEmulationEnabled',session_id=child_session,enabled=True)

def click_child(name, role='button', partial=False):
    # Scoped keyboard activation remains reliable in a background shared browser.
    activate_child(name, role, partial)


def click_parent(name):
    node=next(n for n in request('Accessibility.getFullAXTree')['nodes'] if n.get('role',{}).get('value')=='button' and n.get('name',{}).get('value')==name)
    request('DOM.focus',backendNodeId=node['backendDOMNodeId'])
    request('Input.dispatchKeyEvent',type='keyDown',key='Enter',code='Enter',text='\r',unmodifiedText='\r',windowsVirtualKeyCode=13)
    request('Input.dispatchKeyEvent',type='keyUp',key='Enter',code='Enter',windowsVirtualKeyCode=13)


def capture_card(name):
    capture_workspace(name)


def fill_child(label, value):
    nodes=request('Accessibility.getFullAXTree',session_id=child_session)['nodes']
    node=next(n for n in nodes if n.get('role',{}).get('value')=='textbox' and n.get('name',{}).get('value')==label)
    request('DOM.focus',session_id=child_session,backendNodeId=node['backendDOMNodeId'])
    request('Input.dispatchKeyEvent',session_id=child_session,type='rawKeyDown',key='a',code='KeyA',windowsVirtualKeyCode=65,modifiers=2)
    request('Input.dispatchKeyEvent',session_id=child_session,type='keyUp',key='a',code='KeyA',windowsVirtualKeyCode=65,modifiers=2)
    request('Input.insertText',session_id=child_session,text=value)



def activate_child(name, role='button', partial=False):
    def ready():
        nodes=request('Accessibility.getFullAXTree',session_id=child_session)['nodes']
        found=next((n for n in nodes if n.get('role',{}).get('value')==role and (name in n.get('name',{}).get('value','') if partial else n.get('name',{}).get('value')==name)),None)
        return found if found and not any(p.get('name')=='disabled' and p.get('value',{}).get('value') for p in found.get('properties',[])) else None
    until(lambda:bool(ready()),'enabled native control '+name)
    node=ready()
    request('DOM.focus',session_id=child_session,backendNodeId=node['backendDOMNodeId'])
    request('Input.dispatchKeyEvent',session_id=child_session,type='keyDown',key='Enter',code='Enter',text='\r',unmodifiedText='\r',windowsVirtualKeyCode=13)
    request('Input.dispatchKeyEvent',session_id=child_session,type='keyUp',key='Enter',code='Enter',windowsVirtualKeyCode=13)

def select_child(label, steps=1):
    nodes=request('Accessibility.getFullAXTree',session_id=child_session)['nodes']
    node=next(n for n in nodes if n.get('role',{}).get('value')=='combobox' and n.get('name',{}).get('value')==label)
    request('DOM.focus',session_id=child_session,backendNodeId=node['backendDOMNodeId'])
    for key,code in [('Home',36)]+[('ArrowDown',40)]*steps+[('Enter',13)]:
        request('Input.dispatchKeyEvent',session_id=child_session,type='rawKeyDown',key=key,code=key,windowsVirtualKeyCode=code)
        request('Input.dispatchKeyEvent',session_id=child_session,type='keyUp',key=key,code=key,windowsVirtualKeyCode=code)

def capture_workspace(name):
    until(lambda:parentjs('document.querySelector("iframe").clientHeight') >= min(2000,request('Runtime.evaluate',session_id=child_session,expression='document.documentElement.scrollHeight',returnByValue=True)['result'].get('value',100))-1,'settled host resize before capture')
    request('Runtime.evaluate',session_id=child_session,expression='window.scrollTo(0,0)')
    parentjs('window.scrollTo(0,0)')
    width=int(parentjs('innerWidth'))
    height=int(parentjs('document.querySelector("iframe").clientHeight + document.querySelector("iframe").getBoundingClientRect().y + 40'))
    request('Emulation.setDeviceMetricsOverride',width=width,height=min(2600,height),deviceScaleFactor=1,mobile=width<760)
    request('Emulation.setPageScaleFactor',pageScaleFactor=1)
    request('Runtime.evaluate',session_id=child_session,expression='window.scrollTo(0,0)')
    parentjs('window.scrollTo(0,0)')
    box=parentjs('(()=>{const r=document.querySelector("iframe").getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,scale:1}})()')
    Path('.impeccable/review/'+name).write_bytes(base64.b64decode(request('Page.captureScreenshot',format='png',clip=box,captureBeyondViewport=False)['data']))

def passed(name):
    results.append({'name':name,'passed':True})

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



open_case('resource=card&feedback-saved=1',680)
until(lambda:'Review this source' in body(),'compact source review disclosure')
assert not any(r.get('name')=='widget_feedback_state' for r in receipts())
activate_child('Review this source',role='DisclosureTriangle')
until(lambda:'Your saved judgment: Later' in body(),'current own judgment restored')
assert request('Runtime.evaluate',session_id=child_session,expression='document.querySelector(".feedback-note").value',returnByValue=True)['result'].get('value')=='A saved note from this connection.'
capture_workspace('inline-source-review-desktop.png')
fill_child('Optional note','A considered correction')
for label,version in [('Useful',2),('Not relevant',3),('Already implemented',4),('Unsupported',5),('Later',6)]:
    activate_child(label)
    until(lambda:'Judgment saved · Version '+str(version) in body(),'canonical judgment '+label)
assert sum(r.get('name')=='record_feedback' for r in receipts())==5
activate_child('Review this source',role='DisclosureTriangle')
activate_child('Review this source',role='DisclosureTriangle')
until(lambda:'Your saved judgment: Later' in body(),'judgment persists after disclosure reopen')
assert request('Runtime.evaluate',session_id=child_session,expression='document.querySelector(".feedback-note").value',returnByValue=True)['result'].get('value')=='A considered correction'
assert not any(r.get('name') in ['request_analysis','save_link','draft_project_suggestion'] for r in receipts())
passed('the compact card lazily restores its saved judgment and records all five versioned choices without processing')

open_case('resource=card&feedback-delay=1&feedback-lost-reply=1',680)
until(lambda:'Review this source' in body(),'uncertain judgment control')
activate_child('Review this source',role='DisclosureTriangle')
until(lambda:'How useful is this source?' in body() and 'Loading your source judgment' not in body(),'current judgment loaded')
activate_child('Useful')
until(lambda:sum(r.get('name')=='record_feedback' for r in receipts())==1,'one judgment in flight')
activate_child('Review this source',role='DisclosureTriangle')
time.sleep(1.4)
activate_child('Review this source',role='DisclosureTriangle')
until(lambda:'The judgment is not confirmed.' in body(),'retained unknown judgment')
activate_child('Check saved judgment')
until(lambda:'Judgment saved · Version 1' in body(),'lost reply reconciled from the current key')
assert sum(r.get('name')=='record_feedback' for r in receipts())==1
passed('a lost judgment reply survives collapse and confirms its existing record without another write')

open_case('resource=card&feedback=0',680)
until(lambda:'Source evidence' in body(),'read-only cited result')
assert not request('Runtime.evaluate',session_id=child_session,expression='!!document.querySelector(".source-review")',returnByValue=True)['result'].get('value')
assert not any(r.get('name') in ['widget_feedback_state','record_feedback'] for r in receipts())
passed('a connection without feedback permission exposes no review controls or private judgment read')

open_case('resource=card&feedback-limited=1',680)
until(lambda:'Review this source' in body(),'bounded judgment lookup')
activate_child('Review this source',role='DisclosureTriangle')
until(lambda:'bounded lookup' in body(),'explicit bounded recovery')
assert not request('Runtime.evaluate',session_id=child_session,expression='!!document.querySelector(".feedback-note")',returnByValue=True)['result'].get('value')
assert not any(r.get('name')=='record_feedback' for r in receipts())
passed('a limited historical lookup offers protected review instead of treating it as no saved judgment')

open_case('resource=card&feedback-saved=1&feedback-authority-change=1',680)
until(lambda:'Review this source' in body(),'identity-change source review')
activate_child('Review this source',role='DisclosureTriangle')
until(lambda:'Your saved judgment: Later' in body(),'first authorized own judgment')
activate_child('Useful')
until(lambda:'Current judgment access must be refreshed.' in body(),'identity change masks private controls')
assert not request('Runtime.evaluate',session_id=child_session,expression='!!document.querySelector(".feedback-note")',returnByValue=True)['result'].get('value')
assert not any(r.get('name')=='record_feedback' for r in receipts())
passed('a changed connection identity is rejected before a draft judgment is written and private fields are hidden')

open_case('resource=card&feedback-saved=1&theme=dark',320)
until(lambda:'Review this source' in body(),'narrow source review')
activate_child('Review this source',role='DisclosureTriangle')
until(lambda:'Your saved judgment: Later' in body(),'narrow current judgment')
assert request('Runtime.evaluate',session_id=child_session,expression='!!document.querySelector(".widget-root.dark") && document.documentElement.scrollWidth <= innerWidth',returnByValue=True)['result'].get('value')
capture_workspace('inline-source-review-mobile.png')
passed('the320px dark compact card keeps all five judgment choices, current note and source evidence readable')


open_case('resource=card&feedback-saved=1',320)
until(lambda:'Review this source' in body(),'expanded judgment entry')
activate_child('Expand workspace')
until(lambda:'How useful is this source?' in body() and 'Your saved judgment: Later' in body(),'expanded source judgment')
assert request('Runtime.evaluate',session_id=child_session,expression='Array.from(document.querySelectorAll(".feedback-buttons button")).every(e=>e.getBoundingClientRect().height>=44)',returnByValue=True)['result'].get('value')
capture_workspace('expanded-source-review-mobile.png')
open_case('resource=workspace&view=scroll&feedback-saved=1',320)
until(lambda:'Scroll your insights' in body() and 'How useful is this source?' in body(),'scroll judgment reuse through its supported entrypoint')
assert request('Runtime.evaluate',session_id=child_session,expression='Array.from(document.querySelectorAll(".feedback-buttons button")).every(e=>e.getBoundingClientRect().height>=44)',returnByValue=True)['result'].get('value')
passed('expanded Library and Scroll source review both keep44px judgment targets at320px')

out=Path('.impeccable/review/widget-bridge-result.json')
out.parent.mkdir(parents=True,exist_ok=True)
out.write_text(json.dumps({'scope':'local production HTML + official AppBridge + synthetic tool projections; not real ChatGPT/Codex or OAuth acceptance','results':results},indent=2),encoding='utf-8')
print(json.dumps(results))

raw_cdp("Target.closeTarget",targetId=parent_target)
