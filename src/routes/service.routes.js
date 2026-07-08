const express = require("express");
const prisma = require("../database/prisma");

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { name, description, duration, price } = req.body || {};
    const companyId = req.user.companyId;

    if (!companyId) {
      return res.status(400).json({
        message: "Usuário não está vinculado a nenhuma empresa."
      });
    }

    if (!name || !duration) {
      return res.status(400).json({
        message: "Nome e duração são obrigatórios."
      });
    }

    const service = await prisma.service.create({
      data: {
        companyId,
        name,
        description,
        duration,
        price
      }
    });

    return res.status(201).json(service);
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao criar serviço.",
      error: error.message
    });
  }
});

router.get("/", async (req, res) => {
  try {
    const companyId = req.user.companyId;

    if (!companyId) {
      return res.status(400).json({
        message: "Usuário não está vinculado a nenhuma empresa."
      });
    }

    const services = await prisma.service.findMany({
      where: {
        companyId
      },
      include: {
        company: true
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    return res.json(services);
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao listar serviços.",
      error: error.message
    });
  }
});

module.exports = router;