-- CPF (somente dígitos) é a chave primária do usuário
CREATE TABLE usuario(cpf CHAR(11) PRIMARY KEY CHECK(cpf ~ '^[0-9]{11}$'), nome TEXT NOT NULL, email TEXT UNIQUE NOT NULL, senha_hash TEXT NOT NULL, tarifa_kwh NUMERIC(8,4) NOT NULL DEFAULT 0.90,
  totp_secret TEXT, totp_ativo BOOLEAN NOT NULL DEFAULT false);
CREATE TABLE categoria(id SERIAL PRIMARY KEY, nome TEXT UNIQUE NOT NULL);
CREATE TABLE equipamento(id SERIAL PRIMARY KEY, usuario_cpf CHAR(11) NOT NULL REFERENCES usuario ON UPDATE CASCADE ON DELETE CASCADE, categoria_id INT NOT NULL REFERENCES categoria, nome TEXT NOT NULL, potencia_w NUMERIC NOT NULL CHECK(potencia_w>0), horas_uso_estimadas NUMERIC NOT NULL DEFAULT 1 CHECK(horas_uso_estimadas BETWEEN 0 AND 24));
CREATE TABLE registro_consumo(id SERIAL PRIMARY KEY, equipamento_id INT NOT NULL REFERENCES equipamento ON DELETE CASCADE, data DATE NOT NULL, horas_utilizadas NUMERIC NOT NULL, consumo_kwh NUMERIC NOT NULL, custo_estimado NUMERIC NOT NULL, UNIQUE(equipamento_id,data));
CREATE TABLE configuracao_dashboard(id SERIAL PRIMARY KEY, usuario_cpf CHAR(11) UNIQUE NOT NULL REFERENCES usuario ON UPDATE CASCADE ON DELETE CASCADE, layout JSONB NOT NULL);
INSERT INTO categoria(nome) VALUES ('Climatização'),('Iluminação'),('Cozinha'),('Eletrônicos'),('Informática'),('Laboratório'),('Outros');
