import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../../../app/providers.dart';
import '../../../app/router.dart';
import '../../../design/context_ext.dart';
import '../../../design/icons.dart';
import '../../../design/tokens.g.dart';

/// Opened from the home search bar's camera icon — scans a product barcode/SKU
/// and jumps straight to it, or falls back to a manual search with the scanned
/// code pre-filled if nothing matches.
class BarcodeScanScreen extends ConsumerStatefulWidget {
  const BarcodeScanScreen({super.key});

  @override
  ConsumerState<BarcodeScanScreen> createState() => _BarcodeScanScreenState();
}

class _BarcodeScanScreenState extends ConsumerState<BarcodeScanScreen> {
  final _controller = MobileScannerController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _onDetect(BarcodeCapture capture) async {
    if (_busy || capture.barcodes.isEmpty) return;
    final code = capture.barcodes.first.rawValue;
    if (code == null || code.isEmpty) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    await _controller.stop();
    try {
      final slug = await ref.read(stallApiProvider).scanCode(code);
      if (!mounted) return;
      if (slug != null) {
        context.pushReplacement(RoutePaths.product(slug));
      } else {
        context.pushReplacement(RoutePaths.search, extra: code);
      }
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = "Couldn't look that up. Try again.";
      });
      await _controller.start();
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          Positioned.fill(
            child: MobileScanner(controller: _controller, onDetect: _onDetect),
          ),
          const Positioned.fill(child: _ScanMask()),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(AppSpace.s16),
              child: Row(
                children: [
                  _RoundButton(
                    icon: AppIcons.close,
                    onTap: () => Navigator.of(context).maybePop(),
                  ),
                  const Spacer(),
                  ValueListenableBuilder<MobileScannerState>(
                    valueListenable: _controller,
                    builder: (context, state, _) => _RoundButton(
                      icon: AppIcons.bolt,
                      active: state.torchState == TorchState.on,
                      onTap: _controller.toggleTorch,
                    ),
                  ),
                ],
              ),
            ),
          ),
          const Align(
            alignment: Alignment.center,
            child: _ScanFrame(),
          ),
          Positioned(
            left: 0,
            right: 0,
            bottom: 56,
            child: Column(
              children: [
                Text(
                  _busy ? 'Looking it up…' : 'Point the camera at a barcode',
                  style: context.text.bodyMedium?.copyWith(color: Colors.white),
                ),
                if (_error != null) ...[
                  const SizedBox(height: AppSpace.s8),
                  Text(
                    _error!,
                    style: context.text.bodySmall?.copyWith(color: c.error),
                  ),
                ],
                if (_busy) ...[
                  const SizedBox(height: AppSpace.s12),
                  const SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

const _frameSize = 240.0;

class _ScanFrame extends StatelessWidget {
  const _ScanFrame();

  @override
  Widget build(BuildContext context) => Container(
    width: _frameSize,
    height: _frameSize,
    decoration: BoxDecoration(
      border: Border.all(color: Colors.white.withValues(alpha: 0.9), width: 2),
      borderRadius: BorderRadius.circular(AppRadius.lg),
    ),
  );
}

/// Darkens everything outside the scan frame's cutout, so the live camera
/// preview only reads as "active" inside the target square — the standard
/// scanner-overlay look, rather than a bright preview with a thin outline
/// floating on top of it.
class _ScanMask extends StatelessWidget {
  const _ScanMask();

  @override
  Widget build(BuildContext context) =>
      CustomPaint(painter: _ScanMaskPainter(), size: Size.infinite);
}

class _ScanMaskPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final cutout = RRect.fromRectAndRadius(
      Rect.fromCenter(
        center: Offset(size.width / 2, size.height / 2),
        width: _frameSize,
        height: _frameSize,
      ),
      const Radius.circular(AppRadius.lg),
    );
    final mask = Path.combine(
      PathOperation.difference,
      Path()..addRect(Rect.fromLTWH(0, 0, size.width, size.height)),
      Path()..addRRect(cutout),
    );
    canvas.drawPath(mask, Paint()..color = Colors.black.withValues(alpha: 0.6));
  }

  @override
  bool shouldRepaint(_ScanMaskPainter oldDelegate) => false;
}

class _RoundButton extends StatelessWidget {
  const _RoundButton({required this.icon, required this.onTap, this.active = false});

  final IconData icon;
  final VoidCallback onTap;
  final bool active;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Material(
      color: active ? c.primary : Colors.black.withValues(alpha: 0.45),
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(10),
          child: Icon(icon, size: 18, color: Colors.white),
        ),
      ),
    );
  }
}
