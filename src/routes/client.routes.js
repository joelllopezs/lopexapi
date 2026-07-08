const express = require("express");
const prisma = require("../database/prisma");

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { name, email, phone } = req.body || {};
    const companyId = req.user.companyId;

    if (!companyId) {
      return res.status(400).json({
        message: "Usuário não está vinculado a nenhuma empresa."
      });
    }

    if (!name) {
      return res.status(400).json({
        message: "Nome é obrigatório."
      });
    }

    const client = await prisma.client.create({
      data: {
        companyId,
        name,
        email,
        phone
      }
    });

    return res.status(201).json(client);
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao criar cliente.",
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

    const clients = await prisma.client.findMany({
      where: {
        companyId
      },
      include: {
        company: true,
        appointments: true
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    return res.json(clients);
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao listar clientes.",
      error: error.message
    });
  }
});

module.exports = router;