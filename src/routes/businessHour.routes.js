const express = require("express");
const prisma = require("../database/prisma");

const router = express.Router();

const DAY_NAMES = {
  0: "Domingo",
  1: "Segunda-feira",
  2: "Terça-feira",
  3: "Quarta-feira",
  4: "Quinta-feira",
  5: "Sexta-feira",
  6: "Sábado",
};

function getCompanyId(req) {
  return req.user?.companyId;
}

function isValidDayOfWeek(dayOfWeek) {
  return Number.isInteger(Number(dayOfWeek)) && Number(dayOfWeek) >= 0 && Number(dayOfWeek) <= 6;
}

function isValidTime(value) {
  if (!value) return false;

  const regex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  return regex.test(value);
}

function timeToMinutes(value) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function validateBusinessHourData({
  dayOfWeek,
  isOpen = true,
  openTime,
  closeTime,
  breakStart,
  breakEnd,
}) {
  if (dayOfWeek === undefined || dayOfWeek === null) {
    return "dayOfWeek é obrigatório.";
  }

  if (!isValidDayOfWeek(dayOfWeek)) {
    return "dayOfWeek precisa ser entre 0 e 6.";
  }

  if (!isOpen) {
    return null;
  }

  if (!openTime || !closeTime) {
    return "openTime e closeTime são obrigatórios quando isOpen for true.";
  }

  if (!isValidTime(openTime)) {
    return "openTime precisa estar no formato HH:mm.";
  }

  if (!isValidTime(closeTime)) {
    return "closeTime precisa estar no formato HH:mm.";
  }

  if (timeToMinutes(openTime) >= timeToMinutes(closeTime)) {
    return "openTime precisa ser menor que closeTime.";
  }

  if ((breakStart && !breakEnd) || (!breakStart && breakEnd)) {
    return "breakStart e breakEnd precisam ser preenchidos juntos.";
  }

  if (breakStart && breakEnd) {
    if (!isValidTime(breakStart)) {
      return "breakStart precisa estar no formato HH:mm.";
    }

    if (!isValidTime(breakEnd)) {
      return "breakEnd precisa estar no formato HH:mm.";
    }

    if (timeToMinutes(breakStart) >= timeToMinutes(breakEnd)) {
      return "breakStart precisa ser menor que breakEnd.";
    }

    if (
      timeToMinutes(breakStart) < timeToMinutes(openTime) ||
      timeToMinutes(breakEnd) > timeToMinutes(closeTime)
    ) {
      return "O intervalo precisa estar dentro do horário de funcionamento.";
    }
  }

  return null;
}

function formatBusinessHourData(companyId, data) {
  const {
    dayOfWeek,
    isOpen = true,
    openTime,
    closeTime,
    breakStart,
    breakEnd,
  } = data || {};

  return {
    companyId,
    dayOfWeek: Number(dayOfWeek),
    isOpen: Boolean(isOpen),
    openTime: isOpen ? openTime : "00:00",
    closeTime: isOpen ? closeTime : "00:00",
    breakStart: isOpen ? breakStart || null : null,
    breakEnd: isOpen ? breakEnd || null : null,
  };
}

router.post("/", async (req, res) => {
  try {
    const companyId = getCompanyId(req);

    if (!companyId) {
      return res.status(400).json({
        message: "Usuário não está vinculado a nenhuma empresa.",
      });
    }

    const validationError = validateBusinessHourData(req.body || {});

    if (validationError) {
      return res.status(400).json({
        message: validationError,
      });
    }

    const data = formatBusinessHourData(companyId, req.body || {});

    const businessHour = await prisma.businessHour.upsert({
      where: {
        companyId_dayOfWeek: {
          companyId,
          dayOfWeek: data.dayOfWeek,
        },
      },
      update: {
        isOpen: data.isOpen,
        openTime: data.openTime,
        closeTime: data.closeTime,
        breakStart: data.breakStart,
        breakEnd: data.breakEnd,
      },
      create: data,
    });

    return res.status(201).json(businessHour);
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao salvar horário de funcionamento.",
      error: error.message,
    });
  }
});

router.post("/bulk", async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { businessHours } = req.body || {};

    if (!companyId) {
      return res.status(400).json({
        message: "Usuário não está vinculado a nenhuma empresa.",
      });
    }

    if (!Array.isArray(businessHours) || businessHours.length === 0) {
      return res.status(400).json({
        message: "businessHours precisa ser uma lista com pelo menos um horário.",
      });
    }

    for (const item of businessHours) {
      const validationError = validateBusinessHourData(item);

      if (validationError) {
        return res.status(400).json({
          message: `Erro no dia ${item?.dayOfWeek}: ${validationError}`,
        });
      }
    }

    const savedBusinessHours = [];

    for (const item of businessHours) {
      const data = formatBusinessHourData(companyId, item);

      const businessHour = await prisma.businessHour.upsert({
        where: {
          companyId_dayOfWeek: {
            companyId,
            dayOfWeek: data.dayOfWeek,
          },
        },
        update: {
          isOpen: data.isOpen,
          openTime: data.openTime,
          closeTime: data.closeTime,
          breakStart: data.breakStart,
          breakEnd: data.breakEnd,
        },
        create: data,
      });

      savedBusinessHours.push(businessHour);
    }

    return res.status(201).json({
      message: "Horários salvos com sucesso.",
      businessHours: savedBusinessHours,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao salvar horários em lote.",
      error: error.message,
    });
  }
});

router.get("/", async (req, res) => {
  try {
    const companyId = getCompanyId(req);

    if (!companyId) {
      return res.status(400).json({
        message: "Usuário não está vinculado a nenhuma empresa.",
      });
    }

    const businessHours = await prisma.businessHour.findMany({
      where: {
        companyId,
      },
      orderBy: {
        dayOfWeek: "asc",
      },
    });

    return res.json(businessHours);
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao listar horários de funcionamento.",
      error: error.message,
    });
  }
});

router.get("/validate", async (req, res) => {
  try {
    const companyId = getCompanyId(req);

    if (!companyId) {
      return res.status(400).json({
        message: "Usuário não está vinculado a nenhuma empresa.",
      });
    }

    const businessHours = await prisma.businessHour.findMany({
      where: {
        companyId,
      },
      orderBy: {
        dayOfWeek: "asc",
      },
    });

    const registeredDays = businessHours.map((hour) => hour.dayOfWeek);
    const allDays = [0, 1, 2, 3, 4, 5, 6];

    const missingDays = allDays.filter((day) => !registeredDays.includes(day));

    const openDays = businessHours.filter((hour) => hour.isOpen);
    const closedDays = businessHours.filter((hour) => !hour.isOpen);

    return res.json({
      isComplete: missingDays.length === 0,
      totalRegistered: businessHours.length,
      totalOpen: openDays.length,
      totalClosed: closedDays.length,
      registeredDays: registeredDays.map((day) => ({
        dayOfWeek: day,
        name: DAY_NAMES[day],
      })),
      missingDays: missingDays.map((day) => ({
        dayOfWeek: day,
        name: DAY_NAMES[day],
      })),
      businessHours,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao validar horários de funcionamento.",
      error: error.message,
    });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { id } = req.params;

    if (!companyId) {
      return res.status(400).json({
        message: "Usuário não está vinculado a nenhuma empresa.",
      });
    }

    const businessHour = await prisma.businessHour.findFirst({
      where: {
        id,
        companyId,
      },
    });

    if (!businessHour) {
      return res.status(404).json({
        message: "Horário não encontrado para essa empresa.",
      });
    }

    return res.json(businessHour);
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao buscar horário de funcionamento.",
      error: error.message,
    });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { id } = req.params;

    if (!companyId) {
      return res.status(400).json({
        message: "Usuário não está vinculado a nenhuma empresa.",
      });
    }

    const businessHourExists = await prisma.businessHour.findFirst({
      where: {
        id,
        companyId,
      },
    });

    if (!businessHourExists) {
      return res.status(404).json({
        message: "Horário não encontrado para essa empresa.",
      });
    }

    const nextData = {
      dayOfWeek:
        req.body?.dayOfWeek !== undefined
          ? req.body.dayOfWeek
          : businessHourExists.dayOfWeek,
      isOpen:
        req.body?.isOpen !== undefined
          ? req.body.isOpen
          : businessHourExists.isOpen,
      openTime:
        req.body?.openTime !== undefined
          ? req.body.openTime
          : businessHourExists.openTime,
      closeTime:
        req.body?.closeTime !== undefined
          ? req.body.closeTime
          : businessHourExists.closeTime,
      breakStart:
        req.body?.breakStart !== undefined
          ? req.body.breakStart
          : businessHourExists.breakStart,
      breakEnd:
        req.body?.breakEnd !== undefined
          ? req.body.breakEnd
          : businessHourExists.breakEnd,
    };

    const validationError = validateBusinessHourData(nextData);

    if (validationError) {
      return res.status(400).json({
        message: validationError,
      });
    }

    const data = formatBusinessHourData(companyId, nextData);

    const dayAlreadyExists = await prisma.businessHour.findFirst({
      where: {
        companyId,
        dayOfWeek: data.dayOfWeek,
        id: {
          not: id,
        },
      },
    });

    if (dayAlreadyExists) {
      return res.status(409).json({
        message: "Já existe um horário cadastrado para esse dia da semana.",
      });
    }

    const businessHour = await prisma.businessHour.update({
      where: {
        id,
      },
      data: {
        dayOfWeek: data.dayOfWeek,
        isOpen: data.isOpen,
        openTime: data.openTime,
        closeTime: data.closeTime,
        breakStart: data.breakStart,
        breakEnd: data.breakEnd,
      },
    });

    return res.json(businessHour);
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao atualizar horário de funcionamento.",
      error: error.message,
    });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { id } = req.params;

    if (!companyId) {
      return res.status(400).json({
        message: "Usuário não está vinculado a nenhuma empresa.",
      });
    }

    const businessHour = await prisma.businessHour.findFirst({
      where: {
        id,
        companyId,
      },
    });

    if (!businessHour) {
      return res.status(404).json({
        message: "Horário não encontrado para essa empresa.",
      });
    }

    await prisma.businessHour.delete({
      where: {
        id,
      },
    });

    return res.json({
      message: "Horário removido com sucesso.",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao remover horário de funcionamento.",
      error: error.message,
    });
  }
});

module.exports = router;