import 'package:flutter/material.dart';
import 'package:speech_to_text/speech_to_text.dart' as stt;

import '../../../design/components.dart';
import '../../../design/context_ext.dart';
import '../../../design/icons.dart';

/// Opened from the home search bar's mic icon. Records speech and pops with
/// the final recognized text (or null if cancelled/unavailable) for the
/// caller to route into search.
class VoiceSearchDialog extends StatefulWidget {
  const VoiceSearchDialog({super.key});

  @override
  State<VoiceSearchDialog> createState() => _VoiceSearchDialogState();
}

class _VoiceSearchDialogState extends State<VoiceSearchDialog> {
  final _speech = stt.SpeechToText();
  bool _listening = false;
  String _text = '';
  String? _error;

  @override
  void initState() {
    super.initState();
    _start();
  }

  Future<void> _start() async {
    setState(() {
      _error = null;
      _text = '';
    });
    final ok = await _speech.initialize(
      onStatus: (status) {
        if (!mounted) return;
        if (status == 'done' || status == 'notListening') {
          setState(() => _listening = false);
        }
      },
      onError: (error) {
        if (!mounted) return;
        setState(() {
          _listening = false;
          _error = "Couldn't hear you. Try again or type instead.";
        });
      },
    );
    if (!mounted) return;
    if (!ok) {
      setState(() => _error = 'Voice search needs microphone access.');
      return;
    }
    setState(() => _listening = true);
    await _speech.listen(
      onResult: (result) {
        if (!mounted) return;
        setState(() => _text = result.recognizedWords);
        // Pop as soon as a final transcript lands — don't wait on a status
        // callback, whose 'done'/'notListening' ordering relative to the
        // final result isn't guaranteed across platforms and previously
        // left the dialog stuck showing text with no way forward but Cancel.
        if (result.finalResult) {
          final text = result.recognizedWords.trim();
          if (text.isNotEmpty) {
            Navigator.of(context).pop(text);
          } else {
            setState(() {
              _listening = false;
              _error = "Couldn't hear you. Try again or type instead.";
            });
          }
        }
      },
      listenOptions: stt.SpeechListenOptions(
        cancelOnError: true,
        partialResults: true,
        listenFor: const Duration(seconds: 12),
        pauseFor: const Duration(seconds: 3),
      ),
    );
  }

  @override
  void dispose() {
    _speech.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return AppDialog(
      icon: AppIcons.mic,
      iconColor: _listening ? c.primary : c.textLow,
      title: _listening ? 'Listening…' : (_error ?? 'Starting…'),
      message: _text.isNotEmpty ? _text : null,
      actions: [
        if (_error != null && !_listening)
          AppDialogAction(
            label: 'Try again',
            emphasized: true,
            onPressed: _start,
          ),
        AppDialogAction(
          label: 'Cancel',
          onPressed: () {
            _speech.cancel();
            Navigator.of(context).pop();
          },
        ),
      ],
    );
  }
}
