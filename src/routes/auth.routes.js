const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const prisma = require("../database/prisma");
const authMiddleware = require("../middlewares/auth.middleware");

const router = express.Router();

router.post("/register", async (req, res) => {
  try {
    const { name, email, password, companyId } = req.body || {};

    if (!name || !email || !password) {
      return res.status(400).json({
        message: "Nome, e-mail e senha são obrigatórios."
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        message: "A senha precisa ter pelo menos 6 caracteres."
      });
    }

    const userExists = await prisma.user.findUnique({
      where: {
        email
      }
    });

    if (userExists) {
      return res.status(400).json({
        message: "Já existe um usuário com esse e-mail."
      });
    }

    if (companyId) {
      const companyExists = await prisma.company.findUnique({
        where: {
          id: companyId
        }
      });

      if (!companyExists) {
        return res.status(404).json({
          message: "Empresa não encontrada."
        });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 8);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        companyId
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        companyId: true,
        createdAt: true
      }
    });

    return res.status(201).json({
      message: "Usuário criado com sucesso.",
      user
    });
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao cadastrar usuário.",
      error: error.message
    });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({
        message: "E-mail e senha são obrigatórios."
      });
    }

    const user = await prisma.user.findUnique({
      where: {
        email
      },
      include: {
        company: true
      }
    });

    if (!user) {
      return res.status(401).json({
        message: "E-mail ou senha inválidos."
      });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return res.status(401).json({
        message: "E-mail ou senha inválidos."
      });
    }

    if (user.status !== "active") {
      return res.status(403).json({
        message: "Usuário inativo."
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        companyId: user.companyId
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d"
      }
    );

    return res.json({
      message: "Login realizado com sucesso.",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        companyId: user.companyId,
        company: user.company
      }
    });
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao fazer login.",
      error: error.message
    });
  }
});

router.get("/me", authMiddleware, async (req, res) => {
  return res.json({
    user: req.user
  });
});

module.exports = router;