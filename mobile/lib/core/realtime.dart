import 'package:socket_io_client/socket_io_client.dart' as sio;

/// Connects a fresh socket to an `apps/realtime` namespace, JWT-authenticated
/// at the handshake (matching `apps/realtime/src/server.ts`'s
/// `io.of(ns).use(...)`). The token is checked once at connect time, not
/// per-event — a caller that expects to hold the connection open across an
/// access-token refresh should build a new socket rather than mutate this
/// one's auth in place.
sio.Socket connectRealtimeSocket(String realtimeUrl, String namespace, String? accessToken) {
  final socket = sio.io(
    '$realtimeUrl$namespace',
    sio.OptionBuilder()
        .setTransports(['websocket'])
        .disableAutoConnect()
        .setAuth({'token': accessToken ?? ''})
        .build(),
  );
  socket.connect();
  return socket;
}

sio.Socket connectTrackingSocket(String realtimeUrl, String? accessToken) =>
    connectRealtimeSocket(realtimeUrl, '/tracking', accessToken);
