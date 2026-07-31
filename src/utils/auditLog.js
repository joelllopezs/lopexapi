const prisma = require("../database/prisma");

async function createAuditLog({
  req,
  companyId = null,
  userId = null,
  action,
  entity,
  entityId = null,
  description,
  metadata = null,
}) {
  try {
    if (!action || !entity || !description) {
      return null;
    }

    const resolvedUserId = userId || req?.user?.id || null;
    const resolvedCompanyId = companyId || req?.user?.companyId || null;

    const ip =
      req?.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req?.socket?.remoteAddress ||
      null;

    const userAgent = req?.headers?.["user-agent"] || null;

    return await prisma.auditLog.create({
      data: {
        companyId: resolvedCompanyId,
        userId: resolvedUserId,
        action,
        entity,
        entityId,
        description,
        metadata,
        ip,
        userAgent,
      },
    });
  } catch (error) {
    console.error("Erro ao criar log de auditoria:", error.message);
    return null;
  }
}

module.exports = {
  createAuditLog,
};