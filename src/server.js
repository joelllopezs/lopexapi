const express = require("express");
const cors = require("cors");
require("dotenv").config();

const publicRoutes = require("./routes/public.routes");
const companyRoutes = require("./routes/company.routes");
const serviceRoutes = require("./routes/service.routes");
const professionalRoutes = require("./routes/professional.routes");
const clientRoutes = require("./routes/client.routes");
const appointmentRoutes = require("./routes/appointment.routes");
const availabilityRoutes = require("./routes/availability.routes");
const authRoutes = require("./routes/auth.routes");
const authMiddleware = require("./middlewares/auth.middleware");
const subscriptionMiddleware = require("./middlewares/subscription.middleware");
const businessHourRoutes = require("./routes/businessHour.routes");
const adminRoutes = require("./routes/admin.routes");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  return res.json({
    message: "API Lopex Agenda rodando com sucesso",
    version: "1.0.0",
  });
});

app.get("/health", (req, res) => {
  return res.json({
    status: "ok",
    message: "API Lopex Agenda operacional",
    timestamp: new Date().toISOString(),
  });
});

app.use("/auth", authRoutes);

app.use("/public", publicRoutes);

app.use("/companies", authMiddleware, companyRoutes);

app.use(
  "/services",
  authMiddleware,
  subscriptionMiddleware,
  serviceRoutes
);

app.use(
  "/professionals",
  authMiddleware,
  subscriptionMiddleware,
  professionalRoutes
);

app.use(
  "/clients",
  authMiddleware,
  subscriptionMiddleware,
  clientRoutes
);

app.use(
  "/appointments",
  authMiddleware,
  subscriptionMiddleware,
  appointmentRoutes
);

app.use(
  "/availability",
  authMiddleware,
  subscriptionMiddleware,
  availabilityRoutes
);

app.use(
  "/business-hours",
  authMiddleware,
  subscriptionMiddleware,
  businessHourRoutes
);

app.use("/admin", adminRoutes);

const PORT = process.env.PORT || 3333;

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});