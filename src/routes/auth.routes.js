const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const prisma = require("../database/prisma");
const authMiddleware = require("../middlewares/auth.middleware");

const router = express.Router();

function generateSlug(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

function onlyNumbers(value) {
  return String(value || "").replace(/\D/g, "");
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || ""));
}

function isValidPhone(phone) {
  const numbers = onlyNumbers(phone);

  return numbers.length === 10 || numbers.length === 11;
}

function isValidSlug(slug) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(slug || ""));
}

function normalizeEmail(email) {
  if (!email) return null;

  return String(email).trim().toLowerCase();
}

function normalizeText(value) {
  return String(value || "").trim();
}

function validateUserData({ name, email, password }) {
  if (!name || name.length < 3) {
    return "O nome precisa ter pelo menos 3 caracteres.";
  }

  if (!email) {
    return "Informe o e-mail.";
  }

  if (!isValidEmail(email)) {
    return "Informe um e-mail válido.";
  }

  if (!password) {
    return "Informe a senha.";
  }

  if (password.length < 6) {
    return "A senha precisa ter pelo menos 6 caracteres.";
  }

  return null;
}

function validateCompanyData({
  companyName,
  companySlug,
  companyEmail,
  companyPhone,
}) {
  if (!companyName || companyName.length < 3) {
    return "O nome da empresa precisa ter pelo menos 3 caracteres.";
  }

  if (!companySlug) {
    return "Informe o slug da empresa.";
  }

  if (companySlug.length < 3) {
    return "O slug precisa ter pelo menos 3 caracteres.";
  }

  if (!isValidSlug(companySlug)) {
    return "O slug deve conter apenas letras minúsculas, números e hífen.";
  }

  if (companyEmail && !isValidEmail(companyEmail)) {
    return "Informe um e-mail da empresa válido.";
  }

  if (!companyPhone) {
    return "Informe o telefone/WhatsApp da empresa.";
  }

  if (!isValidPhone(companyPhone)) {
    return "Informe um telefone válido com DDD. Exemplo: (14) 99999-9999.";
  }

  return null;
}

router.post("/register", async (req, res) => {
  try {
    const name = normalizeText(req.body?.name);
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");
    const companyId = req.body?.companyId || null;

    const validationError = validateUserData({
      name,
      email,
      password,
    });

    if (validationError) {
      return res.status(400).json({
        message: validationError,
      });
    }

    const userExists = await prisma.user.findUnique({
      where: {
        email,
      },
    });

    if (userExists) {
      return res.status(400).json({
        message: "Já existe um usuário com esse e-mail.",
      });
    }

    if (companyId) {
      const companyExists = await prisma.company.findUnique({
        where: {
          id: companyId,
        },
      });

      if (!companyExists) {
        return res.status(404).json({
          message: "Empresa não encontrada.",
        });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        companyId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        companyId: true,
        createdAt: true,
      },
    });

    return res.status(201).json({
      message: "Usuário criado com sucesso.",
      user,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Erro ao cadastrar usuário.",
      error: error.message,
    });
  }
});

router.post("/login", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");

    if (!email || !password) {
      return res.status(400).json({
        message: "E-mail e senha são obrigatórios.",
      });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({
        message: "Informe um e-mail válido.",
      });
    }

    const user = await prisma.user.findUnique({
      where: {
        email,
      },
      include: {
        company: true,
      },
    });

    if (!user) {
      return res.status(401).json({
        message: "E-mail ou senha inválidos.",
      });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return res.status(401).json({
        message: "E-mail ou senha inválidos.",
      });
    }

    if (user.status !== "active") {
      return res.status(403).json({
        message: "Usuário inativo.",
      });
    }

    if (user.company && user.company.status !== "active") {
      return res.status(403).json({
        message: "Empresa inativa.",
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        companyId: user.companyId,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d",
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
        company: user.company,
      },
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Erro ao fazer login.",
      error: error.message,
    });
  }
});

router.get("/me", authMiddleware, async (req, res) => {
  return res.json({
    user: req.user,
  });
});

router.post("/setup-company", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const name = normalizeText(req.body?.name);
    const slug = generateSlug(req.body?.slug);
    const email = normalizeEmail(req.body?.email);
    const phone = normalizeText(req.body?.phone);
    const logoUrl = normalizeText(req.body?.logoUrl) || null;
    const primaryColor = normalizeText(req.body?.primaryColor) || "#885AFE";

    const companyValidationError = validateCompanyData({
      companyName: name,
      companySlug: slug,
      companyEmail: email,
      companyPhone: phone,
    });

    if (companyValidationError) {
      return res.status(400).json({
        message: companyValidationError,
      });
    }

    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!user) {
      return res.status(404).json({
        message: "Usuário não encontrado.",
      });
    }

    if (user.companyId) {
      return res.status(400).json({
        message: "Usuário já está vinculado a uma empresa.",
      });
    }

    const companyExists = await prisma.company.findUnique({
      where: {
        slug,
      },
    });

    if (companyExists) {
      return res.status(400).json({
        message: "Já existe uma empresa com esse slug.",
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name,
          slug,
          email,
          phone,
          logoUrl,
          primaryColor,
          status: "active",
        },
      });

      const updatedUser = await tx.user.update({
        where: {
          id: userId,
        },
        data: {
          companyId: company.id,
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          status: true,
          companyId: true,
          company: true,
        },
      });

      return {
        company,
        user: updatedUser,
      };
    });

    return res.status(201).json({
      message: "Empresa criada e vinculada ao usuário com sucesso.",
      ...result,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Erro ao configurar empresa.",
      error: error.message,
    });
  }
});

router.post("/register-company", async (req, res) => {
  try {
    const userName = normalizeText(req.body?.userName);
    const userEmail = normalizeEmail(req.body?.userEmail);
    const password = String(req.body?.password || "");

    const companyName = normalizeText(req.body?.companyName);
    const companySlug = generateSlug(req.body?.companySlug);
    const companyEmail = normalizeEmail(req.body?.companyEmail);
    const companyPhone = normalizeText(req.body?.companyPhone);
    const logoUrl = normalizeText(req.body?.logoUrl) || null;
    const primaryColor = normalizeText(req.body?.primaryColor) || "#885AFE";

    const userValidationError = validateUserData({
      name: userName,
      email: userEmail,
      password,
    });

    if (userValidationError) {
      return res.status(400).json({
        message: userValidationError,
      });
    }

    const companyValidationError = validateCompanyData({
      companyName,
      companySlug,
      companyEmail,
      companyPhone,
    });

    if (companyValidationError) {
      return res.status(400).json({
        message: companyValidationError,
      });
    }

    const userAlreadyExists = await prisma.user.findUnique({
      where: {
        email: userEmail,
      },
    });

    if (userAlreadyExists) {
      return res.status(400).json({
        message: "Já existe um usuário com este e-mail.",
      });
    }

    const companyAlreadyExists = await prisma.company.findUnique({
      where: {
        slug: companySlug,
      },
    });

    if (companyAlreadyExists) {
      return res.status(400).json({
        message: "Já existe uma empresa com este slug.",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name: companyName,
          slug: companySlug,
          email: companyEmail,
          phone: companyPhone,
          logoUrl,
          primaryColor,
          status: "active",
        },
      });

      const user = await tx.user.create({
        data: {
          name: userName,
          email: userEmail,
          password: hashedPassword,
          role: "company_admin",
          status: "active",
          companyId: company.id,
        },
      });

      return {
        company,
        user,
      };
    });

    const token = jwt.sign(
      {
        id: result.user.id,
        email: result.user.email,
        role: result.user.role,
        companyId: result.user.companyId,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d",
      }
    );

    return res.status(201).json({
      message: "Empresa e usuário criados com sucesso.",
      token,
      user: {
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
        role: result.user.role,
        status: result.user.status,
        companyId: result.user.companyId,
      },
      company: result.company,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Erro ao cadastrar empresa.",
      error: error.message,
    });
  }
});

module.exports = router;