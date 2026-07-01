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
    
    // GATILHO SALVADOR DO MONGODB PRESO:
    // Só consome o dado armazenado se o que o DB tiver NÃO FOR VAZIO (excluí arrays limpos da falha passada)
    if (cached && (now - cached.lastUpdated < CACHE_TTL)) {
        if (Array.isArray(cached.data) && cached.data.length === 0) {
            console.log(`🧹 CACHE INVALIDADO: O Banco guardou zero []. Rasgando BD para tentar a plataforma Original. Endpoint: ${endpoint}`);
        } else {
            return cached.data;
        }
    }
    
    try {
        console.log(`📡 COMUNICANDO PELA WEB (Dados Reais): Consultando ${endpoint}...`);
        const res = await apiClient.get(endpoint);
        
        if (res.data.errors && Object.keys(res.data.errors).length > 0) {
            console.error('🚫 Erro bloqueante real na API API-Sports: ', res.data.errors);
            return []; // Fator limitante atingido (Keys / Credits etc)
        }

        const rData = res.data.response;
        
        // APENAS salverá como CACHE futuro de longo tempo, se existirem itens/partidas!
        // Impede completamente que noites ou falhas prendam sua plataforma!
        if (rData && rData.length > 0) {
            if (cached) {
                cached.data = rData;
                cached.lastUpdated = now;
                await cached.save();
            } else {
                await Cache.create({ endpoint, data: rData });
            }
        }
        
        return rData;
    } catch (err) {
        console.error(`🚨 Axios - Falha Rede Direta:`, err.message);
        return [];
    }
}

const LEAGUE = 1; // Copa
const SEASON = 2026; 

async function getTodayMatches() {
    // 1. Coleta Hoje estritamente TimeZone Brasileira  Ex (2026-06-30)
    const dateHojeBRT = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date()); 
    
    const endpointRealHoje = `/fixtures?league=${LEAGUE}&season=${SEASON}&date=${dateHojeBRT}&timezone=America/Sao_Paulo`;
    
    // Processamento da tentativa 1 (O Hoje do Calendário Mundial):
    let dadosReaisEncontrados = await fetchWithCache(endpointRealHoje);

    // SISTEMA PRO "PRÓXIMA REAL DISPONÍVEL" (ANTI TELA VAZIA E VERÍDICA!):
    // Na possibilidade fática ou descanso em dias como Terça pra voltar Quarta.. Ela rasga a home trazendo só a verídica 'da próxima disponível': 
    if(!dadosReaisEncontrados || dadosReaisEncontrados.length === 0) {
        console.log(`⏱ Sem eventos pra ${dateHojeBRT}. Pegando oficiosamente 'Os 5 proximos da Copa real' direto...`);
        const endpointGenuinoAdicionalFallback = `/fixtures?league=${LEAGUE}&season=${SEASON}&next=5&timezone=America/Sao_Paulo`;
        dadosReaisEncontrados = await fetchWithCache(endpointGenuinoAdicionalFallback);
    }
    
    return dadosReaisEncontrados;
}

async function getHistoryMatches() {
    const end = `/fixtures?league=${LEAGUE}&season=${SEASON}&timezone=America/Sao_Paulo`;
    const all = await fetchWithCache(end);
    if(!all || !all.length) return [];
    
    const comTempoFinalizadoGenuinamente = all.filter(m => {
        if (!m.fixture || !m.fixture.status) return false;
        return ['FT', 'PEN', 'AET'].includes(m.fixture.status.short);
    });

    comTempoFinalizadoGenuinamente.sort((a,b) => (b.fixture.timestamp || 0) - (a.fixture.timestamp || 0));

    return comTempoFinalizadoGenuinamente.slice(0, 15);
}

async function getPredictions(id) {
    return await fetchWithCache(`/predictions?fixture=${id}`);
}

module.exports = { getTodayMatches, getHistoryMatches, getPredictions };