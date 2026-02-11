#!/usr/bin/env python3
import argparse
import json
import os
import re
import statistics
import subprocess
import sys
import time
from pathlib import Path


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def find_fallback_candidates(cwd: Path):
    home = Path.home()
    xdg = Path(os.getenv("XDG_CONFIG_HOME", str(home / ".config")))
    return [
        cwd / ".opencode" / "rate-limit-fallback.json",
        cwd / "rate-limit-fallback.json",
        home / ".opencode" / "rate-limit-fallback.json",
        xdg / "opencode" / "rate-limit-fallback.json",
    ]


def fallback_doctor(cwd: Path):
    candidates = find_fallback_candidates(cwd)
    found = [p for p in candidates if p.exists()]
    if not found:
        print("FAIL: no fallback config found")
        for p in candidates:
            print(f"  - {p}")
        return 1

    selected = found[0]
    data = load_json(selected)
    models = data.get("fallbackModels", [])
    if not isinstance(models, list) or not models:
        print(f"FAIL: fallbackModels empty in {selected}")
        return 1

    bad = []
    for i, m in enumerate(models):
        if not isinstance(m, dict) or not m.get("providerID") or not m.get("modelID"):
            bad.append(i)
    if bad:
        print(f"FAIL: invalid fallback entries at indexes {bad} in {selected}")
        return 1

    print(f"OK: fallback config {selected}")
    print(f"OK: fallbackModels count = {len(models)}")
    return 0


def plugin_health(opencode_json: Path):
    if not opencode_json.exists():
        print(f"FAIL: missing {opencode_json}")
        return 1

    data = load_json(opencode_json)
    plugins = data.get("plugin", [])
    if not isinstance(plugins, list):
        print("FAIL: plugin field is not a list")
        return 1

    seen = set()
    dup = []
    for p in plugins:
        if p in seen:
            dup.append(p)
        seen.add(p)
    if dup:
        print(f"FAIL: duplicate plugins: {dup}")
        return 1

    known_bad = [p for p in plugins if p.startswith("opencode-token-monitor@")] 
    if known_bad:
        print("WARN: opencode-token-monitor has known Windows ENOENT issues in this setup")
        for p in known_bad:
            print(f"  - {p}")

    print(f"OK: plugin list valid ({len(plugins)} entries)")
    return 0


def runbook(log_file: Path):
    if not log_file.exists():
        print(f"FAIL: missing log file {log_file}")
        return 1
    text = log_file.read_text(encoding="utf-8", errors="ignore")

    rules = [
        (r"fallbackModels is empty|No fallback models configured", "Create project-local rate-limit-fallback.json in .opencode/ and repo root."),
        (r"Model not found: anthropic/haiku", "Replace with anthropic/claude-haiku-4-5."),
        (r"Cannot find package 'react'.*zustand", "Upgrade/remove problematic plugin and retry with clean cache."),
        (r"BunInstallFailedError|EBUSY", "Close concurrent opencode runs and retry once; lock contention on cache."),
        (r"ENOENT: no such file or directory, mkdir.*opencode-token-monitor", "Disable opencode-token-monitor or switch analytics plugin."),
    ]

    hits = 0
    for pattern, fix in rules:
        if re.search(pattern, text, re.IGNORECASE | re.DOTALL):
            hits += 1
            print(f"MATCH: {pattern}")
            print(f"FIX:   {fix}")

    if hits == 0:
        print("No known runbook signatures found.")
    return 0


def eval_harness(model: str, runs: int, cwd: Path):
    lat = []
    ok = 0
    for i in range(runs):
        start = time.time()
        proc = subprocess.run(
            ["opencode", "run", "Reply exactly with OK", f"--model={model}"],
            cwd=str(cwd),
            capture_output=True,
            text=True,
            timeout=120,
        )
        elapsed = time.time() - start
        lat.append(elapsed)
        out = (proc.stdout or "") + "\n" + (proc.stderr or "")
        if proc.returncode == 0 and "OK" in out:
            ok += 1
        else:
            print(f"run {i+1}: FAIL")

    print(f"success_rate={ok}/{runs}")
    if lat:
        print(f"latency_mean_s={statistics.mean(lat):.2f}")
        print(f"latency_p95_s={sorted(lat)[max(0, int(len(lat)*0.95)-1)]:.2f}")
    return 0 if ok == runs else 1


def proofcheck(cwd: Path):
    checks = [
        (["git", "status", "--short"], "git_status"),
        (["python", "-m", "pytest", "-q"], "tests"),
    ]
    rc = 0
    for cmd, name in checks:
        try:
            proc = subprocess.run(cmd, cwd=str(cwd), capture_output=True, text=True, timeout=300)
            print(f"[{name}] exit={proc.returncode}")
            if name == "git_status" and proc.returncode == 0:
                lines = [l for l in (proc.stdout or "").splitlines() if l.strip()]
                print(f"[{name}] changed_files={len(lines)}")
            if name == "tests" and proc.returncode != 0:
                rc = 1
        except Exception as e:
            print(f"[{name}] error={e}")
            if name == "tests":
                rc = 1
    return rc


def memory_graph(log_dir: Path, out_file: Path):
    nodes = {}
    edges = []
    err_re = re.compile(r"ERROR\s+.*message=(.+?)\s+(?:code=|fatal|$)", re.IGNORECASE)

    for p in sorted(log_dir.glob("*.log"))[-200:]:
        txt = p.read_text(encoding="utf-8", errors="ignore")
        sid = p.stem
        nodes.setdefault(sid, {"id": sid, "type": "session"})
        for m in err_re.findall(txt):
            k = m.strip()[:200]
            eid = f"err:{k}"
            nodes.setdefault(eid, {"id": eid, "type": "error", "label": k})
            edges.append({"from": sid, "to": eid, "type": "has_error"})

    graph = {"nodes": list(nodes.values()), "edges": edges}
    out_file.parent.mkdir(parents=True, exist_ok=True)
    out_file.write_text(json.dumps(graph, indent=2), encoding="utf-8")
    print(f"OK: wrote {out_file} with {len(graph['nodes'])} nodes and {len(graph['edges'])} edges")
    return 0


def main():
    parser = argparse.ArgumentParser(description="OpenCode Ops Kit")
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("fallback-doctor")

    ph = sub.add_parser("plugin-health")
    ph.add_argument("--config", default=str(Path.home() / ".config" / "opencode" / "opencode.json"))

    rb = sub.add_parser("runbook")
    rb.add_argument("--log", required=True)

    ev = sub.add_parser("eval-harness")
    ev.add_argument("--model", default="anthropic/claude-haiku-4-5")
    ev.add_argument("--runs", type=int, default=3)
    ev.add_argument("--cwd", default=os.getcwd())

    pc = sub.add_parser("proofcheck")
    pc.add_argument("--cwd", default=os.getcwd())

    mg = sub.add_parser("memory-graph")
    mg.add_argument("--log-dir", default=str(Path.home() / ".local" / "share" / "opencode" / "log"))
    mg.add_argument("--out", default=str(Path.home() / ".local" / "share" / "opencode" / "memory-graph.json"))

    args = parser.parse_args()

    if args.cmd == "fallback-doctor":
        raise SystemExit(fallback_doctor(Path(os.getcwd())))
    if args.cmd == "plugin-health":
        raise SystemExit(plugin_health(Path(args.config)))
    if args.cmd == "runbook":
        raise SystemExit(runbook(Path(args.log)))
    if args.cmd == "eval-harness":
        raise SystemExit(eval_harness(args.model, args.runs, Path(args.cwd)))
    if args.cmd == "proofcheck":
        raise SystemExit(proofcheck(Path(args.cwd)))
    if args.cmd == "memory-graph":
        raise SystemExit(memory_graph(Path(args.log_dir), Path(args.out)))


if __name__ == "__main__":
    main()
