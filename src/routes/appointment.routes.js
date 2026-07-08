const express = require("express");
const prisma = require("../database/prisma");

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const companyId = req.user.companyId;

    const {
      serviceId,
      professionalId,
      clientId,
      date,
      startTime,
      endTime,
      notes
    } = req.body || {};

    if (!companyId) {
      return res.status(400).json({
        message: "Usuário não está vinculado a nenhuma empresa."
      });
    }

    if (
      !serviceId ||
      !professionalId ||
      !clientId ||
      !date ||
      !startTime ||
      !endTime
    ) {
      return res.status(400).json({
        message:
          "serviceId, professionalId, clientId, date, startTime e endTime são obrigatórios."
      });
    }

    const service = await prisma.service.findFirst({
      where: {
        id: serviceId,
        companyId
      }
    });

    if (!service) {
      return res.status(404).json({
        message: "Serviço não encontrado para essa empresa."
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

    const client = await prisma.client.findFirst({
      where: {
        id: clientId,
        companyId
      }
    });

    if (!client) {
      return res.status(404).json({
        message: "Cliente não encontrado para essa empresa."
      });
    }

    const conflict = await prisma.appointment.findFirst({
      where: {
        companyId,
        professionalId,
        date,
        status: {
          not: "cancelled"
        },
        OR: [
          {
            startTime: {
              lt: endTime
            },
            endTime: {
              gt: startTime
            }
          }
        ]
      }
    });

    if (conflict) {
      return res.status(409).json({
        message: "Esse profissional já possui um agendamento nesse horário."
      });
    }

    const appointment = await prisma.appointment.create({
      data: {
        companyId,
        serviceId,
        professionalId,
        clientId,
        date,
        startTime,
        endTime,
        notes
      },
      include: {
        company: true,
        service: true,
        professional: true,
        client: true
      }
    });

    return res.status(201).json(appointment);
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao criar agendamento.",
      error: error.message
    });
  }
});

router.get("/", async (req, res) => {
  try {
    const companyId = req.user.companyId;
    const { date, professionalId, status } = req.query;

    if (!companyId) {
      return res.status(400).json({
        message: "Usuário não está vinculado a nenhuma empresa."
      });
    }

    const appointments = await prisma.appointment.findMany({
      where: {
        companyId,
        ...(date ? { date } : {}),
        ...(professionalId ? { professionalId } : {}),
        ...(status ? { status } : {})
      },
      include: {
        company: true,
        service: true,
        professional: true,
        client: true
      },
      orderBy: [
        {
          date: "asc"
        },
        {
          startTime: "asc"
        }
      ]
    });

    return res.json(appointments);
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao listar agendamentos.",
      error: error.message
    });
  }
});

router.put("/:id/confirm", async (req, res) => {
  try {
    const companyId = req.user.companyId;
    const { id } = req.params;

    if (!companyId) {
      return res.status(400).json({
        message: "Usuário não está vinculado a nenhuma empresa."
      });
    }

    const appointmentExists = await prisma.appointment.findFirst({
      where: {
        id,
        companyId
      }
    });

    if (!appointmentExists) {
      return res.status(404).json({
        message: "Agendamento não encontrado para essa empresa."
      });
    }

    const appointment = await prisma.appointment.update({
      where: { id },
      data: {
        status: "confirmed"
      },
      include: {
        company: true,
        service: true,
        professional: true,
        client: true
      }
    });

    return res.json(appointment);
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao confirmar agendamento.",
      error: error.message
    });
  }
});

router.put("/:id/cancel", async (req, res) => {
  try {
    const companyId = req.user.companyId;
    const { id } = req.params;

    if (!companyId) {
      return res.status(400).json({
        message: "Usuário não está vinculado a nenhuma empresa."
      });
    }

    const appointmentExists = await prisma.appointment.findFirst({
      where: {
        id,
        companyId
      }
    });

    if (!appointmentExists) {
      return res.status(404).json({
        message: "Agendamento não encontrado para essa empresa."
      });
    }

    const appointment = await prisma.appointment.update({
      where: { id },
      data: {
        status: "cancelled"
      },
      include: {
        company: true,
        service: true,
        professional: true,
        client: true
      }
    });

    return res.json(appointment);
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao cancelar agendamento.",
      error: error.message
    });
  }
});

module.exports = router;