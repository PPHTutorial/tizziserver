import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:stall/app/app.dart';
import 'package:stall/design/tokens.g.dart';

void main() {
  testWidgets('app boots into the router with the Stall token theme', (tester) async {
    await tester.pumpWidget(const ProviderScope(child: StallApp()));
    await tester.pump(); // first frame — splash

    expect(find.byType(MaterialApp), findsOneWidget);
    expect(find.text('Stall'), findsOneWidget); // splash wordmark

    final ctx = tester.element(find.byType(Navigator).first);
    final colors = Theme.of(ctx).extension<AppColors>();
    expect(colors, isNotNull);
    expect(colors!.primary, const Color(0xFFFF6200));
  });
}
