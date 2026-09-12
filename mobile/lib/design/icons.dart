// The app's icon vocabulary. Font Awesome only (design system §31) — no Material
// or Cupertino glyphs anywhere in feature code.
//
// Names deliberately mirror the Material identifiers they replaced so call sites
// read `AppIcons.chevron_right` etc. — a pure token swap, nothing to relearn.
// ignore_for_file: constant_identifier_names

import 'package:flutter/widgets.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';

/// Semantic icon set backed by Font Awesome. Use with [Icon] or [AppIcon].
class AppIcons {
  const AppIcons._();

  // navigation / chrome
  static const chevron_right = FontAwesomeIcons.chevronRight;
  static const chevron_left = FontAwesomeIcons.chevronLeft;
  static const arrow_back = FontAwesomeIcons.arrowLeft;
  static const logout = FontAwesomeIcons.rightFromBracket;
  static const mic = FontAwesomeIcons.microphone;
  static const camera = FontAwesomeIcons.camera;
  static const close = FontAwesomeIcons.xmark;
  static const check = FontAwesomeIcons.check;
  static const add = FontAwesomeIcons.plus;
  static const remove = FontAwesomeIcons.minus;
  static const search = FontAwesomeIcons.magnifyingGlass;
  static const search_off = FontAwesomeIcons.magnifyingGlassMinus;
  static const tune = FontAwesomeIcons.sliders;
  static const swap_horiz = FontAwesomeIcons.rightLeft;
  static const arrow_upward = FontAwesomeIcons.arrowUp;
  static const arrow_downward = FontAwesomeIcons.arrowDown;
  static const north_east = FontAwesomeIcons.arrowUp;
  static const south_west = FontAwesomeIcons.arrowDown;
  static const play_arrow = FontAwesomeIcons.play;
  static const replay = FontAwesomeIcons.arrowRotateLeft;
  static const history = FontAwesomeIcons.clockRotateLeft;
  static const circle = FontAwesomeIcons.solidCircle;

  // status / feedback
  static const check_circle = FontAwesomeIcons.circleCheck;
  static const check_circle_outline = FontAwesomeIcons.circleCheck;
  static const error_outline = FontAwesomeIcons.circleExclamation;
  static const info_outline = FontAwesomeIcons.circleInfo;
  static const hourglass_top = FontAwesomeIcons.hourglassStart;
  static const hourglass_bottom = FontAwesomeIcons.hourglassEnd;
  static const gpp_bad = FontAwesomeIcons.shieldHalved;
  static const block = FontAwesomeIcons.ban;
  static const flag = FontAwesomeIcons.flag;
  static const verified = FontAwesomeIcons.circleCheck;
  static const verified_outlined = FontAwesomeIcons.circleCheck;
  static const verified_user = FontAwesomeIcons.userShield;
  static const verified_user_outlined = FontAwesomeIcons.userShield;

  // commerce
  static const storefront_outlined = FontAwesomeIcons.store;
  static const store_mall_directory_outlined = FontAwesomeIcons.store;
  static const shopping_cart_outlined = FontAwesomeIcons.cartShopping;
  static const shopping_bag_outlined = FontAwesomeIcons.bagShopping;
  static const local_offer_outlined = FontAwesomeIcons.tag;
  static const receipt_long = FontAwesomeIcons.receipt;
  static const receipt_long_outlined = FontAwesomeIcons.receipt;
  static const receipt_outlined = FontAwesomeIcons.receipt;
  static const inventory_2_outlined = FontAwesomeIcons.boxesStacked;
  static const category_outlined = FontAwesomeIcons.shapes;
  static const bolt = FontAwesomeIcons.bolt;
  static const bolt_outlined = FontAwesomeIcons.bolt;
  static const card_giftcard_outlined = FontAwesomeIcons.gift;
  static const description_outlined = FontAwesomeIcons.fileLines;
  static const upload_file = FontAwesomeIcons.fileArrowUp;
  static const image_outlined = FontAwesomeIcons.image;

  // money
  static const account_balance_wallet_outlined = FontAwesomeIcons.wallet;
  static const payments_outlined = FontAwesomeIcons.moneyBillWave;
  static const language = FontAwesomeIcons.language;
  static const settings_outlined = FontAwesomeIcons.gear;
  static const expand = FontAwesomeIcons.expand;
  static const compress = FontAwesomeIcons.compress;
  static const credit_card = FontAwesomeIcons.creditCard;
  static const savings_outlined = FontAwesomeIcons.piggyBank;

  // delivery / location
  static const local_shipping_outlined = FontAwesomeIcons.truck;
  static const local_shipping = FontAwesomeIcons.truck;
  static const delivery_dining = FontAwesomeIcons.motorcycle;
  static const two_wheeler = FontAwesomeIcons.motorcycle;
  static const two_wheeler_outlined = FontAwesomeIcons.motorcycle;
  static const directions_car = FontAwesomeIcons.car;
  static const directions_bike = FontAwesomeIcons.bicycle;
  static const airport_shuttle = FontAwesomeIcons.vanShuttle;
  static const clock = FontAwesomeIcons.clock;
  static const calendar_today = FontAwesomeIcons.calendarDay;
  static const route = FontAwesomeIcons.route;
  static const route_outlined = FontAwesomeIcons.route;
  static const location_on_outlined = FontAwesomeIcons.locationDot;
  static const location_searching = FontAwesomeIcons.locationCrosshairs;
  static const my_location = FontAwesomeIcons.locationCrosshairs;
  static const near_me = FontAwesomeIcons.locationArrow;

  // people / comms
  static const person = FontAwesomeIcons.user;
  static const person_outline = FontAwesomeIcons.user;
  static const forum_outlined = FontAwesomeIcons.comments;
  static const chat_bubble_outline = FontAwesomeIcons.comment;
  static const inbox_outlined = FontAwesomeIcons.inbox;
  static const send = FontAwesomeIcons.paperPlane;
  static const notifications_none = FontAwesomeIcons.bell;
  static const share_outlined = FontAwesomeIcons.shareNodes;
  static const social_distance = FontAwesomeIcons.peopleArrows;
  static const support_agent = FontAwesomeIcons.headset;
  static const support_agent_outlined = FontAwesomeIcons.headset;
  static const headset_mic = FontAwesomeIcons.headset;
  static const headset_mic_outlined = FontAwesomeIcons.headset;
  static const call = FontAwesomeIcons.phone;
  static const alternate_email = FontAwesomeIcons.at;
  static const sms_outlined = FontAwesomeIcons.commentSms;

  // security / account
  static const security = FontAwesomeIcons.lock;
  static const shield = FontAwesomeIcons.shieldHalved;
  static const shield_outlined = FontAwesomeIcons.shieldHalved;
  static const password = FontAwesomeIcons.key;
  static const vpn_key_outlined = FontAwesomeIcons.key;
  static const pin = FontAwesomeIcons.key;
  static const pin_outlined = FontAwesomeIcons.key;
  static const devices = FontAwesomeIcons.desktop;
  static const smartphone = FontAwesomeIcons.mobileScreenButton;
  static const bedtime_outlined = FontAwesomeIcons.moon;
  static const gavel_outlined = FontAwesomeIcons.gavel;
  static const delete_outline = FontAwesomeIcons.trashCan;
  static const copy = FontAwesomeIcons.copy;
  static const copy_outlined = FontAwesomeIcons.copy;

  // engagement
  static const favorite = FontAwesomeIcons.solidHeart;
  static const favorite_border = FontAwesomeIcons.heart;
  static const star = FontAwesomeIcons.solidStar;
  static const star_border = FontAwesomeIcons.star;
  static const emoji_events = FontAwesomeIcons.trophy;
  static const emoji_events_outlined = FontAwesomeIcons.trophy;
  static const confirmation_number = FontAwesomeIcons.ticket;
  static const confirmation_number_outlined = FontAwesomeIcons.ticket;
  static const leaderboard_outlined = FontAwesomeIcons.rankingStar;
  static const list_alt = FontAwesomeIcons.listCheck;
  static const insights_outlined = FontAwesomeIcons.chartLine;
  static const timeline_outlined = FontAwesomeIcons.timeline;
  static const campaign_outlined = FontAwesomeIcons.bullhorn;

  // brands (social auth)
  static const g_mobiledata = FontAwesomeIcons.google;
  static const facebook = FontAwesomeIcons.facebookF;
  static const apple = FontAwesomeIcons.apple;
}

/// A Font Awesome icon at the app's default affordance size. Thin wrapper over
/// [FaIcon] so feature code never imports the package directly.
class AppIcon extends StatelessWidget {
  const AppIcon(this.icon, {super.key, this.size = 18, this.color});

  final IconData icon;
  final double size;
  final Color? color;

  @override
  Widget build(BuildContext context) => FaIcon(icon, size: size, color: color);
}
