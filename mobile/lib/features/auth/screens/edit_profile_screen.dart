import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../../app/providers.dart';
import '../../../core/api_config.dart';
import '../../../design/components.dart';
import '../../../design/context_ext.dart';
import '../../../design/icons.dart';
import '../../../design/tokens.g.dart';
import '../../../design/widgets.dart';

/// Settings > Edit Profile — display name + avatar.
class EditProfileScreen extends ConsumerStatefulWidget {
  const EditProfileScreen({super.key});

  @override
  ConsumerState<EditProfileScreen> createState() => _EditProfileScreenState();
}

class _EditProfileScreenState extends ConsumerState<EditProfileScreen> {
  late final _first = TextEditingController(
    text: ref.read(authControllerProvider).user?.firstName,
  );
  late final _last = TextEditingController(
    text: ref.read(authControllerProvider).user?.lastName,
  );
  late String? _avatarKey = ref.read(authControllerProvider).user?.avatar;
  bool _busy = false;
  bool _uploadingAvatar = false;
  String? _error;

  @override
  void dispose() {
    _first.dispose();
    _last.dispose();
    super.dispose();
  }

  Future<void> _pickAvatar() async {
    final picked = await ImagePicker().pickImage(
      source: ImageSource.gallery,
      imageQuality: 85,
      maxWidth: 1024,
    );
    if (picked == null) return;
    setState(() {
      _uploadingAvatar = true;
      _error = null;
    });
    try {
      final bytes = await picked.readAsBytes();
      final key = await ref
          .read(stallApiProvider)
          .uploadMedia(bytes: bytes, filename: picked.name, kind: 'avatar');
      if (mounted) setState(() => _avatarKey = key);
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _uploadingAvatar = false);
    }
  }

  Future<void> _save() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final updated = await ref
          .read(stallApiProvider)
          .updateProfile(
            firstName: _first.text.trim(),
            lastName: _last.text.trim(),
            avatar: _avatarKey,
          );
      ref.read(authControllerProvider.notifier).setUser(updated);
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final user = ref.watch(authControllerProvider).user;
    return Scaffold(
      backgroundColor: c.bg,
      body: SafeArea(
        child: Column(
          children: [
            const AppScreenHeader('Edit profile'),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.all(AppSpace.s16),
                children: [
                  Center(
                    child: GestureDetector(
                      onTap: _uploadingAvatar ? null : _pickAvatar,
                      child: Stack(
                        clipBehavior: Clip.none,
                        children: [
                          CircleAvatar(
                            radius: 40,
                            backgroundColor: c.primaryContainer,
                            backgroundImage:
                                (_avatarKey == null || _avatarKey!.isEmpty)
                                ? null
                                : NetworkImage(mediaUrl(_avatarKey!)),
                            child: (_avatarKey == null || _avatarKey!.isEmpty)
                                ? Text(
                                    (user?.displayName ?? 'A').characters.first
                                        .toUpperCase(),
                                    style: context.text.headlineMedium
                                        ?.copyWith(
                                          color: c.onPrimaryContainer,
                                        ),
                                  )
                                : null,
                          ),
                          if (_uploadingAvatar)
                            Positioned.fill(
                              child: DecoratedBox(
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: Colors.black.withValues(alpha: 0.35),
                                ),
                                child: const Center(
                                  child: SizedBox(
                                    width: 22,
                                    height: 22,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      color: Colors.white,
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          Positioned(
                            right: -2,
                            bottom: -2,
                            child: Material(
                              color: c.primary,
                              shape: const CircleBorder(),
                              child: const Padding(
                                padding: EdgeInsets.all(6),
                                child: Icon(
                                  AppIcons.camera,
                                  size: 14,
                                  color: Colors.white,
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: AppSpace.s24),
                  AppField(
                    label: 'First name',
                    hintText: 'e.g. Kwame',
                    controller: _first,
                  ),
                  const SizedBox(height: AppSpace.s16),
                  AppField(
                    label: 'Last name',
                    hintText: 'e.g. Mensah',
                    controller: _last,
                  ),
                  const SizedBox(height: AppSpace.s16),
                  AppCard(
                    child: Row(
                      children: [
                        Icon(AppIcons.info_outline, size: 18, color: c.textMed),
                        const SizedBox(width: AppSpace.s10),
                        Expanded(
                          child: Text(
                            user?.phone ??
                                user?.email ??
                                'Contact details can\'t be changed here.',
                            style: context.text.bodySmall?.copyWith(
                              color: c.textMed,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: AppSpace.s12),
                    InlineError(_error!),
                  ],
                  const SizedBox(height: AppSpace.s24),
                  PrimaryButton(
                    label: 'Save',
                    loading: _busy,
                    onPressed: _busy ? null : _save,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
