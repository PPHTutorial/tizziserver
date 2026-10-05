import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:stall/features/catalog/media/product_media_processor.dart';

img.Image _solid(int w, int h, int r, int g, int b) {
  final im = img.Image(width: w, height: h);
  img.fill(im, color: img.ColorRgb8(r, g, b));
  return im;
}

List<num> _rgb(img.Image im, int x, int y) {
  final p = im.getPixel(x, y);
  return [p.r, p.g, p.b];
}

void main() {
  test('mask length mismatch returns null', () {
    final src = _solid(4, 4, 10, 20, 30);
    expect(compositeOnWhite(src, Float32List(15)..fillRange(0, 15, 1)), isNull);
  });

  test('tiny subject (<2% of frame) returns null', () {
    final src = _solid(10, 10, 10, 20, 30);
    final mask = Float32List(100)..[0] = 1.0; // 1% subject
    expect(compositeOnWhite(src, mask), isNull);
  });

  test('all-zero mask means no subject → null', () {
    expect(compositeOnWhite(_solid(4, 4, 1, 2, 3), Float32List(16)), isNull);
  });

  test('full mask keeps the original pixels', () {
    final src = _solid(4, 4, 10, 20, 30);
    final out = compositeOnWhite(src, Float32List(16)..fillRange(0, 16, 1))!;
    expect(_rgb(out, 2, 3), [10, 20, 30]);
  });

  test('zero-confidence pixels become white, subject pixels are kept', () {
    final src = _solid(10, 10, 10, 20, 30);
    final mask = Float32List(100);
    for (var y = 0; y < 10; y++) {
      for (var x = 0; x < 5; x++) {
        mask[y * 10 + x] = 1.0; // left half = subject
      }
    }
    final out = compositeOnWhite(src, mask)!;
    expect(_rgb(out, 9, 9), [255, 255, 255]);
    expect(_rgb(out, 0, 0), [10, 20, 30]);
  });
}
