# amazon_pay — Amazon In-App Purchase RTN Webhook Service

A production-ready **Node.js / Express.js** backend that ingests **Amazon Appstore Real-Time Developer Notifications (RTDN)** and persists them to MongoDB for subscription lifecycle tracking.

---

## 📦 Project Structure

```
amazon_pay/
├── index.js                         # Server entry point + graceful shutdown
├── src/
│   ├── app.js                       # Express app factory
│   ├── config/
│   │   └── db.config.js             # MongoDB connection (Mongoose)
│   ├── models/
│   │   └── amazonWebhook.model.js   # Webhook schema → 'amazon_webhooks' collection
│   ├── controllers/
│   │   └── webhook.controller.js    # RTN ingestion + list logic
│   ├── routes/
│   │   └── webhook.routes.js        # Express router (POST + GET /rtdn)
│   ├── middleware/
│   │   └── rawBody.middleware.js    # Raw stream capture for signature verification
│   └── utils/
│       └── response.utils.js        # Standardized API response helpers
├── .env                             # Local environment config (gitignored)
├── .env.example                     # Environment template
└── package.json
```

---

## 🚀 Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env — set MONGO_URI if using a remote MongoDB instance
```

### 3. Start the server
```bash
# Development (auto-restart on file changes)
npm run dev

# Production
npm start
```

Server runs on **http://localhost:3000** by default.

---

## 📡 API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/webhooks/amazon/rtdn` | Ingest Amazon RTN webhook |
| `GET`  | `/api/webhooks/amazon/rtdn` | List stored webhook records |
| `GET`  | `/` | Health check |

---

## 🧪 Local Testing with ngrok

### Step 1 — Install ngrok
```bash
brew install ngrok/ngrok/ngrok
# or download from https://ngrok.com/download
```

### Step 2 — Start your server
```bash
npm run dev
```

### Step 3 — Start ngrok tunnel
```bash
ngrok http 3000
```
ngrok will output a public HTTPS URL like:
```
Forwarding  https://a1b2-123-456-789.ngrok-free.app → http://localhost:3000
```

### Step 4 — Register the URL with Amazon Developer Console
Go to **Amazon Developer Console → In-App Purchasing → Real-Time Notifications**  
Set the endpoint URL to:
```
https://<your-ngrok-subdomain>.ngrok-free.app/api/webhooks/amazon/rtdn
```

### Step 5 — Simulate a payload (curl)
```bash
curl -X POST https://<your-ngrok-subdomain>.ngrok-free.app/api/webhooks/amazon/rtdn \
  -H "Content-Type: application/json" \
  -d '{
    "notificationType": "SUBSCRIPTION_PURCHASED",
    "rvsVersion": "2.0",
    "customerId": "amzn1.account.TEST123456",
    "receiptId": "TESTRECEIPTID001",
    "productId": "com.example.product.monthly",
    "betaProductTransaction": true
  }'
```

### Step 6 — Verify storage
```bash
# List stored webhooks via GET endpoint
curl http://localhost:3000/api/webhooks/amazon/rtdn

# Or check MongoDB directly
mongosh amazon_pay --eval "db.amazon_webhooks.find().pretty()"
```

---

## 🔒 Amazon RTN Payload Schema

| Field | Type | Description |
|-------|------|-------------|
| `notificationType` | String | Event type (e.g. `SUBSCRIPTION_PURCHASED`, `CANCEL_SUBSCRIPTION`) |
| `rvsVersion` | String | Receipt Verification Service version |
| `customerId` | String | Amazon customer identifier |
| `receiptId` | String | Unique transaction receipt ID |
| `productId` | String | Amazon product/SKU ID |
| `betaProductTransaction` | Boolean | `true` for sandbox/test transactions |
| `receivedAt` | Date | Server-side ingestion timestamp |
| `rawBody` | Object | Full unmodified incoming payload |

---

## ⚠️ HTTP Status Rules

| Status | Trigger | Amazon Behavior |
|--------|---------|-----------------|
| `200` | Successful ingestion | Amazon stops retrying |
| `200` | Malformed / missing fields | Payload logged, Amazon stops retrying |
| `500` | DB failure | Amazon **retries** the notification |

> **Important:** Amazon retries failed notifications for up to **72 hours**. Always return `200` for any intentionally ignored payloads, and `500` only for genuine infrastructure failures you want Amazon to retry.

---

## 🛠️ Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP port |
| `MONGO_URI` | `mongodb://localhost:27017/amazon_pay` | MongoDB connection string |
| `NODE_ENV` | `development` | Environment mode |
