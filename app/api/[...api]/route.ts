import { NextRequest } from 'next/server';
import { z } from 'zod';
import { AuthService } from '@/services/auth.service';
import { UserService } from '@/services/user.service';
import { VendorService } from '@/services/vendor.service';
import { CourierService } from '@/services/courier.service';
import { OrderService } from '@/services/order.service';
import { NotificationService } from '@/services/notification.service';
import { ResponseUtils, AuthUtils } from '@/lib/utils';

// Base request schema
const baseRequestSchema = z.object({
    action: z.string(),
    data: z.record(z.string(), z.any()).optional(),
    query: z.record(z.string(), z.any()).optional(),
    filters: z.record(z.string(), z.any()).optional(),
    pagination: z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(250).default(100),
    }).optional(),
    sorting: z.object({
        field: z.string(),
        order: z.enum(['asc', 'desc']).default('desc'),
    }).optional(),
});

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { action, data, query, filters, pagination, sorting } = baseRequestSchema.parse(body);

        // Extract authorization token
        const authorization = request.headers.get('authorization');
        let currentUser = null;

        if (authorization?.startsWith('Bearer ')) {
            try {
                const token = authorization.substring(7);
                currentUser = AuthUtils.verifyToken(token);
            } catch {
                // Token is invalid, but some endpoints don't require auth
            }
        }

        // Route to appropriate service based on action
        switch (action) {
            // Authentication actions (Phone OTP only)
            // Note: login and register are removed - use send-otp and verify-otp instead

            case 'auth.send-otp':
                return await AuthService.sendOTP(data);
            case 'auth.verify-otp':
                return await AuthService.verifyOTP(data);
            case 'auth.refresh-token':
                return await AuthService.refreshToken(data);

            // User management actions
            case 'user.list':
                return await UserService.listUsers(query, pagination, sorting);
            case 'user.profile':
                if (!currentUser) return ResponseUtils.error('Authentication required', 401);
                return await UserService.getProfile(currentUser.userId);
            case 'user.update-profile':
                if (!currentUser) return ResponseUtils.error('Authentication required', 401);
                return await UserService.updateProfile(currentUser.userId, data);
            case 'user.delete-account':
                if (!currentUser) return ResponseUtils.error('Authentication required', 401);
                return await UserService.deleteAccount(currentUser.userId);
            case 'user.search':
                return await UserService.searchUsers(query, filters, pagination, sorting);

            // Vendor actions
            case 'vendor.list':
                return await VendorService.getVendors(query, filters, pagination, sorting);
            case 'vendor.details':
                return await VendorService.getVendorDetails(data?.vendorId);
            case 'vendor.profile':
                if (!currentUser) return ResponseUtils.error('Authentication required', 401);
                return await VendorService.getProfile(currentUser.userId);
            case 'vendor.update-profile':
                if (!currentUser) return ResponseUtils.error('Authentication required', 401);
                return await VendorService.updateProfile(currentUser.userId, data);
            case 'vendor.search':
                return await VendorService.searchVendors(query, filters, pagination, sorting);
            case 'vendor.nearby':
                return await VendorService.getNearbyVendors(data?.latitude, data?.longitude, data?.radius);

            // Courier actions
            case 'courier.profile':
                if (!currentUser) return ResponseUtils.error('Authentication required', 401);
                return await CourierService.getProfile(currentUser.userId);
            case 'courier.update-profile':
                if (!currentUser) return ResponseUtils.error('Authentication required', 401);
                return await CourierService.updateProfile(currentUser.userId, data);
            case 'courier.available':
                if (!currentUser) return ResponseUtils.error('Authentication required', 401);
                return await CourierService.toggleAvailability(currentUser.userId, data?.available);
            case 'courier.location':
                if (!currentUser) return ResponseUtils.error('Authentication required', 401);
                return await CourierService.updateLocation(currentUser.userId, data?.latitude, data?.longitude);
            case 'courier.orders':
                if (!currentUser) return ResponseUtils.error('Authentication required', 401);
                return await CourierService.getOrders(currentUser.userId, filters, pagination, sorting);

            // Order actions
            case 'order.create':
                if (!currentUser) return ResponseUtils.error('Authentication required', 401);
                return await OrderService.createOrder(currentUser.userId, data);
            case 'order.list':
                if (!currentUser) return ResponseUtils.error('Authentication required', 401);
                return await OrderService.getOrders(currentUser.userId, filters, pagination, sorting);
            case 'order.details':
                if (!currentUser) return ResponseUtils.error('Authentication required', 401);
                return await OrderService.getOrderDetails(data?.orderId, currentUser.userId);
            case 'order.update-status':
                if (!currentUser) return ResponseUtils.error('Authentication required', 401);
                return await OrderService.updateOrderStatus(data?.orderId, data?.status, currentUser.userId);
            case 'order.cancel':
                if (!currentUser) return ResponseUtils.error('Authentication required', 401);
                return await OrderService.cancelOrder(data?.orderId, currentUser.userId);
            case 'order.assign-courier':
                if (!currentUser) return ResponseUtils.error('Authentication required', 401);
                return await OrderService.assignCourier(data?.orderId, data?.courierId, currentUser.userId);
            case 'order.search':
                if (!currentUser) return ResponseUtils.error('Authentication required', 401);
                return await OrderService.searchOrders(query, filters, pagination, sorting, currentUser.userId);

            // Notification actions
            case 'notification.list':
                if (!currentUser) return ResponseUtils.error('Authentication required', 401);
                return await NotificationService.getNotifications(currentUser.userId, pagination, sorting);
            case 'notification.mark-read':
                if (!currentUser) return ResponseUtils.error('Authentication required', 401);
                return await NotificationService.markAsRead(data?.notificationId, currentUser.userId);
            case 'notification.mark-all-read':
                if (!currentUser) return ResponseUtils.error('Authentication required', 401);
                return await NotificationService.markAllAsRead(currentUser.userId);
            case 'notification.send':
                if (!currentUser) return ResponseUtils.error('Authentication required', 401);
                return await NotificationService.sendNotification(data, currentUser.userId);

            // Database query actions for complex searches and analytics
            case 'query.custom':
                if (!currentUser) return ResponseUtils.error('Authentication required', 401);
                return await UserService.executeCustomQuery(query, filters, pagination, sorting, currentUser);
            case 'analytics.dashboard':
                if (!currentUser) return ResponseUtils.error('Authentication required', 401);
                return await UserService.getDashboardAnalytics(currentUser.userId, filters, query);
            case 'analytics.orders':
                if (!currentUser) return ResponseUtils.error('Authentication required', 401);
                return await OrderService.getOrderAnalytics(currentUser.userId, filters, query);
            case 'analytics.vendors':
                if (!currentUser) return ResponseUtils.error('Authentication required', 401);
                return await VendorService.getVendorAnalytics(filters, query);

            default:
                return ResponseUtils.error(`Unknown action: ${action}`, 400);
        }

    } catch (error: unknown) {
        console.error('API Error:', error);

        if (error instanceof z.ZodError) {
            return ResponseUtils.error(
                'Validation failed',
                400,
                error.issues.map((issue) => ({
                    field: issue.path.join('.'),
                    message: issue.message
                }))
            );
        }

        return ResponseUtils.error('Internal server error');
    }
}

export async function GET() {
    return ResponseUtils.error('GET method not supported. Use POST with action in request body.', 405);
}

export async function PUT() {
    return ResponseUtils.error('PUT method not supported. Use POST with action in request body.', 405);
}

export async function DELETE() {
    return ResponseUtils.error('DELETE method not supported. Use POST with action in request body.', 405);
}
