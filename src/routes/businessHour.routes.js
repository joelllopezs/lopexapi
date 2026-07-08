const express = require("express");
const prisma = require("../database/prisma");

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const companyId = req.user.companyId;

    const {
      dayOfWeek,
      isOpen = true,
      openTime,
      closeTime,
      breakStart,
      breakEnd
    } = req.body || {};

    if (!companyId) {
      return res.status(400).json({
        message: "Usuário não está vinculado a nenhuma empresa."
      });
    }

    if (dayOfWeek === undefined || dayOfWeek === null) {
      return res.status(400).json({
        message: "dayOfWeek é obrigatório."
      });
    }

    if (dayOfWeek < 0 || dayOfWeek > 6) {
      return res.status(400).json({
        message: "dayOfWeek precisa ser entre 0 e 6."
      });
    }

    if (isOpen && (!openTime || !closeTime)) {
      return res.status(400).json({
        message: "openTime e closeTime são obrigatórios quando isOpen for true."
      });
    }

    const businessHour = await prisma.businessHour.upsert({
      where: {
        companyId_dayOfWeek: {
          companyId,
          dayOfWeek
        }
      },
      update: {
        isOpen,
        openTime: openTime || "00:00",
        closeTime: closeTime || "00:00",
        breakStart,
        breakEnd
      },
      create: {
        companyId,
        dayOfWeek,
        isOpen,
        openTime: openTime || "00:00",
        closeTime: closeTime || "00:00",
        breakStart,
        breakEnd
      }
    });

    return res.status(201).json(businessHour);
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao salvar horário de funcionamento.",
      error: error.message
    });
  }
});

router.get("/", async (req, res) => {
  try {
    const companyId = req.user.companyId;

    if (!companyId) {
      return res.status(400).json({
        message: "Usuário não está vinculado a nenhuma empresa."
      });
    }

    const businessHours = await prisma.businessHour.findMany({
      where: {
        companyId
      },
      orderBy: {
        dayOfWeek: "asc"
      }
    });

    return res.json(businessHours);
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao listar horários de funcionamento.",
      error: error.message
    });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const companyId = req.user.companyId;
    const { id } = req.params;

    if (!companyId) {
      return res.status(400).json({
        message: "Usuário não está vinculado a nenhuma empresa."
      });
    }

    const businessHour = await prisma.businessHour.findFirst({
      where: {
        id,
        companyId
      }
    });

    if (!businessHour) {
      return res.status(404).json({
        message: "Horário não encontrado para essa empresa."
      });
    }

    await prisma.businessHour.delete({
      where: {
        id
      }
    });

    return res.json({
      message: "Horário removido com sucesso."
    });
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao remover horário de funcionamento.",
      error: error.message
    });
  }
});

router.get("/validate", async (req, res) => {
  try {
    const companyId = req.user.companyId;

    if (!companyId) {
      return res.status(400).json({
        message: "Usuário não está vinculado a nenhuma empresa."
      });
    }

    const businessHours = await prisma.businessHour.findMany({
      where: {
        companyId
      },
      orderBy: {
        dayOfWeek: "asc"
      }
    });

    const registeredDays = businessHours.map((hour) => hour.dayOfWeek);

    const allDays = [0, 1, 2, 3, 4, 5, 6];

    const missingDays = allDays.filter((day) => {
      return !registeredDays.includes(day);
    });

    const dayNames = {
      0: "Domingo",
      1: "Segunda-feira",
      2: "Terça-feira",
      3: "Quarta-feira",
      4: "Quinta-feira",
      5: "Sexta-feira",
      6: "Sábado"
    };

    return res.json({
      isComplete: missingDays.length === 0,
      totalRegistered: businessHours.length,
      registeredDays: registeredDays.map((day) => ({
        dayOfWeek: day,
        name: dayNames[day]
      })),
      missingDays: missingDays.map((day) => ({
        dayOfWeek: day,
        name: dayNames[day]
      }))
    });
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao validar horários de funcionamento.",
      error: error.message
    });
  }
});
module.exports = router;