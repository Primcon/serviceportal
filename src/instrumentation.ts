export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Refuse to serve traffic when production configuration is incomplete. This runs at
  // server startup rather than in next.config, so builds don't need runtime secrets.
  const { assertProductionConfiguration } = await import("@/services/entra-config");
  assertProductionConfiguration();
}
