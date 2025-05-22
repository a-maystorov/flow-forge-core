# Flow Forge Core API

The backend service for Flow Forge - a task management platform.

## Local Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run tests
npm test

# Build for production
npm run build

# Start production server
npm start
```

## Deployment to Render

This API is configured to be deployed on [Render](https://render.com).

### Prerequisites

1. Create a [Render account](https://render.com/)
2. Set up a MongoDB database (MongoDB Atlas recommended)

### Deployment Steps

1. Push your code to a Git repository (GitHub, GitLab, etc.)
2. In Render dashboard, create a new Web Service
3. Connect your Git repository
4. Configure the service:

   - Name: `flow-forge-api` (or your preferred name)
   - Environment: `Node`
   - Build Command: `npm install && npm run build`
   - Start Command: `npm start`
   - Instance Type: Select based on your needs

5. Add the following environment variables:

   - `NODE_ENV`: `production`
   - `PORT`: `10000` (Render will automatically set the PORT environment variable)
   - `MONGO_URI`: Your MongoDB connection string
   - `JWT_SECRET`: A secure random string for JWT signing
   - `CORS_ORIGIN`: Your frontend application URL (e.g., `https://your-frontend-app.render.com`)

6. Click "Create Web Service"

### Automatic Deployments

The included `render.yaml` file enables automatic deployments through Render's Blueprint feature. To use this:

1. In Render dashboard, click "Blueprints"
2. Connect your Git repository
3. Render will detect the `render.yaml` file and create the service

## API Endpoints

- `/api/auth` - Authentication endpoints
- `/api/users` - User management
- `/api/boards` - Board management

## Environment Variables

| Variable    | Description                                 | Required | Default           |
| ----------- | ------------------------------------------- | -------- | ----------------- |
| NODE_ENV    | Environment (development, production, test) | Yes      | -                 |
| PORT        | Server port                                 | No       | 3000              |
| MONGO_URI   | MongoDB connection string                   | Yes      | -                 |
| JWT_SECRET  | Secret for JWT signing                      | Yes      | -                 |
| CORS_ORIGIN | Allowed origins for CORS                    | No       | localhost origins |
