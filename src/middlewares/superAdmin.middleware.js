function superAdminMiddleware(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      message: "Usuário não autenticado.",
    });
  }

  if (req.user.role !== "super_admin") {
    return res.status(403).json({
      message: "Acesso permitido apenas para Super Admin.",
    });
  }

  return next();
}

module.exports = superAdminMiddleware;