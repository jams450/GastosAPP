import { investmentProxy } from "../../../_proxy";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  return investmentProxy(request, `products/${encodeURIComponent((await params).id)}/active`);
}
