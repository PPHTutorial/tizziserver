import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../api/catalog_models.dart' show formatMoney;
import '../../../api/commerce_models.dart';
import '../../../app/providers.dart';
import '../../../design/components.dart';
import '../../../design/context_ext.dart';
import '../../../design/tokens.g.dart';
import '../../../design/icons.dart';

/// Wallet's "See All" destination — the full transaction ledger, paged via
/// the same `nextCursor` the wallet screen's "Recent transactions" preview
/// already gets from the backend but never had anywhere to lead to.
class TransactionHistoryScreen extends ConsumerStatefulWidget {
  const TransactionHistoryScreen({super.key});

  @override
  ConsumerState<TransactionHistoryScreen> createState() =>
      _TransactionHistoryScreenState();
}

class _TransactionHistoryScreenState
    extends ConsumerState<TransactionHistoryScreen> {
  final _scroll = ScrollController();
  final _items = <WalletTxnDto>[];
  String? _cursor;
  bool _loading = true;
  bool _loadingMore = false;
  bool _done = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_onScroll);
    _loadFirst();
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_loadingMore || _done || _loading) return;
    if (_scroll.position.pixels >= _scroll.position.maxScrollExtent - 200) {
      _loadMore();
    }
  }

  Future<void> _loadFirst() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final page = await ref
          .read(stallApiProvider)
          .walletTransactionsPage();
      setState(() {
        _items
          ..clear()
          ..addAll(page.items);
        _cursor = page.nextCursor;
        _done = page.nextCursor == null;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _loading = false;
        _error = '$e';
      });
    }
  }

  Future<void> _loadMore() async {
    setState(() => _loadingMore = true);
    try {
      final page = await ref
          .read(stallApiProvider)
          .walletTransactionsPage(cursor: _cursor);
      setState(() {
        _items.addAll(page.items);
        _cursor = page.nextCursor;
        _done = page.nextCursor == null;
        _loadingMore = false;
      });
    } catch (_) {
      setState(() => _loadingMore = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Scaffold(
      backgroundColor: c.bg,
      body: SafeArea(
        child: Column(
          children: [
            const AppScreenHeader('Transaction history'),
            Expanded(
              child: _loading
                  ? const SkeletonList(rows: 6, rowHeight: 64)
                  : _error != null
                  ? AppErrorView(_error!, onRetry: _loadFirst)
                  : _items.isEmpty
                  ? const EmptyState(
                      icon: AppIcons.receipt_outlined,
                      title: 'No transactions yet',
                    )
                  : ListView.separated(
                      controller: _scroll,
                      padding: const EdgeInsets.fromLTRB(
                        AppSpace.s16,
                        0,
                        AppSpace.s16,
                        AppSpace.s24,
                      ),
                      itemCount: _items.length + (_done ? 0 : 1),
                      separatorBuilder: (_, __) =>
                          const SizedBox(height: AppSpace.s10),
                      itemBuilder: (context, i) {
                        if (i >= _items.length) {
                          return const Padding(
                            padding: EdgeInsets.symmetric(
                              vertical: AppSpace.s16,
                            ),
                            child: Center(
                              child: SizedBox(
                                width: 22,
                                height: 22,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                ),
                              ),
                            ),
                          );
                        }
                        return _TxnRow(txn: _items[i]);
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TxnRow extends StatelessWidget {
  const _TxnRow({required this.txn});
  final WalletTxnDto txn;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final t = txn;
    return AppCard(
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: t.isCredit ? c.successContainer : c.surfaceSunken,
              borderRadius: BorderRadius.circular(AppRadius.md),
            ),
            child: Icon(
              t.isCredit ? AppIcons.arrow_downward : AppIcons.arrow_upward,
              size: 16,
              color: t.isCredit ? c.success : c.textMed,
            ),
          ),
          const SizedBox(width: AppSpace.s12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  t.description,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: context.text.titleSmall,
                ),
                Text(
                  t.at.length >= 16
                      ? t.at.substring(0, 16).replaceFirst('T', ' · ')
                      : t.at,
                  style: context.text.bodySmall?.copyWith(color: c.textMed),
                ),
              ],
            ),
          ),
          const SizedBox(width: AppSpace.s8),
          Text(
            '${t.isCredit ? '+' : '-'}${formatMoney(t.amountMinor, 'GHS')}',
            style: context.text.titleSmall?.copyWith(
              color: t.isCredit ? c.success : c.textHi,
            ),
          ),
        ],
      ),
    );
  }
}
