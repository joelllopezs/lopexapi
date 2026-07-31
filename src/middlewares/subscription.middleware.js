const prisma = require("../database/prisma");

const WRITE_METHODS = ["POST", "PUT", "PATCH", "DELETE"];

function isDateExpired(value) {
  if (!value) return false;

  const today = new Date();
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return false;
  }

  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);

  return date < today;
}

async function subscriptionMiddleware(req, res, next) {
  try {
    if (!WRITE_METHODS.includes(req.method)) {
      return next();
    }

    if (!req.user) {
      return res.status(401).json({
        message: "Usuário não autenticado.",
      });
    }

    if (req.user.role === "super_admin") {
      return next();
    }

    if (!req.user.companyId) {
      return res.status(403).json({
        message: "Usuário não está vinculado a uma empresa.",
      });
    }

    const company = await prisma.company.findUnique({
      where: {
        id: req.user.companyId,
      },
      select: {
        id: true,
        status: true,
        subscriptionStatus: true,
        subscriptionEnd: true,
        trialEndsAt: true,
      },
    });

    if (!company) {
      return res.status(404).json({
        message: "Empresa não encontrada.",
      });
    }

    if (company.status !== "active") {
      return res.status(403).json({
        message: "Empresa inativa. Aguarde a liberação do Admin Master.",
      });
    }

    const subscriptionStatus = company.subscriptionStatus || "trial";

    if (subscriptionStatus === "cancelled") {
      return res.status(403).json({
        message:
          "Assinatura cancelada. Regularize sua assinatura para continuar usando o sistema.",
        code: "SUBSCRIPTION_CANCELLED",
      });
    }

    if (subscriptionStatus === "overdue") {
      return res.status(403).json({
        message:
          "Pagamento atrasado. Regularize sua assinatura para continuar criando ou alterando dados.",
        code: "SUBSCRIPTION_OVERDUE",
      });
    }

    if (subscriptionStatus === "trial" && isDateExpired(company.trialEndsAt)) {
      return res.status(403).json({
        message:
          "Seu período de teste gratuito terminou. Regularize sua assinatura para continuar usando o sistema.",
        code: "TRIAL_EXPIRED",
      });
    }

    if (
      subscriptionStatus === "active" &&
      isDateExpired(company.subscriptionEnd)
    ) {
      return res.status(403).json({
        message:
          "Sua assinatura venceu. Regularize para continuar criando ou alterando dados.",
        code: "SUBSCRIPTION_EXPIRED",
      });
    }

    return next();
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Erro ao validar assinatura da empresa.",
      error: error.message,
    });
  }
}

module.exports = subscriptionMiddleware;