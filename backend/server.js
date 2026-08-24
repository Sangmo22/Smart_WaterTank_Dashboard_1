require("dotenv").config();
const app = require("./src/app");
const connectDB = require("./src/config/db");

// Connect to Database
connectDB();

const PORT = process.env.PORT || 5000;
// Cloud hosts (Render, Railway, Fly) require binding to 0.0.0.0
const HOST = process.env.HOST || "0.0.0.0";

const server = app.listen(PORT, HOST, () => {
  console.log(
    `Server running in ${process.env.NODE_ENV || "development"} mode on http://${HOST}:${PORT}`,
  );
});

// Handle unhandled promise rejections gracefully
process.on("unhandledRejection", (err, promise) => {
  console.error(`Error: ${err.message}`);
  // Close server & exit process
  server.close(() => process.exit(1));
});
