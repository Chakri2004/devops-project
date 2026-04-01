const express = require("express");
const axios = require("axios");
const client = require("prom-client");

const app = express();
app.use(express.json());

// Prometheus metrics
const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics();

const httpRequestCounter = new client.Counter({
  name: "api_gateway_requests_total",
  help: "Total requests to API Gateway",
});

// Service URLs (Docker Compose network)
const USER_SERVICE = "http://user-service:5001";
const PRODUCT_SERVICE = "http://product-service:5002";

// Routes
app.post("/register", async (req, res) => {
  httpRequestCounter.inc();
  const response = await axios.post(`${USER_SERVICE}/register`, req.body);
  res.json(response.data);
});

app.get("/products", async (req, res) => {
  httpRequestCounter.inc();
  const response = await axios.get(`${PRODUCT_SERVICE}/products`);
  res.json(response.data);
});

app.get("/users", async (req, res) => {
  try {
    httpRequestCounter.inc();
    const response = await axios.get(`${USER_SERVICE}/users`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// Metrics endpoint
app.get("/metrics", async (req, res) => {
  res.set("Content-Type", client.register.contentType);
  res.end(await client.register.metrics());
});

app.listen(5000, () => {
  console.log("API Gateway running on port 5000");
});