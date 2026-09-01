# Social Login Implementation Guide

## Overview

Social login has been successfully added to the Tizzi Gas backend system. This allows users to authenticate using Google, Facebook, or Apple accounts.

## Database Schema

### SocialLogin Model
```prisma
model SocialLogin {
  id           String        @id @default(cuid())
  userId       String
  provider     SocialProvider
  providerId   String        // The ID from the social provider
  providerData Json?         // Additional data from the provider
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt

  // Relations
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerId])
  @@map("social_logins")
}

enum SocialProvider {
  GOOGLE
  FACEBOOK
  APPLE
}
```

### User Model Updates
```prisma
model User {
  // ... existing fields
  socialLogins SocialLogin[]
  // ... rest of the model
}
```

## API Implementation

### Social Login Endpoint

**Endpoint**: `POST /api/auth`  
**Action**: `social-login`

**Request Body**:
```json
{
  "action": "social-login",
  "provider": "GOOGLE|FACEBOOK|APPLE",
  "providerId": "string",
  "email": "string",
  "firstName": "string",
  "lastName": "string",
  "providerData": {
    // Additional data from the social provider (optional)
  }
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "message": "Social login successful",
    "user": {
      "id": "string",
      "email": "string",
      "firstName": "string",
      "lastName": "string",
      "role": "string",
      "status": "string",
      "isVerified": boolean
    },
    "token": "jwt-token",
    "isNewUser": boolean
  }
}
```

## Service Implementation

The `AuthService.socialLogin()` method handles:

1. **Provider Validation**: Validates the social provider type
2. **User Lookup**: Checks if a social login record exists
3. **Account Linking**: Links existing email accounts with social logins
4. **New User Creation**: Creates new users for first-time social logins
5. **JWT Token Generation**: Returns authentication token
6. **Profile Data**: Retrieves complete user profile information

### Key Features

- **Automatic Account Linking**: If a user exists with the same email, the social login is linked to that account
- **New User Registration**: Creates new users automatically for first-time social logins
- **Provider Data Storage**: Stores additional provider data for future use
- **Security**: Uses JWT tokens for authentication
- **Duplicate Prevention**: Prevents duplicate social login records

## Environment Configuration

Add these variables to your `.env` file:

```env
# Social Authentication
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"

FACEBOOK_CLIENT_ID="your-facebook-client-id"
FACEBOOK_CLIENT_SECRET="your-facebook-client-secret"

APPLE_ID="your-apple-id"
APPLE_SECRET="your-apple-secret"
```

## Frontend Integration

### Google Sign-In Example
```javascript
// After Google authentication in your Flutter app
const response = await fetch('/api/auth', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    action: 'social-login',
    provider: 'GOOGLE',
    providerId: googleUser.id,
    email: googleUser.email,
    firstName: googleUser.given_name,
    lastName: googleUser.family_name,
    providerData: {
      picture: googleUser.picture,
      locale: googleUser.locale
    }
  })
});
```

### Facebook Sign-In Example
```javascript
// After Facebook authentication in your Flutter app
const response = await fetch('/api/auth', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    action: 'social-login',
    provider: 'FACEBOOK',
    providerId: facebookUser.id,
    email: facebookUser.email,
    firstName: facebookUser.first_name,
    lastName: facebookUser.last_name,
    providerData: {
      picture: facebookUser.picture.data.url
    }
  })
});
```

## Error Handling

The social login implementation includes comprehensive error handling:

- **Validation Errors**: Invalid provider or missing required fields
- **Database Errors**: Connection issues or constraint violations
- **Authentication Errors**: Invalid provider credentials
- **Server Errors**: Unexpected errors with proper logging

## Security Considerations

1. **Token Validation**: Always validate tokens from social providers on the server side
2. **Provider Verification**: Verify the user data comes from the claimed provider
3. **Rate Limiting**: Implement rate limiting on social login endpoints
4. **Data Privacy**: Only store necessary user data and respect privacy settings
5. **HTTPS Only**: Ensure all social login endpoints use HTTPS in production

## Testing

To test social login:

1. **Start the Server**: `npm run dev`
2. **Set up Database**: Follow the DATABASE_SETUP.md guide
3. **Configure Providers**: Add your social provider credentials to `.env`
4. **Test the Endpoint**: Use the examples above or integrate with your Flutter app

## Next Steps

1. **Database Migration**: Complete the database setup to enable social login functionality
2. **Provider Setup**: Configure Google, Facebook, and Apple developer accounts
3. **Frontend Integration**: Implement social login buttons in your Flutter app
4. **Testing**: Test the complete flow from Flutter to backend
5. **Production Setup**: Configure production social provider credentials
