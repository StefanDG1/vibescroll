"""Read-only pricing and theme-contrast checks through browser-harness."""
import argparse
import json
import re
import subprocess
from pathlib import Path
from urllib.parse import urlparse

parser = argparse.ArgumentParser()
parser.add_argument("--url", required=True)
parser.add_argument("--output", required=True)
args = parser.parse_args()
url = urlparse(args.url)
local = url.hostname in ("localhost", "127.0.0.1")
if url.path != "/pricing" or not (local or url.hostname == "scroll.companynerve.com" or (url.hostname or "").endswith(".vercel.app")) or url.scheme not in (("http", "https") if local else ("https",)):
    raise SystemExit("Only the read-only VibeScroll pricing route is allowed.")
offer = json.loads((Path(__file__).resolve().parent.parent / "contracts/pro-pricing-candidate.json").read_text(encoding="utf-8"))
output = Path(args.output)
output.parent.mkdir(parents=True, exist_ok=True)


def run(code):
    result = subprocess.run(["browser-harness"], input=code, text=True, encoding="utf-8", capture_output=True, timeout=35)
    if result.returncode:
        raise RuntimeError(result.stderr[-1800:] or result.stdout[-1800:])
    values = [line[6:] for line in result.stdout.splitlines() if line.startswith("PRICE:")]
    return json.loads(values[-1]) if values else None


def luminance(color):
    values = [float(x) / 255 for x in re.findall(r"[\d.]+", color)[:3]]
    assert len(values) == 3, "Expected opaque RGB colors"
    linear = [x / 12.92 if x <= .04045 else ((x + .055) / 1.055) ** 2.4 for x in values]
    return sum(x * w for x, w in zip(linear, [.2126, .7152, .0722]))


target = run(f"import json\nt=new_tab({args.url!r})\nprint('PRICE:'+json.dumps(t))")
cases = []
try:
    run(f"activate_tab({target!r})\ncdp('Emulation.setFocusEmulationEnabled',enabled=True)\nwait_for_load()")
    for width, height in ((1440, 900), (390, 844)):
        for theme in ("light", "dark"):
            value = run(f"""
import json,base64
from pathlib import Path
activate_tab({target!r})
cdp('Emulation.setDeviceMetricsOverride',width={width},height={height},deviceScaleFactor=1,mobile=False)
js("document.documentElement.dataset.appTheme='{theme}'")
x=js('''(() => {{
 const p=document.querySelector('.panel'), s=getComputedStyle(p);
 return {{title:document.querySelector('h1')?.textContent,body:document.body.innerText,
 width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,
 proSections:document.querySelectorAll('[aria-label="Pro pricing"]').length,
 color:s.color,background:s.backgroundColor,
 link:document.querySelector('a[href="/app?view=billing&tier=pro"]')?.getAttribute('href')}};
}})()''')
Path({str(output.parent / f'pricing-{width}-{theme}.png')!r}).write_bytes(base64.b64decode(cdp('Page.captureScreenshot',format='png',captureBeyondViewport=False)['data']))
print('PRICE:'+json.dumps(x))
""")
            assert value["title"] == "One Pro plan. Choose your renewal."
            assert value["proSections"] == 1 and value["scroll"] <= value["width"] + 1
            for plan in offer["plans"]:
                assert "\u20ac" + str(plan["amountCents"] // 100) in value["body"]
                assert str(plan["credits"]) in value["body"]
            assert not any(x in value["body"] for x in ("Starter", "GB retained", "fifteen repositories"))
            assert value["link"] == "/app?view=billing&tier=pro"
            a, b = sorted([luminance(value["color"]), luminance(value["background"])])
            contrast = (b + .05) / (a + .05)
            assert contrast >= 4.5, f"Unreadable {theme} Pro card: {contrast}"
            cases.append({"width": width, "theme": theme, "contrast": round(contrast, 2), "pass": True})
    output.write_text(json.dumps({"url": args.url, "cases": cases}, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"passed": len(cases), "output": str(output)}))
finally:
    run(f"cdp('Target.closeTarget',targetId={target!r})")
