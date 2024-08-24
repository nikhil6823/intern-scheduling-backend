const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const path = require("path");
const cors = require("cors");
const middleware = express.json();

const app = express();
const port = 3000;

app.use(
  cors({
    origin: "https://intern-scheduling.vercel.app",
    headers: ["Content-Type", "Authorization"],
  })
);

mongoose.connect(
  "mongodb+srv://nikhil6823:nikhil6823@internmanagement.yrk0s.mongodb.net/?retryWrites=true&w=majority&appName=internManagement"
);

const Intern = require("./models/internModel");
const Leave = require("./models/leaveSchema");
const Department = require("./models/departmentSchema");
const Schedule = require("./models/scheduleSchema");

app.use(bodyParser.urlencoded({ extended: true }));
app.use(middleware);

async function generateSchedules(departments, interns) {
  const schedules = [];

  let currentDepartments = [...departments];

  for (const intern of interns) {
    let weekCounter = 1;
    const internSchedule = [];

    // Make a copy to manipulate

    for (const department of currentDepartments) {
      const weeksInDepartment = department.week;

      for (let i = 0; i < weeksInDepartment; i++) {
        internSchedule.push({
          internId: intern._id,
          departmentId: department._id,
          week: weekCounter++,
        });
      }

      // Rotate departments for the next intern

      console.log(currentDepartments);
    }
    currentDepartments.push(currentDepartments.shift());
    schedules.push(internSchedule);
  }

  return schedules;
}

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

app.post("/register", async (req, res) => {
  try {
    const existingUser = await Intern.findOne({
      $or: [{ username: req.body.username }, { email: req.body.email }],
    });
    if (existingUser) {
      return res
        .status(400)
        .json({ message: "Username or email already exists." });
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
    res.json({ message: "Intern registration successful." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.post("/login", async (req, res) => {
  console.log(req.body);
  try {
    const intern = await Intern.findOne({ username: req.body.username });
    console.log(intern);
    if (
      !intern ||
      !(await bcrypt.compare(req.body.password, intern.password))
    ) {
      return res.status(401).json({ message: "Invalid username or password." });
    }

    const token = jwt.sign({ userId: intern._id }, "your-secret-key", {
      expiresIn: "1h",
    });
    res.json({ status: "ok", token });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.get("/intern-details", verifyToken, async (req, res) => {
  const userId = req.userId;
  const User = await Intern.findOne({ _id: userId });
  console.log(User);

  res.json({ User });
});

app.get("/interns", async (req, res) => {
  try {
    const interns = await Intern.find();
    res.json(interns);
  } catch (error) {
    console.error("Error fetching interns:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.put("/interns/update", async (req, res) => {
  try {
    const { name, newDomain } = req.body;

    // Update the intern's domain using findByIdAndUpdate
    const updatedIntern = await Intern.findOneAndUpdate(
      { username: name },
      { $set: { domain: newDomain } },
      { new: true } // Returns the updated document
    );

    if (!updatedIntern) {
      return res
        .status(404)
        .json({ message: "Intern not found for the given name." });
    }

    res.json({ message: "Intern domain updated successfully.", updatedIntern });
  } catch (error) {
    console.error("Error updating intern domain:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.post("/intern/leave-request", verifyToken, async (req, res) => {
  const userId = req.userId;

  const { reason, startDate, endDate, nominatedIntern } = req.body;
  if (!userId || !startDate || !endDate || !reason || !nominatedIntern) {
    return res
      .status(400)
      .json({ success: false, message: "Missing required parameters" });
  }

  try {
    const intern = await Intern.findById(userId);
    if (!intern) {
      return res
        .status(404)
        .json({ success: false, message: "Intern not found" });
    }
    const newLeave = new Leave({
      internName: intern.username,
      reason,
      startDate,
      endDate,
      nominatedIntern,
    });
    await newLeave.save();

    intern.leaveRequests.push(newLeave);

    await intern.save();
    res.json({
      success: true,
      message: "Leave request submitted successfully",
    });
  } catch (error) {
    console.error("Error submitting leave request:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/intern/leave-requests", verifyToken, async (req, res) => {
  const userId = req.userId;

  if (!userId) {
    return res.status(400).json({ success: false, message: "Missing user ID" });
  }

  try {
    const intern = await Intern.findById(userId);
    if (!intern) {
      return res
        .status(404)
        .json({ success: false, message: "Intern not found" });
    }

    const leaveRequests = await Leave.find({
      nominatedIntern: intern.username,
    });
    res.json({ success: true, leaveRequests });
  } catch (error) {
    console.error("Error fetching leave requests:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/user/leaves", verifyToken, async (req, res) => {
  const userId = req.userId;
  try {
    const intern = await Intern.findById(userId);
    if (!intern) {
      return res
        .status(404)
        .json({ success: false, message: "Intern not found" });
    }

    const username = intern.username;
    const leaves = await Leave.find({ internName: username });

    res.json({ success: true, leaves });
  } catch (error) {
    console.error("Error fetching leaves:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.put("/leave-requests/:id/approve", async (req, res) => {
  const leaveRequestId = req.params.id;

  try {
    const leaveRequest = await Leave.findByIdAndUpdate(
      leaveRequestId,
      { internStatus: "approved" },
      { new: true }
    );

    if (!leaveRequest) {
      return res
        .status(404)
        .json({ success: false, message: "Leave request not found" });
    }

    res.json({
      success: true,
      message: "Leave request approved successfully",
      leaveRequest,
    });
  } catch (error) {
    console.error("Error approving leave request:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.put("/leave-requests/:id/reject", async (req, res) => {
  const leaveRequestId = req.params.id;

  try {
    const leaveRequest = await Leave.findByIdAndUpdate(
      leaveRequestId,
      { internStatus: "rejected" },
      { new: true }
    );

    if (!leaveRequest) {
      return res
        .status(404)
        .json({ success: false, message: "Leave request not found" });
    }

    res.json({
      success: true,
      message: "Leave request rejected successfully",
      leaveRequest,
    });
  } catch (error) {
    console.error("Error rejecting leave request:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/admin/leaves", async (req, res) => {
  try {
    const leaves = await Leave.find();
    res.json({ success: true, leaves });
  } catch (error) {
    console.error("Error fetching leaves:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.put("/admin/leave-requests/:id/approve", async (req, res) => {
  const leaveRequestId = req.params.id;

  try {
    const leaveRequest = await Leave.findByIdAndUpdate(
      leaveRequestId,
      { adminStatus: "approved" },
      { new: true }
    );

    if (!leaveRequest) {
      return res
        .status(404)
        .json({ success: false, message: "Leave request not found" });
    }

    res.json({
      success: true,
      message: "Leave request approved successfully",
      leaveRequest,
    });
  } catch (error) {
    console.error("Error approving leave request:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.put("/admin/leave-requests/:id/reject", async (req, res) => {
  const leaveRequestId = req.params.id;

  try {
    const leaveRequest = await Leave.findByIdAndUpdate(
      leaveRequestId,
      { adminStatus: "rejected" },
      { new: true }
    );

    if (!leaveRequest) {
      return res
        .status(404)
        .json({ success: false, message: "Leave request not found" });
    }

    res.json({
      success: true,
      message: "Leave request rejected successfully",
      leaveRequest,
    });
  } catch (error) {
    console.error("Error rejecting leave request:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/departments", async (req, res) => {
  const { name, week } = req.body;

  try {
    const existingDepartment = await Department.findOne({ name });
    if (existingDepartment) {
      return res
        .status(400)
        .json({ success: false, message: "Department already exists" });
    }

    const department = new Department({ name, week });
    await department.save();

    res.status(201).json({
      success: true,
      message: "Department added successfully",
      department,
    });
  } catch (error) {
    console.error("Error adding department:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/get-departments", async (req, res) => {
  try {
    const departments = await Department.find();
    res.json({ success: true, departments });
  } catch (error) {
    console.error("Error fetching departments:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/assign-departments", async (req, res) => {
  try {
    await Schedule.deleteMany();
    const departments = await Department.find();
    const interns = await Intern.find();
    const weeklySchedules = await generateSchedules(departments, interns);

    const flatSchedules = weeklySchedules.reduce(
      (acc, val) => acc.concat(val),
      []
    );

    await Schedule.insertMany(flatSchedules);

    res.json({
      success: true,
      message: "Departments assigned to interns successfully for 52 weeks",
    });
  } catch (error) {
    console.error("Error assigning departments to interns:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});
app.get("/schedules", async (req, res) => {
  try {
    const schedules = await Schedule.find()
      .populate({
        path: "departmentId",
        select: "name",
      })
      .populate({
        path: "internId",
        select: "username",
      });

    res.json({ success: true, schedules });
  } catch (error) {
    console.error("Error fetching schedules:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/user/schedules", verifyToken, async (req, res) => {
  try {
    const userId = req.userId;
    const schedules = await Schedule.find({ internId: userId }).populate({
      path: "departmentId",
      select: "name",
    });
    res.json({ success: true, schedules });
  } catch (error) {
    console.error("Error fetching schedules:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/", (req, res) => {
  res.json({ message: "Intern Sheduling Project" });
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
