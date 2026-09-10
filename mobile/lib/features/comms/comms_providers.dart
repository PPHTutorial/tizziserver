import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/comms_models.dart';
import '../../app/providers.dart';
import 'comms_realtime.dart';

final conversationsProvider = FutureProvider.autoDispose<List<ConversationCardDto>>(
  (ref) => ref.watch(stallApiProvider).conversations(),
);

typedef ChatThread = ({List<ChatMessageDto> items, String? nextCursor, bool peerTyping});

/// Live thread — seeds from REST, then keeps itself current off the `/chat`
/// socket: a `chat:message` push triggers an authoritative refetch (the push
/// itself is only ids + a preview), `chat:typing` toggles [ChatThread.peerTyping].
/// A slow 20s REST re-poll stays as a safety net if the socket is down.
final messagesProvider = StreamProvider.autoDispose.family<ChatThread, String>((ref, conversationId) {
  final api = ref.watch(stallApiProvider);
  final realtime = ref.watch(commsRealtimeProvider);

  final controller = StreamController<ChatThread>();
  ChatThread current = (items: const [], nextCursor: null, peerTyping: false);
  var disposed = false;
  Timer? debounce;
  Timer? safetyPoll;

  void push() {
    if (!disposed && !controller.isClosed) controller.add(current);
  }

  Future<void> refetch() async {
    try {
      final page = await api.messages(conversationId);
      if (disposed) return;
      current = (items: page.items, nextCursor: page.nextCursor, peerTyping: current.peerTyping);
      push();
    } catch (_) {
      // keep whatever we last had
    }
  }

  void scheduleRefetch() {
    debounce?.cancel();
    debounce = Timer(const Duration(milliseconds: 250), refetch);
  }

  realtime.openConversation(conversationId);
  final subMsg = realtime.messageIn(conversationId).listen((_) => scheduleRefetch());
  final subTyping = realtime.typing(conversationId).listen((t) {
    if (disposed || current.peerTyping == t) return;
    current = (items: current.items, nextCursor: current.nextCursor, peerTyping: t);
    push();
  });
  safetyPoll = Timer.periodic(const Duration(seconds: 20), (_) => refetch());

  refetch();

  ref.onDispose(() {
    disposed = true;
    debounce?.cancel();
    safetyPoll?.cancel();
    subMsg.cancel();
    subTyping.cancel();
    realtime.closeConversation(conversationId);
    if (!controller.isClosed) controller.close();
  });

  return controller.stream;
});

final notificationFeedProvider = FutureProvider.autoDispose<NotificationFeedDto>(
  (ref) => ref.watch(stallApiProvider).notifications(),
);

/// Unread badge for the app-bar bell (0 while loading / errored).
final unreadNotificationsProvider = Provider.autoDispose<int>(
  (ref) => ref.watch(notificationFeedProvider).maybeWhen(data: (f) => f.unread, orElse: () => 0),
);

final notificationPrefsProvider = FutureProvider.autoDispose<List<NotificationPrefDto>>(
  (ref) => ref.watch(stallApiProvider).notificationPreferences(),
);

/// Keeps the inbox list + notification feed (and so the bell badge) fresh off
/// the `/chat` and `/notifications` sockets. Kept mounted by `HomeShell`.
final commsLiveSyncProvider = Provider<void>((ref) {
  final realtime = ref.watch(commsRealtimeProvider);
  realtime.listenNotifications();
  final a = realtime.inboxChanged.listen((_) => ref.invalidate(conversationsProvider));
  final b = realtime.notificationReceived.listen((_) => ref.invalidate(notificationFeedProvider));
  ref.onDispose(() {
    a.cancel();
    b.cancel();
  });
});
