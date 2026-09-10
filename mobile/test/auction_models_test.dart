import 'package:flutter_test/flutter_test.dart';
import 'package:stall/api/auction_models.dart';

void main() {
  test('AuctionCardDto parses fill + packages + open/drawn helpers', () {
    final a = AuctionCardDto.fromJson({
      'id': 'a1',
      'slug': 'win-s-class',
      'title': 'Win a Mercedes S-Class',
      'description': 'LIVE INVERSE DRAW',
      'status': 'FILLING',
      'currency': 'GHS',
      'retailValueMinor': 185000000,
      'ticketPriceMinor': 20000,
      'winTargetMinor': 25000000,
      'seatsTotal': 5000,
      'seatsSold': 2340,
      'seatsLeft': 2660,
      'fillPct': 47,
      'minSeatsToDraw': 5,
      'drawAt': '2026-10-02T00:00:00.000Z',
      'participants': 812,
      'image': null,
      'packages': [
        {'id': 'p1', 'name': 'Single seat', 'ticketCount': 1, 'bonusTickets': 0, 'priceMinor': 20000},
        {'id': 'p2', 'name': '5 seats', 'ticketCount': 5, 'bonusTickets': 1, 'priceMinor': 100000},
      ],
    });
    expect(a.fillPct, 47);
    expect(a.isOpen, true);
    expect(a.isDrawn, false);
    expect(a.packages, hasLength(2));
    expect(a.packages[1].bonusTickets, 1);
  });

  test('AuctionDetailDto flattens asset + mine + draw', () {
    final d = AuctionDetailDto.fromJson({
      'id': 'a1',
      'slug': 'win-s-class',
      'title': 'Win a Mercedes S-Class',
      'status': 'COMPLETED',
      'currency': 'GHS',
      'retailValueMinor': 185000000,
      'ticketPriceMinor': 20000,
      'winTargetMinor': 25000000,
      'seatsTotal': 5000,
      'seatsSold': 5000,
      'seatsLeft': 0,
      'fillPct': 100,
      'minSeatsToDraw': 5,
      'participants': 900,
      'packages': [],
      'assets': [
        {'id': 'as1', 'title': 'Mercedes-Benz S-Class 2024', 'media': ['seed/s.jpg'], 'specs': {'year': 2024}, 'retailValueMinor': 185000000},
      ],
      'mine': {'ticketCount': 12, 'qualificationScore': 18.5, 'rank': 4, 'eligible': true},
      'draw': {'status': 'COMPLETED', 'method': 'COMMIT_REVEAL', 'seedCommitHash': 'abc123', 'seedReveal': 'deadbeef', 'resultHash': 'ffff', 'completedAt': null, 'winnerIsMe': true},
    });
    expect(d.assetTitle, 'Mercedes-Benz S-Class 2024');
    expect(d.myTicketCount, 12);
    expect(d.myRank, 4);
    expect(d.winnerIsMe, true);
    expect(d.isDrawn, true);
  });

  test('QualificationDto keeps the not-a-guarantee note + breakdown', () {
    final q = QualificationDto.fromJson({
      'qualificationScore': 21.0,
      'rank': 3,
      'totalParticipants': 500,
      'eligible': true,
      'ticketCount': 8,
      'breakdown': [
        {'factor': 'TICKETS', 'weight': 1, 'points': 8, 'contribution': 8},
        {'factor': 'SHARE', 'weight': 0.15, 'points': 5, 'contribution': 0.75},
      ],
      'note': 'Qualification weights your odds in the draw. It does not guarantee a win.',
    });
    expect(q.breakdown.first.contribution, 8);
    expect(q.note, contains('does not guarantee'));
  });

  test('MyWinDto distinguishes winner / backup / neither', () {
    final backup = MyWinDto.fromJson({'isWinner': false, 'isBackup': true, 'backupOrder': 2, 'auctionStatus': 'COMPLETED'});
    expect(backup.isBackup, true);
    expect(backup.backupOrder, 2);

    final winner = MyWinDto.fromJson({
      'isWinner': true,
      'winnerStatus': 'PENDING_CLAIM',
      'assetTitle': 'S-Class',
      'retailValueMinor': 185000000,
      'winTargetMinor': 25000000,
      'currency': 'GHS',
      'claim': {'id': 'cl1', 'status': 'APPROVED', 'deliveryId': null},
      'winTargetPurchase': null,
    });
    expect(winner.isWinner, true);
    expect(winner.claimStatus, 'APPROVED');
  });
}
