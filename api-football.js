const axios = require('axios');
const mongoose = require('mongoose');

// Cache no Banco de Dados
const CacheSchema = new mongoose.Schema({
    endpoint: { type: String, required: true, unique: true },
    data: { type: mongoose.Schema.Types.Mixed, required: true },
    lastUpdated: { type: Date, default: Date.now }
});
const Cache = mongoose.model('Cache', CacheSchema);

const API_KEY = process.env.API_FOOTBALL_KEY;
// URL correta e direta do print que você mandou!
const BASE_URL = 'https://v3.football.api-sports.io';
const CACHE_TTL = 1 * 60 * 60 * 1000;

const apiClient = axios.create({
    baseURL: BASE_URL,
    headers: {
        'x-apisports-key': API_KEY // ← APENAS ESTA CHAVE E PONTO.
    }
});

async function fetchWithCache(endpoint) {
    const cached = await Cache.findOne({ endpoint });
    const now = new Date();
    if (cached && (now - cached.lastUpdated < CACHE_TTL)) {
        console.log(`[CACHE HIT] Mongo para: ${endpoint}`);
        return cached.data;
    }
    console.log(`[API-FOOTBALL - CREDITOS USADOS] Req para: ${endpoint}`);
    try {
        const res = await apiClient.get(endpoint);
        if (res.data.errors && Object.keys(res.data.errors).length > 0) return cached ? cached.data : [];
        const rData = res.data.response;
        if (cached) {
            cached.data = rData;
            cached.lastUpdated = now;
            await cached.save();
        } else { await Cache.create({ endpoint, data: rData }); }
        return rData;
    } catch (err) {
        console.error(`Erro:`, err.message);
        return cached ? cached.data : [];
    }
}

const LEAGUE = 1; // Copa 
const SEASON = 2026;

async function getTodayMatches() {
    const end = `/fixtures?league=${LEAGUE}&season=${SEASON}&timezone=America/Sao_Paulo`;
    const all = await fetchWithCache(end);
    if(!all || !all.length) return [];
    
    // Procura por jogos de hoje BRT
    const tdBR = new Intl.DateTimeFormat('en-CA', { 
        timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' 
    }).format(new Date());

    return all.filter(m => m.fixture?.date && m.fixture.date.startsWith(tdBR));
}

async function getHistoryMatches() {
    const end = `/fixtures?league=${LEAGUE}&season=${SEASON}&timezone=America/Sao_Paulo`;
    const all = await fetchWithCache(end);
    if(!all || !all.length) return [];
    
    // Status FT = Full time, PEN = Penaltis, AET = Prorrogação. Mostra os últimos.
    const fts = all.filter(m => ['FT','PEN','AET'].includes(m.fixture?.status?.short));
    return fts.reverse().slice(0, 15);
}

async function getPredictions(id) {
    return await fetchWithCache(`/predictions?fixture=${id}`);
}
module.exports = { getTodayMatches, getHistoryMatches, getPredictions };