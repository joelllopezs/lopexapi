const express = require("express");
const prisma = require("../database/prisma");

const router = express.Router();

function getCompanyId(req) {
  return req.user?.companyId;
}

function normalizeText(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return String(value).trim();
}

function isValidEmail(email) {
  if (!email) return true;

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

router.post("/", async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { name, email, phone } = req.body || {};

    if (!companyId) {
      return res.status(400).json({
        message: "Usuário não está vinculado a nenhuma empresa.",
      });
    }

    const normalizedName = normalizeText(name);
    const normalizedEmail = normalizeText(email);
    const normalizedPhone = normalizeText(phone);

    if (!normalizedName) {
      return res.status(400).json({
        message: "Nome é obrigatório.",
      });
    }

    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({
        message: "E-mail inválido.",
      });
    }

    if (normalizedEmail) {
      const emailExists = await prisma.client.findFirst({
        where: {
          companyId,
          email: {
            equals: normalizedEmail,
            mode: "insensitive",
          },
        },
      });

      if (emailExists) {
        return res.status(409).json({
          message: "Já existe um cliente com esse e-mail nessa empresa.",
        });
      }
    }

    if (normalizedPhone) {
      const phoneExists = await prisma.client.findFirst({
        where: {
          companyId,
          phone: normalizedPhone,
        },
      });

      if (phoneExists) {
        return res.status(409).json({
          message: "Já existe um cliente com esse telefone nessa empresa.",
        });
      }
    }

    const client = await prisma.client.create({
      data: {
        companyId,
        name: normalizedName,
        email: normalizedEmail,
        phone: normalizedPhone,
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

    return res.status(201).json(client);
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao criar cliente.",
      error: error.message,
    });
  }
});

router.get("/", async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { search } = req.query;

    if (!companyId) {
      return res.status(400).json({
        message: "Usuário não está vinculado a nenhuma empresa.",
      });
    }

    const clients = await prisma.client.findMany({
      where: {
        companyId,
        ...(search
          ? {
              OR: [
                {
                  name: {
                    contains: search,
                    mode: "insensitive",
                  },
                },
                {
                  email: {
                    contains: search,
                    mode: "insensitive",
                  },
                },
                {
                  phone: {
                    contains: search,
                    mode: "insensitive",
                  },
                },
              ],
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

    return res.json(clients);
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao listar clientes.",
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

    const client = await prisma.client.findFirst({
      where: {
        id,
        companyId,
      },
      include: {
        company: true,
        appointments: {
          include: {
            service: true,
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

    if (!client) {
      return res.status(404).json({
        message: "Cliente não encontrado para essa empresa.",
      });
    }

    return res.json(client);
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao buscar cliente.",
      error: error.message,
    });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { id } = req.params;
    const { name, email, phone } = req.body || {};

    if (!companyId) {
      return res.status(400).json({
        message: "Usuário não está vinculado a nenhuma empresa.",
      });
    }

    const clientExists = await prisma.client.findFirst({
      where: {
        id,
        companyId,
      },
    });

    if (!clientExists) {
      return res.status(404).json({
        message: "Cliente não encontrado para essa empresa.",
      });
    }

    const nextName =
      name !== undefined ? normalizeText(name) : clientExists.name;
    const nextEmail =
      email !== undefined ? normalizeText(email) : clientExists.email;
    const nextPhone =
      phone !== undefined ? normalizeText(phone) : clientExists.phone;

    if (!nextName) {
      return res.status(400).json({
        message: "Nome é obrigatório.",
      });
    }

    if (!isValidEmail(nextEmail)) {
      return res.status(400).json({
        message: "E-mail inválido.",
      });
    }

    if (nextEmail) {
      const duplicatedEmail = await prisma.client.findFirst({
        where: {
          companyId,
          id: {
            not: id,
          },
          email: {
            equals: nextEmail,
            mode: "insensitive",
          },
        },
      });

      if (duplicatedEmail) {
        return res.status(409).json({
          message: "Já existe outro cliente com esse e-mail nessa empresa.",
        });
      }
    }

    if (nextPhone) {
      const duplicatedPhone = await prisma.client.findFirst({
        where: {
          companyId,
          id: {
            not: id,
          },
          phone: nextPhone,
        },
      });

      if (duplicatedPhone) {
        return res.status(409).json({
          message: "Já existe outro cliente com esse telefone nessa empresa.",
        });
      }
    }

    const client = await prisma.client.update({
      where: {
        id,
      },
      data: {
        name: nextName,
        email: nextEmail,
        phone: nextPhone,
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

    return res.json(client);
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao atualizar cliente.",
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

    const clientExists = await prisma.client.findFirst({
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

    if (!clientExists) {
      return res.status(404).json({
        message: "Cliente não encontrado para essa empresa.",
      });
    }

    if (clientExists._count.appointments > 0) {
      return res.status(409).json({
        message:
          "Cliente possui agendamentos vinculados e não pode ser excluído para manter o histórico.",
      });
    }

    await prisma.client.delete({
      where: {
        id,
      },
    });

    return res.json({
      message: "Cliente excluído com sucesso.",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao excluir cliente.",
      error: error.message,
    });
  }
});

module.exports = router;