const axios = require('axios');
const mongoose = require('mongoose');

// Esquema de Cache Local via DB para economizar milhares de requisições de limites.
const CacheSchema = new mongoose.Schema({
    endpoint: { type: String, required: true, unique: true },
    data: { type: mongoose.Schema.Types.Mixed, required: true },
    lastUpdated: { type: Date, default: Date.now }
});
const Cache = mongoose.model('Cache', CacheSchema);

const API_KEY = process.env.API_FOOTBALL_KEY;
const BASE_URL = 'https://v3.football.api-sports.io'; // Oficial API Football Original.
const CACHE_TTL = 1 * 60 * 60 * 1000;

const apiClient = axios.create({
    baseURL: BASE_URL,
    headers: {
        'x-apisports-key': API_KEY
    }
});

async function fetchWithCache(endpoint) {
    const cached = await Cache.findOne({ endpoint });
    const now = new Date();
    
    // Consulta DB local. Não estoura as requisições API
    if (cached && (now - cached.lastUpdated < CACHE_TTL)) {
        return cached.data;
    }
    
    console.log(`[API-FOOTBALL CRÉDITOS ABERTO] Fazendo Requisição Nova na NUVEM: ${endpoint}`);
    try {
        const res = await apiClient.get(endpoint);
        
        if (res.data.errors && Object.keys(res.data.errors).length > 0) {
            console.error('Falha autenticada devolvida pela api', res.data.errors);
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
        return rData;
    } catch (err) {
        console.error(`Erro GERAL Backend Node/Axios:`, err.message);
        return cached ? cached.data : [];
    }
}

// Copa 
const LEAGUE = 1; 
const SEASON = 2026;

// Funçao auxiliar que ignora problemas String API Date Format
function DateStringToSP(dateTarget) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo', 
        year: 'numeric', month: '2-digit', day: '2-digit' 
    }).format(dateTarget);
}

async function getTodayMatches() {
    // Busca Todos sem o timezone como restriçao lá fora 
    const end = `/fixtures?league=${LEAGUE}&season=${SEASON}`;
    const all = await fetchWithCache(end);
    
    if(!all || !all.length) return [];
    
    // Data exata baseada na Central (BRT, America_SP): Ex "2026-06-30" 
    const dateHojeBRT = DateStringToSP(new Date());
    const agoraTimestamp = Math.floor(Date.now() / 1000); // Unix Moment atual absoluto (Anti-Horários Bug)

    // Filtra pelo TIMSTAMP local UNIX
    let matchesFilteredToday = all.filter(m => {
        if (!m.fixture || !m.fixture.timestamp) return false;

        const convertedMatchDateBRT = DateStringToSP(new Date(m.fixture.timestamp * 1000));
        return convertedMatchDateBRT === dateHojeBRT;
    });

    // MÁGICA ANTI-"SEM JOGOS" - NUNCA deixará app seco 
    // Se hoje é pausa normal do Mundial Copa, traz o(s) próximos do Calendário e impede abandono do app.
    if(matchesFilteredToday.length === 0) {
        console.log(`Não há Partidas na folha p/: ${dateHojeBRT}. Pegando e recondicionando os Próximos...`);
        matchesFilteredToday = all
            .filter(m => m.fixture?.timestamp > agoraTimestamp) 
            .sort((a,b) => a.fixture.timestamp - b.fixture.timestamp) // Ordem dos mais prox... 
            .slice(0, 5); 
    }

    return matchesFilteredToday;
}

async function getHistoryMatches() {
    // Retorna todos instantâneos do Mongo sem request gasto
    const end = `/fixtures?league=${LEAGUE}&season=${SEASON}`; 
    const all = await fetchWithCache(end);
    
    if(!all || !all.length) return [];
    
    // Traz a base exata com tempo completado 
    const historyCompletes = all.filter(m => ['FT','PEN','AET'].includes(m.fixture?.status?.short));
    
    // Colocados os + recentemente jogados no topo do visual 
    historyCompletes.sort((a,b) => (b.fixture?.timestamp || 0) - (a.fixture?.timestamp || 0));

    return historyCompletes.slice(0, 15);
}

async function getPredictions(id) {
    return await fetchWithCache(`/predictions?fixture=${id}`);
}

module.exports = { getTodayMatches, getHistoryMatches, getPredictions };