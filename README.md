# Maraude Tracker - Backend API

A Node.js API for tracking street outreach (maraude) activities and helpful merchants for homeless assistance associations.

## Features

- **Association Management**: Register and manage charitable associations
- **User Authentication**: JWT-based authentication with role-based access control
- **Maraude Actions**: Create, track and manage street outreach activities on a map
- **Merchant Directory**: Directory of merchants offering free services (coffee, shower, etc.)
- **Real-time Map Data**: API endpoints optimized for map displays
- **Geolocation Support**: Location-based queries and filtering

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: PostgreSQL
- **ORM**: Sequelize
- **Authentication**: JWT
- **Security**: Helmet, CORS, bcrypt

## Installation

### Prerequisites

- Node.js (v16+)
- PostgreSQL (v13+)
- npm or yarn

### Setup

1. **Clone and install dependencies**:
   ```bash
   git clone <repository-url>
   cd maraude-tracker/backend
   npm install
   ```

2. **Setup PostgreSQL database**:
   ```bash
   # Make the setup script executable
   chmod +x setup-db.sh
   # Run the database setup
   ./setup-db.sh
   ```

3. **Configure environment variables**:
   ```bash
   cp .env.example .env
   # Edit .env with your database credentials
   ```

4. **Initialize database**:
   ```bash
   # Run migrations
   npm run db:migrate
   # Seed initial data (optional)
   npm run db:seed
   ```

5. **Start the server**:
   ```bash
   # Development mode
   npm run dev
   # Production mode
   npm start
   ```

## API Documentation

### Base URL
```
http://localhost:3000/api
```

### Authentication
Most endpoints require authentication. Include the JWT token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

### Main Endpoints

#### Authentication
- `POST /auth/register` - Register new user
- `POST /auth/login` - Login user
- `GET /auth/me` - Get current user info

#### Associations
- `GET /associations` - List all associations (public)
- `GET /associations/:id` - Get association details
- `POST /associations` - Create new association

#### Maraude Actions
- `GET /maraudes` - List maraude actions (public for map)
- `GET /maraudes/:id` - Get specific action
- `POST /maraudes` - Create new action (auth required)
- `PUT /maraudes/:id` - Update action
- `GET /maraudes/today/active` - Today's active actions

#### Merchants
- `GET /merchants` - List all merchants (public)
- `GET /merchants/:id` - Get merchant details
- `POST /merchants` - Add new merchant (auth required)
- `GET /merchants/nearby/:lat/:lng` - Find nearby merchants

#### Users
- `GET /users` - List users (admin/coordinator only)
- `GET /users/:id` - Get user profile
- `PUT /users/:id` - Update user

### Request Examples

#### Register a new association
```bash
curl -X POST http://localhost:3000/api/associations \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Les Restos du Cœur",
    "email": "contact@restosducoeur.org",
    "description": "Association d'aide alimentaire",
    "phone": "01-23-45-67-89",
    "address": "Paris, France"
  }'
```

#### Create a user account
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Jean",
    "lastName": "Dupont",
    "email": "jean@example.com",
    "password": "securepassword",
    "associationId": "uuid-of-association",
    "role": "volunteer"
  }'
```

#### Create a maraude action
```bash
curl -X POST http://localhost:3000/api/maraudes \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "title": "Maraude République",
    "description": "Distribution de repas place de la République",
    "latitude": 48.8676,
    "longitude": 2.3631,
    "address": "Place de la République, Paris",
    "scheduledDate": "2025-09-15",
    "startTime": "19:00:00",
    "endTime": "21:00:00",
    "participantsCount": 5
  }'
```

#### Add a helpful merchant
```bash
curl -X POST http://localhost:3000/api/merchants \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "Café de la Paix",
    "category": "cafe",
    "services": ["free_coffee", "restroom", "phone_charging"],
    "latitude": 48.8566,
    "longitude": 2.3522,
    "address": "12 Boulevard des Capucines, Paris",
    "phone": "01-23-45-67-89",
    "openingHours": {
      "monday": "07:00-19:00",
      "tuesday": "07:00-19:00"
    },
    "specialInstructions": "Demander à l'accueil"
  }'
```

## Database Schema

### Main Tables
- **associations**: