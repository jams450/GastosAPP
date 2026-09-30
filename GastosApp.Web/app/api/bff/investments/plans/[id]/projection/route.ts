import { investmentProxy } from "../../../_proxy";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) { return investmentProxy(request, `plans/${(await params).id}/projection`); }
