export type ActionResult =
  | { status: "success"; message?: string }
  | { status: "error"; message: string; fieldErrors?: Record<string, string> };
