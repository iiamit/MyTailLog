"""Small guard against skipping native checks after shared contract changes."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("ci_native_changes", Path(__file__).with_name("ci-native-changes.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class NativeChangesTests(unittest.TestCase):
    def test_web_ui_and_docs_do_not_build_native_apps(self):
        self.assertEqual(module.native_changes(["apps/web/src/app/help/page.tsx", "docs/help.md"]),
                         {"android": False, "apple": False})

    def test_platform_source_and_configuration(self):
        for path, platform in [("apps/android/app/build.gradle.kts", "android"),
                               ("apps/ios/MyTailLogUITests/AddUITests.swift", "apple")]:
            with self.subTest(path=path):
                self.assertEqual(module.native_changes([path]),
                                 {"android": platform == "android", "apple": platform == "apple"})

    def test_shared_inputs_always_check_both_platforms(self):
        for path in ["apps/core/api/build.gradle.kts", "packages/shared/fixtures/sync.json",
                     "supabase/migrations/0121_example.sql", "scripts/test-ci-native-changes.py",
                     ".github/workflows/ci.yml", "apps/web/src/app/api/sync/pull/route.ts",
                     "apps/web/src/lib/owner/contracts.ts"]:
            with self.subTest(path=path):
                self.assertEqual(module.native_changes([path]), {"android": True, "apple": True})

    def test_mixed_platform_changes(self):
        self.assertEqual(module.native_changes(["apps/android/deleted.kt", "apps/ios/new.swift"]),
                         {"android": True, "apple": True})


if __name__ == "__main__":
    unittest.main()
