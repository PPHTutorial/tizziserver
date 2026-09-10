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
    keystoreProperties.load(keystorePropertiesFile.inputStream())
}

android {
    namespace = "com.grandprice.grandprice"
    compileSdk = flutter.compileSdkVersion
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
        minSdk = flutter.minSdkVersion
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
                storeFile = file(keystoreProperties["storeFile"] as String)
                storePassword = keystoreProperties["storePassword"] as String
                keyAlias = keystoreProperties["keyAlias"] as String
                keyPassword = keystoreProperties["keyPassword"] as String
            }
        }
    }

    buildTypes {
        release {
            // Real signing once `key.properties` exists; the debug keystore
            // otherwise, so `flutter build --release` still works without it.
            signingConfig = if (hasReleaseSigning) signingConfigs.getByName("release") else signingConfigs.getByName("debug")
        }
    }
}

flutter {
    source = "../.."
}
