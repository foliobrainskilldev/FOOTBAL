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

// Chave da Odds-API para Copa do Mundo
const SPORT_KEY = 'soccer_fifa_world_cup'; 

async function fetchWithCache(endpoint, fetchFunction, customTTL) {
    let cached = null;
    try { cached = await Cache.findOne({ endpoint }); } catch (e) {}
    const now = new Date();
    
    if (cached && (now - cached.lastUpdated < customTTL)) {
        console.log(`⚡ CACHE: ${endpoint}`);
        return cached.data;
    }
    
    try {
        console.log(`📡 BUSCANDO API: ${endpoint}`);
        const rData = await fetchFunction();
        
        if (cached) {
            cached.data = rData;
            cached.lastUpdated = now;
            await cached.save();
        } else {
            await Cache.create({ endpoint, data: rData });
        }
        return rData;
    } catch (err) {
        console.error(`🚨 ERRO API [${endpoint}]:`, err.message);
        return cached ? cached.data : null;
    }
}

// 1. BUSCA ODD E TRADUZ PARA O SEU FORMATO
async function getAllOdds() {
    return fetchWithCache('odds_api_wc', async () => {
        const url = `https://api.the-odds-api.com/v4/sports/${SPORT_KEY}/odds/?apiKey=${ODDS_API_KEY}&regions=eu&markets=h2h,totals,btts`;
        const res = await axios.get(url);
        return res.data;
    }, 4 * 60 * 60 * 1000); // Salva odds por 4 horas pra poupar cota
}

function normalizeName(name) {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function mapOddsForMatch(allOdds, homeName, awayName) {
    if (!allOdds || !allOdds.length) return [];
    
    const hN = normalizeName(homeName);
    const aN = normalizeName(awayName);
    
    const oddData = allOdds.find(o => 
        (normalizeName(o.home_team).includes(hN) || hN.includes(normalizeName(o.home_team))) ||
        (normalizeName(o.away_team).includes(aN) || aN.includes(normalizeName(o.away_team)))
    );

    if (!oddData || !oddData.bookmakers || !oddData.bookmakers.length) return [];
    
    const markets = oddData.bookmakers[0].markets;
    const realOdds = [];

    const h2h = markets.find(m => m.key === 'h2h');
    if (h2h) {
        const h = h2h.outcomes.find(o => o.name === oddData.home_team)?.price || 0;
        const a = h2h.outcomes.find(o => o.name === oddData.away_team)?.price || 0;
        const d = h2h.outcomes.find(o => o.name === 'Draw')?.price || 0;
        realOdds.push({ id: 1, values: [{value: 'Home', odd: h}, {value: 'Away', odd: a}, {value: 'Draw', odd: d}] });
    }

    const totals = markets.find(m => m.key === 'totals');
    if (totals) {
        const under = totals.outcomes.find(o => o.name.toLowerCase() === 'under' && o.point === 2.5)?.price || 0;
        if (under) realOdds.push({ id: 5, values: [{value: 'Under 2.5', odd: under}] });
    }

    const btts = markets.find(m => m.key === 'btts');
    if (btts) {
        const yes = btts.outcomes.find(o => o.name.toLowerCase() === 'yes')?.price || 0;
        if (yes) realOdds.push({ id: 8, values: [{value: 'Yes', odd: yes}] });
    }

    return realOdds;
}

// 2. BUSCA JOGOS E TRADUZ PARA O SEU FORMATO
async function getMatchesData(dateFrom, dateTo) {
    const endpoint = `fd_matches_${dateFrom}_${dateTo}`;
    return fetchWithCache(endpoint, async () => {
        // ID 2000 é a Copa do Mundo no Football-Data
        const url = `https://api.football-data.org/v4/competitions/2000/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`;
        const res = await axios.get(url, { headers: { 'X-Auth-Token': FD_API_KEY } });
        return res.data.matches || [];
    }, 1 * 60 * 60 * 1000); // Cache de 1 hora
}

function isMatchFinished(status) {
    return ['FINISHED', 'AWARDED', 'CANCELLED'].includes(status);
}

function mapToAppFormat(fdMatch, allOdds) {
    const statusMap = {
        'SCHEDULED': 'NS', 'TIMED': 'NS', 'IN_PLAY': 'LIVE', 'PAUSED': 'HT',
        'FINISHED': 'FT', 'SUSPENDED': 'SUSP', 'POSTPONED': 'PST', 'CANCELLED': 'CANC', 'AWARDED': 'AWD'
    };

    const mappedMatch = {
        fixture: {
            id: fdMatch.id,
            date: fdMatch.utcDate,
            timestamp: new Date(fdMatch.utcDate).getTime() / 1000,
            status: { short: statusMap[fdMatch.status] || fdMatch.status }
        },
        league: { id: 1, name: 'World Cup' }, 
        teams: {
            home: { name: fdMatch.homeTeam.name, logo: fdMatch.homeTeam.crest || 'https://upload.wikimedia.org/wikipedia/commons/a/ac/No_image_available.svg' },
            away: { name: fdMatch.awayTeam.name, logo: fdMatch.awayTeam.crest || 'https://upload.wikimedia.org/wikipedia/commons/a/ac/No_image_available.svg' }
        },
        goals: {
            home: fdMatch.score?.fullTime?.home ?? null,
            away: fdMatch.score?.fullTime?.away ?? null
        }
    };

    mappedMatch.real_odds = mapOddsForMatch(allOdds, mappedMatch.teams.home.name, mappedMatch.teams.away.name);
    return mappedMatch;
}

async function getTodayMatches() {
    const dateHoje = new Date().toISOString().split('T')[0];
    const [rawMatches, allOdds] = await Promise.all([ getMatchesData(dateHoje, dateHoje), getAllOdds() ]);
    
    if (!rawMatches) return [];
    
    return rawMatches
        .filter(m => !isMatchFinished(m.status))
        .map(m => mapToAppFormat(m, allOdds));
}

async function getHistoryMatches() {
    const dateHoje = new Date().toISOString().split('T')[0];
    const dateOntem = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    
    const [rawMatches, allOdds] = await Promise.all([ getMatchesData(dateOntem, dateHoje), getAllOdds() ]);
    if (!rawMatches) return [];
    
    let historico = rawMatches.filter(m => isMatchFinished(m.status) && m.score?.fullTime?.home !== null);
    historico = historico.map(m => mapToAppFormat(m, allOdds));
    historico.sort((a,b) => b.fixture.timestamp - a.fixture.timestamp);
    
    return historico.slice(0, 15);
}

// IA MATEMÁTICA: Gera a probabilidade EXATA com base nas Odds das Casas de Aposta
async function getPredictions(id) {
    const dateHoje = new Date().toISOString().split('T')[0];
    const dateOntem = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const [rawMatches, allOdds] = await Promise.all([ getMatchesData(dateOntem, dateHoje), getAllOdds() ]);
    
    const fdMatch = (rawMatches || []).find(m => m.id.toString() === id.toString());
    if (!fdMatch) return [];

    const mapped = mapToAppFormat(fdMatch, allOdds);
    
    let homePct = 33, drawPct = 34, awayPct = 33;
    let winnerName = 'Draw';
    
    const h2h = mapped.real_odds.find(o => o.id === 1);
    if (h2h) {
        const hOdd = h2h.values.find(v => v.value === 'Home')?.odd || 3;
        const aOdd = h2h.values.find(v => v.value === 'Away')?.odd || 3;
        const dOdd = h2h.values.find(v => v.value === 'Draw')?.odd || 3;
        
        const hProb = 1 / hOdd; const aProb = 1 / aOdd; const dProb = 1 / dOdd;
        const total = hProb + aProb + dProb;
        
        homePct = Math.round((hProb / total) * 100);
        awayPct = Math.round((aProb / total) * 100);
        drawPct = Math.round((dProb / total) * 100);
        
        if (homePct > awayPct && homePct > drawPct) winnerName = mapped.teams.home.name;
        else if (awayPct > homePct && awayPct > drawPct) winnerName = mapped.teams.away.name;
    }

    return [{
        predictions: {
            winner: { name: winnerName },
            percent: { home: `${homePct}%`, draw: `${drawPct}%`, away: `${awayPct}%` }
        },
        teams: mapped.teams,
        fixture: mapped.fixture,
        real_odds: mapped.real_odds
    }];
}

module.exports = { getTodayMatches, getHistoryMatches, getPredictions };