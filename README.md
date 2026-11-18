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
1. Crie uma conta. 2. Cadastre equipamentos. 3. Em Simulação, defina a tarifa e gere os dados. 4. Veja Dashboard, Relatórios e Recomendações.
