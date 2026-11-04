# ---- PayAgent container image ----
# Small, production-ish Node image.
FROM node:20-alpine

# App lives here inside the container.
WORKDIR /app

# Install dependencies first (cached layer — only re-runs when deps change).
COPY package*.json ./
RUN npm ci --omit=dev

# Copy the rest of the source.
COPY . .

# The server listens on 3000.
ENV PORT=3000
EXPOSE 3000

# Start the server. Secrets (PayPal + Gemini keys) are passed at runtime,
# NOT baked into the image — see README / docker run --env-file.
CMD ["npm", "start"]
