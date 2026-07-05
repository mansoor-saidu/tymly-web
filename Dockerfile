FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies
RUN npm install

# Copy source code
COPY . .

# Define build arguments
ARG VITE_GOOGLE_MAPS_API_KEY
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_POSTHOG_KEY
ARG VITE_POSTHOG_PROJECT_TOKEN
ARG VITE_POSTHOG_HOST

# Convert ARGs to ENVs so Vite can use them during the build step
ENV VITE_GOOGLE_MAPS_API_KEY=$VITE_GOOGLE_MAPS_API_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV VITE_POSTHOG_KEY=$VITE_POSTHOG_KEY
ENV VITE_POSTHOG_PROJECT_TOKEN=$VITE_POSTHOG_PROJECT_TOKEN
ENV VITE_POSTHOG_HOST=$VITE_POSTHOG_HOST

# Build the project (Vite will bake the above ENVs into the dist files)
RUN npm run build

# Stage 2: Serve the built application
FROM node:20-alpine AS runner

WORKDIR /app

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy the built output from builder
COPY --from=builder /app/dist ./dist

# Expose the default port (must match the port your start script uses)
ENV PORT=3000
EXPOSE 3000

# Start the application using 'serve'
CMD ["npm", "start"]
