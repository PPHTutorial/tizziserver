/* eslint-disable @typescript-eslint/no-explicit-any */
import prisma from '@/lib/prisma';
import { ResponseUtils } from '@/lib/utils';

export class CourierService {
  static async getProfile(userId: string) {
    try {
      const courier = await prisma.courier.findUnique({
        where: { userId },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
            },
          },
        },
      });

      if (!courier) {
        return ResponseUtils.error('Courier profile not found', 404);
      }

      return ResponseUtils.success({ courier });
    } catch (error) {
      console.error('Get courier profile error:', error);
      return ResponseUtils.error('Internal server error');
    }
  }

  static async updateProfile(userId: string, data: any) {
    try {
      const courier = await prisma.courier.update({
        where: { userId },
        data: {
          firstName: data.firstName,
          lastName: data.lastName,
          phone1: data.phone1,
          vehicleType: data.vehicleType,
        },
      });

      return ResponseUtils.success({
        message: 'Courier profile updated successfully',
        courier,
      });
    } catch (error) {
      console.error('Update courier profile error:', error);
      return ResponseUtils.error('Internal server error');
    }
  }

  static async toggleAvailability(userId: string, available: boolean) {
    try {
      const courier = await prisma.courier.update({
        where: { userId },
        data: { isActive: available },
      });

      return ResponseUtils.success({
        message: 'Availability updated successfully',
        courier,
      });
    } catch (error) {
      console.error('Toggle availability error:', error);
      return ResponseUtils.error('Internal server error');
    }
  }

  static async updateLocation(userId: string, latitude: number, longitude: number) {
    try {
      const courier = await prisma.courier.update({
        where: { userId },
        data: { latitude, longitude },
      });

      return ResponseUtils.success({
        message: 'Location updated successfully',
        courier,
      });
    } catch (error) {
      console.error('Update location error:', error);
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
          courierId: userId,
          status: filters?.status,
        },
        include: {
          customer: {
            select: {
              id: true,
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                  phone: true,
                },
              },
            },
          },
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
      console.error('Get courier orders error:', error);
      return ResponseUtils.error('Internal server error');
    }
  }
}
