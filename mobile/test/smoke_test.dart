import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:grandprice/app/app.dart';
import 'package:grandprice/design/tokens.g.dart';

void main() {
  testWidgets('app boots with GrandPrice tokens theme', (tester) async {
    await tester.pumpWidget(const ProviderScope(child: GrandPriceApp()));

    expect(find.text('GrandPrice'), findsOneWidget);

    final ctx = tester.element(find.text('GrandPrice'));
    final colors = Theme.of(ctx).extension<GpColors>();
    expect(colors, isNotNull);
    expect(colors!.primary, const Color(0xFFFF6200));
  });
}
