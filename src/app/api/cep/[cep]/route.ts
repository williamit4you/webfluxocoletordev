import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  context: { params: Promise<{ cep: string }> }
) {
  const { cep } = await context.params;
  const normalizedCep = cep.replace(/\D+/g, "");

  if (normalizedCep.length !== 8) {
    return NextResponse.json({ message: "CEP invalido." }, { status: 400 });
  }

  try {
    const response = await fetch(`https://viacep.com.br/ws/${normalizedCep}/json/`, {
      cache: "no-store"
    });

    if (!response.ok) {
      return NextResponse.json({ message: "Nao foi possivel consultar o CEP." }, { status: response.status });
    }

    const data = await response.json() as Record<string, unknown>;
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ message: "Falha ao consultar o CEP." }, { status: 502 });
  }
}
