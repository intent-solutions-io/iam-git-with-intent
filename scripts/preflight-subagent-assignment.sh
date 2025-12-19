#!/bin/bash
# BEADS + AGENTFS + SUBAGENT ASSIGNMENT PRE-FLIGHT
# - Verifies Beads CLI works (even if named differently)
# - Verifies AgentFS CLI works (internal evidence tool)
# - Verifies every NON-CLOSED bead has a mandatory assignee subagent ID (not a name)
# - Best-effort: works across different Beads schemas/commands

set -euo pipefail

echo "== 0) Locate Beads CLI (bd / beads) =="
BD_BIN=""
for c in bd beads; do
  if command -v "$c" >/dev/null 2>&1; then BD_BIN="$c"; break; fi
done
if [ -z "$BD_BIN" ]; then
  echo "FAIL: Beads CLI not found (expected 'bd' or 'beads' in PATH)."
  exit 1
fi
echo "OK: Using bead CLI: $BD_BIN"
"$BD_BIN" --help | head -n 40 || true

echo "== 1) Locate AgentFS CLI (agentfs) =="
AGENTFS_BIN=""
if command -v agentfs >/dev/null 2>&1; then
  AGENTFS_BIN="agentfs"
fi
if [ -z "$AGENTFS_BIN" ]; then
  echo "FAIL: AgentFS CLI not found (expected 'agentfs' in PATH)."
  echo "NOTE: AgentFS is internal dev/ops evidence tooling only; do not add as a runtime dependency."
  exit 1
fi
echo "OK: AgentFS CLI found: $AGENTFS_BIN"
"$AGENTFS_BIN" --help | head -n 60 || true

echo "== 2) Confirm workspace devtools/rest-zone exist (internal only) =="
test -d workspace/rest-zone || { echo "FAIL: workspace/rest-zone missing"; exit 1; }
test -d workspace/devtools  || { echo "FAIL: workspace/devtools missing"; exit 1; }
echo "OK: workspace/ internal zones present"

echo "== 3) Confirm forbidden terms NOT in shipped paths (hard gate) =="
FORBIDDEN=$(grep -rn -E "(^|[^a-zA-Z])(agentfs|AgentFS|beads|bd )([^a-zA-Z]|$)" apps packages infra .github docs 2>/dev/null || true)
if [ -n "$FORBIDDEN" ]; then
  echo "FAIL: Forbidden internal-tool terms found in shipped paths:"
  echo "$FORBIDDEN"
  exit 1
else
  echo "OK: No forbidden terms in shipped paths"
fi

echo "== 4) Beads: list inventory (tolerant of CLI differences) =="
LIST_OUT=""
if LIST_OUT=$("$BD_BIN" list 2>/dev/null); then
  echo "OK: '$BD_BIN list' works"
elif LIST_OUT=$("$BD_BIN" ls 2>/dev/null); then
  echo "OK: '$BD_BIN ls' works"
elif LIST_OUT=$("$BD_BIN" status 2>/dev/null); then
  echo "OK: '$BD_BIN status' works"
else
  echo "FAIL: Beads CLI found but cannot list beads (tried list/ls/status)."
  exit 1
fi
echo "$LIST_OUT" | sed -n '1,120p'

echo "== 5) Beads: JSON inventory (required for strict checks) =="
JSON_OK="0"
if "$BD_BIN" list --json >/dev/null 2>&1; then
  "$BD_BIN" list --json > /tmp/beads.json
  JSON_OK="1"
elif "$BD_BIN" ls --json >/dev/null 2>&1; then
  "$BD_BIN" ls --json > /tmp/beads.json
  JSON_OK="1"
fi
if [ "$JSON_OK" != "1" ]; then
  echo "FAIL: Beads CLI does not support JSON listing; cannot enforce assignee-id gate."
  echo "Fix: ensure your beads tool supports '--json' for list/ls."
  exit 1
fi
echo "OK: Wrote /tmp/beads.json"

echo "== 6) Enforce: every NON-CLOSED bead has an assigned subagent ID =="
# Accepted assignment forms (any one is OK):
#  - JSON fields: assigneeId / assignee_id / agentId / agent_id / ownerId / owner_id / assignedTo / assigned_to
#  - tags: contains something like "agent:<id>" or "assignee:<id>"
#  - description/title contains: "ASSIGNEE_ID=<id>" or "AGENT_ID=<id>" or "@agent:<id>"
python3 - <<'PY'
import json, re, sys

data=json.load(open("/tmp/beads.json"))
items = data if isinstance(data, list) else data.get("items") or data.get("beads") or data.get("data") or []
if not items:
    print("FAIL: No beads found in JSON payload.")
    sys.exit(1)

def pick(d, *keys):
    for k in keys:
        if k in d and d[k]:
            return d[k]
    # try case-insensitive
    lk = {str(k).lower():k for k in d.keys()}
    for k in keys:
        kk=str(k).lower()
        if kk in lk:
            v=d[lk[kk]]
            if v: return v
    return None

ASSIGN_RE = re.compile(r"(ASSIGNEE_ID|AGENT_ID)\s*[:=]\s*([A-Za-z0-9._\-]+)|@agent\s*:\s*([A-Za-z0-9._\-]+)", re.I)
TAG_RE = re.compile(r"^(agent|assignee)\s*:\s*([A-Za-z0-9._\-]+)$", re.I)

def has_assignee(it):
    # 1) explicit fields
    v = pick(it, "assigneeId","assignee_id","agentId","agent_id","ownerId","owner_id","assignedTo","assigned_to","assignee")
    if isinstance(v, dict):
        # sometimes stored as {id: "..."}
        vv = pick(v, "id","agentId","assigneeId","ownerId")
        if vv: return True, str(vv)
    if v:
        return True, str(v)

    # 2) tags/labels
    tags = pick(it, "tags","labels")
    if isinstance(tags, list):
        for t in tags:
            if not isinstance(t, str): continue
            m = TAG_RE.match(t.strip())
            if m: return True, m.group(2)

    # 3) title/description markers
    blob = " ".join([
        str(pick(it,"title","name") or ""),
        str(pick(it,"description","desc","notes") or "")
    ])
    m = ASSIGN_RE.search(blob)
    if m:
        return True, (m.group(2) or m.group(3) or "unknown")
    return False, ""

def is_closed(it):
    # tolerate different schemas
    s = str(pick(it,"status","state") or "").lower()
    if s in ("done","closed","complete","completed","resolved","archived","finished"):
        return True
    # some tools use boolean
    if pick(it,"isDone","is_done","completed") is True:
        return True
    return False

missing=[]
for it in items:
    _id = str(pick(it,"id","beadId","bead_id") or "").strip()
    if not _id: continue
    if is_closed(it): continue
    ok, aid = has_assignee(it)
    if not ok:
        title = str(pick(it,"title","name") or "")[:90]
        missing.append((_id, title))

print("Total beads:", len(items))
print("Open beads missing assignee-id:", len(missing))
for _id, title in missing[:20]:
    print(f"- {_id} :: {title}")
if len(missing) > 20:
    print(f"... and {len(missing) - 20} more")

if missing:
    print("\nFAIL: Every open bead must have an assignee subagent ID (not a name).")
    print("Add one of: assignee field, or label 'agent:<id>', or include 'ASSIGNEE_ID=<id>' in description.")
    sys.exit(2)

print("OK: All open beads have assignee subagent IDs.")
PY

echo "== 7) AgentFS internal evidence smoke test (internal only) =="
EVID_DIR="workspace/devtools/agentfs-cert"
mkdir -p "$EVID_DIR"
pushd "$EVID_DIR" >/dev/null

echo "-- AgentFS command surface --"
"$AGENTFS_BIN" --help | head -n 40 || true

# Best-effort smoke: only run if 'init' appears in help
if "$AGENTFS_BIN" --help 2>/dev/null | grep -qi "\binit\b"; then
  echo "-- AgentFS init + basic ops (best-effort) --"
  set +e
  "$AGENTFS_BIN" init gwi-cert.db >/tmp/agentfs_init.out 2>&1
  INIT_RC=$?
  set -e
  if [ "$INIT_RC" -ne 0 ]; then
    echo "WARN: agentfs init failed (see /tmp/agentfs_init.out). This must be fixed before relying on AgentFS evidence."
    cat /tmp/agentfs_init.out | sed -n '1,120p'
  else
    echo "OK: agentfs init succeeded (first lines):"
    cat /tmp/agentfs_init.out | sed -n '1,40p'
  fi
else
  echo "WARN: AgentFS help does not show 'init'. Adjust this smoke test to your AgentFS CLI version."
fi

popd >/dev/null

echo "== 8) OPTIONAL: Check beads dependency graph renders =="
if "$BD_BIN" dep tree >/dev/null 2>&1; then
  "$BD_BIN" dep tree | head -n 80
else
  echo "WARN: No dep tree command detected; skipping."
fi

echo "== DONE =="
echo "All gates passed: beads usable, agentfs usable (internal), workspace present."
