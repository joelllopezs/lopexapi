const express = require("express");
const prisma = require("../database/prisma");

const router = express.Router();

const VALID_DOCUMENT_TYPES = ["cpf", "cnpj"];
const VALID_SERVICE_MODES = ["local", "home", "online", "whatsapp"];

function normalizeText(value) {
  return String(value || "").trim();
}

function onlyNumbers(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeEmail(email) {
  if (!email) return null;

  return String(email).trim().toLowerCase();
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

function isValidEmail(email) {
  if (!email) return true;

  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || ""));
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

function validateCompanyDetails({
  name,
  slug,
  email,
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
  if (!name || name.length < 3) {
    return "O nome da empresa precisa ter pelo menos 3 caracteres.";
  }

  if (!slug || slug.length < 3) {
    return "O slug precisa ter pelo menos 3 caracteres.";
  }

  if (email && !isValidEmail(email)) {
    return "Informe um e-mail válido.";
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

function buildCompanyPayload(body) {
  const name = normalizeText(body?.name);
  const slug = normalizeText(body?.slug).toLowerCase();
  const email = normalizeEmail(body?.email);
  const phone = normalizeText(body?.phone);
  const logoUrl = normalizeText(body?.logoUrl) || null;
  const primaryColor = normalizeText(body?.primaryColor) || "#885AFE";

  const documentType = normalizeDocumentType(body?.documentType);
  const document = onlyNumbers(body?.document);

  const serviceMode = normalizeServiceMode(body?.serviceMode);

  const zipCode = normalizeText(body?.zipCode);
  const street = normalizeText(body?.street);
  const number = normalizeText(body?.number);
  const neighborhood = normalizeText(body?.neighborhood);
  const complement = normalizeText(body?.complement);
  const city = normalizeText(body?.city);
  const state = normalizeText(body?.state).toUpperCase();

  return {
    name,
    slug,
    email,
    phone,
    logoUrl,
    primaryColor,
    document,
    documentType,
    serviceMode,
    zipCode,
    street,
    number,
    neighborhood,
    complement,
    city,
    state,
  };
}

router.post("/", async (req, res) => {
  try {
    const payload = buildCompanyPayload(req.body);

    const validationError = validateCompanyDetails(payload);

    if (validationError) {
      return res.status(400).json({
        message: validationError,
      });
    }

    const companyExists = await prisma.company.findUnique({
      where: {
        slug: payload.slug,
      },
    });

    if (companyExists) {
      return res.status(400).json({
        message: "Já existe uma empresa com esse slug.",
      });
    }

    const company = await prisma.company.create({
      data: {
        name: payload.name,
        slug: payload.slug,
        email: payload.email,
        phone: payload.phone || null,
        logoUrl: payload.logoUrl,
        primaryColor: payload.primaryColor,
        document: payload.document,
        documentType: payload.documentType,
        serviceMode: payload.serviceMode,
        zipCode: payload.zipCode || null,
        street: payload.street || null,
        number: payload.number || null,
        neighborhood: payload.neighborhood || null,
        complement: payload.complement || null,
        city: payload.city,
        state: payload.state,
      },
    });

    return res.status(201).json(company);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Erro ao criar empresa.",
      error: error.message,
    });
  }
});

router.get("/", async (req, res) => {
  try {
    const companies = await prisma.company.findMany({
      orderBy: {
        createdAt: "desc",
      },
    });

    return res.json(companies);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Erro ao listar empresas.",
      error: error.message,
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

    const payload = buildCompanyPayload(req.body);

    const validationError = validateCompanyDetails(payload);

    if (validationError) {
      return res.status(400).json({
        message: validationError,
      });
    }

    const slugAlreadyExists = await prisma.company.findFirst({
      where: {
        slug: payload.slug,
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
        name: payload.name,
        slug: payload.slug,
        email: payload.email,
        phone: payload.phone || null,
        logoUrl: payload.logoUrl,
        primaryColor: payload.primaryColor,
        document: payload.document,
        documentType: payload.documentType,
        serviceMode: payload.serviceMode,
        zipCode: payload.zipCode || null,
        street: payload.street || null,
        number: payload.number || null,
        neighborhood: payload.neighborhood || null,
        complement: payload.complement || null,
        city: payload.city,
        state: payload.state,
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
      error: error.message,
    });
  }
});

module.exports = router;