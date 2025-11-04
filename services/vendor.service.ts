/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import prisma from '@/lib/prisma';
import { ResponseUtils, LocationUtils } from '@/lib/utils';

export class VendorService {
  static async getVendors(query?: any, filters?: any, pagination?: any, sorting?: any) {
    try {
      const page = pagination?.page || 1;
      const limit = pagination?.limit || 10;
      const skip = (page - 1) * limit;

      const vendors = await prisma.vendor.findMany({
        skip,
        take: limit,
        where: {
          deletedAt: null,
          isActive: filters?.isActive !== undefined ? filters.isActive : true,
        },
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
        orderBy: {
          [sorting?.field || 'createdAt']: sorting?.order || 'desc',
        },
      });

      const total = await prisma.vendor.count({
        where: {
          deletedAt: null,
          isActive: filters?.isActive !== undefined ? filters.isActive : true,
        },
      });

      return ResponseUtils.success({
        vendors,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      console.error('Get vendors error:', error);
      return ResponseUtils.error('Internal server error');
    }
  }

  static async getVendorDetails(vendorId: string) {
    try {
      const vendor = await prisma.vendor.findUnique({
        where: { id: vendorId },
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

      if (!vendor) {
        return ResponseUtils.error('Vendor not found', 404);
      }

      return ResponseUtils.success({ vendor });
    } catch (error) {
      console.error('Get vendor details error:', error);
      return ResponseUtils.error('Internal server error');
    }
  }

  static async getProfile(userId: string) {
    try {
      const vendor = await prisma.vendor.findUnique({
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

      if (!vendor) {
        return ResponseUtils.error('Vendor profile not found', 404);
      }

      return ResponseUtils.success({ vendor });
    } catch (error) {
      console.error('Get vendor profile error:', error);
      return ResponseUtils.error('Internal server error');
    }
  }

  static async updateProfile(userId: string, data: any) {
    try {
      const vendor = await prisma.vendor.update({
        where: { userId },
        data: {
          businessName: data.businessName,
          description: data.description,
          website: data.website,
          phone1: data.phone1,
          phone2: data.phone2,
          email: data.email,
          latitude: data.latitude,
          longitude: data.longitude,
          address: data.address,
          city: data.city,
          region: data.region,
          country: data.country,
          pricePerKg: data.pricePerKg,
          currency: data.currency,
        },
      });

      return ResponseUtils.success({
        message: 'Vendor profile updated successfully',
        vendor,
      });
    } catch (error) {
      console.error('Update vendor profile error:', error);
      return ResponseUtils.error('Internal server error');
    }
  }

  static async searchVendors(query?: any, filters?: any, pagination?: any, sorting?: any) {
    try {
      const page = pagination?.page || 1;
      const limit = pagination?.limit || 10;
      const skip = (page - 1) * limit;

      const vendors = await prisma.vendor.findMany({
        skip,
        take: limit,
        where: {
          deletedAt: null,
          isActive: true,
          AND: query?.search ? [
            {
              OR: [
                { businessName: { contains: query.search, mode: 'insensitive' } },
                { description: { contains: query.search, mode: 'insensitive' } },
                { address: { contains: query.search, mode: 'insensitive' } },
                { city: { contains: query.search, mode: 'insensitive' } },
              ],
            },
          ] : [],
        },
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
        orderBy: {
          [sorting?.field || 'createdAt']: sorting?.order || 'desc',
        },
      });

      return ResponseUtils.success({ vendors });
    } catch (error) {
      console.error('Search vendors error:', error);
      return ResponseUtils.error('Internal server error');
    }
  }

  static async getNearbyVendors(latitude: number, longitude: number, radius: number = 10) {
    try {
      const vendors = await prisma.vendor.findMany({
        where: {
          deletedAt: null,
          isActive: true,
          
        },
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

      // Filter by distance
      const nearbyVendors = vendors.filter((vendor) => {
        if (!vendor.latitude || !vendor.longitude) return false;
        const distance = LocationUtils.calculateDistance(
          latitude,
          longitude,
          vendor.latitude,
          vendor.longitude
        );
        return distance <= radius;
      });

      return ResponseUtils.success({
        vendors: nearbyVendors,
        count: nearbyVendors.length,
      });
    } catch (error) {
      console.error('Get nearby vendors error:', error);
      return ResponseUtils.error('Internal server error');
    }
  }

  static async getVendorAnalytics(filters?: any, query?: any) {
    try {
      const totalVendors = await prisma.vendor.count({
        where: { deletedAt: null },
      });

      const activeVendors = await prisma.vendor.count({
        where: { deletedAt: null, isActive: true },
      });

      return ResponseUtils.success({
        analytics: {
          totalVendors,
          activeVendors,
          inactiveVendors: totalVendors - activeVendors,
        },
      });
    } catch (error) {
      console.error('Vendor analytics error:', error);
      return ResponseUtils.error('Internal server error');
    }
  }
}
