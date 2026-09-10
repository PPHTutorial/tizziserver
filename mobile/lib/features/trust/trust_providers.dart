import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/comms_models.dart';
import '../../app/providers.dart';

final disputesProvider = FutureProvider.autoDispose<List<DisputeDto>>(
  (ref) => ref.watch(stallApiProvider).disputes(),
);

final disputeProvider = FutureProvider.autoDispose.family<DisputeDto, String>(
  (ref, id) => ref.watch(stallApiProvider).dispute(id),
);

final helpCenterProvider = FutureProvider.autoDispose<HelpCenterDto>(
  (ref) => ref.watch(stallApiProvider).helpCenter(),
);

final supportTicketsProvider = FutureProvider.autoDispose<List<SupportTicketDto>>(
  (ref) => ref.watch(stallApiProvider).supportTickets(),
);

final securityCentreProvider = FutureProvider.autoDispose<SecurityCentreDto>(
  (ref) => ref.watch(stallApiProvider).securityCentre(),
);

final myReportsProvider = FutureProvider.autoDispose<List<ReportDto>>(
  (ref) => ref.watch(stallApiProvider).myReports(),
);
