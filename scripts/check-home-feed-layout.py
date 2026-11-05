"""Read-only browser-harness regression for the synthetic Home feed."""
import argparse
import json
import subprocess
import sys
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
primary_failure = None
try:
    run(f"switch_tab({target!r},activate=True)\ncdp('Emulation.setFocusEmulationEnabled',enabled=True)")
    run("""
assert wait_for_load(timeout=12)
assert js("document.querySelectorAll('[data-feed-post]').length")==2
""")
    prefix = f"if current_tab().get('targetId')!={target!r}:switch_tab({target!r},activate=False)\n"
    for width in (1440, 390):
        for theme in ("light", "dark"):
            run(prefix + f"""
cdp('Emulation.setDeviceMetricsOverride',width={width},height=900,deviceScaleFactor=1,mobile=False)
js("document.documentElement.dataset.appTheme='{theme}';document.documentElement.classList.toggle('dark','{theme}'==='dark');document.documentElement.style.colorScheme='{theme}';window.scrollTo({{top:0,behavior:'instant'}})")
""")
            case = run(prefix + """
import json
m=js('''(()=>{const a=document.querySelector('[data-feed-post]'),c=a.firstElementChild,cols=[...a.querySelectorAll('[data-feed-column]')],nav=document.querySelector('.mobile-nav'),mobile=innerWidth<721,next=document.querySelectorAll('[data-feed-post]')[1],source=cols[0].getBoundingClientRect(),insights=cols[1].getBoundingClientRect();return {width:innerWidth,height:innerHeight,pageWidth:document.documentElement.scrollWidth,display:getComputedStyle(c).display,columns:cols.map(e=>({height:e.getBoundingClientRect().height,overflow:getComputedStyle(e).overflowY})),cueBottom:a.querySelector('[class*=mobileCue]').getBoundingClientRect().bottom,navTop:nav.getBoundingClientRect().top,peek:mobile?nav.getBoundingClientRect().top-insights.top:innerHeight-next.getBoundingClientRect().top,headerHidden:getComputedStyle(document.querySelector('.product-top')).display==='none',destinations:document.querySelectorAll('.mobile-nav button').length,snap:getComputedStyle(document.documentElement).scrollSnapType,engagement:!!a.querySelector('[data-slot=post-engagement]'),sourceBottom:source.bottom,composerHeight:a.querySelector('textarea').getBoundingClientRect().height};})()''')
assert m['pageWidth']<=m['width'],m
assert all(v['height']<=m['height'] for v in m['columns']),m
assert m['peek']>=20 and m['peek']<=65,m
assert m['snap'].startswith('y') and m['engagement'],m
assert m['composerHeight']<=48,m
assert m['headerHidden'] and m['destinations']==5,m
if m['width']<721:
    assert m['cueBottom']<=m['navTop'],m
    plan=js("(()=>{const a=document.querySelector('[data-feed-column=plans]');return {lane:a.clientHeight,card:a.querySelector('[data-expanded=true]').getBoundingClientRect().height};})()")
    assert plan['card']>=plan['lane']*.65,plan
    m['mobilePlan']=plan
print('FEED:'+json.dumps(m))
""")
            assert case["width"] == width, case
            case["theme"] = theme
            cases.append(case)
except BaseException as failure:
    primary_failure = failure
    raise
finally:
    try:
        run(f"""
if current_tab().get('targetId')!={target!r}:switch_tab({target!r},activate=False)
cdp('Emulation.clearDeviceMetricsOverride')
cdp('Emulation.setFocusEmulationEnabled',enabled=False)
close_tab({target!r})
""")
    except Exception as cleanup_failure:
        if primary_failure is None:
            raise
        print(f"Owned-tab cleanup also failed: {cleanup_failure}", file=sys.stderr)
Path(args.output).write_text(json.dumps({"passed": True, "cases": cases}, indent=2), encoding="utf-8")
print(json.dumps({"passed": True, "cases": len(cases)}))
