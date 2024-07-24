# Use an official Node.js runtime as the base image
FROM node:18-alpine

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install the application dependencies
RUN npm install

# Copy the application code to the working directory
COPY . .

# Expose the port the app runs on
EXPOSE 4994

# Set Node.js to run in production mode
ENV NODE_ENV=production

# Disable Node.js stdout buffering
#ENV NODE_OPTIONS=--no-buffering

# Define the command to run the application
CMD ["node", "index.js"]
