import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { jwtVerify, SignJWT, createRemoteJWKSet } from "jose";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getEntraApplication, type EntraAudience } from "@/services/entra-config";
import { displayNameForPerson, firstUsableNamePart, normalizeNamePart } from "@/services/person-name";

const stateCookiePrefix = "vactech_auth_state_";
const sessionCookie = "vactech_session";
const stateLifetimeSeconds = 600;
const sessionLifetimeSeconds = 8 * 60 * 60;

type AuthState = { audience: EntraAudience; state: string; verifier: string };
export type AuthenticatedActor = { identitySubject: string; email: string; displayName: string; role: UserRole; audience: EntraAudience };
type OpenIdConfiguration = { issuer: string; jwks_uri: string; token_endpoint: string; userinfo_endpoint?: string; end_session_endpoint?: string };
type UserInfo = { sub?: unknown; given_name?: unknown; family_name?: unknown };
type MicrosoftGraphProfile = { givenName?: unknown; surname?: unknown; displayName?: unknown };
const customerScopes = "openid profile email https://graph.microsoft.com/User.ReadWrite";
const employeeScopes = "openid profile email";

export class CustomerAccessNotApprovedError extends Error {
  constructor() {
    super("Customer access has not been approved.");
    this.name = "CustomerAccessNotApprovedError";
  }
}

function sessionSecret() {
  const value = process.env.AUTH_SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("AUTH_SESSION_SECRET must be at least 32 characters.");
  return new TextEncoder().encode(value);
}

function encode(value: string) {
  return Buffer.from(value).toString("base64url");
}

function createVerifier() {
  return encode(randomBytes(32).toString("hex"));
}

function createChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

async function getOpenIdConfiguration(authority: string): Promise<OpenIdConfiguration> {
  const response = await fetch(`${authority}/v2.0/.well-known/openid-configuration`);
  if (!response.ok) throw new Error("Entra OpenID configuration could not be loaded.");
  const configuration = await response.json() as Partial<OpenIdConfiguration>;
  if (!configuration.issuer || !configuration.jwks_uri || !configuration.token_endpoint) {
    throw new Error("Entra OpenID configuration is incomplete.");
  }
  return configuration as OpenIdConfiguration;
}

async function getCustomerUserInfo(userInfoEndpoint: string | undefined, accessToken: string | undefined, subject: string): Promise<UserInfo | null> {
  if (!userInfoEndpoint || !accessToken) return null;
  try {
    const response = await fetch(userInfoEndpoint, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
    if (!response.ok) return null;
    const profile = await response.json() as UserInfo;
    return profile.sub === subject ? profile : null;
  } catch {
    return null;
  }
}

async function getCustomerGraphProfile(accessToken: string | undefined): Promise<MicrosoftGraphProfile | null> {
  if (!accessToken) return null;
  try {
    const currentResponse = await fetch("https://graph.microsoft.com/v1.0/me?$select=givenName,surname,displayName", {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!currentResponse.ok) {
      console.warn("Customer directory profile lookup failed.", { status: currentResponse.status });
      return null;
    }
    return await currentResponse.json() as MicrosoftGraphProfile;
  } catch {
    console.warn("Customer directory profile lookup failed.");
    return null;
  }
}

async function synchronizeCustomerDirectoryProfile(accessToken: string | undefined, currentProfile: MicrosoftGraphProfile | null, firstName: string | null, lastName: string | null, email: string) {
  if (!accessToken || !firstName || !lastName) return;
  const displayName = displayNameForPerson(firstName, lastName, email);
  if (currentProfile?.givenName === firstName && currentProfile.surname === lastName && currentProfile.displayName === displayName) return;
  try {
    const updateResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ givenName: firstName, surname: lastName, displayName }),
    });
    if (!updateResponse.ok) console.warn("Customer directory profile update failed.", { status: updateResponse.status });
  } catch {
    console.warn("Customer directory profile synchronization failed.");
  }
}

export async function upsertEntraUser(input: {
  identitySubject: string;
  email: string;
  displayName?: string;
  firstName?: string | null;
  lastName?: string | null;
  internalRole?: UserRole;
}) {
  const hasCanonicalName = input.firstName !== undefined || input.lastName !== undefined;
  const firstName = normalizeNamePart(input.firstName);
  const lastName = normalizeNamePart(input.lastName);
  const displayName = hasCanonicalName
    ? displayNameForPerson(firstName, lastName, input.email)
    : normalizeNamePart(input.displayName) ?? input.email;
  const nameUpdate = hasCanonicalName ? { firstName, lastName } : {};
  const identityMatch = await prisma.user.findUnique({ where: { identitySubject: input.identitySubject } });
  if (identityMatch) {
    return prisma.user.update({ where: { id: identityMatch.id }, data: { email: input.email, displayName, ...nameUpdate, ...(input.internalRole && !identityMatch.internalRole ? { internalRole: input.internalRole } : {}) } });
  }

  const emailMatch = await prisma.user.findUnique({ where: { email: input.email } });
  if (emailMatch) {
    return prisma.user.update({ where: { id: emailMatch.id }, data: { identitySubject: input.identitySubject, displayName, ...nameUpdate, ...(input.internalRole && !emailMatch.internalRole ? { internalRole: input.internalRole } : {}) } });
  }

  return prisma.user.create({ data: { identitySubject: input.identitySubject, email: input.email, displayName, ...nameUpdate, ...(hasCanonicalName ? {} : { firstName: null, lastName: null }), ...(input.internalRole ? { internalRole: input.internalRole } : {}) } });
}

export async function assertCustomerAccess(userId: string) {
  const access = await prisma.userAccess.findFirst({
    where: { userId, role: UserRole.CUSTOMER_USER },
    select: { id: true },
  });
  if (!access) throw new CustomerAccessNotApprovedError();
}

function parseAuthState(encodedState: string): AuthState | null {
  try {
    const parsed = JSON.parse(Buffer.from(encodedState, "base64url").toString()) as Partial<AuthState>;
    if (typeof parsed.audience !== "string" || typeof parsed.state !== "string" || typeof parsed.verifier !== "string") return null;
    return parsed as AuthState;
  } catch {
    return null;
  }
}

export async function createEntraAuthorization(audience: EntraAudience, prompt?: "select_account") {
  const application = getEntraApplication(audience);
  const state = encode(randomBytes(24).toString("hex"));
  const verifier = createVerifier();
  const authState: AuthState = { audience, state, verifier };
  (await cookies()).set(`${stateCookiePrefix}${audience}`, encode(JSON.stringify(authState)), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: stateLifetimeSeconds, path: "/" });
  const authorize = new URL(`${application.authority}/oauth2/v2.0/authorize`);
  authorize.searchParams.set("client_id", application.clientId);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("redirect_uri", application.redirectUri);
  authorize.searchParams.set("response_mode", "query");
  authorize.searchParams.set("scope", audience === "customer" ? customerScopes : employeeScopes);
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("code_challenge", createChallenge(verifier));
  authorize.searchParams.set("code_challenge_method", "S256");
  if (prompt) authorize.searchParams.set("prompt", prompt);
  return authorize.toString();
}

export async function exchangeEntraCode(audience: EntraAudience, code: string, state: string) {
  const application = getEntraApplication(audience);
  const cookieStore = await cookies();
  const encodedState = cookieStore.get(`${stateCookiePrefix}${audience}`)?.value;
  if (!encodedState) throw new Error("Authentication state expired.");
  cookieStore.delete(`${stateCookiePrefix}${audience}`);
  const authState = parseAuthState(encodedState);
  if (!authState || authState.audience !== audience || authState.state !== state) throw new Error("Invalid authentication state.");

  const openIdConfiguration = await getOpenIdConfiguration(application.authority);
  const tokenResponse = await fetch(openIdConfiguration.token_endpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: application.clientId, client_secret: application.clientSecret, grant_type: "authorization_code", code, redirect_uri: application.redirectUri, code_verifier: authState.verifier, scope: audience === "customer" ? customerScopes : employeeScopes }) });
  if (!tokenResponse.ok) throw new Error("Entra token exchange failed.");
  const token = (await tokenResponse.json()) as { id_token?: string; access_token?: string };
  if (!token.id_token) throw new Error("Entra response did not include an ID token.");

  const jwks = createRemoteJWKSet(new URL(openIdConfiguration.jwks_uri));
  const { payload } = await jwtVerify(token.id_token, jwks, { issuer: openIdConfiguration.issuer, audience: application.clientId });
  const externalSubject = typeof payload.sub === "string" ? payload.sub : "";
  const email = typeof payload.email === "string" ? payload.email : typeof payload.preferred_username === "string" ? payload.preferred_username : "";
  if (!externalSubject || !email) throw new Error("Entra token did not include required identity claims.");

  const claimedRole = audience === "customer" ? UserRole.CUSTOMER_USER : startingEmployeeRole(payload.roles);
  const customerUserInfo = audience === "customer"
    ? await getCustomerUserInfo(openIdConfiguration.userinfo_endpoint, token.access_token, externalSubject)
    : null;
  const customerGraphProfile = audience === "customer" ? await getCustomerGraphProfile(token.access_token) : null;
  const firstName = audience === "customer"
    ? firstUsableNamePart(payload.given_name, customerUserInfo?.given_name, customerGraphProfile?.givenName)
    : null;
  const lastName = audience === "customer"
    ? firstUsableNamePart(payload.family_name, customerUserInfo?.family_name, customerGraphProfile?.surname)
    : null;
  if (audience === "customer") await synchronizeCustomerDirectoryProfile(token.access_token, customerGraphProfile, firstName, lastName, email);
  const user = await upsertEntraUser({
    identitySubject: externalSubject,
    email,
    ...(audience === "customer"
      ? {
          firstName,
          lastName,
        }
      : { displayName: typeof payload.name === "string" ? payload.name : email, internalRole: claimedRole ?? undefined }),
  });
  if (!user.isActive) throw new Error("Your account is inactive.");
  if (audience === "customer") await assertCustomerAccess(user.id);
  // Employee roles are managed in the portal. The Entra app role only seeds the first one.
  const role = audience === "employee" ? user.internalRole : claimedRole;
  if (!role) throw new Error("Employee account has no portal role. Assign an app role in Entra for the first sign-in.");
  const session = await new SignJWT({ sub: user.identitySubject, email, displayName: user.displayName, role, audience }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(`${sessionLifetimeSeconds}s`).sign(sessionSecret());
  cookieStore.set(sessionCookie, session, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: sessionLifetimeSeconds, path: "/" });
  return { user, role };
}

/**
 * The portal role a new employee starts with, taken from their Entra app roles. After the
 * first sign-in the portal's own role wins, so later Entra role changes don't apply; who
 * may sign in at all is controlled by the enterprise app's "Assignment required" setting.
 */
export function startingEmployeeRole(value: unknown): UserRole | null {
  const roles = Array.isArray(value) ? value.filter((role): role is string => typeof role === "string") : [];
  if (roles.includes("Portal.Administrator")) return UserRole.PORTAL_ADMINISTRATOR;
  if (roles.includes("VacTech.Manager")) return UserRole.VACTECH_MANAGER;
  if (roles.includes("VacTech.ServiceUser")) return UserRole.VACTECH_SERVICE_USER;
  return null;
}

export async function getSessionActor() {
  try {
    const token = (await cookies()).get(sessionCookie)?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, sessionSecret(), { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || typeof payload.email !== "string" || typeof payload.displayName !== "string" || typeof payload.role !== "string") return null;
    if (payload.audience !== "customer" && payload.audience !== "employee") return null;
    return { identitySubject: payload.sub, email: payload.email, displayName: payload.displayName, role: payload.role as UserRole, audience: payload.audience } satisfies AuthenticatedActor;
  } catch {
    return null;
  }
}

/**
 * Clears the portal session and any pending sign-in state. For customer sessions it also
 * returns the Entra External ID sign-out URL, so the next sign-in asks for credentials
 * again. Employee sign-out stays local on purpose: ending the Microsoft Entra session
 * would also sign the employee out of Outlook, Teams and every other Microsoft app.
 */
export async function endSession(postLogoutRedirectUri: string): Promise<string | null> {
  const actor = await getSessionActor();
  const cookieStore = await cookies();
  cookieStore.delete(sessionCookie);
  cookieStore.delete(`${stateCookiePrefix}customer`);
  cookieStore.delete(`${stateCookiePrefix}employee`);
  if (actor?.audience !== "customer") return null;
  try {
    const application = getEntraApplication("customer");
    const { end_session_endpoint: endSessionEndpoint } = await getOpenIdConfiguration(application.authority);
    if (!endSessionEndpoint) return null;
    const signOut = new URL(endSessionEndpoint);
    signOut.searchParams.set("client_id", application.clientId);
    signOut.searchParams.set("post_logout_redirect_uri", postLogoutRedirectUri);
    return signOut.toString();
  } catch (error) {
    console.warn("Customer Entra sign-out URL could not be built; signing out locally only.", error instanceof Error ? error.message : error);
    return null;
  }
}
