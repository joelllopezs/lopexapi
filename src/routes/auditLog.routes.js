const express = require("express");
const prisma = require("../database/prisma");
const authMiddleware = require("../middlewares/auth.middleware");
const superAdminMiddleware = require("../middlewares/superAdmin.middleware");

const router = express.Router();

router.use(authMiddleware);
router.use(superAdminMiddleware);

router.get("/", async (req, res) => {
  try {
    const {
      search,
      action,
      entity,
      companyId,
      userId,
      startDate,
      endDate,
      page = 1,
      limit = 50,
    } = req.query;

    const currentPage = Math.max(Number(page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const skip = (currentPage - 1) * pageSize;

    const where = {};

    if (action) {
      where.action = action;
    }

    if (entity) {
      where.entity = entity;
    }

    if (companyId) {
      where.companyId = companyId;
    }

    if (userId) {
      where.userId = userId;
    }

    if (startDate || endDate) {
      where.createdAt = {};

      if (startDate) {
        where.createdAt.gte = new Date(`${startDate}T00:00:00.000Z`);
      }

      if (endDate) {
        where.createdAt.lte = new Date(`${endDate}T23:59:59.999Z`);
      }
    }

    if (search) {
      where.OR = [
        {
          description: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          action: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          entity: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          company: {
            name: {
              contains: search,
              mode: "insensitive",
            },
          },
        },
        {
          company: {
            slug: {
              contains: search,
              mode: "insensitive",
            },
          },
        },
        {
          user: {
            name: {
              contains: search,
              mode: "insensitive",
            },
          },
        },
        {
          user: {
            email: {
              contains: search,
              mode: "insensitive",
            },
          },
        },
      ];
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take: pageSize,
        include: {
          company: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return res.json({
      logs,
      pagination: {
        page: currentPage,
        limit: pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Erro ao listar logs de auditoria.",
      error: error.message,
    });
  }
});

router.get("/summary", async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const last7Days = new Date();
    last7Days.setDate(last7Days.getDate() - 7);
    last7Days.setHours(0, 0, 0, 0);

    const [
      totalLogs,
      logsToday,
      logsLast7Days,
      actions,
      entities,
    ] = await Promise.all([
      prisma.auditLog.count(),
      prisma.auditLog.count({
        where: {
          createdAt: {
            gte: today,
          },
        },
      }),
      prisma.auditLog.count({
        where: {
          createdAt: {
            gte: last7Days,
          },
        },
      }),
      prisma.auditLog.groupBy({
        by: ["action"],
        _count: {
          action: true,
        },
        orderBy: {
          _count: {
            action: "desc",
          },
        },
        take: 8,
      }),
      prisma.auditLog.groupBy({
        by: ["entity"],
        _count: {
          entity: true,
        },
        orderBy: {
          _count: {
            entity: "desc",
          },
        },
        take: 8,
      }),
    ]);

    return res.json({
      totalLogs,
      logsToday,
      logsLast7Days,
      actions,
      entities,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Erro ao carregar resumo dos logs.",
      error: error.message,
    });
  }
});

module.exports = router;