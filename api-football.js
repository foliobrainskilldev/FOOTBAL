const axios = require('axios');
const mongoose = require('mongoose');

const CacheSchema = new mongoose.Schema({
    endpoint: { type: String, required: true, unique: true },
    data: { type: mongoose.Schema.Types.Mixed, required: true },
    lastUpdated: { type: Date, default: Date.now }
});
const Cache = mongoose.model('Cache', CacheSchema);

const API_KEY = process.env.API_FOOTBALL_KEY;
const BASE_URL = 'https://v3.football.api-sports.io';
const CACHE_TTL = 1 * 60 * 60 * 1000; 

const apiClient = axios.create({
    baseURL: BASE_URL,
    headers: { 'x-apisports-key': API_KEY }
});

async function fetchWithCache(endpoint) {
    const cached = await Cache.findOne({ endpoint });
    const now = new Date();
    
    if (cached && (now - cached.lastUpdated < CACHE_TTL)) {
        if (Array.isArray(cached.data) && cached.data.length === 0) {
            console.log(`🧹 CACHE VAZIO: Tentando buscar novamente...`);
        } else {
            return cached.data;
        }
    }
    
    try {
        console.log(`📡 BUSCANDO NA API: ${endpoint}`);
        const res = await apiClient.get(endpoint);
        
        if (res.data.errors && Object.keys(res.data.errors).length > 0) {
            console.error('🚫 Erro na API:', res.data.errors);
            return []; 
        }

        const rData = res.data.response;
        
        if (rData && rData.length > 0) {
            if (cached) {
                cached.data = rData;
                cached.lastUpdated = now;
                await cached.save();
            } else {
                await Cache.create({ endpoint, data: rData });
            }
        }
        
        return rData || [];
    } catch (err) {
        console.error(`🚨 Axios - Falha Rede Direta:`, err.message);
        return [];
    }
}

const WORLD_CUP_LEAGUE_ID = 1;

async function getTodayMatches() {
    // 1. Pega a data de hoje no fuso do Brasil
    const dateHojeBRT = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date()); 
    
    // 🔥 O SEGREDO DO BOT PYTHON: Busca TODOS os jogos da data, sem informar a Temporada/Liga
    const endpoint = `/fixtures?date=${dateHojeBRT}&timezone=America/Sao_Paulo`;
    
    let todosOsJogosDoDia = await fetchWithCache(endpoint);

    if(!todosOsJogosDoDia || todosOsJogosDoDia.length === 0) {
        return [];
    }

    // 🔥 FILTRO LOCAL: Pega apenas os da Copa do Mundo (Exatamente como estava no api.py)
    const jogosCopaHoje = todosOsJogosDoDia.filter(jogo => jogo.league && jogo.league.id === WORLD_CUP_LEAGUE_ID);
    
    return jogosCopaHoje;
}

async function getHistoryMatches() {
    // Para o histórico não dar erro de temporada, buscamos todos os jogos do DIA DE ONTEM
    const ontem = new Date();
    ontem.setDate(ontem.getDate() - 1);
    const dateOntemBRT = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(ontem);

    const endpoint = `/fixtures?date=${dateOntemBRT}&timezone=America/Sao_Paulo`;
    const todosJogosOntem = await fetchWithCache(endpoint);

    if(!todosJogosOntem || todosJogosOntem.length === 0) return [];
    
    // Filtra pela Copa do Mundo
    let historicoCopa = todosJogosOntem.filter(jogo => jogo.league && jogo.league.id === WORLD_CUP_LEAGUE_ID);

    // Garante que só retorna os finalizados (FT, PEN, AET)
    historicoCopa = historicoCopa.filter(m => {
        if (!m.fixture || !m.fixture.status) return false;
        return ['FT', 'PEN', 'AET'].includes(m.fixture.status.short);
    });

    return historicoCopa.slice(0, 15);
}

async function getPredictions(id) {
    // Assim como no `analysis.py`, buscar predictions direto pelo ID da Fixture não bloqueia
    return await fetchWithCache(`/predictions?fixture=${id}`);
}

module.exports = { getTodayMatches, getHistoryMatches, getPredictions };