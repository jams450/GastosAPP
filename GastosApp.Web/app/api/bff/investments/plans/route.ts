import { investmentProxy } from "../_proxy";
export async function POST(request: Request) { return investmentProxy(request, "plans"); }
