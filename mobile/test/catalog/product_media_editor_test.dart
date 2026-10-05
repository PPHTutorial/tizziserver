import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:stall/design/theme.dart';
import 'package:stall/features/catalog/media/product_media_editor.dart';

void main() {
  late List<List<String>> imageCalls;

  Future<void> pumpEditor(WidgetTester tester, List<String> images) async {
    imageCalls = [];
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          theme: AppTheme.light(),
          home: Scaffold(
            body: SingleChildScrollView(
              child: ProductMediaEditor(
                images: images,
                video: null,
                onImagesChanged: imageCalls.add,
                onVideoChanged: (_) {},
                onBusyChanged: (_) {},
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pump();
  }

  Future<void> tapPhoto(WidgetTester tester, int index) async {
    await tester.tap(find.byType(Image).at(index));
    await tester.pumpAndSettle();
  }

  testWidgets('Make cover moves the tapped photo to the front', (tester) async {
    await pumpEditor(tester, ['a', 'b', 'c']);
    await tapPhoto(tester, 2);
    await tester.tap(find.text('Make cover photo'));
    await tester.pumpAndSettle();
    expect(imageCalls, [
      ['c', 'a', 'b'],
    ]);
  });

  testWidgets('cover photo has no "Make cover" action', (tester) async {
    await pumpEditor(tester, ['a', 'b']);
    await tapPhoto(tester, 0);
    expect(find.text('Make cover photo'), findsNothing);
    expect(find.text('Remove photo'), findsOneWidget);
  });

  testWidgets('Remove drops the tapped photo', (tester) async {
    await pumpEditor(tester, ['a', 'b', 'c']);
    await tapPhoto(tester, 1);
    await tester.tap(find.text('Remove photo'));
    await tester.pumpAndSettle();
    expect(imageCalls, [
      ['a', 'c'],
    ]);
  });

  testWidgets('add tile shows below the cap and hides at 8 photos', (
    tester,
  ) async {
    await pumpEditor(tester, List.generate(7, (i) => 'k$i'));
    expect(find.text('Add photo'), findsOneWidget);

    await pumpEditor(tester, List.generate(maxProductImages, (i) => 'k$i'));
    expect(find.text('Add photo'), findsNothing);
    expect(find.text('8/8'), findsOneWidget);
  });
}
