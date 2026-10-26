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

def click_parent_xy(x,y):
    request("Input.dispatchMouseEvent",type="mousePressed",x=x,y=y,button="left",clickCount=1)
    request("Input.dispatchMouseEvent",type="mouseReleased",x=x,y=y,button="left",clickCount=1)


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
    url='http://127.0.0.1:4318/harness/?' + params
    request('Page.navigate',url=url)
    until(lambda: parentjs('location.href')==url and parentjs('document.readyState')=='complete', 'harness navigation')
    request('Emulation.setDeviceMetricsOverride', width=width, height=1000, deviceScaleFactor=1, mobile=width<760)
    request('Emulation.setPageScaleFactor', pageScaleFactor=1)
    until(lambda: any(r['event']=='initialized' for r in receipts()), 'MCP Apps handshake')
    root = request('DOM.getDocument')['root']['nodeId']
    owner = request('DOM.querySelector', nodeId=root, selector='#widget')['nodeId']
    target = request('DOM.describeNode', nodeId=owner)['node']['frameId']
    until(lambda:any(t['targetId']==target for t in request('Target.getTargets')['targetInfos']), 'sandbox inspection target')
    child_session = request('Target.attachToTarget', targetId=target, flatten=True)['sessionId']
    request('Emulation.setFocusEmulationEnabled',session_id=child_session,enabled=True)

def click_child(name, role='button', partial=False):
    until(lambda: parentjs('document.querySelector("iframe").clientHeight') >= min(2000,request('Runtime.evaluate',session_id=child_session,expression='document.querySelector(".widget-root").getBoundingClientRect().height',returnByValue=True)['result'].get('value',100))-1, 'host frame resize before input')
    nodes = request('Accessibility.getFullAXTree', session_id=child_session)['nodes']
    node = next(n for n in nodes if n.get('role',{}).get('value')==role and (name in n.get('name',{}).get('value','') if partial else name==n.get('name',{}).get('value')))
    request('DOM.scrollIntoViewIfNeeded', session_id=child_session, backendNodeId=node['backendDOMNodeId'])
    q = request('DOM.getBoxModel', session_id=child_session, backendNodeId=node['backendDOMNodeId'])['model']['content']
    offset = parentjs('(()=>{const r=document.querySelector("iframe").getBoundingClientRect();return {x:r.x,y:r.y,h:innerHeight}})()')
    y = sum(q[1::2])/4 + offset['y']
    if y>offset['h']-60 or y<40:
        parentjs('window.scrollBy(0,'+str(y-300)+')')
        offset = parentjs('(()=>{const r=document.querySelector("iframe").getBoundingClientRect();return {x:r.x,y:r.y}})()')
    click_parent_xy(sum(q[0::2])/4+offset['x'], sum(q[1::2])/4+offset['y'])

def click_parent(name):
    parentjs('window.scrollTo(0,0)')
    node = next(n for n in request('Accessibility.getFullAXTree')['nodes'] if n.get('role',{}).get('value')=='button' and n.get('name',{}).get('value')==name)
    q=request('DOM.getBoxModel',backendNodeId=node['backendDOMNodeId'])['model']['content']
    click_parent_xy(sum(q[0::2])/4,sum(q[1::2])/4)

def capture_card(name):
    until(lambda: parentjs('document.querySelector("iframe").clientHeight') >= request('Runtime.evaluate',session_id=child_session,expression='document.querySelector(".compact").getBoundingClientRect().height',returnByValue=True)['result'].get('value',100), 'inline content resize')
    box=parentjs('(()=>{const r=document.querySelector("iframe").getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,scale:1}})()')
    Path('.impeccable/review/'+name).write_bytes(base64.b64decode(request('Page.captureScreenshot',format='png',clip=box,captureBeyondViewport=True)['data']))

def fill_child(label, value):
    nodes=request('Accessibility.getFullAXTree',session_id=child_session)['nodes']
    node=next(n for n in nodes if n.get('role',{}).get('value')=='textbox' and n.get('name',{}).get('value')==label)
    request('DOM.focus',session_id=child_session,backendNodeId=node['backendDOMNodeId'])
    request('Input.dispatchKeyEvent',session_id=child_session,type='rawKeyDown',key='a',code='KeyA',windowsVirtualKeyCode=65,modifiers=2)
    request('Input.dispatchKeyEvent',session_id=child_session,type='keyUp',key='a',code='KeyA',windowsVirtualKeyCode=65,modifiers=2)
    request('Input.insertText',session_id=child_session,text=value)

def capture_workspace(name):
    parentjs('window.scrollTo(0,0)')
    width=int(parentjs('innerWidth'))
    height=int(parentjs('document.querySelector("iframe").clientHeight + document.querySelector("iframe").getBoundingClientRect().y + 40'))
    request('Emulation.setDeviceMetricsOverride',width=width,height=min(2600,height),deviceScaleFactor=1,mobile=width<760)
    request('Emulation.setPageScaleFactor',pageScaleFactor=1)
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

open_case('resource=workspace&view=topics',1440)
until(lambda:'Product design' in body(), 'topic navigation')
click_child('Product design',partial=True)
until(lambda:'Organize topic' in body(), 'scoped edit action')
click_child('Organize topic',role='DisclosureTriangle')
until(lambda:'Rename topic' in body(), 'current edit versions')
fill_child('Name','Useful methods')
until(lambda:request('Runtime.evaluate',session_id=child_session,expression='document.querySelector(".topic-editor input").value',returnByValue=True)['result'].get('value')=='Useful methods','native topic name input')
click_child('Rename topic')
until(lambda:'Topic renamed.' in body(), 'confirmed topic rename')
assert sum(r.get('name')=='widget_library_edit' for r in receipts())==1
click_child('Unpin topic')
until(lambda:'Pin topic' in body(), 'confirmed pin change')
fill_child('Alternative names','Useful workflow\nPractical methods')
click_child('Save folder and aliases')
until(lambda:'Topic folder and aliases saved.' in body(),'confirmed aliases')
assert sum(r.get('name')=='widget_library_edit' for r in receipts())==3
assert not any(r.get('name') in ['request_analysis','save_link','draft_project_suggestion'] for r in receipts())
passed('scoped topic rename, pin and aliases return canonical receipts without processing calls')
capture_workspace('topic-editor-desktop-bridge.png')

open_case('resource=workspace&view=topics&edit-lost-reply=1&edit-delay=1',1440)
until(lambda:'Product design' in body(),'recovery topic navigation')
click_child('Product design',partial=True)
until(lambda:'Organize topic' in body(),'recovery edit action')
click_child('Organize topic',role='DisclosureTriangle')
until(lambda:'Rename topic' in body(),'recovery current topic')
fill_child('Name','Recovered topic')
click_child('Rename topic')
until(lambda:sum(r.get('name')=='widget_library_edit' for r in receipts())==1,'outstanding edit call')
click_child('Organize topic',role='DisclosureTriangle')
until(lambda:request('Runtime.evaluate',session_id=child_session,expression='!document.querySelector(".topic-editor").open',returnByValue=True)['result'].get('value'),'collapse during save')
time.sleep(1.4)
click_child('Organize topic',role='DisclosureTriangle')
until(lambda:'Check change result' in body(),'unknown write recovery')
click_child('Organize topic',role='DisclosureTriangle')
click_child('Organize topic',role='DisclosureTriangle')
until(lambda:'Check change result' in body(),'lost reply recovery survives another collapse')
assert request('Runtime.evaluate',session_id=child_session,expression='document.querySelector(".topic-editor input").disabled || document.querySelector(".topic-editor fieldset").disabled',returnByValue=True)['result'].get('value')
assert sum(r.get('name')=='widget_library_edit' for r in receipts())==1
click_child('Check change result')
until(lambda:'Topic renamed.' in body(),'existing receipt reconciliation')
assert sum(r.get('name')=='widget_library_edit' for r in receipts())==1
assert sum(r.get('name')=='widget_library_receipt' for r in receipts())==1
passed('collapse during save and after a lost reply preserves the same request; receipt reconciliation sends no duplicate write')

open_case('resource=workspace&view=topics&editing=0',680)
until(lambda:'Product design' in body(),'read-only topic navigation')
click_child('Product design',partial=True)
until(lambda:'Source evidence' in body() or 'Designing a useful first experience' in body(),'read-only topic evidence')
assert not request('Runtime.evaluate',session_id=child_session,expression='!!document.querySelector(".topic-editor")',returnByValue=True)['result'].get('value')
assert not any(str(r.get('name','')).startswith('widget_library_') for r in receipts())
passed('read-only grants expose topic evidence and protected-app recovery without edit calls')

open_case('resource=workspace&view=topics&theme=dark',320)
until(lambda:'Product design' in body(),'narrow topic navigation')
click_child('Product design',partial=True)
until(lambda:'Organize topic' in body(),'narrow edit action')
click_child('Organize topic',role='DisclosureTriangle')
until(lambda:'Rename topic' in body(),'narrow editor loaded')
assert request('Runtime.evaluate',session_id=child_session,expression='!!document.querySelector(".widget-root.dark") && document.documentElement.scrollWidth <= innerWidth',returnByValue=True)['result'].get('value')
passed('the scoped topic editor keeps labelled fields within the320px dark viewport')
capture_workspace('topic-editor-mobile-bridge.png')

out=Path('.impeccable/review/widget-bridge-result.json')
out.parent.mkdir(parents=True,exist_ok=True)
out.write_text(json.dumps({'scope':'local production HTML + official AppBridge + synthetic tool projections; not real ChatGPT/Codex or OAuth acceptance','results':results},indent=2),encoding='utf-8')
print(json.dumps(results))

raw_cdp("Target.closeTarget",targetId=parent_target)
