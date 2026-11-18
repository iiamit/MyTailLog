plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
}

fun quoted(value: String) = "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\""

val releaseSupabaseUrl = providers.gradleProperty("mytaillog.supabaseUrl")
val releaseSupabaseKey = providers.gradleProperty("mytaillog.supabaseKey")
// The Google Cloud *Web* OAuth client ID that Supabase's Google provider uses (Credential Manager's serverClientId).
// Not a secret. Blank: "Continue with Google" uses the OAuth Custom Tab instead.
val googleWebClientId = providers.gradleProperty("mytaillog.googleWebClientId")

android {
    namespace = "com.mytaillog.app"
    compileSdk = 37

    defaultConfig {
        // Same id as the Capacitor app (apps/mobile/capacitor.config.ts): the native app replaces it in place.
        applicationId = "com.mytaillog.app"
        minSdk = 29
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
        buildConfigField("String", "GOOGLE_WEB_CLIENT_ID", quoted(googleWebClientId.getOrElse("")))
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    buildTypes {
        debug {
            // The TEST Supabase project. The publishable key is public by design.
            buildConfigField("String", "SUPABASE_URL", quoted("https://arpirbajxbrjbkldteaz.supabase.co"))
            buildConfigField("String", "SUPABASE_KEY", quoted("sb_publishable_ud1Z3aaPzJVCVvedMIgOKQ_EWdVln9D"))
        }
        release {
            // No defaults: a release must name its project explicitly (checked in preReleaseBuild below).
            buildConfigField("String", "SUPABASE_URL", quoted(releaseSupabaseUrl.getOrElse("")))
            buildConfigField("String", "SUPABASE_KEY", quoted(releaseSupabaseKey.getOrElse("")))
            isMinifyEnabled = false
        }
    }

    testOptions { unitTests.isIncludeAndroidResources = true }
}

tasks.matching { it.name == "preReleaseBuild" }.configureEach {
    val url = releaseSupabaseUrl
    val key = releaseSupabaseKey
    doFirst {
        check(url.isPresent && key.isPresent) {
            "Release builds need -Pmytaillog.supabaseUrl and -Pmytaillog.supabaseKey (see apps/android/README.md)."
        }
    }
}

dependencies {
    implementation(project(":core-design"))
    implementation("com.mytaillog.core:api")
    implementation(libs.activity.compose)
    implementation(libs.navigation.compose)
    implementation(libs.lifecycle.viewmodel.compose)
    implementation(libs.lifecycle.runtime.compose)
    implementation(libs.material3.adaptive.layout)
    implementation(libs.material3.adaptive.navigation)
    implementation(libs.datastore.preferences)
    implementation(libs.tink.android)
    implementation(libs.core.ktx)
    // Sign-in (05 §8.2). Android-only, so declared here rather than in the catalog shared with apps/core.
    implementation("androidx.credentials:credentials:1.5.0")
    implementation("androidx.credentials:credentials-play-services-auth:1.5.0")
    implementation("com.google.android.libraries.identity.googleid:googleid:1.1.1")
    implementation("androidx.browser:browser:1.8.0")

    testImplementation(libs.junit)
    testImplementation(libs.robolectric)
    testImplementation(libs.ktor.client.mock)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(platform(libs.compose.bom))
    testImplementation(libs.compose.ui.test.junit4)
    debugImplementation(libs.compose.ui.test.manifest)
}
