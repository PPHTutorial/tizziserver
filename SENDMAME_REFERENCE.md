# SendMame Project - Reference Documentation

This document provides a comprehensive reference of the sendmame project's architecture, patterns, and utilities that can be implemented in the tizziserver project.

## 📋 Table of Contents
1. [Database Schema Patterns](#database-schema-patterns)
2. [API Route Patterns](#api-route-patterns)
3. [Utility Functions](#utility-functions)
4. [Authentication & Authorization](#authentication--authorization)
5. [Validation Patterns](#validation-patterns)
6. [Service Layer Patterns](#service-layer-patterns)
7. [Key Features & Implementations](#key-features--implementations)

---

## Database Schema Patterns

### Key Models in SendMame
- **User**: Comprehensive user model with verification flags, subscription info, referral codes
- **UserProfile**: Extended profile with ratings, preferences, location
- **Package**: Package delivery with JSON address fields, status tracking
- **Trip**: Traveler trips with route information
- **Review**: Unified review system (giver/receiver pattern)
- **Wallet**: Financial wallet with balance tracking
- **Transaction**: Payment transactions with type, status, fees
- **Chat/Message**: Communication system
- **VerificationDocument**: KYC verification documents
- **Notification**: User notifications
- **Dispute**: Dispute resolution system
- **SafetyConfirmation**: Safety confirmations for assignments

### Notable Patterns
- **Polymorphic Relations**: Uses JSON fields for flexible data (addresses, dimensions)
- **Verification System**: Multiple verification flags (email, phone, ID, facial, address)
- **Subscription System**: Built-in subscription tiers and status tracking
- **Referral System**: Referral codes with referrer tracking
- **Rating System**: Separate senderRating and travelerRating in UserProfile
- **Soft Deletes**: Uses `deletedAt` timestamps
- **Status Enums**: Comprehensive status enums for all entities

---

## API Route Patterns

### Standard API Route Structure
```typescript
import { NextRequest } from 'next/server'
import {
  createSuccessResponse,
  withErrorHandling,
  parseRequestBody,
  parseSearchParams,
  calculatePagination,
  buildWhereClause,
} from '@/lib/api/utils'
import { requireAuth } from '@/lib/auth'

// GET endpoint with pagination and filtering
export const GET = withErrorHandling(async (request: NextRequest) => {
  const searchParams = parseSearchParams(request, schema)
  const { page, limit, ...filters } = searchParams
  const { skip, ...pagination } = calculatePagination(page, limit, 0)
  
  const where = buildWhereClause(filters, 'modelType')
  const total = await prisma.model.count({ where })
  const items = await prisma.model.findMany({ where, skip, take: limit })
  
  return createSuccessResponse(items, undefined, { ...pagination, total })
})

// POST endpoint with authentication
export const POST = withErrorHandling(async (request: NextRequest) => {
  const userPayload = await requireAuth(request)
  const data = await parseRequestBody(request, createSchema)
  
  const item = await prisma.model.create({ data: { ...data, userId: userPayload.userId } })
  return createSuccessResponse(item, 'Item created successfully')
})
```

### Key Features
- **Error Handling**: Wrapped with `withErrorHandling`
- **Authentication**: Uses `requireAuth` middleware
- **Validation**: Zod schemas with `parseRequestBody` and `parseSearchParams`
- **Pagination**: Standardized pagination with `calculatePagination`
- **Filtering**: Dynamic filtering with `buildWhereClause`
- **Response Format**: Consistent `createSuccessResponse` / `createErrorResponse`

---

## Utility Functions

### API Utilities (`lib/api/utils.ts`)
- `createSuccessResponse<T>(data, message?, pagination?)`: Standardized success responses
- `createErrorResponse(error, statusCode?)`: Standardized error responses
- `validateRequestBody<T>(schema, data)`: Zod validation helper
- `parseRequestBody<T>(request, schema?)`: Parse and validate request body
- `parseSearchParams(request, schema?)`: Parse query parameters with type conversion
- `withErrorHandling(handler)`: Error handling wrapper
- `withAuth(handler, options)`: Authentication middleware wrapper
- `withRateLimit(handler, options)`: Rate limiting wrapper
- `withCors(handler, options)`: CORS wrapper
- `calculatePagination(page, limit, total)`: Pagination calculations
- `buildWhereClause(filters, modelType?)`: Dynamic Prisma where clause builder
- `buildLocationFilter(latitude, longitude, radiusKm)`: Location-based filtering
- `handleFileUpload(request, options)`: File upload handler

### Custom Error Classes
- `ApiError`: Base API error class
- `ValidationApiError`: Validation error with details

### Database Service (`lib/database-service.ts`)
- `DatabaseService.getDashboardMetrics()`: Comprehensive dashboard metrics
- `DatabaseService.getUserMetrics()`: User analytics
- `DatabaseService.getPackageMetrics()`: Package analytics
- `DatabaseService.getTransactionMetrics()`: Transaction analytics
- `DatabaseService.getRecentActivity(limit)`: Recent activity feed

**Key Metrics Calculated:**
- User counts by role, verification status, growth
- Package counts by status, revenue, value
- Transaction volumes, success rates, breakdowns
- Review counts, rating distributions
- Verification document statuses
- Dispute statistics
- And many more...

---

## Authentication & Authorization

### Auth Utilities (`lib/auth.ts`)
- `createAccessToken(payload)`: JWT access token creation
- `createRefreshToken(userId)`: JWT refresh token creation
- `verifyToken(token)`: Token verification
- `setAuthCookies(accessToken, refreshToken)`: Set HTTP-only cookies
- `clearAuthCookies()`: Clear auth cookies
- `requireAuth(request)`: Middleware to require authentication
- `requireRole(role, allowedRoles)`: Role-based access control
- `hashPassword(password)`: Password hashing
- `verifyPassword(password, hashedPassword)`: Password verification
- `validatePasswordStrength(password)`: Password strength validation
- `checkAuthRateLimit(key)`: Rate limiting for auth endpoints
- `resetAuthRateLimit(key)`: Reset rate limit

### Token Configuration
- Access Token: 7 days expiry
- Refresh Token: 7 days expiry
- Uses JOSE library for JWT
- Secure, HTTP-only cookies
- Bearer token support in Authorization header

### Auth Providers
- Email/Password
- Phone Auth
- Google OAuth
- Facebook OAuth
- Apple OAuth

---

## Validation Patterns

### Zod Schemas (`lib/validations/index.ts`)
- **Authentication**: `loginSchema`, `registerSchema`, `forgotPasswordSchema`, `resetPasswordSchema`
- **Address**: `addressSchema` with coordinates
- **Package**: `createPackageSchema`, `updatePackageSchema`, `packageSearchSchema`
- **Trip**: `createTripSchema`, `updateTripSchema`
- **User Profile**: `updateProfileSchema`
- **Chat**: `createChatSchema`, `sendMessageSchema`
- **Review**: `createReviewSchema`
- **Assignment**: `createAssignmentSchema`, `safetyConfirmationsSchema`

### Validation Features
- Type-safe with Zod
- Custom error messages
- Date validation (future dates)
- Password strength requirements
- Email format validation
- Phone number validation
- JSON field validation (addresses, dimensions)

---

## Service Layer Patterns

### Subscription Service (`lib/subscription.ts`)
- `checkSubscriptionStatus(userId)`: Check user subscription status
- `canUserPost(userId)`: Check if user can create posts
- `getRemainingPosts(user)`: Calculate remaining posts
- `shouldUpdateSubscription(user)`: Check if subscription expired

### Verification Utilities (`lib/verification-utils.ts`)
- `updateOverallVerificationStatus(userId, tx?)`: Update verification flags
- `getVerificationProgress(userId)`: Get verification completion status
- `VerificationTypes`: Enum for verification types

### SMS Service (`lib/services/sms-service.ts`)
- Phone verification
- SMS code sending
- Code verification

### Google Places Service (`lib/services/googlePlaces.ts`)
- Place search
- Geocoding
- Autocomplete

---

## Key Features & Implementations

### 1. Subscription System
- **Tiers**: FREE, BASIC, PREMIUM, ENTERPRISE
- **Features**: Post limits per tier, expiration tracking
- **Status**: ACTIVE, INACTIVE, EXPIRED
- **Payment Integration**: Stripe integration
- **Post Limits**: Tracks remaining posts per subscription period

### 2. Verification System
- **Types**: Email, Phone, ID, Facial, Address
- **Status**: PENDING, VERIFIED, REJECTED
- **Documents**: VerificationDocument model with metadata
- **Progress Tracking**: Percentage completion
- **Requirements**: Can require all verifications before posting

### 3. Review System
- **Structure**: Giver/receiver pattern (not polymorphic)
- **Categories**: delivery, communication, reliability
- **Ratings**: 1-5 stars
- **Aggregation**: Separate senderRating and travelerRating in UserProfile
- **Uniqueness**: One review per user per package

### 4. Financial System
- **Wallet**: Balance tracking with pending amounts
- **Transactions**: Comprehensive transaction tracking
- **Payment Methods**: Stripe integration
- **Fees**: Platform fees, gateway fees, net amount calculation
- **Status Tracking**: PENDING, PROCESSING, COMPLETED, FAILED, REFUNDED

### 5. Communication System
- **Chats**: Package/trip related chats
- **Messages**: Text, image, file, location, system messages
- **Participants**: ChatParticipant model
- **Read Tracking**: Read-by tracking in messages

### 6. Notification System
- **Types**: PACKAGE_MATCH, TRIP_REQUEST, PAYMENT_RECEIVED, etc.
- **Delivery**: Email, SMS, Push notifications
- **Tracking**: Read/unread status, sent timestamps
- **Metadata**: JSON metadata for flexible data

### 7. Dispute System
- **Types**: non_delivery, damaged_package, payment_issue
- **Status**: OPEN, IN_REVIEW, RESOLVED, CLOSED
- **Evidence**: File uploads for evidence
- **Resolution**: Admin resolution tracking

### 8. Safety Confirmations
- **Types**: ASSIGNMENT, PICKUP, DELIVERY
- **Confirmations**: Legal compliance, damage inspection, etc.
- **JSON Storage**: Flexible confirmation data

### 9. Tracking Events
- **Status**: MATCHED, ASSIGNED, PENDING, PICKED_UP, IN_TRANSIT, DELIVERED, EXCEPTION
- **Location**: JSON location data
- **Metadata**: Additional tracking metadata

### 10. Location & Address Handling
- **Format**: JSON address objects with full address details
- **Coordinates**: Separate latitude/longitude fields
- **Search**: Location-based filtering with radius
- **Geocoding**: Google Places integration

---

## Implementation Guidelines

### When Adding New Features:

1. **Database Schema**: Add to Prisma schema with proper enums and relations
2. **Validation**: Create Zod schemas in `lib/validations/index.ts`
3. **API Route**: Create route handler with error handling and auth
4. **Service Layer**: Add business logic in service files if needed
5. **Utilities**: Extract reusable functions to utility files
6. **Metrics**: Add to DatabaseService if dashboard metrics needed

### Best Practices:
- Always use `withErrorHandling` wrapper
- Validate all inputs with Zod
- Use `requireAuth` for protected routes
- Follow consistent response format
- Use transactions for multi-step operations
- Implement proper error messages
- Add rate limiting where appropriate
- Use soft deletes (deletedAt) when possible
- Track audit logs for important actions

---

## Key File Locations

### Core Files
- `prisma/schema.prisma` - Database schema
- `lib/api/utils.ts` - API utilities
- `lib/auth.ts` - Authentication utilities
- `lib/database-service.ts` - Database service layer
- `lib/utils.ts` - General utilities
- `lib/validations/index.ts` - Validation schemas

### API Routes
- `app/api/auth/*` - Authentication endpoints
- `app/api/packages/*` - Package endpoints
- `app/api/trips/*` - Trip endpoints
- `app/api/users/*` - User endpoints
- `app/api/dashboard/*` - Dashboard/metrics endpoints

### Services
- `lib/services/sms-service.ts` - SMS service
- `lib/services/googlePlaces.ts` - Google Places integration
- `lib/subscription.ts` - Subscription management
- `lib/verification-utils.ts` - Verification utilities

---

## Notes for Tizziserver Implementation

### Differences to Consider:
1. **Tizziserver uses catch-all API route** (`app/api/[...api]/route.ts`) instead of separate route files
2. **Tizziserver has unified Review model** (polymorphic) vs sendmame's giver/receiver pattern
3. **Tizziserver uses service classes** (VendorService, CourierService) vs sendmame's direct Prisma calls in routes
4. **Tizziserver uses action-based routing** in catch-all route vs REST endpoints

### What Can Be Adapted:
- ✅ Utility functions (error handling, validation, pagination)
- ✅ Database service patterns for metrics
- ✅ Authentication patterns
- ✅ Validation schemas
- ✅ Subscription/verification logic
- ✅ File upload handling
- ✅ Location-based filtering
- ✅ Rate limiting patterns

### Adaptation Strategy:
When implementing features from sendmame:
1. Adapt utility functions to work with tizziserver's catch-all route pattern
2. Integrate service layer patterns into existing service classes
3. Adapt validation schemas to match tizziserver's data models
4. Use polymorphic Review model instead of giver/receiver pattern
5. Maintain tizziserver's action-based routing structure

---

*Last Updated: Based on sendmame project scan*
*This document serves as a reference for implementing similar features in tizziserver*

