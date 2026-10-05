import java.util.Properties

plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Release signing: `key.properties` is a local, gitignored file (see
// `key.properties.example`) with storeFile/storePassword/keyAlias/keyPassword.
// Falls back to the debug keystore when it's absent so `flutter build --release`
// still works before real signing secrets exist — swap it in for a real store
// upload by dropping a keystore + key.properties next to this file.
val keystorePropertiesFile = rootProject.file("key.properties")
val keystoreProperties = Properties()
val hasReleaseSigning = keystorePropertiesFile.exists()
if (hasReleaseSigning) {
    keystorePropertiesFile.inputStream().use { keystoreProperties.load(it) }
} else {
    logger.warn("android/key.properties not found: release builds will be DEBUG-signed (not uploadable to Play).")
}

android {
    namespace = "com.grandprice.grandprice"
    // mobile_scanner's androidx.camera dependency needs compileSdk 36 + AGP
    // 8.9.1+ — overriding the Flutter SDK's own (lower) default here.
    compileSdk = 36
    // Several plugins (flutter_secure_storage, geolocator, google_maps_flutter,
    // path_provider, share_plus, video_player) want this NDK; it's backward
    // compatible with flutter.ndkVersion.
    ndkVersion = "27.0.12077973"

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_11.toString()
    }

    defaultConfig {
        // Overridden per flavor below — every build must pick one.
        applicationId = "com.stall.app"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        // 24+ (Android 7.0): ffmpeg_kit_flutter_new and ML Kit subject segmentation
        // (product media); mobile_scanner alone needed 23.
        minSdk = 24
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    // One tenant per Stall platform (docs/00-MASTER-PLAN.md) → a distinct,
    // separately-listable Play Store app. Pair with the matching
    // `--dart-define=STALL_PLATFORM=…` — `flutter build appbundle --flavor
    // grandprice --dart-define=STALL_PLATFORM=grandprice` — the flavor picks
    // the native app identity/name, the dart-define picks which tenant the
    // Dart code talks to; nothing wires them together automatically.
    flavorDimensions += "tenant"
    productFlavors {
        create("grandprice") {
            dimension = "tenant"
            applicationId = "com.stall.grandprice"
        }
        create("tizzigas") {
            dimension = "tenant"
            applicationId = "com.stall.tizzigas"
        }
    }

    if (hasReleaseSigning) {
        signingConfigs {
            create("release") {
                // Relative paths resolve against android/ (next to
                // key.properties, as key.properties.example describes).
                storeFile = rootProject.file(keystoreProperties["storeFile"] as String)
                storePassword = keystoreProperties["storePassword"] as String
                keyAlias = keystoreProperties["keyAlias"] as String
                keyPassword = keystoreProperties["keyPassword"] as String
            }
        }
    }

    buildTypes {
        release {
            // Real signing once `key.properties` exists. FALLBACK ONLY: with no
            // key.properties the release build is signed with the local debug
            // keystore so `flutter build --release` still works for testing —
            // Play Console rejects debug-signed bundles, so never upload one.
            signingConfig = if (hasReleaseSigning) signingConfigs.getByName("release") else signingConfigs.getByName("debug")

            // R8 code shrinking + resource shrinking. Keep rules for the
            // JNI/reflection-heavy plugins (ffmpeg-kit, ML Kit, uCrop,
            // video_player) live in proguard-rules.pro.
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }
}

flutter {
    source = "../.."
}
