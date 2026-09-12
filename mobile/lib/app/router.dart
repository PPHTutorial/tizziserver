import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/auth/auth_state.dart';
import '../features/auth/screens/account_recovery_screen.dart';
import '../features/auth/screens/create_password_screen.dart';
import '../features/auth/screens/edit_profile_screen.dart';
import '../features/auth/screens/email_entry_screen.dart';
import '../features/auth/screens/forgot_password_screen.dart';
import '../features/auth/screens/otp_screen.dart';
import '../features/auth/screens/phone_entry_screen.dart';
import '../features/auth/screens/reset_password_screen.dart';
import '../features/auth/screens/security_alert_screen.dart';
import '../features/auth/screens/select_role_screen.dart';
import '../features/auth/screens/sessions_screen.dart';
import '../features/auth/screens/settings_screen.dart';
import '../features/auth/screens/social_auth_screen.dart';
import '../features/auth/screens/welcome_screen.dart';
import '../features/auth/screens/account_state_screens.dart';
import '../features/ads/screens/advertising_center_screen.dart';
import '../features/ads/screens/campaign_detail_screen.dart';
import '../features/analytics/screens/courier_performance_history_screen.dart';
import '../features/analytics/screens/vendor_analytics_screen.dart';
import '../features/referrals/screens/referral_screen.dart';
import '../features/catalog/screens/business_docs_screen.dart';
import '../features/catalog/screens/edit_shop_profile_screen.dart';
import '../features/catalog/screens/categories_screen.dart';
import '../features/catalog/screens/category_products_screen.dart';
import '../features/catalog/screens/deals_screen.dart';
import '../features/catalog/screens/nearby_vendors_screen.dart';
import '../features/catalog/screens/product_detail_screen.dart';
import '../features/catalog/screens/reviews_screen.dart';
import '../features/catalog/screens/product_editor_screen.dart';
import '../features/catalog/screens/recently_viewed_screen.dart';
import '../features/catalog/screens/search_screen.dart';
import '../features/catalog/screens/barcode_scan_screen.dart';
import '../features/catalog/screens/vendor_hub_screen.dart';
import '../features/catalog/screens/vendor_screen.dart';
import '../features/selling/screens/vendor_order_detail_screen.dart';
import '../features/selling/screens/vendor_orders_screen.dart';
import '../features/catalog/screens/wishlist_screen.dart';
import '../features/commerce/screens/address_book_screen.dart';
import '../features/commerce/screens/cart_screen.dart';
import '../features/commerce/screens/checkout_screen.dart';
import '../features/commerce/screens/coupons_screen.dart';
import '../features/commerce/screens/order_confirmation_screen.dart';
import '../features/commerce/screens/order_detail_screen.dart';
import '../features/commerce/screens/orders_screen.dart';
import '../features/commerce/screens/payment_methods_screen.dart';
import '../features/commerce/screens/wallet_screen.dart';
import '../features/commerce/screens/transaction_history_screen.dart';
import '../features/courier/screens/active_delivery_screen.dart';
import '../features/courier/screens/courier_areas_screen.dart';
import '../features/courier/screens/courier_dashboard_screen.dart';
import '../features/courier/screens/courier_earnings_screen.dart';
import '../features/courier/screens/courier_jobs_screen.dart';
import '../features/courier/screens/courier_onboarding_screen.dart';
import '../features/courier/screens/courier_performance_screen.dart';
import '../features/courier/screens/courier_profile_screen.dart';
import '../features/courier/screens/courier_vehicles_screen.dart';
import '../features/delivery/screens/delivery_tracking_screen.dart';
import '../features/auctions/screens/auction_detail_screen.dart';
import '../features/auctions/screens/auction_list_screen.dart';
import '../features/auctions/screens/auction_qualification_screen.dart';
import '../features/auctions/screens/my_tickets_screen.dart';
import '../features/auctions/screens/winner_claim_screen.dart';
import '../features/comms/screens/conversation_screen.dart';
import '../features/comms/screens/inbox_screen.dart';
import '../features/comms/screens/notifications_screen.dart';
import '../features/trust/screens/disputes_screen.dart';
import '../features/trust/screens/my_reports_screen.dart';
import '../features/trust/screens/security_centre_screen.dart';
import '../features/trust/screens/support_screen.dart';
import '../features/onboarding/onboarding_controller.dart';
import '../features/onboarding/onboarding_screen.dart';
import '../features/onboarding/splash_screen.dart';
import '../features/shell/home_shell.dart';
import 'providers.dart';

class RoutePaths {
  static const splash = '/splash';
  static const onboarding = '/onboarding';
  static const welcome = '/welcome';
  static const phone = '/phone';
  static const email = '/email';
  static const otp = '/otp';
  static const social = '/social';
  static const forgotPassword = '/password/forgot';
  static const resetPassword = '/password/reset';
  static const createPassword = '/password/create';
  static const recovery = '/recovery';
  static const selectRole = '/select-role';
  static const sessions = '/security/sessions';
  static const securityAlert = '/security/alert';
  static const suspended = '/account/suspended';
  static const disabled = '/account/disabled';
  static const home = '/home';
  static const settings = '/settings';
  static const editProfile = '/settings/profile';

  // Phase 2 — catalog
  static const categories = '/categories';
  static const search = '/search';
  static const barcodeScan = '/search/scan';
  static const recentlyViewed = '/me/recently-viewed';
  static const newArrivals = '/products/new-arrivals';
  static const topRated = '/products/top-rated';
  static const campaigns = '/promotions/campaigns';
  static String category(String slug) => '/category/$slug';
  static String product(String slug) => '/product/$slug';
  static String productReviews(String slug) => '/product/$slug/reviews';
  static String vendor(String id) => '/vendor/$id';
  static const sell = '/sell';
  static const newProduct = '/sell/product/new';
  static String editProduct(String id) => '/sell/product/$id';
  static const sellOrders = '/sell/orders';
  static String sellOrder(String id) => '/sell/orders/$id';
  static const wishlist = '/me/wishlist';
  static const deals = '/deals';
  static const nearby = '/nearby';
  static const sellDocuments = '/sell/documents';
  static const sellProfile = '/sell/profile';

  // Phase 3 — commerce
  static const cart = '/cart';
  static const checkout = '/checkout';
  static const orders = '/me/orders';
  static String order(String id) => '/me/orders/$id';
  static const orderConfirmation = '/checkout/done';
  static const wallet = '/me/wallet';
  static const walletTransactions = '/me/wallet/transactions';
  static const addresses = '/me/addresses';
  static const coupons = '/me/coupons';
  static const paymentMethods = '/me/payment-methods';

  // Phase 4 — delivery + courier
  static String delivery(String id) => '/me/deliveries/$id';
  static const courierHub = '/courier';
  static const courierOnboarding = '/courier/onboarding';
  static const courierJobs = '/courier/jobs';
  static const courierEarnings = '/courier/earnings';
  static const courierPerformance = '/courier/performance';
  static const courierVehicles = '/courier/vehicles';
  static const courierAreas = '/courier/areas';
  static const courierProfile = '/courier/profile';
  static String courierDelivery(String id) => '/courier/delivery/$id';

  // Phase 5 — Inverse Draws (GrandPrice only)
  static const auctions = '/auctions';
  static String auction(String slug) => '/auctions/$slug';
  static String auctionQualification(String slug) =>
      '/auctions/$slug/qualification';
  static String auctionWin(String slug) => '/auctions/$slug/win';
  static const myTickets = '/me/tickets';

  // Phase 6 — chat / notifications / trust & safety / support
  static const inbox = '/inbox';
  static String conversation(String id) => '/inbox/$id';
  static const notifications = '/notifications';
  static const notificationPrefs = '/notifications/preferences';
  static const disputes = '/me/disputes';
  static String dispute(String id) => '/me/disputes/$id';
  static const support = '/support';
  static const securityCentre = '/me/security';
  static const myReports = '/me/reports';

  // Phase 7 — advertising / analytics / referrals
  static const advertising = '/sell/advertising';
  static String campaign(String id) => '/sell/advertising/$id';
  static const vendorAnalytics = '/sell/analytics';
  static const courierHistory = '/courier/history';
  static const referrals = '/me/referrals';
}

/// Routes reachable while signed out.
const _publicRoutes = <String>{
  RoutePaths.welcome,
  RoutePaths.phone,
  RoutePaths.email,
  RoutePaths.otp,
  RoutePaths.social,
  RoutePaths.forgotPassword,
  RoutePaths.resetPassword,
  RoutePaths.recovery,
};

/// The pre-home funnel a signed-in, role-selected user should never sit on.
const _funnelRoutes = <String>{
  RoutePaths.splash,
  RoutePaths.onboarding,
  RoutePaths.welcome,
  RoutePaths.phone,
  RoutePaths.email,
  RoutePaths.otp,
  RoutePaths.social,
  RoutePaths.selectRole,
};

final routerProvider = Provider<GoRouter>((ref) {
  final refresh = _RiverpodRefresh(ref, [
    authControllerProvider,
    onboardingSeenProvider,
  ]);
  ref.onDispose(refresh.dispose);

  return GoRouter(
    initialLocation: RoutePaths.splash,
    refreshListenable: refresh,
    routes: [
      GoRoute(
        path: RoutePaths.splash,
        builder: (_, __) => const SplashScreen(),
      ),
      GoRoute(
        path: RoutePaths.onboarding,
        builder: (_, __) => const OnboardingScreen(),
      ),
      GoRoute(
        path: RoutePaths.welcome,
        builder: (_, __) => const WelcomeScreen(),
      ),
      GoRoute(
        path: RoutePaths.phone,
        builder: (_, __) => const PhoneEntryScreen(),
      ),
      GoRoute(
        path: RoutePaths.email,
        builder: (_, __) => const EmailEntryScreen(),
      ),
      GoRoute(path: RoutePaths.otp, builder: (_, __) => const OtpScreen()),
      GoRoute(
        path: RoutePaths.social,
        builder: (_, __) => const SocialAuthScreen(),
      ),
      GoRoute(
        path: RoutePaths.forgotPassword,
        builder: (_, __) => const ForgotPasswordScreen(),
      ),
      GoRoute(
        path: RoutePaths.resetPassword,
        builder: (_, __) => const ResetPasswordScreen(),
      ),
      GoRoute(
        path: RoutePaths.createPassword,
        builder: (_, __) => const CreatePasswordScreen(),
      ),
      GoRoute(
        path: RoutePaths.recovery,
        builder: (_, __) => const AccountRecoveryScreen(),
      ),
      GoRoute(
        path: RoutePaths.selectRole,
        builder: (_, __) => const SelectRoleScreen(),
      ),
      GoRoute(
        path: RoutePaths.sessions,
        builder: (_, __) => const SessionsScreen(),
      ),
      GoRoute(
        path: RoutePaths.settings,
        builder: (_, __) => const SettingsScreen(),
      ),
      GoRoute(
        path: RoutePaths.editProfile,
        builder: (_, __) => const EditProfileScreen(),
      ),
      GoRoute(
        path: RoutePaths.securityAlert,
        builder: (_, __) => const SecurityAlertScreen(),
      ),
      GoRoute(
        path: RoutePaths.suspended,
        builder: (_, __) => const AccountSuspendedScreen(),
      ),
      GoRoute(
        path: RoutePaths.disabled,
        builder: (_, __) => const AccountDisabledScreen(),
      ),
      GoRoute(path: RoutePaths.home, builder: (_, __) => const HomeShell()),

      // --- Phase 2: catalog (all require a session via redirect) ---
      GoRoute(
        path: RoutePaths.categories,
        builder: (_, __) => const CategoriesScreen(),
      ),
      GoRoute(
        path: RoutePaths.search,
        builder: (_, s) => SearchScreen(initialQuery: s.extra as String?),
      ),
      GoRoute(
        path: RoutePaths.barcodeScan,
        builder: (_, __) => const BarcodeScanScreen(),
      ),
      GoRoute(
        path: '/category/:slug',
        builder: (_, s) =>
            CategoryProductsScreen(slug: s.pathParameters['slug']!),
      ),
      GoRoute(
        path: RoutePaths.newArrivals,
        builder: (_, __) => const CategoryProductsScreen(
          slug: null,
          title: 'New arrivals',
          initialSort: 'newest',
        ),
      ),
      GoRoute(
        path: RoutePaths.topRated,
        builder: (_, __) => const CategoryProductsScreen(
          slug: null,
          title: 'Top rated',
          initialSort: 'rating',
        ),
      ),
      GoRoute(
        path: RoutePaths.campaigns,
        builder: (_, __) =>
            const DealsScreen(kind: 'CAMPAIGN', title: 'Featured campaigns'),
      ),
      GoRoute(
        path: RoutePaths.recentlyViewed,
        builder: (_, __) => const RecentlyViewedScreen(),
      ),
      GoRoute(
        path: '/product/:slug',
        builder: (_, s) => ProductDetailScreen(slug: s.pathParameters['slug']!),
      ),
      GoRoute(
        path: '/product/:slug/reviews',
        builder: (_, s) => ReviewsScreen(slug: s.pathParameters['slug']!),
      ),
      GoRoute(
        path: '/vendor/:id',
        builder: (_, s) => VendorScreen(vendorId: s.pathParameters['id']!),
      ),
      GoRoute(
        path: RoutePaths.wishlist,
        builder: (_, __) => const WishlistScreen(),
      ),
      GoRoute(path: RoutePaths.deals, builder: (_, __) => const DealsScreen()),
      GoRoute(
        path: RoutePaths.nearby,
        builder: (_, __) => const NearbyVendorsScreen(),
      ),
      GoRoute(
        path: RoutePaths.sell,
        builder: (_, __) => const VendorHubScreen(),
      ),
      GoRoute(
        path: RoutePaths.sellDocuments,
        builder: (_, __) => const BusinessDocsScreen(),
      ),
      GoRoute(
        path: RoutePaths.sellProfile,
        builder: (_, __) => const EditShopProfileScreen(),
      ),
      GoRoute(
        path: RoutePaths.newProduct,
        builder: (_, __) => const ProductEditorScreen(),
      ),
      GoRoute(
        path: '/sell/product/:id',
        builder: (_, s) =>
            ProductEditorScreen(productId: s.pathParameters['id']),
      ),
      GoRoute(
        path: RoutePaths.sellOrders,
        builder: (_, __) => const VendorOrdersScreen(),
      ),
      GoRoute(
        path: '/sell/orders/:id',
        builder: (_, s) =>
            VendorOrderDetailScreen(vendorOrderId: s.pathParameters['id']!),
      ),

      // --- Phase 3: commerce ---
      GoRoute(path: RoutePaths.cart, builder: (_, __) => const CartScreen()),
      GoRoute(
        path: RoutePaths.checkout,
        builder: (_, __) => const CheckoutScreen(),
      ),
      GoRoute(
        path: RoutePaths.orderConfirmation,
        builder: (_, s) =>
            OrderConfirmationScreen(orderId: s.uri.queryParameters['id'] ?? ''),
      ),
      GoRoute(
        path: RoutePaths.orders,
        builder: (_, __) => const OrdersScreen(),
      ),
      GoRoute(
        path: '/me/orders/:id',
        builder: (_, s) => OrderDetailScreen(orderId: s.pathParameters['id']!),
      ),
      GoRoute(
        path: RoutePaths.wallet,
        builder: (_, __) => const WalletScreen(),
      ),
      GoRoute(
        path: RoutePaths.walletTransactions,
        builder: (_, __) => const TransactionHistoryScreen(),
      ),
      GoRoute(
        path: RoutePaths.addresses,
        builder: (_, __) => const AddressBookScreen(),
      ),
      GoRoute(
        path: RoutePaths.coupons,
        builder: (_, __) => const CouponsScreen(),
      ),
      GoRoute(
        path: RoutePaths.paymentMethods,
        builder: (_, __) => const PaymentMethodsScreen(),
      ),

      // --- Phase 4: delivery + courier ---
      GoRoute(
        path: '/me/deliveries/:id',
        builder: (_, s) =>
            DeliveryTrackingScreen(deliveryId: s.pathParameters['id']!),
      ),
      GoRoute(
        path: RoutePaths.courierHub,
        builder: (_, __) => const CourierHubScreen(),
      ),
      GoRoute(
        path: RoutePaths.courierOnboarding,
        builder: (_, __) => const CourierOnboardingScreen(),
      ),
      GoRoute(
        path: RoutePaths.courierJobs,
        builder: (_, __) => const CourierJobsScreen(),
      ),
      GoRoute(
        path: RoutePaths.courierEarnings,
        builder: (_, __) => const CourierEarningsScreen(),
      ),
      GoRoute(
        path: RoutePaths.courierPerformance,
        builder: (_, __) => const CourierPerformanceScreen(),
      ),
      GoRoute(
        path: RoutePaths.courierVehicles,
        builder: (_, __) => const CourierVehiclesScreen(),
      ),
      GoRoute(
        path: RoutePaths.courierAreas,
        builder: (_, __) => const CourierServiceAreasScreen(),
      ),
      GoRoute(
        path: RoutePaths.courierProfile,
        builder: (_, __) => const CourierProfileScreen(),
      ),
      GoRoute(
        path: '/courier/delivery/:id',
        builder: (_, s) =>
            ActiveDeliveryScreen(deliveryId: s.pathParameters['id']!),
      ),

      // --- Phase 5: Inverse Draws ---
      GoRoute(
        path: RoutePaths.auctions,
        builder: (_, __) => const AuctionListScreen(),
      ),
      GoRoute(
        path: RoutePaths.myTickets,
        builder: (_, __) => const MyTicketsScreen(),
      ),
      GoRoute(
        path: '/auctions/:slug',
        builder: (_, s) => AuctionDetailScreen(slug: s.pathParameters['slug']!),
      ),
      GoRoute(
        path: '/auctions/:slug/qualification',
        builder: (_, s) =>
            AuctionQualificationScreen(slug: s.pathParameters['slug']!),
      ),
      GoRoute(
        path: '/auctions/:slug/win',
        builder: (_, s) => WinnerClaimScreen(slug: s.pathParameters['slug']!),
      ),

      // --- Phase 6: chat / notifications / trust & safety / support ---
      GoRoute(path: RoutePaths.inbox, builder: (_, __) => const InboxScreen()),
      GoRoute(
        path: '/inbox/:id',
        builder: (_, s) => ConversationScreen(
          conversationId: s.pathParameters['id']!,
          title: s.extra as String?,
        ),
      ),
      GoRoute(
        path: RoutePaths.notifications,
        builder: (_, __) => const NotificationsScreen(),
      ),
      GoRoute(
        path: RoutePaths.disputes,
        builder: (_, __) => const DisputesScreen(),
      ),
      GoRoute(
        path: '/me/disputes/:id',
        builder: (_, s) => DisputeDetailScreen(id: s.pathParameters['id']!),
      ),
      GoRoute(
        path: RoutePaths.support,
        builder: (_, __) => const SupportScreen(),
      ),
      GoRoute(
        path: RoutePaths.securityCentre,
        builder: (_, __) => const SecurityCentreScreen(),
      ),
      GoRoute(
        path: RoutePaths.myReports,
        builder: (_, __) => const MyReportsScreen(),
      ),

      // Phase 7 — advertising / analytics / referrals
      GoRoute(
        path: RoutePaths.advertising,
        builder: (_, __) => const AdvertisingCenterScreen(),
      ),
      GoRoute(
        path: '/sell/advertising/:id',
        builder: (_, s) => CampaignDetailScreen(id: s.pathParameters['id']!),
      ),
      GoRoute(
        path: RoutePaths.vendorAnalytics,
        builder: (_, __) => const VendorAnalyticsScreen(),
      ),
      GoRoute(
        path: RoutePaths.courierHistory,
        builder: (_, __) => const CourierPerformanceHistoryScreen(),
      ),
      GoRoute(
        path: RoutePaths.referrals,
        builder: (_, __) => const ReferralScreen(),
      ),
    ],
    redirect: (context, state) {
      final auth = ref.read(authControllerProvider);
      final onboarded = ref.read(onboardingSeenProvider);
      final loc = state.matchedLocation;

      if (auth.status == AuthStatus.unknown) {
        return loc == RoutePaths.splash ? null : RoutePaths.splash;
      }

      if (!onboarded) {
        return loc == RoutePaths.onboarding ? null : RoutePaths.onboarding;
      }

      if (!auth.isAuthenticated) {
        return _publicRoutes.contains(loc) ? null : RoutePaths.welcome;
      }

      if (auth.isDisabled) {
        return loc == RoutePaths.disabled ? null : RoutePaths.disabled;
      }
      if (auth.isSuspended) {
        return loc == RoutePaths.suspended ? null : RoutePaths.suspended;
      }
      if (auth.needsRoleSelection) {
        return loc == RoutePaths.selectRole ? null : RoutePaths.selectRole;
      }

      if (_funnelRoutes.contains(loc)) return RoutePaths.home;
      return null;
    },
  );
});

/// Bridges a set of Riverpod providers to a [Listenable] for GoRouter.
class _RiverpodRefresh extends ChangeNotifier {
  _RiverpodRefresh(Ref ref, List<ProviderListenable<Object?>> providers) {
    for (final p in providers) {
      _subs.add(ref.listen<Object?>(p, (_, __) => notifyListeners()));
    }
  }

  final List<ProviderSubscription<Object?>> _subs = [];

  @override
  void dispose() {
    for (final s in _subs) {
      s.close();
    }
    super.dispose();
  }
}
