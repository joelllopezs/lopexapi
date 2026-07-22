const express = require("express");
const prisma = require("../database/prisma");
const authMiddleware = require("../middlewares/auth.middleware");
const superAdminMiddleware = require("../middlewares/superAdmin.middleware");

const router = express.Router();

router.use(authMiddleware);
router.use(superAdminMiddleware);

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

router.get("/summary", async (req, res) => {
  try {
    const [
      companies,
      activeCompanies,
      users,
      services,
      professionals,
      clients,
      appointments,
    ] = await Promise.all([
      prisma.company.count(),
      prisma.company.count({
        where: {
          status: "active",
        },
      }),
      prisma.user.count(),
      prisma.service.count(),
      prisma.professional.count(),
      prisma.client.count(),
      prisma.appointment.count(),
    ]);

    return res.json({
      companies,
      activeCompanies,
      blockedCompanies: companies - activeCompanies,
      users,
      services,
      professionals,
      clients,
      appointments,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Erro ao carregar resumo administrativo.",
    });
  }
});

router.patch("/companies/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["active", "blocked", "inactive"].includes(status)) {
      return res.status(400).json({
        message: "Status inválido.",
      });
    }

    const company = await prisma.company.update({
      where: {
        id,
      },
      data: {
        status,
      },
    });

    return res.json(company);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Erro ao atualizar status da empresa.",
    });
  }
});

module.exports = router;