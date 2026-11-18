plugins {
    alias(libs.plugins.kotlin.multiplatform)
    alias(libs.plugins.android.kmp.library)
    alias(libs.plugins.sqldelight)
}

kotlin {
    android {
        namespace = "com.mytaillog.core.db"
        compileSdk = 36
        minSdk = 29
        withHostTest {}
    }
    iosArm64()
    iosSimulatorArm64()

    sourceSets {
        commonMain.dependencies {
            api(project(":domain"))
        }
        androidMain.dependencies {
            implementation(libs.sqldelight.android.driver)
        }
        iosMain.dependencies {
            implementation(libs.sqldelight.native.driver)
        }
        commonTest.dependencies {
            implementation(kotlin("test"))
        }
        getByName("androidHostTest").dependencies {
            implementation(libs.sqldelight.sqlite.driver)
        }
    }
}

// Two files per signed-in user (05 §6.2): mirror.db is server truth and can be
// rebuilt; outbox.db is unsent work and never is. Separate schemas, separate files.
sqldelight {
    databases {
        create("MirrorDatabase") {
            packageName.set("com.mytaillog.core.db.mirror")
            srcDirs("src/commonMain/sqldelight/mirror")
        }
        create("OutboxDatabase") {
            packageName.set("com.mytaillog.core.db.outbox")
            srcDirs("src/commonMain/sqldelight/outbox")
        }
    }
}
