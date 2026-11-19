plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
}

fun quoted(value: String) = "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\""

val releaseSupabaseUrl = providers.gradleProperty("mytaillog.supabaseUrl")
val releaseSupabaseKey = providers.gradleProperty("mytaillog.supabaseKey")
val releaseApiUrl = providers.gradleProperty("mytaillog.apiUrl")
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
            // The web app deployed against the TEST project; serves /api/aircraft/{id}/status.
            buildConfigField("String", "API_URL", quoted("https://mfb-test.mytaillog.com"))
        }
        release {
            // No defaults: a release must name its project explicitly (checked in preReleaseBuild below).
            buildConfigField("String", "SUPABASE_URL", quoted(releaseSupabaseUrl.getOrElse("")))
            buildConfigField("String", "SUPABASE_KEY", quoted(releaseSupabaseKey.getOrElse("")))
            buildConfigField("String", "API_URL", quoted(releaseApiUrl.getOrElse("")))
            isMinifyEnabled = false
        }
    }

    testOptions { unitTests.isIncludeAndroidResources = true }
}

tasks.matching { it.name == "preReleaseBuild" }.configureEach {
    val url = releaseSupabaseUrl
    val key = releaseSupabaseKey
    val api = releaseApiUrl
    doFirst {
        check(url.isPresent && key.isPresent && api.isPresent) {
            "Release builds need -Pmytaillog.supabaseUrl, -Pmytaillog.supabaseKey and -Pmytaillog.apiUrl (see apps/android/README.md)."
        }
    }
}

dependencies {
    implementation(project(":core-design"))
    implementation("com.mytaillog.core:api")
    // The offline store and sync engine (05 §6); the app opens the two SQLite files per user.
    implementation("com.mytaillog.core:sync")
    implementation(libs.sqldelight.android.driver)
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
    // Capture and offline (05 §9, §15, §16). Edge detection is our own Kotlin (PageFinder), not OpenCV:
    // the OpenCV AAR is 112 MB and its native code can't run in the JVM unit tests.
    implementation("androidx.camera:camera-camera2:1.7.0")
    implementation("androidx.camera:camera-lifecycle:1.7.0")
    implementation("androidx.camera:camera-view:1.7.0")
    implementation("androidx.work:work-runtime-ktx:2.11.2")
    implementation("com.google.mlkit:text-recognition:16.0.1")
    implementation("com.google.android.gms:play-services-mlkit-document-scanner:16.0.0")
    // The record room's QR code (06 M-SHARE-02): ZXing's encoder, pure Java, about 0.5 MB.
    implementation("com.google.zxing:core:3.5.3")

    testImplementation(libs.junit)
    testImplementation(libs.robolectric)
    testImplementation(libs.ktor.client.mock)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation("androidx.work:work-testing:2.11.2")
    testImplementation(libs.sqldelight.sqlite.driver)
    testImplementation(platform(libs.compose.bom))
    testImplementation(libs.compose.ui.test.junit4)
    debugImplementation(libs.compose.ui.test.manifest)
}
