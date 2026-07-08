const express = require("express");
const prisma = require("../database/prisma");

const router = express.Router();

function timeToMinutes(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

router.get("/", async (req, res) => {
  try {
    const companyId = req.user.companyId;
    const { professionalId, date, duration } = req.query;

    if (!companyId) {
      return res.status(400).json({
        message: "Usuário não está vinculado a nenhuma empresa."
      });
    }

    if (!professionalId || !date) {
      return res.status(400).json({
        message: "professionalId e date são obrigatórios."
      });
    }

    const professional = await prisma.professional.findFirst({
      where: {
        id: professionalId,
        companyId
      }
    });

    if (!professional) {
      return res.status(404).json({
        message: "Profissional não encontrado para essa empresa."
      });
    }

    const serviceDuration = duration ? Number(duration) : 30;

    if (Number.isNaN(serviceDuration) || serviceDuration <= 0) {
      return res.status(400).json({
        message: "duration precisa ser um número válido."
      });
    }

    const businessStart = "08:00";
    const businessEnd = "18:00";
    const lunchStart = "12:00";
    const lunchEnd = "13:00";

    const startMinutes = timeToMinutes(businessStart);
    const endMinutes = timeToMinutes(businessEnd);
    const lunchStartMinutes = timeToMinutes(lunchStart);
    const lunchEndMinutes = timeToMinutes(lunchEnd);

    const appointments = await prisma.appointment.findMany({
      where: {
        companyId,
        professionalId,
        date,
        status: {
          not: "cancelled"
        }
      },
      orderBy: {
        startTime: "asc"
      }
    });

    const availableTimes = [];

    for (
      let current = startMinutes;
      current + serviceDuration <= endMinutes;
      current += serviceDuration
    ) {
      const slotStart = current;
      const slotEnd = current + serviceDuration;

      const isLunchTime =
        slotStart < lunchEndMinutes && slotEnd > lunchStartMinutes;

      if (isLunchTime) {
        continue;
      }

      const hasConflict = appointments.some((appointment) => {
        const appointmentStart = timeToMinutes(appointment.startTime);
        const appointmentEnd = timeToMinutes(appointment.endTime);

        return slotStart < appointmentEnd && slotEnd > appointmentStart;
      });

      if (!hasConflict) {
        availableTimes.push({
          startTime: minutesToTime(slotStart),
          endTime: minutesToTime(slotEnd)
        });
      }
    }

    return res.json({
      companyId,
      professionalId,
      date,
      duration: serviceDuration,
      availableTimes
    });
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao buscar disponibilidade.",
      error: error.message
    });
  }
});

module.exports = router;