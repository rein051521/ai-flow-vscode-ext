#!/usr/bin/env python3
"""
Claude Code Autopilot v4 safety guard.

This hook is designed for PreToolUse/Bash. It reads Claude Code hook JSON from stdin
and denies Red operations while allowing Green operations. It is intentionally
conservative for secrets, payment, protected-branch push, destructive git, and
unapproved external state-changing HTTP requests.

Output style:
- Prefer structured JSON permissionDecision=deny with exit 0.
- Fallback error path exits 2.
"""
from __future__ import annotations

import json
import os
import re
import shlex
import sys
from urllib.parse import urlparse

PROTECTED_BRANCHES = ("main", "master", "develop")
PROTECTED_BRANCH_RE = re.compile(r"(?:^|[/\s:])(?:main|master|develop|release/[^\s]+)(?:$|\s)", re.I)

SECRET_PATH_RE = re.compile(
    r"(?i)(^|[\\/\s'\"=])("
    r"\.env(?:\.[A-Za-z0-9_-]+)?|"
    r"\.npmrc|\.pypirc|"
    r"id_rsa|id_ed25519|"
    r"\.ssh[\\/]|\.aws[\\/]|\.gnupg[\\/]|\.azure[\\/]|\.kube[\\/]|"
    r"secrets?\.|secret|token|password|passwd|credential|private[_-]?key"
    r")"
)

SECRET_READ_RE = re.compile(
    r"(?ix)\b("
    r"cat|type|more|less|head|tail|grep|rg|findstr|select-string|"
    r"get-content|gc|powershell|pwsh|cmd|python|py|node|perl|ruby|awk|sed|"
    r"printenv|env|set"
    r")\b.*("
    r"\.env|secret|token|password|passwd|credential|private[_-]?key|\.npmrc|\.pypirc|\.ssh|\.aws|\.gnupg|\.azure|\.kube"
    r")"
)

ENV_DUMP_RE = re.compile(
    r"(?ix)("
    r"\bprintenv\b|"
    r"\benv\b\s*$|"
    r"\bset\b\s*$|"
    r"os\.environ|process\.env|\$env:|Get-ChildItem\s+Env:|gci\s+Env:"
    r")"
)

DESTRUCTIVE_RE = re.compile(
    r"(?ix)("
    r"\brm\s+-[^\n;|&]*r[^\n;|&]*f\s+(?:/|~|\.{1,2}\s*$|\*|[A-Za-z]:\\)|"
    r"\bgit\s+reset\s+--hard\b|"
    r"\bgit\s+clean\s+-[^\n;|&]*[fdx][^\n;|&]*[fdx]|"
    r"\bRemove-Item\b[^\n;|&]*\b-Recurse\b[^\n;|&]*\b-Force\b"
    r")"
)

FORCE_PUSH_RE = re.compile(
    r"(?ix)\bgit\s+push\b.*("
    r"--force(?:-with-lease)?|"
    r"--mirror|"
    r"--all"
    r")"
)

PROTECTED_PUSH_RE = re.compile(
    r"(?ix)\bgit\s+push\b.*("
    r"\borigin\s+(?:main|master|develop|release/[^\s]+)\b|"
    r"\borigin\s+HEAD:(?:main|master|develop|release/[^\s]+)\b|"
    r"\brefs/heads/(?:main|master|develop|release/[^\s]+)\b|"
    r":(?:main|master|develop)\b|"
    r":release/[^\s]+\b"
    r")"
)

PAYMENT_RE = re.compile(
    r"(?ix)\b("
    r"stripe|paypal|lemon(?:squeezy)?|paddle|chargebee|square"
    r")\b.*\b("
    r"create|refund|charge|cancel|delete|payout|payment|invoice|subscription"
    r")\b"
)

DB_DESTRUCTIVE_RE = re.compile(
    r"(?ix)\b("
    r"psql|mysql|mariadb|sqlite3|prisma|sequelize|knex|typeorm|rails|django-admin"
    r")\b.*\b("
    r"drop\s+table|drop\s+column|delete\s+from|truncate|update\s+\w+|migrate\s+deploy|db\s+push|schema:drop"
    r")\b"
)

STATE_METHOD_RE = re.compile(r"(?i)(?:^|\s)-X\s*(POST|PUT|PATCH|DELETE)\b|(?:^|\s)--request\s+(POST|PUT|PATCH|DELETE)\b")
CURL_URL_RE = re.compile(r"""(?ix)\b(?:curl|http|wget)\b[^\n]*?(https?://[^\s'"<>]+)""")

ALLOW_HOST_PATTERNS = [
    re.compile(r"(?i)^(localhost|127\.0\.0\.1|0\.0\.0\.0)$"),
    re.compile(r"(?i)(^|\.)local$"),
    re.compile(r"(?i)(^|[\.-])(preview|staging|dev|test|localhost)([\.-]|$)"),
]

ALLOWLIST_ENV = "CLAUDE_AUTOPILOT_URL_ALLOWLIST"

def _input_json() -> dict:
    raw = sys.stdin.read()
    if not raw.strip():
        return {}
    try:
        return json.loads(raw)
    except Exception:
        return {"raw": raw}

def _command(data: dict) -> str:
    if "tool_input" in data and isinstance(data["tool_input"], dict):
        return str(data["tool_input"].get("command", ""))
    if "command" in data:
        return str(data.get("command", ""))
    raw = data.get("raw")
    return str(raw or "")

def _deny(reason: str) -> None:
    out = {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": reason,
        }
    }
    print(json.dumps(out, ensure_ascii=False))
    sys.exit(0)

def _allow() -> None:
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "allow",
            "permissionDecisionReason": "autopilot-v4 safety guard: allowed"
        }
    }, ensure_ascii=False))
    sys.exit(0)

def _host_allowed(url: str) -> bool:
    try:
        host = urlparse(url).hostname or ""
    except Exception:
        return False
    for pat in ALLOW_HOST_PATTERNS:
        if pat.search(host):
            return True
    allowlist = os.environ.get(ALLOWLIST_ENV, "")
    for item in [x.strip().lower() for x in allowlist.split(",") if x.strip()]:
        if host.lower() == item or host.lower().endswith("." + item):
            return True
    return False

def _state_change_to_unapproved_url(cmd: str) -> str | None:
    if not STATE_METHOD_RE.search(cmd):
        return None
    urls = CURL_URL_RE.findall(cmd)
    if not urls:
        return "State-changing HTTP request without explicit approved URL is blocked."
    blocked = [u for u in urls if not _host_allowed(u)]
    if blocked:
        return f"Unapproved external state-changing HTTP request blocked: {blocked[0]}"
    return None

def evaluate(cmd: str) -> tuple[bool, str]:
    c = cmd.strip()
    if not c:
        return False, "empty command"

    if SECRET_READ_RE.search(c) or (SECRET_PATH_RE.search(c) and re.search(r"(?i)\b(cat|type|get-content|gc|grep|rg|head|tail|more|less|python|py|node|powershell|pwsh|cmd|findstr|select-string)\b", c)):
        return True, "Secrets or credential file read attempt blocked."
    if ENV_DUMP_RE.search(c):
        return True, "Environment variable dump is blocked because it can expose secrets."
    if PAYMENT_RE.search(c):
        return True, "Payment/billing/refund/subscription operation is blocked."
    if FORCE_PUSH_RE.search(c):
        return True, "Force/mirror/all push is blocked."
    if PROTECTED_PUSH_RE.search(c):
        return True, "Direct push to protected branch is blocked; use feature branch + PR + merge queue."
    if DESTRUCTIVE_RE.search(c):
        return True, "Destructive delete/reset/clean operation is blocked; use safe conversion."
    if DB_DESTRUCTIVE_RE.search(c):
        return True, "Potential destructive DB operation is blocked; use expand-contract or staging dry-run."
    reason = _state_change_to_unapproved_url(c)
    if reason:
        return True, reason
    return False, "allowed"

def main() -> None:
    try:
        data = _input_json()
        cmd = _command(data)
        blocked, reason = evaluate(cmd)
        if blocked:
            _deny(reason)
        _allow()
    except Exception as exc:
        print(f"autopilot-v4 safety_guard internal error: {exc}", file=sys.stderr)
        sys.exit(2)

if __name__ == "__main__":
    main()
