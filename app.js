const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cors = require("cors");
require("dotenv").config();

// ✅ OpenRouter SDK
const { OpenRouter } = require("@openrouter/sdk");

const app = express();
const port = process.env.PORT || 3000;

// ===== Middleware =====
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  cors({
    origin: "https://intern-scheduling.vercel.app",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// ===== DB Connection =====
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.log(err));

// ===== Models =====
const Intern = require("./models/internModel");
const Leave = require("./models/leaveSchema");
const Department = require("./models/departmentSchema");
const Schedule = require("./models/scheduleSchema");

// ===== OpenRouter Init =====
const openrouter = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

// ===== CHATBOT ROUTE (FIXED) =====
app.post("/chatbot", async (req, res) => {
  try {
    const userMessage = req.body.message;

    if (!userMessage) {
      return res.status(400).json({ error: "Message required" });
    }

    const completion = await openrouter.chat.send({
      model: "nvidia/nemotron-3-super-120b-a12b:free",
      messages: [
        {
          role: "user",
          content: userMessage,
        },
      ],
    });

    const reply =
      completion.choices?.[0]?.message?.content || "No response";

    res.json({ reply });

  } catch (error) {
    console.error("🔥 Chatbot ERROR:", error);
    res.status(500).json({ error: "Chatbot request failed" });
  }
});

// ===== Schedule Generator =====
async function generateSchedules(departments, interns) {
  const schedules = [];
  let currentDepartments = [...departments];

  for (const intern of interns) {
    let weekCounter = 1;
    const internSchedule = [];

    for (const department of currentDepartments) {
      for (let i = 0; i < department.week; i++) {
        internSchedule.push({
          internId: intern._id,
          departmentId: department._id,
          week: weekCounter++,
        });
      }
    }

    currentDepartments.push(currentDepartments.shift());
    schedules.push(internSchedule);
  }

  return schedules;
}

// ===== Auth Middleware =====
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Unauthorized - Missing Token" });
  }

  jwt.verify(token, "your-secret-key", (err, decoded) => {
    if (err) {
      return res.status(401).json({ message: "Unauthorized - Invalid Token" });
    }

    req.userId = decoded.userId;
    next();
  });
};

// ===== Auth Routes =====
app.post("/register", async (req, res) => {
  try {
    const existingUser = await Intern.findOne({
      $or: [{ username: req.body.username }, { email: req.body.email }],
    });

    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(req.body.password, 10);

    const newIntern = new Intern({
      email: req.body.email,
      username: req.body.username,
      phonenumber: req.body.phonenumber,
      contact: req.body.contact,
      password: hashedPassword,
      domain: "",
    });

    await newIntern.save();
    res.json({ message: "Registration successful" });

  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/login", async (req, res) => {
  try {
    const intern = await Intern.findOne({ username: req.body.username });

    if (!intern || !(await bcrypt.compare(req.body.password, intern.password))) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign({ userId: intern._id }, "your-secret-key", {
      expiresIn: "1h",
    });

    res.json({ token });

  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

// ===== Intern APIs =====
app.get("/intern-details", verifyToken, async (req, res) => {
  const user = await Intern.findById(req.userId);
  res.json({ user });
});

app.get("/interns", async (req, res) => {
  const interns = await Intern.find();
  res.json(interns);
});

app.put("/interns/update", async (req, res) => {
  const updatedIntern = await Intern.findOneAndUpdate(
    { username: req.body.name },
    { domain: req.body.newDomain },
    { new: true }
  );

  res.json(updatedIntern);
});

// ===== Leave APIs =====
app.post("/intern/leave-request", verifyToken, async (req, res) => {
  const intern = await Intern.findById(req.userId);

  const leave = new Leave({
    internName: intern.username,
    ...req.body,
  });

  await leave.save();
  intern.leaveRequests.push(leave);
  await intern.save();

  res.json({ success: true });
});

app.get("/user/leaves", verifyToken, async (req, res) => {
  const intern = await Intern.findById(req.userId);
  const leaves = await Leave.find({ internName: intern.username });
  res.json({ leaves });
});

// ===== Department =====
app.post("/departments", async (req, res) => {
  const department = new Department(req.body);
  await department.save();
  res.json(department);
});

app.get("/get-departments", async (req, res) => {
  const departments = await Department.find();
  res.json({ departments });
});

// ===== Schedule =====
app.post("/assign-departments", async (req, res) => {
  await Schedule.deleteMany();

  const departments = await Department.find();
  const interns = await Intern.find();

  const schedules = await generateSchedules(departments, interns);
  const flat = schedules.flat();

  await Schedule.insertMany(flat);

  res.json({ success: true });
});

app.get("/schedules", async (req, res) => {
  const schedules = await Schedule.find()
    .populate("departmentId", "name")
    .populate("internId", "username");

  res.json({ schedules });
});

app.get("/user/schedules", verifyToken, async (req, res) => {
  const schedules = await Schedule.find({ internId: req.userId })
    .populate("departmentId", "name");

  res.json({ schedules });
});

// ===== Root =====
app.get("/", (req, res) => {
  res.send("Backend running ✅");
});

// ===== Server =====
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
