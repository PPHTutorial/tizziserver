import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/auth/auth_state.dart';
import '../features/auth/screens/account_recovery_screen.dart';
import '../features/auth/screens/create_password_screen.dart';
import '../features/auth/screens/email_entry_screen.dart';
import '../features/auth/screens/forgot_password_screen.dart';
import '../features/auth/screens/otp_screen.dart';
import '../features/auth/screens/phone_entry_screen.dart';
import '../features/auth/screens/reset_password_screen.dart';
import '../features/auth/screens/security_alert_screen.dart';
import '../features/auth/screens/select_role_screen.dart';
import '../features/auth/screens/sessions_screen.dart';
import '../features/auth/screens/social_auth_screen.dart';
import '../features/auth/screens/welcome_screen.dart';
import '../features/auth/screens/account_state_screens.dart';
import '../features/catalog/screens/business_docs_screen.dart';
import '../features/catalog/screens/categories_screen.dart';
import '../features/catalog/screens/category_products_screen.dart';
import '../features/catalog/screens/deals_screen.dart';
import '../features/catalog/screens/nearby_vendors_screen.dart';
import '../features/catalog/screens/product_detail_screen.dart';
import '../features/catalog/screens/product_editor_screen.dart';
import '../features/catalog/screens/search_screen.dart';
import '../features/catalog/screens/vendor_hub_screen.dart';
import '../features/catalog/screens/vendor_screen.dart';
import '../features/catalog/screens/wishlist_screen.dart';
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

  // Phase 2 — catalog
  static const categories = '/categories';
  static const search = '/search';
  static String category(String slug) => '/category/$slug';
  static String product(String slug) => '/product/$slug';
  static String vendor(String id) => '/vendor/$id';
  static const sell = '/sell';
  static const newProduct = '/sell/product/new';
  static String editProduct(String id) => '/sell/product/$id';
  static const wishlist = '/me/wishlist';
  static const deals = '/deals';
  static const nearby = '/nearby';
  static const sellDocuments = '/sell/documents';
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
  final refresh = _RiverpodRefresh(ref, [authControllerProvider, onboardingSeenProvider]);
  ref.onDispose(refresh.dispose);

  return GoRouter(
    initialLocation: RoutePaths.splash,
    refreshListenable: refresh,
    routes: [
      GoRoute(path: RoutePaths.splash, builder: (_, __) => const SplashScreen()),
      GoRoute(path: RoutePaths.onboarding, builder: (_, __) => const OnboardingScreen()),
      GoRoute(path: RoutePaths.welcome, builder: (_, __) => const WelcomeScreen()),
      GoRoute(path: RoutePaths.phone, builder: (_, __) => const PhoneEntryScreen()),
      GoRoute(path: RoutePaths.email, builder: (_, __) => const EmailEntryScreen()),
      GoRoute(path: RoutePaths.otp, builder: (_, __) => const OtpScreen()),
      GoRoute(path: RoutePaths.social, builder: (_, __) => const SocialAuthScreen()),
      GoRoute(
          path: RoutePaths.forgotPassword,
          builder: (_, __) => const ForgotPasswordScreen()),
      GoRoute(
          path: RoutePaths.resetPassword,
          builder: (_, __) => const ResetPasswordScreen()),
      GoRoute(
          path: RoutePaths.createPassword,
          builder: (_, __) => const CreatePasswordScreen()),
      GoRoute(
          path: RoutePaths.recovery,
          builder: (_, __) => const AccountRecoveryScreen()),
      GoRoute(
          path: RoutePaths.selectRole, builder: (_, __) => const SelectRoleScreen()),
      GoRoute(path: RoutePaths.sessions, builder: (_, __) => const SessionsScreen()),
      GoRoute(
          path: RoutePaths.securityAlert,
          builder: (_, __) => const SecurityAlertScreen()),
      GoRoute(
          path: RoutePaths.suspended,
          builder: (_, __) => const AccountSuspendedScreen()),
      GoRoute(
          path: RoutePaths.disabled,
          builder: (_, __) => const AccountDisabledScreen()),
      GoRoute(path: RoutePaths.home, builder: (_, __) => const HomeShell()),

      // --- Phase 2: catalog (all require a session via redirect) ---
      GoRoute(path: RoutePaths.categories, builder: (_, __) => const CategoriesScreen()),
      GoRoute(path: RoutePaths.search, builder: (_, __) => const SearchScreen()),
      GoRoute(
        path: '/category/:slug',
        builder: (_, s) => CategoryProductsScreen(slug: s.pathParameters['slug']!),
      ),
      GoRoute(
        path: '/product/:slug',
        builder: (_, s) => ProductDetailScreen(slug: s.pathParameters['slug']!),
      ),
      GoRoute(
        path: '/vendor/:id',
        builder: (_, s) => VendorScreen(vendorId: s.pathParameters['id']!),
      ),
      GoRoute(path: RoutePaths.wishlist, builder: (_, __) => const WishlistScreen()),
      GoRoute(path: RoutePaths.deals, builder: (_, __) => const DealsScreen()),
      GoRoute(path: RoutePaths.nearby, builder: (_, __) => const NearbyVendorsScreen()),
      GoRoute(path: RoutePaths.sell, builder: (_, __) => const VendorHubScreen()),
      GoRoute(path: RoutePaths.sellDocuments, builder: (_, __) => const BusinessDocsScreen()),
      GoRoute(path: RoutePaths.newProduct, builder: (_, __) => const ProductEditorScreen()),
      GoRoute(
        path: '/sell/product/:id',
        builder: (_, s) => ProductEditorScreen(productId: s.pathParameters['id']),
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
