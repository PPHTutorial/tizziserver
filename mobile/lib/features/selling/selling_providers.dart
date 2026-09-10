import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/commerce_models.dart';
import '../../api/delivery_models.dart';
import '../../app/providers.dart';

/// Seller's incoming sub-orders, optionally filtered by lifecycle bucket.
final sellerOrdersProvider =
    FutureProvider.autoDispose.family<List<SellerOrderDto>, String?>(
  (ref, status) => ref.watch(stallApiProvider).sellerOrders(status: status),
);

/// One sub-order in full (items, payout split, fulfilment, timeline).
final sellerOrderProvider =
    FutureProvider.autoDispose.family<SellerOrderDetailDto, String>(
  (ref, id) => ref.watch(stallApiProvider).sellerOrder(id),
);

/// The courier-facing delivery spawned for a ready-for-pickup sub-order —
/// the seller sees courier identity, vehicle, live status and the pickup code.
final sellerHandoffDeliveryProvider =
    FutureProvider.autoDispose.family<DeliveryDto, String>(
  (ref, deliveryId) => ref.watch(stallApiProvider).vendorDelivery(deliveryId),
);
