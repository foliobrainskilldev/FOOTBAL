const axios = require('axios');
const mongoose = require('mongoose');

// Esquema de Cache no MongoDB para economizar requisições da API
const CacheSchema = new mongoose.Schema({
    endpoint: { type: String, required: true, unique: true },
    data: { type: mongoose.Schema.Types.Mixed, required: true },
    lastUpdated: { type: Date, default: Date.now }
});
const Cache = mongoose.model('Cache', CacheSchema);

const API_KEY = process.env.API_FOOTBALL_KEY;
const BASE_URL = 'https://v3.football.api-sports.io';
const CACHE_TTL = 12 * 60 * 60 * 1000; // Cache de 12 horas para economizar créditos

const apiClient = axios.create({
    baseURL: BASE_URL,
    headers: {
        'x-rapidapi-key': API_KEY,
        'x-rapidapi-host': 'v3.football.api-sports.io'
    }
});

// Função genérica de busca com Cache integrado ao MongoDB
async function fetchWithCache(endpoint) {
    const cached = await Cache.findOne({ endpoint });
    const now = new Date();

    // Retorna do banco de dados se o cache ainda for válido
    if (cached && (now - cached.lastUpdated < CACHE_TTL)) {
        console.log(`[CACHE HIT - MONGODB] ${endpoint}`);
        return cached.data;
    }

    console.log(`[API CALL - CONSUMINDO CRÉDITO] ${endpoint}`);
    try {
        const response = await apiClient.get(endpoint);
        const responseData = response.data.response;

        // Atualiza ou cria o cache no MongoDB
        if (cached) {
            cached.data = responseData;
            cached.lastUpdated = now;
            await cached.save();
        } else {
            await Cache.create({ endpoint, data: responseData });
        }

        return responseData;
    } catch (error) {
        console.error(`Erro na API Football para ${endpoint}:`, error.message);
        return cached ? cached.data : []; // Em caso de erro, tenta retornar o cache velho
    }
}

// IDs oficiais para Mundial 2026 (Exemplo, o League ID oficial de Copa do Mundo geralmente é 1)
const WORLD_CUP_LEAGUE_ID = 1;
const SEASON = 2026;

async function getTodayMatches() {
    const date = new Date().toISOString().split('T')[0]; // Data de Hoje (YYYY-MM-DD)
    const endpoint = `/fixtures?league=${WORLD_CUP_LEAGUE_ID}&season=${SEASON}&date=${date}`;
    return await fetchWithCache(endpoint);
}

async function getHistoryMatches() {
    // Últimos 15 jogos finalizados da competição para mostrar na aba Histórico VIP
    const endpoint = `/fixtures?league=${WORLD_CUP_LEAGUE_ID}&season=${SEASON}&status=FT&last=15`;
    return await fetchWithCache(endpoint);
}

async function getPredictions(fixtureId) {
    const endpoint = `/predictions?fixture=${fixtureId}`;
    return await fetchWithCache(endpoint);
}

module.exports = { getTodayMatches, getHistoryMatches, getPredictions };