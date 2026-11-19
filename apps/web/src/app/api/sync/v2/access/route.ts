// GET /api/sync/v2/access — the same handler as v1, which carries the v2 fields (roles, aiAllowance).
export const runtime = "nodejs";
export { GET } from "../../access/route";
