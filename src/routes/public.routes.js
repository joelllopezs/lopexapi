const express = require("express");
const prisma = require("../database/prisma");

const router = express.Router();

function timeToMinutes(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(minutes) {
  const hours = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mins = String(minutes % 60).padStart(2, "0");

  return `${hours}:${mins}`;
}

function getDayOfWeek(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  return date.getDay();
}

function hasConflict(slotStart, slotEnd, appointment) {
  const appointmentStart = timeToMinutes(appointment.startTime);
  const appointmentEnd = timeToMinutes(appointment.endTime);

  return slotStart < appointmentEnd && slotEnd > appointmentStart;
}

router.get("/company/:slug", async (req, res) => {
  try {
    const { slug } = req.params;

    const company = await prisma.company.findUnique({
      where: {
        slug,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        email: true,
        phone: true,
        logoUrl: true,
        primaryColor: true,
        status: true,
      },
    });

    if (!company) {
      return res.status(404).json({
        message: "Empresa não encontrada.",
      });
    }

    if (company.status !== "active") {
      return res.status(403).json({
        message: "Empresa indisponível para agendamentos.",
      });
    }

    return res.json(company);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Erro ao buscar empresa.",
    });
  }
});

router.get("/company/:slug/services", async (req, res) => {
  try {
    const { slug } = req.params;

    const company = await prisma.company.findUnique({
      where: {
        slug,
      },
    });

    if (!company) {
      return res.status(404).json({
        message: "Empresa não encontrada.",
      });
    }

    if (company.status !== "active") {
      return res.status(403).json({
        message: "Empresa indisponível para agendamentos.",
      });
    }

    const services = await prisma.service.findMany({
      where: {
        companyId: company.id,
        status: "active",
      },
      orderBy: {
        name: "asc",
      },
    });

    return res.json(services);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Erro ao listar serviços.",
    });
  }
});

router.get("/company/:slug/professionals", async (req, res) => {
  try {
    const { slug } = req.params;

    const company = await prisma.company.findUnique({
      where: {
        slug,
      },
    });

    if (!company) {
      return res.status(404).json({
        message: "Empresa não encontrada.",
      });
    }

    if (company.status !== "active") {
      return res.status(403).json({
        message: "Empresa indisponível para agendamentos.",
      });
    }

    const professionals = await prisma.professional.findMany({
      where: {
        companyId: company.id,
        status: "active",
      },
      orderBy: {
        name: "asc",
      },
    });

    return res.json(professionals);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Erro ao listar profissionais.",
    });
  }
});

router.get("/company/:slug/availability", async (req, res) => {
  try {
    const { slug } = req.params;
    const { professionalId, serviceId, date } = req.query;

    if (!professionalId || !serviceId || !date) {
      return res.status(400).json({
        message: "Profissional, serviço e data são obrigatórios.",
      });
    }

    const company = await prisma.company.findUnique({
      where: {
        slug,
      },
    });

    if (!company) {
      return res.status(404).json({
        message: "Empresa não encontrada.",
      });
    }

    if (company.status !== "active") {
      return res.status(403).json({
        message: "Empresa indisponível para agendamentos.",
      });
    }

    const service = await prisma.service.findFirst({
      where: {
        id: professionalId ? serviceId : undefined,
        companyId: company.id,
        status: "active",
      },
    });

    if (!service) {
      return res.status(404).json({
        message: "Serviço não encontrado.",
      });
    }

    const professional = await prisma.professional.findFirst({
      where: {
        id: professionalId,
        companyId: company.id,
        status: "active",
      },
    });

    if (!professional) {
      return res.status(404).json({
        message: "Profissional não encontrado.",
      });
    }

    const dayOfWeek = getDayOfWeek(date);

    const businessHour = await prisma.businessHour.findUnique({
      where: {
        companyId_dayOfWeek: {
          companyId: company.id,
          dayOfWeek,
        },
      },
    });

    if (!businessHour || !businessHour.isOpen) {
      return res.json({
        isOpen: false,
        availableTimes: [],
      });
    }

    const appointments = await prisma.appointment.findMany({
      where: {
        companyId: company.id,
        professionalId,
        date,
        status: {
          not: "cancelled",
        },
      },
    });

    const duration = service.duration || 30;
    const openMinutes = timeToMinutes(businessHour.openTime);
    const closeMinutes = timeToMinutes(businessHour.closeTime);
    const breakStartMinutes = businessHour.breakStart
      ? timeToMinutes(businessHour.breakStart)
      : null;
    const breakEndMinutes = businessHour.breakEnd
      ? timeToMinutes(businessHour.breakEnd)
      : null;

    const availableTimes = [];

    for (
      let current = openMinutes;
      current + duration <= closeMinutes;
      current += duration
    ) {
      const slotStart = current;
      const slotEnd = current + duration;

      const isInsideBreak =
        breakStartMinutes !== null &&
        breakEndMinutes !== null &&
        slotStart < breakEndMinutes &&
        slotEnd > breakStartMinutes;

      if (isInsideBreak) {
        continue;
      }

      const hasAppointmentConflict = appointments.some((appointment) =>
        hasConflict(slotStart, slotEnd, appointment)
      );

      if (hasAppointmentConflict) {
        continue;
      }

      availableTimes.push({
        startTime: minutesToTime(slotStart),
        endTime: minutesToTime(slotEnd),
      });
    }

    return res.json({
      isOpen: true,
      availableTimes,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Erro ao buscar disponibilidade.",
    });
  }
});

router.post("/company/:slug/appointments", async (req, res) => {
  try {
    const { slug } = req.params;

    const {
      serviceId,
      professionalId,
      date,
      startTime,
      endTime,
      clientName,
      clientEmail,
      clientPhone,
      notes,
    } = req.body || {};

    if (
      !serviceId ||
      !professionalId ||
      !date ||
      !startTime ||
      !endTime ||
      !clientName
    ) {
      return res.status(400).json({
        message:
          "Serviço, profissional, data, horário e nome do cliente são obrigatórios.",
      });
    }

    const company = await prisma.company.findUnique({
      where: {
        slug,
      },
    });

    if (!company) {
      return res.status(404).json({
        message: "Empresa não encontrada.",
      });
    }

    if (company.status !== "active") {
      return res.status(403).json({
        message: "Empresa indisponível para agendamentos.",
      });
    }

    const service = await prisma.service.findFirst({
      where: {
        id: serviceId,
        companyId: company.id,
        status: "active",
      },
    });

    if (!service) {
      return res.status(404).json({
        message: "Serviço não encontrado.",
      });
    }

    const professional = await prisma.professional.findFirst({
      where: {
        id: professionalId,
        companyId: company.id,
        status: "active",
      },
    });

    if (!professional) {
      return res.status(404).json({
        message: "Profissional não encontrado.",
      });
    }

    const conflict = await prisma.appointment.findFirst({
      where: {
        companyId: company.id,
        professionalId,
        date,
        status: {
          not: "cancelled",
        },
        OR: [
          {
            startTime: {
              lt: endTime,
            },
            endTime: {
              gt: startTime,
            },
          },
        ],
      },
    });

    if (conflict) {
      return res.status(400).json({
        message: "Este horário não está mais disponível.",
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const client = await tx.client.create({
        data: {
          companyId: company.id,
          name: clientName,
          email: clientEmail || null,
          phone: clientPhone || null,
        },
      });

      const appointment = await tx.appointment.create({
        data: {
          companyId: company.id,
          serviceId,
          professionalId,
          clientId: client.id,
          date,
          startTime,
          endTime,
          status: "pending",
          notes: notes || null,
        },
        include: {
          service: true,
          professional: true,
          client: true,
          company: true,
        },
      });

      return appointment;
    });

    return res.status(201).json({
      message: "Agendamento criado com sucesso.",
      appointment: result,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Erro ao criar agendamento.",
    });
  }
});

module.exports = router;