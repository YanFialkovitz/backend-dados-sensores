const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const http = require('http'); // Importa o módulo http
const { Server } = require('socket.io'); // Importa o Socket.IO
const app = express();
const PORT = 3000;
const SECRET_KEY = 'sua_chave_secreta';
app.use(express.json());
app.use(cors());
// Configura o servidor HTTP
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*', // Habilita CORS para qualquer origem
        methods: ['GET', 'POST'],
    }
});
// Função para inserir dados no banco e disparar evento
async function addSensorData(newData) {
    await insertSensorData(newData); // Insira os dados no banco de dados
    // Dispara um evento para todos os clientes conectados
    io.emit('sensorDataUpdate', newData);
}
// Escuta a conexão de clientes
io.on('connection', (socket) => {
    console.log('Novo cliente conectado:', socket.id);
    socket.on('disconnect', () => {
        console.log('Cliente desconectado:', socket.id);
    });
});
// Manipula conexões Socket.IO
io.on('connection', (socket) => {
    console.log('Novo cliente conectado:', socket.id);
    socket.on('disconnect', () => {
        console.log('Cliente desconectado:', socket.id);
    });
});
// Banco de dados e rotas (o restante do código permanece o mesmo)
const db = new sqlite3.Database('banco-de-dados.db');
// Criação das tabelas (o código permanece o mesmo)
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
// Rota para buscar dados dos sensores em um intervalo de tempo (protegida por JWT)
app.get('/dados-sensores/tempo', authenticateJWT, (req, res) => {
    const { inicio, fim } = req.query; // Espera que os parâmetros sejam passados na URL
    if (!inicio || !fim) {
        return res.status(400).json({ message: 'Os parâmetros de data "inicio" e "fim" são obrigatórios.' });
    }
    const query = `SELECT * FROM dados_sensores WHERE timestamp BETWEEN ? AND ?`;
    db.all(query, [inicio, fim], (err, rows) => {
        if (err) {
            console.error('Erro ao buscar dados no banco de dados:', err.message);
            res.status(500).send('Erro ao buscar os dados.');
        } else {
            res.json(rows);
        }
    });
});
// Rota para inserir dados dos sensores
app.post('/dados-sensores', async (req, res) => {
    const dados = req.body;
    console.log('Dados recebidos dos sensores:', dados);
    try {
        await addSensorData(dados); // Chama a função para inserir dados e emitir evento
        res.send('Dados recebidos e armazenados com sucesso.');
    } catch (err) {
        console.error('Erro ao inserir dados no banco de dados:', err.message);
        res.status(500).send('Erro ao processar os dados.');
    }
});
// Função para inserir dados no banco e disparar evento
async function addSensorData(newData) {
    // Insira no banco de dados
    return new Promise((resolve, reject) => {
        db.run(`INSERT INTO dados_sensores (sensor_id, temperatura, umidade) VALUES (?, ?, ?)`,
            [newData.sensor_id, newData.temperatura, newData.umidade],
            (err) => {
                if (err) {
                    return reject(err); // Se houver erro, rejeita a promessa
                }
                console.log('Dados inseridos no banco de dados com sucesso.');
                io.emit('sensorDataUpdate', newData); // Emitindo os dados atualizados
                resolve(); // Se tudo correr bem, resolve a promessa
            });
    });
}
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
server.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});