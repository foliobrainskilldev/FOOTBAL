require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { getPredictions, getTodayMatches, getHistoryMatches } = require('./api-football');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ Conectado ao MongoDB com sucesso!'))
    .catch(err => console.error('❌ Erro ao conectar no MongoDB:', err));

const UserSchema = new mongoose.Schema({
    playerId: { type: String, required: true, unique: true },
    unlockedAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', UserSchema);

app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'online', 
        message: '🚀 API Mundial Predictor IA (Football-Data + Odds API) rodando!' 
    });
});

app.get('/api/matches/today', async (req, res) => {
    try {
        const matches = await getTodayMatches();
        res.json(matches);
    } catch (error) {
        console.error("Erro rota today:", error);
        res.status(500).json({ error: 'Erro ao buscar jogos' });
    }
});

app.get('/api/matches/history', async (req, res) => {
    try {
        const matches = await getHistoryMatches();
        res.json(matches);
    } catch (error) {
        console.error("Erro rota history:", error);
        res.status(500).json({ error: 'Erro ao buscar histórico' });
    }
});

app.get('/api/predictions/:fixtureId', async (req, res) => {
    try {
        const prediction = await getPredictions(req.params.fixtureId);
        res.json(prediction);
    } catch (error) {
        console.error("Erro rota predictions:", error);
        res.status(500).json({ error: 'Erro ao buscar previsão' });
    }
});

app.post('/api/unlock', async (req, res) => {
    const { playerId } = req.body;
    if (!playerId || playerId.trim() === '') return res.status(400).json({ error: 'ID obrigatório.' });
    
    setTimeout(async () => {
        try {
            let user = await User.findOne({ playerId });
            if (!user) user = await User.create({ playerId });
            res.json({ success: true, message: 'VIP Desbloqueada!', user });
        } catch (error) {
            res.status(500).json({ error: 'Erro interno.' });
        }
    }, 3000); 
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
});