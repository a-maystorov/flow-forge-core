# Flow Forge Core API

![Express](https://img.shields.io/badge/Express-4.21.2-000000?logo=express&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6.3-3178C6?logo=typescript&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-6.10.0-47A248?logo=mongodb&logoColor=white)
![Mongoose](https://img.shields.io/badge/Mongoose-8.9.5-880000?logo=mongoose&logoColor=white)
![Socket.IO](https://img.shields.io/badge/Socket.IO-4.8.1-010101?logo=socket.io&logoColor=white)
![Jest](https://img.shields.io/badge/Jest-29.7.0-C21325?logo=jest&logoColor=white)

A robust, production-ready backend service powering Flow Forge - an advanced task management platform built with modern JavaScript technologies. This API provides a complete suite of endpoints for managing tasks, boards, and user authentication with a focus on performance, scalability, and type safety.

## 🚀 Features

- **RESTful API Architecture**: Clean, well-structured API endpoints following REST principles
- **Advanced Authentication**: Secure JWT-based authentication system with refresh token support
- **Real-time Updates**: Socket.IO integration for live collaborative features
- **MongoDB Integration**: Efficient data persistence with Mongoose ODM
- **Comprehensive Task Management**: Complete CRUD operations for boards, columns, tasks, and subtasks
- **AI-Powered Assistance**(In Progress): Intelligent features for board suggestions, task breakdown, and task improvement
- **Type Safety**: End-to-end TypeScript implementation with robust type definitions
- **Automated Testing**: Comprehensive test suite with Jest
- **Input Validation**: Request validation using Zod schemas
- **Error Handling**: Centralized error handling middleware
- **CORS Support**: Configurable Cross-Origin Resource Sharing
- **Environment Configuration**: Flexible configuration via environment variables
- **Cloud Deployment**: Optimized for deployment on modern cloud platforms

## 🛠️ Technology Stack

### Core Technologies

- **TypeScript 5.6**: For type-safe code and enhanced developer experience
- **Node.js**: Runtime environment for server-side JavaScript
- **Express 4.21**: Fast, unopinionated web framework
- **MongoDB 6.10**: NoSQL database for flexible data storage
- **Mongoose 8.9**: MongoDB object modeling for Node.js
- **Socket.IO 4.8**: Real-time bidirectional event-based communication
- **JWT**: JSON Web Tokens for secure authentication
- **Zod 3.23**: TypeScript-first schema validation

### Development & Testing

- **Jest 29.7**: JavaScript testing framework
- **Supertest 7.0**: HTTP assertions for API testing
- **ESLint 9.13**: Static code analysis tool
- **Prettier 3.3**: Code formatter
- **Husky 9.1**: Git hooks for code quality
- **MongoDB Memory Server**: In-memory MongoDB for testing
- **ts-node & nodemon**: For development environment

## 🏗️ Architecture

Flow Forge follows a modular architecture with clean separation of concerns:

```
src/
├── config/         # Configuration files (database, CORS, etc.)
├── middleware/     # Express middleware (auth, error handling)
├── models/         # Mongoose models and interfaces
├── routes/         # API routes and controllers
├── services/       # Business logic and data processing
├── utils/          # Utility functions and helpers
├── @types/         # TypeScript type definitions
└── app.ts          # Main application entry point
```

## 🔧 Getting Started

### Prerequisites

- Node.js (v16+)
- npm or yarn
- MongoDB (local or Atlas)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/flow-forge-core.git
cd flow-forge-core

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Start development server
npm run dev
```

### Available Scripts

- `npm run dev` - Start development server with hot-reloading
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm test` - Run test suite
- `npm run test:watch` - Run tests in watch mode
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint issues
- `npm run format` - Format code with Prettier

## 📝 API Documentation

### Authentication Endpoints

- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Authenticate a user
- `POST /api/auth/refresh` - Refresh access token

### User Endpoints

- `GET /api/users/me` - Get current user profile
- `PUT /api/users/me` - Update user profile
- `DELETE /api/users/me` - Delete user account

### Board Management

- `GET /api/boards` - List all boards
- `POST /api/boards` - Create a new board
- `GET /api/boards/:id` - Get board details
- `PUT /api/boards/:id` - Update board
- `DELETE /api/boards/:id` - Delete board

### AI Assistant Endpoints(WIP)

- `POST /api/ai/board-suggestion` - Generate board suggestions based on project descriptions
- `POST /api/ai/task-breakdown` - Break down tasks into subtasks
- `POST /api/ai/task-improvement` - Provide improvement suggestions for task titles and descriptions

## 🌟 Technical Highlights

- **Centralized Type System**: Implemented a unified typing system for MongoDB documents using TypeScript utility types
- **Type-Safe MongoDB Integration**: Custom type definitions for Mongoose models ensuring type safety throughout the application
- **AI Integration**: OpenAI-powered assistant features for enhanced productivity
- **JWT Authentication**: Secure user authentication with proper TypeScript type handling
- **Clean Architecture**: Feature-based organization with clear separation of concerns
- **Test-Driven Development**: Comprehensive test coverage for all critical paths

## 🚀 Deployment

Flow Forge Core is configured for easy deployment to cloud platforms like Render:

```yaml
# render.yaml
services:
  - type: web
    name: flow-forge-api
    env: node
    buildCommand: npm install && npm run build
    startCommand: npm start
    envVars:
      - key: NODE_ENV
        value: production
      - key: MONGO_URI
        sync: false
      - key: JWT_SECRET
        sync: false
```

### Environment Variables

| Variable    | Description                                 | Required | Default           |
| ----------- | ------------------------------------------- | -------- | ----------------- |
| NODE_ENV    | Environment (development, production, test) | Yes      | -                 |
| PORT        | Server port                                 | No       | 3000              |
| MONGO_URI   | MongoDB connection string                   | Yes      | -                 |
| JWT_SECRET  | Secret for JWT signing                      | Yes      | -                 |
| CORS_ORIGIN | Allowed origins for CORS                    | No       | localhost origins |

## 📚 Learning Outcomes & Skills Demonstrated

This project showcases proficiency in:

- Building scalable Node.js/Express APIs
- MongoDB/Mongoose data modeling and querying
- TypeScript advanced typing and interfaces
- Authentication system implementation
- API security best practices
- Real-time features with Socket.IO
- Test-driven development
- Continuous integration workflows
- API documentation
- Deployment automation

## 📄 License

MIT

---

© 2025 Flow Forge - Crafted with ❤️ by Alkin Maystorov
