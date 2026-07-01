require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { getPredictions, getTodayMatches, getHistoryMatches } = require('./api-football');

const app = express();

// Permite que o seu Frontend (em outra hospedagem) acesse este Backend
app.use(cors());
app.use(express.json());

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

// Rota de Health Check (Evita o erro de arquivo HTML no Render)
app.get('/', (req, res) => {
    res.json({ 
        status: 'online', 
        message: '🚀 API Mundial Predictor IA rodando perfeitamente!' 
    });
});

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor Mundial Predictor IA rodando na porta ${PORT}`);
});