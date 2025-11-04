/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import prisma from '@/lib/prisma';
import { ResponseUtils, AuthUtils } from '@/lib/utils';
import { OrderStatus } from '@prisma/client';

export class OrderService {
  static async createOrder(userId: string, data: any) {
    try {
      const order = await prisma.order.create({
        data: {
          customerId: userId,
          vendorId: data.vendorId,
          cylinderType: data.cylinderType,
          weight: data.weight,
          volume: data.volume,
          amount: data.amount,
          deliveryFee: data.deliveryFee || 0,
          serviceFee: data.serviceFee || 0,
          totalAmount: data.totalAmount || data.amount,
          customerLat: data.customerLat,
          customerLng: data.customerLng,
          customerAddr: data.customerAddr,
          vendorLat: data.vendorLat,
          vendorLng: data.vendorLng,
          vendorAddr: data.vendorAddr,
          notes: data.notes,
          orderNumber: AuthUtils.generateUniqueOrderNumber(),
          status: 'PENDING',
        },
      });

      return ResponseUtils.success({
        message: 'Order created successfully',
        order,
      });
    } catch (error) {
      console.error('Create order error:', error);
      return ResponseUtils.error('Internal server error');
    }
  }

  static async getOrders(userId: string, filters?: any, pagination?: any, sorting?: any) {
    try {
      const page = pagination?.page || 1;
      const limit = pagination?.limit || 10;
      const skip = (page - 1) * limit;

      const orders = await prisma.order.findMany({
        skip,
        take: limit,
        where: {
          customerId: userId,
          status: filters?.status,
        },
        include: {
          vendor: {
            select: {
              id: true,
              businessName: true,
              address: true,
            },
          },
        },
        orderBy: {
          [sorting?.field || 'createdAt']: sorting?.order || 'desc',
        },
      });

      return ResponseUtils.success({ orders });
    } catch (error) {
      console.error('Get orders error:', error);
      return ResponseUtils.error('Internal server error');
    }
  }

  static async getOrderDetails(orderId: string, userId: string) {
    try {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          vendor: {
            select: {
              id: true,
              businessName: true,
              address: true,
              phone1: true,
            },
          },
          courier: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phone1: true,
            },
          },
        },
      });

      if (!order) {
        return ResponseUtils.error('Order not found', 404);
      }

      // Check if user has access to this order
      if (order.customerId !== userId && order.vendorId !== userId && order.courierId !== userId) {
        return ResponseUtils.error('Access denied', 403);
      }

      return ResponseUtils.success({ order });
    } catch (error) {
      console.error('Get order details error:', error);
      return ResponseUtils.error('Internal server error');
    }
  }

  static async updateOrderStatus(orderId: string, status: string, userId: string) {
    try {
      const order = await prisma.order.update({
        where: { id: orderId },
        data: { status: status as OrderStatus },
      });

      return ResponseUtils.success({
        message: 'Order status updated successfully',
        order,
      });
    } catch (error) {
      console.error('Update order status error:', error);
      return ResponseUtils.error('Internal server error');
    }
  }

  static async cancelOrder(orderId: string, userId: string) {
    try {
      const order = await prisma.order.update({
        where: { id: orderId },
        data: { status: 'CANCELLED' },
      });

      return ResponseUtils.success({
        message: 'Order cancelled successfully',
        order,
      });
    } catch (error) {
      console.error('Cancel order error:', error);
      return ResponseUtils.error('Internal server error');
    }
  }

  static async assignCourier(orderId: string, courierId: string, userId: string) {
    try {
      const order = await prisma.order.update({
        where: { id: orderId },
        data: { 
          courierId,
          status: 'COURIER_ASSIGNED',
        },
      });

      return ResponseUtils.success({
        message: 'Courier assigned successfully',
        order,
      });
    } catch (error) {
      console.error('Assign courier error:', error);
      return ResponseUtils.error('Internal server error');
    }
  }

  static async searchOrders(query?: any, filters?: any, pagination?: any, sorting?: any, userId?: string) {
    try {
      const page = pagination?.page || 1;
      const limit = pagination?.limit || 10;
      const skip = (page - 1) * limit;

      const orders = await prisma.order.findMany({
        skip,
        take: limit,
        where: {
          customerId: userId,
          status: filters?.status,
        },
        include: {
          vendor: {
            select: {
              id: true,
              businessName: true,
              address: true,
            },
          },
        },
        orderBy: {
          [sorting?.field || 'createdAt']: sorting?.order || 'desc',
        },
      });

      return ResponseUtils.success({ orders });
    } catch (error) {
      console.error('Search orders error:', error);
      return ResponseUtils.error('Internal server error');
    }
  }

  static async getOrderAnalytics(userId: string, filters?: any, query?: any) {
    try {
      const totalOrders = await prisma.order.count({
        where: { customerId: userId },
      });

      const pendingOrders = await prisma.order.count({
        where: { customerId: userId, status: 'PENDING' },
      });

      const completedOrders = await prisma.order.count({
        where: { customerId: userId, status: 'DELIVERED' },
      });

      return ResponseUtils.success({
        analytics: {
          totalOrders,
          pendingOrders,
          completedOrders,
        },
      });
    } catch (error) {
      console.error('Order analytics error:', error);
      return ResponseUtils.error('Internal server error');
    }
  }
}
