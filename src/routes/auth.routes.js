const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const prisma = require("../database/prisma");
const authMiddleware = require("../middlewares/auth.middleware");

const router = express.Router();

const VALID_COMPANY_PLANS = ["start", "pro", "premium"];
const VALID_DOCUMENT_TYPES = ["cpf", "cnpj"];
const VALID_SERVICE_MODES = ["local", "home", "online", "whatsapp"];
const TRIAL_DAYS = 7;

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

function isValidCompanyPlan(plan) {
  return VALID_COMPANY_PLANS.includes(plan);
}

function isValidCpf(cpf) {
  const numbers = onlyNumbers(cpf);

  if (numbers.length !== 11) return false;
  if (/^(\d)\1+$/.test(numbers)) return false;

  let sum = 0;

  for (let i = 0; i < 9; i += 1) {
    sum += Number(numbers.charAt(i)) * (10 - i);
  }

  let digit = 11 - (sum % 11);

  if (digit >= 10) {
    digit = 0;
  }

  if (digit !== Number(numbers.charAt(9))) {
    return false;
  }

  sum = 0;

  for (let i = 0; i < 10; i += 1) {
    sum += Number(numbers.charAt(i)) * (11 - i);
  }

  digit = 11 - (sum % 11);

  if (digit >= 10) {
    digit = 0;
  }

  return digit === Number(numbers.charAt(10));
}

function isValidCnpj(cnpj) {
  const numbers = onlyNumbers(cnpj);

  if (numbers.length !== 14) return false;
  if (/^(\d)\1+$/.test(numbers)) return false;

  const calcDigit = (base, weights) => {
    const sum = base
      .split("")
      .reduce((total, digit, index) => total + Number(digit) * weights[index], 0);

    const rest = sum % 11;

    return rest < 2 ? 0 : 11 - rest;
  };

  const firstDigit = calcDigit(numbers.slice(0, 12), [
    5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2,
  ]);

  const secondDigit = calcDigit(numbers.slice(0, 13), [
    6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2,
  ]);

  return (
    firstDigit === Number(numbers.charAt(12)) &&
    secondDigit === Number(numbers.charAt(13))
  );
}

function normalizeEmail(email) {
  if (!email) return null;

  return String(email).trim().toLowerCase();
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeCompanyPlan(plan) {
  const normalizedPlan = normalizeText(plan).toLowerCase();

  if (!normalizedPlan) {
    return "start";
  }

  return normalizedPlan;
}

function normalizeDocumentType(value) {
  const documentType = normalizeText(value).toLowerCase();

  if (!documentType) {
    return "cpf";
  }

  return documentType;
}

function normalizeServiceMode(value) {
  const serviceMode = normalizeText(value).toLowerCase();

  if (!serviceMode) {
    return "whatsapp";
  }

  return serviceMode;
}

function normalizeState(value) {
  return normalizeText(value).toUpperCase();
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function createTrialDates() {
  const now = new Date();
  const trialEndsAt = addDays(now, TRIAL_DAYS);

  return {
    subscriptionStatus: "trial",
    subscriptionStart: now,
    subscriptionEnd: trialEndsAt,
    trialEndsAt,
  };
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
  document,
  documentType,
  serviceMode,
  zipCode,
  street,
  number,
  neighborhood,
  city,
  state,
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

  if (!document) {
    return "Informe o CPF do responsável.";
  }

  if (!VALID_DOCUMENT_TYPES.includes(documentType)) {
    return "Tipo de documento inválido. Use cpf ou cnpj.";
  }

  if (documentType === "cpf" && !isValidCpf(document)) {
    return "Informe um CPF válido.";
  }

  if (documentType === "cnpj" && !isValidCnpj(document)) {
    return "Informe um CNPJ válido.";
  }

  if (!serviceMode) {
    return "Informe o tipo de atendimento.";
  }

  if (!VALID_SERVICE_MODES.includes(serviceMode)) {
    return "Tipo de atendimento inválido. Use local, home, online ou whatsapp.";
  }

  if (!city) {
    return "Informe a cidade.";
  }

  if (!state) {
    return "Informe o estado.";
  }

  if (serviceMode === "local") {
    if (!zipCode) {
      return "Informe o CEP para atendimento em local físico.";
    }

    if (!street) {
      return "Informe a rua para atendimento em local físico.";
    }

    if (!number) {
      return "Informe o número para atendimento em local físico.";
    }

    if (!neighborhood) {
      return "Informe o bairro para atendimento em local físico.";
    }
  }

  return null;
}

function buildCompanyFieldsFromBody(body, prefix = "") {
  const getValue = (name) => {
    const prefixedName =
      prefix && name.charAt(0).toUpperCase() + name.slice(1);

    if (prefix && body?.[`${prefix}${prefixedName}`] !== undefined) {
      return body[`${prefix}${prefixedName}`];
    }

    return body?.[name];
  };

  const documentType = normalizeDocumentType(
    getValue("documentType") || body?.companyDocumentType
  );

  const document = onlyNumbers(
    getValue("document") || body?.companyDocument || body?.responsibleCpf
  );

  const serviceMode = normalizeServiceMode(
    getValue("serviceMode") || body?.companyServiceMode
  );

  return {
    document,
    documentType,
    serviceMode,
    zipCode: normalizeText(getValue("zipCode") || body?.companyZipCode),
    street: normalizeText(getValue("street") || body?.companyStreet),
    number: normalizeText(getValue("number") || body?.companyNumber),
    neighborhood: normalizeText(
      getValue("neighborhood") || body?.companyNeighborhood
    ),
    complement: normalizeText(getValue("complement") || body?.companyComplement),
    city: normalizeText(getValue("city") || body?.companyCity),
    state: normalizeState(getValue("state") || body?.companyState),
  };
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

    if (
      user.role !== "super_admin" &&
      user.company &&
      user.company.status !== "active"
    ) {
      return res.status(403).json({
        message: "Empresa inativa. Aguarde a liberação do Admin Master.",
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
    const plan = normalizeCompanyPlan(req.body?.plan);
    const companyFields = buildCompanyFieldsFromBody(req.body);

    if (!isValidCompanyPlan(plan)) {
      return res.status(400).json({
        message: "Plano inválido. Use start, pro ou premium.",
      });
    }

    const companyValidationError = validateCompanyData({
      companyName: name,
      companySlug: slug,
      companyEmail: email,
      companyPhone: phone,
      ...companyFields,
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

    const trialData = createTrialDates();

    const result = await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name,
          slug,
          email,
          phone,
          logoUrl,
          primaryColor,
          status: "inactive",
          plan,
          ...companyFields,
          zipCode: companyFields.zipCode || null,
          street: companyFields.street || null,
          number: companyFields.number || null,
          neighborhood: companyFields.neighborhood || null,
          complement: companyFields.complement || null,
          ...trialData,
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
    const plan = normalizeCompanyPlan(req.body?.plan);
    const companyFields = buildCompanyFieldsFromBody(req.body, "company");

    if (!isValidCompanyPlan(plan)) {
      return res.status(400).json({
        message: "Plano inválido. Use start, pro ou premium.",
      });
    }

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
      ...companyFields,
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
    const trialData = createTrialDates();

    const result = await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name: companyName,
          slug: companySlug,
          email: companyEmail,
          phone: companyPhone,
          logoUrl,
          primaryColor,
          status: "inactive",
          plan,
          ...companyFields,
          zipCode: companyFields.zipCode || null,
          street: companyFields.street || null,
          number: companyFields.number || null,
          neighborhood: companyFields.neighborhood || null,
          complement: companyFields.complement || null,
          ...trialData,
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

    return res.status(201).json({
      message:
        "Empresa e usuário criados com sucesso. Aguarde a liberação do Admin Master.",
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