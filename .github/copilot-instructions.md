# TIZZI GAS - Copilot Instructions

<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

## Project Overview
This is a full-stack TIZZI GAS delivery application with:
- **Backend**: Next.js 15 with TypeScript and Prisma ORM
- **Frontend**: Next.js admin dashboard with Tailwind CSS
- **Mobile App**: Flutter app consuming REST APIs
- **Database**: PostgreSQL with Prisma
- **Authentication**: Custom auth system with email, social login, and OTP verification

## Architecture Guidelines

### Backend Structure
- Use `/src/app/api/` for API routes following REST conventions
- Implement middleware for authentication, validation, and error handling
- Use Prisma for database operations with proper error handling
- Follow clean architecture principles with services, controllers, and repositories

### Database Design
- Use Prisma schema with proper relationships
- Implement soft deletes where appropriate
- Use UUIDs for primary keys
- Maintain audit trails (createdAt, updatedAt, deletedAt)

### Authentication System
- JWT-based authentication with refresh tokens
- Social login integration (Google, Facebook, Apple)
- SMS OTP verification for mobile numbers
- Role-based access control (Customer, Vendor, Courier, Admin)

### API Design
- RESTful API endpoints with proper HTTP methods
- Consistent response format with success/error states
- Input validation using Zod or similar
- Rate limiting and security middleware
- API versioning for future updates

### Key Models
- **User**: Base user model with roles
- **Customer**: Customer-specific data
- **Vendor**: Gas station/business information
- **Courier**: Delivery personnel data
- **Order**: Order management with status tracking
- **Location**: GPS coordinates and addresses
- **Payment**: Transaction records
- **Notification**: Push notification logs

### Security Best Practices
- Environment variables for sensitive data
- Input sanitization and validation
- SQL injection prevention through Prisma
- Rate limiting on sensitive endpoints
- CORS configuration for mobile app

### Error Handling
- Global error handler middleware
- Proper HTTP status codes
- Detailed error logs for debugging
- User-friendly error messages

### Testing
- Unit tests for business logic
- Integration tests for API endpoints
- Database seeding for test data
- Mock external services

### Performance
- Database indexing for frequent queries
- Caching for static data
- Image optimization and CDN usage
- Lazy loading where appropriate

## Coding Standards
- Use TypeScript strictly with proper typing
- Follow ESLint and Prettier configurations
- Use async/await for asynchronous operations
- Implement proper logging with structured data
- Write self-documenting code with clear variable names
- Use environment-specific configurations
