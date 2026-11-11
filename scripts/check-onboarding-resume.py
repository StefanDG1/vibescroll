"""Native browser regression for partial-draft hydration. No signup or processing."""
import ipaddress
import argparse
import json
import subprocess
from pathlib import Path
from urllib.parse import urlparse

parser = argparse.ArgumentParser()
parser.add_argument("--url", default="http://127.0.0.2:3001/onboarding")
parser.add_argument("--output", required=True)
args = parser.parse_args()
url = urlparse(args.url)
try:
    local = url.hostname == "localhost" or ipaddress.ip_address(url.hostname or "").is_loopback
except ValueError:
    local = False
if (not local or
        url.path != "/onboarding" or url.query or url.fragment or url.port != 3001):
    raise SystemExit("Only the isolated local onboarding preview is allowed")


def run(code):
    result = subprocess.run(["browser-harness"], input=code, text=True,
                            encoding="utf-8", capture_output=True, timeout=35)
    if result.returncode:
        raise RuntimeError(result.stderr[-1800:] or result.stdout[-1800:])
    records = [line[7:] for line in result.stdout.splitlines() if line.startswith("RESUME:")]
    return json.loads(records[-1]) if records else None


target = run(f"import json\nt=new_tab({args.url!r})\nprint('RESUME:'+json.dumps(t))")
helpers = f"""
import time,json
switch_tab({target!r},activate=True)
def until(expression):
    end=time.monotonic()+8
    while not js(expression):
        if time.monotonic()>end:raise AssertionError(expression)
        time.sleep(.08)
def click(name,partial=False):
    ns=cdp('Accessibility.getFullAXTree')['nodes']
    n=next(n for n in ns if n.get('role',{{}}).get('value') in ['button','link','DisclosureTriangle'] and (n.get('name',{{}}).get('value','').startswith(name) if partial else n.get('name',{{}}).get('value')==name))
    b=n['backendDOMNodeId'];cdp('DOM.scrollIntoViewIfNeeded',backendNodeId=b)
    q=cdp('DOM.getBoxModel',backendNodeId=b)['model']['content']
    x,y=sum(q[0::2])/4,sum(q[1::2])/4
    hit=js(f'document.elementFromPoint({{x}},{{y}})?.closest("button,summary,a")?.innerText')
    if not hit or name not in hit:raise AssertionError('Control is covered: '+name)
    click_at_xy(x,y)
def type_field(name,value):
    end=time.monotonic()+8
    while True:
        ns=[n for n in cdp('Accessibility.getFullAXTree')['nodes'] if n.get('role',{{}}).get('value')=='textbox' and n.get('name',{{}}).get('value')==name]
        if ns:break
        if time.monotonic()>end:raise AssertionError('Missing textbox: '+name)
        time.sleep(.08)
    cdp('DOM.focus',backendNodeId=ns[0]['backendDOMNodeId'])
    cdp('Input.insertText',text=value)
def reload():
    goto_url({args.url!r});wait_for_load()
"""
cases = []
try:
    run(helpers + """
wait_for_load()
cdp('Emulation.setDeviceMetricsOverride',width=390,height=844,deviceScaleFactor=1,mobile=True)
until('document.documentElement.getAttribute("data-app-theme")!==null')
if any(n.get('name',{}).get('value')=='Reject analytics' and n.get('role',{}).get('value')=='button' for n in cdp('Accessibility.getFullAXTree')['nodes']):click('Reject analytics')
assert js('document.querySelector("h1").innerText')=='What catches your attention?', 'Use an unused local origin for this regression'
click('Development',True)
until('document.querySelectorAll("button[aria-pressed=true]").length===1')
""")
    run(helpers + """
reload()
until('document.querySelectorAll("button[aria-pressed=true]").length===1')
assert js('document.querySelector("h1").innerText')=='What catches your attention?'
click('Continue')
until('document.querySelector("h1")?.innerText==="What would you like to do?"')
click('Build faster',True)
until('document.querySelector("button[aria-pressed=true]")?.innerText.includes("Build faster")')
""")
    cases.append("incomplete interests survive hydration without advancing")
    run(helpers + """
reload()
until('document.querySelector("h1")?.innerText==="What would you like to do?" && document.querySelector("button[aria-pressed=true]")?.innerText.includes("Build faster")')
click('Back',True)
until('document.querySelector("h1")?.innerText==="What catches your attention?"')
click('Development',True);click('Another topic?')
type_field('Your interest','Developer education')
until('[...document.querySelectorAll("button")].some(b=>b.innerText.includes("Continue")&&!b.disabled)')
click('Continue')
until('document.querySelector("h1")?.innerText==="What would you like to do?"')
click('Find my posts',True)
until('document.querySelector("h1")?.innerText==="A good place to start."')
""")
    cases.append("goal and exact step survive reload; custom-only topic continues")
    run(helpers + """
click('Start with my own link')
type_field('Public video link','https://www.instagram.com/reel/AbCdEfG1234/?tracking=drop')
until('[...document.querySelectorAll("button")].some(b=>b.innerText.includes("Continue with my link")&&!b.disabled)')
""")
    run(helpers + """
reload()
until('document.querySelector("h1")?.innerText==="A good place to start."')
click('Start with my own link')
until('document.querySelector("input[type=url]")?.value==="https://www.instagram.com/reel/AbCdEfG1234/"')
assert js('document.documentElement.scrollWidth')<=js('innerWidth')+1
""")
    cases.append("own link survives reload with tracking removed and no submission")
finally:
    run(f"switch_tab({target!r},activate=False)\nclose_tab({target!r})")
Path(args.output).parent.mkdir(parents=True, exist_ok=True)
Path(args.output).write_text(json.dumps({"passed": True, "cases": cases,
    "noSignup": True, "noProcessing": True}, indent=2), encoding="utf-8")
print(json.dumps({"passed": True, "cases": len(cases)}))
