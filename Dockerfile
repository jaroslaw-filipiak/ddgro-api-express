# Use the official Node.js image as the base image
FROM node:16

# Install necessary system dependencies for Puppeteer
RUN apt-get update && apt-get install -y \
  wget \
  ca-certificates \
  libnss3 \
  libatk-bridge2.0-0 \
  libx11-xcb1 \
  libxkbcommon0 \
  libxcomposite1 \
  libxdamage1 \
  libxrandr2 \
  libgbm1 \
  libgtk-3-0 \
  libasound2 \
  libdrm2 \
  libpangocairo-1.0-0 \
  libcups2 \
  libatspi2.0-0 \
  && rm -rf /var/lib/apt/lists/*

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install Node.js dependencies
RUN npm install

# Copy the rest of your application code
COPY . .

# Expose the port that your application will run on
EXPOSE 8080

# Define the command to start your application
CMD ["npm", "start"]