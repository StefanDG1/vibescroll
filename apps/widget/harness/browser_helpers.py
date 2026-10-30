"""Run inside browser-harness, never against a live account or server."""
import json
import time
import base64
from pathlib import Path

HARNESS_PORT = globals().get("HARNESS_PORT", 4318)
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
    # Coordinate input goes through the owning page's browser-harness session.
    # Child CDP sessions inspect the sandbox; they are not the input surface.
    switch_tab(parent_target, activate=False)
    click_at_xy(x,y)


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
        own = next((t for t in list_tabs() if t.get('url','').startswith(f'http://127.0.0.1:{HARNESS_PORT}/harness/')), None)
        parent_target = own['targetId'] if own else new_tab(f'http://127.0.0.1:{HARNESS_PORT}/harness/')
        parent_session = raw_cdp('Target.attachToTarget',targetId=parent_target,flatten=True)['sessionId']
        request('Emulation.setFocusEmulationEnabled',enabled=True)
    switch_tab(parent_target, activate=False)
    url=f'http://127.0.0.1:{HARNESS_PORT}/harness/?' + params
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

def passed(name):
    results.append({'name':name,'passed':True})
