import { z } from 'zod'

export const UserRoles = {
  CUSTOMER: 'CUSTOMER',
  VENDOR: 'VENDOR',
  COURIER: 'COURIER',
  ADMIN: 'ADMIN',
} as const

export const OrderStatuses = {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  COURIER_ASSIGNED: 'COURIER_ASSIGNED',
  COURIER_ARRIVED: 'COURIER_ARRIVED',
  IN_PROGRESS: 'IN_PROGRESS',
  COURIER_RETURNING: 'COURIER_RETURNING',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
  REFUNDED: 'REFUNDED',
} as const

export const PaymentStatuses = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED',
} as const

export const VehicleTypes = {
  MOTORCYCLE: 'MOTORCYCLE',
  CAR: 'CAR',
  VAN: 'VAN',
  TRUCK: 'TRUCK',
} as const

export const SocialProviders = {
  GOOGLE: 'GOOGLE',
  FACEBOOK: 'FACEBOOK',
  APPLE: 'APPLE',
} as const

// Validation Schemas
// Note: loginSchema and registerSchema removed - phone OTP is the only authentication method
// Use sendOTP and verifyOTP for authentication

export const otpSchema = z.object({
  phone: z.string(),
  otp: z.string().length(6),
})

export const vendorSchema = z.object({
  businessName: z.string().min(2),
  description: z.string().optional(),
  website: z.string().url().optional(),
  phone1: z.string(),
  phone2: z.string().optional(),
  email: z.string().email().optional(),
  latitude: z.number(),
  longitude: z.number(),
  address: z.string(),
  city: z.string(),
  region: z.string(),
  country: z.string(),
  pricePerKg: z.number().positive(),
  currency: z.string().default('GHS'),
})

export const courierSchema = z.object({
  firstName: z.string().min(2),
  middleName: z.string().optional(),
  lastName: z.string().min(2),
  phone1: z.string(),
  phone2: z.string().optional(),
  email: z.string().email().optional(),
  country: z.string(),
  address: z.string(),
  city: z.string(),
  region: z.string(),
  town: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  vehicleType: z.enum(['MOTORCYCLE', 'CAR', 'VAN', 'TRUCK']),
  licensePlate: z.string(),
  licenseNumber: z.string(),
  vehicleMake: z.string(),
  vehicleModel: z.string(),
  vehicleColor: z.string(),
})

export const orderSchema = z.object({
  vendorId: z.string(),
  cylinderType: z.string(),
  weight: z.number().positive(),
  volume: z.string(),
  amount: z.number().positive(),
  customerLat: z.number(),
  customerLng: z.number(),
  customerAddr: z.string(),
  notes: z.string().optional(),
})

export const customerSchema = z.object({
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  region: z.string().optional(),
  country: z.string().optional(),
})
