require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const { getPredictions, getTodayMatches, getHistoryMatches } = require('./api-football');

const app = express();

app.use(cors());
app.use(express.json());

// Servindo arquivos estáticos (Frontend) a partir da mesma raiz do projeto
app.use(express.static(__dirname)); 

// Conexão com MongoDB
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ Conectado ao MongoDB com sucesso!'))
    .catch(err => console.error('❌ Erro ao conectar no MongoDB:', err));

// Modelo de Usuários (Para registrar os IDs gerados na 1win)
const UserSchema = new mongoose.Schema({
    playerId: { type: String, required: true, unique: true },
    unlockedAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', UserSchema);

// ---- ROTAS DA API ----

app.get('/api/matches/today', async (req, res) => {
    try {
        const matches = await getTodayMatches();
        res.json(matches);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao buscar jogos de hoje' });
    }
});

app.get('/api/matches/history', async (req, res) => {
    try {
        const matches = await getHistoryMatches();
        res.json(matches);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao buscar histórico VIP' });
    }
});

app.get('/api/predictions/:fixtureId', async (req, res) => {
    try {
        const { fixtureId } = req.params;
        const prediction = await getPredictions(fixtureId);
        res.json(prediction);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao buscar previsão da IA' });
    }
});

// Rota de Validação do Paywall (Simula processamento de 3 segundos)
app.post('/api/unlock', async (req, res) => {
    const { playerId } = req.body;
    
    if (!playerId || playerId.trim() === '') {
        return res.status(400).json({ error: 'ID de Jogador é obrigatório.' });
    }
    
    // Simula a validação de sistema de 3 segundos exigida
    setTimeout(async () => {
        try {
            let user = await User.findOne({ playerId });
            if (!user) {
                user = await User.create({ playerId });
            }
            res.json({ success: true, message: 'Conta VIP Desbloqueada para sempre!', user });
        } catch (error) {
            res.status(500).json({ error: 'Erro na validação interna.' });
        }
    }, 3000); 
});

// Rota principal para servir o index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor Mundial Predictor IA rodando na porta ${PORT}`);
});