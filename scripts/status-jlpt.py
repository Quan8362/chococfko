# -*- coding: utf-8 -*-
"""Report japanese_words counts by jlpt_level + review_status/is_published."""
import os, urllib.request, urllib.parse, json

ENV_FILE = os.path.join(os.path.dirname(__file__), "..", ".env.local")
env = {}
with open(ENV_FILE, encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")

BASE = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/") + "/rest/v1/japanese_words"
KEY = env["SUPABASE_SERVICE_ROLE_KEY"]

def count(params):
    url = BASE + "?" + urllib.parse.urlencode(params, safe="().,")
    req = urllib.request.Request(url, method="HEAD", headers={
        "apikey": KEY, "Authorization": "Bearer " + KEY,
        "Prefer": "count=exact", "Range-Unit": "items", "Range": "0-0",
    })
    with urllib.request.urlopen(req) as r:
        cr = r.headers.get("Content-Range", "*/0")
        return int(cr.split("/")[-1])

levels = ["N5", "N4", "N3", "N2", "N1"]
print(f"{'level':6} {'total':>7} {'published':>10} {'approved':>9} {'ai_draft':>9}")
for lvl in levels:
    total = count({"select": "id", "jlpt_level": f"eq.{lvl}"})
    pub = count({"select": "id", "jlpt_level": f"eq.{lvl}", "is_published": "eq.true"})
    appr = count({"select": "id", "jlpt_level": f"eq.{lvl}", "review_status": "eq.approved"})
    draft = count({"select": "id", "jlpt_level": f"eq.{lvl}", "review_status": "eq.ai_draft"})
    print(f"{lvl:6} {total:>7} {pub:>10} {appr:>9} {draft:>9}")
