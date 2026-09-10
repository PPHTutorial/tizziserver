import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:socket_io_client/socket_io_client.dart' as sio;

import '../../app/providers.dart';
import '../../core/realtime.dart';

/// One app-lifetime pair of connections to `apps/realtime`'s `/chat` and
/// `/notifications` namespaces. Both auto-join `user:${userId}` on connect,
/// so inbox + notification pushes arrive without any client subscribe; the
/// open-conversation room is joined on demand via [openConversation].
///
/// Socket payloads are deliberately thin (`chat:message` carries only ids +
/// a preview, `notification` only the row) — every listener here is a
/// *signal to refetch* the authoritative REST view, not a source of record.
class CommsRealtime {
  CommsRealtime(this._realtimeUrl, this._token);

  final String _realtimeUrl;
  final String? _token;

  sio.Socket? _chat;
  sio.Socket? _notifications;

  final _inboxChanged = StreamController<void>.broadcast();
  final _notificationReceived = StreamController<void>.broadcast();
  final _messageIn = <String, StreamController<void>>{};
  final _typing = <String, StreamController<bool>>{};
  final _typingResetTimers = <String, Timer>{};

  /// Fires when a `chat:inbox` push says a conversation list row changed.
  Stream<void> get inboxChanged => _inboxChanged.stream;

  /// Fires when a `notification` push arrives.
  Stream<void> get notificationReceived => _notificationReceived.stream;

  /// Fires when a new message lands in [conversationId] — refetch the thread.
  Stream<void> messageIn(String conversationId) =>
      (_messageIn[conversationId] ??= StreamController<void>.broadcast()).stream;

  /// `true` briefly after the peer's `chat:typing`, auto-resets to `false`.
  Stream<bool> typing(String conversationId) =>
      (_typing[conversationId] ??= StreamController<bool>.broadcast()).stream;

  void _ensureChat() {
    if (_chat != null) return;
    final s = connectRealtimeSocket(_realtimeUrl, '/chat', _token);
    _chat = s;
    // Re-join every open thread's room after a reconnect — registered once.
    s.onConnect((_) {
      for (final id in _messageIn.keys) {
        s.emit('subscribe', {'conversationId': id});
      }
    });
    s.on('chat:inbox', (_) => _emit(_inboxChanged));
    s.on('chat:message', (data) {
      final id = data is Map ? data['conversationId'] as String? : null;
      // `chat:message`'s payload has no conversationId (it's the outbox
      // event's `payload`), so it can't target a specific thread — treat it
      // as "something changed" for every open thread + the inbox.
      if (id != null) {
        _emit(_messageIn[id]);
      } else {
        for (final c in _messageIn.values) {
          if (!c.isClosed) c.add(null);
        }
      }
      _emit(_inboxChanged);
    });
    s.on('chat:typing', (data) {
      final id = data is Map ? data['conversationId'] as String? : null;
      if (id == null) return;
      final c = _typing[id];
      if (c == null || c.isClosed) return;
      c.add(true);
      _typingResetTimers[id]?.cancel();
      _typingResetTimers[id] = Timer(const Duration(seconds: 4), () {
        if (!c.isClosed) c.add(false);
      });
    });
  }

  void _ensureNotifications() {
    if (_notifications != null) return;
    final s = connectRealtimeSocket(_realtimeUrl, '/notifications', _token);
    _notifications = s;
    s.on('notification', (_) => _emit(_notificationReceived));
  }

  /// Call before listening to [messageIn]/[typing] for a thread.
  void openConversation(String conversationId) {
    _ensureChat();
    _messageIn[conversationId] ??= StreamController<void>.broadcast();
    _typing[conversationId] ??= StreamController<bool>.broadcast();
    if (_chat!.connected) _chat!.emit('subscribe', {'conversationId': conversationId});
  }

  void closeConversation(String conversationId) {
    _chat?.emit('unsubscribe', {'conversationId': conversationId});
    _typingResetTimers.remove(conversationId)?.cancel();
    _messageIn.remove(conversationId)?.close();
    _typing.remove(conversationId)?.close();
  }

  void sendTyping(String conversationId) {
    if (_chat?.connected ?? false) _chat!.emit('typing', {'conversationId': conversationId});
  }

  /// Keeps the notification stream warm even if no conversation is open.
  void listenNotifications() => _ensureNotifications();

  void _emit(StreamController<void>? c) {
    if (c != null && !c.isClosed) c.add(null);
  }

  void dispose() {
    for (final t in _typingResetTimers.values) {
      t.cancel();
    }
    _typingResetTimers.clear();
    _chat?.dispose();
    _notifications?.dispose();
    _inboxChanged.close();
    _notificationReceived.close();
    for (final c in _messageIn.values) {
      c.close();
    }
    for (final c in _typing.values) {
      c.close();
    }
    _messageIn.clear();
    _typing.clear();
  }
}

/// App-lifetime, rebuilt on login/logout (so it reconnects with a fresh
/// token and tears the sockets down when the session ends).
final commsRealtimeProvider = Provider<CommsRealtime>((ref) {
  ref.watch(authControllerProvider);
  final config = ref.watch(apiConfigProvider);
  final rt = CommsRealtime(config.realtimeUrl, ref.read(tokenStoreProvider).access);
  ref.onDispose(rt.dispose);
  return rt;
});
