"""Run built UI checks through browser-harness, one native action per CLI boundary.

Usage: python apps/widget/harness/compact-check.py
The Vite harness must already be running locally on port4319. Synthetic data only.
"""
import ast
import hashlib
import sys
import time
import json
from pathlib import Path
import shutil
import subprocess

case_file = Path("apps/widget/harness/compact-cases.py")
source = case_file.read_text(encoding="utf-8")
tree = ast.parse(source)
first_case = next(i for i, node in enumerate(tree.body) if isinstance(node, ast.Expr) and isinstance(node.value, ast.Call) and isinstance(node.value.func, ast.Name) and node.value.func.id == "card")
prelude = "\n".join(ast.get_source_segment(source, node) for node in tree.body[:first_case])
functions = {node.name: node for node in tree.body if isinstance(node, ast.FunctionDef)}
statements = []
for node in tree.body[first_case:]:
    if isinstance(node, ast.Expr) and isinstance(node.value, ast.Call) and isinstance(node.value.func, ast.Name) and node.value.func.id in ["compose", "goal"]:
        pending = functions[node.value.func.id].body
        if node.value.func.id == "goal":
            statements += ["click_child('What would you like to improve?', role='textbox')", "raw_cdp('Input.insertText', text='Improve the first useful result before requesting setup.')"]
        else:
            for part in pending:
                if isinstance(part, ast.Expr) and isinstance(part.value, ast.Call) and isinstance(part.value.func, ast.Name) and part.value.func.id == "goal":
                    statements += ["click_child('What would you like to improve?', role='textbox')", "raw_cdp('Input.insertText', text='Improve the first useful result before requesting setup.')"]
                else: statements.append(ast.get_source_segment(source, part))
    else: statements.append(ast.get_source_segment(source, node))

if "--progress-only" in sys.argv:
    start = next(i for i,s in enumerate(statements) if s.startswith("open_case('resource=card&job=waiting'"))
    end = next(i for i,s in enumerate(statements[start+1:],start+1) if s.startswith("open_case('resource=export'"))
    statements = statements[start:end] + ["Path('outputs/redesign-20261030/compact-progress-protocol-results.json').write_text(json.dumps(results,indent=2),encoding='utf-8')", "raw_cdp('Target.closeTarget',targetId=parent_target)"]

state_file = Path("outputs/redesign-20261030/compact-protocol-state.json")
if state_file.exists(): state_file.unlink()
executable = shutil.which("browser-harness")
if not executable: raise RuntimeError("browser-harness is required")
artifact = Path("packages/widget/resources.generated.ts")
artifact_hash = hashlib.sha256(artifact.read_bytes()).hexdigest()
artifact_mtime = artifact.stat().st_mtime_ns
for index, statement in enumerate(statements):
    if artifact.stat().st_mtime_ns != artifact_mtime or hashlib.sha256(artifact.read_bytes()).hexdigest() != artifact_hash:
        raise RuntimeError("Built UI changed during protocol checks; stop local builds and use one frozen artifact.")
    if statement.startswith("until(lambda: 'Check latest status'"): time.sleep(6)
    code = prelude + "\n" + f"_state_path=Path({str(state_file)!r})\nif _state_path.exists(): globals().update(json.loads(_state_path.read_text(encoding='utf-8')))\n"
    code += statement + "\n"
    code += "_saved={k:globals()[k] for k in ['results','count','writes','parent_target','parent_session','child_session'] if k in globals()}\n_state_path.write_text(json.dumps(_saved),encoding='utf-8')\n"
    result = subprocess.run([executable],input=code,text=True,encoding="utf-8",capture_output=True,timeout=35)
    if result.returncode:
        print(f"Failed compact browser step {index+1}: {statement[:180]}",flush=True)
        print(result.stdout,flush=True)
        print(result.stderr[-5000:],flush=True)
        raise SystemExit(result.returncode)
    if statement.startswith("note(") or statement.startswith("print("):
        print(result.stdout.strip(),flush=True)
print("Compact protocol acceptance completed.",flush=True)
