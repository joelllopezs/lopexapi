const express = require("express");
const prisma = require("../database/prisma");

const router = express.Router();

const VALID_STATUS = ["active", "inactive"];

const PLAN_LIMITS = {
  start: {
    label: "Start",
    professionals: 2,
  },
  pro: {
    label: "Pro",
    professionals: 5,
  },
  premium: {
    label: "Premium",
    professionals: 15,
  },
};

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

function getPlanConfig(plan) {
  return PLAN_LIMITS[plan] || PLAN_LIMITS.start;
}

async function validateProfessionalLimit(companyId) {
  const company = await prisma.company.findUnique({
    where: {
      id: companyId,
    },
    select: {
      id: true,
      name: true,
      plan: true,
      _count: {
        select: {
          professionals: {
            where: {
              status: "active",
            },
          },
        },
      },
    },
  });

  if (!company) {
    return {
      allowed: false,
      status: 404,
      message: "Empresa não encontrada.",
    };
  }

  const planConfig = getPlanConfig(company.plan);
  const currentActiveProfessionals = company._count.professionals;

  if (currentActiveProfessionals >= planConfig.professionals) {
    return {
      allowed: false,
      status: 403,
      message: `Limite do plano atingido. O plano ${planConfig.label} permite até ${planConfig.professionals} profissionais ativos.`,
      details: {
        plan: company.plan || "start",
        planLabel: planConfig.label,
        limit: planConfig.professionals,
        current: currentActiveProfessionals,
      },
    };
  }

  return {
    allowed: true,
    company,
    planConfig,
  };
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

    const planValidation = await validateProfessionalLimit(companyId);

    if (!planValidation.allowed) {
      return res.status(planValidation.status || 403).json({
        message: planValidation.message,
        details: planValidation.details,
      });
    }

    const duplicatedProfessional = await prisma.professional.findFirst({
      where: {
        companyId,
        name: {
          equals: normalizedName,
          mode: "insensitive",
        },
      },
    });

    if (duplicatedProfessional) {
      return res.status(409).json({
        message: "Já existe um profissional com esse nome nessa empresa.",
      });
    }

    if (normalizedEmail) {
      const emailExists = await prisma.professional.findFirst({
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
          message: "Já existe um profissional com esse e-mail nessa empresa.",
        });
      }
    }

    const professional = await prisma.professional.create({
      data: {
        companyId,
        name: normalizedName,
        email: normalizedEmail,
        phone: normalizedPhone,
        status: "active",
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

    return res.status(201).json(professional);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Erro ao criar profissional.",
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

    const professionals = await prisma.professional.findMany({
      where: {
        companyId,
        ...(status ? { status } : {}),
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

    return res.json(professionals);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Erro ao listar profissionais.",
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

    const professional = await prisma.professional.findFirst({
      where: {
        id,
        companyId,
      },
      include: {
        company: true,
        appointments: {
          include: {
            service: true,
            client: true,
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

    if (!professional) {
      return res.status(404).json({
        message: "Profissional não encontrado para essa empresa.",
      });
    }

    return res.json(professional);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Erro ao buscar profissional.",
      error: error.message,
    });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { id } = req.params;
    const { name, email, phone, status } = req.body || {};

    if (!companyId) {
      return res.status(400).json({
        message: "Usuário não está vinculado a nenhuma empresa.",
      });
    }

    const professionalExists = await prisma.professional.findFirst({
      where: {
        id,
        companyId,
      },
    });

    if (!professionalExists) {
      return res.status(404).json({
        message: "Profissional não encontrado para essa empresa.",
      });
    }

    const nextName =
      name !== undefined ? normalizeText(name) : professionalExists.name;
    const nextEmail =
      email !== undefined ? normalizeText(email) : professionalExists.email;
    const nextPhone =
      phone !== undefined ? normalizeText(phone) : professionalExists.phone;
    const nextStatus = status !== undefined ? status : professionalExists.status;

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

    if (!VALID_STATUS.includes(nextStatus)) {
      return res.status(400).json({
        message: `Status inválido. Use: ${VALID_STATUS.join(", ")}.`,
      });
    }

    if (
      professionalExists.status !== "active" &&
      nextStatus === "active"
    ) {
      const planValidation = await validateProfessionalLimit(companyId);

      if (!planValidation.allowed) {
        return res.status(planValidation.status || 403).json({
          message: planValidation.message,
          details: planValidation.details,
        });
      }
    }

    const duplicatedName = await prisma.professional.findFirst({
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

    if (duplicatedName) {
      return res.status(409).json({
        message: "Já existe outro profissional com esse nome nessa empresa.",
      });
    }

    if (nextEmail) {
      const duplicatedEmail = await prisma.professional.findFirst({
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
          message: "Já existe outro profissional com esse e-mail nessa empresa.",
        });
      }
    }

    const professional = await prisma.professional.update({
      where: {
        id,
      },
      data: {
        name: nextName,
        email: nextEmail,
        phone: nextPhone,
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

    return res.json(professional);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Erro ao atualizar profissional.",
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

    const professionalExists = await prisma.professional.findFirst({
      where: {
        id,
        companyId,
      },
    });

    if (!professionalExists) {
      return res.status(404).json({
        message: "Profissional não encontrado para essa empresa.",
      });
    }

    if (
      professionalExists.status !== "active" &&
      status === "active"
    ) {
      const planValidation = await validateProfessionalLimit(companyId);

      if (!planValidation.allowed) {
        return res.status(planValidation.status || 403).json({
          message: planValidation.message,
          details: planValidation.details,
        });
      }
    }

    const professional = await prisma.professional.update({
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

    return res.json(professional);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Erro ao atualizar status do profissional.",
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

    const professionalExists = await prisma.professional.findFirst({
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

    if (!professionalExists) {
      return res.status(404).json({
        message: "Profissional não encontrado para essa empresa.",
      });
    }

    if (professionalExists._count.appointments > 0) {
      const professional = await prisma.professional.update({
        where: {
          id,
        },
        data: {
          status: "inactive",
        },
      });

      return res.json({
        message:
          "Profissional possui agendamentos vinculados e foi inativado para manter o histórico.",
        professional,
      });
    }

    await prisma.professional.delete({
      where: {
        id,
      },
    });

    return res.json({
      message: "Profissional excluído com sucesso.",
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Erro ao excluir profissional.",
      error: error.message,
    });
  }
});

module.exports = router;