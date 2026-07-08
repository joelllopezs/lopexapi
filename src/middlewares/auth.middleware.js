const jwt = require("jsonwebtoken");
const prisma = require("../database/prisma");

async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        message: "Token não informado."
      });
    }

    const [, token] = authHeader.split(" ");

    if (!token) {
      return res.status(401).json({
        message: "Token inválido."
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await prisma.user.findUnique({
      where: {
        id: decoded.id
      },
      include: {
        company: true
      }
    });

    if (!user) {
      return res.status(401).json({
        message: "Usuário não encontrado."
      });
    }

    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
      company: user.company
    };

    return next();
  } catch (error) {
    return res.status(401).json({
      message: "Token inválido ou expirado."
    });
  }
}

module.exports = authMiddleware;