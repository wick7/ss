const express = require("express")
const mongoose = require("mongoose")
const cors = require("cors")
require("dotenv").config()

const app = express()
const PORT = process.env.PORT || 3001

// Middleware
app.use(cors())
app.use(express.json())

app.use((req, res, next) => {
  console.log(`[v0] ${new Date().toISOString()} - ${req.method} ${req.url}`)
  next()
})

// MongoDB connection
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/ss"

console.log(`[v0] Attempting to connect to MongoDB with URI: ${MONGO_URI}`)

mongoose
  .connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("Connected to MongoDB")
    console.log(`[v0] MongoDB connection state: ${mongoose.connection.readyState}`)
  })
  .catch((error) => {
    console.error("MongoDB connection error:", error)
    console.error(`[v0] MongoDB connection failed with error: ${error.message}`)
  })

mongoose.connection.on("error", (error) => {
  console.error(`[v0] MongoDB connection error: ${error.message}`)
})

mongoose.connection.on("disconnected", () => {
  console.log("[v0] MongoDB disconnected")
})

// Routes
app.use("/api/groups", require("./routes/groups"))
app.use("/api/members", require("./routes/members"))
app.use("/api/matches", require("./routes/matches"))
app.use("/api/notifications", require("./routes/notifications"))

app.get("/", (req, res) => {
  res.json({
    message: "Secret Santa API is running",
    endpoints: [
      "GET /api/health",
      "GET /api/groups",
      "GET /api/members",
      "GET /api/matches",
      "POST /api/notifications/generate-matches",
    ],
  })
})

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? "Connected" : "Disconnected",
  })
})

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(500).json({ error: "Something went wrong!" })
})

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({ error: "Route not found" })
})

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
