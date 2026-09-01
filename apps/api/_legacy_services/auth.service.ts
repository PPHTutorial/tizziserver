/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { AuthUtils, ResponseUtils, NaloSMSUtils, ValidationUtils } from '@/lib/utils';
import { sendEmail, generateEmailVerificationCode } from '@/lib/email';
import { createEmailVerificationTemplate } from '@/lib/email-templates';

export class AuthService {

  static async sendOTP(data: any) {
    try {
      const schema = z.object({
        phoneNumber: z.string().min(10, 'Phone number must be at least 10 digits'),
        role: z.enum(['CUSTOMER', 'VENDOR', 'COURIER']).optional(),
      });

      const { phoneNumber, role } = schema.parse(data);

      // Validate phone number format
      if (!ValidationUtils.isValidPhone(phoneNumber)) {
        return ResponseUtils.error('Invalid phone number format', 400);
      }

      // Generate OTP
      const otp = AuthUtils.generateOTP();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Find or create user
      let user = await prisma.user.findFirst({
        where: { phone: phoneNumber },
      });

      if (!user) {
        // Create new user with phone authentication
        user = await prisma.user.create({
          data: {
            phone: phoneNumber,
            firstName: null,
            lastName: null,
            role: role || 'CUSTOMER',
            isVerified: false, // Will be set to true after OTP verification
          },
        });

        // Create role-specific profile
        if ((role || 'CUSTOMER') === 'CUSTOMER') {
          await prisma.customer.create({
            data: { userId: user.id },
          });
        }
      }

      // Store OTP
      await prisma.oTP.create({
        data: {
          phoneNumber,
          otp,
          userId: user.id,
          expiresAt,
        },
      });

      // Send SMS via Nalo
      const message = `Your TIZZI GAS verification code is: ${otp}. Valid for 10 minutes.`;
      const smsResult = await NaloSMSUtils.sendSMS(phoneNumber, message);

      if (!smsResult.success) {
        console.error('SMS sending failed:', smsResult.error);
        // Return error if SMS fails
        return ResponseUtils.error(
          `Failed to send OTP: ${smsResult.error || 'SMS service unavailable'}`,
          500
        );
      }

      return ResponseUtils.success({
        message: 'OTP sent successfully',
        phoneNumber,
        expiresIn: 600, // 10 minutes in seconds
      });

    } catch (error: unknown) {
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
      console.error('Send OTP error:', error);
      return ResponseUtils.error('Internal server error');
    }
  }

  static async verifyOTP(data: any) {
    try {
      const schema = z.object({
        phoneNumber: z.string().min(10, 'Phone number must be at least 10 digits'),
        otp: z.string().length(6, 'OTP must be 6 digits'),
      });

      const { phoneNumber, otp } = schema.parse(data);

      // Find the OTP record
      const otpRecord = await prisma.oTP.findFirst({
        where: {
          phoneNumber,
          otp,
          isUsed: false,
          expiresAt: {
            gt: new Date(),
          },
        },
        include: {
          user: {
            include: {
              customer: true,
              vendor: true,
              courier: true,
            },
          },
        },
      });

      if (!otpRecord) {
        return ResponseUtils.error('Invalid or expired OTP', 400);
      }

      // Mark OTP as used
      await prisma.oTP.update({
        where: { id: otpRecord.id },
        data: { isUsed: true },
      });

      // Update user's verification status and last login
      const updatedUser = await prisma.user.update({
        where: { id: otpRecord.userId },
        data: {
          isVerified: true,
          phone: phoneNumber,
          lastLogin: new Date(),
        },
        include: {
          customer: true,
          vendor: true,
          courier: true,
        },
      });

      // Generate JWT token
      const token = AuthUtils.generateToken({
        userId: updatedUser.id,
        phone: updatedUser.phone,
        role: updatedUser.role,
      });

      // Get profile data based on role
      let profileData = null;
      if (updatedUser.role === 'CUSTOMER') {
        profileData = updatedUser.customer;
      } else if (updatedUser.role === 'VENDOR') {
        profileData = updatedUser.vendor;
      } else if (updatedUser.role === 'COURIER') {
        profileData = updatedUser.courier;
      }

      return ResponseUtils.success({
        message: 'Authentication successful',
        user: {
          id: updatedUser.id,
          phone: updatedUser.phone,
          email: updatedUser.email, // Optional
          firstName: updatedUser.firstName,
          lastName: updatedUser.lastName,
          role: updatedUser.role,
          status: updatedUser.status,
          isVerified: updatedUser.isVerified,
          profileData,
        },
        token,
      });

    } catch (error: unknown) {
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
      console.error('OTP verification error:', error);
      return ResponseUtils.error('Internal server error');
    }
  }

  /**
   * Send email verification code
   */
  static async sendEmailVerification(data: any) {
    try {
      const schema = z.object({
        email: z.string().email('Invalid email address'),
        userId: z.string().optional(), // Optional - if not provided, will find by email
      });
      
      const { email, userId } = schema.parse(data);
      
      // Validate email format
      if (!ValidationUtils.isValidEmail(email)) {
        return ResponseUtils.error('Invalid email address format', 400);
      }
      
      // Find user - either by userId or by email
      let user;
      if (userId) {
        user = await prisma.user.findUnique({
          where: { id: userId },
        });
        
        if (!user) {
          return ResponseUtils.error('User not found', 404);
        }
        
        // If user doesn't have an email or has a different email, update it
        if (!user.email || user.email !== email) {
          user = await prisma.user.update({
            where: { id: userId },
            data: { 
              email, 
              isEmailVerified: false, // Reset verification status when email changes
            },
          });
        }
      } else {
        // Find user by email
        user = await prisma.user.findFirst({
          where: { email },
        });
        
        if (!user) {
          return ResponseUtils.error('No account found with this email address. Please provide userId to add email to your account.', 404);
        }
      }
      
      // Check if email is already verified
      if (user.email === email && user.isEmailVerified) {
        return ResponseUtils.error('Email is already verified', 400);
      }
      
      // Generate verification code
      const verificationCode = generateEmailVerificationCode();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
      
      // Store or update email verification record
      await prisma.emailVerification.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          email,
          code: verificationCode,
          expiresAt,
          attempts: 0,
        },
        update: {
          email,
          code: verificationCode,
          expiresAt,
          attempts: 0, // Reset attempts on new code
          isUsed: false,
          usedAt: null,
        },
      });
      
      // Send verification email
      const emailTemplate = createEmailVerificationTemplate({
        firstName: user.firstName || 'User',
        verificationCode,
        email,
      });
      
      const emailResult = await sendEmail(email, emailTemplate);
      
      if (!emailResult.success) {
        console.error('Email sending failed:', emailResult.error);
        return ResponseUtils.error(
          `Failed to send verification email: ${emailResult.error || 'Email service unavailable'}`,
          500
        );
      }
      
      return ResponseUtils.success({
        message: 'Verification email sent successfully',
        email,
        expiresIn: 900, // 15 minutes in seconds
      });
      
    } catch (error: unknown) {
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
      console.error('Send email verification error:', error);
      return ResponseUtils.error('Internal server error');
    }
  }

  /**
   * Verify email address with verification code
   */
  static async verifyEmail(data: any) {
    try {
      const schema = z.object({
        email: z.string().email('Invalid email address'),
        code: z.string().length(6, 'Verification code must be 6 digits'),
        userId: z.string().optional(), // Optional - if not provided, will find by email
      });
      
      const { email, code, userId } = schema.parse(data);
      
      // Find user
      let user;
      if (userId) {
        user = await prisma.user.findUnique({
          where: { id: userId },
        });
      } else {
        user = await prisma.user.findFirst({
          where: { email },
        });
      }
      
      if (!user) {
        return ResponseUtils.error('User not found', 404);
      }
      
      // Find email verification record
      const emailVerification = await prisma.emailVerification.findUnique({
        where: { userId: user.id },
      });
      
      if (!emailVerification) {
        return ResponseUtils.error('No verification code found. Please request a new verification code.', 404);
      }
      
      // Check if already used
      if (emailVerification.isUsed) {
        return ResponseUtils.error('This verification code has already been used. Please request a new one.', 400);
      }
      
      // Check if expired
      if (emailVerification.expiresAt < new Date()) {
        return ResponseUtils.error('Verification code has expired. Please request a new one.', 400);
      }
      
      // Check if email matches
      if (emailVerification.email !== email) {
        return ResponseUtils.error('Email address does not match the verification request.', 400);
      }
      
      // Verify code
      if (emailVerification.code !== code) {
        // Increment attempts
        await prisma.emailVerification.update({
          where: { id: emailVerification.id },
          data: { attempts: { increment: 1 } },
        });
        
        return ResponseUtils.error('Invalid verification code', 400);
      }
      
      // Mark as used and update user
      await prisma.$transaction(async (tx) => {
        // Mark verification as used
        await tx.emailVerification.update({
          where: { id: emailVerification.id },
          data: {
            isUsed: true,
            usedAt: new Date(),
          },
        });
        
        // Update user email and email verification status
        await tx.user.update({
          where: { id: user.id },
          data: {
            email,
            isEmailVerified: true, // Email is verified (separate from phone verification)
          },
        });
      });
      
      return ResponseUtils.success({
        message: 'Email verified successfully',
        email,
      });
      
    } catch (error: unknown) {
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
      console.error('Email verification error:', error);
      return ResponseUtils.error('Internal server error');
    }
  }

  static async refreshToken(data: any) {
    try {
      const schema = z.object({
        refreshToken: z.string(),
      });

      const { refreshToken } = schema.parse(data);

      // Verify refresh token
      const decoded = AuthUtils.verifyToken(refreshToken);

      // Find user
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
      });

      if (!user) {
        return ResponseUtils.error('User not found', 404);
      }

      // Generate new access token
      const token = AuthUtils.generateToken({
        userId: user.id,
        email: user.email || undefined,
        phone: user.phone || undefined,
        role: user.role,
      });

      return ResponseUtils.success({
        message: 'Token refreshed successfully',
        token,
      });

    } catch (error: unknown) {
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
      console.error('Refresh token error:', error);
      return ResponseUtils.error('Invalid refresh token', 401);
    }
  }
}
