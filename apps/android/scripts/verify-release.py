#!/usr/bin/env python3
"""Fail publishing if an AAB loses optimization or crash-symbol metadata."""
import json
import sys
import zipfile


def verify(path):
    with zipfile.ZipFile(path) as bundle:
        info = json.loads(bundle.read("BUNDLE-METADATA/com.android.tools/r8.json"))
        options = info["options"]
        for name in ("isObfuscationEnabled", "isOptimizationsEnabled", "isShrinkingEnabled"):
            if options.get(name) is not True:
                raise ValueError(f"R8 {name} is disabled")
        if not info["resourceOptimization"].get("isOptimizedShrinkingEnabled"):
            raise ValueError("Resource shrinking is disabled")
        scores = {name: round(100 - info["stats"][f"no{name}Percentage"], 2)
                  for name in ("Obfuscation", "Optimization", "Shrinking")}
        if min(scores.values()) < 25:
            raise ValueError(f"R8 score below 25%: {scores}")
        if not bundle.getinfo("BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map").file_size:
            raise ValueError("Missing crash mapping")
        print(json.dumps({"r8Percent": scores}, indent=2))


if __name__ == "__main__":
    verify(sys.argv[1])
