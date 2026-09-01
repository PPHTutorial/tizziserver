# Database Setup Guide

## Current Status

✅ **Project Structure**: Successfully restructured from `src/` to app router architecture  
✅ **Catch-all API Route**: Implemented at `app/api/[...api]/route.ts` handling all endpoints via request body  
✅ **Service Layer**: Complete service classes for auth, user, vendor, courier, order, and notification operations  
✅ **Social Login Schema**: Added `SocialLogin` model and `SocialProvider` enum to Prisma schema  
✅ **TypeScript Errors**: Resolved all compilation errors in service files  

⚠️ **Database Migration**: Pending due to database connection issues

## Database Configuration Options

### Option 1: Use Local PostgreSQL (Recommended for Development)

1. **Set PostgreSQL Password** (if you know it):
   ```env
   DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/tizzigas_dev?schema=public"
   ```

2. **Create Database**:
   ```bash
   psql -U postgres -c "CREATE DATABASE tizzigas_dev;"
   ```

3. **Run Migration**:
   ```bash
   npx prisma db push
   ```

### Option 2: Fix Prisma Managed Database

Your original setup uses Prisma's managed database:
```env
DATABASE_URL="prisma+postgres://localhost:51213/?api_key=..."
```

To fix this:
1. Ensure the Prisma database service is running
2. Check Prisma Console for database status
3. Restart the Prisma database service if needed

### Option 3: Use Alternative Database

You can also use:
- **SQLite** (for quick development):
  ```env
  DATABASE_URL="file:./dev.db"
  ```
  
- **Cloud Database** (Supabase, Railway, etc.):
  ```env
  DATABASE_URL="postgresql://user:password@host:port/database"
  ```

## Next Steps

1. **Choose Database Option**: Select one of the options above
2. **Update .env**: Set the correct DATABASE_URL
3. **Run Migration**: Execute `npx prisma db push` or `npx prisma migrate dev`
4. **Generate Client**: Run `npx prisma generate`
5. **Test API**: Start the server and test the catch-all endpoints

## API Testing

Once the database is set up, you can test the catch-all API:

```bash
# Start the development server
npm run dev

# Test registration endpoint
curl -X POST http://localhost:3000/api/auth \
  -H "Content-Type: application/json" \
  -d '{
    "action": "register",
    "email": "test@example.com",
    "password": "password123",
    "firstName": "Test",
    "lastName": "User",
    "role": "CUSTOMER"
  }'
```

## Prisma Schema Summary

The schema now includes:
- **User**: Core user model with auth fields
- **Customer/Vendor/Courier**: Role-specific profile models  
- **Order**: Order management with status tracking
- **SocialLogin**: New model for social authentication
- **Notifications**: Push notification system
- **Reviews**: Vendor and courier rating system

All models are properly connected with relationships and include proper indexes for performance.
