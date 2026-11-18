plugins {
    alias(libs.plugins.kotlin.multiplatform) apply false
    alias(libs.plugins.kotlin.serialization) apply false
    alias(libs.plugins.android.kmp.library) apply false
    alias(libs.plugins.sqldelight) apply false
}

// apps/android substitutes com.mytaillog.core:<module> with these projects (composite build).
subprojects { group = "com.mytaillog.core" }
