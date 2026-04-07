require("dotenv").config();
const express = require("express");
const client = require("prom-client");
const mongoose = require("mongoose");

const app = express();
app.use(express.json());

const AWS = require("aws-sdk");

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_KEY,
  region: process.env.AWS_REGION,
});

// Prometheus metrics
const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics();

const httpRequestCounter = new client.Counter({
  name: "product_service_requests_total",
  help: "Total requests to product service",
});

mongoose.connect("mongodb://mongodb:27017/productdb")
.then(() => console.log("MongoDB connected (Product Service)"))
.catch(err => console.log(err));

const ProductSchema = new mongoose.Schema({
  name: String,
  price: Number,
});

const Product = mongoose.model("Product", ProductSchema);

const redis = require("redis");
const redisClient = redis.createClient({
  url: "redis://redis:6379",
});
redisClient.connect().catch(console.error);

// Routes
app.get("/products", async (req, res) => {
  httpRequestCounter.inc();
  try {
    const cacheData = await redisClient.get("products");
    if (cacheData) {
      console.log("Serving from Redis");
      return res.json(JSON.parse(cacheData));
    }
    console.log("Fetching from MongoDB");
    const products = await Product.find();
    try {
      await uploadToS3(products);
      console.log("Uploaded to S3");
    } catch (err) {
      console.log("S3 upload failed:", err.message);
    }
    await redisClient.set("products", JSON.stringify(products), {
      EX: 60,
    });
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: "Error fetching products" });
  }
});

app.post("/add-product", async (req, res) => {
  httpRequestCounter.inc();
  const product = new Product(req.body);
  await product.save();
  await redisClient.del("products");
  res.json({ message: "Product added", product });
});

async function uploadToS3(data) {
  const params = {
    Bucket: process.env.S3_BUCKET,
    Key: `products-${Date.now()}.json`,
    Body: JSON.stringify(data),
    ContentType: "application/json",
  };

  return s3.upload(params).promise();
}

// Metrics endpoint
app.get("/metrics", async (req, res) => {
  res.set("Content-Type", client.register.contentType);
  res.end(await client.register.metrics());
});

app.listen(5002, () => {
  console.log("Product Service running on port 5002");
});