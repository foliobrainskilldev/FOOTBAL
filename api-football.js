// --- START OF FILE api-football.js ---

const axios = require('axios');
const mongoose = require('mongoose');

const CacheSchema = new mongoose.Schema({
    endpoint: {
        type: String,
        required: true,
        unique: true
    },
    data: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    }
});
// Evita erro de sobrescrita de modelo no mongoose
const Cache = mongoose.models.Cache || mongoose.model('Cache', CacheSchema);

const API_KEY = process.env.API_FOOTBALL_KEY;
const SHARP_API_KEY = process.env.SHARP_API_KEY || ''; // Nova API de Odds
const BASE_URL = 'https://v3.football.api-sports.io';

const CACHE_TTL = 1 * 60 * 60 * 1000; // 1 Hora

const apiClient = axios.create({
    baseURL: BASE_URL,
    headers: {
        'x-apisports-key': API_KEY
    }
});

// Busca na API-Sports com Filtro Anti-Queda e Fallback
async function fetchWithCache(endpoint, customTTL = CACHE_TTL) {
    let cached = null;
    try {
        cached = await Cache.findOne({
            endpoint
        });
    } catch (e) {
        console.error("❌ Erro ao acessar Cache no MongoDB:", e.message);
    }

    const now = new Date();

    // Retorna cache se estiver dentro do tempo de validade
    if (cached && (now - cached.lastUpdated < customTTL)) {
        if (Array.isArray(cached.data) && cached.data.length === 0) {
            console.log(`🧹 CACHE VAZIO: Tentando buscar de novo... ${endpoint}`);
        } else {
            console.log(`⚡ RETORNANDO DO CACHE: ${endpoint}`);
            return cached.data;
        }
    }

    try {
        console.log(`📡 BUSCANDO NA API-SPORTS: ${endpoint}`);
        const res = await apiClient.get(endpoint);

        // 🚨 SEGREDO AQUI: Se a API der erro de Rate Limit ou Permissão do Plano Free
        if (res.data.errors && Object.keys(res.data.errors).length > 0) {
            console.error(`🚨 ERRO NA API-SPORTS [${endpoint}]:`, res.data.errors);

            // FALLBACK SALVADOR: Se der erro, NÃO zera os jogos. Devolve a última lista salva!
            if (cached && cached.data && cached.data.length > 0) {
                console.log("♻️ Fallback: Retornando cache antigo para evitar tela vazia.");
                return cached.data;
            }
            return [];
        }

        const rData = res.data.response;

        if (rData && rData.length > 0) {
            if (cached) {
                cached.data = rData;
                cached.lastUpdated = now;
                await cached.save();
            } else {
                await Cache.create({
                    endpoint,
                    data: rData
                });
            }
        } else {
            console.log(`⚠️ Nenhum dado encontrado para: ${endpoint}`);
            if (cached && cached.data && cached.data.length > 0) return cached.data;
        }
        return rData || [];
    } catch (err) {
        console.error(`❌ Falha na conexão com a API:`, err.message);
        // Fallback em caso de queda de rede
        if (cached && cached.data && cached.data.length > 0) return cached.data;
        return [];
    }
}

// 🔥 INTEGRAÇÃO: SharpAPI com Cache
async function getSharpApiOdds(fixtureId) {
        if (!SHARP_API_KEY) return null;

        const endpointKey = `sharpapi_odds_${fixtureId}`;
        let cached;
        try {
            cached = await Cache.findOne({
                endpoint: endpointKey
            });
        } catch (e) {}
        const now = new Date();

        if (cached && (now - cached.lastUpdated < (2 * 60 * 60 * 1000))) return cached.data;

        try {
            console.log(`📡 BUSCANDO ODDS NA SHARP API (Fixture: ${fixtureId})`);
            const res = await axios.get(`https://api.sharpapi.com/v1/sports/football/odds/${fixtureId}`, {
                headers: {
                    'Authorization': `Bearer ${SHARP_API_KEY}`
                }
            });

            const oddsData = res.data;
            if (oddsData) {
                if (cached) {
                    cached.data = oddsData;
                    cached.lastUpdated = now;
                    await cached.save();
                } else {
                    await Cache.create({
                        endpoint: endpointKey,
                        data: oddsData
                    });
                }
            }
            return oddsData;
        } catch (error) {
            const motivo = error.response ? `${error.response.status} - ${JSON.stringify(error.response.data)}` : error.message;
            console.log(`⚠️ Falha ao buscar SharpAPI. Motivo: ${motivo}`);
            return null;
        }

        const WORLD_CUP_LEAGUE_ID = 1; // ID oficial da Copa do Mundo na API

        async function getTodayMatches() {
            const dateHojeBRT = new Intl.DateTimeFormat('en-CA', {
                timeZone: 'America/Sao_Paulo',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            }).format(new Date());

            // 🚀 PLANO FREE SEGURO: Busca TODOS os jogos da data para não causar erro de permissões.
            let todosOsJogos = await fetchWithCache(`/fixtures?date=${dateHojeBRT}&timezone=America/Sao_Paulo`);
            if (!todosOsJogos || todosOsJogos.length === 0) return [];

            // 🚀 FILTRAGEM NO JAVASCRIPT: Limpa os jogos e deixa apenas os da Copa do Mundo
            let jogosCopaHoje = todosOsJogos.filter(jogo => jogo.league && jogo.league.id === WORLD_CUP_LEAGUE_ID);

            // Remove os que já terminaram ou foram cancelados
            jogosCopaHoje = jogosCopaHoje.filter(jogo => {
                const status = jogo.fixture?.status?.short;
                return !['FT', 'AET', 'PEN', 'CANC', 'PST', 'ABD'].includes(status);
            });

            return jogosCopaHoje;
        }

        async function getHistoryMatches() {
            const dateHojeBRT = new Intl.DateTimeFormat('en-CA', {
                timeZone: 'America/Sao_Paulo',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            }).format(new Date());

            const ontem = new Date();
            ontem.setDate(ontem.getDate() - 1);
            const dateOntemBRT = new Intl.DateTimeFormat('en-CA', {
                timeZone: 'America/Sao_Paulo',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            }).format(ontem);

            // 🚀 PLANO FREE SEGURO: Busca hoje e ontem paralelamente pelas datas e depois filtra
            const [jogosHoje, jogosOntem] = await Promise.all([
                fetchWithCache(`/fixtures?date=${dateHojeBRT}&timezone=America/Sao_Paulo`),
                fetchWithCache(`/fixtures?date=${dateOntemBRT}&timezone=America/Sao_Paulo`)
            ]);

            let todosJogos = [...(jogosHoje || []), ...(jogosOntem || [])];

            // Filtra na memória
            let historicoCopa = todosJogos.filter(jogo => jogo.league && jogo.league.id === WORLD_CUP_LEAGUE_ID);

            historicoCopa = historicoCopa.filter(m => ['FT', 'PEN', 'AET'].includes(m.fixture?.status?.short));
            historicoCopa.sort((a, b) => b.fixture.timestamp - a.fixture.timestamp);

            return historicoCopa.slice(0, 15);
        }

        async function getPredictions(id) {
            // TTL de 12 horas para Palpites. (Evita gastar limites à toa num mesmo jogo)
            const predictions = await fetchWithCache(`/predictions?fixture=${id}`, 12 * 60 * 60 * 1000);
            const odds = await getSharpApiOdds(id);

            if (predictions && predictions.length > 0) {
                predictions[0].sharp_odds = odds;
            }
            return predictions;
        }

        module.exports = {
            getTodayMatches,
            getHistoryMatches,
            getPredictions
        };