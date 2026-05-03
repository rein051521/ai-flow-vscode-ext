#!/usr/bin/env python3
"""
Lightweight Stop hook.
Do not block normal development. Full quality gates belong to CI/auto-green.
"""
from __future__ import annotations
import json, sys

def main() -> None:
    # Non-blocking by design.
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "Stop",
            "additionalContext": "Autopilot v4: Stop hook is non-blocking. Use CI/auto-green for full validation."
        }
    }, ensure_ascii=False))
    sys.exit(0)

if __name__ == "__main__":
    main()
