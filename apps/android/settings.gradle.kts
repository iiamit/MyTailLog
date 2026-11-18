rootProject.name = "MyTailLog"

pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
    }
    versionCatalogs {
        // One catalog for the core and the app, so the composite build never mixes Kotlin or AGP versions.
        create("libs") { from(files("../core/gradle/libs.versions.toml")) }
    }
}

// The Kotlin Multiplatform core is built from source: com.mytaillog.core:<module> resolves to ../core.
includeBuild("../core")

include(":app", ":core-design")
