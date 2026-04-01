const express = require("express");
const client = require("prom-client");

const app = express();
app.use(express.json());

let users = [];

// Prometheus metrics
const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics();

const httpRequestCounter = new client.Counter({
  name: "user_service_requests_total",
  help: "Total requests to user service",
});

// Routes
app.post("/register", (req, res) => {
  httpRequestCounter.inc();
  users.push(req.body);
  res.json({ message: "User registered", users });
});

app.get("/users", (req, res) => {
  httpRequestCounter.inc();
  res.json(users);
});

// Metrics endpoint
app.get("/metrics", async (req, res) => {
  res.set("Content-Type", client.register.contentType);
  res.end(await client.register.metrics());
});

app.listen(5001, () => {
  console.log("User Service running on port 5001");
});