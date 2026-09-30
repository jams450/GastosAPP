import { investmentProxy } from "../_proxy";
export async function GET(request: Request) { return investmentProxy(request, "products"); }
export async function POST(request: Request) { return investmentProxy(request, "products"); }
