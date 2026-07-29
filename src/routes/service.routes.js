const express = require("express");
const prisma = require("../database/prisma");

const router = express.Router();

const VALID_STATUS = ["active", "inactive"];

function getCompanyId(req) {
  return req.user?.companyId;
}

function normalizePrice(price) {
  if (price === undefined || price === null || price === "") {
    return null;
  }

  const parsedPrice = Number(price);

  if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
    return null;
  }

  return parsedPrice;
}

function normalizeDuration(duration) {
  const parsedDuration = Number(duration);

  if (Number.isNaN(parsedDuration) || parsedDuration <= 0) {
    return null;
  }

  return parsedDuration;
}

router.post("/", async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { name, description, duration, price } = req.body || {};

    if (!companyId) {
      return res.status(400).json({
        message: "Usuário não está vinculado a nenhuma empresa.",
      });
    }

    if (!name || !duration) {
      return res.status(400).json({
        message: "Nome e duração são obrigatórios.",
      });
    }

    const normalizedDuration = normalizeDuration(duration);

    if (!normalizedDuration) {
      return res.status(400).json({
        message: "A duração deve ser um número maior que zero.",
      });
    }

    const normalizedPrice = normalizePrice(price);

    if (price !== undefined && price !== null && price !== "" && normalizedPrice === null) {
      return res.status(400).json({
        message: "O preço deve ser um número válido maior ou igual a zero.",
      });
    }

    const serviceExists = await prisma.service.findFirst({
      where: {
        companyId,
        name: {
          equals: name.trim(),
          mode: "insensitive",
        },
      },
    });

    if (serviceExists) {
      return res.status(409).json({
        message: "Já existe um serviço com esse nome nessa empresa.",
      });
    }

    const service = await prisma.service.create({
      data: {
        companyId,
        name: name.trim(),
        description: description || null,
        duration: normalizedDuration,
        price: normalizedPrice,
        status: "active",
      },
      include: {
        company: true,
      },
    });

    return res.status(201).json(service);
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao criar serviço.",
      error: error.message,
    });
  }
});

router.get("/", async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { status, search } = req.query;

    if (!companyId) {
      return res.status(400).json({
        message: "Usuário não está vinculado a nenhuma empresa.",
      });
    }

    if (status && !VALID_STATUS.includes(status)) {
      return res.status(400).json({
        message: `Status inválido. Use: ${VALID_STATUS.join(", ")}.`,
      });
    }

    const services = await prisma.service.findMany({
      where: {
        companyId,
        ...(status ? { status } : {}),
        ...(search
          ? {
              name: {
                contains: search,
                mode: "insensitive",
              },
            }
          : {}),
      },
      include: {
        company: true,
        _count: {
          select: {
            appointments: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return res.json(services);
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao listar serviços.",
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

    const service = await prisma.service.findFirst({
      where: {
        id,
        companyId,
      },
      include: {
        company: true,
        appointments: {
          include: {
            client: true,
            professional: true,
          },
          orderBy: [
            {
              date: "desc",
            },
            {
              startTime: "desc",
            },
          ],
          take: 10,
        },
        _count: {
          select: {
            appointments: true,
          },
        },
      },
    });

    if (!service) {
      return res.status(404).json({
        message: "Serviço não encontrado para essa empresa.",
      });
    }

    return res.json(service);
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao buscar serviço.",
      error: error.message,
    });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { id } = req.params;
    const { name, description, duration, price, status } = req.body || {};

    if (!companyId) {
      return res.status(400).json({
        message: "Usuário não está vinculado a nenhuma empresa.",
      });
    }

    const serviceExists = await prisma.service.findFirst({
      where: {
        id,
        companyId,
      },
    });

    if (!serviceExists) {
      return res.status(404).json({
        message: "Serviço não encontrado para essa empresa.",
      });
    }

    const nextName = name !== undefined ? String(name).trim() : serviceExists.name;
    const nextDescription =
      description !== undefined ? description || null : serviceExists.description;
    const nextDuration =
      duration !== undefined ? normalizeDuration(duration) : serviceExists.duration;
    const nextPrice =
      price !== undefined ? normalizePrice(price) : serviceExists.price;
    const nextStatus = status !== undefined ? status : serviceExists.status;

    if (!nextName) {
      return res.status(400).json({
        message: "Nome é obrigatório.",
      });
    }

    if (!nextDuration) {
      return res.status(400).json({
        message: "A duração deve ser um número maior que zero.",
      });
    }

    if (price !== undefined && price !== null && price !== "" && nextPrice === null) {
      return res.status(400).json({
        message: "O preço deve ser um número válido maior ou igual a zero.",
      });
    }

    if (!VALID_STATUS.includes(nextStatus)) {
      return res.status(400).json({
        message: `Status inválido. Use: ${VALID_STATUS.join(", ")}.`,
      });
    }

    const duplicatedService = await prisma.service.findFirst({
      where: {
        companyId,
        id: {
          not: id,
        },
        name: {
          equals: nextName,
          mode: "insensitive",
        },
      },
    });

    if (duplicatedService) {
      return res.status(409).json({
        message: "Já existe outro serviço com esse nome nessa empresa.",
      });
    }

    const service = await prisma.service.update({
      where: {
        id,
      },
      data: {
        name: nextName,
        description: nextDescription,
        duration: nextDuration,
        price: nextPrice,
        status: nextStatus,
      },
      include: {
        company: true,
        _count: {
          select: {
            appointments: true,
          },
        },
      },
    });

    return res.json(service);
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao atualizar serviço.",
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

    if (!VALID_STATUS.includes(status)) {
      return res.status(400).json({
        message: `Status inválido. Use: ${VALID_STATUS.join(", ")}.`,
      });
    }

    const serviceExists = await prisma.service.findFirst({
      where: {
        id,
        companyId,
      },
    });

    if (!serviceExists) {
      return res.status(404).json({
        message: "Serviço não encontrado para essa empresa.",
      });
    }

    const service = await prisma.service.update({
      where: {
        id,
      },
      data: {
        status,
      },
      include: {
        company: true,
        _count: {
          select: {
            appointments: true,
          },
        },
      },
    });

    return res.json(service);
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao atualizar status do serviço.",
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

    const serviceExists = await prisma.service.findFirst({
      where: {
        id,
        companyId,
      },
      include: {
        _count: {
          select: {
            appointments: true,
          },
        },
      },
    });

    if (!serviceExists) {
      return res.status(404).json({
        message: "Serviço não encontrado para essa empresa.",
      });
    }

    if (serviceExists._count.appointments > 0) {
      const service = await prisma.service.update({
        where: {
          id,
        },
        data: {
          status: "inactive",
        },
      });

      return res.json({
        message:
          "Serviço possui agendamentos vinculados e foi inativado para manter o histórico.",
        service,
      });
    }

    await prisma.service.delete({
      where: {
        id,
      },
    });

    return res.json({
      message: "Serviço excluído com sucesso.",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao excluir serviço.",
      error: error.message,
    });
  }
});

module.exports = router;