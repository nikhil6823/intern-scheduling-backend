import express from "express";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import cors from "cors";
import dotenv from "dotenv";
import Intern from "./models/internModel.js";
import LeaveRequest from "./models/leaveSchema.js";
import Department from "./models/departmentSchema.js";
import Schedule from "./models/scheduleSchema.js";
import { verifyToken } from "./utils/verifyToken.js";
import { OpenAI } from "openai";

dotenv.config();

const app = express();

// Middleware
app.use(express.json());

// 🔹 Fix: Manual CORS headers (for Vercel)
app.use((req, res, next) => {
  const allowedOrigins = [
    "https://intern-scheduling.vercel.app",
    "http://localhost:5173", // allow dev frontend
  ];

  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
  }

  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Optional: keep cors() for safety
app.use(
  cors({
    origin: ["https://intern-scheduling.vercel.app", "http://localhost:5173"],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// ✅ MongoDB Connection
mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ MongoDB connected"))
  .catch((error) => console.error("❌ MongoDB connection error:", error));

// ✅ JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret";

// ✅ OpenRouter API
const openrouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

// ===== ROUTES =====

// Register Intern
app.post("/register", async (req, res) => {
  try {
    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    const intern = new Intern({ ...req.body, password: hashedPassword });
    await intern.save();
    res.status(201).send("Intern registered successfully");
  } catch (error) {
    console.error("❌ Error registering intern:", error.message);
    res.status(500).send("Internal server error");
  }
});

// Login Intern
app.post("/login", async (req, res) => {
  try {
    const intern = await Intern.findOne({ email: req.body.email });
    if (!intern) return res.status(404).send("Intern not found");

    const isPasswordValid = await bcrypt.compare(
      req.body.password,
      intern.password
    );
    if (!isPasswordValid) return res.status(401).send("Invalid credentials");

    const token = jwt.sign({ id: intern._id }, JWT_SECRET, {
      expiresIn: "1h",
    });
    res.json({ token });
  } catch (error) {
    console.error("❌ Error logging in:", error.message);
    res.status(500).send("Internal server error");
  }
});

// Leave Request
app.post("/leave-request", verifyToken, async (req, res) => {
  try {
    const leaveRequest = new LeaveRequest({
      intern: req.user.id,
      ...req.body,
    });
    await leaveRequest.save();
    res.status(201).send("Leave request submitted successfully");
  } catch (error) {
    console.error("❌ Error submitting leave request:", error.message);
    res.status(500).send("Internal server error");
  }
});

// Nominee Approval
app.put("/leave-request/:id/approve", verifyToken, async (req, res) => {
  try {
    const leaveRequest = await LeaveRequest.findById(req.params.id);
    if (!leaveRequest) return res.status(404).send("Leave request not found");

    leaveRequest.nomineeApproved = true;
    await leaveRequest.save();
    res.send("Leave request approved by nominee");
  } catch (error) {
    console.error("❌ Error approving leave request:", error.message);
    res.status(500).send("Internal server error");
  }
});

// Admin Approval
app.put("/leave-request/:id/admin-approve", verifyToken, async (req, res) => {
  try {
    const leaveRequest = await LeaveRequest.findById(req.params.id);
    if (!leaveRequest) return res.status(404).send("Leave request not found");

    leaveRequest.adminApproved = true;
    await leaveRequest.save();
    res.send("Leave request approved by admin");
  } catch (error) {
    console.error("❌ Error approving leave request by admin:", error.message);
    res.status(500).send("Internal server error");
  }
});

// Get All Leave Requests
app.get("/leave-requests", verifyToken, async (req, res) => {
  try {
    const leaveRequests = await LeaveRequest.find().populate("intern nominee");
    res.json(leaveRequests);
  } catch (error) {
    console.error("❌ Error fetching leave requests:", error.message);
    res.status(500).send("Internal server error");
  }
});

// Department Management
app.post("/departments", verifyToken, async (req, res) => {
  try {
    const department = new Department(req.body);
    await department.save();
    res.status(201).send("Department added successfully");
  } catch (error) {
    console.error("❌ Error adding department:", error.message);
    res.status(500).send("Internal server error");
  }
});

app.get("/departments", verifyToken, async (req, res) => {
  try {
    const departments = await Department.find();
    res.json(departments);
  } catch (error) {
    console.error("❌ Error fetching departments:", error.message);
    res.status(500).send("Internal server error");
  }
});

// Generate Schedules
app.post("/generate-schedules", verifyToken, async (req, res) => {
  try {
    const interns = await Intern.find();
    const departments = await Department.find();
    let currentDepartments = [...departments];
    let weekCounter = 1;

    for (const intern of interns) {
      if (currentDepartments.length === 0) {
        currentDepartments = [...departments];
      }
      const department = currentDepartments.shift();
      const schedule = new Schedule({
        intern: intern._id,
        department: department._id,
        week: weekCounter,
      });
      await schedule.save();
      currentDepartments.push(department);
      weekCounter++;
    }

    res.send("Schedules generated successfully");
  } catch (error) {
    console.error("❌ Error generating schedules:", error.message);
    res.status(500).send("Internal server error");
  }
});

// Chatbot Route (OpenRouter AI)
app.post("/chatbot", verifyToken, async (req, res) => {
  try {
    const response = await openrouter.chat.completions.create({
      model: "deepseek/deepseek-chat-v3-0324:free",
      messages: [{ role: "user", content: req.body.message }],
    });
    res.json({ reply: response.choices[0].message.content });
  } catch (error) {
    console.error("❌ Chatbot error:", error.message);
    res.status(500).send("Error connecting to AI chatbot");
  }
});

// Root Route
app.get("/", (req, res) => {
  res.send("Intern scheduling backend running...");
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
