import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:stall/api/models.dart';
import 'package:stall/app/providers.dart';
import 'package:stall/design/theme.dart';
import 'package:stall/features/catalog/screens/sell_onboarding.dart';

void main() {
  Future<void> pumpFlow(WidgetTester tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          // Never resolves — the intro falls back to the "Stall" name and no
          // network call is made.
          bootstrapProvider.overrideWith((_) => Completer<Bootstrap>().future),
        ],
        child: MaterialApp(
          theme: AppTheme.light(),
          home: Scaffold(body: SellOnboardingFlow(onDone: () {})),
        ),
      ),
    );
    await tester.pump();
  }

  Finder field(String label) => find.descendant(
    of: find.ancestor(of: find.text(label), matching: find.byType(Column)).first,
    matching: find.byType(TextField),
  );

  /// Scrolls [text] into view — lazily-built ListView children (the inline
  /// error, the intro's CTA) only exist once scrolled to.
  Future<void> reveal(WidgetTester tester, String text) async {
    if (find.text(text).evaluate().isEmpty) {
      await tester.scrollUntilVisible(
        find.text(text),
        200,
        scrollable: find.byType(Scrollable).first,
      );
    }
    await tester.ensureVisible(find.text(text));
    await tester.pumpAndSettle();
  }

  Future<void> tapText(WidgetTester tester, String text) async {
    await reveal(tester, text);
    await tester.tap(find.text(text));
    await tester.pumpAndSettle();
  }

  Future<void> start(WidgetTester tester) async {
    await pumpFlow(tester);
    await tapText(tester, 'Start selling');
    expect(find.text('Step 1 of 4'), findsOneWidget);
  }

  Future<void> fillStore(WidgetTester tester, {String phone = ''}) async {
    await tester.enterText(field('Store name'), 'Kumasi Gadgets');
    await tester.enterText(field('Registered business name'), 'Kumasi Ltd');
    await tester.enterText(field('Business phone'), phone);
    await tester.pump();
  }

  testWidgets('store step requires store and registered names', (
    tester,
  ) async {
    await start(tester);
    await tapText(tester, 'Continue');
    expect(find.text('Enter your store name.'), findsOneWidget);

    await tester.enterText(field('Store name'), 'Kumasi Gadgets');
    await tapText(tester, 'Continue');
    expect(find.text('Enter your registered business name.'), findsOneWidget);
    expect(find.text('Step 1 of 4'), findsOneWidget);
  });

  testWidgets('phone is required while "Let buyers call me" is on', (
    tester,
  ) async {
    await start(tester);
    await fillStore(tester);
    await tapText(tester, 'Continue');
    expect(
      find.text('Add a business phone, or turn off "Let buyers call me".'),
      findsOneWidget,
    );

    await tapText(tester, 'Let buyers call me'); // switch off
    await tapText(tester, 'Continue');
    expect(find.text('Step 2 of 4'), findsOneWidget);
  });

  testWidgets('a valid phone with calling on advances', (tester) async {
    await start(tester);
    await fillStore(tester, phone: '+233 20 000 0000');
    await tapText(tester, 'Continue');
    expect(find.text('Step 2 of 4'), findsOneWidget);
  });

  testWidgets('location step requires a city', (tester) async {
    await start(tester);
    await fillStore(tester, phone: '+233 20 000 0000');
    await tapText(tester, 'Continue'); // → branding
    await tapText(tester, 'Continue'); // → location
    expect(find.text('Step 3 of 4'), findsOneWidget);

    await tapText(tester, 'Continue');
    await reveal(tester, 'Enter the city or town your store is in.');
    expect(find.text('Step 3 of 4'), findsOneWidget);

    await tester.enterText(field('City / town'), 'Accra');
    await tapText(tester, 'Continue');
    expect(find.text('Step 4 of 4'), findsOneWidget);
  });

  testWidgets('Back from step 1 returns to the intro', (tester) async {
    await start(tester);
    await tapText(tester, 'Back');
    await reveal(tester, 'Start selling');
    expect(find.text('Step 1 of 4'), findsNothing);
  });
}
