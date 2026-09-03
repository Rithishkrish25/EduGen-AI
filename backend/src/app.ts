import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { env } from "./config/env";
import { errorMiddleware } from "./middleware/error.middleware";
import adminRoutes from "./routes/admin.routes";
import authRoutes from "./routes/auth.routes";
import dashboardRoutes from "./routes/dashboard.routes";
import documentsRoutes from "./routes/documents.routes";
import healthRoutes from "./routes/health.routes";
import ollamaRoutes from "./routes/ollama.routes";
import ragRoutes from "./routes/rag.routes";
import assignmentRoutes from "./routes/assignment.routes";
import staffRoutes from "./routes/staff.routes";
import studentRoutes from "./routes/student.routes";

const app = express();

app.use(cors({ origin: env.frontendUrl, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.use("/api", healthRoutes);
app.use("/api", ollamaRoutes);
app.use("/api/auth", authRoutes);
app.use("/api", dashboardRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/staff", assignmentRoutes);
app.use("/api/student", studentRoutes);
app.use("/api/documents", documentsRoutes);
app.use("/api/rag", ragRoutes);

app.use(errorMiddleware);

export default app;
