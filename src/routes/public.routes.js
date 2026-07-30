const express = require("express");
const crypto = require("crypto");
const prisma = require("../database/prisma");

const router = express.Router();

const COMPANY_UNAVAILABLE_MESSAGE =
  "Esta empresa está temporariamente indisponível para agendamentos.";

const PUBLIC_CANCEL_LIMIT_HOURS = 2;

function generateCancelToken() {
  return crypto.randomBytes(32).toString("hex");
}

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

function isValidDate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(date || ""));
}

function isValidTime(time) {
  return /^\d{2}:\d{2}$/.test(String(time || ""));
}

function getAppointmentDateTime(date, time) {
  return new Date(`${date}T${time}:00`);
}

function canCancelAppointment(date, startTime) {
  const appointmentDateTime = getAppointmentDateTime(date, startTime);
  const now = new Date();

  const diffInMilliseconds = appointmentDateTime.getTime() - now.getTime();
  const diffInHours = diffInMilliseconds / (1000 * 60 * 60);

  return diffInHours >= PUBLIC_CANCEL_LIMIT_HOURS;
}

function buildCancelPath(appointmentId, cancelToken) {
  return `/agendar/cancelar/${appointmentId}/${cancelToken}`;
}

function buildCancelUrl(req, appointmentId, cancelToken) {
  const frontendUrl = process.env.FRONTEND_URL;

  if (frontendUrl) {
    return `${frontendUrl}${buildCancelPath(appointmentId, cancelToken)}`;
  }

  const origin = req.get("origin");

  if (origin) {
    return `${origin}${buildCancelPath(appointmentId, cancelToken)}`;
  }

  return buildCancelPath(appointmentId, cancelToken);
}

async function findActiveCompanyBySlug(slug) {
  const company = await prisma.company.findUnique({
    where: {
      slug,
    },
  });

  if (!company) {
    return {
      error: {
        status: 404,
        message: "Empresa não encontrada.",
      },
    };
  }

  if (company.status !== "active") {
    return {
      error: {
        status: 403,
        message: COMPANY_UNAVAILABLE_MESSAGE,
      },
    };
  }

  return {
    company,
  };
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
        message: COMPANY_UNAVAILABLE_MESSAGE,
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

    const { company, error } = await findActiveCompanyBySlug(slug);

    if (error) {
      return res.status(error.status).json({
        message: error.message,
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

    const { company, error } = await findActiveCompanyBySlug(slug);

    if (error) {
      return res.status(error.status).json({
        message: error.message,
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

    if (!isValidDate(date)) {
      return res.status(400).json({
        message: "Data inválida. Use o formato YYYY-MM-DD.",
      });
    }

    const { company, error } = await findActiveCompanyBySlug(slug);

    if (error) {
      return res.status(error.status).json({
        message: error.message,
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
        message: "Empresa fechada nesta data.",
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

    if (!isValidDate(date)) {
      return res.status(400).json({
        message: "Data inválida. Use o formato YYYY-MM-DD.",
      });
    }

    if (!isValidTime(startTime) || !isValidTime(endTime)) {
      return res.status(400).json({
        message: "Horário inválido. Use o formato HH:mm.",
      });
    }

    if (timeToMinutes(startTime) >= timeToMinutes(endTime)) {
      return res.status(400).json({
        message: "O horário inicial precisa ser menor que o horário final.",
      });
    }

    const { company, error } = await findActiveCompanyBySlug(slug);

    if (error) {
      return res.status(error.status).json({
        message: error.message,
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
        startTime: {
          lt: endTime,
        },
        endTime: {
          gt: startTime,
        },
      },
    });

    if (conflict) {
      return res.status(400).json({
        message: "Este horário não está mais disponível.",
      });
    }

    const cancelToken = generateCancelToken();

    const result = await prisma.$transaction(async (tx) => {
      const client = await tx.client.create({
        data: {
          companyId: company.id,
          name: String(clientName).trim(),
          email: clientEmail ? String(clientEmail).trim().toLowerCase() : null,
          phone: clientPhone ? String(clientPhone).trim() : null,
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
          notes: notes ? String(notes).trim() : null,
          cancelToken,
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
      cancelPath: buildCancelPath(result.id, cancelToken),
      cancelUrl: buildCancelUrl(req, result.id, cancelToken),
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Erro ao criar agendamento.",
    });
  }
});

router.get("/appointments/:id/cancel/:cancelToken", async (req, res) => {
  try {
    const { id, cancelToken } = req.params;

    const appointment = await prisma.appointment.findUnique({
      where: {
        id,
      },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            logoUrl: true,
            primaryColor: true,
          },
        },
        service: true,
        professional: true,
        client: true,
      },
    });

    if (!appointment || appointment.cancelToken !== cancelToken) {
      return res.status(404).json({
        message: "Agendamento não encontrado ou link inválido.",
      });
    }

    return res.json({
      appointment: {
        id: appointment.id,
        date: appointment.date,
        startTime: appointment.startTime,
        endTime: appointment.endTime,
        status: appointment.status,
        cancelledAt: appointment.cancelledAt,
        canCancel:
          appointment.status !== "cancelled" &&
          canCancelAppointment(appointment.date, appointment.startTime),
        company: appointment.company,
        service: appointment.service,
        professional: appointment.professional,
        client: appointment.client,
      },
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Erro ao buscar agendamento.",
    });
  }
});

router.post("/appointments/:id/cancel/:cancelToken", async (req, res) => {
  try {
    const { id, cancelToken } = req.params;

    const appointment = await prisma.appointment.findUnique({
      where: {
        id,
      },
      include: {
        company: true,
        service: true,
        professional: true,
        client: true,
      },
    });

    if (!appointment || appointment.cancelToken !== cancelToken) {
      return res.status(404).json({
        message: "Agendamento não encontrado ou link inválido.",
      });
    }

    if (appointment.company.status !== "active") {
      return res.status(403).json({
        message: COMPANY_UNAVAILABLE_MESSAGE,
      });
    }

    if (appointment.status === "cancelled") {
      return res.status(400).json({
        message: "Este agendamento já está cancelado.",
      });
    }

    if (appointment.status === "completed") {
      return res.status(400).json({
        message: "Este agendamento já foi concluído e não pode ser cancelado.",
      });
    }

    if (!canCancelAppointment(appointment.date, appointment.startTime)) {
      return res.status(400).json({
        message: `O cancelamento online só é permitido até ${PUBLIC_CANCEL_LIMIT_HOURS} horas antes do horário.`,
      });
    }

    const updatedAppointment = await prisma.appointment.update({
      where: {
        id,
      },
      data: {
        status: "cancelled",
        cancelledAt: new Date(),
      },
      include: {
        company: true,
        service: true,
        professional: true,
        client: true,
      },
    });

    return res.json({
      message: "Agendamento cancelado com sucesso.",
      appointment: updatedAppointment,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Erro ao cancelar agendamento.",
    });
  }
});

module.exports = router;