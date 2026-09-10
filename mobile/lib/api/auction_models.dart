// Phase 5 — Inverse Draw / auction models. Mirrors packages/contracts/src/auction.ts.

int _i(dynamic v) => v == null ? 0 : (v as num).toInt();
double _d(dynamic v) => v == null ? 0 : (v as num).toDouble();
String _s(dynamic v) => (v as String?) ?? '';
DateTime? _dt(dynamic v) => v == null ? null : DateTime.tryParse(v as String);
List<Map<String, dynamic>> _list(dynamic v) =>
    (v as List<dynamic>? ?? const []).map((e) => (e as Map).cast<String, dynamic>()).toList();

class TicketPackageDto {
  const TicketPackageDto({
    required this.id,
    required this.name,
    required this.ticketCount,
    required this.bonusTickets,
    required this.priceMinor,
  });
  final String id;
  final String name;
  final int ticketCount;
  final int bonusTickets;
  final int priceMinor;
  factory TicketPackageDto.fromJson(Map<String, dynamic> j) => TicketPackageDto(
        id: _s(j['id']),
        name: _s(j['name']),
        ticketCount: _i(j['ticketCount']),
        bonusTickets: _i(j['bonusTickets']),
        priceMinor: _i(j['priceMinor']),
      );
}

class AuctionCardDto {
  const AuctionCardDto({
    required this.id,
    required this.slug,
    required this.title,
    this.description,
    required this.status,
    required this.currency,
    required this.retailValueMinor,
    required this.ticketPriceMinor,
    required this.winTargetMinor,
    required this.seatsTotal,
    required this.seatsSold,
    required this.seatsLeft,
    required this.fillPct,
    required this.minSeatsToDraw,
    this.drawAt,
    required this.participants,
    this.image,
    this.packages = const [],
  });

  final String id;
  final String slug;
  final String title;
  final String? description;
  final String status;
  final String currency;
  final int retailValueMinor;
  final int ticketPriceMinor;
  final int winTargetMinor;
  final int seatsTotal;
  final int seatsSold;
  final int seatsLeft;
  final int fillPct;
  final int minSeatsToDraw;
  final DateTime? drawAt;
  final int participants;
  final String? image;
  final List<TicketPackageDto> packages;

  bool get isOpen => const {'OPEN', 'FILLING', 'ANNOUNCED'}.contains(status);
  bool get isDrawn => const {'DRAWING', 'COMPLETED', 'UNSOLD', 'DRAW_PENDING'}.contains(status);

  factory AuctionCardDto.fromJson(Map<String, dynamic> j) => AuctionCardDto(
        id: _s(j['id']),
        slug: _s(j['slug']),
        title: _s(j['title']),
        description: j['description'] as String?,
        status: _s(j['status']),
        currency: j['currency'] as String? ?? 'GHS',
        retailValueMinor: _i(j['retailValueMinor']),
        ticketPriceMinor: _i(j['ticketPriceMinor']),
        winTargetMinor: _i(j['winTargetMinor']),
        seatsTotal: _i(j['seatsTotal']),
        seatsSold: _i(j['seatsSold']),
        seatsLeft: _i(j['seatsLeft']),
        fillPct: _i(j['fillPct']),
        minSeatsToDraw: _i(j['minSeatsToDraw']),
        drawAt: _dt(j['drawAt']),
        participants: _i(j['participants']),
        image: j['image'] as String?,
        packages: _list(j['packages']).map(TicketPackageDto.fromJson).toList(),
      );
}

class AuctionDetailDto extends AuctionCardDto {
  AuctionDetailDto({
    required super.id,
    required super.slug,
    required super.title,
    super.description,
    required super.status,
    required super.currency,
    required super.retailValueMinor,
    required super.ticketPriceMinor,
    required super.winTargetMinor,
    required super.seatsTotal,
    required super.seatsSold,
    required super.seatsLeft,
    required super.fillPct,
    required super.minSeatsToDraw,
    super.drawAt,
    required super.participants,
    super.image,
    super.packages,
    this.assetTitle,
    this.assetMedia = const [],
    this.assetSpecs,
    this.productId,
    this.myTicketCount = 0,
    this.myScore = 0,
    this.myRank,
    this.drawResultHash,
    this.drawSeedCommitHash,
    this.drawSeedReveal,
    this.winnerIsMe = false,
  });

  final String? assetTitle;
  final List<String> assetMedia;
  final Map<String, dynamic>? assetSpecs;
  final String? productId;
  final int myTicketCount;
  final double myScore;
  final int? myRank;
  final String? drawResultHash;
  final String? drawSeedCommitHash;
  final String? drawSeedReveal;
  final bool winnerIsMe;

  factory AuctionDetailDto.fromJson(Map<String, dynamic> j) {
    final assets = _list(j['assets']);
    final mine = (j['mine'] as Map?)?.cast<String, dynamic>();
    final draw = (j['draw'] as Map?)?.cast<String, dynamic>();
    return AuctionDetailDto(
      id: _s(j['id']),
      slug: _s(j['slug']),
      title: _s(j['title']),
      description: j['description'] as String?,
      status: _s(j['status']),
      currency: j['currency'] as String? ?? 'GHS',
      retailValueMinor: _i(j['retailValueMinor']),
      ticketPriceMinor: _i(j['ticketPriceMinor']),
      winTargetMinor: _i(j['winTargetMinor']),
      seatsTotal: _i(j['seatsTotal']),
      seatsSold: _i(j['seatsSold']),
      seatsLeft: _i(j['seatsLeft']),
      fillPct: _i(j['fillPct']),
      minSeatsToDraw: _i(j['minSeatsToDraw']),
      drawAt: _dt(j['drawAt']),
      participants: _i(j['participants']),
      image: j['image'] as String?,
      packages: _list(j['packages']).map(TicketPackageDto.fromJson).toList(),
      assetTitle: assets.isEmpty ? null : assets.first['title'] as String?,
      assetMedia: assets.isEmpty ? const [] : (assets.first['media'] as List<dynamic>? ?? const []).cast<String>(),
      assetSpecs: assets.isEmpty ? null : (assets.first['specs'] as Map?)?.cast<String, dynamic>(),
      productId: j['productId'] as String?,
      myTicketCount: _i(mine?['ticketCount']),
      myScore: _d(mine?['qualificationScore']),
      myRank: (mine?['rank'] as num?)?.toInt(),
      drawResultHash: draw?['resultHash'] as String?,
      drawSeedCommitHash: draw?['seedCommitHash'] as String?,
      drawSeedReveal: draw?['seedReveal'] as String?,
      winnerIsMe: draw?['winnerIsMe'] == true,
    );
  }
}

class QualificationDto {
  const QualificationDto({
    required this.qualificationScore,
    this.rank,
    required this.totalParticipants,
    required this.eligible,
    required this.ticketCount,
    required this.breakdown,
    required this.note,
  });
  final double qualificationScore;
  final int? rank;
  final int totalParticipants;
  final bool eligible;
  final int ticketCount;
  final List<({String factor, double weight, double points, double contribution})> breakdown;
  final String note;

  factory QualificationDto.fromJson(Map<String, dynamic> j) => QualificationDto(
        qualificationScore: _d(j['qualificationScore']),
        rank: (j['rank'] as num?)?.toInt(),
        totalParticipants: _i(j['totalParticipants']),
        eligible: j['eligible'] == true,
        ticketCount: _i(j['ticketCount']),
        breakdown: _list(j['breakdown'])
            .map((b) => (factor: _s(b['factor']), weight: _d(b['weight']), points: _d(b['points']), contribution: _d(b['contribution'])))
            .toList(),
        note: _s(j['note']),
      );
}

class TicketWalletDto {
  const TicketWalletDto({
    required this.auctionSlug,
    required this.auctionTitle,
    required this.auctionStatus,
    this.drawAt,
    required this.activeCount,
    required this.fillPct,
  });
  final String auctionSlug;
  final String auctionTitle;
  final String auctionStatus;
  final DateTime? drawAt;
  final int activeCount;
  final int fillPct;
  factory TicketWalletDto.fromJson(Map<String, dynamic> j) => TicketWalletDto(
        auctionSlug: _s(j['auctionSlug']),
        auctionTitle: _s(j['auctionTitle']),
        auctionStatus: _s(j['auctionStatus']),
        drawAt: _dt(j['drawAt']),
        activeCount: _i(j['activeCount']),
        fillPct: _i(j['fillPct']),
      );
}

class MyWinDto {
  const MyWinDto({
    required this.isWinner,
    this.isBackup = false,
    this.backupOrder,
    this.winnerStatus,
    this.assetTitle,
    this.retailValueMinor = 0,
    this.winTargetMinor = 0,
    this.currency = 'GHS',
    this.claimId,
    this.claimStatus,
    this.deliveryId,
    this.winPurchaseStatus,
  });
  final bool isWinner;
  final bool isBackup;
  final int? backupOrder;
  final String? winnerStatus;
  final String? assetTitle;
  final int retailValueMinor;
  final int winTargetMinor;
  final String currency;
  final String? claimId;
  final String? claimStatus;
  final String? deliveryId;
  final String? winPurchaseStatus;

  factory MyWinDto.fromJson(Map<String, dynamic> j) {
    final claim = (j['claim'] as Map?)?.cast<String, dynamic>();
    final wtp = (j['winTargetPurchase'] as Map?)?.cast<String, dynamic>();
    return MyWinDto(
      isWinner: j['isWinner'] == true,
      isBackup: j['isBackup'] == true,
      backupOrder: (j['backupOrder'] as num?)?.toInt(),
      winnerStatus: j['winnerStatus'] as String?,
      assetTitle: j['assetTitle'] as String?,
      retailValueMinor: _i(j['retailValueMinor']),
      winTargetMinor: _i(j['winTargetMinor']),
      currency: j['currency'] as String? ?? 'GHS',
      claimId: claim?['id'] as String?,
      claimStatus: claim?['status'] as String?,
      deliveryId: claim?['deliveryId'] as String?,
      winPurchaseStatus: wtp?['status'] as String?,
    );
  }
}

String auctionStatusLabel(String s) {
  switch (s) {
    case 'ANNOUNCED':
      return 'Starting soon';
    case 'OPEN':
    case 'FILLING':
      return 'Seats on sale';
    case 'CLOSING':
      return 'Sold out — draw imminent';
    case 'DRAW_PENDING':
    case 'DRAWING':
      return 'Drawing now';
    case 'COMPLETED':
      return 'Draw complete';
    case 'UNSOLD':
      return 'Unsold — refunded';
    case 'CANCELLED':
      return 'Cancelled';
    default:
      return s;
  }
}
