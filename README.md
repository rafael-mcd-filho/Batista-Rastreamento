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
FATURAS_WEBHOOK_VENCEM_HOJE_URL=https://seu-webhook-vencem-hoje
FATURAS_WEBHOOK_VENCIDAS_5_DIAS_URL=https://seu-webhook-vencidas-5-dias
FATURAS_WEBHOOK_SEND_EMPTY=false
FATURAS_CRON_TIMEZONE=America/Fortaleza
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
FATURAS_WEBHOOK_VENCEM_HOJE_URL
FATURAS_WEBHOOK_VENCIDAS_5_DIAS_URL
FATURAS_WEBHOOK_SEND_EMPTY
FATURAS_CRON_TIMEZONE
```

Os tokens ficam apenas no servidor, usados pelas rotas de API.

## Cron diario de faturas

O arquivo `vercel.json` agenda a rota abaixo para rodar todos os dias as 10:00 UTC,
que corresponde a 7:00 em America/Fortaleza:

```txt
/api/cron/faturas-diarias
```

A rotina consulta e envia por POST para dois webhooks separados:

- `FATURAS_WEBHOOK_VENCEM_HOJE_URL`: faturas que vencem hoje;
- `FATURAS_WEBHOOK_VENCIDAS_5_DIAS_URL`: faturas vencidas exatamente ha 5 dias.

A Vercel Cron chama a rota agendada via GET. Dentro dessa rota, o envio para os
dois webhooks acima e feito via POST com JSON. A rota tambem aceita POST para
acionamento manual ou por outro agendador externo.

Faturas com 6 dias ou mais de atraso nao entram no envio. Se nao houver nenhuma
fatura para um dos grupos, o webhook daquele grupo nao e chamado por padrao.
Para enviar payload vazio mesmo assim, configure `FATURAS_WEBHOOK_SEND_EMPTY=true`.

Nao ha chave secreta na rota do cron. A URL `/api/cron/faturas-diarias` fica
acessivel publicamente e a Vercel chama essa rota automaticamente no horario
configurado.

## Consulta por contato Helena

A URL abaixo abre uma consulta sem mostrar os campos do painel:

```txt
/?userid=id_do_contato_helena
```

O app busca o contato na Helena, lê `customFields.cpf` e consulta as faturas na API Rastrosystem.
