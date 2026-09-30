import { investmentProxy } from "../../_proxy";
export async function GET(request: Request) { const month = new URL(request.url).searchParams.get("planMonth"); return investmentProxy(request, `plans/current${month ? `?planMonth=${encodeURIComponent(month)}` : ""}`); }
