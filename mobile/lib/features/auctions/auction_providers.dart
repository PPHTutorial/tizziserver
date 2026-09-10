import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/auction_models.dart';
import '../../app/providers.dart';

final auctionsProvider = FutureProvider.autoDispose<List<AuctionCardDto>>(
  (ref) => ref.watch(stallApiProvider).auctions(),
);

final auctionDetailProvider = FutureProvider.autoDispose.family<AuctionDetailDto, String>(
  (ref, slug) => ref.watch(stallApiProvider).auction(slug),
);

final auctionQualificationProvider = FutureProvider.autoDispose.family<QualificationDto, String>(
  (ref, slug) => ref.watch(stallApiProvider).auctionQualification(slug),
);

final auctionLeaderboardProvider =
    FutureProvider.autoDispose.family<List<({int rank, String name, int ticketCount, double score})>, String>(
  (ref, slug) => ref.watch(stallApiProvider).auctionLeaderboard(slug),
);

final myTicketWalletsProvider = FutureProvider.autoDispose<List<TicketWalletDto>>(
  (ref) => ref.watch(stallApiProvider).myTicketWallets(),
);

final myWinProvider = FutureProvider.autoDispose.family<MyWinDto, String>(
  (ref, slug) => ref.watch(stallApiProvider).auctionMyWin(slug),
);
