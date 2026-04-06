require("dotenv").config();
const express = require("express");
const axios = require("axios");
const client = require("prom-client");

const app = express();
app.use(express.json());

const morgan = require("morgan");

// log format: method url status time
app.use(morgan("dev"));

app.set('trust proxy', 1);
const rateLimit = require("express-rate-limit");
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, 
  max: 3,
  message: "Too many requests, please try again later.",
});
app.use(limiter);

const jwt = require("jsonwebtoken");

const authMiddleware = (req, res, next) => {
  const token = req.headers["authorization"]?.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "No token provided" });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid token" });
  }
};

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
app.post("/login", async (req, res) => {
  try {
    httpRequestCounter.inc();
    const response = await axios.post(`${USER_SERVICE}/login`, req.body);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: "Login failed" });
  }
});

app.post("/register", async (req, res) => {
  try {
    httpRequestCounter.inc();
    const response = await axios.post(`${USER_SERVICE}/register`, req.body);
    res.json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json({
      error: error.response?.data || "Register failed",
    });
  }
});

app.get("/users", authMiddleware, async (req, res) => {
  try {
    httpRequestCounter.inc();
    const response = await axios.get(`${USER_SERVICE}/users`, {
      headers: {
        Authorization: req.headers["authorization"],
      },
    });
    res.json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json({
      error: error.response?.data || "Failed to fetch users",
    });
  }
});

// UPDATE USER
app.put("/users/:id", authMiddleware, async (req, res) => {
  try {
    const response = await axios.put(
      `${USER_SERVICE}/update-user/${req.params.id}`,
      req.body
    );
    res.json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json({
      error: error.response?.data || error.message,
    });
  }
});

// DELETE USER
app.delete("/users/:id", authMiddleware, async (req, res) => {
  try {
    const response = await axios.delete(
      `${USER_SERVICE}/delete-user/${req.params.id}`
    );
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: "Delete user failed" });
  }
});

app.get("/products", authMiddleware, async (req, res) => {
  httpRequestCounter.inc();
  const response = await axios.get(`${PRODUCT_SERVICE}/products`);
  res.json(response.data);
});

app.get("/test", (req, res) => {
  res.send("OK");
});

// Metrics endpoint
app.get("/metrics", async (req, res) => {
  res.set("Content-Type", client.register.contentType);
  res.end(await client.register.metrics());
});

app.listen(5000, () => {
  console.log("API Gateway running on port 5000");
});