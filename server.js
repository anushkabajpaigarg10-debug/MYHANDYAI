
require("dotenv").config();

const express = require("express");
const path = require("path");
const { Pool } = require("pg");

const app = express();
const PORT = Number(process.env.PORT) || 3000;

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || "myhandyai",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD,
});

app.use(express.json());

app.post("/api/register", async (req, res) => {
  const {
    institutionCode,
    fullName,
    email,
    password,
    role,
    studentId,
    course,
    semester,
    department
  } = req.body;

  if (
    !institutionCode ||
    !fullName ||
    !email ||
    !password ||
    !["student", "faculty"].includes(role)
  ) {
    return res.status(400).json({
      success: false,
      message: "Please fill in all required fields."
    });
  }

  if (password.length < 8) {
    return res.status(400).json({
      success: false,
      message: "Password must be at least 8 characters."
    });
  }

  try {
    const institutionResult = await pool.query(
      `SELECT id FROM institutions
       WHERE institution_code = $1`,
      [institutionCode.trim()]
    );

    if (institutionResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Institution code not found."
      });
    }

    const institutionId = institutionResult.rows[0].id;

    const existingUser = await pool.query(
      `SELECT id FROM users
       WHERE institution_id = $1 AND LOWER(email) = LOWER($2)`,
      [institutionId, email.trim()]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists."
      });
    }

    const bcrypt = require("bcrypt");
    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO users
       (institution_id, full_name, email, password_hash,
        role, department, course, semester)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, full_name, email, role`,
      [
        institutionId,
        fullName.trim(),
        email.trim().toLowerCase(),
        passwordHash,
        role,
        department || null,
        role === "student" ? course || null : null,
        role === "student" && semester ? Number(semester) : null
      ]
    );

    res.status(201).json({
      success: true,
      message: "Account created successfully!",
      user: result.rows[0]
    });
  } catch (error) {
    console.error("Registration failed:", error.message);

    res.status(500).json({
      success: false,
      message: "Registration failed. Please try again."
    });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "MYHANDYAI backend is running!",
  });
});

app.get("/api/db-test", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT current_database() AS database"
    );

    res.json({
      success: true,
      message: "PostgreSQL connected successfully!",
      database: result.rows[0].database,
    });
  } catch (error) {
    console.error("Database test failed:", error.message);
    res.status(500).json({
      success: false,
      message: "Database connection failed. Check your .env file.",
    });
  }
});

app.get("/api/tables", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name"
    );

    res.json({
      success: true,
      count: result.rows.length,
      tables: result.rows.map((row) => row.table_name),
    });
  } catch (error) {
    console.error("Table check failed:", error.message);
    res.status(500).json({
      success: false,
      message: "Could not read database tables.",
    });
  }
});

async function startServer() {
  try {
    await pool.query("SELECT 1");

    app.listen(PORT, () => {
      console.log(`MYHANDYAI is running at http://localhost:${PORT}`);
      console.log("PostgreSQL connection successful.");
    });
  } catch (error) {
    console.error("Could not connect to PostgreSQL:", error.message);
    process.exit(1);
  }
}

startServer();
