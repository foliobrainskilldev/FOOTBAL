const axios = require('axios');
const mongoose = require('mongoose');

// Esquema de Cache Local (Para continuar não estourando os créditos na API Real)
const CacheSchema = new mongoose.Schema({
    endpoint: { type: String, required: true, unique: true },
    data: { type: mongoose.Schema.Types.Mixed, required: true },
    lastUpdated: { type: Date, default: Date.now }
});
const Cache = mongoose.model('Cache', CacheSchema);

const API_KEY = process.env.API_FOOTBALL_KEY;
const BASE_URL = 'https://v3.football.api-sports.io';
const CACHE_TTL = 1 * 60 * 60 * 1000; // 1 Hora 

const apiClient = axios.create({
    baseURL: BASE_URL,
    headers: {
        'x-apisports-key': API_KEY 
    }
});

async function fetchWithCache(endpoint) {
    const cached = await Cache.findOne({ endpoint });
    const now = new Date();
    
    if (cached && (now - cached.lastUpdated < CACHE_TTL)) {
        return cached.data; // Resposta 100% genuína tirada do DB.
    }
    
    try {
        const res = await apiClient.get(endpoint);
        
        if (res.data.errors && Object.keys(res.data.errors).length > 0) {
            console.error('[ERRO REAL - API] - ', res.data.errors);
            return cached ? cached.data : [];
        }

        const rData = res.data.response;
        
        if (cached) {
            cached.data = rData;
            cached.lastUpdated = now;
            await cached.save();
        } else {
            await Cache.create({ endpoint, data: rData });
        }
        
        return rData; // 100% Real API. Zero manipulação.
    } catch (err) {
        console.error(`Erro conexão direta:`, err.message);
        return cached ? cached.data : [];
    }
}

// Copa
const LEAGUE = 1; 
const SEASON = 2026;

async function getTodayMatches() {
    // Busca nativamente usando as bibliotecas internas do JavaScript p/ ter Ctz do TimeZone Brasileiro 
    const dateHojeBRT = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date()); 
    // ^ Gera estritamente no modelo YYYY-MM-DD
    
    // Filtro sendo enviado DIRETO PARA O SITE OFICIAL buscar! 
    const endpointRealHoje = `/fixtures?league=${LEAGUE}&season=${SEASON}&date=${dateHojeBRT}&timezone=America/Sao_Paulo`;
    
    // Não mexo nos dados, somente retorno exatamante o que for obtido do site original para esta data.
    return await fetchWithCache(endpointRealHoje);
}

async function getHistoryMatches() {
    // Pedimos a base com os fixtures do campeonato para verificar partidas com placares cravados
    const fetchHistoryEndpoint = `/fixtures?league=${LEAGUE}&season=${SEASON}&timezone=America/Sao_Paulo`;
    const all = await fetchWithCache(fetchHistoryEndpoint);
    
    if(!all || !all.length) return [];
    
    // Status real (Short form = "FT" ou Final de Tempo, Prorrog., ou Penalty)
    const completadasNativa = all.filter(m => {
        if (!m.fixture || !m.fixture.status) return false;
        return ['FT', 'PEN', 'AET'].includes(m.fixture.status.short);
    });

    completadasNativa.sort((a,b) => (b.fixture.timestamp || 0) - (a.fixture.timestamp || 0));

    // Exatamente o Array puro enviado de volta aos olhos do Webapp! 
    return completadasNativa.slice(0, 15);
}

async function getPredictions(id) {
    return await fetchWithCache(`/predictions?fixture=${id}`);
}

module.exports = { getTodayMatches, getHistoryMatches, getPredictions };