plugins {
    alias(libs.plugins.kotlin.multiplatform)
    alias(libs.plugins.android.kmp.library)
}

kotlin {
    android {
        namespace = "com.mytaillog.core.sync"
        compileSdk = 37
        minSdk = 29
        withHostTest {}
    }
    // The engine tests run on real SQLite; :db gets -lsqlite3 from the SQLDelight plugin, this module states it.
    listOf(iosArm64(), iosSimulatorArm64()).forEach { target -> target.binaries.all { linkerOpts("-lsqlite3") } }

    sourceSets {
        commonMain.dependencies {
            api(project(":api"))
            api(project(":db"))
        }
        commonTest.dependencies {
            implementation(kotlin("test"))
            implementation(libs.kotlinx.coroutines.test)
        }
        // The engine is tested against real in-memory SQLite (mirror.db + outbox.db).
        getByName("androidHostTest").dependencies {
            implementation(libs.sqldelight.sqlite.driver)
        }
        iosTest.dependencies {
            implementation(libs.sqldelight.native.driver)
        }
    }
}
