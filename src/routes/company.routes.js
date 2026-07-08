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

module.exports = router;