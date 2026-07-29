const express = require("express");
const prisma = require("../database/prisma");

const router = express.Router();

const VALID_STATUS = ["pending", "confirmed", "cancelled", "completed"];

function getCompanyId(req) {
  return req.user?.companyId;
}

function isValidStatus(status) {
  return VALID_STATUS.includes(status);
}

function validateRequiredFields(fields) {
  const missingFields = Object.entries(fields)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  return missingFields;
}

async function findAppointmentOrFail(id, companyId) {
  return prisma.appointment.findFirst({
    where: {
      id,
      companyId,
    },
    include: {
      company: true,
      service: true,
      professional: true,
      client: true,
    },
  });
}

async function checkAppointmentConflict({
  companyId,
  professionalId,
  date,
  startTime,
  endTime,
  ignoreAppointmentId = null,
}) {
  return prisma.appointment.findFirst({
    where: {
      companyId,
      professionalId,
      date,
      status: {
        not: "cancelled",
      },
      ...(ignoreAppointmentId
        ? {
            id: {
              not: ignoreAppointmentId,
            },
          }
        : {}),
      startTime: {
        lt: endTime,
      },
      endTime: {
        gt: startTime,
      },
    },
  });
}

router.post("/", async (req, res) => {
  try {
    const companyId = getCompanyId(req);

    const {
      serviceId,
      professionalId,
      clientId,
      date,
      startTime,
      endTime,
      notes,
    } = req.body || {};

    if (!companyId) {
      return res.status(400).json({
        message: "Usuário não está vinculado a nenhuma empresa.",
      });
    }

    const missingFields = validateRequiredFields({
      serviceId,
      professionalId,
      clientId,
      date,
      startTime,
      endTime,
    });

    if (missingFields.length > 0) {
      return res.status(400).json({
        message: `Campos obrigatórios ausentes: ${missingFields.join(", ")}.`,
      });
    }

    if (startTime >= endTime) {
      return res.status(400).json({
        message: "O horário inicial deve ser menor que o horário final.",
      });
    }

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

    const client = await prisma.client.findFirst({
      where: {
        id: clientId,
        companyId,
      },
    });

    if (!client) {
      return res.status(404).json({
        message: "Cliente não encontrado para essa empresa.",
      });
    }

    const conflict = await checkAppointmentConflict({
      companyId,
      professionalId,
      date,
      startTime,
      endTime,
    });

    if (conflict) {
      return res.status(409).json({
        message: "Esse profissional já possui um agendamento nesse horário.",
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
        notes: notes || null,
        status: "pending",
      },
      include: {
        company: true,
        service: true,
        professional: true,
        client: true,
      },
    });

    return res.status(201).json(appointment);
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao criar agendamento.",
      error: error.message,
    });
  }
});

router.get("/", async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { date, professionalId, clientId, serviceId, status } = req.query;

    if (!companyId) {
      return res.status(400).json({
        message: "Usuário não está vinculado a nenhuma empresa.",
      });
    }

    if (status && !isValidStatus(status)) {
      return res.status(400).json({
        message: `Status inválido. Use: ${VALID_STATUS.join(", ")}.`,
      });
    }

    const appointments = await prisma.appointment.findMany({
      where: {
        companyId,
        ...(date ? { date } : {}),
        ...(professionalId ? { professionalId } : {}),
        ...(clientId ? { clientId } : {}),
        ...(serviceId ? { serviceId } : {}),
        ...(status ? { status } : {}),
      },
      include: {
        company: true,
        service: true,
        professional: true,
        client: true,
      },
      orderBy: [
        {
          date: "asc",
        },
        {
          startTime: "asc",
        },
      ],
    });

    return res.json(appointments);
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao listar agendamentos.",
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

    const appointment = await findAppointmentOrFail(id, companyId);

    if (!appointment) {
      return res.status(404).json({
        message: "Agendamento não encontrado para essa empresa.",
      });
    }

    return res.json(appointment);
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao buscar agendamento.",
      error: error.message,
    });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { id } = req.params;

    const {
      serviceId,
      professionalId,
      clientId,
      date,
      startTime,
      endTime,
      notes,
      status,
    } = req.body || {};

    if (!companyId) {
      return res.status(400).json({
        message: "Usuário não está vinculado a nenhuma empresa.",
      });
    }

    const appointmentExists = await prisma.appointment.findFirst({
      where: {
        id,
        companyId,
      },
    });

    if (!appointmentExists) {
      return res.status(404).json({
        message: "Agendamento não encontrado para essa empresa.",
      });
    }

    const nextServiceId = serviceId || appointmentExists.serviceId;
    const nextProfessionalId = professionalId || appointmentExists.professionalId;
    const nextClientId = clientId || appointmentExists.clientId;
    const nextDate = date || appointmentExists.date;
    const nextStartTime = startTime || appointmentExists.startTime;
    const nextEndTime = endTime || appointmentExists.endTime;
    const nextStatus = status || appointmentExists.status;

    if (!isValidStatus(nextStatus)) {
      return res.status(400).json({
        message: `Status inválido. Use: ${VALID_STATUS.join(", ")}.`,
      });
    }

    if (nextStartTime >= nextEndTime) {
      return res.status(400).json({
        message: "O horário inicial deve ser menor que o horário final.",
      });
    }

    const service = await prisma.service.findFirst({
      where: {
        id: nextServiceId,
        companyId,
      },
    });

    if (!service) {
      return res.status(404).json({
        message: "Serviço não encontrado para essa empresa.",
      });
    }

    const professional = await prisma.professional.findFirst({
      where: {
        id: nextProfessionalId,
        companyId,
      },
    });

    if (!professional) {
      return res.status(404).json({
        message: "Profissional não encontrado para essa empresa.",
      });
    }

    const client = await prisma.client.findFirst({
      where: {
        id: nextClientId,
        companyId,
      },
    });

    if (!client) {
      return res.status(404).json({
        message: "Cliente não encontrado para essa empresa.",
      });
    }

    if (nextStatus !== "cancelled") {
      const conflict = await checkAppointmentConflict({
        companyId,
        professionalId: nextProfessionalId,
        date: nextDate,
        startTime: nextStartTime,
        endTime: nextEndTime,
        ignoreAppointmentId: id,
      });

      if (conflict) {
        return res.status(409).json({
          message: "Esse profissional já possui um agendamento nesse horário.",
        });
      }
    }

    const appointment = await prisma.appointment.update({
      where: {
        id,
      },
      data: {
        serviceId: nextServiceId,
        professionalId: nextProfessionalId,
        clientId: nextClientId,
        date: nextDate,
        startTime: nextStartTime,
        endTime: nextEndTime,
        notes: notes !== undefined ? notes : appointmentExists.notes,
        status: nextStatus,
      },
      include: {
        company: true,
        service: true,
        professional: true,
        client: true,
      },
    });

    return res.json(appointment);
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao atualizar agendamento.",
      error: error.message,
    });
  }
});

router.patch("/:id/status", async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { id } = req.params;
    const { status } = req.body || {};

    if (!companyId) {
      return res.status(400).json({
        message: "Usuário não está vinculado a nenhuma empresa.",
      });
    }

    if (!status) {
      return res.status(400).json({
        message: "Status é obrigatório.",
      });
    }

    if (!isValidStatus(status)) {
      return res.status(400).json({
        message: `Status inválido. Use: ${VALID_STATUS.join(", ")}.`,
      });
    }

    const appointmentExists = await prisma.appointment.findFirst({
      where: {
        id,
        companyId,
      },
    });

    if (!appointmentExists) {
      return res.status(404).json({
        message: "Agendamento não encontrado para essa empresa.",
      });
    }

    const appointment = await prisma.appointment.update({
      where: {
        id,
      },
      data: {
        status,
      },
      include: {
        company: true,
        service: true,
        professional: true,
        client: true,
      },
    });

    return res.json(appointment);
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao atualizar status do agendamento.",
      error: error.message,
    });
  }
});

router.put("/:id/confirm", async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { id } = req.params;

    if (!companyId) {
      return res.status(400).json({
        message: "Usuário não está vinculado a nenhuma empresa.",
      });
    }

    const appointmentExists = await prisma.appointment.findFirst({
      where: {
        id,
        companyId,
      },
    });

    if (!appointmentExists) {
      return res.status(404).json({
        message: "Agendamento não encontrado para essa empresa.",
      });
    }

    const appointment = await prisma.appointment.update({
      where: {
        id,
      },
      data: {
        status: "confirmed",
      },
      include: {
        company: true,
        service: true,
        professional: true,
        client: true,
      },
    });

    return res.json(appointment);
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao confirmar agendamento.",
      error: error.message,
    });
  }
});

router.put("/:id/cancel", async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { id } = req.params;

    if (!companyId) {
      return res.status(400).json({
        message: "Usuário não está vinculado a nenhuma empresa.",
      });
    }

    const appointmentExists = await prisma.appointment.findFirst({
      where: {
        id,
        companyId,
      },
    });

    if (!appointmentExists) {
      return res.status(404).json({
        message: "Agendamento não encontrado para essa empresa.",
      });
    }

    const appointment = await prisma.appointment.update({
      where: {
        id,
      },
      data: {
        status: "cancelled",
      },
      include: {
        company: true,
        service: true,
        professional: true,
        client: true,
      },
    });

    return res.json(appointment);
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao cancelar agendamento.",
      error: error.message,
    });
  }
});

router.put("/:id/complete", async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { id } = req.params;

    if (!companyId) {
      return res.status(400).json({
        message: "Usuário não está vinculado a nenhuma empresa.",
      });
    }

    const appointmentExists = await prisma.appointment.findFirst({
      where: {
        id,
        companyId,
      },
    });

    if (!appointmentExists) {
      return res.status(404).json({
        message: "Agendamento não encontrado para essa empresa.",
      });
    }

    const appointment = await prisma.appointment.update({
      where: {
        id,
      },
      data: {
        status: "completed",
      },
      include: {
        company: true,
        service: true,
        professional: true,
        client: true,
      },
    });

    return res.json(appointment);
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao concluir agendamento.",
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

    const appointmentExists = await prisma.appointment.findFirst({
      where: {
        id,
        companyId,
      },
    });

    if (!appointmentExists) {
      return res.status(404).json({
        message: "Agendamento não encontrado para essa empresa.",
      });
    }

    await prisma.appointment.update({
      where: {
        id,
      },
      data: {
        status: "cancelled",
      },
    });

    return res.json({
      message: "Agendamento cancelado com sucesso.",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao excluir agendamento.",
      error: error.message,
    });
  }
});

module.exports = router;