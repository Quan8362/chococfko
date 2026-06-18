# -*- coding: utf-8 -*-
"""Idempotently add 図面 (ずめん / drawing, blueprint) to japanese_words.

Checks if the word already exists (any review/publish status):
  - missing        -> INSERT a published, approved entry
  - exists hidden  -> PATCH to publish + approve
  - exists visible -> no-op
Reads Supabase credentials from .env.local (same pattern as the import scripts).
"""

import os, sys, json, urllib.request, urllib.error, urllib.parse

ENV_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env.local")

env = {}
with open(ENV_FILE, encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")

SUPABASE_URL = env.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
SERVICE_KEY = env.get("SUPABASE_SERVICE_ROLE_KEY", "")
if not SUPABASE_URL or not SERVICE_KEY:
    print("ERROR: Missing SUPABASE_URL or SERVICE_KEY in .env.local")
    sys.exit(1)

HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
}

WORD = "図面"

def req(method, path, payload=None, extra_headers=None):
    headers = dict(HEADERS)
    if extra_headers:
        headers.update(extra_headers)
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    r = urllib.request.Request(SUPABASE_URL + path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(r) as resp:
            body = resp.read().decode("utf-8")
            return resp.status, json.loads(body) if body else None
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8")

# 1. Look up existing rows for this exact word
status, rows = req(
    "GET",
    f"/rest/v1/japanese_words?word=eq.{urllib.parse.quote(WORD)}"
    "&select=id,word,reading,is_published,review_status",
)
print(f"GET existing -> {status}: {rows}")

if isinstance(rows, list) and len(rows) > 0:
    hidden = [r for r in rows if not r.get("is_published") or r.get("review_status") != "approved"]
    if not hidden:
        print("Already present and published — nothing to do.")
        sys.exit(0)
    ids = ",".join(r["id"] for r in hidden)
    status, res = req(
        "PATCH",
        f"/rest/v1/japanese_words?id=in.({ids})",
        {"is_published": True, "review_status": "approved"},
        {"Prefer": "return=representation"},
    )
    print(f"PATCH publish -> {status}: published {len(res) if isinstance(res, list) else res} row(s)")
    sys.exit(0)

# 2. Insert a new entry
row = {
    "word": "図面",
    "reading": "ずめん",
    "romaji": "zumen",
    "jlpt_level": "N2",
    "pos": ["noun"],
    "meanings": [{"vi": "bản vẽ, bản vẽ kỹ thuật", "en": "drawing, plan, blueprint"}],
    "examples": [{
        "ja": "設計図面を確認してください。",
        "reading": "せっけいずめんをかくにんしてください。",
        "vi": "Hãy kiểm tra bản vẽ thiết kế.",
        "en": "Please check the design drawing.",
    }],
    "tags": ["N2", "noun", "work"],
    "search_text": "図面 ずめん zumen bản vẽ bản vẽ kỹ thuật drawing plan blueprint",
    "vi_search_text": "ban ve ban ve ky thuat drawing plan blueprint",
    "has_vi_meaning": True,
    "frequency": 340,
    "is_published": True,
    "review_status": "approved",
    "source": "self",
}
status, res = req("POST", "/rest/v1/japanese_words", row, {"Prefer": "return=representation"})
print(f"POST insert -> {status}: {res}")
sys.exit(0 if status in (200, 201) else 1)
