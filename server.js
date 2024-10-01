const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
const PORT = 3000;
const SECRET_KEY = 'sua_chave_secreta'; // Substitua por uma chave secreta mais segura em produção

app.use(express.json());
app.use(cors()); // Habilita o CORS para todas as origens

const db = new sqlite3.Database('banco-de-dados.db');

// Lógica para criar as tabelas se elas não existirem
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS dados_sensores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sensor_id INTEGER,
        temperatura REAL,
        umidade REAL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

// Rota para cadastrar um novo usuário
app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    try {
        // Verificar se o usuário já existe
        db.get('SELECT * FROM usuarios WHERE username = ?', [username], async (err, row) => {
            if (row) {
                return res.status(400).json({ message: 'Usuário já existe' });
            }

            // Criptografar a senha
            const hashedPassword = await bcrypt.hash(password, 10);

            // Inserir o novo usuário na tabela
            db.run('INSERT INTO usuarios (username, password) VALUES (?, ?)', [username, hashedPassword], (err) => {
                if (err) {
                    console.error('Erro ao cadastrar usuário:', err.message);
                    return res.status(500).json({ message: 'Erro ao cadastrar usuário' });
                }
                res.status(201).json({ message: 'Usuário cadastrado com sucesso' });
            });
        });
    } catch (err) {
        console.error('Erro ao processar o cadastro:', err.message);
        res.status(500).json({ message: 'Erro ao processar o cadastro' });
    }
});

// Rota para login
app.post('/login', (req, res) => {
    const { username, password } = req.body;

    // Verificar se o usuário existe
    db.get('SELECT * FROM usuarios WHERE username = ?', [username], async (err, row) => {
        if (!row) {
            return res.status(400).json({ message: 'Usuário ou senha incorretos' });
        }

        // Verificar a senha
        const isPasswordValid = await bcrypt.compare(password, row.password);
        if (!isPasswordValid) {
            return res.status(400).json({ message: 'Usuário ou senha incorretos' });
        }

        // Gerar o token JWT
        const token = jwt.sign({ userId: row.id }, SECRET_KEY, { expiresIn: '1h' });
        res.json({ message: 'Login realizado com sucesso', token });
    });
});

// Middleware para verificar o token JWT
const authenticateJWT = (req, res, next) => {
    const token = req.headers.authorization && req.headers.authorization.split(' ')[1];

    if (token) {
        jwt.verify(token, SECRET_KEY, (err, user) => {
            if (err) {
                return res.status(403).json({ message: 'Acesso negado' });
            }
            req.user = user;
            next();
        });
    } else {
        res.status(401).json({ message: 'Token não fornecido' });
    }
};

// Rota para buscar todos os dados dos sensores (protegida por JWT)
app.get('/dados-sensores', authenticateJWT, (req, res) => {
    if (isServicePaused) {
        return res.status(200).json({ message: 'O serviço está pausado. Nenhum dado será enviado.' });
    }

    const query = `SELECT * FROM dados_sensores`;

    db.all(query, [], (err, rows) => {
        if (err) {
            console.error('Erro ao buscar dados no banco de dados:', err.message);
            res.status(500).send('Erro ao buscar os dados.');
        } else {
            res.json(rows);
        }
    });
});

app.post('/dados-sensores', (req, res) => {
    const dados = req.body;
    console.log('Dados recebidos dos sensores:', dados);

    db.run(`INSERT INTO dados_sensores (sensor_id, temperatura, umidade) VALUES (?, ?, ?)`,
        [dados.sensor_id, dados.temperatura, dados.umidade],
        (err) => {
            if (err) {
                console.error('Erro ao inserir dados no banco de dados:', err.message);
                res.status(500).send('Erro ao processar os dados.');
            } else {
                console.log('Dados inseridos no banco de dados com sucesso.');
                res.send('Dados recebidos e armazenados com sucesso.');
            }
        });
});

// Rota para limpar todos os dados da tabela (protegida por JWT)
app.delete('/limpar-dados', authenticateJWT, (req, res) => {
    const query = `DELETE FROM dados_sensores`;

    db.run(query, [], (err) => {
        if (err) {
            console.error('Erro ao limpar dados do banco de dados:', err.message);
            res.status(500).send('Erro ao limpar os dados.');
        } else {
            console.log('Dados da tabela limpos com sucesso.');
            res.send('Dados da tabela foram limpos com sucesso.');
        }
    });
});

let isServicePaused = false; // Flag para controlar o estado do serviço

// Rota para pausar/reiniciar o serviço
app.post('/pausar-servico', authenticateJWT, (req, res) => {
    const { status } = req.body;

    if (status === 'pausar') {
        isServicePaused = true;
        console.log('Serviço pausado.');
        res.json({ message: 'Serviço pausado com sucesso.' });
    } else if (status === 'reiniciar') {
        isServicePaused = false;
        console.log('Serviço reiniciado.');
        res.json({ message: 'Serviço reiniciado com sucesso.' });
    } else {
        res.status(400).json({ message: 'Status inválido.' });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});