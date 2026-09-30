import { investmentProxy } from "../../_proxy";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) { return investmentProxy(request, `products/${(await params).id}`); }
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) { return investmentProxy(request, `products/${(await params).id}`); }
