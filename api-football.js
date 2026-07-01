const axios = require('axios');
const mongoose = require('mongoose');

// Esquema de Cache no MongoDB
const CacheSchema = new mongoose.Schema({
    endpoint: { type: String, required: true, unique: true },
    data: { type: mongoose.Schema.Types.Mixed, required: true },
    lastUpdated: { type: Date, default: Date.now }
});
const Cache = mongoose.model('Cache', CacheSchema);

const API_KEY = process.env.API_FOOTBALL_KEY;
const BASE_URL = 'https://v3.football.api-sports.io';
const CACHE_TTL = 12 * 60 * 60 * 1000; // Cache de 12 horas

const apiClient = axios.create({
    baseURL: BASE_URL,
    headers: {
        'x-rapidapi-key': API_KEY,
        'x-rapidapi-host': 'v3.football.api-sports.io'
    }
});

async function fetchWithCache(endpoint) {
    const cached = await Cache.findOne({ endpoint });
    const now = new Date();

    if (cached && (now - cached.lastUpdated < CACHE_TTL)) {
        console.log(`[CACHE HIT] ${endpoint}`);
        return cached.data;
    }

    console.log(`[API CALL - CONSUMINDO CRÉDITO] ${endpoint}`);
    try {
        const response = await apiClient.get(endpoint);
        const responseData = response.data.response;

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
        return cached ? cached.data : [];
    }
}

const WORLD_CUP_LEAGUE_ID = 1; // ID oficial da Copa do Mundo na API-Football
const SEASON = 2026;

async function getTodayMatches() {
    // 1. Força a data atual para o fuso horário do Brasil (BRT) no formato YYYY-MM-DD
    const dateBRT = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

    // 2. Envia o parâmetro "timezone" para a API também retornar os horários baseados no Brasil
    const endpoint = `/fixtures?league=${WORLD_CUP_LEAGUE_ID}&season=${SEASON}&date=${dateBRT}&timezone=America/Sao_Paulo`;
    
    return await fetchWithCache(endpoint);
}

async function getHistoryMatches() {
    // Adiciona o timezone no histórico também para manter o padrão
    const endpoint = `/fixtures?league=${WORLD_CUP_LEAGUE_ID}&season=${SEASON}&status=FT&last=15&timezone=America/Sao_Paulo`;
    return await fetchWithCache(endpoint);
}

async function getPredictions(fixtureId) {
    const endpoint = `/predictions?fixture=${fixtureId}`;
    return await fetchWithCache(endpoint);
}

module.exports = { getTodayMatches, getHistoryMatches, getPredictions };