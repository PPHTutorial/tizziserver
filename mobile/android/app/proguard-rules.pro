# R8 keep rules for release builds (minify + resource shrinking are on in
# app/build.gradle.kts). Most plugins also ship consumer rules; these are
# belt-and-braces for the ones that load classes via JNI / reflection, where a
# stripped class only shows up as a crash or silent failure on a real device.

# --- Flutter ---------------------------------------------------------------
# The embedding references Play Core (deferred components) which this app
# doesn't bundle; without these R8 fails with "Missing class" errors.
-dontwarn com.google.android.play.core.**
-keep class io.flutter.plugins.** { *; }

# --- ffmpeg_kit_flutter_new_min (product video transcode) --------------------
# Native code calls back into FFmpegKitConfig (log/statistics/saf*) via JNI.
-keep class com.antonkarpenko.ffmpegkit.** { *; }
-dontwarn com.antonkarpenko.ffmpegkit.**

# --- ML Kit (subject segmentation; mobile_scanner barcode) -------------------
-keep class com.google.mlkit.** { *; }
-dontwarn com.google.mlkit.**
-keep class com.google.android.gms.internal.mlkit_vision_** { *; }
-dontwarn com.google.android.gms.internal.mlkit_vision_**
-keep class com.google_mlkit_commons.** { *; }
-keep class com.google_mlkit_subject_segmentation.** { *; }

# --- image_cropper / uCrop ------------------------------------------------
-keep class com.yalantis.ucrop.** { *; }
-keep interface com.yalantis.ucrop.** { *; }
-dontwarn com.yalantis.ucrop.**
-dontwarn okhttp3.**
-dontwarn okio.**

# --- video_player (ExoPlayer / androidx.media3) ----------------------------
-keep class io.flutter.plugins.videoplayer.** { *; }
-dontwarn androidx.media3.**

# --- flutter_secure_storage (Tink) ------------------------------------------
-dontwarn com.google.errorprone.annotations.**
-dontwarn javax.annotation.**
