# TIZZI GAS API - Catch-All Route Usage Guide

## Overview

Your TIZZI GAS backend now uses a single catch-all API route at `/api/[...api]` that handles all endpoints through the request body. This architecture provides better organization and allows for complex database queries through request parameters.

## Base URL Structure

All API requests should be sent to: `POST http://localhost:3000/api/[...api]`

## Request Format

```json
{
  "action": "service.method",
  "data": {
    // Main data payload
  },
  "query": {
    // Search/query parameters
  },
  "filters": {
    // Filter parameters
  },
  "pagination": {
    "page": 1,
    "limit": 10
  },
  "sorting": {
    "field": "createdAt",
    "order": "desc"
  }
}
```

## Authentication

For protected endpoints, include the JWT token in the Authorization header:
```
Authorization: Bearer YOUR_JWT_TOKEN
```

## Available Actions

### Authentication Services

#### 1. User Login
```json
{
  "action": "auth.login",
  "data": {
    "email": "user@example.com", // OR phone
    "phone": "+233123456789",   // OR email
    "password": "password123"
  }
}
```

#### 2. User Registration
```json
{
  "action": "auth.register",
  "data": {
    "email": "user@example.com",
    "phone": "+233123456789",
    "password": "password123",
    "firstName": "John",
    "lastName": "Doe",
    "role": "CUSTOMER" // or VENDOR, COURIER
  }
}
```

#### 3. Send OTP
```json
{
  "action": "auth.send-otp",
  "data": {
    "phoneNumber": "+233123456789"
  }
}
```

#### 4. Verify OTP
```json
{
  "action": "auth.verify-otp",
  "data": {
    "phoneNumber": "+233123456789",
    "otp": "123456"
  }
}
```

#### 5. Social Login
```json
{
  "action": "auth.social-login",
  "data": {
    "provider": "google", // google, facebook, apple
    "providerId": "google_user_id",
    "email": "user@gmail.com",
    "firstName": "John",
    "lastName": "Doe",
    "avatar": "https://avatar-url.com",
    "role": "CUSTOMER"
  }
}
```

### User Management

#### 6. Get User Profile
```json
{
  "action": "user.profile"
}
```

#### 7. Update User Profile
```json
{
  "action": "user.update-profile",
  "data": {
    "firstName": "Updated Name",
    "lastName": "Updated Surname",
    "email": "updated@email.com"
  }
}
```

#### 8. Search Users (Admin/Complex Queries)
```json
{
  "action": "user.search",
  "query": {
    "search": "john"
  },
  "filters": {
    "role": "CUSTOMER"
  },
  "pagination": {
    "page": 1,
    "limit": 20
  },
  "sorting": {
    "field": "createdAt",
    "order": "desc"
  }
}
```

### Vendor Services

#### 9. List Vendors
```json
{
  "action": "vendor.list",
  "filters": {
    "isActive": true
  },
  "pagination": {
    "page": 1,
    "limit": 10
  }
}
```

#### 10. Get Vendor Details
```json
{
  "action": "vendor.details",
  "data": {
    "vendorId": "vendor_uuid"
  }
}
```

#### 11. Get Nearby Vendors
```json
{
  "action": "vendor.nearby",
  "data": {
    "latitude": 5.603717,
    "longitude": -0.186964,
    "radius": 10 // in kilometers
  }
}
```

#### 12. Search Vendors
```json
{
  "action": "vendor.search",
  "query": {
    "search": "gas station"
  },
  "filters": {
    "city": "Accra"
  },
  "pagination": {
    "page": 1,
    "limit": 10
  }
}
```

#### 13. Update Vendor Profile (Vendor only)
```json
{
  "action": "vendor.update-profile",
  "data": {
    "businessName": "Updated Gas Station",
    "description": "Updated description",
    "phone1": "+233123456789",
    "latitude": 5.603717,
    "longitude": -0.186964,
    "address": "Updated Address",
    "city": "Accra",
    "pricePerKg": 15.50
  }
}
```

### Order Management

#### 14. Create Order
```json
{
  "action": "order.create",
  "data": {
    "vendorId": "vendor_uuid",
    "cylinderType": "14.5kg",
    "weight": 14.5,
    "volume": "14.5kg",
    "amount": 150.00,
    "customerLat": 5.603717,
    "customerLng": -0.186964,
    "customerAddr": "Customer Address",
    "notes": "Please call when you arrive"
  }
}
```

#### 15. Get Orders
```json
{
  "action": "order.list",
  "filters": {
    "status": "PENDING"
  },
  "pagination": {
    "page": 1,
    "limit": 10
  },
  "sorting": {
    "field": "createdAt",
    "order": "desc"
  }
}
```

#### 16. Get Order Details
```json
{
  "action": "order.details",
  "data": {
    "orderId": "order_uuid"
  }
}
```

#### 17. Update Order Status
```json
{
  "action": "order.update-status",
  "data": {
    "orderId": "order_uuid",
    "status": "CONFIRMED"
  }
}
```

#### 18. Search Orders (Complex Query)
```json
{
  "action": "order.search",
  "query": {
    "dateFrom": "2024-01-01",
    "dateTo": "2024-12-31"
  },
  "filters": {
    "status": "DELIVERED",
    "amount_gte": 100,
    "amount_lte": 500
  },
  "pagination": {
    "page": 1,
    "limit": 20
  },
  "sorting": {
    "field": "amount",
    "order": "desc"
  }
}
```

### Courier Services

#### 19. Get Courier Profile
```json
{
  "action": "courier.profile"
}
```

#### 20. Update Courier Location
```json
{
  "action": "courier.location",
  "data": {
    "latitude": 5.603717,
    "longitude": -0.186964
  }
}
```

#### 21. Toggle Availability
```json
{
  "action": "courier.available",
  "data": {
    "available": true
  }
}
```

### Notifications

#### 22. Get Notifications
```json
{
  "action": "notification.list",
  "pagination": {
    "page": 1,
    "limit": 20
  }
}
```

#### 23. Mark Notification as Read
```json
{
  "action": "notification.mark-read",
  "data": {
    "notificationId": "notification_uuid"
  }
}
```

### Analytics & Complex Queries

#### 24. Dashboard Analytics
```json
{
  "action": "analytics.dashboard",
  "filters": {
    "dateFrom": "2024-01-01",
    "dateTo": "2024-12-31"
  },
  "query": {
    "includeGraphData": true
  }
}
```

#### 25. Custom Database Query
```json
{
  "action": "query.custom",
  "query": {
    "table": "orders",
    "aggregation": "sum",
    "field": "amount",
    "groupBy": ["status", "createdAt"]
  },
  "filters": {
    "status_in": ["DELIVERED", "CONFIRMED"],
    "createdAt_gte": "2024-01-01"
  }
}
```

## Response Format

All responses follow this consistent format:

### Success Response
```json
{
  "success": true,
  "message": "Operation successful",
  "data": {
    // Response data
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Error Response
```json
{
  "success": false,
  "message": "Error message",
  "statusCode": 400,
  "errors": [
    {
      "field": "email",
      "message": "Invalid email format"
    }
  ],
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Benefits of This Architecture

1. **Single Endpoint**: All API calls go through one route
2. **Complex Queries**: Support for advanced filtering, pagination, sorting
3. **Consistent Format**: All requests/responses follow the same structure
4. **Scalable**: Easy to add new actions without creating new routes
5. **Type Safety**: Better TypeScript support with structured data
6. **Prisma Integration**: Optimized for complex database queries

## Usage in Flutter/Mobile App

```dart
// Example Flutter usage
Future<Map<String, dynamic>> apiCall(String action, Map<String, dynamic> data) async {
  final response = await http.post(
    Uri.parse('$baseUrl/api/catch-all'),
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer $token',
    },
    body: jsonEncode({
      'action': action,
      'data': data,
    }),
  );
  
  return jsonDecode(response.body);
}

// Login example
final result = await apiCall('auth.login', {
  'email': 'user@example.com',
  'password': 'password123',
});
```

This architecture provides maximum flexibility for your Flutter app while maintaining clean, organized backend code.
