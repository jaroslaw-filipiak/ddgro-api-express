# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Core Commands
- `npm run dev` - Start development server with nodemon
- `npm start` - Start production server

### Environment Setup
- Copy `.env.example` to `.env` and configure environment variables
- Required variables: `MONGODB_URI`, `JWT_SECRET`, email configuration

## Architecture Overview

**DDGRO Backend** - Express.js API server for terrace calculation and management system with MongoDB, JWT authentication, PDF generation, and multilingual email system.

### Technology Stack
- **Runtime**: Node.js with Express.js framework
- **Database**: MongoDB with Mongoose ODM  
- **Authentication**: Passport.js with JWT strategy
- **Email**: Nodemailer with Handlebars templating
- **PDF Generation**: Puppeteer for PDF creation

### Key Directories
- `routes/api/` - API endpoints (auth, products, accessories, application, users)
- `models/` - MongoDB/Mongoose model definitions
- `services/` - Business logic services (email service)
- `templates/` - Handlebars templates for emails and PDFs
- `config/` - Passport.js authentication configuration
- `utils/` - Helper functions and data processing utilities
- `migrations/` - Database migration scripts
- `translations/` - Backend translation files for multilingual support

### Core Patterns

#### API Routes
- Use async/await with try-catch error handling
- Consistent response format: `{ success: boolean, data: any, message?: string }`
- Custom numeric IDs, not MongoDB's `_id` for resource lookups
- Route-level middleware for authentication and validation

#### Models
- Complex Mongoose schemas with validation and custom field types
- Multilingual field support with default language fallback  
- Instance methods for business logic and formatting
- Static methods for query helpers and aggregations

#### Services
- Environment-based configuration (development vs production)
- Template compilation and caching with Handlebars
- External API integration patterns
- Proper error handling and logging

### Deployment Environments
- **Development**: `dev` branch → https://ddgro-api-express-development.onrender.com (MongoDB: ddgro-development.7j22j.mongodb.net)
- **Production**: `master` branch → https://ddgro-api-express.onrender.com (MongoDB: szacus-mo.0vhmjmz.mongodb.net)

### Authentication
- JWT tokens with Passport.js
- Local and JWT authentication strategies
- Role-based access control

### Key Features
- Multilingual support (5 languages: pl, en, de, fr, es)  
- Dynamic PDF generation from HTML templates
- Template-based email system with attachments
- Complex terrace calculations and product management
- Form submission workflow with data validation

### API Endpoints Structure
- **Public**: `GET /api/products`, `GET /api/accesories`, `POST /api/application`
- **Auth**: `POST /api/auth/login`, `POST /api/auth/register`, `GET /api/auth/me`
- **Protected**: `PUT /api/products/:id`, PDF generation, application previews