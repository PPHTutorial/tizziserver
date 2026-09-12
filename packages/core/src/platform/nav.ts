import type { Role } from "@stall/db";

export interface NavItem {
  key: string;
  label: string;
  /** Font Awesome icon name (design system: FA only). */
  icon: string;
  route: string;
}

/** Role → bottom-nav (MD §32). Rendered by the client, never hardcoded there. */
export const NAV: Record<Role, NavItem[]> = {
  CUSTOMER: [
    { key: "home", label: "Home", icon: "house", route: "/home" },
    { key: "explore", label: "Explore", icon: "compass", route: "/explore" },
    { key: "sell", label: "Sell", icon: "store", route: "/sell" },
    { key: "orders", label: "Orders", icon: "box", route: "/orders" },
    { key: "profile", label: "Profile", icon: "user", route: "/profile" },
  ],
  VENDOR: [
    { key: "dashboard", label: "Dashboard", icon: "gauge", route: "/vendor" },
    { key: "products", label: "Products", icon: "tags", route: "/vendor/products" },
    { key: "orders", label: "Orders", icon: "receipt", route: "/vendor/orders" },
    { key: "analytics", label: "Analytics", icon: "chart-line", route: "/vendor/analytics" },
    { key: "wallet", label: "Wallet", icon: "wallet", route: "/vendor/wallet" },
  ],
  COURIER: [
    { key: "home", label: "Home", icon: "house", route: "/courier" },
    { key: "jobs", label: "Jobs", icon: "list-check", route: "/courier/jobs" },
    { key: "active", label: "Active", icon: "route", route: "/courier/active" },
    { key: "earnings", label: "Earnings", icon: "sack-dollar", route: "/courier/earnings" },
    { key: "profile", label: "Profile", icon: "user", route: "/courier/profile" },
  ],
  STAFF: [
    { key: "ops", label: "Ops", icon: "headset", route: "/staff" },
    { key: "kyc", label: "KYC", icon: "id-card", route: "/staff/kyc" },
    { key: "disputes", label: "Disputes", icon: "scale-balanced", route: "/staff/disputes" },
  ],
  ADMIN: [
    { key: "console", label: "Console", icon: "sliders", route: "/admin" },
  ],
};
