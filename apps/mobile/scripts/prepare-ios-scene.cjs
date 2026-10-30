const { readFileSync, existsSync } = require("node:fs");
const { join } = require("node:path");
const { loadConfig } = require("@capacitor/cli/dist/config");
const { migrateToUIScene } = require("@capacitor/cli/dist/tasks/migrate-uiscene");

async function main() {
  const config = await loadConfig();
  if (!existsSync(config.ios.platformDirAbs)) throw new Error("Run npx cap add ios first.");
  await migrateToUIScene(config);

  const app = config.ios.nativeTargetDirAbs;
  const plist = readFileSync(join(app, "Info.plist"), "utf8");
  const delegate = readFileSync(join(app, "AppDelegate.swift"), "utf8");
  const project = readFileSync(join(config.ios.nativeXcodeProjDirAbs, "project.pbxproj"), "utf8");
  if (!plist.includes("UIApplicationSceneManifest") || !plist.includes("UISceneDelegateClassName") ||
      !existsSync(join(app, "SceneDelegate.swift")) ||
      !delegate.includes("configurationForConnecting") ||
      !project.includes("SceneDelegate.swift in Sources")) {
    throw new Error("iOS scene migration is incomplete. Follow https://capacitorjs.com/docs/updating/8-5 before archiving.");
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
