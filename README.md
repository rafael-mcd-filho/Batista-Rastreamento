# Batista Rastreamento

Painel financeiro para consultar faturas por CPF ou CNPJ usando a API Rastrosystem.

## Configuracao local

1. Instale as dependencias:

```bash
npm install
```

2. Crie `.env.local` com as variaveis abaixo:

```bash
RASTRO_API_TOKEN=seu_token_aqui
RASTRO_API_BASE_URL=https://batista.rastrosystem.com.br/api_v2
```

3. Rode o projeto:

```bash
npm run dev
```

## Vercel

Configure as mesmas variaveis em `Project Settings > Environment Variables`:

```bash
RASTRO_API_TOKEN
RASTRO_API_BASE_URL
```

O token fica apenas no servidor, usado pela rota `POST /api/faturas`.
