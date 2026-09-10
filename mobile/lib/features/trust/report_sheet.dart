import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../design/components.dart';
import '../../design/context_ext.dart';
import '../../design/tokens.g.dart';
import '../../design/widgets.dart';
import 'trust_providers.dart';

/// §24 (430–433) — one report flow for every reportable entity. `targetType`
/// must be one of the server's `ReportTargetType` values:
/// USER · PRODUCT · VENDOR · COURIER · CONVERSATION · ORDER · DELIVERY.
const _categories = <String>[
  'Spam or misleading',
  'Scam or fraud',
  'Harassment or abuse',
  'Inappropriate content',
  'Counterfeit or unsafe item',
  'Safety concern',
  'Other',
];

Future<void> showReportSheet(
  BuildContext context,
  WidgetRef ref, {
  required String targetType,
  required String targetId,
  String? targetLabel,
}) {
  return showAppSheet<void>(
    context,
    builder: (context) => _ReportForm(
      targetType: targetType,
      targetId: targetId,
      targetLabel: targetLabel ?? targetType.toLowerCase(),
      ref: ref,
    ),
  );
}

class _ReportForm extends StatefulWidget {
  const _ReportForm({
    required this.targetType,
    required this.targetId,
    required this.targetLabel,
    required this.ref,
  });
  final String targetType;
  final String targetId;
  final String targetLabel;
  final WidgetRef ref;

  @override
  State<_ReportForm> createState() => _ReportFormState();
}

class _ReportFormState extends State<_ReportForm> {
  String? _category;
  final _detail = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _detail.dispose();
    super.dispose();
  }

  bool get _valid => _category != null && _detail.text.trim().length >= 3;

  Future<void> _submit() async {
    if (!_valid) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.ref.read(stallApiProvider).submitReport(
            targetType: widget.targetType,
            targetId: widget.targetId,
            category: _category!,
            body: _detail.text.trim(),
          );
      widget.ref.invalidate(myReportsProvider);
      if (mounted) {
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Thanks — our team will review this.')),
        );
      }
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(AppSpace.s16, 0, AppSpace.s16, AppSpace.s16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Report this ${widget.targetLabel}', style: context.text.titleMedium),
          const SizedBox(height: AppSpace.s4),
          Text('Your report is confidential.',
              style: context.text.bodyMedium?.copyWith(color: c.textMed)),
          const SizedBox(height: AppSpace.s16),
          Wrap(
            spacing: AppSpace.s8,
            runSpacing: AppSpace.s8,
            children: [
              for (final cat in _categories)
                ChoiceChip(
                  label: Text(cat),
                  selected: _category == cat,
                  onSelected: (_) => setState(() => _category = cat),
                ),
            ],
          ),
          const SizedBox(height: AppSpace.s16),
          AppField(
            label: 'What happened?',
            controller: _detail,
            hintText: 'Add any detail that helps us investigate',
            maxLines: 4,
            onChanged: (_) => setState(() {}),
          ),
          if (_error != null) InlineError(_error!),
          const SizedBox(height: AppSpace.s16),
          PrimaryButton(
            label: 'Submit report',
            loading: _busy,
            onPressed: _valid ? _submit : null,
          ),
        ],
      ),
    );
  }
}
