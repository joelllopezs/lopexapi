const express = require("express");
const prisma = require("../database/prisma");

const router = express.Router();

function getCompanyId(req) {
  return req.user?.companyId;
}

function isValidDate(value) {
  if (!value) return false;

  const regex = /^\d{4}-\d{2}-\d{2}$/;

  if (!regex.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return !Number.isNaN(date.getTime());
}

function getDayOfWeek(date) {
  const parsedDate = new Date(`${date}T00:00:00.000Z`);
  return parsedDate.getUTCDay();
}

function isValidTime(value) {
  if (!value) return false;

  const regex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  return regex.test(value);
}

function timeToMinutes(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
    2,
    "0"
  )}`;
}

function hasTimeConflict(slotStart, slotEnd, appointments) {
  return appointments.some((appointment) => {
    const appointmentStart = timeToMinutes(appointment.startTime);
    const appointmentEnd = timeToMinutes(appointment.endTime);

    return slotStart < appointmentEnd && slotEnd > appointmentStart;
  });
}

function isInsideBreak(slotStart, slotEnd, breakStart, breakEnd) {
  if (!breakStart || !breakEnd) {
    return false;
  }

  const breakStartMinutes = timeToMinutes(breakStart);
  const breakEndMinutes = timeToMinutes(breakEnd);

  return slotStart < breakEndMinutes && slotEnd > breakStartMinutes;
}

router.get("/", async (req, res) => {
  try {
    const companyId = getCompanyId(req);

    const {
      professionalId,
      date,
      duration,
      serviceId,
      interval = 30,
    } = req.query;

    if (!companyId) {
      return res.status(400).json({
        message: "Usuário não está vinculado a nenhuma empresa.",
      });
    }

    if (!professionalId || !date) {
      return res.status(400).json({
        message: "professionalId e date são obrigatórios.",
      });
    }

    if (!isValidDate(date)) {
      return res.status(400).json({
        message: "date precisa estar no formato YYYY-MM-DD.",
      });
    }

    const professional = await prisma.professional.findFirst({
      where: {
        id: professionalId,
        companyId,
        status: "active",
      },
    });

    if (!professional) {
      return res.status(404).json({
        message: "Profissional ativo não encontrado para essa empresa.",
      });
    }

    let serviceDuration = duration ? Number(duration) : null;

    if (serviceId) {
      const service = await prisma.service.findFirst({
        where: {
          id: serviceId,
          companyId,
          status: "active",
        },
      });

      if (!service) {
        return res.status(404).json({
          message: "Serviço ativo não encontrado para essa empresa.",
        });
      }

      serviceDuration = service.duration;
    }

    if (!serviceDuration) {
      serviceDuration = 30;
    }

    if (Number.isNaN(serviceDuration) || serviceDuration <= 0) {
      return res.status(400).json({
        message: "duration precisa ser um número válido maior que zero.",
      });
    }

    const slotInterval = Number(interval);

    if (Number.isNaN(slotInterval) || slotInterval <= 0) {
      return res.status(400).json({
        message: "interval precisa ser um número válido maior que zero.",
      });
    }

    const dayOfWeek = getDayOfWeek(date);

    const businessHour = await prisma.businessHour.findFirst({
      where: {
        companyId,
        dayOfWeek,
      },
    });

    if (!businessHour) {
      return res.json({
        companyId,
        professionalId,
        date,
        dayOfWeek,
        isOpen: false,
        duration: serviceDuration,
        interval: slotInterval,
        availableTimes: [],
        message: "Não há horário de funcionamento cadastrado para esse dia.",
      });
    }

    if (!businessHour.isOpen) {
      return res.json({
        companyId,
        professionalId,
        date,
        dayOfWeek,
        isOpen: false,
        duration: serviceDuration,
        interval: slotInterval,
        availableTimes: [],
        message: "A empresa está fechada nesse dia.",
      });
    }

    if (!isValidTime(businessHour.openTime) || !isValidTime(businessHour.closeTime)) {
      return res.status(400).json({
        message:
          "Horário de funcionamento inválido. Verifique openTime e closeTime.",
      });
    }

    const businessStartMinutes = timeToMinutes(businessHour.openTime);
    const businessEndMinutes = timeToMinutes(businessHour.closeTime);

    if (businessStartMinutes >= businessEndMinutes) {
      return res.status(400).json({
        message: "Horário de funcionamento inválido para esse dia.",
      });
    }

    const appointments = await prisma.appointment.findMany({
      where: {
        companyId,
        professionalId,
        date,
        status: {
          not: "cancelled",
        },
      },
      orderBy: {
        startTime: "asc",
      },
    });

    const availableTimes = [];

    for (
      let current = businessStartMinutes;
      current + serviceDuration <= businessEndMinutes;
      current += slotInterval
    ) {
      const slotStart = current;
      const slotEnd = current + serviceDuration;

      const isBreakTime = isInsideBreak(
        slotStart,
        slotEnd,
        businessHour.breakStart,
        businessHour.breakEnd
      );

      if (isBreakTime) {
        continue;
      }

      const conflict = hasTimeConflict(slotStart, slotEnd, appointments);

      if (conflict) {
        continue;
      }

      availableTimes.push({
        startTime: minutesToTime(slotStart),
        endTime: minutesToTime(slotEnd),
      });
    }

    return res.json({
      companyId,
      professionalId,
      date,
      dayOfWeek,
      isOpen: true,
      businessHour: {
        openTime: businessHour.openTime,
        closeTime: businessHour.closeTime,
        breakStart: businessHour.breakStart,
        breakEnd: businessHour.breakEnd,
      },
      duration: serviceDuration,
      interval: slotInterval,
      totalAppointments: appointments.length,
      availableTimes,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao buscar disponibilidade.",
      error: error.message,
    });
  }
});

module.exports = router;