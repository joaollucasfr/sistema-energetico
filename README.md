# Sistema Inteligente para Monitoramento do Consumo de Energia
React + Recharts | Node.js + Express | PostgreSQL

## Opção 1 – Docker (qualquer máquina)
    docker compose up
Abra http://localhost:5173 (API em :3001). Para reiniciar o banco do zero: `docker compose down -v`.

## Opção 2 – Sem Docker (Node 18+ e PostgreSQL)
    createdb energia   # usuário/senha energia/energia, ou ajuste DATABASE_URL
    psql energia -f backend/schema.sql
    cd backend && npm install && npm start
    cd frontend && npm install && npm run dev
Variáveis: DATABASE_URL, JWT_SECRET (backend); VITE_API (frontend, padrão http://<host>:3001).

## Uso
1. Crie uma conta (nome, CPF, e-mail e senha). 2. Cadastre equipamentos. 3. Em Simulação, defina a tarifa e gere os dados. 4. Veja Dashboard, Relatórios e Recomendações.

- **Login** aceita e-mail ou CPF. O CPF é a chave primária da tabela `usuario`.
- **Esqueci minha senha**: o usuário informa o CPF e cria uma nova senha. Se a conta tiver o Google Authenticator (2FA) ativo, também é exigido o código de 6 dígitos do app (máx. 5 tentativas a cada 15 min). Sem 2FA, basta o CPF (segurança mínima).
- **2FA**: na aba Conta, clique em "Ativar 2FA", escaneie o QR code com o Google Authenticator (ou Microsoft Authenticator, Authy…) e confirme com o código. Depois disso o login e a recuperação de senha pedem o código do app.
- **PDF**: na aba Relatórios, o botão "Exportar PDF" baixa a comparação entre os períodos A e B.
