const express = require("express");
const prisma = require("../database/prisma");

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { name, slug, email, phone, logoUrl, primaryColor } = req.body;

    if (!name || !slug) {
      return res.status(400).json({
        message: "Nome e slug são obrigatórios."
      });
    }

    const companyExists = await prisma.company.findUnique({
      where: { slug }
    });

    if (companyExists) {
      return res.status(400).json({
        message: "Já existe uma empresa com esse slug."
      });
    }

    const company = await prisma.company.create({
      data: {
        name,
        slug,
        email,
        phone,
        logoUrl,
        primaryColor
      }
    });

    return res.status(201).json(company);
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao criar empresa.",
      error: error.message
    });
  }
});

router.get("/", async (req, res) => {
  try {
    const companies = await prisma.company.findMany({
      orderBy: {
        createdAt: "desc"
      }
    });

    return res.json(companies);
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao listar empresas.",
      error: error.message
    });
  }
});
router.get("/me", async (req, res) => {
  try {
    if (!req.user.companyId) {
      return res.status(400).json({
        message: "Usuário não está vinculado a nenhuma empresa.",
      });
    }

    const company = await prisma.company.findUnique({
      where: {
        id: req.user.companyId,
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
      message: "Erro ao buscar empresa.",
    });
  }
});

router.put("/me", async (req, res) => {
  try {
    if (!req.user.companyId) {
      return res.status(400).json({
        message: "Usuário não está vinculado a nenhuma empresa.",
      });
    }

    const {
      name,
      slug,
      email,
      phone,
      logoUrl,
      primaryColor,
    } = req.body || {};

    if (!name || !slug) {
      return res.status(400).json({
        message: "Nome e slug da empresa são obrigatórios.",
      });
    }

    const slugAlreadyExists = await prisma.company.findFirst({
      where: {
        slug,
        NOT: {
          id: req.user.companyId,
        },
      },
    });

    if (slugAlreadyExists) {
      return res.status(400).json({
        message: "Já existe outra empresa usando este slug.",
      });
    }

    const company = await prisma.company.update({
      where: {
        id: req.user.companyId,
      },
      data: {
        name,
        slug,
        email: email || null,
        phone: phone || null,
        logoUrl: logoUrl || null,
        primaryColor: primaryColor || "#885AFE",
      },
    });

    return res.json({
      message: "Empresa atualizada com sucesso.",
      company,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Erro ao atualizar empresa.",
    });
  }
});

module.exports = router;