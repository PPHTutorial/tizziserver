# TIZZI GAS API Documentation

## Overview
This is the backend API for the TIZZI GAS delivery application built with Next.js, TypeScript, Prisma ORM, and PostgreSQL.

## Authentication
All protected endpoints require a Bearer token in the Authorization header:
```
Authorization: Bearer <jwt_token>
```

## API Endpoints

### Authentication Endpoints

#### POST /api/auth/register
Register a new user (customer, vendor, or courier)
```json
{
  "email": "user@example.com",
  "password": "password123",
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+233123456789",
  "role": "CUSTOMER" // or "VENDOR", "COURIER"
}
```

#### POST /api/auth/login
Login with email/phone and password
```json
{
  "identifier": "user@example.com", // email or phone
  "password": "password123"
}
```

#### POST /api/auth/social-login
Login/register with social providers (Google, Facebook, Apple)
```json
{
  "provider": "GOOGLE",
  "providerAccountId": "google_user_id",
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "avatar": "https://example.com/avatar.jpg",
  "role": "CUSTOMER"
}
```

#### POST /api/auth/send-otp
Send OTP for phone verification (uses Nalo Solutions SMS)
```json
{
  "phoneNumber": "+233123456789",
  "userId": "user_id_here"
}
```

#### POST /api/auth/verify-otp
Verify phone number with OTP
```json
{
  "phoneNumber": "+233123456789",
  "otp": "123456"
}
```

### Notification Endpoints

#### POST /api/notifications
Send notifications to users (requires ADMIN role)
```json
{
  "recipients": ["user_id_1", "user_id_2"],
  "type": "ORDER_UPDATE",
  "title": "Order Update",
  "message": "Your order has been confirmed",
  "data": { "orderId": "order_123" },
  "sendSMS": true,
  "sendPush": true
}
```

#### PUT /api/notifications
Send bulk SMS (requires ADMIN or VENDOR role)
```json
{
  "phoneNumbers": ["+233123456789", "+233987654321"],
  "message": "Special offer: 20% off on all gas cylinders today!"
}
```

#### GET /api/notifications
Get Nalo SMS account balance (requires ADMIN role)
- Headers: `Authorization: Bearer <token>`

### Vendor Endpoints

#### GET /api/vendor/profile
Get vendor profile (requires VENDOR role)
- Headers: `Authorization: Bearer <token>`

#### PUT /api/vendor/profile
Update vendor profile (requires VENDOR role)
```json
{
  "businessName": "Gas Station Name",
  "description": "Best gas station in town",
  "phone1": "+233123456789",
  "latitude": 5.6037,
  "longitude": -0.1870,
  "address": "123 Main Street",
  "city": "Accra",
  "region": "Greater Accra",
  "country": "Ghana",
  "pricePerKg": 15.50
}
```

#### POST /api/vendors
Search for nearby vendors
```json
{
  "latitude": 5.6037,
  "longitude": -0.1870,
  "radius": 10,
  "limit": 20,
  "sortBy": "distance"
}
```

#### GET /api/vendors?id=vendor_id
Get vendor details by ID

### Courier Endpoints

#### GET /api/courier/profile
Get courier profile (requires COURIER role)
- Headers: `Authorization: Bearer <token>`

#### PUT /api/courier/profile
Update courier profile (requires COURIER role)
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "phone1": "+233123456789",
  "country": "Ghana",
  "address": "123 Main Street",
  "city": "Accra",
  "region": "Greater Accra",
  "vehicleType": "MOTORCYCLE",
  "licensePlate": "GR-1234-20",
  "licenseNumber": "DL123456",
  "vehicleMake": "Honda",
  "vehicleModel": "CBR",
  "vehicleColor": "Red"
}
```

#### PATCH /api/courier/profile
Update courier location
```json
{
  "latitude": 5.6037,
  "longitude": -0.1870
}
```

### Order Endpoints

#### POST /api/orders
Create new order (requires CUSTOMER role)
```json
{
  "vendorId": "vendor_id_here",
  "cylinderType": "Cooking Gas",
  "weight": 18,
  "volume": "18kg",
  "customerLat": 5.6037,
  "customerLng": -0.1870,
  "customerAddr": "123 Customer Street",
  "notes": "Handle with care",
  "paymentMethod": "CASH"
}
```

#### GET /api/orders
Get orders (filtered by user role)
- Query params: `status`, `limit`, `offset`
- Headers: `Authorization: Bearer <token>`

#### PUT /api/orders?id=order_id
Update order status
```json
{
  "status": "CONFIRMED",
  "notes": "Order confirmed",
  "courierLocation": {
    "latitude": 5.6037,
    "longitude": -0.1870
  }
}
```

## Data Models

### User Roles
- `CUSTOMER`: End users who order gas
- `VENDOR`: Gas station owners
- `COURIER`: Delivery personnel
- `ADMIN`: System administrators (future)

### Order Status Flow
1. `PENDING` - Order created, waiting for vendor confirmation
2. `CONFIRMED` - Vendor confirmed the order
3. `COURIER_ASSIGNED` - Courier assigned to the order
4. `COURIER_ARRIVED` - Courier arrived at vendor location
5. `IN_PROGRESS` - Order being prepared/loaded
6. `COURIER_RETURNING` - Courier en route to customer
7. `DELIVERED` - Order successfully delivered
8. `CANCELLED` - Order cancelled
9. `REFUNDED` - Order refunded

### Payment Methods
- `CASH` - Cash on delivery
- `CARD` - Credit/debit card
- `MOBILE_MONEY` - Mobile money (MTN, Vodafone, etc.)
- `WALLET` - Digital wallet

## Environment Variables
Create a `.env` file with the following variables:
```
DATABASE_URL="postgresql://username:password@localhost:5432/tizzigas"
JWT_SECRET="your-secret-key-here"
TWILIO_ACCOUNT_SID="your-twilio-account-sid"
TWILIO_AUTH_TOKEN="your-twilio-auth-token"
TWILIO_PHONE_NUMBER="your-twilio-phone-number"
```

## Running the Application

### Development
```bash
npm run dev
```

### Production Build
```bash
npm run build
npm start
```

### Database Setup
```bash
npx prisma generate
npx prisma db push
```

## Error Handling
All API responses follow this format:

### Success Response
```json
{
  "success": true,
  "message": "Operation successful",
  "data": { ... },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Error Response
```json
{
  "success": false,
  "message": "Error message",
  "statusCode": 400,
  "errors": [ ... ],
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Flutter Integration
This API is designed to work with your existing Flutter mobile application. Simply update your HTTP service to point to these endpoints and handle the JSON responses accordingly.
