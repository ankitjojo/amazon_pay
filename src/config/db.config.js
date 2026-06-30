const { MongoClient } = require("mongodb");

const uri = process.env.MONGO_URI || "mongodb://localhost:27017";
const dbName = "amazon_pay";

let client;
let db;

/**
 * Connects to MongoDB using the native driver.
 * Call once at server startup.
 */
const connectDB = async () => {
  client = new MongoClient(uri);
  await client.connect();
  db = client.db(dbName);
  console.log(`✅  MongoDB connected → ${uri} / ${dbName}`);
};

/**
 * Returns the connected db instance.
 * Use this in controllers: getDB().collection("my_collection")
 */
const getDB = () => {
  if (!db) throw new Error("DB not initialized — call connectDB() first");
  return db;
};

/**
 * Closes the MongoDB connection cleanly (for graceful shutdown).
 */
const closeDB = async () => {
  if (client) await client.close();
};

module.exports = { connectDB, getDB, closeDB };
