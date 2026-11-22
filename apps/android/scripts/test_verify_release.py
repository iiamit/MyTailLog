import contextlib
import importlib.util
import io
import json
import tempfile
import unittest
import zipfile
from pathlib import Path

spec = importlib.util.spec_from_file_location("verify_release", Path(__file__).with_name("verify-release.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ReleaseGateTests(unittest.TestCase):
    def test_good_bundle_and_optimization_regressions(self):
        info = {"options": dict.fromkeys(("isObfuscationEnabled", "isOptimizationsEnabled", "isShrinkingEnabled"), True),
                "resourceOptimization": {"isOptimizedShrinkingEnabled": True},
                "stats": dict.fromkeys(("noObfuscationPercentage", "noOptimizationPercentage", "noShrinkingPercentage"), 5)}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "app.aab"
            for case in ("good", "low", "disabled", "missing mapping"):
                with self.subTest(case=case):
                    info["stats"]["noObfuscationPercentage"] = 80 if case == "low" else 5
                    info["options"]["isShrinkingEnabled"] = case != "disabled"
                    with zipfile.ZipFile(path, "w") as bundle:
                        bundle.writestr("BUNDLE-METADATA/com.android.tools/r8.json", json.dumps(info))
                        if case != "missing mapping":
                            bundle.writestr("BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map", "mapping")
                    with contextlib.redirect_stdout(io.StringIO()):
                        if case == "good":
                            module.verify(path)
                        else:
                            with self.assertRaises((ValueError, KeyError)):
                                module.verify(path)


if __name__ == "__main__":
    unittest.main()
