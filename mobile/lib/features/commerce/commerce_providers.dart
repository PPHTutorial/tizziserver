import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/commerce_models.dart';
import '../../app/providers.dart';

/// The caller's active cart. The single source of truth for the cart badge and
/// every mutation screen; call [refresh] after an external change.
class CartController extends AsyncNotifier<CartDto> {
  @override
  Future<CartDto> build() => ref.watch(stallApiProvider).cart();

  Future<void> _run(Future<CartDto> Function() op) async {
    state = const AsyncValue<CartDto>.loading().copyWithPrevious(state);
    state = await AsyncValue.guard(op);
  }

  Future<void> refresh() => _run(() => ref.read(stallApiProvider).cart());

  Future<void> add(String offerId, {String? variantId, int qty = 1}) =>
      _run(() => ref.read(stallApiProvider).addToCart(offerId, variantId: variantId, qty: qty));

  Future<void> setQty(String itemId, int qty) =>
      _run(() => ref.read(stallApiProvider).updateCartItem(itemId, qty: qty));

  Future<void> remove(String itemId) => _run(() => ref.read(stallApiProvider).removeCartItem(itemId));

  Future<void> saveForLater(String itemId, bool saved) =>
      _run(() => ref.read(stallApiProvider).updateCartItem(itemId, savedForLater: saved));

  Future<void> applyCoupon(String code) => _run(() => ref.read(stallApiProvider).applyCoupon(code));

  Future<void> removeCoupon() => _run(() => ref.read(stallApiProvider).removeCoupon());

  Future<void> clear() => _run(() => ref.read(stallApiProvider).clearCart());
}

final cartControllerProvider =
    AsyncNotifierProvider<CartController, CartDto>(CartController.new);

/// Item count for the bottom-nav / app-bar badge (0 while loading/errored).
final cartCountProvider = Provider<int>((ref) {
  return ref.watch(cartControllerProvider).maybeWhen(data: (c) => c.itemCount, orElse: () => 0);
});

// --- addresses ---------------------------------------------------------
final addressesProvider = FutureProvider.autoDispose<List<AddressDto>>(
  (ref) => ref.watch(stallApiProvider).addresses(),
);

// --- coupons ---------------------------------------------------------
final couponsProvider = FutureProvider.autoDispose<List<CouponDto>>(
  (ref) => ref.watch(stallApiProvider).coupons(),
);

// --- payment methods ----------------------------------------------
final paymentMethodsProvider = FutureProvider.autoDispose<List<PaymentMethodDto>>(
  (ref) => ref.watch(stallApiProvider).paymentMethods(),
);

// --- checkout quote (family on method + coupon) --------------------
typedef QuoteArgs = ({String method, String? coupon});

final checkoutQuoteProvider =
    FutureProvider.autoDispose.family<CheckoutQuoteDto, QuoteArgs>(
  (ref, a) => ref.watch(stallApiProvider).checkoutQuote(fulfilmentMethod: a.method, couponCode: a.coupon),
);

// --- orders ---------------------------------------------------------
final ordersProvider = FutureProvider.autoDispose.family<List<OrderCardDto>, String?>(
  (ref, status) => ref.watch(stallApiProvider).orders(status: status),
);

final orderDetailProvider = FutureProvider.autoDispose.family<OrderDto, String>(
  (ref, id) => ref.watch(stallApiProvider).order(id),
);

// --- wallet -------------------------------------------------------
final walletProvider = FutureProvider.autoDispose<WalletDto>(
  (ref) => ref.watch(stallApiProvider).wallet(),
);

final walletTxnsProvider = FutureProvider.autoDispose<List<WalletTxnDto>>(
  (ref) => ref.watch(stallApiProvider).walletTransactions(),
);
