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
HELENA_API_TOKEN=seu_token_helena_aqui
HELENA_API_BASE_URL=https://api.helena.run/core/v1
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
HELENA_API_TOKEN
HELENA_API_BASE_URL
```

Os tokens ficam apenas no servidor, usados pelas rotas de API.

## Consulta por contato Helena

A URL abaixo abre uma consulta sem mostrar os campos do painel:

```txt
/?userid=id_do_contato_helena
```

O app busca o contato na Helena, lê `customFields.cpf` e consulta as faturas na API Rastrosystem.
