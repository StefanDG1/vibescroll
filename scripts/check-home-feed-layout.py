"""Read-only browser-harness regression for the synthetic Home feed."""
import argparse
import json
import subprocess
from pathlib import Path
from urllib.parse import urlparse

parser = argparse.ArgumentParser()
parser.add_argument("--url", default="http://127.0.0.1:3001/demo")
parser.add_argument("--output", required=True)
args = parser.parse_args()
url = urlparse(args.url)
if url.path != "/demo" or url.query or url.hostname not in ("127.0.0.1", "localhost", "scroll.companynerve.com"):
    raise SystemExit("Only the read-only Home demo is allowed.")


def run(code):
    result = subprocess.run(["browser-harness"], input=code, text=True,
                            encoding="utf-8", capture_output=True, timeout=35)
    if result.returncode:
        raise RuntimeError(result.stderr[-1800:] or result.stdout[-1800:])
    values = [line[5:] for line in result.stdout.splitlines() if line.startswith("FEED:")]
    return json.loads(values[-1]) if values else None


target = run(f"import json\nt=new_tab({args.url!r})\nprint('FEED:'+json.dumps(t))")
cases = []
try:
    run(f"activate_tab({target!r})\ncdp('Emulation.setFocusEmulationEnabled',enabled=True)")
    run("""
assert wait_for_load(timeout=12)
assert js("document.querySelectorAll('[data-feed-post]').length")==2
""")
    prefix = f"if current_tab().get('targetId')!={target!r}:switch_tab({target!r},activate=False)\n"
    for width in (1440, 390):
        for theme in ("light", "dark"):
            run(prefix + f"""
cdp('Emulation.setDeviceMetricsOverride',width={width},height=900,deviceScaleFactor=1,mobile=False)
js("document.documentElement.dataset.appTheme='{theme}';window.scrollTo(0,0)")
""")
            case = run(prefix + """
import json
m=js('''(()=>{const a=document.querySelector('[data-feed-post]'),c=a.firstElementChild;return {width:innerWidth,pageWidth:document.documentElement.scrollWidth,display:getComputedStyle(c).display,overflow:[...c.children].map(e=>getComputedStyle(e).overflowY),cueBottom:a.querySelector('a[href^="#"]').getBoundingClientRect().bottom,navTop:document.querySelector('.mobile-nav').getBoundingClientRect().top,headerHidden:getComputedStyle(document.querySelector('.product-top')).display==='none',destinations:document.querySelectorAll('.mobile-nav button').length};})()''')
assert m['pageWidth']<=m['width'],m
assert all(v=='visible' for v in m['overflow']),m
assert m['headerHidden'] and m['destinations']==5,m
if m['width']<721:assert m['cueBottom']<=m['navTop'],m
print('FEED:'+json.dumps(m))
""")
            assert case["width"] == width, case
            case["theme"] = theme
            cases.append(case)
finally:
    run(f"""
if current_tab().get('targetId')!={target!r}:switch_tab({target!r},activate=False)
cdp('Emulation.clearDeviceMetricsOverride')
cdp('Emulation.setFocusEmulationEnabled',enabled=False)
close_tab({target!r})
""")
Path(args.output).write_text(json.dumps({"passed": True, "cases": cases}, indent=2), encoding="utf-8")
print(json.dumps({"passed": True, "cases": len(cases)}))
