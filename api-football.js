// --- START OF FILE api-football.js ---

const axios = require('axios');
const mongoose = require('mongoose');

const CacheSchema = new mongoose.Schema({
    endpoint: { type: String, required: true, unique: true },
    data: { type: mongoose.Schema.Types.Mixed, required: true },
    lastUpdated: { type: Date, default: Date.now }
});
const Cache = mongoose.models.Cache || mongoose.model('Cache', CacheSchema);

const API_KEY = process.env.API_FOOTBALL_KEY;
const BASE_URL = 'https://v3.football.api-sports.io';

const CACHE_TTL = 1 * 60 * 60 * 1000; // 1 Hora

const apiClient = axios.create({
    baseURL: BASE_URL,
    headers: { 'x-apisports-key': API_KEY }
});

async function fetchWithCache(endpoint, customTTL = CACHE_TTL) {
    let cached = null;
    try { cached = await Cache.findOne({ endpoint }); } catch (e) {}
    const now = new Date();
    
    if (cached && (now - cached.lastUpdated < customTTL)) {
        if (!(Array.isArray(cached.data) && cached.data.length === 0)) {
            console.log(`⚡ RETORNANDO DO CACHE: ${endpoint}`);
            return cached.data;
        }
    }
    
    try {
        console.log(`📡 BUSCANDO NA API-SPORTS: ${endpoint}`);
        const res = await apiClient.get(endpoint);
        
        if (res.data.errors && Object.keys(res.data.errors).length > 0) {
            console.error(`🚨 ERRO NA API [${endpoint}]:`, res.data.errors);
            if (cached && cached.data && cached.data.length > 0) return cached.data;
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
        if (cached && cached.data && cached.data.length > 0) return cached.data;
        return [];
    }
}

// 🔥 BUSCA ODDS REAIS DIRETAMENTE DA API-SPORTS (Casas como Bet365, 1xBet, etc)
async function getRealOdds(fixtureId) {
    console.log(`📡 BUSCANDO ODDS REAIS (Fixture: ${fixtureId})`);
    // Usamos TTL de 2 horas para Odds para economizar requisições do plano Free
    const oddsData = await fetchWithCache(`/odds?fixture=${fixtureId}`, 2 * 60 * 60 * 1000);
    
    if (!oddsData || oddsData.length === 0) return null;

    // Pega a primeira casa de aposta disponível (Geralmente Bet365 ou 1xBet)
    const bookmakers = oddsData[0].bookmakers;
    if (!bookmakers || bookmakers.length === 0) return null;

    // Retorna todos os mercados (Match Winner, Over/Under, BTTS, etc) da casa de aposta
    return bookmakers[0].bets;
}

const WORLD_CUP_LEAGUE_ID = 1;

async function getTodayMatches() {
    const dateHojeBRT = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date()); 
    
    let todosOsJogos = await fetchWithCache(`/fixtures?date=${dateHojeBRT}&timezone=America/Sao_Paulo`);
    if(!todosOsJogos || todosOsJogos.length === 0) return [];

    let jogosCopaHoje = todosOsJogos.filter(jogo => jogo.league && jogo.league.id === WORLD_CUP_LEAGUE_ID);
    jogosCopaHoje = jogosCopaHoje.filter(jogo => !['FT', 'AET', 'PEN', 'CANC', 'PST', 'ABD'].includes(jogo.fixture?.status?.short));
    
    return jogosCopaHoje;
}

async function getHistoryMatches() {
    const dateHojeBRT = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date()); 

    const ontem = new Date();
    ontem.setDate(ontem.getDate() - 1);
    const dateOntemBRT = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(ontem);

    const [jogosHoje, jogosOntem] = await Promise.all([
        fetchWithCache(`/fixtures?date=${dateHojeBRT}&timezone=America/Sao_Paulo`),
        fetchWithCache(`/fixtures?date=${dateOntemBRT}&timezone=America/Sao_Paulo`)
    ]);

    let todosJogos = [...(jogosHoje || []), ...(jogosOntem || [])];
    let historicoCopa = todosJogos.filter(jogo => jogo.league && jogo.league.id === WORLD_CUP_LEAGUE_ID);
    historicoCopa = historicoCopa.filter(m => ['FT', 'PEN', 'AET'].includes(m.fixture?.status?.short));
    historicoCopa.sort((a,b) => b.fixture.timestamp - a.fixture.timestamp);
    
    return historicoCopa.slice(0, 15);
}

async function getPredictions(id) {
    const predictions = await fetchWithCache(`/predictions?fixture=${id}`, 12 * 60 * 60 * 1000);
    const realOdds = await getRealOdds(id);
    
    if (predictions && predictions.length > 0) {
        // Agora anexamos as ODDS REAIS aos dados que vão pro frontend
        predictions[0].real_odds = realOdds; 
    }
    return predictions;
}

module.exports = { getTodayMatches, getHistoryMatches, getPredictions };