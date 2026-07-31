const express = require("express");

const router = express.Router();

router.get("/", (req, res) => {
  const baseUrl = `${req.protocol}://${req.get("host")}`;

  return res.json({
    name: "LopeX Agenda API",
    version: "1.0.0",
    status: "operational",
    description:
      "API oficial do LopeX Agenda para gestão de empresas, serviços, profissionais, clientes, horários, agendamentos, assinaturas, logs e relatórios.",
    baseUrl,
    health: `${baseUrl}/health`,
    authentication: {
      type: "Bearer Token JWT",
      header: "Authorization: Bearer <token>",
      notes: [
        "Rotas públicas não exigem autenticação.",
        "Rotas protegidas exigem token JWT.",
        "Rotas administrativas exigem usuário com role super_admin.",
      ],
    },
    publicRoutes: [
      {
        method: "GET",
        path: "/public/:slug",
        description: "Carrega dados públicos da empresa pelo slug.",
      },
      {
        method: "GET",
        path: "/public/:slug/services",
        description: "Lista serviços públicos disponíveis para agendamento.",
      },
      {
        method: "GET",
        path: "/public/:slug/professionals",
        description: "Lista profissionais públicos disponíveis.",
      },
      {
        method: "GET",
        path: "/public/:slug/availability",
        description: "Consulta horários disponíveis para agendamento público.",
        query: ["serviceId", "professionalId", "date"],
      },
      {
        method: "POST",
        path: "/public/:slug/appointments",
        description: "Cria agendamento pela página pública.",
        bodyExample: {
          serviceId: "uuid",
          professionalId: "uuid",
          date: "2026-07-31",
          startTime: "09:00",
          clientName: "Cliente Teste",
          clientEmail: "cliente@email.com",
          clientPhone: "(14) 99999-9999",
          notes: "Observação opcional",
        },
      },
      {
        method: "GET",
        path: "/public/appointments/:id/cancel/:cancelToken",
        description: "Consulta dados de cancelamento público.",
      },
      {
        method: "POST",
        path: "/public/appointments/:id/cancel/:cancelToken",
        description: "Cancela um agendamento público usando token de cancelamento.",
      },
    ],
    authRoutes: [
      {
        method: "POST",
        path: "/auth/login",
        description: "Realiza login e retorna token JWT.",
        bodyExample: {
          email: "admin@lopex.ia",
          password: "123456",
        },
      },
      {
        method: "POST",
        path: "/auth/register",
        description: "Cria usuário administrativo.",
      },
      {
        method: "POST",
        path: "/auth/register-company",
        description: "Cria empresa com usuário administrador e plano inicial.",
        bodyExample: {
          companyName: "Empresa Teste",
          slug: "empresa-teste",
          companyEmail: "empresa@email.com",
          companyPhone: "(14) 99999-9999",
          name: "Administrador",
          email: "admin@empresa.com",
          password: "123456",
          plan: "start",
        },
      },
      {
        method: "POST",
        path: "/auth/setup-company",
        description: "Cria/vincula empresa em fluxo de setup.",
      },
    ],
    protectedRoutes: {
      companies: [
        {
          method: "GET",
          path: "/companies/me",
          description: "Carrega empresa vinculada ao usuário autenticado.",
        },
        {
          method: "PUT",
          path: "/companies/me",
          description: "Atualiza dados da empresa autenticada.",
        },
      ],
      services: [
        {
          method: "GET",
          path: "/services",
          description: "Lista serviços da empresa autenticada.",
        },
        {
          method: "POST",
          path: "/services",
          description: "Cria serviço.",
          bodyExample: {
            name: "Corte masculino",
            description: "Serviço de corte",
            duration: 30,
            price: 50,
          },
        },
        {
          method: "PUT",
          path: "/services/:id",
          description: "Atualiza serviço.",
        },
        {
          method: "DELETE",
          path: "/services/:id",
          description: "Remove serviço.",
        },
      ],
      professionals: [
        {
          method: "GET",
          path: "/professionals",
          description: "Lista profissionais.",
        },
        {
          method: "POST",
          path: "/professionals",
          description: "Cria profissional respeitando limite do plano.",
          bodyExample: {
            name: "João Profissional",
            email: "joao@email.com",
            phone: "(14) 99999-9999",
          },
        },
        {
          method: "PUT",
          path: "/professionals/:id",
          description: "Atualiza profissional.",
        },
        {
          method: "DELETE",
          path: "/professionals/:id",
          description: "Remove profissional.",
        },
      ],
      clients: [
        {
          method: "GET",
          path: "/clients",
          description: "Lista clientes.",
        },
        {
          method: "POST",
          path: "/clients",
          description: "Cria cliente.",
          bodyExample: {
            name: "Cliente Teste",
            email: "cliente@email.com",
            phone: "(14) 99999-9999",
          },
        },
        {
          method: "PUT",
          path: "/clients/:id",
          description: "Atualiza cliente.",
        },
        {
          method: "DELETE",
          path: "/clients/:id",
          description: "Remove cliente.",
        },
      ],
      businessHours: [
        {
          method: "GET",
          path: "/business-hours",
          description: "Lista horários de funcionamento.",
        },
        {
          method: "POST",
          path: "/business-hours",
          description: "Cria ou atualiza horário de funcionamento.",
          bodyExample: {
            dayOfWeek: 1,
            isOpen: true,
            openTime: "08:00",
            closeTime: "18:00",
            breakStart: "12:00",
            breakEnd: "13:00",
          },
        },
      ],
      appointments: [
        {
          method: "GET",
          path: "/appointments",
          description: "Lista agendamentos.",
        },
        {
          method: "POST",
          path: "/appointments",
          description: "Cria agendamento pelo painel.",
          bodyExample: {
            serviceId: "uuid",
            professionalId: "uuid",
            clientId: "uuid",
            date: "2026-07-31",
            startTime: "09:00",
            notes: "Observação opcional",
          },
        },
        {
          method: "PATCH",
          path: "/appointments/:id/status",
          description: "Atualiza status do agendamento.",
          bodyExample: {
            status: "confirmed",
          },
        },
        {
          method: "DELETE",
          path: "/appointments/:id",
          description: "Remove/cancela agendamento.",
        },
      ],
      availability: [
        {
          method: "GET",
          path: "/availability",
          description: "Consulta disponibilidade de horários.",
          query: ["serviceId", "professionalId", "date"],
        },
      ],
    },
    adminRoutes: [
      {
        method: "GET",
        path: "/admin/summary",
        description: "Resumo geral do Admin Master.",
      },
      {
        method: "GET",
        path: "/admin/plans",
        description: "Lista planos disponíveis.",
      },
      {
        method: "GET",
        path: "/admin/companies",
        description: "Lista todas as empresas.",
      },
      {
        method: "GET",
        path: "/admin/companies/:id",
        description: "Detalha uma empresa.",
      },
      {
        method: "PATCH",
        path: "/admin/companies/:id/status",
        description: "Ativa ou bloqueia empresa.",
        bodyExample: {
          status: "active",
        },
      },
      {
        method: "PATCH",
        path: "/admin/companies/:id/plan",
        description: "Altera plano da empresa.",
        bodyExample: {
          plan: "pro",
        },
      },
      {
        method: "PATCH",
        path: "/admin/companies/:id/subscription",
        description: "Atualiza assinatura da empresa.",
        bodyExample: {
          subscriptionStatus: "active",
          subscriptionStart: "2026-07-31",
          subscriptionEnd: "2026-08-30",
          trialEndsAt: null,
        },
      },
      {
        method: "PATCH",
        path: "/admin/companies/:id/subscription/renew",
        description: "Renova assinatura por quantidade de dias.",
        bodyExample: {
          days: 30,
        },
      },
      {
        method: "PATCH",
        path: "/admin/companies/:id/subscription/extend-trial",
        description: "Estende período de trial.",
        bodyExample: {
          days: 7,
        },
      },
      {
        method: "PATCH",
        path: "/admin/companies/:id/subscription/mark-active",
        description: "Marca assinatura como ativa.",
      },
      {
        method: "PATCH",
        path: "/admin/companies/:id/subscription/mark-overdue",
        description: "Marca assinatura como atrasada.",
      },
      {
        method: "PATCH",
        path: "/admin/companies/:id/subscription/reactivate",
        description: "Reativa empresa com assinatura ativa.",
        bodyExample: {
          days: 30,
        },
      },
      {
        method: "DELETE",
        path: "/admin/companies/:id",
        description: "Exclui empresa permanentemente.",
        bodyExample: {
          confirmText: "EXCLUIR",
        },
      },
    ],
    auditLogRoutes: [
      {
        method: "GET",
        path: "/audit-logs",
        description: "Lista logs de auditoria do sistema.",
        query: [
          "search",
          "action",
          "entity",
          "companyId",
          "userId",
          "startDate",
          "endDate",
          "page",
          "limit",
        ],
      },
      {
        method: "GET",
        path: "/audit-logs/summary",
        description: "Resumo dos logs de auditoria.",
      },
    ],
    reportRoutes: [
      {
        method: "GET",
        path: "/reports/summary",
        description: "Resumo de relatórios por período.",
        query: ["startDate", "endDate", "companyId"],
      },
      {
        method: "GET",
        path: "/reports/services",
        description: "Relatório de serviços mais agendados.",
        query: ["startDate", "endDate", "companyId"],
      },
      {
        method: "GET",
        path: "/reports/professionals",
        description: "Relatório de profissionais com mais agendamentos.",
        query: ["startDate", "endDate", "companyId"],
      },
      {
        method: "GET",
        path: "/reports/appointments-by-day",
        description: "Relatório de agendamentos por dia.",
        query: ["startDate", "endDate", "companyId"],
      },
      {
        method: "GET",
        path: "/reports/companies",
        description:
          "Lista empresas para filtro de relatório. Disponível apenas para Super Admin.",
      },
    ],
    plans: [
      {
        id: "start",
        name: "Start",
        price: "R$ 49,90/mês",
        limits: {
          professionals: 2,
          services: "ilimitado",
          clients: "ilimitado",
          appointments: "ilimitado",
        },
      },
      {
        id: "pro",
        name: "Pro",
        price: "R$ 79,90/mês",
        limits: {
          professionals: 5,
          services: "ilimitado",
          clients: "ilimitado",
          appointments: "ilimitado",
        },
      },
      {
        id: "premium",
        name: "Premium",
        price: "R$ 149,90/mês",
        limits: {
          professionals: 15,
          services: "ilimitado",
          clients: "ilimitado",
          appointments: "ilimitado",
        },
      },
    ],
    statusValues: {
      company: ["active", "inactive"],
      subscription: ["trial", "active", "overdue", "cancelled"],
      appointment: ["pending", "confirmed", "completed", "cancelled"],
      userRoles: ["admin", "super_admin"],
    },
    productionChecklist: [
      "Configurar DATABASE_URL no Render.",
      "Configurar JWT_SECRET no Render.",
      "Configurar VITE_API_URL na Vercel.",
      "Rodar prisma migrate deploy no build do Render.",
      "Testar /health.",
      "Testar login.",
      "Testar cadastro de empresa.",
      "Testar agendamento público.",
      "Testar cancelamento público.",
      "Testar logs.",
      "Testar relatórios.",
    ],
    updatedAt: new Date().toISOString(),
  });
});

module.exports = router;