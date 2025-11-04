/* eslint-disable @typescript-eslint/no-explicit-any */
import prisma from '@/lib/prisma';
import { ResponseUtils } from '@/lib/utils';

export class NotificationService {
  static async getNotifications(userId: string, pagination?: any, sorting?: any) {
    try {
      const page = pagination?.page || 1;
      const limit = pagination?.limit || 10;
      const skip = (page - 1) * limit;

      const notifications = await prisma.notification.findMany({
        skip,
        take: limit,
        where: { userId },
        orderBy: {
          [sorting?.field || 'createdAt']: sorting?.order || 'desc',
        },
      });

      return ResponseUtils.success({ notifications });
    } catch (error) {
      console.error('Get notifications error:', error);
      return ResponseUtils.error('Internal server error');
    }
  }

  static async markAsRead(notificationId: string, userId: string) {
    try {
      const notification = await prisma.notification.update({
        where: { 
          id: notificationId,
          userId, // Ensure user owns this notification
        },
        data: { isRead: true },
      });

      return ResponseUtils.success({
        message: 'Notification marked as read',
        notification,
      });
    } catch (error) {
      console.error('Mark notification as read error:', error);
      return ResponseUtils.error('Internal server error');
    }
  }

  static async markAllAsRead(userId: string) {
    try {
      await prisma.notification.updateMany({
        where: { userId, isRead: false },
        data: { isRead: true },
      });

      return ResponseUtils.success({
        message: 'All notifications marked as read',
      });
    } catch (error) {
      console.error('Mark all notifications as read error:', error);
      return ResponseUtils.error('Internal server error');
    }
  }

  static async sendNotification(data: any, userId: string) {
    try {
      const notification = await prisma.notification.create({
        data: {
          userId: data.userId || userId,
          title: data.title,
          message: data.message,
          type: data.type || 'INFO',
        },
      });

      return ResponseUtils.success({
        message: 'Notification sent successfully',
        notification,
      });
    } catch (error) {
      console.error('Send notification error:', error);
      return ResponseUtils.error('Internal server error');
    }
  }
}
