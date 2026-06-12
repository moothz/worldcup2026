require('dotenv').config();
const mongoose = require('./database');
const Game = require('./models/game');
const Group = require('./models/group');
const axios = require('axios');
const fs = require('fs');

const LIVE_API_BASE = 'https://worldcup26.ir';
const OFF_GAME_INTERVAL = 30 * 60 * 1000; // 30 minutes
const ON_GAME_INTERVAL = 1 * 60 * 1000;  // 1 minute
const PRE_GAME_BUFFER = 15 * 60 * 1000;   // 15 minutes before match start

// Map stadium ID to timezone offset (hours to add to local stadium time to reach Server GMT-3 time)
// All offsets are calculated based on June Daylight Saving Time (DST) for USA/Canada,
// and Mexico's permanent Standard Time (no DST since 2022).
const STADIUM_OFFSETS = {
    "1": 3,  // Mexico City (CST, UTC-6)
    "2": 3,  // Guadalajara (CST, UTC-6)
    "3": 3,  // Monterrey (CST, UTC-6)
    "4": 2,  // Dallas (CDT, UTC-5)
    "5": 2,  // Houston (CDT, UTC-5)
    "6": 2,  // Kansas City (CDT, UTC-5)
    "7": 1,  // Atlanta (EDT, UTC-4)
    "8": 1,  // Miami (EDT, UTC-4)
    "9": 1,  // Boston (EDT, UTC-4)
    "10": 1, // Philadelphia (EDT, UTC-4)
    "11": 1, // New York/New Jersey (EDT, UTC-4)
    "12": 1, // Toronto (EDT, UTC-4)
    "13": 4, // Vancouver (PDT, UTC-7)
    "14": 4, // Seattle (PDT, UTC-7)
    "15": 4, // San Francisco (PDT, UTC-7)
    "16": 4  // Los Angeles (PDT, UTC-7)
};

function parseDate(dateStr, stadiumId = null) {
    // Format in JSON is "MM/DD/YYYY HH:mm" (Local stadium time)
    const [datePart, timePart] = dateStr.split(' ');
    const [month, day, year] = datePart.split('/');
    const [hours, minutes] = timePart.split(':');
    
    // Create date object in server local time
    const date = new Date(year, month - 1, day, hours, minutes);
    
    // Adjust for timezone difference (Stadium -> Server GMT-3)
    const offset = stadiumId ? (STADIUM_OFFSETS[String(stadiumId)] ?? 3) : 3;
    date.setHours(date.getHours() + offset);
    
    return date;
}

function getElapsedMatchTime(match) {
    if (match.time_elapsed === "notstarted") return "Não iniciado";
    if (match.finished === "TRUE") return "Fim de jogo";
    if (match.time_elapsed !== "live") return match.time_elapsed;
    
    try {
        const matchTime = parseDate(match.local_date, match.stadium_id);
        const diffMs = Date.now() - matchTime.getTime();
        let minutes = Math.floor(diffMs / 60000);
        
        if (minutes < 0) minutes = 0;
        
        if (minutes <= 45) {
            return `${minutes}'`;
        } else if (minutes > 45 && minutes <= 60) {
            return "Intervalo";
        } else {
            const secondHalfMin = minutes - 15;
            return `${secondHalfMin}'`;
        }
    } catch (e) {
        return "live";
    }
}

function formatTimeDiff(ms) {
    if (ms <= 0) return "0m";
    const days = Math.floor(ms / (24 * 60 * 60 * 1000));
    const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
    
    let parts = [];
    if (days > 0) parts.push(`${days} days`);
    if (hours > 0) parts.push(`${hours} hours`);
    if (minutes > 0 || parts.length === 0) parts.push(`${minutes} minutes`);
    
    return parts.join(', ');
}

// URL of the Ravena Bot API
const RAVENA_API_URL = process.env.RAVENA_API_URL || 'http://localhost:5000';

/**
 * Sends a game event to the Ravena Bot API /copa endpoint
 */
async function notifyCopa(event, match, goalDetails = null) {
    const url = `${RAVENA_API_URL}/copa`;
    try {
        console.log(`📡 Sending event '${event}' to Ravena bot at ${url}...`);
        const response = await axios.post(url, {
            event,
            match: {
                id: match.id,
                home_team_id: match.home_team_id,
                away_team_id: match.away_team_id,
                home_team_name_en: match.home_team_name_en,
                away_team_name_en: match.away_team_name_en,
                home_score: match.home_score,
                away_score: match.away_score,
                finished: match.finished,
                time_elapsed: getElapsedMatchTime(match),
                stadium_id: match.stadium_id,
                type: match.type,
                group: match.group
            },
            goalDetails
        }, { timeout: 5000 });
        console.log(`📡 Event '${event}' successfully sent to Ravena bot. Response status: ${response.status}`);
    } catch (err) {
        console.error(`⚠️ Failed to notify Ravena bot about event '${event}':`, err.message);
        if (err.response) {
            console.error(`   Status: ${err.response.status}, Data:`, JSON.stringify(err.response.data));
        }
    }
}

/**
 * Helper to identify the scorer name from scorers difference
 */
function findNewScorer(oldScorers, newScorers) {
    if (!newScorers) return null;
    
    const parseScorers = (val) => {
        if (Array.isArray(val)) return val.map(x => typeof x === 'object' ? (x.name || x.player) : String(x));
        if (typeof val === 'string') return val.split(',').map(s => s.trim());
        return [];
    };

    const oldList = parseScorers(oldScorers);
    const newList = parseScorers(newScorers);

    for (const name of newList) {
        if (!oldList.includes(name)) {
            return name;
        }
    }
    return newList[newList.length - 1] || null;
}

async function syncGames() {
    try {
        console.log('🔄 Fetching live games data...');
        const response = await axios.get(`${LIVE_API_BASE}/get/games`, { timeout: 30000 });
        console.log(`📡 GET ${LIVE_API_BASE}/get/games returned status ${response.status}. Games count: ${response.data?.games?.length || 0}`);
        const liveGames = response.data.games;
        
        if (!liveGames || !Array.isArray(liveGames)) {
            throw new Error('Invalid games data received from live API');
        }

        let updatedCount = 0;
        let isGameLiveOrSoon = false;
        let nextGameDate = null;
        const now = new Date();

        for (let i = 0; i < liveGames.length; i++) {
            let liveGame = liveGames[i];
            let shouldFetchDetail = false;

            // Status Logic
            if (liveGame.finished === "FALSE") {
                const matchTime = parseDate(liveGame.local_date, liveGame.stadium_id);
                const timeDiff = matchTime - now;
                
                // If match is starting soon or currently in progress
                // We fetch details for any match that hasn't finished and is within the buffer or already started.
                // We also safeguard with an active start threshold (e.g. started less than 4 hours ago)
                // so stale/postponed matches don't run 1m sync indefinitely if not marked as finished.
                const isWithinBuffer = timeDiff <= PRE_GAME_BUFFER;
                const isRecentStart = timeDiff >= -4 * 60 * 60 * 1000;
                const isLiveTimeWindow = isWithinBuffer && isRecentStart;
                
                const isNotStarted = liveGame.time_elapsed === "notstarted";
                const isActive = liveGame.time_elapsed !== "notstarted";

                if (isLiveTimeWindow || isActive) {
                    console.log(`ℹ️ Match ${liveGame.id} (${liveGame.home_team_name_en} vs ${liveGame.away_team_name_en}): ` +
                                `finished=${liveGame.finished}, time_elapsed=${liveGame.time_elapsed}, ` +
                                `local_date=${liveGame.local_date}, parsedMatchTime=${matchTime.toLocaleString()}, ` +
                                `timeDiff=${formatTimeDiff(Math.abs(timeDiff))} ${timeDiff >= 0 ? 'ahead' : 'ago'} ` +
                                `[isLiveTimeWindow=${isLiveTimeWindow}, isActive=${isActive}]`);
                    isGameLiveOrSoon = true;
                    shouldFetchDetail = true;
                }
                
                // Track earliest upcoming game for countdown (only future games)
                if (timeDiff > 0 && (!nextGameDate || matchTime < nextGameDate)) {
                    nextGameDate = matchTime;
                }
            }

            if (shouldFetchDetail) {
                try {
                    const detailUrl = `${LIVE_API_BASE}/get/game/${liveGame._id}`;
                    console.log(`📡 Fetching realtime detail for match ${liveGame.id} (${liveGame._id}) from ${detailUrl}...`);
                    const detailRes = await axios.get(detailUrl, { timeout: 30000 });
                    console.log(`📡 Detail match ${liveGame.id} returned status ${detailRes.status}`);
                    const detailData = detailRes.data.game || detailRes.data;
                    
                    if (detailData && detailData.id) {
                        console.log(`   Detail fields: score=${detailData.home_score}-${detailData.away_score}, elapsed=${detailData.time_elapsed}, finished=${detailData.finished}`);
                        // Merge detail into liveGames array to ensure it's saved to JSON
                        liveGames[i] = { ...liveGame, ...detailData };
                        liveGame = liveGames[i];
                    } else {
                        console.warn(`⚠️ Match ${liveGame.id} detail response had invalid structure:`, JSON.stringify(detailRes.data).substring(0, 200));
                    }
                } catch (err) {
                    console.error(`⚠️ Failed to fetch detail for match ${liveGame.id}:`, err.message);
                }
            }

            // Fetch previous game state from DB to compare and detect transitions
            const oldGame = await Game.findOne({ id: liveGame.id });

            if (oldGame) {
                const oldHomeScore = Number(oldGame.home_score) || 0;
                const newHomeScore = Number(liveGame.home_score) || 0;
                const oldAwayScore = Number(oldGame.away_score) || 0;
                const newAwayScore = Number(liveGame.away_score) || 0;

                const isElapsedChanged = oldGame.time_elapsed !== liveGame.time_elapsed;
                const isFinishedChanged = oldGame.finished !== liveGame.finished;
                const isScoreChanged = oldHomeScore !== newHomeScore || oldAwayScore !== newAwayScore;

                if (isElapsedChanged || isFinishedChanged || isScoreChanged) {
                    console.log(`🔄 Match ${liveGame.id} State Change Detected:`);
                    console.log(`   - Finished: DB=${oldGame.finished} -> API=${liveGame.finished}`);
                    console.log(`   - Elapsed: DB=${oldGame.time_elapsed} -> API=${liveGame.time_elapsed}`);
                    console.log(`   - Score: DB=${oldHomeScore}-${oldAwayScore} -> API=${newHomeScore}-${newAwayScore}`);
                }

                // 1. Detect Match Start (transitions from 'notstarted' to active)
                if (oldGame.time_elapsed === "notstarted" && liveGame.time_elapsed !== "notstarted" && liveGame.finished !== "TRUE") {
                    console.log(`🚨 Detect Match Start: Match ${liveGame.id}`);
                    await notifyCopa("match_start", liveGame);
                }

                // 2. Detect Goals (scores increased)
                if (newHomeScore > oldHomeScore) {
                    const scorer = findNewScorer(oldGame.home_scorers, liveGame.home_scorers);
                    let scorerName = scorer || "";
                    let goalMinute = getElapsedMatchTime(liveGame);
                    const minuteMatch = scorerName.match(/^(.*?)\s*(\d+')$/);
                    if (minuteMatch) {
                        scorerName = minuteMatch[1];
                        goalMinute = minuteMatch[2];
                    }
                    console.log(`🚨 Detect Goal (Home): Match ${liveGame.id}, scorer=${scorerName}, minute=${goalMinute}, score=${newHomeScore}-${newAwayScore}`);
                    await notifyCopa("goal", liveGame, {
                        scoringTeamId: liveGame.home_team_id,
                        scoringTeamNameEn: liveGame.home_team_name_en,
                        player: scorerName,
                        minute: goalMinute
                    });
                } else if (newAwayScore > oldAwayScore) {
                    const scorer = findNewScorer(oldGame.away_scorers, liveGame.away_scorers);
                    let scorerName = scorer || "";
                    let goalMinute = getElapsedMatchTime(liveGame);
                    const minuteMatch = scorerName.match(/^(.*?)\s*(\d+')$/);
                    if (minuteMatch) {
                        scorerName = minuteMatch[1];
                        goalMinute = minuteMatch[2];
                    }
                    console.log(`🚨 Detect Goal (Away): Match ${liveGame.id}, scorer=${scorerName}, minute=${goalMinute}, score=${newHomeScore}-${newAwayScore}`);
                    await notifyCopa("goal", liveGame, {
                        scoringTeamId: liveGame.away_team_id,
                        scoringTeamNameEn: liveGame.away_team_name_en,
                        player: scorerName,
                        minute: goalMinute
                    });
                }

                // 3. Detect Match End (transitions to finished)
                if (oldGame.finished !== "TRUE" && liveGame.finished === "TRUE") {
                    console.log(`🚨 Detect Match End: Match ${liveGame.id}`);
                    await notifyCopa("match_end", liveGame);
                }
            }

            // Update database
            const result = await Game.updateOne(
                { id: liveGame.id },
                {
                    $set: {
                        home_score: liveGame.home_score,
                        away_score: liveGame.away_score,
                        home_scorers: liveGame.home_scorers,
                        away_scorers: liveGame.away_scorers,
                        finished: liveGame.finished,
                        time_elapsed: liveGame.time_elapsed
                    }
                }
            );

            if (result.modifiedCount > 0) {
                updatedCount++;
                console.log(`✅ Updated match ${liveGame.id} in DB: ${liveGame.home_team_name_en} ${liveGame.home_score} - ${liveGame.away_score} ${liveGame.away_team_name_en}`);
            }
        }
        
        console.log(`📊 Sync Games: ${updatedCount} matches updated.`);
        
        if (updatedCount > 0) {
            fs.writeFileSync('./football.matches.json', JSON.stringify(liveGames, null, 2));
            console.log('💾 football.matches.json updated.');
        }

        return { isGameLiveOrSoon, nextGameDate, failed: false };

    } catch (error) {
        console.error('❌ Error syncing games:', error.message);
        if (error.response) {
            console.error(`   API response status: ${error.response.status}`);
        }
        return { isGameLiveOrSoon: false, nextGameDate: null, failed: true };
    }
}

async function syncGroups() {
    try {
        console.log('🔄 Fetching live groups data...');
        const response = await axios.get(`${LIVE_API_BASE}/get/groups`, { timeout: 30000 });
        console.log(`📡 GET ${LIVE_API_BASE}/get/groups returned status ${response.status}. Groups count: ${response.data?.groups?.length || 0}`);
        const liveGroups = response.data.groups;
        
        if (!liveGroups || !Array.isArray(liveGroups)) {
            throw new Error('Invalid groups data received from live API');
        }

        let updatedCount = 0;
        for (const liveGroup of liveGroups) {
            const result = await Group.updateOne(
                { name: liveGroup.name },
                {
                    $set: {
                        teams: liveGroup.teams
                    }
                }
            );
            if (result.modifiedCount > 0) {
                updatedCount++;
                console.log(`✅ Updated group ${liveGroup.name} standings.`);
            }
        }
        
        console.log(`📊 Sync Groups: ${updatedCount} groups updated.`);

        if (updatedCount > 0) {
            const formattedGroups = liveGroups.map(g => ({
                group: g.name,
                teams: g.teams
            }));
            fs.writeFileSync('./football.matchtables.json', JSON.stringify(formattedGroups, null, 2));
            console.log('💾 football.matchtables.json updated.');
        }

    } catch (error) {
        console.error('❌ Error syncing groups:', error.message);
        if (error.response) {
            console.error(`   API response status: ${error.response.status}`);
        }
    }
}

async function runSyncCycle() {
    console.log(`\n🕒 Sync started at ${new Date().toLocaleString()}`);
    
    let isGameLiveOrSoon = false;
    let nextGameDate = null;
    let failed = false;

    try {
        const syncRes = await syncGames();
        isGameLiveOrSoon = syncRes.isGameLiveOrSoon;
        nextGameDate = syncRes.nextGameDate;
        failed = syncRes.failed;
        
        await syncGroups();
    } catch (cycleErr) {
        console.error('❌ Error in sync cycle execution:', cycleErr.message);
        failed = true;
    }
    
    const now = new Date();
    // If the sync failed, retry in 1 minute (ON_GAME_INTERVAL) instead of waiting 30 minutes
    const nextInterval = failed ? ON_GAME_INTERVAL : (isGameLiveOrSoon ? ON_GAME_INTERVAL : OFF_GAME_INTERVAL);
    const mode = failed ? "RETRY (API ERROR)" : (isGameLiveOrSoon ? "LIVE/SOON" : "OFF-GAME");
    
    let logMsg = `🏁 Sync cycle completed. Mode: ${mode}. Next sync in ${nextInterval / 1000 / 60}m.`;
    
    if (!failed && !isGameLiveOrSoon && nextGameDate) {
        const countdown = formatTimeDiff(nextGameDate - now);
        logMsg += ` Next ON-GAME sync in ${countdown}.`;
    }
    
    console.log(logMsg);
    
    setTimeout(runSyncCycle, nextInterval);
}

async function start() {
    console.log('🚀 Starting Smart Live Data Sync Service...');
    console.log(`📡 Config: Off-game: ${OFF_GAME_INTERVAL/1000/60}m, On-game: ${ON_GAME_INTERVAL/1000/60}m, Buffer: ${PRE_GAME_BUFFER/1000/60}m`);
    
    runSyncCycle();
}

// Handle connection events
mongoose.connection.on('connected', () => {
    start();
});

mongoose.connection.on('error', (err) => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
});
