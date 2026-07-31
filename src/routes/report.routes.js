const express = require("express");
const prisma = require("../database/prisma");

const router = express.Router();

function getDefaultStartDate() {
  const date = new Date();
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date;
}

function getDefaultEndDate() {
  const date = new Date();
  date.setHours(23, 59, 59, 999);
  return date;
}

function parseDate(value, fallback, endOfDay = false) {
  if (!value) return fallback;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  if (endOfDay) {
    date.setHours(23, 59, 59, 999);
  } else {
    date.setHours(0, 0, 0, 0);
  }

  return date;
}

function formatDateToString(date) {
  return date.toISOString().slice(0, 10);
}

function getCompanyFilter(req) {
  if (req.user?.role === "super_admin") {
    return {};
  }

  return {
    companyId: req.user?.companyId,
  };
}

function getRequestedCompanyId(req) {
  if (req.user?.role === "super_admin" && req.query.companyId) {
    return req.query.companyId;
  }

  return req.user?.companyId;
}

router.get("/summary", async (req, res) => {
  try {
    const startDate = parseDate(req.query.startDate, getDefaultStartDate());
    const endDate = parseDate(req.query.endDate, getDefaultEndDate(), true);
    const requestedCompanyId = getRequestedCompanyId(req);

    if (!requestedCompanyId && req.user?.role !== "super_admin") {
      return res.status(403).json({
        message: "Usuário não está vinculado a uma empresa.",
      });
    }

    const baseCompanyWhere =
      req.user?.role === "super_admin" && requestedCompanyId
        ? { companyId: requestedCompanyId }
        : getCompanyFilter(req);

    const appointmentWhere = {
      ...baseCompanyWhere,
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    };

    const clientWhere = {
      ...baseCompanyWhere,
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    };

    const [
      totalAppointments,
      pendingAppointments,
      confirmedAppointments,
      completedAppointments,
      cancelledAppointments,
      newClients,
      activeServices,
      activeProfessionals,
      totalCompanies,
      activeCompanies,
      trialCompanies,
      activeSubscriptions,
      overdueSubscriptions,
      cancelledSubscriptions,
    ] = await Promise.all([
      prisma.appointment.count({
        where: appointmentWhere,
      }),

      prisma.appointment.count({
        where: {
          ...appointmentWhere,
          status: "pending",
        },
      }),

      prisma.appointment.count({
        where: {
          ...appointmentWhere,
          status: "confirmed",
        },
      }),

      prisma.appointment.count({
        where: {
          ...appointmentWhere,
          status: "completed",
        },
      }),

      prisma.appointment.count({
        where: {
          ...appointmentWhere,
          status: "cancelled",
        },
      }),

      prisma.client.count({
        where: clientWhere,
      }),

      prisma.service.count({
        where: {
          ...baseCompanyWhere,
          status: "active",
        },
      }),

      prisma.professional.count({
        where: {
          ...baseCompanyWhere,
          status: "active",
        },
      }),

      req.user?.role === "super_admin"
        ? prisma.company.count()
        : Promise.resolve(null),

      req.user?.role === "super_admin"
        ? prisma.company.count({
            where: {
              status: "active",
            },
          })
        : Promise.resolve(null),

      req.user?.role === "super_admin"
        ? prisma.company.count({
            where: {
              subscriptionStatus: "trial",
            },
          })
        : Promise.resolve(null),

      req.user?.role === "super_admin"
        ? prisma.company.count({
            where: {
              subscriptionStatus: "active",
            },
          })
        : Promise.resolve(null),

      req.user?.role === "super_admin"
        ? prisma.company.count({
            where: {
              subscriptionStatus: "overdue",
            },
          })
        : Promise.resolve(null),

      req.user?.role === "super_admin"
        ? prisma.company.count({
            where: {
              subscriptionStatus: "cancelled",
            },
          })
        : Promise.resolve(null),
    ]);

    const appointmentsForRevenue = await prisma.appointment.findMany({
      where: appointmentWhere,
      include: {
        service: {
          select: {
            id: true,
            name: true,
            price: true,
          },
        },
      },
    });

    const estimatedRevenue = appointmentsForRevenue.reduce((total, item) => {
      if (item.status === "cancelled") return total;
      return total + Number(item.service?.price || 0);
    }, 0);

    return res.json({
      period: {
        startDate: formatDateToString(startDate),
        endDate: formatDateToString(endDate),
      },
      summary: {
        totalAppointments,
        pendingAppointments,
        confirmedAppointments,
        completedAppointments,
        cancelledAppointments,
        newClients,
        activeServices,
        activeProfessionals,
        estimatedRevenue,
      },
      admin:
        req.user?.role === "super_admin"
          ? {
              totalCompanies,
              activeCompanies,
              trialCompanies,
              activeSubscriptions,
              overdueSubscriptions,
              cancelledSubscriptions,
            }
          : null,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Erro ao carregar resumo dos relatórios.",
      error: error.message,
    });
  }
});

router.get("/services", async (req, res) => {
  try {
    const startDate = parseDate(req.query.startDate, getDefaultStartDate());
    const endDate = parseDate(req.query.endDate, getDefaultEndDate(), true);
    const requestedCompanyId = getRequestedCompanyId(req);

    if (!requestedCompanyId && req.user?.role !== "super_admin") {
      return res.status(403).json({
        message: "Usuário não está vinculado a uma empresa.",
      });
    }

    const baseCompanyWhere =
      req.user?.role === "super_admin" && requestedCompanyId
        ? { companyId: requestedCompanyId }
        : getCompanyFilter(req);

    const appointments = await prisma.appointment.findMany({
      where: {
        ...baseCompanyWhere,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        service: {
          select: {
            id: true,
            name: true,
            price: true,
          },
        },
      },
    });

    const serviceMap = new Map();

    appointments.forEach((appointment) => {
      const serviceId = appointment.service?.id || "unknown";
      const serviceName = appointment.service?.name || "Serviço não informado";
      const servicePrice = Number(appointment.service?.price || 0);

      if (!serviceMap.has(serviceId)) {
        serviceMap.set(serviceId, {
          id: serviceId,
          name: serviceName,
          totalAppointments: 0,
          pendingAppointments: 0,
          confirmedAppointments: 0,
          completedAppointments: 0,
          cancelledAppointments: 0,
          estimatedRevenue: 0,
        });
      }

      const current = serviceMap.get(serviceId);

      current.totalAppointments += 1;

      if (appointment.status === "pending") {
        current.pendingAppointments += 1;
      }

      if (appointment.status === "confirmed") {
        current.confirmedAppointments += 1;
      }

      if (appointment.status === "completed") {
        current.completedAppointments += 1;
      }

      if (appointment.status === "cancelled") {
        current.cancelledAppointments += 1;
      } else {
        current.estimatedRevenue += servicePrice;
      }
    });

    const services = Array.from(serviceMap.values()).sort(
      (a, b) => b.totalAppointments - a.totalAppointments
    );

    return res.json({
      period: {
        startDate: formatDateToString(startDate),
        endDate: formatDateToString(endDate),
      },
      services,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Erro ao carregar relatório por serviços.",
      error: error.message,
    });
  }
});

router.get("/professionals", async (req, res) => {
  try {
    const startDate = parseDate(req.query.startDate, getDefaultStartDate());
    const endDate = parseDate(req.query.endDate, getDefaultEndDate(), true);
    const requestedCompanyId = getRequestedCompanyId(req);

    if (!requestedCompanyId && req.user?.role !== "super_admin") {
      return res.status(403).json({
        message: "Usuário não está vinculado a uma empresa.",
      });
    }

    const baseCompanyWhere =
      req.user?.role === "super_admin" && requestedCompanyId
        ? { companyId: requestedCompanyId }
        : getCompanyFilter(req);

    const appointments = await prisma.appointment.findMany({
      where: {
        ...baseCompanyWhere,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        professional: {
          select: {
            id: true,
            name: true,
          },
        },
        service: {
          select: {
            price: true,
          },
        },
      },
    });

    const professionalMap = new Map();

    appointments.forEach((appointment) => {
      const professionalId = appointment.professional?.id || "unknown";
      const professionalName =
        appointment.professional?.name || "Profissional não informado";
      const servicePrice = Number(appointment.service?.price || 0);

      if (!professionalMap.has(professionalId)) {
        professionalMap.set(professionalId, {
          id: professionalId,
          name: professionalName,
          totalAppointments: 0,
          pendingAppointments: 0,
          confirmedAppointments: 0,
          completedAppointments: 0,
          cancelledAppointments: 0,
          estimatedRevenue: 0,
        });
      }

      const current = professionalMap.get(professionalId);

      current.totalAppointments += 1;

      if (appointment.status === "pending") {
        current.pendingAppointments += 1;
      }

      if (appointment.status === "confirmed") {
        current.confirmedAppointments += 1;
      }

      if (appointment.status === "completed") {
        current.completedAppointments += 1;
      }

      if (appointment.status === "cancelled") {
        current.cancelledAppointments += 1;
      } else {
        current.estimatedRevenue += servicePrice;
      }
    });

    const professionals = Array.from(professionalMap.values()).sort(
      (a, b) => b.totalAppointments - a.totalAppointments
    );

    return res.json({
      period: {
        startDate: formatDateToString(startDate),
        endDate: formatDateToString(endDate),
      },
      professionals,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Erro ao carregar relatório por profissionais.",
      error: error.message,
    });
  }
});

router.get("/appointments-by-day", async (req, res) => {
  try {
    const startDate = parseDate(req.query.startDate, getDefaultStartDate());
    const endDate = parseDate(req.query.endDate, getDefaultEndDate(), true);
    const requestedCompanyId = getRequestedCompanyId(req);

    if (!requestedCompanyId && req.user?.role !== "super_admin") {
      return res.status(403).json({
        message: "Usuário não está vinculado a uma empresa.",
      });
    }

    const baseCompanyWhere =
      req.user?.role === "super_admin" && requestedCompanyId
        ? { companyId: requestedCompanyId }
        : getCompanyFilter(req);

    const appointments = await prisma.appointment.findMany({
      where: {
        ...baseCompanyWhere,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        date: true,
        status: true,
      },
      orderBy: {
        date: "asc",
      },
    });

    const dayMap = new Map();

    appointments.forEach((appointment) => {
      const date = appointment.date || "Sem data";

      if (!dayMap.has(date)) {
        dayMap.set(date, {
          date,
          totalAppointments: 0,
          pendingAppointments: 0,
          confirmedAppointments: 0,
          completedAppointments: 0,
          cancelledAppointments: 0,
        });
      }

      const current = dayMap.get(date);

      current.totalAppointments += 1;

      if (appointment.status === "pending") {
        current.pendingAppointments += 1;
      }

      if (appointment.status === "confirmed") {
        current.confirmedAppointments += 1;
      }

      if (appointment.status === "completed") {
        current.completedAppointments += 1;
      }

      if (appointment.status === "cancelled") {
        current.cancelledAppointments += 1;
      }
    });

    const days = Array.from(dayMap.values()).sort((a, b) =>
      String(a.date).localeCompare(String(b.date))
    );

    return res.json({
      period: {
        startDate: formatDateToString(startDate),
        endDate: formatDateToString(endDate),
      },
      days,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Erro ao carregar relatório diário.",
      error: error.message,
    });
  }
});

router.get("/companies", async (req, res) => {
  try {
    if (req.user?.role !== "super_admin") {
      return res.status(403).json({
        message: "Acesso permitido apenas para Super Admin.",
      });
    }

    const companies = await prisma.company.findMany({
      orderBy: {
        name: "asc",
      },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        plan: true,
        subscriptionStatus: true,
      },
    });

    return res.json(companies);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Erro ao carregar empresas para relatório.",
      error: error.message,
    });
  }
});

module.exports = router;