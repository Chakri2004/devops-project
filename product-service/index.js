const express = require("express");
const client = require("prom-client");

const app = express();
app.use(express.json());

let products = [];

// Prometheus metrics
const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics();

const httpRequestCounter = new client.Counter({
  name: "product_service_requests_total",
  help: "Total requests to product service",
});

// Routes
app.post("/add-product", (req, res) => {
  httpRequestCounter.inc();
  products.push(req.body);
  res.json({ message: "Product added", products });
});

app.get("/products", (req, res) => {
  httpRequestCounter.inc();
  res.json(products);
});

// Metrics endpoint
app.get("/metrics", async (req, res) => {
  res.set("Content-Type", client.register.contentType);
  res.end(await client.register.metrics());
});

app.listen(5002, () => {
  console.log("Product Service running on port 5002");
});