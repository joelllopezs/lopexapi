const express = require("express");
const prisma = require("../database/prisma");
const authMiddleware = require("../middlewares/auth.middleware");
const superAdminMiddleware = require("../middlewares/superAdmin.middleware");

const router = express.Router();

router.use(authMiddleware);
router.use(superAdminMiddleware);

function isValidCompanyStatus(status) {
  return ["active", "inactive"].includes(status);
}

router.get("/summary", async (req, res) => {
  try {
    const [
      companies,
      activeCompanies,
      inactiveCompanies,
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

    return res.json(companies);
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

    return res.json(company);
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
      include: {
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

    return res.json({
      message:
        status === "active"
          ? "Empresa ativada com sucesso."
          : "Empresa bloqueada com sucesso.",
      company,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Erro ao atualizar status da empresa.",
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
    });

    return res.json({
      message: "Empresa ativada com sucesso.",
      company,
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
    });

    return res.json({
      message: "Empresa bloqueada com sucesso.",
      company,
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