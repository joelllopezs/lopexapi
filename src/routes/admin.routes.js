const express = require("express");
const prisma = require("../database/prisma");
const authMiddleware = require("../middlewares/auth.middleware");
const superAdminMiddleware = require("../middlewares/superAdmin.middleware");

const router = express.Router();

router.use(authMiddleware);
router.use(superAdminMiddleware);

const VALID_COMPANY_STATUS = ["active", "inactive"];
const VALID_COMPANY_PLANS = ["start", "pro", "premium"];
const VALID_SUBSCRIPTION_STATUS = ["trial", "active", "overdue", "cancelled"];

function isValidCompanyStatus(status) {
  return VALID_COMPANY_STATUS.includes(status);
}

function isValidCompanyPlan(plan) {
  return VALID_COMPANY_PLANS.includes(plan);
}

function isValidSubscriptionStatus(status) {
  return VALID_SUBSCRIPTION_STATUS.includes(status);
}

function getPlanLabel(plan) {
  const labels = {
    start: "Start",
    pro: "Pro",
    premium: "Premium",
  };

  return labels[plan] || "Start";
}

function getSubscriptionLabel(status) {
  const labels = {
    trial: "Teste gratuito",
    active: "Ativa",
    overdue: "Atrasada",
    cancelled: "Cancelada",
  };

  return labels[status] || "Teste gratuito";
}

function getPlanLimits(plan) {
  const limits = {
    start: {
      professionals: 2,
      services: null,
      clients: null,
      appointments: null,
      publicBooking: true,
      publicCancel: true,
    },
    pro: {
      professionals: 5,
      services: null,
      clients: null,
      appointments: null,
      publicBooking: true,
      publicCancel: true,
    },
    premium: {
      professionals: 15,
      services: null,
      clients: null,
      appointments: null,
      publicBooking: true,
      publicCancel: true,
    },
  };

  return limits[plan] || limits.start;
}

function parseOptionalDate(value) {
  if (value === undefined) return undefined;

  if (value === null || value === "") {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "invalid";
  }

  return date;
}

function buildCompanyInclude() {
  return {
    users: {
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    },
    _count: {
      select: {
        users: true,
        services: true,
        professionals: true,
        clients: true,
        appointments: true,
        businessHours: true,
      },
    },
  };
}

function formatCompanyWithPlan(company) {
  if (!company) return company;

  return {
    ...company,
    planLabel: getPlanLabel(company.plan || "start"),
    planLimits: getPlanLimits(company.plan || "start"),
    subscriptionLabel: getSubscriptionLabel(
      company.subscriptionStatus || "trial"
    ),
  };
}

router.get("/plans", async (req, res) => {
  try {
    return res.json([
      {
        id: "start",
        name: "Start",
        description: "Plano inicial para empresas pequenas.",
        limits: getPlanLimits("start"),
      },
      {
        id: "pro",
        name: "Pro",
        description: "Plano para equipes em crescimento.",
        limits: getPlanLimits("pro"),
      },
      {
        id: "premium",
        name: "Premium",
        description: "Plano avançado para empresas maiores.",
        limits: getPlanLimits("premium"),
      },
    ]);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Erro ao carregar planos.",
    });
  }
});

router.get("/summary", async (req, res) => {
  try {
    const [
      companies,
      activeCompanies,
      inactiveCompanies,
      startCompanies,
      proCompanies,
      premiumCompanies,
      trialCompanies,
      activeSubscriptions,
      overdueSubscriptions,
      cancelledSubscriptions,
      users,
      services,
      professionals,
      clients,
      appointments,
      pendingAppointments,
      confirmedAppointments,
      completedAppointments,
      cancelledAppointments,
    ] = await Promise.all([
      prisma.company.count(),

      prisma.company.count({
        where: {
          status: "active",
        },
      }),

      prisma.company.count({
        where: {
          status: "inactive",
        },
      }),

      prisma.company.count({
        where: {
          plan: "start",
        },
      }),

      prisma.company.count({
        where: {
          plan: "pro",
        },
      }),

      prisma.company.count({
        where: {
          plan: "premium",
        },
      }),

      prisma.company.count({
        where: {
          subscriptionStatus: "trial",
        },
      }),

      prisma.company.count({
        where: {
          subscriptionStatus: "active",
        },
      }),

      prisma.company.count({
        where: {
          subscriptionStatus: "overdue",
        },
      }),

      prisma.company.count({
        where: {
          subscriptionStatus: "cancelled",
        },
      }),

      prisma.user.count(),
      prisma.service.count(),
      prisma.professional.count(),
      prisma.client.count(),
      prisma.appointment.count(),

      prisma.appointment.count({
        where: {
          status: "pending",
        },
      }),

      prisma.appointment.count({
        where: {
          status: "confirmed",
        },
      }),

      prisma.appointment.count({
        where: {
          status: "completed",
        },
      }),

      prisma.appointment.count({
        where: {
          status: "cancelled",
        },
      }),
    ]);

    return res.json({
      companies,
      activeCompanies,
      inactiveCompanies,
      blockedCompanies: inactiveCompanies,
      startCompanies,
      proCompanies,
      premiumCompanies,
      trialCompanies,
      activeSubscriptions,
      overdueSubscriptions,
      cancelledSubscriptions,
      users,
      services,
      professionals,
      clients,
      appointments,
      pendingAppointments,
      confirmedAppointments,
      completedAppointments,
      cancelledAppointments,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Erro ao carregar resumo administrativo.",
    });
  }
});

router.get("/companies", async (req, res) => {
  try {
    const companies = await prisma.company.findMany({
      orderBy: {
        createdAt: "desc",
      },
      include: buildCompanyInclude(),
    });

    return res.json(companies.map(formatCompanyWithPlan));
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Erro ao listar empresas.",
    });
  }
});

router.get("/companies/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const company = await prisma.company.findUnique({
      where: {
        id,
      },
      include: {
        users: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            status: true,
            createdAt: true,
          },
          orderBy: {
            createdAt: "asc",
          },
        },
        services: {
          select: {
            id: true,
            name: true,
            duration: true,
            price: true,
            status: true,
            createdAt: true,
          },
          orderBy: {
            createdAt: "desc",
          },
        },
        professionals: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            status: true,
            createdAt: true,
          },
          orderBy: {
            createdAt: "desc",
          },
        },
        clients: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            createdAt: true,
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 20,
        },
        appointments: {
          select: {
            id: true,
            date: true,
            startTime: true,
            endTime: true,
            status: true,
            createdAt: true,
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 20,
        },
        _count: {
          select: {
            users: true,
            services: true,
            professionals: true,
            clients: true,
            appointments: true,
            businessHours: true,
          },
        },
      },
    });

    if (!company) {
      return res.status(404).json({
        message: "Empresa não encontrada.",
      });
    }

    return res.json(formatCompanyWithPlan(company));
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Erro ao carregar empresa.",
    });
  }
});

router.patch("/companies/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body || {};

    if (!isValidCompanyStatus(status)) {
      return res.status(400).json({
        message: "Status inválido. Use active ou inactive.",
      });
    }

    const companyExists = await prisma.company.findUnique({
      where: {
        id,
      },
    });

    if (!companyExists) {
      return res.status(404).json({
        message: "Empresa não encontrada.",
      });
    }

    const company = await prisma.company.update({
      where: {
        id,
      },
      data: {
        status,
      },
      include: buildCompanyInclude(),
    });

    return res.json({
      message:
        status === "active"
          ? "Empresa ativada com sucesso."
          : "Empresa bloqueada com sucesso.",
      company: formatCompanyWithPlan(company),
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Erro ao atualizar status da empresa.",
    });
  }
});

router.patch("/companies/:id/plan", async (req, res) => {
  try {
    const { id } = req.params;
    const { plan } = req.body || {};

    if (!isValidCompanyPlan(plan)) {
      return res.status(400).json({
        message: "Plano inválido. Use start, pro ou premium.",
      });
    }

    const companyExists = await prisma.company.findUnique({
      where: {
        id,
      },
      include: {
        _count: {
          select: {
            professionals: true,
          },
        },
      },
    });

    if (!companyExists) {
      return res.status(404).json({
        message: "Empresa não encontrada.",
      });
    }

    const planLimits = getPlanLimits(plan);

    if (
      planLimits.professionals !== null &&
      companyExists._count.professionals > planLimits.professionals
    ) {
      return res.status(400).json({
        message: `Esta empresa possui ${companyExists._count.professionals} profissionais. O plano ${getPlanLabel(
          plan
        )} permite até ${planLimits.professionals}.`,
      });
    }

    const company = await prisma.company.update({
      where: {
        id,
      },
      data: {
        plan,
      },
      include: buildCompanyInclude(),
    });

    return res.json({
      message: `Plano alterado para ${getPlanLabel(plan)} com sucesso.`,
      company: formatCompanyWithPlan(company),
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Erro ao atualizar plano da empresa.",
    });
  }
});

router.patch("/companies/:id/subscription", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      subscriptionStatus,
      subscriptionStart,
      subscriptionEnd,
      trialEndsAt,
    } = req.body || {};

    if (!isValidSubscriptionStatus(subscriptionStatus)) {
      return res.status(400).json({
        message: "Assinatura inválida. Use trial, active, overdue ou cancelled.",
      });
    }

    const parsedSubscriptionStart = parseOptionalDate(subscriptionStart);
    const parsedSubscriptionEnd = parseOptionalDate(subscriptionEnd);
    const parsedTrialEndsAt = parseOptionalDate(trialEndsAt);

    if (
      parsedSubscriptionStart === "invalid" ||
      parsedSubscriptionEnd === "invalid" ||
      parsedTrialEndsAt === "invalid"
    ) {
      return res.status(400).json({
        message: "Uma ou mais datas da assinatura são inválidas.",
      });
    }

    const companyExists = await prisma.company.findUnique({
      where: {
        id,
      },
    });

    if (!companyExists) {
      return res.status(404).json({
        message: "Empresa não encontrada.",
      });
    }

    const data = {
      subscriptionStatus,
    };

    if (parsedSubscriptionStart !== undefined) {
      data.subscriptionStart = parsedSubscriptionStart;
    }

    if (parsedSubscriptionEnd !== undefined) {
      data.subscriptionEnd = parsedSubscriptionEnd;
    }

    if (parsedTrialEndsAt !== undefined) {
      data.trialEndsAt = parsedTrialEndsAt;
    }

    const company = await prisma.company.update({
      where: {
        id,
      },
      data,
      include: buildCompanyInclude(),
    });

    return res.json({
      message: `Assinatura alterada para ${getSubscriptionLabel(
        subscriptionStatus
      )} com sucesso.`,
      company: formatCompanyWithPlan(company),
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Erro ao atualizar assinatura da empresa.",
    });
  }
});

router.patch("/companies/:id/activate", async (req, res) => {
  try {
    const { id } = req.params;

    const companyExists = await prisma.company.findUnique({
      where: {
        id,
      },
    });

    if (!companyExists) {
      return res.status(404).json({
        message: "Empresa não encontrada.",
      });
    }

    const company = await prisma.company.update({
      where: {
        id,
      },
      data: {
        status: "active",
      },
      include: buildCompanyInclude(),
    });

    return res.json({
      message: "Empresa ativada com sucesso.",
      company: formatCompanyWithPlan(company),
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Erro ao ativar empresa.",
    });
  }
});

router.patch("/companies/:id/block", async (req, res) => {
  try {
    const { id } = req.params;

    const companyExists = await prisma.company.findUnique({
      where: {
        id,
      },
    });

    if (!companyExists) {
      return res.status(404).json({
        message: "Empresa não encontrada.",
      });
    }

    const company = await prisma.company.update({
      where: {
        id,
      },
      data: {
        status: "inactive",
      },
      include: buildCompanyInclude(),
    });

    return res.json({
      message: "Empresa bloqueada com sucesso.",
      company: formatCompanyWithPlan(company),
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Erro ao bloquear empresa.",
    });
  }
});

router.delete("/companies/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { confirmText } = req.body || {};

    if (confirmText !== "EXCLUIR") {
      return res.status(400).json({
        message: 'Para excluir permanentemente, envie confirmText como "EXCLUIR".',
      });
    }

    const company = await prisma.company.findUnique({
      where: {
        id,
      },
      include: {
        users: {
          select: {
            id: true,
            role: true,
          },
        },
        _count: {
          select: {
            users: true,
            services: true,
            professionals: true,
            clients: true,
            appointments: true,
            businessHours: true,
          },
        },
      },
    });

    if (!company) {
      return res.status(404).json({
        message: "Empresa não encontrada.",
      });
    }

    const hasSuperAdmin = company.users.some(
      (user) => user.role === "super_admin"
    );

    if (hasSuperAdmin) {
      return res.status(400).json({
        message:
          "Não é possível excluir uma empresa vinculada a usuário Super Admin.",
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.appointment.deleteMany({
        where: {
          companyId: id,
        },
      });

      await tx.businessHour.deleteMany({
        where: {
          companyId: id,
        },
      });

      await tx.service.deleteMany({
        where: {
          companyId: id,
        },
      });

      await tx.professional.deleteMany({
        where: {
          companyId: id,
        },
      });

      await tx.client.deleteMany({
        where: {
          companyId: id,
        },
      });

      await tx.user.deleteMany({
        where: {
          companyId: id,
        },
      });

      await tx.company.delete({
        where: {
          id,
        },
      });
    });

    return res.json({
      message: "Empresa excluída permanentemente com sucesso.",
      deletedCompany: {
        id: company.id,
        name: company.name,
        slug: company.slug,
        plan: company.plan || "start",
        planLabel: getPlanLabel(company.plan || "start"),
        subscriptionStatus: company.subscriptionStatus || "trial",
        subscriptionLabel: getSubscriptionLabel(
          company.subscriptionStatus || "trial"
        ),
        counts: company._count,
      },
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Erro ao excluir empresa.",
      error: error.message,
    });
  }
});

module.exports = router;