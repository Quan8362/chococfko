# -*- coding: utf-8 -*-
"""
approve-grammar-wave.py  (grammar counterpart of approve-wave.py)

Publishes a previously-imported grammar wave: flips is_published false -> true
for every draft row whose source_id matches this wave's prefix.

Usage (run from web/):
  python scripts/approve-grammar-wave.py --input data/japanese/grammar/n5-wave01.json
"""

import os, sys, json, argparse, urllib.request, urllib.error, urllib.parse

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ENV_FILE = os.path.join(os.path.dirname(__file__), "..", ".env.local")


def load_env():
    env = {}
    with open(os.path.abspath(ENV_FILE), encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    args = ap.parse_args()

    with open(args.input, encoding="utf-8") as f:
        wave = json.load(f)
    level = wave["level"]
    wave_no = int(wave["wave"])
    prefix = f"grammar-{level.lower()}-w{wave_no:02d}-"

    env = load_env()
    URL = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
    KEY = env["SUPABASE_SERVICE_ROLE_KEY"]

    # PATCH all draft rows of this wave -> published
    path = (f"/rest/v1/japanese_grammar"
            f"?source_id=like.{urllib.parse.quote(prefix)}*"
            f"&is_published=eq.false")
    payload = json.dumps({"is_published": True}).encode("utf-8")
    req = urllib.request.Request(
        URL + path, data=payload, method="PATCH",
        headers={
            "apikey": KEY,
            "Authorization": f"Bearer {KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
    )
    try:
        with urllib.request.urlopen(req) as resp:
            rows = json.loads(resp.read().decode("utf-8"))
            print(f"Approved/published {len(rows)} rows for {level} wave {wave_no}.")
    except urllib.error.HTTPError as e:
        print(f"ERROR: HTTP {e.code} - {e.read().decode()[:300]}")


if __name__ == "__main__":
    main()
