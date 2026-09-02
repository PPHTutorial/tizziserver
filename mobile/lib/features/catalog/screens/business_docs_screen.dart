import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';
import '../../auth/auth_util.dart';
import '../catalog_providers.dart';

const _docTypes = ['CERTIFICATE_OF_INCORPORATION', 'TAX_CERTIFICATE', 'ID_DOCUMENT', 'PROOF_OF_ADDRESS', 'OTHER'];

/// §24 / §25 — KYC evidence documents on the vendor's business.
class BusinessDocsScreen extends ConsumerWidget {
  const BusinessDocsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final async = ref.watch(businessDocsProvider);

    return Scaffold(
      backgroundColor: c.bg,
      appBar: AppBar(title: const Text('Verification documents')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _add(context, ref),
        icon: const Icon(Icons.upload_file),
        label: const Text('Add'),
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => CenteredState.error(
          title: 'Couldn\'t load documents',
          action: PrimaryButton(label: 'Retry', onPressed: () => ref.invalidate(businessDocsProvider)),
        ),
        data: (docs) => docs.isEmpty
            ? const CenteredState(
                icon: Icons.description_outlined,
                title: 'No documents yet',
                body: 'Add your business registration and ID to speed up KYC.',
              )
            : ListView.separated(
                padding: const EdgeInsets.all(AppSpace.s16),
                itemCount: docs.length,
                separatorBuilder: (_, __) => const SizedBox(height: AppSpace.s8),
                itemBuilder: (context, i) {
                  final d = docs[i];
                  return Container(
                    padding: const EdgeInsets.all(AppSpace.s12),
                    decoration: BoxDecoration(
                      color: c.surface,
                      borderRadius: BorderRadius.circular(AppRadius.lg),
                      border: Border.all(color: c.border),
                    ),
                    child: Row(
                      children: [
                        Icon(Icons.description_outlined, color: c.textMed),
                        const SizedBox(width: AppSpace.s12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(d.type.replaceAll('_', ' '), style: context.text.titleSmall),
                              Text(d.fileKey,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: context.text.bodyMedium?.copyWith(color: c.textMed)),
                            ],
                          ),
                        ),
                        Text(d.status, style: context.text.labelSmall?.copyWith(color: c.textMed)),
                      ],
                    ),
                  );
                },
              ),
      ),
    );
  }

  Future<void> _add(BuildContext context, WidgetRef ref) async {
    var type = _docTypes.first;
    final fileKey = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setLocal) => AlertDialog(
          title: const Text('Add a document'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              DropdownButtonFormField<String>(
                value: type,
                decoration: const InputDecoration(labelText: 'Type', border: OutlineInputBorder()),
                items: [for (final t in _docTypes) DropdownMenuItem(value: t, child: Text(t.replaceAll('_', ' ')))],
                onChanged: (v) => setLocal(() => type = v ?? type),
              ),
              const SizedBox(height: AppSpace.s12),
              AppField(label: 'File key', controller: fileKey, hintText: 'uploads/cert.pdf'),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
            TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Save')),
          ],
        ),
      ),
    );
    if (ok != true || fileKey.text.trim().isEmpty) return;
    final err = await runCatching(
      () => ref.read(stallApiProvider).addBusinessDocument(type: type, fileKey: fileKey.text.trim()),
    );
    if (!context.mounted) return;
    if (err == null) {
      ref.invalidate(businessDocsProvider);
    } else {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(err)));
    }
  }
}
