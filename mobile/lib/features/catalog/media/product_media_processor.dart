import 'dart:io';

import 'package:ffmpeg_kit_flutter_new_min/ffmpeg_kit.dart';
import 'package:ffmpeg_kit_flutter_new_min/return_code.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_image_compress/flutter_image_compress.dart';
import 'package:google_mlkit_subject_segmentation/google_mlkit_subject_segmentation.dart';
import 'package:image/image.dart' as img;
import 'package:image_cropper/image_cropper.dart';
import 'package:path_provider/path_provider.dart';

/// A processed file ready for `StallApi.uploadMedia`. The filename's extension
/// drives the multipart content type, so it must match the bytes.
class PreparedMedia {
  const PreparedMedia(this.bytes, this.filename);
  final Uint8List bytes;
  final String filename;
}

/// Longest edge of an uploaded product photo — enough for a full-screen
/// zoom on a 3x phone, small enough to stay well under the 5MB route cap.
const _maxImageEdge = 1600;
const _imageQuality = 82;

/// Server caps (`apps/api/app/api/v1/media/upload/route.ts`).
const maxVideoBytes = 80 * 1024 * 1024;

/// Clips at or under this size upload as-is — transcoding them saves little
/// and costs the vendor a wait.
const _videoPassThroughBytes = 8 * 1024 * 1024;

/// ML Kit subject segmentation is Android-only (beta) — iOS has no
/// equivalent API, so the "clean background" option is hidden there.
bool get backgroundRemovalSupported => !kIsWeb && Platform.isAndroid;

/// Crop → resize/compress → (optionally) replace the background with white.
/// Returns null when the vendor cancels the crop.
Future<PreparedMedia?> prepareProductImage(
  XFile picked, {
  required bool removeBackground,
}) async {
  final cropped = await ImageCropper().cropImage(
    sourcePath: picked.path,
    uiSettings: [
      AndroidUiSettings(
        toolbarTitle: 'Crop photo',
        initAspectRatio: CropAspectRatioPreset.square,
        lockAspectRatio: false,
      ),
      IOSUiSettings(title: 'Crop photo'),
    ],
  );
  if (cropped == null) return null;

  final compressed = await FlutterImageCompress.compressWithFile(
    cropped.path,
    minWidth: _maxImageEdge,
    minHeight: _maxImageEdge,
    quality: _imageQuality,
  );
  if (compressed == null) {
    throw const FileSystemException('Couldn\'t process this photo');
  }
  final name = 'product-${DateTime.now().millisecondsSinceEpoch}.jpg';

  if (removeBackground && backgroundRemovalSupported) {
    final cleaned = await _whiteBackground(compressed);
    if (cleaned != null) return PreparedMedia(cleaned, name);
    // No confident subject found — keep the vendor's photo rather than
    // uploading a blank white square.
  }
  return PreparedMedia(compressed, name);
}

Future<Uint8List?> _whiteBackground(Uint8List jpeg) async {
  // ML Kit reads from a path; the compressed JPEG has EXIF rotation baked
  // in, so the mask dimensions match the decoded pixels below.
  final dir = await getTemporaryDirectory();
  final file = File(
    '${dir.path}/seg-${DateTime.now().microsecondsSinceEpoch}.jpg',
  );
  await file.writeAsBytes(jpeg);
  final segmenter = SubjectSegmenter(
    options: SubjectSegmenterOptions(
      enableForegroundBitmap: false,
      enableForegroundConfidenceMask: true,
      enableMultipleSubjects: SubjectResultOptions(
        enableConfidenceMask: false,
        enableSubjectBitmap: false,
      ),
    ),
  );
  try {
    final result = await segmenter.processImage(
      InputImage.fromFilePath(file.path),
    );
    final mask = result.foregroundConfidenceMask;
    if (mask == null || mask.isEmpty) return null;
    // Per-pixel compositing over a 1600px image is too slow for the UI
    // isolate.
    return await compute(
      _compositeOnWhite,
      _MaskJob(jpeg, Float32List.fromList(mask)),
    );
  } finally {
    await segmenter.close();
    if (await file.exists()) await file.delete();
  }
}

class _MaskJob {
  const _MaskJob(this.jpeg, this.mask);
  final Uint8List jpeg;
  final Float32List mask;
}

Uint8List? _compositeOnWhite(_MaskJob job) {
  final src = img.decodeJpg(job.jpeg);
  if (src == null || job.mask.length != src.width * src.height) return null;

  var subjectPixels = 0;
  for (final c in job.mask) {
    if (c > 0.5) subjectPixels++;
  }
  // Under 2% of the frame is almost always a mis-detection.
  if (subjectPixels < job.mask.length * 0.02) return null;

  final out = img.Image(width: src.width, height: src.height);
  var i = 0;
  for (var y = 0; y < src.height; y++) {
    for (var x = 0; x < src.width; x++) {
      final a = job.mask[i++];
      final p = src.getPixel(x, y);
      out.setPixelRgb(
        x,
        y,
        (p.r * a + 255 * (1 - a)).round(),
        (p.g * a + 255 * (1 - a)).round(),
        (p.b * a + 255 * (1 - a)).round(),
      );
    }
  }
  return img.encodeJpg(out, quality: _imageQuality);
}

/// The LGPL `_min` ffmpeg build has no software H.264 encoder (x264 is GPL),
/// so encode on the phone's hardware codec instead.
String get _hardwareH264Encoder =>
    Platform.isIOS ? 'h264_videotoolbox' : 'h264_mediacodec';

/// Transcodes to ≤1280px H.264/AAC, capped at 60s, with `faststart` so the
/// product page can begin playback before the whole file arrives.
Future<PreparedMedia> prepareProductVideo(XFile picked) async {
  final size = await picked.length();
  if (size <= _videoPassThroughBytes) {
    return PreparedMedia(await picked.readAsBytes(), picked.name);
  }

  final dir = await getTemporaryDirectory();
  final out = File(
    '${dir.path}/product-${DateTime.now().millisecondsSinceEpoch}.mp4',
  );
  final session = await FFmpegKit.executeWithArguments([
    '-y',
    '-i',
    picked.path,
    '-t',
    '60',
    '-vf',
    "scale='min(1280,iw)':'min(1280,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
    '-c:v',
    _hardwareH264Encoder,
    // Hardware encoders are bitrate-driven (no CRF); ~2.5 Mbps keeps 720p
    // product footage clean at ~19MB per minute.
    '-b:v',
    '2500k',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '96k',
    '-movflags',
    '+faststart',
    out.path,
  ]);

  try {
    if (ReturnCode.isSuccess(await session.getReturnCode()) &&
        await out.exists()) {
      final bytes = await out.readAsBytes();
      if (bytes.length <= maxVideoBytes) {
        return PreparedMedia(bytes, 'product-video.mp4');
      }
    }
  } finally {
    if (await out.exists()) await out.delete();
  }

  // Transcode failed or was still too big — the original is acceptable if
  // the server will take it.
  if (size <= maxVideoBytes) {
    return PreparedMedia(await picked.readAsBytes(), picked.name);
  }
  throw const FileSystemException(
    'This video is too large. Choose a clip under a minute.',
  );
}
