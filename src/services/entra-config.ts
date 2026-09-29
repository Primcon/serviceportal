import { z } from "zod";

const requiredText = z.string().trim().min(1);

const entraApplicationSchema = z.object({
  tenantId: requiredText,
  clientId: requiredText,
  clientSecret: requiredText,
  authority: z.string().url(),
  redirectUri: z.string().url(),
});

export type EntraApplication = z.infer<typeof entraApplicationSchema>;
export type EntraAudience = "customer" | "employee";

function environmentValue(name: string) {
  return process.env[name] ?? "";
}

export function parseEntraApplication(input: Record<string, string | undefined>): EntraApplication {
  return entraApplicationSchema.parse(input);
}

export function getEntraApplication(audience: EntraAudience): EntraApplication {
  const prefix = audience === "customer" ? "ENTRA_CUSTOMER" : "ENTRA_EMPLOYEE";
  return parseEntraApplication({
    tenantId: environmentValue(`${prefix}_TENANT_ID`),
    clientId: environmentValue(`${prefix}_CLIENT_ID`),
    clientSecret: environmentValue(`${prefix}_CLIENT_SECRET`),
    authority: environmentValue(`${prefix}_AUTHORITY`),
    redirectUri: environmentValue(`${prefix}_REDIRECT_URI`),
  });
}

export function assertProductionIdentityConfiguration() {
  getEntraApplication("customer");
  getEntraApplication("employee");
}

export function assertProductionConfiguration() {
  if (process.env.NODE_ENV !== "production" || process.env.AUTH_MODE !== "entra") return;
  assertProductionIdentityConfiguration();
  z.object({
    AUTH_SESSION_SECRET: z.string().min(32),
    APP_ORIGIN: z.string().url(),
    AZURE_STORAGE_CONTAINER_NAME: requiredText,
    AZURE_STORAGE_ACCOUNT_NAME: requiredText,
    AZURE_COMMUNICATION_SERVICES_CONNECTION_STRING: requiredText,
    AZURE_COMMUNICATION_SERVICES_SENDER_ADDRESS: z.string().email(),
    NOTIFICATION_WORKER_SECRET: z.string().min(32),
    REPORT_WORKER_SECRET: z.string().min(32),
  }).parse({
    AUTH_SESSION_SECRET: environmentValue("AUTH_SESSION_SECRET"),
    APP_ORIGIN: environmentValue("APP_ORIGIN"),
    AZURE_STORAGE_CONTAINER_NAME: environmentValue("AZURE_STORAGE_CONTAINER_NAME"),
    AZURE_STORAGE_ACCOUNT_NAME: environmentValue("AZURE_STORAGE_ACCOUNT_NAME"),
    AZURE_COMMUNICATION_SERVICES_CONNECTION_STRING: environmentValue("AZURE_COMMUNICATION_SERVICES_CONNECTION_STRING"),
    AZURE_COMMUNICATION_SERVICES_SENDER_ADDRESS: environmentValue("AZURE_COMMUNICATION_SERVICES_SENDER_ADDRESS"),
    NOTIFICATION_WORKER_SECRET: environmentValue("NOTIFICATION_WORKER_SECRET"),
    REPORT_WORKER_SECRET: environmentValue("REPORT_WORKER_SECRET"),
  });
}
