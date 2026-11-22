import java.util.Properties

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
// Play upload key: the same properties file the Capacitor app used (storeFile, storePassword, keyAlias, keyPassword).
val signingFile = File(
    System.getenv("MYTAILLOG_ANDROID_SIGNING_PROPERTIES")
        ?: "${System.getProperty("user.home")}/.config/mytaillog/android/signing.properties",
)
val signing = Properties().apply { if (signingFile.isFile) signingFile.inputStream().use { load(it) } }

// FCM (05 §10). The Firebase client values come from app/google-services.json (git-ignored, the same file the
// Capacitor app used) or -Pmytaillog.firebase*. Neither: the app builds and says "this build can't get reminders".
// Read by hand rather than through the google-services plugin, so FCM is the only Firebase piece that ships.
val firebase: Map<String, String> = run {
    val props = listOf("AppId", "ApiKey", "ProjectId", "SenderId").associateWith { providers.gradleProperty("mytaillog.firebase$it").orNull }
    if (props.values.all { !it.isNullOrBlank() }) return@run props.mapValues { it.value!! }
    val file = file("google-services.json")
    if (!file.exists()) return@run emptyMap()
    @Suppress("UNCHECKED_CAST")
    val json = groovy.json.JsonSlurper().parse(file) as Map<String, Any?>
    val info = json["project_info"] as Map<String, Any?>
    val client = (json["client"] as List<Map<String, Any?>>).firstOrNull {
        ((it["client_info"] as Map<String, Any?>)["android_client_info"] as Map<String, Any?>)["package_name"] == "com.mytaillog.app"
    } ?: return@run emptyMap()
    mapOf(
        "AppId" to (client["client_info"] as Map<String, Any?>)["mobilesdk_app_id"].toString(),
        "ApiKey" to ((client["api_key"] as List<Map<String, Any?>>).first()["current_key"]).toString(),
        "ProjectId" to info["project_id"].toString(),
        "SenderId" to info["project_number"].toString(),
    )
}

android {
    namespace = "com.mytaillog.app"
    compileSdk = 37

    defaultConfig {
        // Same id as the Capacitor app (apps/mobile/capacitor.config.ts): the native app replaces it in place.
        applicationId = "com.mytaillog.app"
        minSdk = 29
        targetSdk = 36
        versionCode = 103 // 102 is already on Play's internal-testing track.
        versionName = "2.0.0"
        buildConfigField("String", "GOOGLE_WEB_CLIENT_ID", quoted(googleWebClientId.getOrElse("")))
        listOf("AppId" to "FIREBASE_APP_ID", "ApiKey" to "FIREBASE_API_KEY", "ProjectId" to "FIREBASE_PROJECT_ID", "SenderId" to "FIREBASE_SENDER_ID").forEach { (k, field) ->
            buildConfigField("String", field, quoted(firebase[k] ?: ""))
        }
    }

    signingConfigs {
        create("release") {
            if (signingFile.isFile) {
                storeFile = file(signing.getProperty("storeFile"))
                storePassword = signing.getProperty("storePassword")
                keyAlias = signing.getProperty("keyAlias")
                keyPassword = signing.getProperty("keyPassword")
            }
        }
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
            // AGP 9.3+: R8 code/resource shrinking, optimization and obfuscation with platform defaults.
            optimization { enable = true }
            if (signingFile.isFile) signingConfig = signingConfigs.getByName("release")
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
    implementation("androidx.exifinterface:exifinterface:1.4.2")
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
    // Phase 6 (05 §10–13): home-screen widgets and FCM delivery only (no analytics).
    implementation("androidx.glance:glance-appwidget:1.2.0")
    implementation("com.google.firebase:firebase-messaging:25.1.3")

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
