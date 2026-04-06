require("dotenv").config();
const express = require("express");
const client = require("prom-client");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const app = express();
app.use(express.json());

const httpRequestDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "Request duration in seconds",
  labelNames: ["method", "route", "status_code"],
});

app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = (Date.now() - start) / 1000;
    httpRequestDuration
      .labels(req.method, req.route?.path || req.path, res.statusCode)
      .observe(duration);
  });
  next();
});

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
    res.status(401).json({ message: "Invalid token" });
  }
};

const adminMiddleware = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Access denied: Admin only" });
  }
  next();
};

const loginSuccessCounter = new client.Counter({
  name: "login_success_total",
  help: "Total successful logins",
});

const loginFailureCounter = new client.Counter({
  name: "login_failure_total",
  help: "Total failed logins",
});

// Prometheus metrics
const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics();

const httpRequestCounter = new client.Counter({
  name: "user_service_requests_total",
  help: "Total requests to user service",
});

const errorCounter = new client.Counter({
  name: "api_errors_total",
  help: "Total API errors",
  labelNames: ["route"],
});

mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("MongoDB connected (User Service)"))
.catch(err => console.log(err));

const UserSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: String,
  role: {
    type: String,
    default: "user",
  },
});

const User = mongoose.model("User", UserSchema);

// Routes
app.post("/register", async (req, res) => {
  try {
    httpRequestCounter.inc();
    const { name, email, password, role } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({
      name,
      email,
      password: hashedPassword,
      role: role || "user",
    });
    await user.save();
    res.json({ message: "User registered" });
  } catch (err) {
    console.log("REGISTER ERROR:", err);  
    errorCounter.inc(); 
    errorCounter.inc({ route: "/register" });
    res.status(500).json({ error: "Registration error" });
  }
});

app.post("/login", async (req, res) => {
  try {
    httpRequestCounter.inc();
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      loginFailureCounter.inc();
      return res.status(400).json({ message: "User not found" });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      loginFailureCounter.inc();
      return res.status(400).json({ message: "Invalid credentials" });
    }
    loginSuccessCounter.inc();
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );
    res.json({ token });
  } catch (err) {
    errorCounter.inc(); 
    errorCounter.inc({ route: "/login" }); 
    res.status(500).json({ error: "Login error" });
  }
});

app.get("/users", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    httpRequestCounter.inc();
    const users = await User.find();
    res.json(users);
  } catch (err) {
    errorCounter.inc({ route: "/users" });   
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// UPDATE USER
app.put("/update-user/:id", async (req, res) => {
  try {
    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    res.json(updatedUser);
  } catch (error) {
    res.status(500).json({ error: "Update failed" });
  }
});

// DELETE USER
app.delete("/delete-user/:id", async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: "User deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Delete failed" });
  }
});

// Metrics endpoint
app.get("/metrics", async (req, res) => {
  res.set("Content-Type", client.register.contentType);
  res.end(await client.register.metrics());
});

app.listen(5001, () => {
  console.log("User Service running on port 5001");
});