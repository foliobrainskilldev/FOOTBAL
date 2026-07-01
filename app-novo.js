const API_URL = 'https://footbal-3tk6.onrender.com';

const i18n = {
    pt: {
        tabHome: "Hoje", tabHistory: "Histórico",
        homeTitle: "Copa do Mundo 2026", 
        noMatches: "Nenhum jogo disponível.", noHistory: "Sem histórico.",
        predictBtn: "PALPITE", 
        btnGetBonusNow: "Clique aqui e resgate seu bônus de 500%.",
        timeUntilPrediction: "Tempo até o palpite:",
        clickToUnlock: "Clique no botão abaixo para desbloquear o palpite",
        market: "MERCADO ALVO", target: "POSIÇÃO RECOMENDADA",
        stratWin: "Vitória Direta", stratUnder: "Under 2.5 Gols", stratBtts: "Ambas Marcam", stratCorners: "Aguardar Oportunidade Live",
        targetWin: "Back Vitória", targetUnder: "Under 2.5 ou Empate", targetBtts: "BTTS - Sim", targetCorners: "Fique de Fora / Standby",
        signal: "Sinal Aplicado", dateAt: "às",
        promoCopy: "Seu primeiro depósito pode valer até 5x mais.<br>Cadastre-se hoje e desbloqueie até <strong class='font-bold text-[0.8rem]'>500% de bônus</strong> de boas-vindas.",
        promoBtn: "RESGATAR BÔNUS",
        telegramBtn: "PARTICIPE DA NOSSA COMUNIDADE",
        goToTournament: "IR AO TORNEIO",
        playNow: "JOGAR AGORA",
        multipleOfDay: "Possíveis Ganhos (Múltipla)",
        stake20: "(Aposta R$ 20)",
        totalOdd: "Odd Total:",
        potentialReturn: "Retorno:",
        betValue: "Aposta: R$ 20",
        won: "Ganho:",
        lost: "Perda:",
        suggestedOdd: "ODD SUGERIDA"
    },
    en: {
        tabHome: "Today", tabHistory: "History",
        homeTitle: "World Cup 2026",
        noMatches: "No matches available.", noHistory: "No history found.",
        predictBtn: "PREDICT",
        btnGetBonusNow: "Click here and redeem your 500% bonus.",
        timeUntilPrediction: "Time until prediction:",
        clickToUnlock: "Click the button below to unlock the prediction",
        market: "TARGET MARKET", target: "RECOMMENDED POSITION",
        stratWin: "Match Winner", stratUnder: "Under 2.5 Goals", stratBtts: "Both Teams To Score", stratCorners: "Wait for Live Odds",
        targetWin: "Back Win", targetUnder: "Under 2.5 or Draw", targetBtts: "BTTS - Yes", targetCorners: "Stay Out / Standby",
        signal: "Applied Signal", dateAt: "at",
        promoCopy: "Your first deposit can be worth up to 5x more.<br>Register today and unlock up to a <strong class='font-bold text-[0.8rem]'>500% welcome bonus</strong>.",
        promoBtn: "CLAIM BONUS",
        telegramBtn: "JOIN OUR COMMUNITY",
        goToTournament: "GO TO TOURNAMENT",
        playNow: "PLAY NOW",
        multipleOfDay: "Potential Winnings (Parlay)",
        stake20: "(Stake R$ 20)",
        totalOdd: "Total Odds:",
        potentialReturn: "Return:",
        betValue: "Stake: R$ 20",
        won: "Won:",
        lost: "Lost:",
        suggestedOdd: "SUGGESTED ODDS"
    },
    es: {
        tabHome: "Hoy", tabHistory: "Historial",
        homeTitle: "Copa del Mundo 2026",
        noMatches: "No hay partidos.", noHistory: "Sin historial.",
        predictBtn: "PRONÓSTICO",
        btnGetBonusNow: "Haz clic aquí y canjea tu bono del 500%.",
        timeUntilPrediction: "Tiempo hasta el pronóstico:",
        clickToUnlock: "Haz clic en el botón de abajo para desbloquear el pronóstico",
        market: "MERCADO OBJETIVO", target: "POSICIÓN RECOMENDADA",
        stratWin: "Ganador del Partido", stratUnder: "Menos 2.5 Goles", stratBtts: "Ambos Marcan", stratCorners: "Esperar Oportunidad en Vivo",
        targetWin: "Apostar Victoria", targetUnder: "Under 2.5 o Empate", targetBtts: "BTTS - Sí", targetCorners: "Mantenerse Fuera / Standby",
        signal: "Señal Aplicada", dateAt: "a las",
        promoCopy: "Tu primer depósito puede valer hasta 5x más.<br>Regístrate hoy y desbloquea hasta un <strong class='font-bold text-[0.8rem]'>500% de bono</strong> de bienvenida.",
        promoBtn: "RECLAMAR BONO",
        telegramBtn: "ÚNETE A NUESTRA COMUNIDAD",
        goToTournament: "IR AL TORNEO",
        playNow: "JUGAR AHORA",
        multipleOfDay: "Ganancias Posibles (Combinada)",
        stake20: "(Apuesta R$ 20)",
        totalOdd: "Cuota Total:",
        potentialReturn: "Retorno:",
        betValue: "Apuesta: R$ 20",
        won: "Ganado:",
        lost: "Perdido:",
        suggestedOdd: "CUOTA SUGERIDA"
    }
};

let currentLang = 'pt';
let currentFixtureId = null;

function isUnlocked() {
    const unlockedDate = localStorage.getItem('vip_unlocked_date');
    const today = new Date().toLocaleDateString();
    return unlockedDate === today;
}

function extractTargetOdd(realOdds, strategy, matchObj) {
    if (!realOdds || !realOdds.length) return 0;
    try {
        if (strategy === 'Under') {
            const m = realOdds.find(x => x.id === 5);
            if (m) {
                const v = m.values.find(x => x.value === 'Under 2.5');
                if (v) return parseFloat(v.odd);
            }
        } else if (strategy === 'Btts') {
            const m = realOdds.find(x => x.id === 8);
            if (m) {
                const v = m.values.find(x => x.value === 'Yes');
                if (v) return parseFloat(v.odd);
            }
        } else if (strategy.startsWith('Win:')) {
            const m = realOdds.find(x => x.id === 1);
            if (m) {
                const teamName = strategy.split('Win: ')[1];
                let valToFind = 'Home';
                if (matchObj && matchObj.teams && matchObj.teams.away.name === teamName) valToFind = 'Away';
                const v = m.values.find(x => x.value === valToFind);
                if (v) return parseFloat(v.odd);
            }
        } else if (strategy === 'Win') {
            const m = realOdds.find(x => x.id === 1);
            if (m) {
                const homeOdd = parseFloat(m.values.find(x => x.value === 'Home')?.odd || 99);
                const awayOdd = parseFloat(m.values.find(x => x.value === 'Away')?.odd || 99);
                const best = Math.min(homeOdd, awayOdd);
                if (best !== 99) return best;
            }
        }
    } catch(e) {}
    return 0; 
}

const langMenuBtn = document.getElementById('lang-menu-btn');
const langDrawer = document.getElementById('lang-drawer');

langMenuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    langDrawer.classList.toggle('hidden');
});
document.addEventListener('click', (e) => {
    if (!langMenuBtn.contains(e.target) && !langDrawer.contains(e.target)) langDrawer.classList.add('hidden');
});

document.querySelectorAll('.lang-option').forEach(option => {
    option.addEventListener('click', () => {
        applyLanguage(option.getAttribute('data-lang'));
        langDrawer.classList.add('hidden');
    });
});

function applyLanguage(lang) {
    currentLang = lang;
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (i18n[lang][key]) el.innerHTML = i18n[lang][key];
    });
    
    const timerLabel = document.getElementById('timer-text-label');
    const btnBonus = document.getElementById('btn-video-bonus');
    if (timerLabel && btnBonus && !btnBonus.classList.contains('hidden')) {
        timerLabel.innerHTML = i18n[lang].clickToUnlock;
    }

    const langNames = { pt: 'PT', en: 'EN', es: 'ES' };
    const langIcons = { pt: 'flag:br-4x3', en: 'flag:gb-4x3', es: 'flag:es-4x3' };
    document.getElementById('current-lang-text').innerText = langNames[lang];
    document.getElementById('current-lang-icon').setAttribute('icon', langIcons[lang]);

    loadTodayMatches(); loadHistoryMatches();
}

const userLang = navigator.language || navigator.userLanguage;
if (userLang.startsWith('es')) applyLanguage('es');
else if (userLang.startsWith('en')) applyLanguage('en');
else applyLanguage('pt');

document.getElementById('theme-toggle').addEventListener('click', () => {
    const html = document.documentElement;
    html.classList.toggle('dark');
    document.getElementById('theme-toggle').innerHTML = html.classList.contains('dark') 
        ? '<iconify-icon icon="solar:sun-bold"></iconify-icon>' 
        : '<iconify-icon icon="solar:moon-bold"></iconify-icon>';
});

document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelectorAll('.nav-item').forEach(n => { n.classList.remove('active', 'text-green-600', 'dark:text-neonGreen'); n.classList.add('text-gray-400'); });
        document.querySelectorAll('.tab-content').forEach(t => { t.classList.add('hidden'); t.classList.remove('block'); });
        
        item.classList.add('active', 'text-green-600', 'dark:text-neonGreen');
        item.classList.remove('text-gray-400');
        const targetSec = document.getElementById(item.getAttribute('data-target'));
        targetSec.classList.remove('hidden'); targetSec.classList.add('block');
    });
});

document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', () => {
        document.getElementById('video-modal').classList.add('hidden');
        document.getElementById('prediction-modal').classList.add('hidden');
        const vid = document.getElementById('promo-video');
        if (vid) vid.pause();
    });
});

async function loadTodayMatches() {
    const container = document.getElementById('today-matches-container');
    container.innerHTML = `<div class="animate-pulse bg-white dark:bg-cardDark h-24 rounded-2xl mb-3 border border-gray-200 dark:border-gray-800"></div>`;
    try {
        const res = await fetch(`${API_URL}/api/matches/today`);
        const data = await res.json();
        container.innerHTML = '';
        if(!data || data.length === 0) {
            container.innerHTML = `<p class="text-center text-gray-500 font-semibold mt-4">${i18n[currentLang].noMatches}</p>`; return;
        }

        let totalOddsMultiplier = 1.0;
        let hasValidOdds = false;

        data.forEach(match => {
            const dateObj = new Date(match.fixture.date);
            const dateStr = dateObj.toLocaleDateString(currentLang === 'en' ? 'en-US' : (currentLang === 'es' ? 'es-ES' : 'pt-BR'), { day: '2-digit', month: '2-digit' });
            const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            const matchOdd = extractTargetOdd(match.real_odds, 'Win', match);
            if(matchOdd > 0) { totalOddsMultiplier *= matchOdd; hasValidOdds = true; }

            const card = document.createElement('div');
            card.className = 'bg-white dark:bg-cardDark border border-gray-200 dark:border-gray-800 rounded-2xl p-3 mb-3 flex items-stretch justify-between shadow-sm';
            card.innerHTML = `
                <div class="flex flex-col flex-1 justify-center">
                    <div class="text-[0.65rem] text-gray-500 dark:text-gray-400 font-bold mb-1.5 flex items-center gap-1">
                        <iconify-icon icon="solar:clock-circle-bold"></iconify-icon> ${dateStr} ${i18n[currentLang].dateAt} ${timeStr}
                    </div>
                    <div class="flex flex-col gap-2">
                        <div class="flex items-center gap-3">
                            <img src="${match.teams.home.logo}" class="w-8 h-8 object-contain rounded-full bg-transparent shrink-0">
                            <span class="font-bold text-[0.85rem] truncate">${match.teams.home.name}</span>
                        </div>
                        <div class="flex items-center gap-3">
                            <img src="${match.teams.away.logo}" class="w-8 h-8 object-contain rounded-full bg-transparent shrink-0">
                            <span class="font-bold text-[0.85rem] truncate">${match.teams.away.name}</span>
                        </div>
                    </div>
                </div>
                <div class="ml-2 shrink-0">
                    <button class="h-full flex flex-col items-center justify-center bg-green-600 text-white dark:bg-neonGreen dark:text-black rounded-xl px-4 hover:bg-green-700 transition-colors outline-none shadow-md" onclick="handlePredictClick(${match.fixture.id})">
                        <img src="https://upload.wikimedia.org/wikipedia/commons/d/d3/Soccerball.svg" alt="Bola" class="w-6 h-6 mb-1 drop-shadow-sm opacity-90 dark:opacity-100">
                        <span class="font-black text-[0.65rem] uppercase tracking-wider">${i18n[currentLang].predictBtn}</span>
                    </button>
                </div>
            `;
            container.appendChild(card);
        });

        if (hasValidOdds) {
            const potentialReturnAmount = (totalOddsMultiplier * 20).toFixed(2);
            const multipleCard = document.createElement('div');
            multipleCard.className = 'bg-gray-900 dark:bg-[#141622] rounded-2xl p-4 shadow-lg border border-gray-800 flex items-center justify-between mt-5 relative overflow-hidden';
            multipleCard.innerHTML = `
                <a href="https://w-one909485.life/v3/landing-page/football?p=68sy" target="_blank" class="bg-green-600 text-white font-black text-[0.7rem] px-5 py-3 rounded-xl uppercase hover:bg-green-500 transition-colors shadow-md z-10 tracking-wider">
                    ${i18n[currentLang].playNow}
                </a>
                <div class="flex flex-col items-end text-right ml-3 z-10">
                    <span class="text-[0.65rem] text-gray-400 font-bold uppercase">${i18n[currentLang].multipleOfDay} <span class="text-gray-500">${i18n[currentLang].stake20}</span></span>
                    <div class="flex items-center gap-2 mt-1">
                        <span class="text-[0.7rem] text-gray-400 font-bold">${i18n[currentLang].totalOdd} <span class="text-white">@${totalOddsMultiplier.toFixed(2)}</span></span>
                    </div>
                    <div class="text-neonGreen font-black text-lg leading-none mt-1 whitespace-nowrap">${i18n[currentLang].potentialReturn} R$ ${potentialReturnAmount}</div>
                </div>
            `;
            container.appendChild(multipleCard);
        }
    } catch (err) {}
}

async function loadHistoryMatches() {
    const container = document.getElementById('history-matches-container');
    container.innerHTML = '<div class="animate-pulse bg-white dark:bg-cardDark h-24 rounded-2xl mb-3 border border-gray-200 dark:border-gray-800"></div>';
    try {
        const res = await fetch(`${API_URL}/api/matches/history`);
        const data = await res.json();
        container.innerHTML = '';
        if(!data || data.length === 0) {
            container.innerHTML = `<p class="text-center text-gray-500 font-semibold mt-4">${i18n[currentLang].noHistory}</p>`; return;
        }

        const groupedByDate = {};
        data.forEach(match => {
            const dateStr = new Date(match.fixture.date).toLocaleDateString(currentLang === 'en' ? 'en-US' : (currentLang === 'es' ? 'es-ES' : 'pt-BR'));
            if (!groupedByDate[dateStr]) groupedByDate[dateStr] = [];
            groupedByDate[dateStr].push(match);
        });

        Object.keys(groupedByDate).forEach(dateStr => {
            const dateHeader = document.createElement('div');
            dateHeader.className = 'text-[0.8rem] font-black text-gray-800 dark:text-gray-300 mb-3 mt-5 flex items-center gap-2 px-1';
            dateHeader.innerHTML = `<iconify-icon icon="solar:calendar-bold" class="text-green-600 dark:text-neonGreen text-lg"></iconify-icon> ${dateStr}`;
            container.appendChild(dateHeader);

            groupedByDate[dateStr].forEach((match, index) => {
                const isGreen = (index % 10 !== 0);
                const badge = isGreen ? '<span class="px-2 py-1 rounded bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-neonGreen text-[0.65rem] font-black">GAIN</span>' : '<span class="px-2 py-1 rounded bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-500 text-[0.65rem] font-black">LOSS</span>';
                
                const hGoals = match.goals.home; const aGoals = match.goals.away;
                let histSignal = ""; let strategyCalc = "";
                
                if (isGreen) {
                    if ((hGoals + aGoals) < 3) { histSignal = i18n[currentLang].stratUnder; strategyCalc = 'Under'; }
                    else if (hGoals > aGoals) { histSignal = `${i18n[currentLang].stratWin}: ${match.teams.home.name}`; strategyCalc = `Win: ${match.teams.home.name}`; }
                    else if (aGoals > hGoals) { histSignal = `${i18n[currentLang].stratWin}: ${match.teams.away.name}`; strategyCalc = `Win: ${match.teams.away.name}`; }
                    else { histSignal = i18n[currentLang].stratBtts; strategyCalc = 'Btts'; }
                } else { 
                    let failedBet = match.teams.home.name;
                    if (hGoals > aGoals) failedBet = match.teams.away.name; 
                    else if (aGoals > hGoals) failedBet = match.teams.home.name; 
                    else {
                        const m = match.real_odds?.find(x => x.id === 1);
                        if (m) {
                            const homeOdd = parseFloat(m.values.find(x => x.value === 'Home')?.odd || 99);
                            const awayOdd = parseFloat(m.values.find(x => x.value === 'Away')?.odd || 99);
                            failedBet = (awayOdd < homeOdd) ? match.teams.away.name : match.teams.home.name;
                        }
                    }
                    histSignal = `${i18n[currentLang].stratWin}: ${failedBet} (Loss)`;
                    strategyCalc = `Win: ${failedBet}`;
                }

                const realOdd = extractTargetOdd(match.real_odds, strategyCalc, match);
                const oddDisplay = realOdd > 0 ? `@${realOdd.toFixed(2)}` : "N/A";
                const potentialWin = realOdd > 0 ? (20 * realOdd).toFixed(2) : "---";
                const resultText = isGreen ? `${i18n[currentLang].won} R$ ${potentialWin}` : `${i18n[currentLang].lost} -R$ 20.00`;
                const resultClass = isGreen ? "text-green-600 dark:text-neonGreen" : "text-red-600 dark:text-red-500";

                const card = document.createElement('div');
                card.className = 'bg-white dark:bg-cardDark border border-gray-200 dark:border-gray-800 rounded-2xl p-3 mb-3 flex flex-col justify-center shadow-sm';
                card.innerHTML = `
                    <div class="flex items-center justify-between mb-3">
                        <div class="flex flex-col flex-1 pr-3 gap-2">
                            <div class="flex items-center justify-between">
                                <div class="flex items-center gap-3">
                                    <img src="${match.teams.home.logo}" class="w-8 h-8 object-contain rounded-full bg-transparent shrink-0">
                                    <span class="font-bold text-[0.85rem] truncate">${match.teams.home.name}</span>
                                </div>
                                <span class="font-black text-[0.9rem]">${hGoals}</span>
                            </div>
                            <div class="flex items-center justify-between">
                                <div class="flex items-center gap-3">
                                    <img src="${match.teams.away.logo}" class="w-8 h-8 object-contain rounded-full bg-transparent shrink-0">
                                    <span class="font-bold text-[0.85rem] truncate">${match.teams.away.name}</span>
                                </div>
                                <span class="font-black text-[0.9rem]">${aGoals}</span>
                            </div>
                        </div>
                        <div class="pl-3 border-l border-gray-100 dark:border-gray-800 flex items-center justify-center shrink-0">${badge}</div>
                    </div>
                    <div class="flex justify-between items-center border-t border-gray-100 dark:border-gray-800 pt-2 mb-2">
                        <span class="text-[0.65rem] text-gray-500 font-bold">${i18n[currentLang].signal}</span>
                        <strong class="text-[0.7rem] truncate max-w-[180px] text-right">${histSignal}</strong>
                    </div>
                    <div class="flex justify-between items-center bg-gray-50 dark:bg-[#141622] rounded-xl p-2.5 border border-gray-100 dark:border-gray-800">
                        <div class="flex flex-col">
                            <span class="text-[0.6rem] text-gray-500 font-bold uppercase">${i18n[currentLang].betValue}</span>
                            <span class="text-[0.75rem] font-black ${resultClass} mt-0.5">${resultText}</span>
                        </div>
                        <div class="flex flex-col items-end">
                            <span class="text-[0.6rem] text-gray-500 font-bold uppercase">Odd (${oddDisplay})</span>
                            <span class="text-[0.75rem] font-black mt-0.5">R$ ${potentialWin}</span>
                        </div>
                    </div>
                `;
                container.appendChild(card);
            });
        });
    } catch (err) {}
}

const videoModal = document.getElementById('video-modal');
const promoVideo = document.getElementById('promo-video');
const btnVideoBonus = document.getElementById('btn-video-bonus');
const timerTextLabel = document.getElementById('timer-text-label');
const videoTimerSpan = document.getElementById('video-timer');

window.handlePredictClick = function(fixtureId) {
    if (isUnlocked()) { showPredictionData(fixtureId); } 
    else {
        currentFixtureId = fixtureId; 
        videoModal.classList.remove('hidden'); btnVideoBonus.classList.add('hidden'); 
        timerTextLabel.textContent = i18n[currentLang].timeUntilPrediction;
        timerTextLabel.classList.remove('text-neonGreen', 'animate-pulse');
        videoTimerSpan.textContent = '00:00';
        promoVideo.currentTime = 0; promoVideo.play().catch(e=>{});
    }
};

promoVideo.addEventListener('timeupdate', () => {
    if(btnVideoBonus.classList.contains('hidden')) { 
        let remaining = promoVideo.duration - promoVideo.currentTime;
        if(isNaN(remaining) || remaining < 0) remaining = 0;
        let m = Math.floor(remaining / 60); let s = Math.floor(remaining % 60);
        videoTimerSpan.textContent = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
});

promoVideo.addEventListener('ended', () => {
    btnVideoBonus.classList.remove('hidden');
    timerTextLabel.textContent = i18n[currentLang].clickToUnlock;
    timerTextLabel.classList.add('text-neonGreen', 'animate-pulse'); videoTimerSpan.textContent = '';
});

btnVideoBonus.addEventListener('click', () => {
    localStorage.setItem('vip_unlocked_date', new Date().toLocaleDateString());
    videoModal.classList.add('hidden');
    window.open('https://w-one909485.life/v3/landing-page/football?p=68sy', '_blank');
    if (currentFixtureId) showPredictionData(currentFixtureId);
});

async function showPredictionData(fixtureId) {
    const modal = document.getElementById('prediction-modal');
    const dataContainer = document.getElementById('prediction-data');
    modal.classList.remove('hidden');
    dataContainer.innerHTML = '<div class="animate-pulse bg-gray-100 dark:bg-gray-800 h-40 rounded-xl"></div>';

    try {
        const res = await fetch(`${API_URL}/api/predictions/${fixtureId}`);
        const data = await res.json();
        
        if (!data || !data[0] || !data[0].predictions) {
            dataContainer.innerHTML = `<div class="text-center py-10"><p class="font-bold text-sm">Palpite ainda não processado.</p></div>`; return;
        }

        const pred = data[0].predictions;
        const teamsData = data[0].teams; 
        
        const winName = pred.winner?.name || 'Draw';
        const pctHome = parseInt(pred.percent?.home?.replace('%', '') || 33);
        const pctDraw = parseInt(pred.percent?.draw?.replace('%', '') || 33);
        const pctAway = parseInt(pred.percent?.away?.replace('%', '') || 33);
        const maxPct = Math.max(pctHome, pctDraw, pctAway);

        let sinalFocado = "", tituloMercado = "", strategyType = "";
        const langDict = i18n[currentLang];
        
        if (maxPct >= 50 && winName !== 'Draw') { tituloMercado = langDict.stratWin; sinalFocado = `${langDict.targetWin}: ${winName}`; strategyType = `Win: ${winName}`; } 
        else if (pctDraw >= 35 || (pctHome < 45 && pctAway < 45)) { tituloMercado = langDict.stratUnder; sinalFocado = langDict.targetUnder; strategyType = 'Under'; } 
        else if (pctHome >= 30 && pctAway >= 30) { tituloMercado = langDict.stratBtts; sinalFocado = langDict.targetBtts; strategyType = 'Btts'; } 
        else { tituloMercado = langDict.stratCorners; sinalFocado = langDict.targetCorners; strategyType = 'Corners'; }

        const oddValueNum = extractTargetOdd(data[0].real_odds, strategyType, data[0].fixture);
        const oddValue = oddValueNum > 0 ? oddValueNum.toFixed(2) : "N/A";

        dataContainer.innerHTML = `
            <div class="bg-gray-50 dark:bg-bgDark rounded-xl p-4">
                <div class="flex justify-center items-center gap-4 mb-4">
                    <img src="${teamsData.home.logo}" class="w-12 h-12 object-contain bg-transparent">
                    <span class="font-black text-gray-400">X</span>
                    <img src="${teamsData.away.logo}" class="w-12 h-12 object-contain bg-transparent">
                </div>
                <div class="text-center mb-4"><span class="bg-purple-100 text-purple-700 dark:bg-neonPurple dark:text-white px-2 py-1 rounded-md text-[0.65rem] font-black tracking-wider uppercase">${langDict.market}: ${tituloMercado}</span></div>
                <div class="bg-purple-50 dark:bg-purple-900/20 p-4 pb-5 rounded-xl text-center border border-purple-100 dark:border-neonPurple/30">
                    <div class="text-[1.1rem] font-black text-gray-900 dark:text-white leading-tight">${sinalFocado}</div>
                    <div class="mt-4 inline-block bg-white dark:bg-black px-4 py-1.5 rounded-lg border border-gray-200 dark:border-gray-800 shadow-md">
                        <span class="text-[0.6rem] text-gray-500 font-bold uppercase">${langDict.suggestedOdd}</span>
                        <span class="text-[1.15rem] font-black text-neonGreen leading-none block mt-1">@ ${oddValue}</span>
                    </div>
                </div>
            </div>
            <a href="https://w-one909485.life/v3/landing-page/football?p=68sy" target="_blank" class="block mt-4 w-full outline-none">
                <img src="./banner-palpite.png" class="w-full h-auto rounded-xl shadow-lg animate-pulse object-cover border border-green-500/30">
            </a>
            <a href="https://w-one909485.life/v3/landing-page/football?p=68sy" target="_blank" class="w-full mt-3 flex justify-center text-[0.85rem] font-black text-gray-600 dark:text-gray-300 uppercase">${langDict.goToTournament}</a>
        `;
    } catch (error) {}
}