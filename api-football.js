const axios = require('axios');
const mongoose = require('mongoose');

const CacheSchema = new mongoose.Schema({
    endpoint: { type: String, required: true, unique: true },
    data: { type: mongoose.Schema.Types.Mixed, required: true },
    lastUpdated: { type: Date, default: Date.now }
});
const Cache = mongoose.models.Cache || mongoose.model('Cache', CacheSchema);

const FD_API_KEY = process.env.FOOTBALL_DATA_KEY;
const ODDS_API_KEY = process.env.ODDS_API_KEY;

if (!FD_API_KEY || !ODDS_API_KEY) {
    console.error("🚨 ATENÇÃO: As chaves FOOTBALL_DATA_KEY ou ODDS_API_KEY estão faltando no arquivo .env!");
}

// ==========================================
// MOCK DATA (Evita Tela Vazia em caso de Queda)
// ==========================================
function getMockMatches() {
    const today = new Date();
    const yesterday = new Date(Date.now() - 86400000);
    return [
        { 
            id: 9991, utcDate: new Date(today.getTime() + 7200000).toISOString(), status: 'SCHEDULED',
            homeTeam: { name: 'Brazil', crest: 'https://crests.football-data.org/764.svg' },
            awayTeam: { name: 'France', crest: 'https://crests.football-data.org/773.svg' },
            score: { fullTime: { home: null, away: null } }
        },
        { 
            id: 9992, utcDate: new Date(yesterday.getTime()).toISOString(), status: 'FINISHED',
            homeTeam: { name: 'England', crest: 'https://crests.football-data.org/770.svg' },
            awayTeam: { name: 'Congo DR', crest: 'https://upload.wikimedia.org/wikipedia/commons/a/ac/No_image_available.svg' },
            score: { fullTime: { home: 2, away: 1 } }
        },
        { 
            id: 9993, utcDate: new Date(yesterday.getTime()).toISOString(), status: 'FINISHED',
            homeTeam: { name: 'Mexico', crest: 'https://crests.football-data.org/769.svg' },
            awayTeam: { name: 'Ecuador', crest: 'https://upload.wikimedia.org/wikipedia/commons/a/ac/No_image_available.svg' },
            score: { fullTime: { home: 2, away: 0 } }
        }
    ];
}

const fallbackOdds = [
    { id: 1, values: [{value: 'Home', odd: 2.15}, {value: 'Away', odd: 3.10}, {value: 'Draw', odd: 3.40}] },
    { id: 5, values: [{value: 'Under 2.5', odd: 1.85}] },
    { id: 8, values: [{value: 'Yes', odd: 1.95}] }
];

// ==========================================
// FUNÇÃO CENTRAL COM PROTEÇÃO DE BANCO DE DADOS
// ==========================================
async function fetchWithCache(endpoint, fetchFunction, customTTL, fallbackData) {
    let cached = null;
    try { cached = await Cache.findOne({ endpoint }); } catch (e) {}
    const now = new Date();
    
    if (cached && (now - cached.lastUpdated < customTTL)) {
        console.log(`⚡ CACHE: ${endpoint}`); return cached.data;
    }
    
    try {
        console.log(`📡 BUSCANDO API: ${endpoint}`);
        const rData = await fetchFunction();
        
        // CORREÇÃO DO ERRO DO MONGODB (E11000): 
        // Usamos updateOne com upsert:true. Isso impede colisões quando muitos acessam ao mesmo tempo!
        await Cache.updateOne(
            { endpoint: endpoint },
            { $set: { data: rData, lastUpdated: now } },
            { upsert: true }
        );

        return rData;
    } catch (err) {
        console.error(`🚨 ERRO API [${endpoint}]:`, err.response ? err.response.status : err.message);
        if (cached && cached.data) return cached.data; 
        console.warn(`⚠️ API BLOQUEADA! INJETANDO DADOS DE EMERGÊNCIA (MOCK) EM: ${endpoint}`);
        return fallbackData; 
    }
}

// ==========================================
// 1. DADOS DAS PARTIDAS (FOOTBALL-DATA.ORG)
// ==========================================
async function getMatchesData(dateFrom, dateTo) {
    const endpoint = `fd_matches_${dateFrom}_${dateTo}`;
    return fetchWithCache(endpoint, async () => {
        // CORREÇÃO DO ERRO 400: Puxamos o endpoint global que aceita free tier 100% e filtramos depois.
        const url = `https://api.football-data.org/v4/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`;
        const res = await axios.get(url, { headers: { 'X-Auth-Token': FD_API_KEY } });
        
        const allMatches = res.data.matches || [];
        // Filtramos apenas jogos da Copa do Mundo (ID 2000)
        return allMatches.filter(m => m.competition && m.competition.id === 2000);
    }, 1 * 60 * 60 * 1000, getMockMatches()); 
}

// ==========================================
// 2. ODDS (ODDS-API.IO v3)
// ==========================================
async function getOddsApiEvents() {
    return fetchWithCache('odds_api_events', async () => {
        const url = `https://api.odds-api.io/v3/events?apiKey=${ODDS_API_KEY}&sport=football`;
        const res = await axios.get(url);
        return res.data;
    }, 4 * 60 * 60 * 1000, []); 
}

async function getOddsForEvent(eventId) {
    if (!eventId) return null;
    return fetchWithCache(`odds_api_match_${eventId}`, async () => {
        const url = `https://api.odds-api.io/v3/odds?apiKey=${ODDS_API_KEY}&eventId=${eventId}`;
        const res = await axios.get(url);
        return res.data;
    }, 4 * 60 * 60 * 1000, null);
}

function normalizeName(name) {
    if (!name) return ""; return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function findEventId(oddsEvents, homeName, awayName) {
    if (!oddsEvents || !oddsEvents.length) return null;
    const hN = normalizeName(homeName); const aN = normalizeName(awayName);
    const event = oddsEvents.find(e => {
        const eH = normalizeName(e.home); const eA = normalizeName(e.away);
        return ((eH.includes(hN) || hN.includes(eH)) && (eA.includes(aN) || aN.includes(eA))) ||
               ((eH.includes(aN) || aN.includes(eH)) && (eA.includes(hN) || hN.includes(eA)));
    });
    return event ? event.id : null;
}

function mapOddsApiIo(oddsJson) {
    if (!oddsJson || !oddsJson.bookmakers) return [];
    const bookies = Object.keys(oddsJson.bookmakers);
    if (bookies.length === 0) return [];
    
    let targetBookie = bookies.find(b => b.toLowerCase().includes('bet365')) || bookies[0];
    const markets = oddsJson.bookmakers[targetBookie];
    if (!markets || !Array.isArray(markets)) return [];

    const realOdds = [];

    const moneyline = markets.find(m => m.name && (m.name.toLowerCase() === 'moneyline' || m.name.toLowerCase() === 'match winner'));
    if (moneyline && moneyline.odds && moneyline.odds.length > 0) {
        const o = moneyline.odds[0];
        if (o.home && o.away && o.draw) realOdds.push({ id: 1, values: [{value: 'Home', odd: parseFloat(o.home)}, {value: 'Away', odd: parseFloat(o.away)}, {value: 'Draw', odd: parseFloat(o.draw)}] });
    }

    const totals = markets.find(m => m.name && (m.name.toLowerCase() === 'totals' || m.name.toLowerCase() === 'over/under'));
    if (totals && totals.odds) {
        const u25 = totals.odds.find(o => String(o.hdp) === "2.5" || o.name === "Under 2.5");
        if (u25 && u25.under) realOdds.push({ id: 5, values: [{value: 'Under 2.5', odd: parseFloat(u25.under)}] });
    }

    const btts = markets.find(m => m.name && m.name.toLowerCase().includes('both teams to score'));
    if (btts && btts.odds && btts.odds.length > 0) {
        if (btts.odds[0].yes) realOdds.push({ id: 8, values: [{value: 'Yes', odd: parseFloat(btts.odds[0].yes)}] });
    }

    return realOdds.length > 0 ? realOdds : fallbackOdds;
}

// ==========================================
// 3. TRADUTORES PARA O FORMATO DO APP
// ==========================================
function isMatchFinished(status) {
    return ['FINISHED', 'AWARDED', 'CANCELLED'].includes(status);
}

function getBrazilDateStr(utcDateString) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(utcDateString));
}

function mapToAppFormat(fdMatch) {
    const statusMap = { 'SCHEDULED': 'NS', 'TIMED': 'NS', 'IN_PLAY': 'LIVE', 'PAUSED': 'HT', 'FINISHED': 'FT', 'SUSPENDED': 'SUSP', 'POSTPONED': 'PST', 'CANCELLED': 'CANC', 'AWARDED': 'AWD' };
    return {
        fixture: { id: fdMatch.id, date: fdMatch.utcDate, timestamp: new Date(fdMatch.utcDate).getTime() / 1000, status: { short: statusMap[fdMatch.status] || fdMatch.status } },
        league: { id: 1, name: 'World Cup' }, 
        teams: {
            home: { name: fdMatch.homeTeam?.name || 'TBA', logo: fdMatch.homeTeam?.crest || 'https://upload.wikimedia.org/wikipedia/commons/a/ac/No_image_available.svg' },
            away: { name: fdMatch.awayTeam?.name || 'TBA', logo: fdMatch.awayTeam?.crest || 'https://upload.wikimedia.org/wikipedia/commons/a/ac/No_image_available.svg' }
        },
        goals: { home: fdMatch.score?.fullTime?.home ?? null, away: fdMatch.score?.fullTime?.away ?? null }
    };
}

async function injectOdds(matches) {
    const oddsEvents = await getOddsApiEvents();
    for (let match of matches) {
        const eventId = findEventId(oddsEvents, match.teams.home.name, match.teams.away.name);
        if (eventId) {
            const oddsData = await getOddsForEvent(eventId);
            match.real_odds = mapOddsApiIo(oddsData);
        } else {
            match.real_odds = fallbackOdds;
        }
    }
    return matches;
}

async function getTodayMatches() {
    const dateHoje = getBrazilDateStr(new Date());
    const rawMatches = await getMatchesData(dateHoje, dateHoje);
    
    let matches = rawMatches.filter(m => getBrazilDateStr(m.utcDate) === dateHoje && !isMatchFinished(m.status)).map(mapToAppFormat);
    return await injectOdds(matches);
}

async function getHistoryMatches() {
    const dateHoje = getBrazilDateStr(new Date());
    const ontem = new Date(); ontem.setDate(ontem.getDate() - 1);
    const dateOntem = getBrazilDateStr(ontem);
    
    // Puxamos de Ontem até Hoje
    const rawMatches = await getMatchesData(dateOntem, dateHoje);
    let historico = rawMatches.filter(m => isMatchFinished(m.status) && m.score?.fullTime?.home !== null);
    
    historico = historico.map(mapToAppFormat);
    historico.sort((a,b) => b.fixture.timestamp - a.fixture.timestamp);
    return await injectOdds(historico.slice(0, 15));
}

async function getPredictions(id) {
    const dateHoje = getBrazilDateStr(new Date());
    const ontem = new Date(); ontem.setDate(ontem.getDate() - 1);
    const dateOntem = getBrazilDateStr(ontem);
    
    const rawMatches = await getMatchesData(dateOntem, dateHoje);
    const fdMatch = rawMatches.find(m => m.id.toString() === id.toString());
    
    if (!fdMatch) return [];

    let mapped = mapToAppFormat(fdMatch);
    mapped = (await injectOdds([mapped]))[0];
    
    let homePct = 33, drawPct = 34, awayPct = 33;
    let winnerName = 'Draw';
    
    const h2h = mapped.real_odds.find(o => o.id === 1);
    if (h2h) {
        const hOdd = h2h.values.find(v => v.value === 'Home')?.odd || 3;
        const aOdd = h2h.values.find(v => v.value === 'Away')?.odd || 3;
        const dOdd = h2h.values.find(v => v.value === 'Draw')?.odd || 3;
        
        const total = (1/hOdd) + (1/aOdd) + (1/dOdd);
        homePct = Math.round(((1/hOdd) / total) * 100);
        awayPct = Math.round(((1/aOdd) / total) * 100);
        drawPct = Math.round(((1/dOdd) / total) * 100);
        
        if (homePct > awayPct && homePct > drawPct) winnerName = mapped.teams.home.name;
        else if (awayPct > homePct && awayPct > drawPct) winnerName = mapped.teams.away.name;
    }

    return [{
        predictions: { winner: { name: winnerName }, percent: { home: `${homePct}%`, draw: `${drawPct}%`, away: `${awayPct}%` } },
        teams: mapped.teams, fixture: mapped.fixture, real_odds: mapped.real_odds
    }];
}

module.exports = { getTodayMatches, getHistoryMatches, getPredictions };