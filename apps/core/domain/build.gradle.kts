plugins {
    alias(libs.plugins.kotlin.multiplatform)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.android.kmp.library)
}

// The conformance fixtures live outside this build (13 §2.3); hand their absolute
// path to commonTest so the Android host and the iOS simulator tests read the same files.
val generateFixturesDir = tasks.register("generateFixturesDir") {
    val dir = rootDir.resolve("../../packages/shared/fixtures").normalize().absolutePath
    val out = layout.buildDirectory.dir("generated/fixtures")
    inputs.property("dir", dir)
    outputs.dir(out)
    doLast {
        out.get().file("FixturesDir.kt").asFile.apply {
            parentFile.mkdirs()
            writeText("package com.mytaillog.core.domain\n\nconst val FIXTURES_DIR = \"$dir\"\n")
        }
    }
}

kotlin {
    android {
        namespace = "com.mytaillog.core.domain"
        compileSdk = 36
        minSdk = 29
        withHostTest {}
    }
    iosArm64()
    iosSimulatorArm64()

    sourceSets {
        commonMain.dependencies {
            api(libs.kotlinx.serialization.json)
        }
        commonTest {
            kotlin.srcDir(generateFixturesDir)
            dependencies {
                implementation(kotlin("test"))
                implementation(libs.kotlinx.io.core)
            }
        }
    }
}
