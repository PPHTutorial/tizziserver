# TIZZI GAS Backend Server

A modern, scalable backend API for the TIZZI GAS delivery application built with Next.js 15, TypeScript, Prisma ORM, and PostgreSQL.

## 🚀 Features

- **Authentication System**: JWT-based auth with email/phone login, social login (Google, Facebook, Apple), and OTP verification
- **Multi-Role Support**: Customer, Vendor, Courier, and Admin roles with role-based access control
- **Order Management**: Complete order lifecycle from creation to delivery
- **Vendor Discovery**: Location-based vendor search with distance calculation
- **Real-time Updates**: Order status tracking and location updates
- **Security**: Input validation, password hashing, and secure JWT tokens
- **Type Safety**: Full TypeScript implementation with Prisma type generation
- **Scalable Architecture**: Modular API structure with clear separation of concerns

## 🛠️ Tech Stack

- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: JWT with bcryptjs
- **Validation**: Zod schema validation
- **SMS Service**: Twilio integration
- **Email Service**: Nodemailer (planned)

## 📋 Prerequisites

- Node.js 18+ and npm
- PostgreSQL database
- Twilio account (for SMS OTP)

## 🚀 Quick Start

### 1. Clone and Install Dependencies
```bash
git clone <repository-url>
cd server
npm install
```

### 2. Environment Setup
Create a `.env` file in the server directory:
```env
DATABASE_URL="postgresql://username:password@localhost:5432/tizzigas"
JWT_SECRET="your-super-secret-jwt-key-here"
TWILIO_ACCOUNT_SID="your-twilio-account-sid"
TWILIO_AUTH_TOKEN="your-twilio-auth-token"
TWILIO_PHONE_NUMBER="your-twilio-phone-number"
NODE_ENV="development"
```

### 3. Database Setup
```bash
# Generate Prisma client
npx prisma generate

# Push schema to database
npx prisma db push

# Optional: Open Prisma Studio to view data
npx prisma studio
```

### 4. Start Development Server
```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## 📁 Project Structure

```
server/
├── prisma/
│   └── schema.prisma          # Database schema
├── src/
│   ├── app/
│   │   └── api/               # API routes
│   │       ├── auth/          # Authentication endpoints
│   │       ├── vendor/        # Vendor management
│   │       ├── courier/       # Courier management
│   │       ├── orders/        # Order management
│   │       └── vendors/       # Vendor discovery
│   └── lib/
│       ├── prisma.ts          # Prisma client
│       └── utils.ts           # Utility functions
├── .env                       # Environment variables
├── package.json
└── README.md
```

## 🔐 Authentication Flow

### 1. User Registration
```bash
POST /api/auth/register
```
- Creates user account with email/phone and password
- Supports role selection (CUSTOMER, VENDOR, COURIER)
- Returns JWT token for immediate use

### 2. Phone Verification
```bash
POST /api/auth/send-otp      # Send OTP to phone
POST /api/auth/verify-otp    # Verify OTP code
```

### 3. Login Options
```bash
POST /api/auth/login         # Email/phone + password
POST /api/auth/social-login  # Google/Facebook/Apple
```

## 📱 Mobile App Integration

This backend is designed to work seamlessly with your Flutter mobile application:

1. **Replace Firebase calls** with HTTP requests to these API endpoints
2. **Store JWT tokens** securely on the device
3. **Handle authentication** with the token-based system
4. **Update models** to match the API response format

### Example Flutter Integration:
```dart
// Replace Firebase auth
final response = await http.post(
  Uri.parse('$baseUrl/api/auth/login'),
  headers: {'Content-Type': 'application/json'},
  body: json.encode({
    'identifier': email,
    'password': password,
  }),
);

// Store token for future requests
final token = json.decode(response.body)['data']['token'];
await storage.write(key: 'auth_token', value: token);
```

## 🔄 Order Management Flow

1. **Customer** creates order → `POST /api/orders`
2. **Vendor** confirms order → `PUT /api/orders?id={id}` (status: CONFIRMED)
3. **System** assigns courier → `PUT /api/orders?id={id}` (status: COURIER_ASSIGNED)
4. **Courier** updates progress → `PUT /api/orders?id={id}` (status: IN_PROGRESS)
5. **Courier** delivers → `PUT /api/orders?id={id}` (status: DELIVERED)

## 🗺️ Location Services

- **Vendor Discovery**: Find gas stations within specified radius
- **Distance Calculation**: Haversine formula for accurate distance
- **Real-time Tracking**: Courier location updates during delivery

## 🧪 Testing

```bash
# Run type checking
npm run build

# Test API endpoints
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123","firstName":"Test","lastName":"User","role":"CUSTOMER"}'
```

## 🚀 Deployment

### Production Build
```bash
npm run build
npm start
```

### Environment Variables for Production
- Set `NODE_ENV=production`
- Use secure JWT_SECRET
- Configure production database
- Set up proper Twilio credentials

## 📊 Database Schema

The application uses a comprehensive database schema with:
- **Users**: Multi-role user management
- **Customers**: Customer profiles and addresses
- **Vendors**: Gas station information and availability
- **Couriers**: Delivery personnel and vehicle details
- **Orders**: Complete order lifecycle tracking
- **Payments**: Transaction management
- **Reviews**: Customer feedback system

## 🔧 Configuration

### Twilio SMS Setup
1. Create Twilio account
2. Get Account SID and Auth Token
3. Purchase phone number
4. Add credentials to `.env`

### Database Configuration
- Supports PostgreSQL, MySQL, and SQLite
- Connection pooling for scalability
- Automatic migrations with Prisma

## 📄 API Documentation

See [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) for detailed endpoint documentation.

## 🎯 Next Steps

1. **Connect Flutter App**: Update your mobile app to use these APIs
2. **Test Authentication**: Verify login/registration flows
3. **Set Up Database**: Configure PostgreSQL and run migrations
4. **Configure Services**: Set up Twilio for SMS functionality
5. **Deploy**: Choose your hosting platform (Vercel, AWS, etc.)

The backend is now ready to replace your Firebase setup and provide a more customizable, scalable solution for your TIZZI GAS delivery application!

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
