import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/providers.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';
import '../courier_providers.dart';
import '../../../design/icons.dart';

/// Courier onboarding — register, add a vehicle, upload ID + selfie (mock file
/// keys in dev), accept the agreement, submit for review.
class CourierOnboardingScreen extends ConsumerStatefulWidget {
  const CourierOnboardingScreen({super.key});

  @override
  ConsumerState<CourierOnboardingScreen> createState() => _CourierOnboardingScreenState();
}

class _CourierOnboardingScreenState extends ConsumerState<CourierOnboardingScreen> {
  final _first = TextEditingController();
  final _last = TextEditingController();
  final _plate = TextEditingController();
  String _vehicle = 'MOTORBIKE';
  bool _idFront = false, _idBack = false, _selfie = false, _agree = false;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _first.dispose();
    _last.dispose();
    _plate.dispose();
    super.dispose();
  }

  bool get _ready => _first.text.trim().isNotEmpty && _idFront && _idBack && _selfie && _agree;

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final api = ref.read(stallApiProvider);
    try {
      await api.courierOnboard(firstName: _first.text.trim(), lastName: _last.text.trim(), agreementAccepted: true);
      await api.courierAddVehicle(type: _vehicle, plate: _plate.text.trim().isEmpty ? null : _plate.text.trim());
      await api.courierSubmitKyc(
        documents: [
          {'type': 'ID_FRONT', 'fileKey': 'kyc/${DateTime.now().millisecondsSinceEpoch}-front.jpg'},
          {'type': 'ID_BACK', 'fileKey': 'kyc/${DateTime.now().millisecondsSinceEpoch}-back.jpg'},
        ],
        selfieKey: 'kyc/${DateTime.now().millisecondsSinceEpoch}-selfie.jpg',
      );
      ref.invalidate(courierMeProvider);
      ref.invalidate(courierDashboardProvider);
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Submitted — we\'ll review your application shortly.')));
        context.pop();
      }
    } catch (e) {
      setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Scaffold(
      appBar: AppBar(title: const Text('Courier sign-up')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(AppSpace.s16),
          children: [
            Text('Your details', style: context.text.titleMedium),
            const SizedBox(height: AppSpace.s8),
            AppField(label: 'First name', controller: _first, onChanged: (_) => setState(() {})),
            const SizedBox(height: AppSpace.s8),
            AppField(label: 'Last name', controller: _last),
            const SizedBox(height: AppSpace.s20),
            Text('Vehicle', style: context.text.titleMedium),
            const SizedBox(height: AppSpace.s8),
            Wrap(
              spacing: AppSpace.s8,
              children: ['BICYCLE', 'MOTORBIKE', 'CAR', 'VAN']
                  .map((v) => ChoiceChip(
                        label: Text(v[0] + v.substring(1).toLowerCase()),
                        selected: _vehicle == v,
                        onSelected: (_) => setState(() => _vehicle = v),
                      ))
                  .toList(),
            ),
            const SizedBox(height: AppSpace.s8),
            AppField(label: 'Plate number (optional)', controller: _plate),
            const SizedBox(height: AppSpace.s20),
            Text('Identity check', style: context.text.titleMedium),
            const SizedBox(height: AppSpace.s8),
            _UploadTile(label: 'ID — front', done: _idFront, onTap: () => setState(() => _idFront = true)),
            _UploadTile(label: 'ID — back', done: _idBack, onTap: () => setState(() => _idBack = true)),
            _UploadTile(label: 'Selfie / liveness', done: _selfie, onTap: () => setState(() => _selfie = true)),
            const SizedBox(height: AppSpace.s12),
            CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              value: _agree,
              onChanged: (v) => setState(() => _agree = v ?? false),
              title: Text('I accept the courier agreement and terms', style: context.text.bodyMedium),
            ),
            if (_error != null) InlineError(_error),
            const SizedBox(height: AppSpace.s16),
            PrimaryButton(
              label: 'Submit application',
              loading: _busy,
              onPressed: _ready ? _submit : null,
            ),
            const SizedBox(height: AppSpace.s8),
            Text('Dev build: document capture is stubbed with placeholder keys.',
                style: context.text.bodySmall?.copyWith(color: c.textLow)),
          ],
        ),
      ),
    );
  }
}

class _UploadTile extends StatelessWidget {
  const _UploadTile({required this.label, required this.done, required this.onTap});
  final String label;
  final bool done;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: Icon(done ? AppIcons.check_circle : AppIcons.upload_file, color: done ? c.success : c.textMed),
      title: Text(label),
      trailing: TextButton(onPressed: onTap, child: Text(done ? 'Replace' : 'Upload')),
    );
  }
}
