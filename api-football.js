// --- START OF FILE api-football.js ---

const axios = require('axios');
const mongoose = require('mongoose');

const CacheSchema = new mongoose.Schema({
    endpoint: { type: String, required: true, unique: true },
    data: { type: mongoose.Schema.Types.Mixed, required: true },
    lastUpdated: { type: Date, default: Date.now }
});
const Cache = mongoose.model('Cache', CacheSchema);

const API_KEY = process.env.API_FOOTBALL_KEY;
const SHARP_API_KEY = process.env.SHARP_API_KEY || ''; // Nova API de Odds
const BASE_URL = 'https://v3.football.api-sports.io';

// Cache de 1 hora para API-Sports e 2 horas para SharpAPI (Máxima Economia)
const CACHE_TTL = 1 * 60 * 60 * 1000; 

const apiClient = axios.create({
    baseURL: BASE_URL,
    headers: { 'x-apisports-key': API_KEY }
});

// Busca na API-Sports com Cache
async function fetchWithCache(endpoint) {
    const cached = await Cache.findOne({ endpoint });
    const now = new Date();
    
    if (cached && (now - cached.lastUpdated < CACHE_TTL)) {
        if (Array.isArray(cached.data) && cached.data.length === 0) {
            console.log(`🧹 CACHE VAZIO: Tentando buscar novamente... ${endpoint}`);
        } else {
            return cached.data;
        }
    }
    
    try {
        console.log(`📡 BUSCANDO NA API-SPORTS: ${endpoint}`);
        const res = await apiClient.get(endpoint);
        
        if (res.data.errors && Object.keys(res.data.errors).length > 0) return []; 

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
        return [];
    }
}

// 🔥 NOVA INTEGRAÇÃO: SharpAPI com Cache (Economia Absoluta)
async function getSharpApiOdds(fixtureId) {
    if (!SHARP_API_KEY) return null; // Retorna nulo se a chave não estiver configurada no Render

    const endpointKey = `sharpapi_odds_${fixtureId}`;
    const cached = await Cache.findOne({ endpoint: endpointKey });
    const now = new Date();

    // Cache de 2 horas para Odds
    if (cached && (now - cached.lastUpdated < (2 * 60 * 60 * 1000))) {
        return cached.data;
    }

    try {
        console.log(`📡 BUSCANDO ODDS NA SHARP API (Fixture: ${fixtureId})`);
        // NOTA: Ajuste a URL abaixo para o endpoint exato da sua versão da SharpAPI
        const res = await axios.get(`https://api.sharpapi.com/v1/sports/football/odds/${fixtureId}`, {
            headers: { 'Authorization': `Bearer ${SHARP_API_KEY}` }
        });

        const oddsData = res.data; 

        if (oddsData) {
            if (cached) {
                cached.data = oddsData;
                cached.lastUpdated = now;
                await cached.save();
            } else {
                await Cache.create({ endpoint: endpointKey, data: oddsData });
            }
        }
        return oddsData;
    } catch (error) {
        console.log(`⚠️ Falha ao buscar SharpAPI (Pode estar sem jogos abertos ou limite atingido).`);
        return null;
    }
}

const WORLD_CUP_LEAGUE_ID = 1;

async function getTodayMatches() {
    const dateHojeBRT = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date()); 
    
    let todosOsJogosDoDia = await fetchWithCache(`/fixtures?date=${dateHojeBRT}&timezone=America/Sao_Paulo`);
    if(!todosOsJogosDoDia || todosOsJogosDoDia.length === 0) return [];

    let jogosCopaHoje = todosOsJogosDoDia.filter(jogo => jogo.league && jogo.league.id === WORLD_CUP_LEAGUE_ID);
    jogosCopaHoje = jogosCopaHoje.filter(jogo => {
        const status = jogo.fixture?.status?.short;
        return !['FT', 'AET', 'PEN', 'CANC', 'PST', 'ABD'].includes(status);
    });
    
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

// 🔥 ROTA ATUALIZADA: Agora devolve a Predição + a Odd Real
async function getPredictions(id) {
    const predictions = await fetchWithCache(`/predictions?fixture=${id}`);
    const odds = await getSharpApiOdds(id);
    
    // Anexa as odds reais da SharpAPI ao resultado da API-Sports
    if (predictions && predictions.length > 0) {
        predictions[0].sharp_odds = odds;
    }
    return predictions;
}

module.exports = { getTodayMatches, getHistoryMatches, getPredictions };