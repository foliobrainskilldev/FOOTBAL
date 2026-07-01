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

const apiClient = axios.create({
    baseURL: BASE_URL,
    headers: { 'x-apisports-key': API_KEY }
});

// A Função agora aceita "checkStuckGames". Se for ativado, ela procura ativamente por placares falsos!
async function fetchWithCache(endpoint, customTTL, checkStuckGames = false) {
    let cached = null;
    try { cached = await Cache.findOne({ endpoint }); } catch (e) {}
    const now = new Date();
    
    let needsRefresh = false;

    if (cached && (now - cached.lastUpdated < customTTL)) {
        // AUTO-CURA: Verifica se há algum jogo salvo no cache com placar preso
        if (checkStuckGames && cached.data && Array.isArray(cached.data)) {
            const hasStuckGame = cached.data.some(jogo => {
                const status = jogo.fixture?.status?.short;
                // Status de jogos que realmente acabaram
                const isFinished = ['FT', 'AET', 'PEN', 'CANC', 'PST', 'ABD', 'AWD', 'WO'].includes(status);
                
                // Pega a hora exata agora e compara com a hora que o jogo começou
                const timeElapsedSeconds = Math.floor(Date.now() / 1000) - jogo.fixture?.timestamp;
                
                // SE o jogo não tem status de finalizado (ex: 1H, 2H, HT, etc)... 
                // E já se passaram mais de 3 HORAS desde o início da partida
                // ENTÃO ESTE CACHE ESTÁ PRESO! PRECISA SER ATUALIZADO.
                return (!isFinished && timeElapsedSeconds > 3 * 60 * 60);
            });
            
            if (hasStuckGame) {
                console.log(`🧹 CACHE PRESO DETECTADO: Ignorando o cache antigo e forçando atualização em ${endpoint}`);
                needsRefresh = true;
            }
        }

        // Se não precisa de refresh forçado, usa a memória rápida normal.
        if (!needsRefresh && !(Array.isArray(cached.data) && cached.data.length === 0)) {
            console.log(`⚡ RETORNANDO DO CACHE: ${endpoint}`);
            return cached.data;
        }
    }
    
    try {
        console.log(`📡 BUSCANDO NA API-SPORTS: ${endpoint}`);
        const res = await apiClient.get(endpoint);
        
        if (res.data.errors && Object.keys(res.data.errors).length > 0) {
            console.error(`🚨 ERRO NA API [${endpoint}]:`, res.data.errors);
            // Se faltar crédito, ele salva o app usando o cache antigo mesmo que esteja preso
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

async function getRealOdds(fixtureId, ttl) {
    const oddsData = await fetchWithCache(`/odds?fixture=${fixtureId}`, ttl);
    if (!oddsData || oddsData.length === 0) return null;

    const bookmakers = oddsData[0].bookmakers;
    if (!bookmakers || bookmakers.length === 0) return null;

    return bookmakers[0].bets;
}

const WORLD_CUP_LEAGUE_ID = 1; // 1 = Copa do Mundo

function isMatchFinished(jogo) {
    const status = jogo.fixture?.status?.short;
    if (['FT', 'AET', 'PEN', 'CANC', 'PST', 'ABD', 'AWD', 'WO'].includes(status)) return true;
    const timeElapsedSeconds = Math.floor(Date.now() / 1000) - jogo.fixture.timestamp;
    if (timeElapsedSeconds > 4 * 60 * 60) return true;
    return false;
}

async function getTodayMatches() {
    const dateHojeBRT = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date()); 
    
    // Passando o "true" no final para ativar a faxina automática do cache!
    let todosOsJogos = await fetchWithCache(`/fixtures?date=${dateHojeBRT}&timezone=America/Sao_Paulo`, 1 * 60 * 60 * 1000, true);
    if(!todosOsJogos || todosOsJogos.length === 0) return [];

    let jogosCopaHoje = todosOsJogos.filter(jogo => jogo.league && jogo.league.id === WORLD_CUP_LEAGUE_ID);
    jogosCopaHoje = jogosCopaHoje.filter(jogo => !isMatchFinished(jogo));
    
    const matchesWithOdds = await Promise.all(jogosCopaHoje.map(async (jogo) => {
        const matchStarted = Math.floor(Date.now() / 1000) > jogo.fixture.timestamp;
        const ttl = matchStarted ? (30 * 24 * 60 * 60 * 1000) : (2 * 60 * 60 * 1000);
        const odds = await getRealOdds(jogo.fixture.id, ttl);
        return { ...jogo, real_odds: odds };
    }));

    return matchesWithOdds;
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

    // Passando o "true" no final para ativar a faxina automática!
    const [jogosHoje, jogosOntem] = await Promise.all([
        fetchWithCache(`/fixtures?date=${dateHojeBRT}&timezone=America/Sao_Paulo`, 1 * 60 * 60 * 1000, true),
        fetchWithCache(`/fixtures?date=${dateOntemBRT}&timezone=America/Sao_Paulo`, 1 * 60 * 60 * 1000, true)
    ]);

    let todosJogos = [...(jogosHoje || []), ...(jogosOntem || [])];
    let historicoCopa = todosJogos.filter(jogo => jogo.league && jogo.league.id === WORLD_CUP_LEAGUE_ID);
    
    historicoCopa = historicoCopa.filter(jogo => isMatchFinished(jogo) && jogo.goals && jogo.goals.home !== null);
    historicoCopa.sort((a,b) => b.fixture.timestamp - a.fixture.timestamp);
    
    const jogosCortados = historicoCopa.slice(0, 15);

    const matchesWithOdds = await Promise.all(jogosCortados.map(async (jogo) => {
        const odds = await getRealOdds(jogo.fixture.id, 30 * 24 * 60 * 60 * 1000);
        return { ...jogo, real_odds: odds };
    }));
    
    return matchesWithOdds;
}

async function getPredictions(id) {
    const predictions = await fetchWithCache(`/predictions?fixture=${id}`, 12 * 60 * 60 * 1000);
    const realOdds = await getRealOdds(id, 2 * 60 * 60 * 1000);
    
    if (predictions && predictions.length > 0) {
        predictions[0].real_odds = realOdds; 
    }
    return predictions;
}

module.exports = { getTodayMatches, getHistoryMatches, getPredictions };