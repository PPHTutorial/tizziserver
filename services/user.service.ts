/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import prisma from '@/lib/prisma';
import { ResponseUtils } from '@/lib/utils';

export class UserService {
    static async listUsers(query?: any, pagination?: any, sorting?: any) {
        try {
            const page = pagination?.page || 1;
            const limit = pagination?.limit || 10;
            const skip = (page - 1) * limit;

            const where: any = {
                deletedAt: null,
            };

            // Add search functionality
            if (query?.search) {
                where.OR = [
                    { firstName: { contains: query.search, mode: 'insensitive' } },
                    { lastName: { contains: query.search, mode: 'insensitive' } },
                    { email: { contains: query.search, mode: 'insensitive' } },
                    { phone: { contains: query.search, mode: 'insensitive' } },
                ];
            }

            // Add role filter
            if (query?.role) {
                where.role = query.role;
            }

            // Add status filter
            if (query?.status) {
                where.status = query.status;
            }

            const users = await prisma.user.findMany({
                skip,
                take: limit,
                where,
                select: {
                    id: true,
                    email: true,
                    phone: true,
                    firstName: true,
                    lastName: true,
                    role: true,
                    status: true,
                    isVerified: true,
                    createdAt: true,
                    updatedAt: true,
                },
                orderBy: {
                    [sorting?.field || 'createdAt']: sorting?.order || 'desc',
                },
            });

            const total = await prisma.user.count({ where });

            return ResponseUtils.success({
                users,
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit),
                },
            });
        } catch (error) {
            console.error('List users error:', error);
            return ResponseUtils.error('Internal server error');
        }
    }

    static async getProfile(userId: string) {
        try {
            const user = await prisma.user.findUnique({
                where: { id: userId },
                include: {
                    customer: true,
                    vendor: true,
                    courier: true,
                },
            });

            if (!user) {
                return ResponseUtils.error('User not found', 404);
            }

            let profileData = null;
            if (user.role === 'CUSTOMER') {
                profileData = user.customer;
            } else if (user.role === 'VENDOR') {
                profileData = user.vendor;
            } else if (user.role === 'COURIER') {
                profileData = user.courier;
            }

            return ResponseUtils.success({
                user: {
                    id: user.id,
                    email: user.email,
                    phone: user.phone,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    role: user.role,
                    status: user.status,
                    isVerified: user.isVerified,
                    profileData,
                },
            });
        } catch (error) {
            console.error('Get profile error:', error);
            return ResponseUtils.error('Internal server error');
        }
    }

    static async updateProfile(userId: string, data: any) {
        try {
            const updatedUser = await prisma.user.update({
                where: { id: userId },
                data: {
                    firstName: data.firstName,
                    lastName: data.lastName,
                    email: data.email,
                },
            });

            return ResponseUtils.success({
                message: 'Profile updated successfully',
                user: updatedUser,
            });
        } catch (error) {
            console.error('Update profile error:', error);
            return ResponseUtils.error('Internal server error');
        }
    }

    static async deleteAccount(userId: string) {
        try {
            await prisma.user.update({
                where: { id: userId },
                data: { deletedAt: new Date() },
            });

            return ResponseUtils.success({
                message: 'Account deleted successfully',
            });
        } catch (error) {
            console.error('Delete account error:', error);
            return ResponseUtils.error('Internal server error');
        }
    }

    static async searchUsers(query: any, filters: any, pagination: any, sorting: any) {
        try {
            const page = pagination?.page || 1;
            const limit = pagination?.limit || 10;
            const skip = (page - 1) * limit;

            const users = await prisma.user.findMany({
                skip,
                take: limit,
                where: {
                    deletedAt: null,
                    OR: query ? [
                        { firstName: { contains: query.search, mode: 'insensitive' } },
                        { lastName: { contains: query.search, mode: 'insensitive' } },
                        { email: { contains: query.search, mode: 'insensitive' } },
                    ] : undefined,
                    role: filters?.role,
                },
                orderBy: {
                    [sorting?.field || 'createdAt']: sorting?.order || 'desc',
                },
            });

            const total = await prisma.user.count({
                where: {
                    deletedAt: null,
                    role: filters?.role,
                },
            });

            return ResponseUtils.success({
                users,
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit),
                },
            });
        } catch (error) {
            console.error('Search users error:', error);
            return ResponseUtils.error('Internal server error');
        }
    }

    static async executeCustomQuery(query: any, filters: any, pagination: any, sorting: any, currentUser: any) {
        // This would handle complex custom queries
        try {
            return ResponseUtils.success({
                message: 'Custom query executed',
                data: [],
            });
        } catch (error) {
            console.error('Custom query error:', error);
            return ResponseUtils.error('Internal server error');
        }
    }

    static async getDashboardAnalytics(userId: string, filters: any, query: any) {
        try {
            const user = await prisma.user.findUnique({
                where: { id: userId },
            });

            if (!user) {
                return ResponseUtils.error('User not found', 404);
            }

            // Basic analytics based on user role
            let analytics = {};

            if (user.role === 'CUSTOMER') {
                const orderCount = await prisma.order.count({
                    where: { customerId: userId },
                });
                analytics = { orderCount };
            } else if (user.role === 'VENDOR') {
                const orderCount = await prisma.order.count({
                    where: { vendorId: userId },
                });
                analytics = { orderCount };
            }

            return ResponseUtils.success({
                analytics,
            });
        } catch (error) {
            console.error('Dashboard analytics error:', error);
            return ResponseUtils.error('Internal server error');
        }
    }
}
