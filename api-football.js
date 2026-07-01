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
const BASE_URL = 'https://v3.football.api-sports.io';
const CACHE_TTL = 1 * 60 * 60 * 1000; // Cache de 1 hora para economizar chamadas

const apiClient = axios.create({
    baseURL: BASE_URL,
    headers: { 'x-apisports-key': API_KEY }
});

async function fetchWithCache(endpoint) {
    const cached = await Cache.findOne({ endpoint });
    const now = new Date();
    
    // Sistema anti-falha: Só consome o cache se ele for válido e não for um array vazio
    if (cached && (now - cached.lastUpdated < CACHE_TTL)) {
        if (Array.isArray(cached.data) && cached.data.length === 0) {
            console.log(`🧹 CACHE VAZIO: Tentando buscar novamente... Endpoint: ${endpoint}`);
        } else {
            return cached.data;
        }
    }
    
    try {
        console.log(`📡 BUSCANDO NA API: ${endpoint}`);
        const res = await apiClient.get(endpoint);
        
        if (res.data.errors && Object.keys(res.data.errors).length > 0) {
            console.error('🚫 Erro na API API-Sports:', res.data.errors);
            return []; 
        }

        const rData = res.data.response;
        
        // Salva os dados no MongoDB somente se vierem preenchidos (garantindo sua economia de chamadas)
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
    // 1. Pega a data de hoje estritamente no fuso brasileiro
    const dateHojeBRT = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date()); 
    
    // 🔥 O SEGREDO (Igual seu BOT): Busca TODOS os jogos da data, sem informar Temporada/Liga
    const endpoint = `/fixtures?date=${dateHojeBRT}&timezone=America/Sao_Paulo`;
    
    let todosOsJogosDoDia = await fetchWithCache(endpoint);

    if(!todosOsJogosDoDia || todosOsJogosDoDia.length === 0) return [];

    // FILTRO LOCAL: Separa apenas os da Copa do Mundo (ID = 1)
    let jogosCopaHoje = todosOsJogosDoDia.filter(jogo => jogo.league && jogo.league.id === WORLD_CUP_LEAGUE_ID);
    
    // 🔥 FILTRO DE STATUS: Mantém apenas os jogos Não Iniciados ou Ao Vivo. 
    // Tira os jogos finalizados, adiados ou cancelados da aba "Hoje".
    jogosCopaHoje = jogosCopaHoje.filter(jogo => {
        const status = jogo.fixture?.status?.short;
        return !['FT', 'AET', 'PEN', 'CANC', 'PST', 'ABD'].includes(status);
    });
    
    return jogosCopaHoje;
}

async function getHistoryMatches() {
    // Puxamos o dia de Hoje e de Ontem para garantir que o histórico tenha os jogos mais recentes
    const dateHojeBRT = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date()); 

    const ontem = new Date();
    ontem.setDate(ontem.getDate() - 1);
    const dateOntemBRT = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(ontem);

    // Promise.all executa as duas requisições ao mesmo tempo, deixando o app 2x mais rápido
    const [jogosHoje, jogosOntem] = await Promise.all([
        fetchWithCache(`/fixtures?date=${dateHojeBRT}&timezone=America/Sao_Paulo`),
        fetchWithCache(`/fixtures?date=${dateOntemBRT}&timezone=America/Sao_Paulo`)
    ]);

    let todosJogos = [...(jogosHoje || []), ...(jogosOntem || [])];
    
    // Filtra para pegar só a Copa do Mundo
    let historicoCopa = todosJogos.filter(jogo => jogo.league && jogo.league.id === WORLD_CUP_LEAGUE_ID);

    // 🔥 FILTRO DE HISTÓRICO: Deixa APENAS os jogos que já estão 100% finalizados 
    // (FT = Full Time, PEN = Penaltis, AET = Tempo Extra)
    historicoCopa = historicoCopa.filter(m => {
        const status = m.fixture?.status?.short;
        return ['FT', 'PEN', 'AET'].includes(status);
    });

    // Ordena do mais recente (últimos apitos finais) pro mais antigo
    historicoCopa.sort((a,b) => b.fixture.timestamp - a.fixture.timestamp);

    // Retorna apenas os últimos 15 resultados
    return historicoCopa.slice(0, 15);
}

async function getPredictions(id) {
    // Consulta direta ao ID não gera bloqueios no plano Free da API-Sports
    return await fetchWithCache(`/predictions?fixture=${id}`);
}

module.exports = { getTodayMatches, getHistoryMatches, getPredictions };

// --- END OF FILE api-football.js ---