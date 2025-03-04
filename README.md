# Shopify Image SEO Optimizer

A web application that optimizes product images for SEO on Shopify stores using AI-generated alt text and filenames.

## Features

- User authentication and multi-tenant support
- AI-powered image optimization using Google's Gemini API
- Automatic alt text and filename generation
- Progress tracking and resumable operations
- Modern, responsive UI

## Project Structure

- **Client**: React frontend with Tailwind CSS
- **Server**: Node.js/Express backend with MongoDB

## Prerequisites

- Node.js (v14+)
- MongoDB (local or Atlas)
- Shopify Admin API access
- Google Gemini API key

## Local Development Setup

### Server Setup

1. Navigate to the server directory:
   ```bash
   cd server
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file based on `.env.example`:
   ```bash
   cp .env.example .env
   ```

4. Update the `.env` file with your MongoDB URI, JWT secret, and API keys.

5. Start the server in development mode:
   ```bash
   npm run dev
   ```

### Client Setup

1. Navigate to the client directory:
   ```bash
   cd client
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file based on `.env.example`:
   ```bash
   cp .env.example .env
   ```

4. Update the `.env` file with your API URL.

5. Start the client in development mode:
   ```bash
   npm start
   ```

## Deployment Options

### Option 1: Traditional Hosting (VPS/Dedicated Server)

#### Server Deployment

1. Set up a VPS with Ubuntu/Debian
2. Install Node.js and MongoDB
3. Clone the repository
4. Set up environment variables
5. Use PM2 to manage the Node.js process
6. Set up Nginx as a reverse proxy
7. Configure SSL with Let's Encrypt

#### Client Deployment

1. Build the React application
2. Deploy the static files to Nginx or a CDN

### Option 2: Platform as a Service (PaaS)

#### Backend Deployment with Heroku

1. Create a Heroku account
2. Set up a MongoDB Atlas database
3. Deploy the server code to Heroku
4. Configure environment variables in Heroku

#### Frontend Deployment with Netlify/Vercel

1. Build the React application
2. Deploy to Netlify or Vercel
3. Configure environment variables

### Option 3: Containerized Deployment with Docker

1. Use the provided Docker Compose setup
2. Build and run the containers
3. Configure environment variables

## MongoDB Setup

1. Create a MongoDB Atlas account (or use a local MongoDB instance)
2. Create a new cluster
3. Create a database user
4. Get your connection string
5. Update the `MONGODB_URI` in your `.env` file

## Security Considerations

- Use strong JWT secrets in production
- Store sensitive API keys securely
- Enable CORS only for your frontend domain
- Use HTTPS in production
- Implement proper error handling and logging

## License

This project is licensed under the MIT License - see the LICENSE file for details.