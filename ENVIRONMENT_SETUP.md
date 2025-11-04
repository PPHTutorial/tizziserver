# Environment Setup Guide

## Required Environment Variables

Create a `.env.local` file in the server root directory with the following variables:

### Database Configuration
```bash
# PostgreSQL Database URL
DATABASE_URL="postgresql://username:password@localhost:5432/tizzigas_db"
```

### JWT Authentication
```bash
# JWT Secret for token signing (use a secure random string)
JWT_SECRET="your-super-secure-jwt-secret-key-here"

# JWT Expiration (default: 7 days)
JWT_EXPIRES_IN="7d"

# Refresh Token Expiration (default: 30 days)
JWT_REFRESH_EXPIRES_IN="30d"
```

### Nalo Solutions SMS Configuration
```bash
# Nalo Solutions API Key (get from Nalo Solutions dashboard)
NALO_API_KEY="your-nalo-api-key-here"

# Nalo Solutions Sender ID (your registered sender name)
NALO_SENDER_ID="TIZZIGAS"

# Nalo Solutions API Base URL (default: https://api.nalosolutions.com)
NALO_API_URL="https://api.nalosolutions.com"
```

### Google OAuth (Optional)
```bash
# Google OAuth Client ID
GOOGLE_CLIENT_ID="your-google-client-id"

# Google OAuth Client Secret
GOOGLE_CLIENT_SECRET="your-google-client-secret"
```

### Facebook OAuth (Optional)
```bash
# Facebook App ID
FACEBOOK_APP_ID="your-facebook-app-id"

# Facebook App Secret
FACEBOOK_APP_SECRET="your-facebook-app-secret"
```

### File Upload Configuration (Optional)
```bash
# Maximum file size for uploads (in bytes)
MAX_FILE_SIZE="5242880"  # 5MB

# Allowed file types for uploads
ALLOWED_FILE_TYPES="image/jpeg,image/png,image/gif,image/webp"
```

### API Rate Limiting (Optional)
```bash
# Rate limit per IP (requests per minute)
RATE_LIMIT_RPM="100"

# Rate limit for SMS endpoints (requests per hour)
SMS_RATE_LIMIT_RPH="10"
```

## Getting Nalo Solutions Credentials

1. **Create Account**: Visit [Nalo Solutions](https://nalosolutions.com) and create an account
2. **Verify Account**: Complete the verification process with your business documents
3. **Get API Key**: Navigate to the API section in your dashboard to get your API key
4. **Register Sender ID**: Register your sender ID (e.g., "TIZZIGAS") for SMS sending
5. **Top Up Account**: Add credits to your account for SMS sending

## Database Setup

1. **Install PostgreSQL**: Install PostgreSQL on your system
2. **Create Database**: Create a new database named `tizzigas_db`
3. **Run Migrations**: Execute `npx prisma migrate dev` to create tables
4. **Seed Data**: Run `npx prisma db seed` to populate initial data

## Development vs Production

### Development (.env.local)
```bash
NODE_ENV="development"
DATABASE_URL="postgresql://username:password@localhost:5432/tizzigas_dev"
JWT_SECRET="dev-jwt-secret"
NALO_API_KEY="test-api-key"
```

### Production (.env.production)
```bash
NODE_ENV="production"
DATABASE_URL="postgresql://username:password@production-host:5432/tizzigas_prod"
JWT_SECRET="super-secure-production-jwt-secret"
NALO_API_KEY="production-api-key"
```

## Security Best Practices

1. **Never commit `.env` files** to version control
2. **Use strong, unique secrets** for JWT and database credentials
3. **Rotate API keys regularly** especially in production
4. **Use environment-specific configurations** for different deployment stages
5. **Enable HTTPS** in production environments
6. **Set up proper CORS** for your Flutter app domains

## Testing Configuration

For testing, create a `.env.test` file:
```bash
NODE_ENV="test"
DATABASE_URL="postgresql://username:password@localhost:5432/tizzigas_test"
JWT_SECRET="test-jwt-secret"
NALO_API_KEY="test-api-key"
```

## Common Issues

1. **Database Connection**: Ensure PostgreSQL is running and credentials are correct
2. **SMS Sending**: Verify Nalo Solutions account has sufficient credits
3. **JWT Errors**: Check that JWT_SECRET is set and consistent across restarts
4. **CORS Issues**: Configure CORS settings for your Flutter app's domain
