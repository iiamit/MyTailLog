#!/usr/bin/env python3
"""Classify NUL-delimited git paths for native CI, including removed files."""
import sys


def native_changes(paths):
    shared = ("apps/core/", "packages/", "supabase/", "scripts/",
              ".github/workflows/", "apps/web/src/app/api/", "apps/web/src/lib/")
    both = any(p.startswith(shared) for p in paths)
    return {
        "android": both or any(p.startswith("apps/android/") for p in paths),
        "apple": both or any(p.startswith("apps/ios/") for p in paths),
    }


if __name__ == "__main__":
    paths = sys.stdin.buffer.read().decode("utf-8", errors="surrogateescape").split("\0")
    for name, needed in native_changes(paths).items():
        print(f"{name}={str(needed).lower()}")
