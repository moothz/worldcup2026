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

function parseDate(dateStr) {
    // Format in JSON is "MM/DD/YYYY HH:mm" (Local stadium time)
    const [datePart, timePart] = dateStr.split(' ');
    const [month, day, year] = datePart.split('/');
    const [hours, minutes] = timePart.split(':');
    
    // Create date object in server local time
    const date = new Date(year, month - 1, day, hours, minutes);
    
    // Adjust for timezone difference (Stadium -> Server GMT-3)
    // Based on user feedback: 13:00 stadium time = 16:00 server time
    date.setHours(date.getHours() + 3);
    
    return date;
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

async function syncGames() {
    try {
        console.log('🔄 Fetching live games data...');
        const response = await axios.get(`${LIVE_API_BASE}/get/games`);
        const liveGames = response.data.games;
        
        if (!liveGames || !Array.isArray(liveGames)) {
            throw new Error('Invalid games data received from live API');
        }

        let updatedCount = 0;
        let isGameLiveOrSoon = false;
        let nextGameDate = null;
        const now = new Date();

        for (const liveGame of liveGames) {
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
                console.log(`✅ Updated match ${liveGame.id}: ${liveGame.home_team_name_en} ${liveGame.home_score} - ${liveGame.away_score} ${liveGame.away_team_name_en}`);
            }

            // Status Logic
            if (liveGame.finished === "FALSE") {
                const matchTime = parseDate(liveGame.local_date);
                
                if (liveGame.time_elapsed !== "notstarted") {
                    isGameLiveOrSoon = true;
                } else {
                    const timeDiff = matchTime - now;
                    // Buffer Check
                    if (timeDiff > 0 && timeDiff <= PRE_GAME_BUFFER) {
                        isGameLiveOrSoon = true;
                    }
                    // Track earliest upcoming game for countdown
                    if (timeDiff > 0 && (!nextGameDate || matchTime < nextGameDate)) {
                        nextGameDate = matchTime;
                    }
                }
            }
        }
        
        console.log(`📊 Sync Games: ${updatedCount} matches updated.`);
        
        if (updatedCount > 0) {
            fs.writeFileSync('./football.matches.json', JSON.stringify(liveGames, null, 2));
            console.log('💾 football.matches.json updated.');
        }

        return { isGameLiveOrSoon, nextGameDate };

    } catch (error) {
        console.error('❌ Error syncing games:', error.message);
        return { isGameLiveOrSoon: false, nextGameDate: null };
    }
}

async function syncGroups() {
    try {
        console.log('🔄 Fetching live groups data...');
        const response = await axios.get(`${LIVE_API_BASE}/get/groups`);
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
    }
}

async function runSyncCycle() {
    console.log(`\n🕒 Sync started at ${new Date().toLocaleString()}`);
    
    const { isGameLiveOrSoon, nextGameDate } = await syncGames();
    await syncGroups();
    
    const now = new Date();
    const nextInterval = isGameLiveOrSoon ? ON_GAME_INTERVAL : OFF_GAME_INTERVAL;
    const mode = isGameLiveOrSoon ? "LIVE/SOON" : "OFF-GAME";
    
    let logMsg = `🏁 Sync cycle completed. Mode: ${mode}. Next sync in ${nextInterval / 1000 / 60}m.`;
    
    if (!isGameLiveOrSoon && nextGameDate) {
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
