import org.jetbrains.kotlin.gradle.plugin.mpp.apple.XCFramework

plugins {
    alias(libs.plugins.kotlin.multiplatform)
}

// Umbrella for the iOS app: one MyTailLogCore.xcframework exporting every core module.
// ./gradlew :framework:assembleMyTailLogCoreXCFramework → framework/build/XCFrameworks/
kotlin {
    val xcf = XCFramework("MyTailLogCore")
    listOf(iosArm64(), iosSimulatorArm64()).forEach { target ->
        target.binaries.framework {
            baseName = "MyTailLogCore"
            isStatic = true
            export(project(":domain"))
            export(project(":api"))
            export(project(":db"))
            export(project(":sync"))
            xcf.add(this)
        }
    }

    sourceSets {
        commonMain.dependencies {
            api(project(":domain"))
            api(project(":api"))
            api(project(":db"))
            api(project(":sync"))
        }
    }
}
