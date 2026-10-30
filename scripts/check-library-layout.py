"""Browser-harness geometry regression for the read-only Library demo."""
import argparse
import json
from pathlib import Path
import subprocess
from urllib.parse import urlparse

parser = argparse.ArgumentParser()
parser.add_argument("--url", default="http://127.0.0.1:3001/demo?view=library")
parser.add_argument("--output", required=True)
args = parser.parse_args()
url = urlparse(args.url)
if url.path != "/demo" or url.hostname not in ("127.0.0.1", "localhost", "scroll.companynerve.com"):
    raise SystemExit("Only the read-only Library demo is allowed.")


def run(code):
    result = subprocess.run(["browser-harness"], input=code, text=True,
                            encoding="utf-8", capture_output=True, timeout=35)
    if result.returncode:
        raise RuntimeError(result.stderr[-1600:] or result.stdout[-1600:])
    lines = [line for line in result.stdout.splitlines() if line.startswith("LAYOUT:")]
    return json.loads(lines[-1][7:]) if lines else None


target = run(f"""
import json
t = new_tab({args.url!r})
print('LAYOUT:' + json.dumps(t))
""")
run(f"activate_tab({target!r})\ncdp('Emulation.setFocusEmulationEnabled', enabled=True)")
run("""
import time
wait_for_load()
deadline=time.monotonic()+12
while js("document.documentElement.getAttribute('data-app-theme')") not in ('light','dark'):
    if time.monotonic()>deadline: raise AssertionError('Library client did not hydrate')
    time.sleep(.1)
""")
prefix = f"if current_tab().get('targetId') != {target!r}: switch_tab({target!r}, activate=False)\n"
cases = []
try:
    for width in (1440, 390):
        for theme in ("light", "dark"):
            run(prefix + f"""
cdp('Emulation.setDeviceMetricsOverride', width={width}, height=1000, deviceScaleFactor=1, mobile=False)
js("document.documentElement.dataset.appTheme = '{theme}'")
""")
            for representation in ("Tree", "Folders"):
                run(prefix + f"""
import time
deadline = time.monotonic() + 12
while True:
    nodes = cdp('Accessibility.getFullAXTree')['nodes']
    button = next((n for n in nodes if n.get('role',{{}}).get('value') == 'button' and n.get('name',{{}}).get('value') == {representation!r}), None)
    if button: break
    if time.monotonic() > deadline: raise AssertionError('Library did not load')
    time.sleep(.1)
cdp('DOM.scrollIntoViewIfNeeded', backendNodeId=button['backendDOMNodeId'])
q = cdp('DOM.getBoxModel', backendNodeId=button['backendDOMNodeId'])['model']['content']
click_at_xy(sum(q[0::2])/4, sum(q[1::2])/4)
""")
                metrics = run(prefix + f"expected_mode = {representation!r}\n" + """
import json, time
deadline = time.monotonic() + 12
while True:
    result = js('''(() => {
      const cards = Array.from(document.querySelectorAll('.hybrid-node-card'))
        .filter(e => !e.closest('[inert], [aria-hidden="true"]'))
        .map(e => {
          const card=e.getBoundingClientRect(), button=e.querySelector('.hybrid-node').getBoundingClientRect();
          const label=e.querySelector('strong').getBoundingClientRect();
          return {width:card.width,height:card.height,buttonHeight:button.height,
            labelWidth:label.width,labelHeight:label.height,containsButton:card.bottom+1>=button.bottom};
        });
      return {cards,viewport:document.documentElement.clientWidth,page:document.documentElement.scrollWidth,
        representation:document.querySelector('.hybrid-library').classList.contains('hybrid-folders')?'Folders':'Tree'};
    })()''')
    if result['cards'] and result['representation'] == expected_mode: break
    if time.monotonic() > deadline: raise AssertionError('No visible topic cards')
    time.sleep(.1)
print('LAYOUT:' + json.dumps(result))
""")
                case = {"width": width, "theme": theme, "representation": representation, **metrics}
                cases.append(case)
                assert metrics["representation"] == representation, case
                assert metrics["page"] <= metrics["viewport"] + 1, case
                assert all(c["width"] >= 100 and c["height"] >= 44 and
                           c["labelWidth"] >= 50 and c["labelHeight"] >= 14 and
                           c["containsButton"] for c in metrics["cards"]), case
    print(json.dumps({"passed": True, "cases": len(cases)}))
finally:
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    Path(args.output).write_text(json.dumps(cases, indent=2) + "\n", encoding="utf-8")
    run(prefix + "cdp('Emulation.setFocusEmulationEnabled', enabled=False)\n" +
        f"cdp('Target.closeTarget', targetId={target!r})")
